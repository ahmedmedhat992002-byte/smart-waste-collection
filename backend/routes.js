const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const jwt     = require('jsonwebtoken');
const User    = require('./models/User');
const ctrl    = require('./controllers');

const JWT_SECRET = process.env.JWT_SECRET || 'smart_waste_secret_key_2024';

// ─── Multer (disk storage) ────────────────────────────────────────────────────

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
    filename:    (req, file, cb) => cb(null, `waste_${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB

// ─── Auth Middleware ──────────────────────────────────────────────────────────

const protect = async (req, res, next) => {
    let token;
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
        token = auth.split(' ')[1];
    }
    if (!token) return res.status(401).json({ error: 'Not authorised – token missing' });

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
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

// Standard paths (as requested)
router.post('/register',      ctrl.register);
router.post('/login',         ctrl.login);

// Legacy / aliased paths (keep working with existing frontend)
router.post('/auth/register', ctrl.register);
router.post('/auth/login',    ctrl.login);
router.get('/auth/profile/:userId', ctrl.getProfile);

// ─── WASTE REPORTS ────────────────────────────────────────────────────────────

// POST /api/report  (also accepts /citizen/report for legacy frontend)
router.post('/report',          protect, upload.array('images', 3), ctrl.submitReport);
router.post('/citizen/report',  protect, upload.array('images', 3), ctrl.submitReport);

// GET /api/reports
router.get('/reports',          ctrl.getAllReports);

// GET /api/reports/:id
router.get('/reports/:id',      ctrl.getReportById);

// PUT /api/reports/:id/status   (also PATCH for legacy)
router.put('/reports/:id/status',   protect, ctrl.updateReportStatus);
router.patch('/reports/:id/status', ctrl.updateReportStatus);

// GET /api/my-reports  (current user's reports)
router.get('/my-reports',         ctrl.getMyReports);  // ?userId=xxx
router.get('/my-reports/:userId', ctrl.getMyReports);  // legacy path

// ─── ADMIN ────────────────────────────────────────────────────────────────────

router.get('/admin/reports',      protect, authorize('admin'), ctrl.adminGetReports);
router.get('/admin/stats',        protect, authorize('admin'), ctrl.adminGetStats);
router.get('/admin/drivers',      protect, authorize('admin'), ctrl.adminGetDrivers);

// POST /api/admin/assign-driver  (also /assign-task legacy)
router.post('/admin/assign-driver', protect, authorize('admin'), ctrl.assignDriver);
router.post('/admin/assign-task',   protect, authorize('admin'), ctrl.assignDriver);

// ─── DRIVER ───────────────────────────────────────────────────────────────────

router.get('/driver/tasks/:driverId',        protect, authorize('driver'), ctrl.getDriverTasks);
router.post('/driver/complete-collection',   protect, authorize('driver'), ctrl.completeCollection);

module.exports = router;
