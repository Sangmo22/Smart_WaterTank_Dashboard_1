const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const tankRoutes = require('./routes/tankRoutes');
const predictRoutes = require('./routes/predictRoutes');
const alertRoutes = require('./routes/alertRoutes');

const errorHandler = require('./middleware/errorHandler');
const ErrorResponse = require('./utils/errorResponse');

const app = express();

// 1. Security Headers
app.use(helmet());

// 2. CORS Configuration for Expo Frontends
const corsOrigin = process.env.CORS_ORIGIN || '*';
const corsOptions = {
  origin: corsOrigin === '*' ? '*' : corsOrigin.split(','),
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: corsOrigin !== '*' // Credentials cannot be true when origin is wildcard
};
app.use(cors(corsOptions));

// 3. Request Logging
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// 4. Body Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Database connection middleware (especially for serverless deployment)
const connectDB = require('./config/db');
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

// 5. Mount API Routes
app.use('/api/tanks', tankRoutes);
app.use('/api/predict', predictRoutes);
app.use('/api', alertRoutes);

// Base route / Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

app.get('/', (req, res) => {
  res.json({ message: 'Smart Water Tank System API is running' });
});

// Catch-all 404 handler for unmatched routes
app.use((req, res, next) => {
  next(new ErrorResponse(`Route not found: ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND'));
});

// 6. Global Exception Error Handler
app.use(errorHandler);

module.exports = app;
