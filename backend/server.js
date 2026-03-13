const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const connectDB = require('./config/database');
const apiRoutes = require('./routes');

// ─── Connect to MongoDB ───────────────────────────────────────────────────────
connectDB();

// ─── App ──────────────────────────────────────────────────────────────────────
const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Uploads folder (create if missing) ──────────────────────────────────────
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);

// ─── Serve Frontend (Vercel handles this separately, but helps local dev) ─────
const frontendDir = path.join(__dirname, '../frontend');
if (fs.existsSync(frontendDir)) {
    app.use(express.static(frontendDir));
    app.get('*', (req, res) => {
        if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
            res.sendFile(path.join(frontendDir, 'index.html'));
        }
    });
}

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ─── Start (local dev) / Export (Vercel serverless) ──────────────────────────
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 SmartWaste Backend  →  http://localhost:${PORT}`);
        console.log(`📦 Env: ${process.env.NODE_ENV || 'development'}`);
    });
}

module.exports = app;
