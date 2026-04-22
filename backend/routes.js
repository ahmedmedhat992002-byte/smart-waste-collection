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

// ── In-Memory Database ────────────────────────────────────────────────────────
// Password for ALL demo users is:  password
let users = [
    { _id: '0',  name: 'Demo Admin',   email: 'admin@smartwaste.ai', password: '$2a$10$KDDyOJWq6.OXqt13EY3RhOAXAQ0gwsfkS9Oszl093esL.ekRRZN7m', role: 'admin',   createdAt: new Date('2026-01-01') },
    { _id: 'd1', name: 'Ali (Driver)', email: 'driver1@fleet.com',   password: '$2a$10$KDDyOJWq6.OXqt13EY3RhOAXAQ0gwsfkS9Oszl093esL.ekRRZN7m', role: 'driver',  status: 'active', createdAt: new Date('2026-01-15') },
    { _id: 'c1', name: 'Sarah Citizen',email: 'sarah@me.com',        password: '$2a$10$KDDyOJWq6.OXqt13EY3RhOAXAQ0gwsfkS9Oszl093esL.ekRRZN7m', role: 'citizen', ecoPoints: 150,  createdAt: new Date('2026-02-01') },
    { _id: 'c2', name: 'Omar Hassan',  email: 'omar@city.gov',       password: '$2a$10$KDDyOJWq6.OXqt13EY3RhOAXAQ0gwsfkS9Oszl093esL.ekRRZN7m', role: 'citizen', ecoPoints: 80,   createdAt: new Date('2026-02-10') },
    { _id: 'c3', name: 'Layla Ahmed',  email: 'layla@eco.org',       password: '$2a$10$KDDyOJWq6.OXqt13EY3RhOAXAQ0gwsfkS9Oszl093esL.ekRRZN7m', role: 'citizen', ecoPoints: 210,  createdAt: new Date('2026-03-01') },
];

let reports = [
    { _id: 'r1', user: 'c1', category: 'Plastics',  status: 'collected',  imageUrl: null, location: { lat: 30.0500, lng: 31.2400, address: 'Tahrir Square, Cairo'      }, description: 'Large pile of plastic bottles', createdAt: new Date(Date.now() - 5*86400000), updatedAt: new Date(Date.now() - 4*86400000) },
    { _id: 'r2', user: 'c2', category: 'Organic',   status: 'pending',    imageUrl: null, location: { lat: 30.0600, lng: 31.2200, address: 'Zamalek, Cairo'             }, description: 'Food waste overflowing bin',   createdAt: new Date(Date.now() - 3*86400000), updatedAt: new Date(Date.now() - 3*86400000) },
    { _id: 'r3', user: 'c1', category: 'Plastics',  status: 'dispatched', imageUrl: null, location: { lat: 30.0400, lng: 31.2500, address: 'Garden City, Cairo'         }, description: 'Illegal plastic dumping',     createdAt: new Date(Date.now() - 1*86400000), updatedAt: new Date(Date.now() - 86400000)   },
    { _id: 'r4', user: 'c3', category: 'Metal',     status: 'collected',  imageUrl: null, location: { lat: 30.0700, lng: 31.2300, address: 'Dokki, Cairo'               }, description: 'Old car parts abandoned',    createdAt: new Date(Date.now() - 8*3600000),  updatedAt: new Date(Date.now() - 6*3600000)  },
    { _id: 'r5', user: 'c2', category: 'Glass',     status: 'pending',    imageUrl: null, location: { lat: 30.0450, lng: 31.2600, address: 'Maadi, Cairo'               }, description: 'Broken glass on sidewalk',   createdAt: new Date(Date.now() - 2*3600000),  updatedAt: new Date(Date.now() - 2*3600000)  },
    { _id: 'r6', user: 'c3', category: 'Hazardous', status: 'pending',    imageUrl: null, location: { lat: 30.0350, lng: 31.2150, address: 'Agouza, Cairo'              }, description: 'Chemical drums dumped',      createdAt: new Date(Date.now() - 1*3600000),  updatedAt: new Date(Date.now() - 1*3600000)  },
];

let contacts = [];
let idCounter = 200;
const generateId = () => String(idCounter++);

// ── Real-Time Simulation ─────────────────────────────────────────────────────
setInterval(() => {
    // Keep memory clean
    if (reports.length > 200) reports.splice(0, 10);
    
    const categories = ['Plastics', 'Organic', 'Metal', 'Glass', 'Hazardous', 'E-Waste'];
    const addresses = ['Tahrir Square', 'Zamalek', 'Nasr City', 'Maadi', 'Heliopolis', 'Dokki', 'Mohandeseen'];
    const citizens = users.filter(u => u.role === 'citizen');
    
    const newReport = {
        _id: generateId(),
        user: citizens[Math.floor(Math.random() * citizens.length)]._id,
        category: categories[Math.floor(Math.random() * categories.length)],
        status: 'pending',
        imageUrl: null,
        location: {
            lat: 30.0 + Math.random() * 0.1,
            lng: 31.2 + Math.random() * 0.1,
            address: addresses[Math.floor(Math.random() * addresses.length)] + ', Cairo'
        },
        description: 'Auto-detected anomaly via smart bin sensor (Simulation)',
        createdAt: new Date(),
        updatedAt: new Date()
    };
    reports.push(newReport);
}, 10000); // 10 seconds

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
router.get('/public-stats', (_req, res) => {
    const collected = reports.filter(r => r.status === 'collected').length;
    res.json({
        totalReports:   reports.length + 1250,
        activeCitizens: users.filter(u => u.role === 'citizen').length + 8500,
        co2Reduction:   45,
        totalTons:      reports.length + 1540,
        collectedToday: collected,
    });
});

// Contact form
router.post('/contact', (req, res) => {
    const { name, email, subject, message } = req.body;
    if (!name || !email || !message)
        return res.status(400).json({ error: 'Name, email and message are required' });
    contacts.push({ _id: generateId(), name, email, subject, message, createdAt: new Date() });
    res.json({ message: 'Message received — we will be in touch soon!' });
});

// ════════════════════════════════════════════════════════════════════════════
//  AUTHENTICATION
// ════════════════════════════════════════════════════════════════════════════

// Verify token & return current user
router.get('/auth/me', authMiddleware, (req, res) => {
    const user = users.find(u => u._id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(safeUser(user));
});

// Register
router.post('/auth/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;

        // Validation
        if (!name || name.trim().length < 2)
            return res.status(400).json({ error: 'Name must be at least 2 characters' });
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return res.status(400).json({ error: 'Valid email is required' });
        if (!password || password.length < 6)
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        if (users.find(u => u.email.toLowerCase() === email.toLowerCase()))
            return res.status(400).json({ error: 'An account with this email already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const allowedRole    = ['citizen', 'driver', 'admin'].includes(role) ? role : 'citizen';
        const newUser = {
            _id: generateId(), name: name.trim(), email: email.toLowerCase(),
            password: hashedPassword, role: allowedRole,
            ecoPoints: allowedRole === 'citizen' ? 0 : undefined,
            status: allowedRole === 'driver' ? 'available' : undefined,
            createdAt: new Date()
        };
        users.push(newUser);

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

        const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
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
router.post('/citizen/report', authMiddleware, (req, res) => {
    const { category, location, description, imageUrl } = req.body;
    if (!category) return res.status(400).json({ error: 'Category is required' });
    if (!location || !location.address) return res.status(400).json({ error: 'Location is required' });

    const newReport = {
        _id: generateId(), user: req.user.id, category,
        location, description: description || '', imageUrl: imageUrl || null,
        status: 'pending', createdAt: new Date(), updatedAt: new Date()
    };
    reports.push(newReport);

    // Award eco-points to citizens
    const reporter = users.find(u => u._id === req.user.id);
    if (reporter && reporter.role === 'citizen') {
        reporter.ecoPoints = (reporter.ecoPoints || 0) + 10;
    }

    res.status(201).json({ ...newReport, ecoPointsEarned: reporter?.role === 'citizen' ? 10 : 0 });
});

// Upload image for a report (returns URL)
router.post('/citizen/report/upload', authMiddleware, upload.single('image'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image file provided' });
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl, message: 'Image uploaded successfully' });
});

// Get reports submitted by the current user
router.get('/citizen/my-reports', authMiddleware, (req, res) => {
    const myReports = reports
        .filter(r => r.user === req.user.id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(myReports);
});

// Eco-points leaderboard (top 10 citizens)
router.get('/citizen/leaderboard', (_req, res) => {
    const leaderboard = users
        .filter(u => u.role === 'citizen')
        .sort((a, b) => (b.ecoPoints || 0) - (a.ecoPoints || 0))
        .slice(0, 10)
        .map((u, i) => ({ rank: i + 1, name: u.name, ecoPoints: u.ecoPoints || 0 }));
    res.json(leaderboard);
});

// Legacy alias
router.post('/report', authMiddleware, (req, res) => res.redirect(307, '/api/citizen/report'));

// ════════════════════════════════════════════════════════════════════════════
//  ADMIN ROUTES
// ════════════════════════════════════════════════════════════════════════════

// All users (filterable by role)
router.get('/admin/users', authMiddleware, adminMiddleware, (req, res) => {
    let result = users.map(safeUser);
    if (req.query.role) result = result.filter(u => u.role === req.query.role);
    res.json(result);
});

// Update user role
router.patch('/admin/users/:id/role', authMiddleware, adminMiddleware, (req, res) => {
    const user = users.find(u => u._id === req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const newRole = req.body.role;
    if (!['admin', 'driver', 'citizen'].includes(newRole))
        return res.status(400).json({ error: 'Invalid role' });
    user.role = newRole;
    res.json({ message: 'Role updated', user: safeUser(user) });
});

// Delete user
router.delete('/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
    if (req.params.id === '0') return res.status(403).json({ error: 'Cannot delete the root admin' });
    const index = users.findIndex(u => u._id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'User not found' });
    users.splice(index, 1);
    res.json({ message: 'User deleted' });
});

// Drivers list
router.get('/admin/drivers', authMiddleware, adminMiddleware, (req, res) =>
    res.json(users.filter(u => u.role === 'driver').map(u => ({
        _id: u._id, name: u.name, status: u.status || 'available'
    })))
);

// Pending report count (for notification badge)
router.get('/admin/pending-count', authMiddleware, adminMiddleware, (req, res) =>
    res.json({ count: reports.filter(r => r.status === 'pending').length })
);

// Assign task to driver
router.patch('/admin/assign-task/:taskId', authMiddleware, adminMiddleware, (req, res) => {
    const report = reports.find(r => r._id === req.params.taskId);
    if (!report) return res.status(404).json({ error: 'Report not found' });
    if (!req.body.driverId) return res.status(400).json({ error: 'driverId is required' });
    report.status     = 'dispatched';
    report.assignedTo = req.body.driverId;
    report.updatedAt  = new Date();
    res.json(report);
});

// Full stats for admin dashboard
router.get('/admin/stats', authMiddleware, adminMiddleware, (req, res) => {
    // Category breakdown
    const catMap = {};
    reports.forEach(r => { catMap[r.category] = (catMap[r.category] || 0) + 1; });
    const categories = Object.keys(catMap).map(k => ({ _id: k, count: catMap[k] }));

    // 7-day daily trend
    const dailyReports = [0, 0, 0, 0, 0, 0, 0];
    const now = Date.now();
    reports.forEach(r => {
        const diff = Math.floor((now - new Date(r.createdAt)) / 86400000);
        if (diff >= 0 && diff < 7) dailyReports[6 - diff]++;
    });

    const total     = reports.length || 1;
    const collected = reports.filter(r => r.status === 'collected').length;
    const pending   = reports.filter(r => r.status === 'pending').length;
    const dispatched= reports.filter(r => r.status === 'dispatched').length;

    res.json({
        totalUsers:    users.filter(u => u.role === 'citizen').length,
        totalReports:  reports.length,
        pendingAction: pending,
        dispatched,
        activeDrivers: users.filter(u => u.role === 'driver').length,
        activeFleet:   users.filter(u => u.role === 'driver' && u.status === 'active').length,
        performance:   Math.round((collected / total) * 100),
        categories:    categories.length ? categories : [{ _id: 'None', count: 1 }],
        dailyReports,
        reports:       [...reports].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 50)
    });
});

// All reports with optional filter
router.get('/admin/reports', authMiddleware, adminMiddleware, (req, res) => {
    let result = [...reports].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (req.query.status && req.query.status !== 'all') {
        result = result.filter(r => r.status === req.query.status);
    }
    if (req.query.category) {
        result = result.filter(r => r.category === req.query.category);
    }
    // Enrich with reporter name
    result = result.map(r => {
        const reporter = users.find(u => u._id === r.user);
        return { ...r, reporterName: reporter ? reporter.name : 'Unknown' };
    });
    res.json(result);
});

// CSV export
router.get('/admin/export-csv', authMiddleware, adminMiddleware, (req, res) => {
    const header = 'Report ID,Category,Status,Location,Reporter,Date\n';
    const rows   = reports.map(r => {
        const reporter = users.find(u => u._id === r.user);
        return `${r._id},${r.category},${r.status},"${r.location?.address || ''}","${reporter?.name || ''}",${new Date(r.createdAt).toISOString()}`;
    }).join('\n');
    res.header('Content-Type', 'text/csv');
    res.attachment(`smartwaste_reports_${new Date().toISOString().slice(0,10)}.csv`);
    res.send(header + rows);
});

// ════════════════════════════════════════════════════════════════════════════
//  DRIVER ROUTES
// ════════════════════════════════════════════════════════════════════════════

// Get tasks assigned to this driver (or all pending if admin)
router.get('/driver/tasks', authMiddleware, driverOrAdminMiddleware, (req, res) => {
    let tasks;
    if (req.user.role === 'admin') {
        tasks = reports;
    } else {
        tasks = reports.filter(r =>
            r.assignedTo === req.user.id || r.status === 'pending'
        );
    }
    tasks = tasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(tasks);
});

// Mark task as collected
router.patch('/driver/tasks/:id/complete', authMiddleware, driverOrAdminMiddleware, (req, res) => {
    const report = reports.find(r => r._id === req.params.id);
    if (!report) return res.status(404).json({ error: 'Task not found' });
    report.status    = 'collected';
    report.updatedAt = new Date();
    res.json(report);
});

module.exports = router;
