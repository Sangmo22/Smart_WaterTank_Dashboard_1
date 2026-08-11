const ErrorResponse = require('../utils/errorResponse');

const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log full error details on the server console
  console.error('[SERVER ERROR]:', err);

  // Mongoose CastError (invalid ObjectId format)
  if (err.name === 'CastError') {
    const message = `Resource not found with ID: ${err.value}`;
    error = new ErrorResponse(message, 404, 'RESOURCE_NOT_FOUND');
  }

  // Mongoose duplicate unique key (like unique email)
  if (err.code === 11000) {
    const message = 'Resource already exists with this field value';
    error = new ErrorResponse(message, 400, 'RESOURCE_ALREADY_EXISTS');
  }

  // Mongoose validation exceptions
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = new ErrorResponse(message, 400, 'VALIDATION_FAILED', err.errors);
  }

  const statusCode = error.statusCode || 500;
  const errorCode = error.code || 'INTERNAL_ERROR';
  const errorMessage = error.message || 'Server Error';

  res.status(statusCode).json({
    error: {
      code: errorCode,
      message: errorMessage,
      details: error.details || null
    }
  });
};

module.exports = errorHandler;
