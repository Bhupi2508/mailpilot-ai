/**
 * Express application setup.
 *
 * Configures global middleware and wires up the route modules.
 * Only boilerplate is included here — no business logic.
 */
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const morgan = require("morgan");
const swaggerUi = require("swagger-ui-express");

const config = require("./config");
const routes = require("./routes");
const logger = require("./utils/logger");
const sanitizeBody = require("./middleware/sanitize");
const { apiLimiter } = require("./middleware/rateLimiter");
const swaggerSpec = require("./config/swagger");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const app = express();

// Trust proxy so req.ip is correct behind a reverse proxy (needed for rate limiting).
app.set("trust proxy", 1);

// --- Security middleware ---
app.use(helmet());

// --- CORS ---
app.use(
  cors({
    origin: config.corsOrigin === "*" ? "*" : config.corsOrigin.split(","),
    credentials: true,
  })
);

// --- Request logging ---
app.use(
  morgan(config.logFormat, {
    stream: { write: (msg) => logger.http(msg.trim()) },
  })
);

// --- Body parsing ---
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// --- Input sanitization ---
app.use("/api", sanitizeBody);

// --- Compression ---
app.use(compression());

// --- Health check ---
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "MailPilot AI API is running",
    environment: config.env,
  });
});

// --- API docs (Swagger) ---
app.use(
  `${config.apiPrefix}/docs`,
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customCssUrl:
      "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css",
  })
);

// --- Apply general rate limit to API routes ---
app.use(config.apiPrefix, apiLimiter);

// --- API routes ---
app.use(config.apiPrefix, routes);

// --- 404 handler ---
app.use(notFoundHandler);

// --- Centralized error handler ---
app.use(errorHandler);

module.exports = app;
