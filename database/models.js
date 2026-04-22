const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name:      { type: String, required: true },
    email:     { type: String, required: true, unique: true },
    password:  { type: String, required: true },
    role:      { type: String, enum: ['citizen', 'admin', 'driver'], default: 'citizen' },
    ecoPoints: { type: Number, default: 0 },
    status:    { type: String, default: 'Active' },
    activeMission: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null },
    createdAt: { type: Date, default: Date.now }
});

const reportSchema = new mongoose.Schema({
    category:   { type: String, required: true },
    location: {
        lat:     { type: Number, default: 0 },
        lng:     { type: Number, default: 0 },
        address: { type: String, default: '' }
    },
    images:      [{ type: String }],
    status:      { type: String, default: 'pending' },
    reportedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedTo:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    description: { type: String, default: '' },
    createdAt:   { type: Date, default: Date.now }
});

module.exports = {
    User:   mongoose.model('User', userSchema),
    Report: mongoose.model('Report', reportSchema)
};
