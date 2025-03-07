const express = require('express');
const router = express.Router();
const seoController = require('../controllers/seo.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Apply auth middleware to all SEO routes
router.use(authMiddleware);

// Define routes with their handlers
router.post('/start', seoController.startSEO);
router.get('/status', seoController.getSEOStatus);
router.post('/stop', seoController.stopSEO);
router.get('/products', seoController.getAllProducts);

module.exports = router; 