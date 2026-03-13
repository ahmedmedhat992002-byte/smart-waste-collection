const jwt = require('jsonwebtoken');
const User = require('./models/User');
const Report = require('./models/Report');
const Driver = require('./models/Driver');
const EcoPoint = require('./models/EcoPoint');

const JWT_SECRET = process.env.JWT_SECRET || 'smart_waste_secret_key_2024';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '24h';

// ─── Helper ───────────────────────────────────────────────────────────────────

const signToken = (id, role) =>
    jwt.sign({ id, role }, JWT_SECRET, { expiresIn: JWT_EXPIRE });

// ─── AUTH ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/register
 * POST /api/auth/register
 */
exports.register = async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Please provide name, email and password' });
        }

        const exists = await User.findOne({ email });
        if (exists) {
            return res.status(400).json({ error: 'An account with this email already exists' });
        }

        const user = await User.create({ name, email, password, role: role || 'citizen' });

        // If driver role → create driver profile
        if (user.role === 'driver') {
            await Driver.create({ userId: user._id });
        }

        res.status(201).json({ message: 'Account created successfully. Please sign in.' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

/**
 * POST /api/login
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Please provide email and password' });
        }

        // select: false on password field — need to explicitly include it
        const user = await User.findOne({ email }).select('+password');
        if (!user || !(await user.matchPassword(password))) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = signToken(user._id, user.role);

        res.json({
            token,
            user: {
                id:        user._id,
                name:      user.name,
                email:     user.email,
                role:      user.role,
                ecoPoints: user.ecoPoints
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error' });
    }
};

/**
 * GET /api/auth/profile/:userId
 */
exports.getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.params.userId).select('name email role ecoPoints stats');
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── REPORTS ─────────────────────────────────────────────────────────────────

/**
 * POST /api/report
 * POST /api/citizen/report
 */
exports.submitReport = async (req, res) => {
    try {
        const { category, lat, lng, address, description } = req.body;
        const userId = req.user ? req.user._id : req.body.userId;

        if (!userId) return res.status(401).json({ error: 'Authentication required' });
        if (!lat || !lng) return res.status(400).json({ error: 'Location coordinates required' });

        // Handle uploaded images — support both disk and memory (buffer) storage
        let images = [];
        if (req.files && req.files.length > 0) {
            images = req.files.map(f => `/uploads/${f.filename}`);
        }

        const report = await Report.create({
            category,
            description,
            location: { lat: parseFloat(lat), lng: parseFloat(lng), address: address || '' },
            images,
            reportedBy: userId
        });

        // Award 10 eco-points to the reporter
        await User.findByIdAndUpdate(userId, {
            $inc: { ecoPoints: 10, 'stats.totalReports': 1 }
        });
        await EcoPoint.create({
            userId,
            amount: 10,
            transactionType: 'earn',
            reason: 'Waste report submitted',
            reportId: report._id
        });

        res.status(201).json(report);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

/**
 * GET /api/reports
 */
exports.getAllReports = async (req, res) => {
    try {
        const reports = await Report.find()
            .sort({ createdAt: -1 })
            .populate('reportedBy', 'name email')
            .populate('assignedDriver', 'name');
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/reports/:id
 */
exports.getReportById = async (req, res) => {
    try {
        const report = await Report.findById(req.params.id)
            .populate('reportedBy', 'name email')
            .populate('assignedDriver', 'name');
        if (!report) return res.status(404).json({ error: 'Report not found' });
        res.json(report);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * PUT /api/reports/:id/status
 */
exports.updateReportStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const report = await Report.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true, runValidators: true }
        );
        if (!report) return res.status(404).json({ error: 'Report not found' });
        res.json(report);
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

/**
 * GET /api/my-reports          → uses ?userId= query param (public)
 * GET /api/my-reports/:userId  → legacy path
 */
exports.getMyReports = async (req, res) => {
    try {
        const userId = req.params.userId || req.query.userId;
        if (!userId) return res.status(400).json({ error: 'userId required' });
        const reports = await Report.find({ reportedBy: userId }).sort({ createdAt: -1 });
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// ─── ADMIN ────────────────────────────────────────────────────────────────────

/**
 * GET /api/admin/reports
 */
exports.adminGetReports = async (req, res) => {
    try {
        const reports = await Report.find()
            .sort({ createdAt: -1 })
            .populate('reportedBy', 'name')
            .populate('assignedDriver', 'name');
        res.json(reports);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/admin/stats
 */
exports.adminGetStats = async (req, res) => {
    try {
        const total     = await Report.countDocuments();
        const pending   = await Report.countDocuments({ status: 'pending' });
        const collected = await Report.countDocuments({ status: 'collected' });
        const assigned  = await Report.countDocuments({ status: 'assigned' });

        const categories = await Report.aggregate([
            { $group: { _id: '$category', count: { $sum: 1 } } }
        ]);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const dailyReports = await Report.aggregate([
            { $match: { createdAt: { $gte: sevenDaysAgo } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);

        const performance = total > 0 ? Math.round((collected / total) * 100) : 0;

        const recentReports = await Report.find()
            .limit(10)
            .sort({ createdAt: -1 })
            .populate('reportedBy', 'name')
            .populate('assignedDriver', 'name');

        res.json({ total, pending, collected, assigned, performance, categories, dailyReports, recentReports });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/admin/drivers
 */
exports.adminGetDrivers = async (req, res) => {
    try {
        const drivers = await User.find({ role: 'driver' }).select('name email ecoPoints');
        res.json(drivers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/admin/assign-driver
 * POST /api/admin/assign-task
 */
exports.assignDriver = async (req, res) => {
    try {
        const { reportId, driverId } = req.body;
        if (!reportId || !driverId) {
            return res.status(400).json({ error: 'reportId and driverId are required' });
        }

        const report = await Report.findByIdAndUpdate(
            reportId,
            { status: 'assigned', assignedDriver: driverId },
            { new: true }
        );
        if (!report) return res.status(404).json({ error: 'Report not found' });

        res.json({ message: 'Driver assigned successfully', report });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// ─── DRIVER ───────────────────────────────────────────────────────────────────

/**
 * GET /api/driver/tasks/:driverId
 */
exports.getDriverTasks = async (req, res) => {
    try {
        const tasks = await Report.find({
            assignedDriver: req.params.driverId,
            status: { $in: ['assigned', 'in-transit'] }
        }).sort({ createdAt: 1 });
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/driver/complete-collection
 */
exports.completeCollection = async (req, res) => {
    try {
        const { reportId, notes } = req.body;

        const report = await Report.findByIdAndUpdate(
            reportId,
            { status: 'collected' },
            { new: true }
        );
        if (!report) return res.status(404).json({ error: 'Report not found' });

        // Reward driver
        await User.findByIdAndUpdate(report.assignedDriver, { $inc: { ecoPoints: 5 } });

        res.json({ message: 'Collection confirmed!', report });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};
