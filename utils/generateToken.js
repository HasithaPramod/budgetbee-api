const jwt = require('jsonwebtoken');

// User ekakata JWT token ekak generate karanawa — login/register/google-auth walin call karanawa.
// `tv` is the user's tokenVersion: bumping it (password change/reset) makes
// every token issued before that invalid — see authMiddleware.
const generateToken = (user) => {
  return jwt.sign({ id: user._id, tv: user.tokenVersion || 0 }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d',
  });
};

module.exports = generateToken;
