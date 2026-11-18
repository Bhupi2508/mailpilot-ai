/**
 * HTTP middleware: session auth, CSRF guard, rate limits, uploads, logging and
 * error handling.
 */
const multer = require("multer");
const rateLimit = require("express-rate-limit");
const ApiError = require("../utils/ApiError");
const { logger } = require("../utils/logger");

const SESSION_COOKIE = "mp_session";
const CLIENT_HEADER = "x-mailpilot-client";

function cookieOptions(config, maxAgeMs) {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: config.auth.cookieSameSite,
    path: "/",
    ...(maxAgeMs !== undefined ? { maxAge: maxAgeMs } : {}),
  };
}

/** Loads req.user from the session cookie (if any). */
function loadSession(authService) {
  return async (req, res, next) => {
    const token = req.cookies?.[SESSION_COOKIE];
    req.sessionToken = token;
    req.user = token ? await authService.userForSession(token) : null;
    next();
  };
}

function requireAuth(req, res, next) {
  if (!req.user) return next(new ApiError(401, "Please sign in to continue."));
  next();
}

/**
 * CSRF protection for cookie-authenticated requests. State-changing requests
 * must carry a custom header. Browsers only let a cross-origin page set custom
 * headers after a CORS preflight, which this API only grants to CORS_ORIGINS.
 * SameSite cookies are a second layer.
 */
function csrfGuard(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  if (!req.get(CLIENT_HEADER)) {
    return next(new ApiError(403, `Missing ${CLIENT_HEADER} header.`, { code: "csrf_failed" }));
  }
  next();
}

function limiter(windowMs, limit, opts = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (req, res, next) => next(new ApiError(429, opts.message || "Too many requests. Please slow down and try again shortly.")),
    ...opts,
  });
}

function rateLimiters(config) {
  const w = config.rateLimit.windowMinutes * 60 * 1000;
  return {
    // Cheap status endpoints the UI calls on every page load must never lock users out.
    api: limiter(w, config.rateLimit.max, {
      skip: (req) => req.method === "GET" && ["/config", "/auth/me", "/health"].includes(req.path),
    }),
    auth: limiter(w, config.rateLimit.authMax, { message: "Too many sign-in attempts. Please wait and try again." }),
    send: limiter(60 * 60 * 1000, config.rateLimit.sendPerHour, {
      keyGenerator: (req) => `user:${req.user.id}`,
      message: "You are sending too often. Please wait before sending another email.",
    }),
  };
}

/** Multipart parser for /emails/send: files kept in memory, then validated. */
function uploadMiddleware(config) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: config.uploads.maxFileMb * 1024 * 1024,
      files: config.uploads.maxFiles,
      fields: 2 * (config.limits.maxTo + config.limits.maxCc + config.limits.maxBcc) + 20,
      fieldSize: (config.limits.maxBodyKb + 16) * 1024,
      fieldNameSize: 50,
    },
  }).array("attachments", Math.max(config.uploads.maxFiles, 1));
  return (req, res, next) => (req.is("multipart/form-data") ? upload(req, res, next) : next());
}

/** Logs method, path (without query string), status and duration. No bodies, no headers. */
function requestLogger(req, res, next) {
  const start = process.hrtime.bigint();
  res.on("finish", () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const line = `${req.method} ${req.originalUrl.split("?")[0]} ${res.statusCode} ${ms.toFixed(0)}ms`;
    if (res.statusCode >= 500) logger.error(line);
    else logger.http ? logger.http(line) : logger.debug(line);
  });
  next();
}

function notFound(req, res, next) {
  next(new ApiError(404, "Not found."));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(config) {
  // eslint-disable-next-line no-unused-vars
  return (err, req, res, next) => {
    let e = err;
    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE: [413, `Each attachment must be at most ${config.uploads.maxFileMb} MB.`],
        LIMIT_FILE_COUNT: [422, `Attach at most ${config.uploads.maxFiles} files.`],
        LIMIT_UNEXPECTED_FILE: [422, `Attach at most ${config.uploads.maxFiles} files, using the "attachments" field.`],
        LIMIT_FIELD_VALUE: [413, `Message is larger than ${config.limits.maxBodyKb} KB.`],
      };
      const [status, message] = messages[err.code] || [400, "The upload could not be processed."];
      e = new ApiError(status, message, { code: "invalid_attachments" });
    } else if (err.type === "entity.parse.failed") {
      e = new ApiError(400, "Request body is not valid JSON.");
    } else if (err.type === "entity.too.large") {
      e = new ApiError(413, "Request body is too large.");
    } else if (!(err instanceof ApiError)) {
      logger.error("unhandled error", { path: req.originalUrl.split("?")[0], error: err.message, stack: config.isProd ? undefined : err.stack });
      e = new ApiError(500, "Something went wrong on the server.", { code: "internal_error" });
    }
    res.status(e.status).json({ error: { code: e.code, message: e.message, ...(e.details ? { details: e.details } : {}) } });
  };
}

module.exports = {
  SESSION_COOKIE,
  CLIENT_HEADER,
  cookieOptions,
  loadSession,
  requireAuth,
  csrfGuard,
  rateLimiters,
  uploadMiddleware,
  requestLogger,
  notFound,
  errorHandler,
};
