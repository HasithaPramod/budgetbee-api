const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  sendOtp,
  verifyOtp,
  googleAuth,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/google', googleAuth);

// Forgot password (logged out): code by email, then reset with it
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

module.exports = router;