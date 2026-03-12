const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Serve Frontend Static Files
app.use(express.static(path.join(__dirname, '../frontend')));

// API Routes
const apiRoutes = require('./routes');
app.use('/api', apiRoutes);

// Database Connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/smart_waste_db';
mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('✅ Connected to MongoDB Atlas - SmartCity Node'))
.catch(err => console.error('❌ Database Connection Error:', err));

// Fallback to index.html for SPA-like behavior (optional for simple routing)
app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../frontend/index.html'));
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Smart Waste Backend running at http://localhost:${PORT}`);
    console.log(`📂 Static uploads served from /uploads`);
});
