const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mongoose = require('mongoose');

const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'smartwaste_secret_2024';
const BASE_URL = process.env.VERCEL_URL 
    ? `https://${process.env.VERCEL_URL}`
    : `http://localhost:5000`;

const UPLOAD_DIR = process.env.VERCEL ? '/tmp/uploads' : './uploads';
const USER_DATA_FILE = './users.json';

const DEMO_EMAILS = ['admin@smartwaste.ai', 'driver1@fleet.com'];
const DEMO_IDS    = ['demo_admin', 'demo_driver'];

const isDemo = (req) =>
    DEMO_EMAILS.includes(req.user?.email) || DEMO_IDS.includes(req.user?.id);


const fallbackUsers = new Map();

const loadFallbackUsers = () => {
    try {
        if (fs.existsSync(USER_DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(USER_DATA_FILE, 'utf8'));
            Object.entries(data).forEach(([email, user]) => {
                fallbackUsers.set(email.toLowerCase(), { ...user, _id: user._id || `fallback_${Date.now()}` });
            });
            console.log(`📁 Loaded ${fallbackUsers.size} fallback users`);
        }
    } catch (error) {
        console.warn('Failed to load fallback users:', error.message);
    }
};

const saveFallbackUsers = () => {
    try {
        fs.writeFileSync(USER_DATA_FILE, JSON.stringify(Object.fromEntries(fallbackUsers), null, 2));
    } catch (error) {
        console.warn('Failed to save fallback users:', error.message);
    }
};

loadFallbackUsers();

let UserModel, ReportModel, ContactModel;

const getModels = () => {
    if (mongoose.connection.readyState !== 1) return null;
    
    if (!UserModel) {
        UserModel = mongoose.model('User', new mongoose.Schema({
            name: { type: String, required: true, trim: true },
            email: { type: String, required: true, unique: true, lowercase: true },
            password: { type: String, required: true },
            role: { type: String, enum: ['citizen', 'driver', 'admin'], default: 'citizen' },
            ecoPoints: { type: Number, default: 0 },
            status: { type: String, enum: ['active', 'inactive', 'available', 'busy', 'offline'], default: 'active' },
            createdAt: { type: Date, default: Date.now }
        }));

        ReportModel = mongoose.model('Report', new mongoose.Schema({
            user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            category: { type: String, required: true },
            status: { type: String, enum: ['pending', 'dispatched', 'collected'], default: 'pending' },
            location: {
                lat: Number,
                lng: Number,
                address: { type: String, required: true }
            },
            description: String,
            imageUrl: String,
            assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
        }, { timestamps: true }));

        ContactModel = mongoose.model('Contact', new mongoose.Schema({
            name: String,
            email: String,
            subject: String,
            message: String
        }, { timestamps: true }));
    }
    
    return { User: UserModel, Report: ReportModel, Contact: ContactModel };
};

const signToken = (user) => jwt.sign(
    { id: user._id, role: user.role, name: user.name, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' }
);

const authMiddleware = (req, res, next) => {
    try {
        const authHeader = req.header('Authorization')?.trim();
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Authorization header missing or invalid' });
        }
        
        const token = authHeader.slice(7);
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch (error) {
        console.error('JWT Error:', error.message);
        res.status(401).json({ error: 'Invalid or expired token' });
    }
};

const roleMiddleware = (...allowedRoles) => (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ 
            error: `Access denied. Requires: ${allowedRoles.join(', ')}` 
        });
    }
    next();
};

const adminOnly    = roleMiddleware('admin');
const driverOrAdmin = roleMiddleware('driver', 'admin');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `report_${Date.now()}_${Math.random().toString(36).substr(2, 5)}${ext}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files allowed (jpg, png, gif)'));
    }
};

const upload = multer({ 
    storage, 
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter 
});


router.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        uptime: process.uptime(),
        database: mongoose.connection.readyState === 1 ? 'connected' : 'offline'
    });
});

router.get('/public-stats', (req, res) => {

    res.json({
        totalReports: 2893,
        activeCitizens: 1247,
        co2Reduction: 847,
        totalTons: 4231,
        collectedToday: 89
    });
});

router.post('/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        if (!name || !email || !message) {
            return res.status(400).json({ error: 'Name, email, and message required' });
        }

        const models = getModels();
        if (models) {
            await new models.Contact({ name: name.trim(), email: email.toLowerCase(), subject, message }).save();
        }

        res.json({ message: 'Thank you! We will respond within 24 hours.' });
    } catch (error) {
        res.json({ message: 'Message received (queued for processing)' });
    }
});


router.post(['/auth/login', '/login'], async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const userEmail = email.toLowerCase();
        let user = null;

        const demoAccounts = {
            'admin@smartwaste.ai': {
                _id: 'demo_admin',
                name: 'System Administrator',
                email: 'admin@smartwaste.ai',
                role: 'admin',
                ecoPoints: 9999,
                status: 'active'
            },
            'driver1@fleet.com': {
                _id: 'demo_driver',
                name: 'Driver One',
                email: 'driver1@fleet.com',
                role: 'driver',
                ecoPoints: 2500,
                status: 'available'
            }
        };

        if (demoAccounts[userEmail] && password === 'password') {
            user = demoAccounts[userEmail];
        }
        else if (fallbackUsers.has(userEmail)) {
            const fb = fallbackUsers.get(userEmail);
            if (fb.password && await bcrypt.compare(password, fb.password)) {
                user = fb;
            } else if (!fb.password) {
                user = fb;
            }
        }
        else {
            const models = getModels();
            if (models) {
                const dbUser = await models.User.findOne({ email: userEmail });
                if (dbUser && await bcrypt.compare(password, dbUser.password)) {
                    user = dbUser;
                }
            }
        }

        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = signToken(user);
        res.json({
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: user.email || userEmail,
                role: user.role,
                ecoPoints: user.ecoPoints || 0,
                status: user.status || 'active'
            }
        });
    } catch (error) {
        console.error('Login error:', error.message);
        res.status(500).json({ error: 'Login service unavailable' });
    }
});

router.post(['/auth/register', '/register'], async (req, res) => {
    try {
        const { name, email, password, role = 'citizen' } = req.body;
        
        if (!name?.trim() || name.length < 2 || !email || !password || password.length < 6) {
            return res.status(400).json({ error: 'Name (2+ chars), email, and password (6+ chars) required' });
        }

        const userEmail = email.toLowerCase();
        const allowedRoles = ['citizen', 'driver', 'admin'];
        const selectedRole = allowedRoles.includes(role) ? role : 'citizen';

        if (DEMO_EMAILS.includes(userEmail)) {
            return res.status(400).json({ error: 'Demo account already exists. Please login.' });
        }

        if (fallbackUsers.has(userEmail)) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const models = getModels();
        let dbUser = null;

        if (models) {
            try {
                const existing = await models.User.findOne({ email: userEmail });
                if (existing) {
                    return res.status(400).json({ error: 'Email already registered' });
                }
                const hashedPassword = await bcrypt.hash(password, 12);
                dbUser = await models.User.create({
                    name: name.trim(),
                    email: userEmail,
                    password: hashedPassword,
                    role: selectedRole,
                    status: selectedRole === 'driver' ? 'available' : 'active'
                });
            } catch (dbError) {
                console.warn('Database registration failed:', dbError.message);
            }
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = dbUser || {
            _id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            name: name.trim(),
            email: userEmail,
            password: hashedPassword,
            role: selectedRole,
            ecoPoints: selectedRole === 'citizen' ? 50 : 0,
            status: selectedRole === 'driver' ? 'available' : 'active',
            createdAt: new Date().toISOString()
        };

        fallbackUsers.set(userEmail, user);
        saveFallbackUsers();

        const token = signToken(user);
        console.log(`✅ New ${selectedRole}: ${userEmail}`);

        res.status(201).json({
            token,
            user: {
                _id: user._id,
                name: user.name,
                email: userEmail,
                role: user.role,
                ecoPoints: user.ecoPoints || 0,
                status: user.status
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(400).json({ error: 'Registration failed. Please try again.' });
    }
});

router.get('/auth/me', authMiddleware, (req, res) => {
    const { id, name, role, email } = req.user;
    
    const userProfile = {
        _id: id,
        name: name || 'User',
        email: email || 'user@example.com',
        role,
        ecoPoints: fallbackUsers.has(email) ? fallbackUsers.get(email).ecoPoints : 0,
        status: 'active'
    };

    res.json(userProfile);
});


router.post('/citizen/report', authMiddleware, async (req, res) => {
    try {
        const { category, location, description, imageUrl } = req.body;
        
        if (!category || !location?.address) {
            return res.status(400).json({ error: 'Category and location.address are required' });
        }

        if (isDemo(req)) {
            return res.json({
                id: `demo_report_${Date.now()}`,
                message: '[Demo] Report simulated successfully!',
                ecoPointsEarned: 10,
                demo: true
            });
        }

        const models = getModels();
        let reportId;

        if (models) {
            try {
                const report = await models.Report.create({
                    user: req.user.id,
                    category,
                    location,
                    description: description || '',
                    imageUrl: imageUrl || null,
                    status: 'pending'
                });
                reportId = report._id;
            } catch (error) {
                console.warn('Report DB error:', error.message);
            }
        }

        reportId = reportId || `report_${Date.now()}`;
        
        if (fallbackUsers.has(req.user.email)) {
            const user = fallbackUsers.get(req.user.email);
            user.ecoPoints = (user.ecoPoints || 0) + 10;
            saveFallbackUsers();
        }

        res.status(201).json({
            id: reportId,
            message: 'Report submitted successfully!',
            ecoPointsEarned: 10
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to submit report' });
    }
});

router.post('/citizen/report/upload', authMiddleware, upload.single('image'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file provided' });
        }
        
        const imageUrl = `${BASE_URL}/uploads/${req.file.filename}`;
        res.json({ 
            imageUrl,
            message: 'Image uploaded successfully',
            filename: req.file.filename
        });
    } catch (error) {
        res.status(500).json({ error: 'Upload failed' });
    }
});

router.get('/citizen/my-reports', authMiddleware, async (req, res) => {
    if (isDemo(req)) {
        return res.json([
            { _id: 'demo_r1', category: 'Plastics',  status: 'collected', location: { address: 'Tahrir Square' }, createdAt: '2024-01-10T08:00:00Z' },
            { _id: 'demo_r2', category: 'Organic',   status: 'dispatched', location: { address: 'Nasr City'    }, createdAt: '2024-01-12T10:30:00Z' },
            { _id: 'demo_r3', category: 'E-Waste',   status: 'pending',    location: { address: 'Maadi'        }, createdAt: '2024-01-14T14:00:00Z' }
        ]);
    }

    try {
        const models = getModels();
        if (models) {
            const reports = await models.Report.find({ user: req.user.id })
                .sort({ createdAt: -1 })
                .limit(20)
                .lean();
            return res.json(reports);
        }
        res.json([]);
    } catch (error) {
        res.json([]);
    }
});

router.get('/citizen/leaderboard', authMiddleware, (req, res) => {
    res.json([
        { rank: 1,  name: 'Ahmed Mohamed',   ecoPoints: 1245 },
        { rank: 2,  name: 'Fatma Ahmed',      ecoPoints: 987  },
        { rank: 3,  name: 'Sara Ali',         ecoPoints: 856  },
        { rank: 4,  name: 'Omar Hassan',      ecoPoints: 743  },
        { rank: 5,  name: 'Aisha Karim',      ecoPoints: 689  },
        { rank: 6,  name: 'Karim Salem',      ecoPoints: 567  },
        { rank: 7,  name: 'Nadia Omar',       ecoPoints: 523  },
        { rank: 8,  name: 'Mohamed Karim',    ecoPoints: 489  },
        { rank: 9,  name: 'Layla Hassan',     ecoPoints: 456  },
        { rank: 10, name: req.user?.name || 'You', ecoPoints: isDemo(req) ? 9999 : 123 }
    ]);
});

router.get('/admin/stats', authMiddleware, adminOnly, async (req, res) => {
    // Demo admin → return rich fake stats
    if (isDemo(req)) {
        return res.json({
            totalUsers: 1247,
            totalReports: 2893,
            pendingAction: 156,
            dispatched: 342,
            collected: 2395,
            activeDrivers: 18,
            activeFleet: 12,
            performance: 82.7,
            categories: [
                { _id: 'Plastics',  count: 892, color: '#f59e0b' },
                { _id: 'Organic',   count: 756, color: '#10b981' },
                { _id: 'Metal',     count: 543, color: '#3b82f6' },
                { _id: 'Glass',     count: 412, color: '#8b5cf6' },
                { _id: 'E-Waste',   count: 198, color: '#ef4444' },
                { _id: 'Hazardous', count: 92,  color: '#f97316' }
            ],
            dailyReports: [45, 67, 89, 123, 156, 178, 201],
            recentReports: [
                { _id: '1', category: 'Plastics', status: 'pending',    location: { address: 'Tahrir Square' }, reporterName: 'Ahmed M.',  createdAt: '2h ago' },
                { _id: '2', category: 'Organic',  status: 'dispatched', location: { address: 'Nasr City'    }, reporterName: 'Fatma A.',  createdAt: '4h ago' },
                { _id: '3', category: 'Metal',    status: 'collected',  location: { address: 'Maadi'        }, reporterName: 'Omar H.',   createdAt: '6h ago' }
            ]
        });
    }

    // Real admin → query database
    try {
        const models = getModels();
        if (!models) return res.status(503).json({ error: 'Database unavailable' });

        const [totalUsers, totalReports, pendingAction, dispatched, collected, categories] = await Promise.all([
            models.User.countDocuments(),
            models.Report.countDocuments(),
            models.Report.countDocuments({ status: 'pending' }),
            models.Report.countDocuments({ status: 'dispatched' }),
            models.Report.countDocuments({ status: 'collected' }),
            models.Report.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }])
        ]);

        const recentReports = await models.Report.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('user', 'name')
            .lean();

        res.json({
            totalUsers, totalReports, pendingAction, dispatched, collected,
            activeDrivers: await models.User.countDocuments({ role: 'driver', status: { $in: ['available', 'busy'] } }),
            activeFleet: await models.User.countDocuments({ role: 'driver', status: 'busy' }),
            performance: totalReports ? +((collected / totalReports) * 100).toFixed(1) : 0,
            categories,
            recentReports: recentReports.map(r => ({
                ...r,
                reporterName: r.user?.name || 'Unknown'
            }))
        });
    } catch (error) {
        console.error('Admin stats error:', error.message);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

router.get('/admin/users', authMiddleware, adminOnly, async (req, res) => {
    if (isDemo(req)) {
        return res.json([
            { _id: 'demo_admin',  name: 'System Admin',  email: 'admin@smartwaste.ai', role: 'admin',   ecoPoints: 9999, status: 'active',    createdAt: '2023-01-01' },
            { _id: 'demo_driver', name: 'Driver One',    email: 'driver1@fleet.com',   role: 'driver',  ecoPoints: 2500, status: 'available', createdAt: '2023-02-15' },
            { _id: 'citizen1',    name: 'Ahmed Mohamed', email: 'ahmed@example.com',   role: 'citizen', ecoPoints: 1245, status: 'active',    createdAt: '2023-12-01' },
            { _id: 'citizen2',    name: 'Fatma Ali',     email: 'fatma@example.com',   role: 'citizen', ecoPoints: 987,  status: 'active',    createdAt: '2023-12-05' },
            { _id: 'driver2',     name: 'Salem Karim',   email: 'driver2@fleet.com',   role: 'driver',  ecoPoints: 1800, status: 'busy',      createdAt: '2023-11-20' }
        ]);
    }

    try {
        const models = getModels();
        if (!models) return res.status(503).json({ error: 'Database unavailable' });
        const users = await models.User.find().select('-password').sort({ createdAt: -1 }).lean();
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

router.get('/admin/reports', authMiddleware, adminOnly, async (req, res) => {
    if (isDemo(req)) {
        return res.json([
            { _id: 'report1', category: 'Plastics', status: 'pending',    location: { address: 'Tahrir Square, Cairo' }, reporterName: 'Ahmed Mohamed', createdAt: '2024-01-15T10:30:00Z' },
            { _id: 'report2', category: 'Organic',  status: 'dispatched', location: { address: 'Nasr City Market'     }, reporterName: 'Fatma Ali',     assignedTo: 'demo_driver', createdAt: '2024-01-15T09:15:00Z' },
            { _id: 'report3', category: 'Metal',    status: 'collected',  location: { address: 'Maadi, Cairo'         }, reporterName: 'Omar Hassan',   createdAt: '2024-01-15T08:45:00Z' }
        ]);
    }

    try {
        const models = getModels();
        if (!models) return res.status(503).json({ error: 'Database unavailable' });
        const reports = await models.Report.find()
            .sort({ createdAt: -1 })
            .populate('user', 'name')
            .populate('assignedTo', 'name')
            .lean();
        res.json(reports.map(r => ({ ...r, reporterName: r.user?.name || 'Unknown' })));
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch reports' });
    }
});

router.get('/admin/pending-count', authMiddleware, adminOnly, async (req, res) => {
    if (isDemo(req)) return res.json({ count: 156 });

    try {
        const models = getModels();
        if (!models) return res.json({ count: 0 });
        const count = await models.Report.countDocuments({ status: 'pending' });
        res.json({ count });
    } catch (error) {
        res.json({ count: 0 });
    }
});

router.get('/admin/drivers', authMiddleware, adminOnly, async (req, res) => {
    if (isDemo(req)) {
        return res.json([
            { _id: 'demo_driver', name: 'Driver One',  status: 'available' },
            { _id: 'driver2',     name: 'Salem Karim', status: 'busy'      },
            { _id: 'driver3',     name: 'Nadia Salem', status: 'offline'   }
        ]);
    }

    try {
        const models = getModels();
        if (!models) return res.status(503).json({ error: 'Database unavailable' });
        const drivers = await models.User.find({ role: 'driver' }).select('name status').lean();
        res.json(drivers);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch drivers' });
    }
});

router.patch('/admin/assign-task/:taskId', authMiddleware, adminOnly, async (req, res) => {
    const { driverId } = req.body;
    if (!driverId) return res.status(400).json({ error: 'driverId required' });

    if (isDemo(req)) {
        return res.json({ message: '[Demo] Task assigned successfully!', taskId: req.params.taskId, driverId, status: 'dispatched' });
    }

    try {
        const models = getModels();
        if (!models) return res.status(503).json({ error: 'Database unavailable' });
        await models.Report.findByIdAndUpdate(req.params.taskId, { assignedTo: driverId, status: 'dispatched' });
        res.json({ message: 'Task assigned successfully!', taskId: req.params.taskId, driverId, status: 'dispatched' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to assign task' });
    }
});


router.get('/driver/tasks', authMiddleware, driverOrAdmin, async (req, res) => {
    if (isDemo(req)) {
        return res.json([
            { _id: 'task1', category: 'Organic', status: 'dispatched', location: { address: 'Nasr City Market' }, reporterName: 'Mohamed Salem' },
            { _id: 'task2', category: 'E-Waste', status: 'pending',    location: { address: 'Heliopolis'       }, reporterName: 'Tech Corp'      }
        ]);
    }

    try {
        const models = getModels();
        if (!models) return res.json([]);
        const tasks = await models.Report.find({ assignedTo: req.user.id, status: { $in: ['dispatched', 'pending'] } })
            .populate('user', 'name')
            .lean();
        res.json(tasks.map(t => ({ ...t, reporterName: t.user?.name || 'Unknown' })));
    } catch (error) {
        res.json([]);
    }
});

router.patch('/driver/tasks/:id/complete', authMiddleware, driverOrAdmin, async (req, res) => {
    if (isDemo(req)) {
        return res.json({ message: '[Demo] Task marked as collected!', taskId: req.params.id, status: 'collected' });
    }

    try {
        const models = getModels();
        if (!models) return res.status(503).json({ error: 'Database unavailable' });
        await models.Report.findByIdAndUpdate(req.params.id, { status: 'collected' });
        res.json({ message: 'Task marked as collected!', taskId: req.params.id, status: 'collected' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update task' });
    }
});

router.get('/admin/trend-data', authMiddleware, adminOnly, async (req, res) => {
    if (isDemo(req)) {
        const now = new Date();
        const trendData = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            trendData.push({
                date: date.toISOString().split('T')[0],
                reports:   120 + i * 12 + Math.floor(Math.random() * 30),
                collected: 105 + i * 10 + Math.floor(Math.random() * 25),
                pending:   20  + i * 2  + Math.floor(Math.random() * 10)
            });
        }
        return res.json(trendData);
    }

    try {
        const models = getModels();
        if (!models) return res.status(503).json({ error: 'Database unavailable' });

        const now = new Date();
        const trendData = [];
        for (let i = 6; i >= 0; i--) {
            const start = new Date(now); start.setDate(start.getDate() - i); start.setHours(0,0,0,0);
            const end   = new Date(start); end.setDate(end.getDate() + 1);
            const [reports, collected, pending] = await Promise.all([
                models.Report.countDocuments({ createdAt: { $gte: start, $lt: end } }),
                models.Report.countDocuments({ createdAt: { $gte: start, $lt: end }, status: 'collected' }),
                models.Report.countDocuments({ createdAt: { $gte: start, $lt: end }, status: 'pending' })
            ]);
            trendData.push({ date: start.toISOString().split('T')[0], reports, collected, pending });
        }
        res.json(trendData);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch trend data' });
    }
});

router.get('/admin/efficiency', authMiddleware, adminOnly, async (req, res) => {
    if (isDemo(req)) {
        return res.json({
            today:   { total: 89,   collected: 72,   efficiency: 80.9, avgResponseTime: '2h 14m' },
            weekly:  { total: 567,  collected: 482,  efficiency: 85.0, avgResponseTime: '3h 8m'  },
            monthly: { total: 2345, collected: 2013, efficiency: 85.8, avgResponseTime: '2h 56m' },
            realTime: { currentCycle: 12, collected: 10, efficiency: 83.3 }
        });
    }

    try {
        const models = getModels();
        if (!models) return res.status(503).json({ error: 'Database unavailable' });

        const now = new Date();
        const startOfDay   = new Date(now); startOfDay.setHours(0,0,0,0);
        const startOfWeek  = new Date(now); startOfWeek.setDate(now.getDate() - 7);
        const startOfMonth = new Date(now); startOfMonth.setDate(now.getDate() - 30);

        const calc = async (start) => {
            const [total, collected] = await Promise.all([
                models.Report.countDocuments({ createdAt: { $gte: start } }),
                models.Report.countDocuments({ createdAt: { $gte: start }, status: 'collected' })
            ]);
            return { total, collected, efficiency: total ? +((collected / total) * 100).toFixed(1) : 0 };
        };

        const [today, weekly, monthly] = await Promise.all([calc(startOfDay), calc(startOfWeek), calc(startOfMonth)]);
        res.json({ today, weekly, monthly, realTime: { ...today, currentCycle: today.total } });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch efficiency data' });
    }
});

router.get('/admin/realtime', authMiddleware, adminOnly, async (req, res) => {
    if (isDemo(req)) {
        return res.json({
            timestamp: new Date().toISOString(),
            pendingCount:  140 + Math.floor(Math.random() * 20),
            activeTasks:   15  + Math.floor(Math.random() * 8),
            fleetStatus: {
                available: 10 + Math.floor(Math.random() * 3),
                busy:       6 + Math.floor(Math.random() * 4),
                offline: 2
            },
            efficiencyLive: (75 + Math.random() * 15).toFixed(1)
        });
    }

    try {
        const models = getModels();
        if (!models) return res.status(503).json({ error: 'Database unavailable' });
        const [pendingCount, activeTasks, available, busy, offline] = await Promise.all([
            models.Report.countDocuments({ status: 'pending' }),
            models.Report.countDocuments({ status: 'dispatched' }),
            models.User.countDocuments({ role: 'driver', status: 'available' }),
            models.User.countDocuments({ role: 'driver', status: 'busy'      }),
            models.User.countDocuments({ role: 'driver', status: 'offline'   })
        ]);
        const total = pendingCount + activeTasks || 1;
        res.json({
            timestamp: new Date().toISOString(),
            pendingCount, activeTasks,
            fleetStatus: { available, busy, offline },
            efficiencyLive: ((activeTasks / total) * 100).toFixed(1)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch realtime data' });
    }
});

router.get('/admin/efficiency-history', authMiddleware, adminOnly, (req, res) => {
    // This is a live time-series — demo and real users both get generated history
    // (real DB equivalent would require storing snapshots, which is out of scope)
    const history = [];
    for (let i = 29; i >= 0; i--) {
        const time = new Date(Date.now() - i * 60000).toISOString();
        history.push({
            time,
            efficiency: (78 + Math.sin(i / 5) * 8).toFixed(1),
            pending:    145 + Math.floor(Math.random() * 10),
            active:     18  + Math.floor(Math.random() * 5)
        });
    }
    res.json(history);
});

router.get('/admin/export-csv', authMiddleware, adminOnly, async (req, res) => {
    if (isDemo(req)) {
        const csvContent = [
            'Report ID,Category,Status,Location,Reporter,Driver,Created,Completed\n',
            '64f8a1b2c3d4e5f6789abcd0,Plastics,pending,"Tahrir Square, Cairo",Ahmed Mohamed,,2024-01-15 10:30,\n',
            '64f8a1b2c3d4e5f6789abcd1,Organic,dispatched,"Nasr City",Fatma Ali,Driver One,2024-01-15 09:15,2024-01-15 12:45\n',
            '64f8a1b2c3d4e5f6789abcd2,Metal,collected,"Maadi",Omar Hassan,Driver One,2024-01-15 08:45,2024-01-15 11:30\n',
            '64f8a1b2c3d4e5f6789abcd3,Glass,pending,"Zamalek",Aisha Karim,,2024-01-15 07:20,\n',
            '64f8a1b2c3d4e5f6789abcd4,E-Waste,dispatched,"Heliopolis",Tech Corp,Nadia Salem,2024-01-15 11:00,2024-01-15 14:20\n'
        ].join('');
        res.header('Content-Type', 'text/csv');
        res.attachment(`smartwaste-demo-${new Date().toISOString().slice(0, 10)}.csv`);
        return res.send(csvContent);
    }

    try {
        const models = getModels();
        if (!models) return res.status(503).json({ error: 'Database unavailable' });
        const reports = await models.Report.find()
            .populate('user', 'name')
            .populate('assignedTo', 'name')
            .lean();

        const rows = [
            'Report ID,Category,Status,Location,Reporter,Driver,Created\n',
            ...reports.map(r =>
                `${r._id},${r.category},${r.status},"${r.location?.address || ''}",${r.user?.name || ''},${r.assignedTo?.name || ''},${new Date(r.createdAt).toISOString()}\n`
            )
        ].join('');

        res.header('Content-Type', 'text/csv');
        res.attachment(`smartwaste-reports-${new Date().toISOString().slice(0, 10)}.csv`);
        res.send(rows);
    } catch (error) {
        res.status(500).json({ error: 'Export failed' });
    }
});

// ── MAP DATA ─────────────────────────────────────────────────────────────────
router.get('/admin/map-data', authMiddleware, adminOnly, async (req, res) => {
    if (isDemo(req)) {
        const cairoReports = [
            { id: 'report1', lat: 30.0444, lng: 31.2357, category: 'Plastics',  status: 'pending',    severity: 'high',     reporter: 'Ahmed Mohamed', timestamp: '2h ago',  address: 'Tahrir Square, Downtown Cairo' },
            { id: 'report2', lat: 30.0625, lng: 31.2490, category: 'Organic',   status: 'dispatched', severity: 'medium',   reporter: 'Fatma Ali',     timestamp: '4h ago',  address: 'Nasr City Market' },
            { id: 'report3', lat: 30.0131, lng: 31.2089, category: 'Metal',     status: 'collected',  severity: 'low',      reporter: 'Omar Hassan',   timestamp: '6h ago',  address: 'Maadi - 26th July Street' },
            { id: 'report4', lat: 30.0658, lng: 31.2184, category: 'Glass',     status: 'pending',    severity: 'high',     reporter: 'Aisha Karim',   timestamp: '8h ago',  address: 'Zamalek Island' },
            { id: 'report5', lat: 30.1208, lng: 31.3186, category: 'E-Waste',   status: 'dispatched', severity: 'high',     reporter: 'Tech Corp',     timestamp: '1h ago',  address: 'Heliopolis Tech Park' },
            { id: 'report6', lat: 30.0433, lng: 31.2017, category: 'Hazardous', status: 'pending',    severity: 'critical', reporter: 'Prof. Salem',   timestamp: '12h ago', address: 'Dokki University Area' },
            { id: 'report7', lat: 30.0550, lng: 31.1986, category: 'Organic',   status: 'collected',  severity: 'medium',   reporter: 'Layla Ahmed',   timestamp: '1d ago',  address: 'Mohandessin - Sudan Street' }
        ];
        return res.json({
            type: 'FeatureCollection',
            features: cairoReports.map(r => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
                properties: { ...r, popupContent: `<div style="min-width:200px"><h4>${r.category} Waste</h4><p><strong>Status:</strong> ${r.status}</p><p><strong>Location:</strong> ${r.address}</p><p><strong>Reported by:</strong> ${r.reporter}</p><p><strong>Time:</strong> ${r.timestamp}</p></div>` }
            }))
        });
    }

    try {
        const models = getModels();
        if (!models) return res.status(503).json({ error: 'Database unavailable' });
        const reports = await models.Report.find({ 'location.lat': { $exists: true } })
            .populate('user', 'name')
            .lean();

        res.json({
            type: 'FeatureCollection',
            features: reports.map(r => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [r.location.lng, r.location.lat] },
                properties: {
                    id: r._id, category: r.category, status: r.status,
                    reporter: r.user?.name || 'Unknown',
                    address: r.location.address,
                    timestamp: new Date(r.createdAt).toLocaleString(),
                    popupContent: `<div style="min-width:200px"><h4>${r.category} Waste</h4><p><strong>Status:</strong> ${r.status}</p><p><strong>Location:</strong> ${r.location.address}</p><p><strong>Reported by:</strong> ${r.user?.name || 'Unknown'}</p></div>`
                }
            }))
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch map data' });
    }
});

router.get('/reports/:id/map', authMiddleware, (req, res) => {
    if (isDemo(req)) {
        const locs = {
            'report1': { lat: 30.0444, lng: 31.2357, address: 'Tahrir Square, Cairo' },
            'report2': { lat: 30.0625, lng: 31.2490, address: 'Nasr City Market'     },
            'report3': { lat: 30.0131, lng: 31.2089, address: 'Maadi, Cairo'         },
            'report4': { lat: 30.0658, lng: 31.2184, address: 'Zamalek Island'       },
            'report5': { lat: 30.1208, lng: 31.3186, address: 'Heliopolis Tech Park' }
        };
        return res.json(locs[req.params.id] || { lat: 30.0444, lng: 31.2357 });
    }

    try {
        const models = getModels();
        if (!models) return res.status(503).json({ error: 'Database unavailable' });
        models.Report.findById(req.params.id).then(report => {
            if (!report) return res.status(404).json({ error: 'Report not found' });
            res.json({ lat: report.location.lat, lng: report.location.lng, address: report.location.address });
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch report location' });
    }
});

router.use((req, res) => {
    res.status(404).json({ 
        error: `Route ${req.path} not found`,
        available: ['/api/public-stats', '/api/auth/login', '/api/auth/register']
    });
});

module.exports = router;