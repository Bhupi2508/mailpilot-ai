/**
 * Centralized error handling middleware.
 *
 * - Handles ApiError instances
 * - Handles validation errors
 * - Handles Multer errors
 * - Handles unknown errors gracefully
 */
const config = require("../config");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");

// eslint-disable-next-line no-unused-vars
const notFoundHandler = (req, res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let error = err;

  // Normalize non-ApiError into ApiError
  if (!(error instanceof ApiError)) {
    // Multer / file size errors
    if (error instanceof require("multer").MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        error = new ApiError(
          413,
          `File too large. Maximum allowed size is ${config.uploads.maxSizeMb}MB per file.`
        );
      } else if (error.code === "LIMIT_FILE_COUNT") {
        error = new ApiError(
          400,
          `Too many files. Maximum allowed is ${config.uploads.maxFiles} files.`
        );
      } else {
        error = new ApiError(400, `Upload error: ${error.message}`);
      }
    }
    // Postgres unique constraint violation
    else if (error.code === "23505") {
      error = new ApiError(409, "Resource already exists");
    } else if (error.type === "entity.parse.failed") {
      error = new ApiError(400, "Invalid JSON payload");
    } else if (error.type === "entity.too.large") {
      error = new ApiError(413, "Request body too large.");
    } else {
      const statusCode = error.statusCode || 500;
      error = new ApiError(
        statusCode,
        error.message || "Internal server error"
      );
    }
  }

  const payload = {
    success: false,
    message: error.message,
  };

  if (error.details) {
    payload.details = error.details;
  }

  if (config.env === "development" && error.stack) {
    payload.stack = error.stack;
  }

  if (error.statusCode >= 500) {
    logger.error(`[error] ${error.message}`, { stack: error.stack });
  } else {
    logger.warn(`[warn] ${error.statusCode} ${error.message}`);
  }

  return res.status(error.statusCode || 500).json(payload);
};

module.exports = {
  notFoundHandler,
  errorHandler,
};
