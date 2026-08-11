const express = require('express');
const router = express.Router({ mergeParams: true });
const { getPumpState, setPumpState, setPumpStateSchema } = require('../controllers/pumpController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

// Protect all routes in this nested router
router.use(protect);

router.route('/')
  .get(getPumpState)
  .post(validate(setPumpStateSchema), setPumpState);

module.exports = router;
