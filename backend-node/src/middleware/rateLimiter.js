/**
 * Rate limiting middleware.
 *
 * Applies a general limiter to the API and a stricter limiter to
 * authentication endpoints to deter brute-force attacks.
 */
const rateLimit = require("express-rate-limit");
const config = require("../config");

const createLimiter = (overrides = {}) =>
  rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.max,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: "Too many requests, please try again later.",
    },
    ...overrides,
  });

const apiLimiter = createLimiter();

const authLimiter = createLimiter({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  skipSuccessfulRequests: false,
});

module.exports = {
  apiLimiter,
  authLimiter,
};
