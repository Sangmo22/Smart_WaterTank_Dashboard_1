const { z } = require('zod');
const Tank = require('../models/Tank');
const ErrorResponse = require('../utils/errorResponse');

// Validation Schema
const predictUsageSchema = z.object({
  tankId: z.string().refine((val) => /^[0-9a-fA-F]{24}$/.test(val), {
    message: 'Invalid tankId format (must be 24 hex characters)'
  }),
  recentReadings: z.array(
    z.object({
      overheadPercent: z.number().min(0).max(100),
      sourcePercent: z.number().min(0).max(100),
      pumpState: z.union([z.literal(0), z.literal(1)]),
      timestamp: z.string().optional()
    })
  ).min(1, 'At least one recent reading is required'),
  weatherForecast: z.object({
    temp: z.number(),
    humidity: z.number().min(0).max(100),
    rainProbability: z.number().min(0).max(1)
  })
});

// @desc    Predict usage for next 4 hours (ML stub)
// @route   POST /predict/usage
// @access  Private
const predictUsage = async (req, res, next) => {
  try {
    const { tankId, recentReadings, weatherForecast } = req.body;

    // Check if tank exists and belongs to user
    const tank = await Tank.findOne({ _id: tankId, userId: req.user.id });
    if (!tank) {
      return next(new ErrorResponse(`Tank not found with ID: ${tankId}`, 404, 'RESOURCE_NOT_FOUND'));
    }

    const { temp, humidity, rainProbability } = weatherForecast;

    // =========================================================================
    // ML MODEL STUB / HEURISTIC ALGORITHM PLACEHOLDER
    // =========================================================================
    // In a production environment with real ML, you would load a trained model:
    // E.g. using @tensorflow/tfjs-node or onnxruntime-node:
    //
    // const tf = require('@tensorflow/tfjs-node');
    // const model = await tf.loadLayersModel('file://path/to/model.json');
    // const inputTensor = tf.tensor2d([ [ ...features ] ]);
    // const prediction = model.predict(inputTensor);
    // const predictedUsageNext4Hours = prediction.dataSync()[0];
    //
    // Alternatively, you could fetch predictions from an external ML Python service:
    // const mlResponse = await axios.post('https://ml-service/predict', { tankId, ... });
    // =========================================================================

    // Rule-based heuristic implementation:
    let predictedUsage = 0.15; // Base usage (15% of capacity)

    // 1. Temperature Effect (Hot weather increases water usage)
    if (temp > 25) {
      // Add up to 15% based on high temperature (e.g. 40°C adds 15%)
      const tempFactor = Math.min((temp - 25) * 0.01, 0.15);
      predictedUsage += tempFactor;
    }

    // 2. Humidity Effect (Dry air increases consumption)
    if (humidity < 40) {
      predictedUsage += 0.05;
    }

    // 3. Rain Probability (High chance of rain decreases municipal/outdoor consumption)
    if (rainProbability > 0.5) {
      predictedUsage -= 0.08;
    }

    // 4. Trend Effect from recent readings
    // Calculate rate of change in overhead level
    if (recentReadings.length >= 2) {
      const sorted = [...recentReadings].sort((a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      
      const levelDiff = first.overheadPercent - last.overheadPercent; // Positive if level is dropping
      if (levelDiff > 0) {
        // Water is actively being consumed, add trend factor (max +10%)
        predictedUsage += (levelDiff / 100) * 0.1;
      }
    }

    // Clamp value between 0.0 (0%) and 1.0 (100% capacity)
    predictedUsage = Math.max(0.0, Math.min(1.0, parseFloat(predictedUsage.toFixed(4))));

    res.json({
      success: true,
      data: {
        tankId,
        predictedUsageNext4Hours: predictedUsage,
        unit: 'fraction_of_capacity',
        heuristicApplied: true,
        weatherConditions: {
          temp,
          humidity,
          rainProbability
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  predictUsage,
  predictUsageSchema
};
