const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const ROLES = [
  'ride_hailing_driver',
  'delivery_rider',
  'freelancer',
  'tutor',
  'home_service_worker',
  'marketplace_seller',
  'other',
];

const CURRENCIES = ['LKR', 'USD', 'EUR', 'GBP', 'AUD', 'INR'];

// Work & income screen - label only, BudgetBee never connects to the platform
const incomeSourceSchema = new mongoose.Schema({
  // Validation messages are error codes from utils/apiError.js
  name: { type: String, required: [true, 'INCOME_SOURCE_NAME_REQUIRED'], trim: true, maxlength: 50 },
  category: { type: String, enum: ROLES, required: true },
  currency: { type: String, enum: CURRENCIES, default: 'LKR' },
  notes: { type: String, trim: true, maxlength: 100, default: '' },
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true, sparse: true, unique: true },
    phone: { type: String, trim: true, sparse: true, unique: true },
    password: { type: String, minlength: 8, select: false }, // not required - Google users won't have one

    googleId: { type: String, sparse: true, unique: true },
    authProvider: { type: String, enum: ['local', 'google'], default: 'local' },

    // Primary role (used for profileComplete); `roles` holds every work type
    // picked on the Work & income screen, `role` is kept as the first of them
    role: { type: String, enum: ROLES, required: true },
    roles: { type: [{ type: String, enum: ROLES }], default: [] },

    incomeSources: {
      type: [incomeSourceSchema],
      default: [],
      validate: {
        validator: (sources) => sources.length <= 20,
        message: 'TOO_MANY_INCOME_SOURCES',
      },
    },

    profilePicture: {
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
    },

    // Set false for a new Google signup (role is only a placeholder until
    // /complete-profile), true once a role has been chosen. No default on
    // purpose: accounts created before this field existed read `undefined`,
    // see isProfileComplete().
    profileCompleted: { type: Boolean },

    // Bumped whenever the password changes or is reset. Every JWT carries the
    // version it was issued with (`tv`), so older tokens — other phones,
    // a stolen token — stop working immediately. See authMiddleware.
    tokenVersion: { type: Number, default: 0 },

    language: { type: String, enum: ['en', 'si', 'ta'], default: 'en' },
    baseCurrency: { type: String, default: 'LKR' },

    security: {
      pinEnabled: { type: Boolean, default: false },
      biometricEnabled: { type: Boolean, default: false },
    },

    dataSharing: {
      shareWithLender: { type: Boolean, default: false },
      shareWithFamily: { type: Boolean, default: false },
      anonymousUsageData: { type: Boolean, default: false },
    },

    fcmToken: { type: String },
    isVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Password save karanna kalin hash karanawa (password eka thiyenawa nam witharak)
// Note: modern Mongoose treats an async pre-save hook as promise-based,
// so we do NOT take/call a `next` callback here - just return when done.
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;
  this.password = await bcrypt.hash(this.password, 10);
});

// Single source of truth for "does this user still need Complete Profile?".
// Phone is optional (the screen says so) and 'other' is a real role choice, so
// neither decides it - only whether a role was ever actually chosen.
userSchema.methods.isProfileComplete = function () {
  if (typeof this.profileCompleted === 'boolean') return this.profileCompleted;
  // Accounts from before the flag: only a Google signup still on the
  // placeholder role is unfinished
  return !(this.authProvider === 'google' && this.role === 'other');
};

// Login welawata password eka check karanna
userSchema.methods.matchPassword = async function (enteredPassword) {
  if (!this.password) return false; // Google users don't have a password
  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);