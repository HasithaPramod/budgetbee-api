const express = require('express');
const router = express.Router();
const { getVersionInfo } = require('../controllers/appController');

// Public - checked on app start, before login
router.get('/version', getVersionInfo);

module.exports = router;
