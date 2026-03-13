const mongoose = require('mongoose');

const ecoPointSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    amount: { type: Number, required: true },
    transactionType: {
        type: String,
        enum: ['earn', 'redeem'],
        default: 'earn'
    },
    reason: { type: String, required: true },
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'WasteReport', default: null }
}, { timestamps: true });

module.exports = mongoose.model('EcoPoint', ecoPointSchema);
