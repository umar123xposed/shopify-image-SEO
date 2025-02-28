const express = require('express');
const router = express.Router();
const { startSEO, getSEOStatus, stopSEO } = require('../controllers/seo.controller');

router.post('/start', startSEO);
router.get('/status', getSEOStatus);
router.post('/stop', stopSEO);

module.exports = router; 