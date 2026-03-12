const mongoose = require('mongoose');

// --- 1. User Schema ---
const userSchema = new mongoose.Schema({
    name: { type: String, required: true, index: true },
    email: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
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
        impactScore: { type: Number, default: 0 } // CO2 saved, etc.
    },
    createdAt: { type: Date, default: Date.now }
});

// --- 2. Location Schema (Municipal Bins / Collection Points) ---
const locationSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, enum: ['collection-point', 'bin', 'smart-hub'], default: 'bin' },
    coordinates: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true }
    },
    address: { type: String },
    capacity: { type: Number }, // max volume
    currentFill: { type: Number, default: 0 }, // 0-100 percentage
    lastEmptied: { type: Date },
    status: { type: String, enum: ['active', 'full', 'maintenance'], default: 'active' }
});
locationSchema.index({ coordinates: '2dsphere' });

// --- 3. WasteReport Schema ---
const wasteReportSchema = new mongoose.Schema({
    category: { 
        type: String, 
        required: true, 
        enum: ['plastic', 'paper', 'metal', 'mixed', 'electronic', 'organic'] 
    },
    location: {
        lat: { type: Number, required: true },
        lng: { type: Number, required: true },
        address: { type: String }
    },
    images: [{ type: String }],
    status: { 
        type: String, 
        enum: ['pending', 'assigned', 'in-transit', 'collected', 'cancelled'], 
        default: 'pending' 
    },
    priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    description: { type: String },
    assignedDriver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    pointsAwarded: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now, index: true }
});
wasteReportSchema.index({ 'location': '2dsphere' });

// --- 4. DriverProfile Schema (Extended User Data) ---
const driverProfileSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    licenseNumber: { type: String, required: true, unique: true },
    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Truck' },
    rating: { type: Number, default: 5 },
    totalCollections: { type: Number, default: 0 },
    currentStatus: { 
        type: String, 
        enum: ['available', 'on-duty', 'busy', 'off-duty'], 
        default: 'available' 
    },
    lastUpdated: { type: Date, default: Date.now }
});

// --- 5. Collection Schema (Log of operations) ---
const collectionSchema = new mongoose.Schema({
    reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'WasteReport', required: true },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    truckId: { type: mongoose.Schema.Types.ObjectId, ref: 'Truck' },
    weight: { type: Number }, // kg
    wasteType: { type: String },
    capturedImages: [{ type: String }],
    notes: { type: String },
    collectedAt: { type: Date, default: Date.now, index: true }
});

// --- 6. EcoPoint Schema (Transactional Ledger) ---
const ecoPointSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    amount: { type: Number, required: true },
    transactionType: { type: String, enum: ['earn', 'redeem'], default: 'earn' },
    reason: { type: String, required: true },
    metadata: {
        reportId: { type: mongoose.Schema.Types.ObjectId, ref: 'WasteReport' },
        partnerId: { type: String } // if redeemed at a partner store
    },
    createdAt: { type: Date, default: Date.now }
});

// Create Models
const User = mongoose.model('User', userSchema);
const Location = mongoose.model('Location', locationSchema);
const WasteReport = mongoose.model('WasteReport', wasteReportSchema);
const Driver = mongoose.model('Driver', driverProfileSchema);
const Collection = mongoose.model('Collection', collectionSchema);
const EcoPoint = mongoose.model('EcoPoint', ecoPointSchema);

// Export for Backend (Aliasing for backward compatibility where needed)
module.exports = { 
    User, 
    Users: User,
    Location, 
    Locations: Location,
    WasteReport, 
    WasteReports: WasteReport,
    Report: WasteReport, // Alias for older code
    Driver, 
    Drivers: Driver,
    Collection, 
    Collections: Collection,
    EcoPoint, 
    EcoPoints: EcoPoint 
};
