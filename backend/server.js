const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');
const fs       = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const app  = express();
const PORT = process.env.PORT || 5000;

// ─── Connect to MongoDB ───────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smart_waste_db';

if (mongoose.connection.readyState === 0) {
    mongoose.connect(MONGO_URI)
        .then(() => console.log('✅ MongoDB Connected'))
        .catch(err => console.error('❌ MongoDB Error:', err.message));
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({ origin: '*', methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Uploads ─────────────────────────────────────────────────────────────────
const uploadsDir = path.join(process.cwd(), 'uploads');
try { if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) {}
app.use('/uploads', express.static(uploadsDir));

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', require('./routes'));

// ─── Serve Frontend ───────────────────────────────────────────────────────────
const frontendDir = path.join(__dirname, '../frontend');
try {
    if (fs.existsSync(frontendDir)) {
        app.use(express.static(frontendDir));
        app.get('*', (req, res) => {
            if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
                res.sendFile(path.join(frontendDir, 'index.html'));
            }
        });
    }
} catch (e) {}

// ─── Error handler ────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

// ─── Local dev / Vercel export ────────────────────────────────────────────────
if (require.main === module) {
    app.listen(PORT, () => console.log(`🚀 SmartWaste → http://localhost:${PORT}`));
}

module.exports = app;
