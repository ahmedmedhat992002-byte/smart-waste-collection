require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve uploads folder for image access
const uploadsDir = process.env.VERCEL ? '/tmp/uploads' : path.join(__dirname, '../uploads');
try {
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
} catch (e) {
    console.warn('Could not create uploads directory (expected on Vercel)', e.message);
}
app.use('/uploads', express.static(uploadsDir));

// Serve all static project files (CSS, JS, HTML, images)
app.use(express.static(path.join(__dirname, '../')));

console.log('✅  SmartWaste backend running (in-memory data store).');

// ── API Routes ────────────────────────────────────────────────────────────────
const apiRoutes = require('./routes');
app.use('/api', apiRoutes);
app.use(apiRoutes); // Handle Vercel rewritten routes that strip the /api prefix

// ── Root redirect ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.redirect('/frontend/index.html'));

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((req, res) => {
    if (req.accepts('html')) {
        res.status(404).send('Page not found. <a href="/frontend/index.html">Go Home</a>');
    } else {
        res.status(404).json({ error: `API Route ${req.path} not found` });
    }
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
    console.error('Unhandled Error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀  Server on http://localhost:${PORT}`);
    console.log(`    Landing : http://localhost:${PORT}/frontend/index.html`);
    console.log(`    Dashboard: http://localhost:${PORT}/dashboard.html`);
});
