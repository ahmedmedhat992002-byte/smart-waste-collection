const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const mongoose = require('mongoose');

const JWT_SECRET = process.env.JWT_SECRET || 'smart_waste_secret_key_2024';

// ─── Mongoose Models (inline to avoid path issues in serverless) ──────────────

// User
const userSchema = new mongoose.Schema({
    name:      { type: String, required: true, trim: true },
    email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:  { type: String, required: true },
    role:      { type: String, enum: ['citizen', 'admin', 'driver'], default: 'citizen' },
    profilePic:{ type: String, default: '' },
    ecoPoints: { type: Number, default: 0 },
    stats: {
        totalReports: { type: Number, default: 0 },
        impactScore:  { type: Number, default: 0 }
    }
}, { timestamps: true });

// Report
const reportSchema = new mongoose.Schema({
    category:  { type: String, required: true, enum: ['plastic','paper','metal','mixed','electronic','organic'] },
    description: { type: String, default: '' },
    location: {
        lat:     { type: Number, required: true },
        lng:     { type: Number, required: true },
        address: { type: String, default: '' }
    },
    images:    [{ type: String }],
    status:    { type: String, enum: ['pending','assigned','in-transit','collected','cancelled'], default: 'pending' },
    priority:  { type: String, enum: ['low','medium','high'], default: 'medium' },
    reportedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedDriver:{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    pointsAwarded: { type: Boolean, default: false }
}, { timestamps: true });

// EcoPoint
const ecoPointSchema = new mongoose.Schema({
    userId:          { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount:          { type: Number, required: true },
    transactionType: { type: String, enum: ['earn','redeem'], default: 'earn' },
    reason:          { type: String, required: true },
    reportId:        { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null }
}, { timestamps: true });

// FuelLog
const fuelLogSchema = new mongoose.Schema({
    driverId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    liters:        { type: Number, required: true },
    cost:          { type: Number, required: true },
    odometer:      { type: Number, required: true },
    receiptImage:  { type: String },
    notes:         { type: String, default: '' }
}, { timestamps: true });

// Register models safely (avoid OverwriteModelError on hot-reload)
const User     = mongoose.models.User     || mongoose.model('User', userSchema);
const Report   = mongoose.models.Report || mongoose.model('Report', reportSchema);
const EcoPoint = mongoose.models.EcoPoint || mongoose.model('EcoPoint', ecoPointSchema);
const FuelLog  = mongoose.models.FuelLog || mongoose.model('FuelLog', fuelLogSchema);

// ─── Multer ───────────────────────────────────────────────────────────────────
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
    try { fs.mkdirSync(uploadDir, { recursive: true }); } catch (e) {}
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename:    (req, file, cb) => cb(null, `waste_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ─── Auth Middleware ──────────────────────────────────────────────────────────
const protect = async (req, res, next) => {
    try {
        const auth = req.headers.authorization;
        if (!auth || !auth.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Not authorised – token missing' });
        }
        const decoded = jwt.verify(auth.split(' ')[1], JWT_SECRET);
        req.user = await User.findById(decoded.id);
        if (!req.user) return res.status(401).json({ error: 'User not found' });
        next();
    } catch {
        return res.status(401).json({ error: 'Not authorised – invalid token' });
    }
};

const authorize = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
        return res.status(403).json({ error: `Role '${req.user.role}' is not permitted` });
    }
    next();
};

// ─── AUTHENTICATION ───────────────────────────────────────────────────────────

// POST /api/register  &  /api/auth/register
const registerHandler = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Please provide name, email and password' });
        }
        if (await User.findOne({ email })) {
            return res.status(400).json({ error: 'An account with this email already exists' });
        }
        const hashed = await bcrypt.hash(password, 12);
        await User.create({ name, email, password: hashed, role: role || 'citizen' });
        res.status(201).json({ message: 'Account created successfully. Please sign in.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// POST /api/login  &  /api/auth/login
const loginHandler = async (req, res) => {
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
            user: { id: user._id, name: user.name, email: user.email, role: user.role, ecoPoints: user.ecoPoints }
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

router.post('/register',      registerHandler);
router.post('/auth/register', registerHandler);
router.post('/login',         loginHandler);
router.post('/auth/login',    loginHandler);

// GET /api/auth/profile/:userId
router.get('/auth/profile/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('name email role ecoPoints stats');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── WASTE REPORTS ────────────────────────────────────────────────────────────

// POST /api/report  &  /api/citizen/report
const submitReport = async (req, res) => {
    try {
        const { category, lat, lng, address, description, userId } = req.body;
        const reporterId = req.user ? req.user._id : userId;
        if (!reporterId) return res.status(401).json({ error: 'Authentication required' });
        if (!lat || !lng) return res.status(400).json({ error: 'Location coordinates required' });

        const images = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
        const report = await Report.create({
            category,
            description: description || '',
            location: { lat: parseFloat(lat), lng: parseFloat(lng), address: address || '' },
            images,
            reportedBy: reporterId
        });

        await User.findByIdAndUpdate(reporterId, { $inc: { ecoPoints: 10, 'stats.totalReports': 1 } });
        await EcoPoint.create({ userId: reporterId, amount: 10, reason: 'Waste report submitted', reportId: report._id });

        res.status(201).json(report);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

router.post('/report',         protect, upload.array('images', 3), submitReport);
router.post('/citizen/report', protect, upload.array('images', 3), submitReport);

// GET /api/reports
router.get('/reports', async (req, res) => {
    try {
        const reports = await Report.find().sort({ createdAt: -1 })
            .populate('reportedBy', 'name email').populate('assignedDriver', 'name');
        res.json(reports);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/reports/:id
router.get('/reports/:id', async (req, res) => {
    try {
        const report = await Report.findById(req.params.id)
            .populate('reportedBy', 'name email').populate('assignedDriver', 'name');
        if (!report) return res.status(404).json({ error: 'Report not found' });
        res.json(report);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/reports/:id/status  &  PATCH (legacy)
const updateStatus = async (req, res) => {
    try {
        const report = await Report.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true, runValidators: true });
        if (!report) return res.status(404).json({ error: 'Report not found' });
        res.json(report);
    } catch (err) { res.status(400).json({ error: err.message }); }
};
router.put('/reports/:id/status',   protect, updateStatus);
router.patch('/reports/:id/status', updateStatus);

// GET /api/my-reports  &  /api/my-reports/:userId
const getMyReports = async (req, res) => {
    try {
        const userId = req.params.userId || req.query.userId;
        if (!userId) return res.status(400).json({ error: 'userId required' });
        const reports = await Report.find({ reportedBy: userId }).sort({ createdAt: -1 });
        res.json(reports);
    } catch (err) { res.status(500).json({ error: err.message }); }
};
router.get('/my-reports',         protect, getMyReports);
router.get('/my-reports/:userId', protect, getMyReports);

// ─── ADMIN ────────────────────────────────────────────────────────────────────

// GET /api/admin/reports
router.get('/admin/reports', protect, authorize('admin'), async (req, res) => {
    try {
        const reports = await Report.find().sort({ createdAt: -1 })
            .populate('reportedBy', 'name').populate('assignedDriver', 'name');
        res.json(reports);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/stats
router.get('/admin/stats', protect, authorize('admin'), async (req, res) => {
    try {
        const total     = await Report.countDocuments();
        const pending   = await Report.countDocuments({ status: 'pending' });
        const collected = await Report.countDocuments({ status: 'collected' });
        const assigned  = await Report.countDocuments({ status: 'assigned' });

        const categories = await Report.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const dailyReports = await Report.aggregate([
            { $match: { createdAt: { $gte: sevenDaysAgo } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        const performance  = total > 0 ? Math.round((collected / total) * 100) : 0;
        const recentReports = await Report.find().limit(10).sort({ createdAt: -1 })
            .populate('reportedBy', 'name').populate('assignedDriver', 'name');

        res.json({ total, pending, collected, assigned, performance, categories, dailyReports, recentReports });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/drivers
router.get('/admin/drivers', protect, authorize('admin'), async (req, res) => {
    try {
        const drivers = await User.find({ role: 'driver' }).select('name email ecoPoints stats');
        
        // Fetch current assigned tasks for drivers to enrich data
        const driversList = [];
        for (let d of drivers) {
            const activeReport = await Report.findOne({ assignedDriver: d._id, status: { $in: ['assigned', 'in-transit'] } });
            driversList.push({
                ...d.toObject(),
                status: activeReport ? 'On Mission' : 'Idle',
                activeMission: activeReport ? activeReport._id : null
            });
        }
        res.json(driversList);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/admin/users
router.get('/admin/users', protect, authorize('admin'), async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// PUT /api/admin/users/:id/role
router.put('/admin/users/:id/role', protect, authorize('admin'), async (req, res) => {
    try {
        const { role } = req.body;
        if (!['citizen', 'driver', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }
        const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ message: 'User role updated', user });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/admin/assign-driver  &  /api/admin/assign-task (legacy)
const assignDriver = async (req, res) => {
    try {
        const { reportId, driverId } = req.body;
        if (!reportId || !driverId) return res.status(400).json({ error: 'reportId and driverId required' });
        const report = await Report.findByIdAndUpdate(reportId, { status: 'assigned', assignedDriver: driverId }, { new: true });
        if (!report) return res.status(404).json({ error: 'Report not found' });
        res.json({ message: 'Driver assigned successfully', report });
    } catch (err) { res.status(400).json({ error: err.message }); }
};
router.post('/admin/assign-driver', protect, authorize('admin'), assignDriver);
router.post('/admin/assign-task',   protect, authorize('admin'), assignDriver);

// ─── DRIVER OPERATIONS ──────────────────────────────────────────────────────────

// GET /api/driver/tasks/:driverId
router.get('/driver/tasks/:driverId', protect, authorize('driver', 'admin'), async (req, res) => {
    try {
        const tasks = await Report.find({
            assignedDriver: req.params.driverId,
            status: { $in: ['assigned', 'in-transit'] }
        }).sort({ createdAt: 1 });
        res.json(tasks);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/driver/route-plan
router.get('/driver/route-plan', protect, authorize('driver'), async (req, res) => {
    try {
        const tasks = await Report.find({
            assignedDriver: req.user._id,
            status: { $in: ['assigned', 'in-transit'] }
        }).sort({ createdAt: 1 });
        // In a real app, this would integrate with a routing API like Mapbox or Google Directions
        res.json({ optimizeRoute: true, tasks });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/driver/fuel-log
router.post('/driver/fuel-log', protect, authorize('driver'), upload.single('receipt'), async (req, res) => {
    try {
        const { liters, cost, odometer, notes } = req.body;
        const receiptImage = req.file ? `/uploads/${req.file.filename}` : null;
        
        const log = await FuelLog.create({
            driverId: req.user._id,
            liters: parseFloat(liters),
            cost: parseFloat(cost),
            odometer: parseInt(odometer),
            notes: notes || '',
            receiptImage
        });
        res.status(201).json(log);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/driver/fuel-log
router.get('/driver/fuel-log', protect, authorize('driver'), async (req, res) => {
    try {
        const logs = await FuelLog.find({ driverId: req.user._id }).sort({ createdAt: -1 });
        res.json(logs);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/driver/complete-collection
router.post('/driver/complete-collection', protect, authorize('driver'), async (req, res) => {
    try {
        const { reportId } = req.body;
        const report = await Report.findByIdAndUpdate(reportId, { status: 'collected' }, { new: true });
        if (!report) return res.status(404).json({ error: 'Report not found' });
        await User.findByIdAndUpdate(report.assignedDriver, { $inc: { ecoPoints: 5 } });
        res.json({ message: 'Collection confirmed!', report });
    } catch (err) { res.status(400).json({ error: err.message }); }
});

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
router.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

module.exports = router;
