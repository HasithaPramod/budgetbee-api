const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');
const {
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
} = require('../controllers/userController');

router.get('/profile', protect, getProfile);
router.patch('/profile', protect, updateProfile);
router.patch('/complete-profile', protect, completeProfile);
router.post('/profile-picture', protect, upload.single('image'), uploadProfilePicture);
router.patch('/security', protect, updateSecurity);

// Password change (existing password -> new password), OTP-gated
router.patch('/change-password/request', protect, requestChangePassword);
router.patch('/change-password/confirm', protect, confirmChangePassword);

// Password set (Google users with no password yet), OTP-gated
// Confirms via the SAME /change-password/confirm endpoint (same OTP purpose)
router.patch('/set-password/request', protect, requestSetPassword);

// Email change, OTP-gated
router.patch('/change-email/request', protect, requestChangeEmail);
router.patch('/change-email/confirm', protect, confirmChangeEmail);

router.patch('/data-sharing', protect, updateDataSharing);
router.patch('/language', protect, updateLanguage);
router.put('/fcm-token', protect, updateFcmToken);

// Permanent - re-confirmed with the password, or for accounts without one
// (Google-only) with a code emailed by /account/delete-request
router.post('/account/delete-request', protect, requestAccountDeletion);
router.delete('/account', protect, deleteAccount);

module.exports = router;