const mongoose = require('mongoose');

const TankReadingSchema = new mongoose.Schema(
  {
    tankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tank',
      required: true,
      index: true
    },
    overheadPercent: {
      type: Number,
      required: [true, 'Overhead percent is required'],
      min: 0,
      max: 100
    },
    sourcePercent: {
      type: Number,
      required: [true, 'Source percent is required'],
      min: 0,
      max: 100
    },
    pumpState: {
      type: Number,
      required: [true, 'Pump state is required'],
      enum: [0, 1]
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }
);

// Composite index for fast historical querying and pagination
TankReadingSchema.index({ tankId: 1, timestamp: -1 });

module.exports = mongoose.model('TankReading', TankReadingSchema);
