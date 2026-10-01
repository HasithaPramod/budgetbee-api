const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendError } = require('../utils/apiError');

// Every "your session is no longer valid" reply carries this code, so the app
// can tell it apart from other 401s (wrong password, bad Google token) and
// send the user back to Login only when the session itself is dead
const SESSION_EXPIRED = 'SESSION_EXPIRED';

// JWT eka verify karala req.user eka set karanawa — wena okkoma modules methana use karanawa
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      req.user = await User.findById(decoded.id).select('-password');

      if (!req.user) {
        return sendError(res, 401, SESSION_EXPIRED);
      }
      // Password changed/reset since this token was issued. Tokens from before
      // tokenVersion existed have no `tv` and count as version 0.
      if ((decoded.tv || 0) !== (req.user.tokenVersion || 0)) {
        return sendError(res, 401, SESSION_EXPIRED);
      }
      return next();
    } catch (err) {
      return sendError(res, 401, SESSION_EXPIRED);
    }
  }

  return sendError(res, 401, SESSION_EXPIRED);
};

// Role-based access (e.g. authorize('admin'))
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return sendError(res, 403, 'FORBIDDEN');
    }
    next();
  };
};

module.exports = { protect, authorize };