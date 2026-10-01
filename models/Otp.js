const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true },
    code: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    verified: { type: Boolean, default: false },

    // 'signup' (default, general email verification), 'password_change',
    // 'password_reset' (forgot password, logged out) or 'account_delete'
    // (confirms deleting an account that has no password)
    purpose: { type: String, default: 'signup' },

    // Wrong guesses so far - public flows (password_reset) cap this so a
    // 6-digit code can't be brute-forced within its 5 minutes
    attempts: { type: Number, default: 0 },

    // Extra data needed to complete the action once the OTP is verified
    // e.g. { newPasswordHash: '...' } for a pending password change
    payload: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// OTP expire wechchama automatic delete wenawa (MongoDB TTL index)
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Otp', otpSchema);