const { z } = require('zod');
const Tank = require('../models/Tank');
const PumpLog = require('../models/PumpLog');
const ErrorResponse = require('../utils/errorResponse');
const { sendPumpCommand } = require('../services/thingspeakService');

// Validation Schemas
const setPumpStateSchema = z.object({
  state: z.union([z.literal(0), z.literal(1), z.literal('auto')])
});

// @desc    Get current pump state
// @route   GET /tanks/:id/pump
// @access  Private
const getPumpState = async (req, res, next) => {
  try {
    const tank = await Tank.findOne({ _id: req.params.id, userId: req.user.id });
    if (!tank) {
      return next(new ErrorResponse(`Tank not found with ID: ${req.params.id}`, 404, 'RESOURCE_NOT_FOUND'));
    }

    res.json({
      success: true,
      data: {
        pumpState: tank.pumpState,
        pumpMode: tank.pumpMode
      }
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Set desired pump state and log changes
// @route   POST /tanks/:id/pump
// @access  Private
const setPumpState = async (req, res, next) => {
  try {
    const tank = await Tank.findOne({ _id: req.params.id, userId: req.user.id });
    if (!tank) {
      return next(new ErrorResponse(`Tank not found with ID: ${req.params.id}`, 404, 'RESOURCE_NOT_FOUND'));
    }

    const { state } = req.body;

    const oldMode = tank.pumpMode;
    const oldState = tank.pumpState;

    let newMode;
    let newState;
    let reason = '';

    if (state === 'auto') {
      newMode = 'auto';
      newState = oldState; // Keep the same state, let auto system decide
      reason = 'Switched control mode to AUTO';
    } else {
      newMode = 'manual';
      newState = state;
      reason = `Manually set pump to ${state === 1 ? 'ON' : 'OFF'}`;
    }

    // Log the change and update DB only if state or mode transitioned
    let thingspeakResult = null;

    if (oldMode !== newMode || oldState !== newState) {
      await PumpLog.create({
        tankId: tank._id,
        previousState: `${oldMode === 'manual' ? 'MANUAL' : 'AUTO'} (${oldState === 1 ? 'ON' : 'OFF'})`,
        newState: `${newMode === 'manual' ? 'MANUAL' : 'AUTO'} (${newState === 1 ? 'ON' : 'OFF'})`,
        reason
      });

      tank.pumpMode = newMode;
      tank.pumpState = newState;
      await tank.save();

      // Forward the command to the physical pump via ThingSpeak.
      // Protocol understood by the ESP32 firmware (field THINGSPEAK_PUMP_FIELD):
      //   1 = MANUAL ON, anything else (0) = back to AUTOMATIC mode.
      // Note: there is no "forced OFF" command in the firmware - turning the
      // mode to AUTO lets the on-device thresholds decide when to stop.
      const commandValue = newMode === 'auto' ? 0 : newState;

      thingspeakResult = await sendPumpCommand(commandValue);
      if (!thingspeakResult.forwarded) {
        console.error(`[THINGSPEAK] Pump command (${commandValue}) not delivered: ${thingspeakResult.error}`);
      }
    }

    res.json({
      success: true,
      message:
        thingspeakResult && !thingspeakResult.forwarded
          ? `Pump state saved, but it could not be sent to the device: ${thingspeakResult.error}`
          : 'Pump state configuration successfully updated',
      data: {
        pumpState: tank.pumpState,
        pumpMode: tank.pumpMode,
        thingspeak: thingspeakResult
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getPumpState,
  setPumpState,
  setPumpStateSchema
};
