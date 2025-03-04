const express = require('express');
const router = express.Router();
const { startSEO, getSEOStatus, stopSEO } = require('../controllers/seo.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Apply auth middleware to all SEO routes
router.use(authMiddleware);

router.post('/start', startSEO);
router.get('/status', getSEOStatus);
router.post('/stop', stopSEO);

module.exports = router; 