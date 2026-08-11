const { z } = require('zod');
const Tank = require('../models/Tank');
const ErrorResponse = require('../utils/errorResponse');

// Validation Schemas
const createTankSchema = z.object({
  name: z.string().min(1, 'Name is required').trim(),
  capacityLiters: z.number({ required_error: 'Capacity is required' }).positive('Capacity must be greater than 0'),
  location: z.string().optional().default('')
});

const updateTankSchema = z.object({
  name: z.string().min(1, 'Name cannot be empty').trim().optional(),
  capacityLiters: z.number().positive('Capacity must be greater than 0').optional(),
  location: z.string().optional()
});

// @desc    Get all tanks for user
// @route   GET /tanks
// @access  Private
const getTanks = async (req, res, next) => {
  try {
    const tanks = await Tank.find({ userId: req.user.id });
    res.json({ success: true, count: tanks.length, data: tanks });
  } catch (err) {
    next(err);
  }
};

// @desc    Get tank details
// @route   GET /tanks/:id
// @access  Private
const getTank = async (req, res, next) => {
  try {
    const tank = await Tank.findOne({ _id: req.params.id, userId: req.user.id });
    if (!tank) {
      return next(new ErrorResponse(`Tank not found with ID: ${req.params.id}`, 404, 'RESOURCE_NOT_FOUND'));
    }
    res.json({ success: true, data: tank });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new tank
// @route   POST /tanks
// @access  Private
const createTank = async (req, res, next) => {
  try {
    const { name, capacityLiters, location } = req.body;

    const tank = await Tank.create({
      userId: req.user.id,
      name,
      capacityLiters,
      location
    });

    res.status(201).json({ success: true, data: tank });
  } catch (err) {
    next(err);
  }
};

// @desc    Update tank
// @route   PUT /tanks/:id
// @access  Private
const updateTank = async (req, res, next) => {
  try {
    let tank = await Tank.findOne({ _id: req.params.id, userId: req.user.id });
    if (!tank) {
      return next(new ErrorResponse(`Tank not found with ID: ${req.params.id}`, 404, 'RESOURCE_NOT_FOUND'));
    }

    tank = await Tank.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.json({ success: true, data: tank });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete tank
// @route   DELETE /tanks/:id
// @access  Private
const deleteTank = async (req, res, next) => {
  try {
    const tank = await Tank.findOne({ _id: req.params.id, userId: req.user.id });
    if (!tank) {
      return next(new ErrorResponse(`Tank not found with ID: ${req.params.id}`, 404, 'RESOURCE_NOT_FOUND'));
    }

    await Tank.findByIdAndDelete(req.params.id);

    res.json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getTanks,
  getTank,
  createTank,
  updateTank,
  deleteTank,
  createTankSchema,
  updateTankSchema
};
