const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        index: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        index: true
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: 6,
        select: false  // never return password in queries by default
    },
    role: {
        type: String,
        enum: ['citizen', 'admin', 'driver'],
        default: 'citizen'
    },
    profilePic: { type: String, default: '' },
    phone: { type: String, default: '' },
    ecoPoints: { type: Number, default: 0 },
    stats: {
        totalReports: { type: Number, default: 0 },
        impactScore:  { type: Number, default: 0 }
    }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Compare password method
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
