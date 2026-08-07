/**
 * Custom error class for API errors.
 *
 * Carries an HTTP status code and optional list of details.
 */
class ApiError extends Error {
  constructor(
    statusCode,
    message,
    details = null,
    isOperational = true,
    stack = ""
  ) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
    this.isOperational = isOperational;

    if (stack) {
      this.stack = stack;
    } else {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

module.exports = ApiError;
