const logger = require('../utils/logger');

/**
 * 404 handler — mounted after all routes.
 */
function notFoundHandler(req, res, _next) {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route not found: ${req.method} ${req.originalUrl}` },
  });
}

/**
 * Centralized error handler — mounted last. Every thrown/forwarded error
 * lands here so response shape stays consistent across the whole API.
 * Controllers should call next(err) rather than building their own error responses.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const status = err.statusCode || err.status || 500;
  const isServerError = status >= 500;

  if (isServerError) {
    logger.error({ err, path: req.originalUrl }, 'Unhandled error');
  } else {
    logger.warn({ err: err.message, path: req.originalUrl }, 'Request error');
  }

  res.status(status).json({
    success: false,
    error: {
      code: err.code || 'INTERNAL_ERROR',
      message: isServerError && process.env.NODE_ENV === 'production'
        ? 'An unexpected error occurred.'
        : err.message,
    },
  });
}

module.exports = { notFoundHandler, errorHandler };
