/**
 * Express app factory. All dependencies are injected so tests can build an app
 * with an in-memory database and a mock provider.
 */
const fs = require("fs");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const compression = require("compression");
const cookieParser = require("cookie-parser");

const { ALLOWED_EXTENSIONS } = require("./services/attachments");
const { TOKENS } = require("./services/messageBuilder");
const mw = require("./middleware");
const { authRoutes } = require("./routes/auth");
const { emailRoutes } = require("./routes/emails");

function createApp({ config, db, provider, authService, otpService, batchService, googleOAuth }) {
  const app = express();
  const limiters = mw.rateLimiters(config);

  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Email previews may reference remote images.
          "img-src": ["'self'", "data:", "https:"],
          "frame-src": ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
      allowedHeaders: ["Content-Type", "Idempotency-Key", mw.CLIENT_HEADER],
      exposedHeaders: ["Idempotent-Replayed"],
    })
  );
  app.use(compression());
  app.use(mw.requestLogger);

  // --- Health ----------------------------------------------------------------
  const health = async (req, res) => {
    try {
      await db.get("SELECT 1 AS ok");
      res.json({ status: "ok", database: db.dialect, emailProvider: provider.name });
    } catch {
      res.status(503).json({ status: "error", database: "unreachable" });
    }
  };
  app.get("/health", health);

  // --- API -------------------------------------------------------------------
  const api = express.Router();
  api.use(limiters.api);
  api.use(express.json({ limit: `${config.limits.maxBodyKb + 64}kb` }));
  api.use(cookieParser());
  api.use(mw.csrfGuard);
  api.use(mw.loadSession(authService));

  api.get("/health", health);
  api.get("/config", (req, res) => {
    res.json({
      emailProvider: provider.name,
      simulated: provider.simulated,
      auth: {
        password: config.authMethods.password,
        registration: config.authMethods.password && config.auth.allowRegistration,
        demo: config.authMethods.demo,
        google: config.authMethods.google,
      },
      limits: config.limits,
      uploads: {
        maxFiles: config.uploads.maxFiles,
        maxFileMb: config.uploads.maxFileMb,
        maxTotalMb: config.uploads.maxTotalMb,
        allowedExtensions: ALLOWED_EXTENSIONS,
      },
      personalizationTokens: TOKENS,
    });
  });
  api.use("/auth", authRoutes({ config, authService, otpService, googleOAuth, limiters }));
  api.use("/emails", emailRoutes({ config, batchService, limiters }));
  api.use(mw.notFound);
  app.use("/api", api);

  // --- Built web UI (optional, for single-service deployments) ---------------
  const indexHtml = path.join(config.webDistDir, "index.html");
  if (config.serveWebUi && fs.existsSync(indexHtml)) {
    app.use(express.static(config.webDistDir, { index: false, maxAge: "1h" }));
    app.get("/{*splat}", (req, res) => res.sendFile(indexHtml));
  }

  app.use(mw.notFound);
  app.use(mw.errorHandler(config));
  return app;
}

module.exports = { createApp };
