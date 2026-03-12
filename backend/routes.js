const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { User, Report, Truck, Collection, EcoPoint } = require('../database/models');

const JWT_SECRET = process.env.JWT_SECRET || 'smart_waste_production_secret_key_2024';

// Multer Setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, `waste_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// --- Middleware: Protection & Authorization ---

const protect = async (req, res, next) => {
    let token;
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
        token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
        return res.status(401).json({ error: 'Not authorized to access this route' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = await User.findById(decoded.id);
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Not authorized' });
    }
};

const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: `User role ${req.user.role} is not authorized` });
        }
        next();
    };
};

// --- Authentication Roots ---

router.post('/auth/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        
        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Please provide name, email and password' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const user = new User({ name, email, password: hashedPassword, role });
        await user.save();
        
        res.status(201).json({ message: 'Account created successfully' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: 'Please provide email and password' });
        }

        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
        
        res.json({ 
            token, 
            user: { 
                id: user._id, 
                name: user.name, 
                role: user.role, 
                ecoPoints: user.ecoPoints 
            } 
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Citizen APIs ---

router.post('/citizen/report', protect, upload.array('images', 3), async (req, res) => {
    try {
        const { category, lat, lng, address, description, userId } = req.body;
        const images = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
        
        const report = new Report({
            category,
            location: { lat: parseFloat(lat), lng: parseFloat(lng), address },
            description,
            images,
            reportedBy: userId
        });
        await report.save();
        
        // Award Eco-points (Logic: 10 points per report)
        await User.findByIdAndUpdate(userId, { $inc: { ecoPoints: 10 } });
        new EcoPoint({ userId, amount: 10, reason: 'Waste Reporting' }).save();
        
        res.status(201).json(report);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.get('/my-reports/:userId', async (req, res) => {
    try {
        const reports = await Report.find({ reportedBy: req.params.userId }).sort({ createdAt: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/auth/profile/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('username email role ecoPoints');
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- Admin APIs ---

router.get('/admin/stats', protect, authorize('admin'), async (req, res) => {
    try {
        const total = await Report.countDocuments();
        const pending = await Report.countDocuments({ status: 'pending' });
        const collected = await Report.countDocuments({ status: 'collected' });
        const assigned = await Report.countDocuments({ status: 'assigned' });
        
        // Waste Type Distribution
        const categories = await Report.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);

        // Daily Trend (Last 7 Days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const dailyReports = await Report.aggregate([
            { $match: { createdAt: { $gte: sevenDaysAgo } } },
            { $group: { 
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, 
                count: { $sum: 1 } 
            }},
            { $sort: { _id: 1 } }
        ]);

        // Collection Performance (%)
        const performance = total > 0 ? (collected / total) * 100 : 0;

        const recentReports = await Report.find()
            .limit(5)
            .sort({ createdAt: -1 })
            .populate('reportedBy', 'username');
        
        res.json({ 
            total, 
            pending, 
            collected, 
            assigned,
            performance: Math.round(performance),
            categories, 
            dailyReports,
            recentReports 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/admin/drivers', protect, authorize('admin'), async (req, res) => {
    try {
        const drivers = await User.find({ role: 'driver' }).select('username status');
        res.json(drivers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/admin/reports', protect, authorize('admin'), async (req, res) => {
    try {
        const reports = await Report.find()
            .sort({ createdAt: -1 })
            .populate('reportedBy', 'username')
            .populate('assignedDriver', 'username');
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/assign-task', protect, authorize('admin'), async (req, res) => {
    try {
        const { reportId, driverId } = req.body;
        await Report.findByIdAndUpdate(reportId, { 
            status: 'assigned', 
            assignedDriver: driverId 
        });
        res.json({ message: 'Task assigned to driver' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// --- Driver APIs ---

router.get('/driver/tasks/:driverId', protect, authorize('driver'), async (req, res) => {
    try {
        const tasks = await Report.find({ 
            assignedDriver: req.params.driverId, 
            status: { $in: ['assigned', 'in-transit'] } 
        }).sort({ createdAt: 1 });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/driver/complete-collection', protect, authorize('driver'), async (req, res) => {
    try {
        const { reportId, weight, notes } = req.body;
        const report = await Report.findByIdAndUpdate(reportId, { status: 'collected' });
        
        const collection = new Collection({
            reportId,
            driverId: report.assignedDriver,
            weight: parseFloat(weight),
            notes
        });
        await collection.save();
        
        res.json({ message: 'Collection confirmed' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.patch('/reports/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        const report = await Report.findByIdAndUpdate(
            req.params.id, 
            { status }, 
            { new: true }
        );
        res.json(report);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
