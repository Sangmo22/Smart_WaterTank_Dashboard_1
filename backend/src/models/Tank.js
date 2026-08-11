const mongoose = require('mongoose');

const TankSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: [true, 'Tank name is required'],
      trim: true
    },
    capacityLiters: {
      type: Number,
      required: [true, 'Capacity in liters is required'],
      min: [0, 'Capacity cannot be negative']
    },
    location: {
      type: String,
      trim: true,
      default: ''
    },
    pumpMode: {
      type: String,
      enum: ['manual', 'auto'],
      default: 'auto'
    },
    pumpState: {
      type: Number,
      enum: [0, 1],
      default: 0
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Tank', TankSchema);
