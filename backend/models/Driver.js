const mongoose = require('mongoose');

const driverSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        unique: true
    },
    truckId: { type: String, default: '' },           // e.g. truck plate or ID
    licenseNumber: { type: String, default: '' },
    assignedReports: [{ type: mongoose.Schema.Types.ObjectId, ref: 'WasteReport' }],
    totalCollections: { type: Number, default: 0 },
    rating: { type: Number, default: 5.0 },
    currentStatus: {
        type: String,
        enum: ['available', 'on-duty', 'busy', 'off-duty'],
        default: 'available'
    }
}, { timestamps: true });

module.exports = mongoose.model('Driver', driverSchema);
