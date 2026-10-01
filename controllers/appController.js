// App-level info the mobile app needs before anything else (no login).
// Values live in .env so a forced update or a new store link needs no deploy
// of app code — only an env change + server restart.
//
//   APP_MIN_VERSION     oldest app build still allowed, e.g. 1.2.0 (default 1.0.0)
//   APP_LATEST_VERSION  newest published build (default = APP_MIN_VERSION)
//   APP_STORE_URL       store listing opened by "Update now"

// @desc    Minimum/latest app version + store link
// @route   GET /api/app/version
// @access  Public
const getVersionInfo = (req, res) => {
  const minVersion = process.env.APP_MIN_VERSION || '1.0.0';
  res.json({
    minVersion,
    latestVersion: process.env.APP_LATEST_VERSION || minVersion,
    storeUrl: process.env.APP_STORE_URL || '',
  });
};

module.exports = { getVersionInfo };
