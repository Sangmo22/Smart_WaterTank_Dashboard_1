const express = require('express');
const router = express.Router();
const {
  getTanks,
  getTank,
  createTank,
  updateTank,
  deleteTank,
  createTankSchema,
  updateTankSchema
} = require('../controllers/tankController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');

// Re-route into other resource routers
const readingRouter = require('./readingRoutes');
const pumpRouter = require('./pumpRoutes');

router.use('/:id/readings', readingRouter);
router.use('/:id/pump', pumpRouter);

// Protect all routes in this router
router.use(protect);

router.route('/')
  .get(getTanks)
  .post(validate(createTankSchema), createTank);

router.route('/:id')
  .get(getTank)
  .put(validate(updateTankSchema), updateTank)
  .delete(deleteTank);

module.exports = router;
