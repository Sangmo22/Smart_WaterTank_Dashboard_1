const express = require('express');
const router = express.Router();
const { predictUsage, predictUsageSchema } = require('../controllers/predictController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

// Protect all routes in this router
router.use(protect);

router.post('/usage', validate(predictUsageSchema), predictUsage);

module.exports = router;
