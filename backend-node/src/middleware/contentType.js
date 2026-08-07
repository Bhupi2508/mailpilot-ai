/**
 * Content-Type validation middleware.
 *
 * Ensures the request body is either JSON or multipart/form-data (for
 * uploads). Rejects unsupported content types with a 415 status.
 */
const ApiError = require("../utils/ApiError");

const SUPPORTED = ["application/json", "multipart/form-data"];

const validateContentType = (req, res, next) => {
  // Skip validation for GET/HEAD/DELETE requests without a body.
  if (!["POST", "PUT", "PATCH"].includes(req.method)) {
    return next();
  }

  const type = (req.headers["content-type"] || "").split(";")[0].trim();

  // Allow empty body (no content-type) — treat as JSON.
  if (!type) return next();

  if (!SUPPORTED.includes(type)) {
    return next(
      new ApiError(
        415,
        `Unsupported Content-Type: '${type}'. Use 'application/json' or 'multipart/form-data'.`
      )
    );
  }

  next();
};

module.exports = validateContentType;
