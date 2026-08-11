const ErrorResponse = require('../utils/errorResponse');

const validate = (schema, source = 'body') => (req, res, next) => {
  try {
    const result = schema.parse(req[source]);
    // Reassign validated and parsed/transformed inputs back to Express context
    req[source] = result;
    next();
  } catch (error) {
    if (error.name === 'ZodError') {
      const formattedErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message
      }));
      return next(new ErrorResponse('Validation Failed', 400, 'VALIDATION_FAILED', formattedErrors));
    }
    next(error);
  }
};

module.exports = validate;
