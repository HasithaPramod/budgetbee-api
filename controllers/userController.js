const User = require('../models/User');
const { MESSAGES, sendError, serverError } = require('../utils/apiError');
const Otp = require('../models/Otp');
const bcrypt = require('bcryptjs');
const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/uploadToCloudinary');
const sendOtpEmail = require('../utils/sendEmail');
const generateToken = require('../utils/generateToken');
const { deleteModule3Data } = require('../services/module3Cleanup');

// @desc    Get logged-in user's profile
// @route   GET /api/users/profile
// @access  Private
// Profile JSON plus the computed profileComplete flag (same value login returns)
const profileJson = (user) => ({ ...user.toJSON(), profileComplete: user.isProfileComplete() });

// req.user is loaded without the password hash, so ask the DB whether one is
// set (Google users may or may not have added one). The app uses this to know
// what Delete Account must ask for.
const userHasPassword = async (userId) =>
  !!(await User.exists({ _id: userId, password: { $type: 'string' } }));

const getProfile = async (req, res) => {
  res.json({ ...profileJson(req.user), hasPassword: await userHasPassword(req.user._id) });
};

// @desc    Update logged-in user's profile
// @route   PATCH /api/users/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const allowedFields = ['name', 'phone', 'role', 'roles', 'incomeSources'];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    if (updates.roles !== undefined && (!Array.isArray(updates.roles) || updates.roles.length === 0)) {
      return sendError(res, 400, 'WORK_TYPE_REQUIRED');
    }
    if (updates.incomeSources !== undefined && !Array.isArray(updates.incomeSources)) {
      return sendError(res, 400, 'INVALID_INPUT');
    }

    // Load + save (not findByIdAndUpdate) so every nested income source is
    // fully schema-validated before anything is written
    const user = await User.findById(req.user._id);
    user.set(updates);
    await user.save();

    res.json(profileJson(user));
  } catch (err) {
    if (err.name === 'ValidationError') {
      // Model messages that are catalogue codes pass through; enum/cast
      // failures become the generic INVALID_INPUT
      const first = Object.values(err.errors)[0];
      const code = first && MESSAGES[first.message] ? first.message : 'INVALID_INPUT';
      return sendError(res, 400, code);
    }
    if (err.code === 11000) {
      return sendError(res, 400, 'PHONE_IN_USE');
    }
    serverError(res, err);
  }
};

// @desc    Complete profile after first Google sign-in (role + phone)
// @route   PATCH /api/users/complete-profile
// @access  Private
const completeProfile = async (req, res) => {
  try {
    const { role, phone } = req.body;

    const validRoles = [
      'ride_hailing_driver',
      'delivery_rider',
      'freelancer',
      'tutor',
      'home_service_worker',
      'marketplace_seller',
      'other',
    ];

    if (!role || !validRoles.includes(role)) {
      return sendError(res, 400, 'INVALID_ROLE');
    }

    if (phone) {
      const phoneTaken = await User.findOne({ phone, _id: { $ne: req.user._id } });
      if (phoneTaken) {
        return sendError(res, 400, 'PHONE_IN_USE');
      }
    }

    const updates = { role, profileCompleted: true };
    if (phone) updates.phone = phone;

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({
      message: 'Profile completed',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profilePicture: user.profilePicture,
        profileComplete: user.isProfileComplete(),
      },
    });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Upload / replace profile picture
// @route   POST /api/users/profile-picture
// @access  Private
const uploadProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, 400, 'NO_IMAGE');
    }

    const user = await User.findById(req.user._id);

    if (user.profilePicture?.publicId) {
      await deleteFromCloudinary(user.profilePicture.publicId);
    }

    const result = await uploadToCloudinary(req.file.buffer);

    user.profilePicture = { url: result.secure_url, publicId: result.public_id };
    await user.save();

    res.json({ profilePicture: user.profilePicture });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Update security settings (PIN / biometric)
// @route   PATCH /api/users/security
// @access  Private
const updateSecurity = async (req, res) => {
  try {
    const { pinEnabled, biometricEnabled } = req.body;
    const user = await User.findById(req.user._id);

    if (pinEnabled !== undefined) user.security.pinEnabled = pinEnabled;
    if (biometricEnabled !== undefined) user.security.biometricEnabled = biometricEnabled;

    await user.save();
    res.json({ security: user.security });
  } catch (err) {
    serverError(res, err);
  }
};

// ============================================================
// PASSWORD CHANGE / SET — now OTP-gated (2-step) for security
// Step 1: /request  -> validates input, emails a 6-digit code
// Step 2: /confirm  -> verifies the code, then actually saves it
// ============================================================

// @desc    Step 1 - Request to CHANGE an existing password (sends OTP)
// @route   PATCH /api/users/change-password/request
// @access  Private
const requestChangePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return sendError(res, 400, 'PASSWORD_FIELDS_REQUIRED');
    }
    if (newPassword.length < 8) {
      return sendError(res, 400, 'PASSWORD_TOO_SHORT');
    }
    if (!req.user.email) {
      return sendError(res, 400, 'EMAIL_REQUIRED_FOR_VERIFICATION');
    }

    const user = await User.findById(req.user._id).select('+password');

    if (!user.password) {
      return sendError(res, 400, 'NO_PASSWORD_YET');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return sendError(res, 401, 'CURRENT_PASSWORD_INCORRECT');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await Otp.deleteMany({ email: user.email, purpose: 'password_change' });
    await Otp.create({
      email: user.email,
      code,
      expiresAt,
      purpose: 'password_change',
      payload: { userId: user._id.toString(), newPasswordHash },
    });
    await sendOtpEmail(user.email, code);

    res.json({ message: 'A verification code was sent to your email. Confirm it to complete the password change.' });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Step 2 - Confirm the password change with the emailed OTP
// @route   PATCH /api/users/change-password/confirm
// @access  Private
const confirmChangePassword = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return sendError(res, 400, 'CODE_REQUIRED');

    const otpRecord = await Otp.findOne({
      email: req.user.email,
      code,
      purpose: 'password_change',
    });

    if (!otpRecord) {
      return sendError(res, 400, 'CODE_INVALID_OR_EXPIRED');
    }
    if (otpRecord.payload?.userId !== req.user._id.toString()) {
      return sendError(res, 403, 'CODE_WRONG_ACCOUNT');
    }

    // Update the password directly with the pre-hashed value —
    // findByIdAndUpdate does NOT trigger the pre('save') hook, so it won't be double-hashed.
    // Bumping tokenVersion logs out every other device.
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { password: otpRecord.payload.newPasswordHash, $inc: { tokenVersion: 1 } },
      { new: true }
    );
    await Otp.deleteOne({ _id: otpRecord._id });

    // Fresh token so THIS device stays logged in (its old one is now invalid)
    res.json({ message: 'Password changed successfully', token: generateToken(user) });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Step 1 - Request to SET a password for the first time (Google users) (sends OTP)
// @route   PATCH /api/users/set-password/request
// @access  Private
const requestSetPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return sendError(res, 400, 'PASSWORD_TOO_SHORT');
    }
    if (!req.user.email) {
      return sendError(res, 400, 'EMAIL_REQUIRED_FOR_VERIFICATION');
    }

    const user = await User.findById(req.user._id).select('+password');
    if (user.password) {
      return sendError(res, 400, 'PASSWORD_ALREADY_SET');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await Otp.deleteMany({ email: user.email, purpose: 'password_change' });
    await Otp.create({
      email: user.email,
      code,
      expiresAt,
      purpose: 'password_change',
      payload: { userId: user._id.toString(), newPasswordHash },
    });
    await sendOtpEmail(user.email, code);

    res.json({ message: 'A verification code was sent to your email. Confirm it to finish setting your password.' });
  } catch (err) {
    serverError(res, err);
  }
};

// ============================================================
// EMAIL CHANGE — OTP-gated (2-step), same pattern as password change
// Step 1: /request  -> validates new email, emails a 6-digit code to the NEW address
// Step 2: /confirm  -> verifies the code, then actually updates the email
// ============================================================

// @desc    Step 1 - Request email change (sends OTP to the NEW email)
// @route   PATCH /api/users/change-email/request
// @access  Private
const requestChangeEmail = async (req, res) => {
  try {
    const { newEmail } = req.body;

    if (!newEmail) {
      return sendError(res, 400, 'NEW_EMAIL_REQUIRED');
    }

    // Basic email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return sendError(res, 400, 'INVALID_EMAIL');
    }

    // Check if the new email is the same as the current one
    if (req.user.email && req.user.email.toLowerCase() === newEmail.toLowerCase()) {
      return sendError(res, 400, 'SAME_EMAIL');
    }

    // Check if the new email is already taken by another user
    const emailTaken = await User.findOne({ email: newEmail.toLowerCase(), _id: { $ne: req.user._id } });
    if (emailTaken) {
      return sendError(res, 400, 'EMAIL_IN_USE');
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Remove any previous email-change OTPs for this user
    await Otp.deleteMany({ purpose: 'email_change', 'payload.userId': req.user._id.toString() });

    await Otp.create({
      email: newEmail.toLowerCase(),
      code,
      expiresAt,
      purpose: 'email_change',
      payload: { userId: req.user._id.toString(), newEmail: newEmail.toLowerCase() },
    });
    await sendOtpEmail(newEmail, code);

    res.json({
      message: 'A verification code was sent to your new email. Enter it to confirm the change.',
      email: newEmail,
    });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Step 2 - Confirm email change with OTP
// @route   PATCH /api/users/change-email/confirm
// @access  Private
const confirmChangeEmail = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) return sendError(res, 400, 'CODE_REQUIRED');

    // Find the OTP record for this user's pending email change
    const otpRecord = await Otp.findOne({
      code,
      purpose: 'email_change',
      'payload.userId': req.user._id.toString(),
    });

    if (!otpRecord) {
      return sendError(res, 400, 'CODE_INVALID_OR_EXPIRED');
    }

    const newEmail = otpRecord.payload.newEmail;

    // Double-check the email is still available (race condition guard)
    const emailTaken = await User.findOne({ email: newEmail, _id: { $ne: req.user._id } });
    if (emailTaken) {
      await Otp.deleteOne({ _id: otpRecord._id });
      return sendError(res, 400, 'EMAIL_IN_USE');
    }

    // Update the user's email
    const user = await User.findByIdAndUpdate(
      req.user._id,
      { email: newEmail },
      { new: true, runValidators: true }
    );

    await Otp.deleteOne({ _id: otpRecord._id });

    res.json({
      message: 'Email updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        profilePicture: user.profilePicture,
      },
    });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Update data-sharing preferences
// @route   PATCH /api/users/data-sharing
// @access  Private
const updateDataSharing = async (req, res) => {
  try {
    const { shareWithLender, shareWithFamily, anonymousUsageData } = req.body;
    const user = await User.findById(req.user._id);

    if (shareWithLender !== undefined) user.dataSharing.shareWithLender = shareWithLender;
    if (shareWithFamily !== undefined) user.dataSharing.shareWithFamily = shareWithFamily;
    if (anonymousUsageData !== undefined) user.dataSharing.anonymousUsageData = anonymousUsageData;

    await user.save();
    res.json({ dataSharing: user.dataSharing });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Update language preference
// @route   PATCH /api/users/language
// @access  Private
const updateLanguage = async (req, res) => {
  try {
    const { language } = req.body;
    if (!['en', 'si', 'ta'].includes(language)) {
      return sendError(res, 400, 'INVALID_LANGUAGE');
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { language },
      { new: true }
    );

    res.json({ language: user.language });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Update FCM token (for push notifications - used later by Module 4)
// @route   PUT /api/users/fcm-token
// @access  Private
const updateFcmToken = async (req, res) => {
  try {
    const { fcmToken } = req.body;
    await User.findByIdAndUpdate(req.user._id, { fcmToken });
    res.json({ message: 'FCM token updated' });
  } catch (err) {
    serverError(res, err);
  }
};

// @desc    Permanently delete the logged-in user's account
// @route   DELETE /api/users/account
// @access  Private
// Re-confirmed server-side, never trusted to the app's dialog alone:
//   accounts with a password  -> body { password } must match
//   Google-only (no password) -> body { code } emailed by /account/delete-request
const DELETE_CODE_TTL_MS = 5 * 60 * 1000;
const DELETE_RESEND_COOLDOWN_MS = 30 * 1000;
const DELETE_MAX_ATTEMPTS = 5;

// @desc    Step 1 for accounts without a password: email a code that
//          confirms the account owner really wants to delete it
// @route   POST /api/users/account/delete-request
// @access  Private
const requestAccountDeletion = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+password');
    if (user.password) {
      return sendError(res, 400, 'USE_PASSWORD_INSTEAD');
    }
    if (!user.email) {
      return sendError(res, 400, 'EMAIL_REQUIRED_FOR_VERIFICATION');
    }

    // One email per cooldown window (resend button taps, double taps)
    const recent = await Otp.findOne({
      email: user.email,
      purpose: 'account_delete',
      createdAt: { $gt: new Date(Date.now() - DELETE_RESEND_COOLDOWN_MS) },
    });
    if (!recent) {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await Otp.deleteMany({ email: user.email, purpose: 'account_delete' });
      await Otp.create({
        email: user.email,
        code,
        expiresAt: new Date(Date.now() + DELETE_CODE_TTL_MS),
        purpose: 'account_delete',
        payload: { userId: user._id.toString() },
      });
      await sendOtpEmail(user.email, code);
    }

    res.json({ message: 'A verification code was sent to your email.' });
  } catch (err) {
    serverError(res, err);
  }
};

// Checks the emailed deletion code. Returns an error code, or null if valid.
const checkDeletionCode = async (user, rawCode) => {
  const code = (rawCode || '').toString().trim();
  if (!code) return 'CODE_REQUIRED';

  const otp = await Otp.findOne({ email: user.email, purpose: 'account_delete' });
  // TTL index sweeps only about once a minute, so check expiry here too
  if (!otp || otp.expiresAt < new Date() || otp.payload?.userId !== user._id.toString()) {
    return 'CODE_INVALID_OR_EXPIRED';
  }
  if (otp.code !== code) {
    // Atomic increment so parallel guesses all count
    const updated = await Otp.findOneAndUpdate({ _id: otp._id }, { $inc: { attempts: 1 } }, { new: true });
    if (!updated || updated.attempts >= DELETE_MAX_ATTEMPTS) {
      await Otp.deleteOne({ _id: otp._id });
      return 'CODE_TOO_MANY_ATTEMPTS';
    }
    return 'CODE_INVALID';
  }
  return null;
};

const deleteAccount = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('+password');

    if (user.password) {
      const { password } = req.body || {};
      if (!password) {
        return sendError(res, 400, 'DELETE_PASSWORD_REQUIRED');
      }
      if (!(await user.matchPassword(password))) {
        // 403, not 401: a wrong password here must not look like a dead session
        return sendError(res, 403, 'PASSWORD_INCORRECT');
      }
    } else {
      // No password to ask for: prove it with the code emailed to the owner
      const codeError = await checkDeletionCode(user, (req.body || {}).code);
      if (codeError) return sendError(res, 400, codeError);
    }

    if (user.profilePicture?.publicId) {
      try {
        await deleteFromCloudinary(user.profilePicture.publicId);
      } catch (_) {
        // Orphaned image is not worth blocking the deletion over
      }
    }
    if (user.email) await Otp.deleteMany({ email: user.email });
    await deleteModule3Data(user._id);

    // NOTE: when Modules 2 and 4 land (transactions, ...), delete this
    // user's records here too before removing the user
    await User.deleteOne({ _id: user._id });

    res.json({ message: 'Account deleted' });
  } catch (err) {
    serverError(res, err);
  }
};

module.exports = {
  getProfile,
  updateProfile,
  completeProfile,
  uploadProfilePicture,
  updateSecurity,
  requestChangePassword,
  confirmChangePassword,
  requestSetPassword,
  requestChangeEmail,
  confirmChangeEmail,
  updateDataSharing,
  updateLanguage,
  updateFcmToken,
  requestAccountDeletion,
  deleteAccount,
};