const { z } = require('zod');
const Tank = require('../models/Tank');
const TankReading = require('../models/TankReading');
const ErrorResponse = require('../utils/errorResponse');

// Validation Schemas
const postReadingSchema = z.object({
  overheadPercent: z.number().min(0).max(100),
  sourcePercent: z.number().min(0).max(100),
  pumpState: z.union([z.literal(0), z.literal(1)]),
  timestamp: z.preprocess((val) => val ? new Date(val) : undefined, z.date().optional())
});

const getReadingsQuerySchema = z.object({
  from: z.preprocess((val) => val ? new Date(val) : undefined, z.date().optional()),
  to: z.preprocess((val) => val ? new Date(val) : undefined, z.date().optional()),
  page: z.preprocess((val) => val ? parseInt(val) : 1, z.number().min(1)).optional().default(1),
  limit: z.preprocess((val) => val ? parseInt(val) : 50, z.number().min(1).max(500)).optional().default(50)
});

// @desc    Add a tank reading
// @route   POST /tanks/:id/readings
// @access  Private (restricted to tank owner)
const addReading = async (req, res, next) => {
  try {
    const tankId = req.params.id;

    // Check if tank exists and belongs to user
    const tank = await Tank.findOne({ _id: tankId, userId: req.user.id });
    if (!tank) {
      return next(new ErrorResponse(`Tank not found with ID: ${tankId}`, 404, 'RESOURCE_NOT_FOUND'));
    }

    const { overheadPercent, sourcePercent, pumpState, timestamp } = req.body;

    const reading = await TankReading.create({
      tankId,
      overheadPercent,
      sourcePercent,
      pumpState,
      timestamp: timestamp || new Date()
    });

    // Sync state to current tank status cache
    tank.pumpState = pumpState;
    await tank.save();

    res.status(201).json({ success: true, data: reading });
  } catch (err) {
    next(err);
  }
};

// @desc    Get paginated historical readings for a tank
// @route   GET /tanks/:id/readings
// @access  Private (restricted to tank owner)
const getReadings = async (req, res, next) => {
  try {
    const tankId = req.params.id;

    // Check if tank exists and belongs to user
    const tank = await Tank.findOne({ _id: tankId, userId: req.user.id });
    if (!tank) {
      return next(new ErrorResponse(`Tank not found with ID: ${tankId}`, 404, 'RESOURCE_NOT_FOUND'));
    }

    const { from, to, page, limit } = req.query;

    const query = { tankId };

    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = from;
      if (to) query.timestamp.$lte = to;
    }

    // Pagination calculations
    const skip = (page - 1) * limit;
    const total = await TankReading.countDocuments(query);

    const readings = await TankReading.find(query)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      },
      data: readings
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  addReading,
  getReadings,
  postReadingSchema,
  getReadingsQuerySchema
};
