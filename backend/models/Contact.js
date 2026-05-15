const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: [true, 'Name is required'],
        trim: true,
        maxlength: [100, 'Name too long']
    },
    email: { 
        type: String, 
        required: [true, 'Email is required'],
        lowercase: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email format']
    },
    phone: { 
        type: String, 
        match: [/^\+?[\d\s\-\$\$]{10,15}$/, 'Invalid phone number']
    },
    subject: { 
        type: String, 
        trim: true,
        maxlength: [200, 'Subject too long']
    },
    message: { 
        type: String, 
        required: [true, 'Message is required'],
        trim: true,
        maxlength: [2000, 'Message too long']
    },
    status: { 
        type: String, 
        enum: ['new', 'read', 'replied', 'closed'], 
        default: 'new' 
    },
    repliedBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    reply: { 
        type: String,
        maxlength: [2000]
    },
    ipAddress: { 
        type: String 
    }, // For spam detection
    userAgent: { 
        type: String 
    },
    createdAt: { 
        type: Date, 
        default: Date.now,
        index: true 
    },
    updatedAt: { 
        type: Date, 
        default: Date.now 
    },
    repliedAt: { 
        type: Date 
    }
});

// ── Update timestamp
contactSchema.pre('save', function(next) {
    this.updatedAt = new Date();
    next();
});

// ── Virtual for admin reply count
contactSchema.virtual('daysOpen').get(function() {
    return Math.floor((new Date() - this.createdAt) / (1000 * 60 * 60 * 24));
});

// ── JSON settings
contactSchema.set('toJSON', { virtuals: true });
contactSchema.set('toObject', { virtuals: true });

// ── Hide __v
contactSchema.methods.toJSON = function() {
    const contact = this.toObject();
    delete contact.__v;
    return contact;
};

// ── Indexes for admin dashboard
contactSchema.index({ status: 1, createdAt: -1 });     // Unread first
contactSchema.index({ email: 1 });                      // Find duplicates
contactSchema.index({ 'createdAt': -1 });               // Recent first
contactSchema.index({ subject: 'text', message: 'text' }); // Full-text search

module.exports = mongoose.model('Contact', contactSchema);