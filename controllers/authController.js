const { OAuth2Client } = require('google-auth-library');
const { sendError, serverError } = require('../utils/apiError');
const User = require('../models/User');
const Otp = require('../models/Otp');
const generateToken = require('../utils/generateToken');
const sendOtpEmail = require('../utils/sendEmail');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Helper - user object eka safely (password nathuwa) format karanawa
const formatUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  language: user.language,
  profilePicture: user.profilePicture,
  profileComplete: user.isProfileComplete(),
});

// @desc    Register a new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, phone, password, role } = req.body;

    if (!name || !password || !role || (!email && !phone)) {
      return sendError(res, 400, 'MISSING_FIELDS');
    }
    if (password.length < 8) {
      return sendError(res, 400, 'PASSWORD_TOO_SHORT');
    }

    // Only include fields that were actually provided - an { email, phone: undefined }
    // clause gets serialized to {} by the driver, which matches every document and
    // makes registration always fail with "User already exists" once any user exists.
    const existing = await User.findOne({
      $or: [email ? { email } : null, phone ? { phone } : null].filter(Boolean),
    });
    if (existing) {
      return sendError(res, 400, 'USER_EXISTS');
    }

    // Role is picked on the signup form, so the profile is already complete
    const user = await User.create({ name, email, phone, password, role, profileCompleted: true });

    // Accounts with an email must verify it via OTP before they get a token.
    // Phone-only accounts have no email to verify, so they're logged in
    // immediately (matches how BudgetBee's OTP flow is email-only).
    if (!email) {
      return res.status(201).json({
        token: generateToken(user),
        user: formatUser(user),
      });
    }

    res.status(201).json({
      requiresVerification: true,
      email: user.email,
      message: 'Account created. Check your email for a verification code.',
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      const first = Object.values(err.errors || {})[0];
      if (first?.kind === 'minlength' && first.path === 'password') {
        return sendError(res, 400, 'PASSWORD_TOO_SHORT');
      }
      return sendError(res, 400, 'INVALID_INPUT');
    }
    if (err.code === 11000) return sendError(res, 400, 'USER_EXISTS');
    serverError(res, err);
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body;

    if (!emailOrPhone || !password) {
      return sendError(res, 400, 'LOGIN_FIELDS_REQUIRED');
    }

    const user = await User.findOne({
      $or: [{ email: emailOrPhone }, { phone: emailOrPhone }],
    }).select('+password');

    if (!user || !user.password || !(await user.matchPassword(password))) {
      return sendError(res, 401, 'INVALID_CREDENTIALS');
    }

    // Only email accounts go through OTP verification - phone-only and
    // Google accounts (isVerified set at creation) skip this check.
    if (user.email && !user.isVerified) {
      return sendError(res, 403, 'EMAIL_NOT_VERIFIED', { requiresVerification: true, email: user.email });
    }

    res.json({
      token: generateToken(user),
      user: formatUser(user),
    });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Send OTP to email
// @route   POST /api/auth/send-otp
// @access  Public
const sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return sendError(res, 400, 'EMAIL_REQUIRED');

    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit code
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await Otp.deleteMany({ email }); // remove any old OTPs for this email
    await Otp.create({ email, code, expiresAt });
    await sendOtpEmail(email, code);

    res.json({ message: 'OTP sent to email' });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Verify OTP
// @route   POST /api/auth/verify-otp
// @access  Public
const verifyOtp = async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) {
      return sendError(res, 400, 'EMAIL_AND_CODE_REQUIRED');
    }

    const otpRecord = await Otp.findOne({ email, code });
    if (!otpRecord) {
      return sendError(res, 400, 'INVALID_OTP');
    }

    // Delete rather than just flag verified, so the same code can't be replayed.
    await Otp.deleteOne({ _id: otpRecord._id });

    // If a user with this email already exists, mark them verified and hand
    // back a token - this is what actually logs a freshly-registered (or
    // previously-unverified) email account in for the first time.
    const user = await User.findOneAndUpdate({ email }, { isVerified: true }, { new: true });

    if (!user) {
      return res.json({ message: 'OTP verified successfully' });
    }

    res.json({
      message: 'OTP verified successfully',
      token: generateToken(user),
      user: formatUser(user),
    });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Login/Register with Google
// @route   POST /api/auth/google
// @access  Public
const googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    // Same guard as registerUser: don't let an undefined `email` collapse to {}
    // and match every document.
    let user = await User.findOne({
      $or: [googleId ? { googleId } : null, email ? { email } : null].filter(Boolean),
    });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      user = await User.create({
        name,
        email,
        googleId,
        authProvider: 'google',
        role: 'other', // placeholder - must be completed via /api/users/complete-profile
        profileCompleted: false,
        profilePicture: { url: picture || '', publicId: '' },
        isVerified: true,
      });
    } else if (!user.googleId) {
      user.googleId = googleId;
      user.authProvider = 'google';
      await user.save();
    }

    res.json({
      token: generateToken(user),
      user: formatUser(user),
      isNewUser, // frontend uses this to decide whether to show "Complete Profile"
    });
  } catch (err) {
    sendError(res, 401, 'INVALID_GOOGLE_TOKEN');
  }
};

// ============================================================
// FORGOT PASSWORD (logged out) — OTP-gated, 2 steps
// Step 1: /forgot-password -> emails a 6-digit code (purpose 'password_reset')
// Step 2: /reset-password  -> checks the code, saves the new password
// Deliberately separate from /verify-otp, which logs the user in and does not
// check the code's purpose.
// ============================================================

const RESET_CODE_TTL_MS = 5 * 60 * 1000;
const RESET_RESEND_COOLDOWN_MS = 30 * 1000; // matches the app's resend timer
const RESET_MAX_ATTEMPTS = 5;

// Same reply whether or not the email has an account, so this public
// endpoint can't be used to find out who uses BudgetBee
const RESET_SENT_MESSAGE = 'If an account exists for that email, a reset code has been sent.';

// @desc    Send a password reset code
// @route   POST /api/auth/forgot-password
// @access  Public
const forgotPassword = async (req, res) => {
  try {
    const email = (req.body.email || '').toString().trim().toLowerCase();
    if (!email) return sendError(res, 400, 'EMAIL_REQUIRED');

    const user = await User.findOne({ email });
    if (!user) return res.json({ message: RESET_SENT_MESSAGE });

    // One email per cooldown window, so the endpoint can't flood an inbox
    const recent = await Otp.findOne({
      email,
      purpose: 'password_reset',
      createdAt: { $gt: new Date(Date.now() - RESET_RESEND_COOLDOWN_MS) },
    });
    if (recent) return res.json({ message: RESET_SENT_MESSAGE });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    await Otp.deleteMany({ email, purpose: 'password_reset' });
    await Otp.create({
      email,
      code,
      expiresAt: new Date(Date.now() + RESET_CODE_TTL_MS),
      purpose: 'password_reset',
    });
    await sendOtpEmail(email, code);

    res.json({ message: RESET_SENT_MESSAGE });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Reset the password with the emailed code
// @route   POST /api/auth/reset-password
// @access  Public
const resetPassword = async (req, res) => {
  try {
    const email = (req.body.email || '').toString().trim().toLowerCase();
    const code = (req.body.code || '').toString().trim();
    const { newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return sendError(res, 400, 'RESET_FIELDS_REQUIRED');
    }
    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      return sendError(res, 400, 'PASSWORD_TOO_SHORT');
    }

    const otp = await Otp.findOne({ email, purpose: 'password_reset' });
    // The TTL index only sweeps about once a minute, so check expiry here too
    if (!otp || otp.expiresAt < new Date()) {
      return sendError(res, 400, 'CODE_INVALID_OR_EXPIRED');
    }

    if (otp.code !== code) {
      // Atomic increment so parallel guesses all count
      const updated = await Otp.findOneAndUpdate(
        { _id: otp._id },
        { $inc: { attempts: 1 } },
        { new: true }
      );
      if (!updated || updated.attempts >= RESET_MAX_ATTEMPTS) {
        await Otp.deleteOne({ _id: otp._id });
        return sendError(res, 400, 'CODE_TOO_MANY_ATTEMPTS');
      }
      return sendError(res, 400, 'CODE_INVALID');
    }

    const user = await User.findOne({ email });
    if (!user) {
      await Otp.deleteOne({ _id: otp._id });
      return sendError(res, 400, 'CODE_INVALID_OR_EXPIRED');
    }

    user.password = newPassword; // hashed by the pre('save') hook
    user.isVerified = true; // the code proves they own this email
    // Whoever had the old password may still be logged in somewhere: end
    // every existing session (the user logs in again with the new password)
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    await Otp.deleteOne({ _id: otp._id });

    res.json({ message: 'Password reset. Log in with your new password.' });
  } catch (err) {
    serverError(res, err);
  }
};

module.exports = {
  registerUser,
  loginUser,
  sendOtp,
  verifyOtp,
  googleAuth,
  forgotPassword,
  resetPassword,
};