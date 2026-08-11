const express = require('express');
const router = express.Router({ mergeParams: true });
const { addReading, getReadings, postReadingSchema, getReadingsQuerySchema } = require('../controllers/readingController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

// Protect all routes in this nested router
router.use(protect);

router.route('/')
  .post(validate(postReadingSchema), addReading)
  .get(validate(getReadingsQuerySchema, 'query'), getReadings);

module.exports = router;
