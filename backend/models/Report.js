const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    user: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: [true, 'User is required'],
        index: true 
    },
    category: { 
        type: String, 
        required: [true, 'Category is required'],
        enum: {
            values: ['Plastics', 'Organic', 'Metal', 'Glass', 'Hazardous', 'E-Waste', 'Other'],
            message: 'Invalid category'
        },
        index: true 
    },
    status: { 
        type: String, 
        enum: ['pending', 'dispatched', 'collected', 'cancelled'], 
        default: 'pending',
        index: true 
    },
    imageUrl: { 
        type: String, 
        default: null,
        match: [/^https?:\/\/.*\.(png|jpg|jpeg|gif|webp)$/i, 'Invalid image URL']
    },
    location: {
        lat: { 
            type: Number, 
            required: [true, 'Latitude is required'],
            min: [-90, 'Latitude out of range'],
            max: [90, 'Latitude out of range']
        },
        lng: { 
            type: Number, 
            required: [true, 'Longitude is required'],
            min: [-180, 'Longitude out of range'],
            max: [180, 'Longitude out of range']
        },
        address: { 
            type: String, 
            required: [true, 'Address is required'],
            maxlength: [200, 'Address too long']
        }
    },
    description: { 
        type: String, 
        default: '',
        maxlength: [500, 'Description too long']
    },
    assignedTo: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        default: null 
    },
    notes: { 
        type: String, 
        default: '' 
    }, // Driver notes after collection
    weight: { 
        type: Number, 
        min: 0 
    }, // kg (optional)
    createdAt: { 
        type: Date, 
        default: Date.now,
        index: true 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    },
    completedAt: { 
        type: Date 
    }
});

// ── Update timestamp before save ─────────────────────────────────────────────
reportSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    if (this.status === 'collected') {
        this.completedAt = new Date();
    }
    next();
});

// ── Virtuals for populated data
reportSchema.virtual('reporter', {
    ref: 'User',
    localField: 'user',
    foreignField: '_id'
});

reportSchema.virtual('driver', {
    ref: 'User',
    localField: 'assignedTo',
    foreignField: '_id'
});

// ── Ensure virtuals in JSON
reportSchema.set('toJSON', { virtuals: true });
reportSchema.set('toObject', { virtuals: true });

// ── Custom JSON (hide __v)
reportSchema.methods.toJSON = function() {
    const report = this.toObject();
    delete report.__v;
    return report;
};

// ── Indexes for optimal queries
reportSchema.index({ status: 1, createdAt: -1 });        // Dashboard
reportSchema.index({ assignedTo: 1, status: 1 });         // Driver tasks
reportSchema.index({ category: 1, status: 1 });           // Stats
reportSchema.index({ 'location.address': 'text' });       // Search
reportSchema.index({ 
    location: '2dsphere'  // Geospatial queries!
});

// ── Compound indexes
reportSchema.index({ user: 1, createdAt: -1 });           // My reports
reportSchema.index({ status: 1, assignedTo: 1 });

module.exports = mongoose.model('Report', reportSchema);