const mongoose = require('mongoose');

const wasteReportSchema = new mongoose.Schema({
    category: {
        type: String,
        required: [true, 'Waste category is required'],
        enum: ['plastic', 'paper', 'metal', 'mixed', 'electronic', 'organic']
    },
    description: { type: String, default: '' },
    location: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        address: { type: String, default: '' }
    },
    images: [{ type: String }],  // array of image URLs / paths
    status: {
        type: String,
        enum: ['pending', 'assigned', 'in-transit', 'collected', 'cancelled'],
        default: 'pending',
        index: true
    },
    priority: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    reportedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    assignedDriver: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    pointsAwarded: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('WasteReport', wasteReportSchema);
