const mongoose = require('mongoose');

const PumpLogSchema = new mongoose.Schema(
  {
    tankId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tank',
      required: true,
      index: true
    },
    previousState: {
      type: String,
      required: true
    },
    newState: {
      type: String,
      required: true
    },
    reason: {
      type: String,
      default: 'Manual configuration'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }
);

PumpLogSchema.index({ tankId: 1, timestamp: -1 });

module.exports = mongoose.model('PumpLog', PumpLogSchema);
