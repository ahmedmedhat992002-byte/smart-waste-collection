const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const path    = require('path');
const multer  = require('multer');

// ── Multer setup for image uploads ───────────────────────────────────────────
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dest = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, '../uploads');
        try {
            if (!require('fs').existsSync(dest)) require('fs').mkdirSync(dest, { recursive: true });
        } catch (e) {}
        cb(null, dest);
    },
    filename:    (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, `report_${Date.now()}${ext}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    fileFilter: (req, file, cb) => {
        if (file.mimetype.startsWith('image/')) cb(null, true);
        else cb(new Error('Only image files are allowed'));
    }
});

// ── Models ───────────────────────────────────────────────────────────────────
const User    = require('./models/User');
const Report  = require('./models/Report');
const Contact = require('./models/Contact');

// ── Real-Time Simulation (Optional - adds dummy data to DB) ─────────────────
const runSimulation = async () => {
    try {
        const count = await Report.countDocuments();
        if (count > 500) return; // Don't overflow the DB

        const categories = ['Plastics', 'Organic', 'Metal', 'Glass', 'Hazardous', 'E-Waste'];
        const addresses = ['Tahrir Square', 'Zamalek', 'Nasr City', 'Maadi', 'Heliopolis', 'Dokki', 'Mohandeseen'];
        const citizens = await User.find({ role: 'citizen' }).limit(5);
        if (citizens.length === 0) return;

        const newReport = new Report({
            user: citizens[Math.floor(Math.random() * citizens.length)]._id,
            category: categories[Math.floor(Math.random() * categories.length)],
            status: 'pending',
            location: {
                lat: 30.0 + Math.random() * 0.1,
                lng: 31.2 + Math.random() * 0.1,
                address: addresses[Math.floor(Math.random() * addresses.length)] + ', Cairo'
            },
            description: 'Auto-detected anomaly via smart bin sensor (Simulation)'
        });
        await newReport.save();
    } catch (e) {}
};
// setInterval(runSimulation, 60000); // Every minute

// ── JWT Helpers ───────────────────────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'smartwaste_secret_key_2026';

const signToken = (user) =>
    jwt.sign({ id: user._id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

const authMiddleware = (req, res, next) => {
    const header = req.header('Authorization');
    if (!header) return res.status(401).json({ error: 'No token — authorization denied' });
    try {
        req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ error: 'Token invalid or expired' });
    }
};

const adminMiddleware = (req, res, next) =>
    req.user.role === 'admin'
        ? next()
        : res.status(403).json({ error: 'Admin access required' });

const driverOrAdminMiddleware = (req, res, next) =>
    (req.user.role === 'driver' || req.user.role === 'admin')
        ? next()
        : res.status(403).json({ error: 'Driver/Admin access required' });

// ── Helper: safe user projection ─────────────────────────────────────────────
const safeUser = (u) => ({
    _id: u._id, name: u.name, email: u.email, role: u.role,
    ecoPoints: u.ecoPoints ?? 0, status: u.status, createdAt: u.createdAt
});

// ════════════════════════════════════════════════════════════════════════════
//  PUBLIC ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Public stats for the landing page hero
router.get('/public-stats', async (_req, res) => {
    try {
        const totalReports = await Report.countDocuments();
        const activeCitizens = await User.countDocuments({ role: 'citizen' });
        const collectedToday = await Report.countDocuments({ 
            status: 'collected',
            updatedAt: { $gte: new Date().setHours(0,0,0,0) }
        });
        
        res.json({
            totalReports:   totalReports + 1250,
            activeCitizens: activeCitizens + 8500,
            co2Reduction:   45,
            totalTons:      totalReports + 1540,
            collectedToday: collectedToday,
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Contact form
router.post('/contact', async (req, res) => {
    try {
        const { name, email, subject, message } = req.body;
        if (!name || !email || !message)
            return res.status(400).json({ error: 'Name, email and message are required' });
        
        const newContact = new Contact({ name, email, subject, message });
        await newContact.save();
        res.json({ message: 'Message received — we will be in touch soon!' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  AUTHENTICATION
// ════════════════════════════════════════════════════════════════════════════

// Verify token & return current user
router.get('/auth/me', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(safeUser(user));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Register (Logic is already mostly async/await compatible, just update User.find)
router.post('/auth/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || name.trim().length < 2)
            return res.status(400).json({ error: 'Name must be at least 2 characters' });
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return res.status(400).json({ error: 'Valid email is required' });
        if (!password || password.length < 6)
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        
        const existing = await User.findOne({ email: email.toLowerCase() });
        if (existing)
            return res.status(400).json({ error: 'An account with this email already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const allowedRole    = ['citizen', 'driver', 'admin'].includes(role) ? role : 'citizen';
        const newUser = new User({
            name: name.trim(), email: email.toLowerCase(),
            password: hashedPassword, role: allowedRole,
            ecoPoints: allowedRole === 'citizen' ? 0 : undefined,
            status: allowedRole === 'driver' ? 'available' : undefined
        });
        await newUser.save();

        const token = signToken(newUser);
        res.status(201).json({ token, user: safeUser(newUser) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Login
router.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ error: 'Email and password are required' });

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(400).json({ error: 'Invalid email or password' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: 'Invalid email or password' });

        const token = signToken(user);
        res.json({ token, user: safeUser(user) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Legacy aliases
router.post('/register', (req, res) => res.redirect(307, '/api/auth/register'));
router.post('/login',    (req, res) => res.redirect(307, '/api/auth/login'));

// ════════════════════════════════════════════════════════════════════════════
//  CITIZEN ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Submit a waste report (JSON body)
router.post('/citizen/report', authMiddleware, async (req, res) => {
    try {
        const { category, location, description, imageUrl } = req.body;
        if (!category) return res.status(400).json({ error: 'Category is required' });
        if (!location || !location.address) return res.status(400).json({ error: 'Location is required' });

        const newReport = new Report({
            user: req.user.id, category,
            location, description: description || '', imageUrl: imageUrl || null
        });
        await newReport.save();

        // Award eco-points to citizens
        const reporter = await User.findById(req.user.id);
        if (reporter && reporter.role === 'citizen') {
            reporter.ecoPoints = (reporter.ecoPoints || 0) + 10;
            await reporter.save();
        }

        res.status(201).json({ ...newReport._doc, ecoPointsEarned: reporter?.role === 'citizen' ? 10 : 0 });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Upload image for a report (returns URL)
router.post('/citizen/report/upload', authMiddleware, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl, message: 'Image uploaded successfully' });
});

// Get reports submitted by the current user
router.get('/citizen/my-reports', authMiddleware, async (req, res) => {
    try {
        const myReports = await Report.find({ user: req.user.id }).sort({ createdAt: -1 });
        res.json(myReports);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Eco-points leaderboard (top 10 citizens)
router.get('/citizen/leaderboard', async (_req, res) => {
    try {
        const leaderboard = await User.find({ role: 'citizen' })
            .sort({ ecoPoints: -1 })
            .limit(10)
            .select('name ecoPoints');
        
        res.json(leaderboard.map((u, i) => ({ 
            rank: i + 1, name: u.name, ecoPoints: u.ecoPoints || 0 
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Legacy alias
router.post('/report', authMiddleware, (req, res) => res.redirect(307, '/api/citizen/report'));

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ════════════════════════════════════════════════════════════════════════════

// All users (filterable by role)
router.get('/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        let query = {};
        if (req.query.role) query.role = req.query.role;
        const users = await User.find(query);
        res.json(users.map(safeUser));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Update user role
router.patch('/admin/users/:id/role', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const newRole = req.body.role;
        if (!['admin', 'driver', 'citizen'].includes(newRole))
            return res.status(400).json({ error: 'Invalid role' });
        user.role = newRole;
        await user.save();
        res.json({ message: 'Role updated', user: safeUser(user) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Delete user
router.delete('/admin/users/:id', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        if (req.params.id === '0' || req.params.id.length < 5) 
            return res.status(403).json({ error: 'Cannot delete protected users' });
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Drivers list
router.get('/admin/drivers', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const drivers = await User.find({ role: 'driver' });
        res.json(drivers.map(u => ({
            _id: u._id, name: u.name, status: u.status || 'available'
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Pending report count (for notification badge)
router.get('/admin/pending-count', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const count = await Report.countDocuments({ status: 'pending' });
        res.json({ count });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Assign task to driver
router.patch('/admin/assign-task/:taskId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const report = await Report.findById(req.params.taskId);
        if (!report) return res.status(404).json({ error: 'Report not found' });
        if (!req.body.driverId) return res.status(400).json({ error: 'driverId is required' });
        
        report.status     = 'dispatched';
        report.assignedTo = req.body.driverId;
        await report.save();
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Full stats for admin dashboard
router.get('/admin/stats', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const [usersCount, reportsList, citizenCount, driverCount, activeFleetCount] = await Promise.all([
            User.countDocuments(),
            Report.find().sort({ createdAt: -1 }),
            User.countDocuments({ role: 'citizen' }),
            User.countDocuments({ role: 'driver' }),
            User.countDocuments({ role: 'driver', status: 'active' })
        ]);

        // Category breakdown
        const catMap = {};
        reportsList.forEach(r => { catMap[r.category] = (catMap[r.category] || 0) + 1; });
        const categories = Object.keys(catMap).map(k => ({ _id: k, count: catMap[k] }));

        // 7-day daily trend
        const dailyReports = [0, 0, 0, 0, 0, 0, 0];
        const now = new Date();
        reportsList.forEach(r => {
            const diff = Math.floor((now - new Date(r.createdAt)) / 86400000);
            if (diff >= 0 && diff < 7) dailyReports[6 - diff]++;
        });

        const total      = reportsList.length || 1;
        const collected  = reportsList.filter(r => r.status === 'collected').length;
        const pending    = reportsList.filter(r => r.status === 'pending').length;
        const dispatched = reportsList.filter(r => r.status === 'dispatched').length;

        res.json({
            totalUsers:    citizenCount,
            totalReports:  reportsList.length,
            pendingAction: pending,
            dispatched,
            activeDrivers: driverCount,
            activeFleet:   activeFleetCount,
            performance:   Math.round((collected / total) * 100),
            categories:    categories.length ? categories : [{ _id: 'None', count: 1 }],
            dailyReports,
            reports:       reportsList.slice(0, 50)
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// All reports with optional filter
router.get('/admin/reports', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        let query = {};
        if (req.query.status && req.query.status !== 'all') query.status = req.query.status;
        if (req.query.category) query.category = req.query.category;

        const results = await Report.find(query)
            .populate('user', 'name')
            .sort({ createdAt: -1 });
        
        res.json(results.map(r => ({
            ...r._doc,
            reporterName: r.user ? r.user.name : 'Unknown'
        })));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// CSV export
router.get('/admin/export-csv', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const allReports = await Report.find().populate('user', 'name');
        const header = 'Report ID,Category,Status,Location,Reporter,Date\n';
        const rows   = allReports.map(r => {
            return `${r._id},${r.category},${r.status},"${r.location?.address || ''}","${r.user?.name || ''}",${new Date(r.createdAt).toISOString()}`;
        }).join('\n');
        res.header('Content-Type', 'text/csv');
        res.attachment(`smartwaste_reports_${new Date().toISOString().slice(0,10)}.csv`);
        res.send(header + rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ════════════════════════════════════════════════════════════════════════════
//  DRIVER ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Get tasks assigned to this driver (or all pending if admin)
router.get('/driver/tasks', authMiddleware, driverOrAdminMiddleware, async (req, res) => {
    try {
        let query;
        if (req.user.role === 'admin') {
            query = {};
        } else {
            query = {
                $or: [
                    { assignedTo: req.user.id },
                    { status: 'pending' }
                ]
            };
        }
        const tasks = await Report.find(query).sort({ createdAt: -1 });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Mark task as collected
router.patch('/driver/tasks/:id/complete', authMiddleware, driverOrAdminMiddleware, async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        if (!report) return res.status(404).json({ error: 'Task not found' });
        report.status    = 'collected';
        await report.save();
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
