/**
 * Central configuration module.
 *
 * Loads environment variables via dotenv and exposes a single
 * config object for use across the application.
 */
const dotenv = require("dotenv");

dotenv.config();

/**
 * Parses a duration string like "15m", "1h", "7d" into milliseconds.
 * Falls back to a default in milliseconds.
 *
 * @param {string} str
 * @param {number} fallbackMs
 * @returns {number}
 */
function parseDuration(str, fallbackMs) {
  const match = /^(\d+)\s*(s|m|h|d)?$/.exec(String(str || "").trim());
  if (!match) return fallbackMs;
  const value = parseInt(match[1], 10);
  const unit = match[2] || "h";
  const multipliers = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return value * (multipliers[unit] || multipliers.h);
}

const config = {
  // Server
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT, 10) || 3400,
  apiPrefix: process.env.API_PREFIX || "/api",
  corsOrigin: process.env.CORS_ORIGIN || "*",
  logFormat: process.env.LOG_FORMAT || "dev",

  // MailPilot JWT (access token only — the frontend receives this JWT,
  // never the Google tokens).
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "15m",

  // Rate limiting
  rateLimit: {
    windowMs: parseDuration(
      process.env.RATE_LIMIT_WINDOW || "15m",
      15 * 60 * 1000
    ),
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    authMax: parseInt(process.env.RATE_LIMIT_AUTH_MAX, 10) || 10,
  },

  // OAuth providers
  oauth: {
    // Google (Gmail)
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirectUri:
        process.env.GOOGLE_REDIRECT_URI ||
        "http://localhost:3400/api/auth/google/callback",
      scopes: (
        process.env.GOOGLE_OAUTH_SCOPES ||
        "openid,email,profile,https://www.googleapis.com/auth/gmail.send"
      )
        .split(",")
        .map((s) => s.trim()),
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
    },
    // Frontend base URL for building redirects after OAuth callback.
    frontendUrl: process.env.OAUTH_FRONTEND_URL || "http://localhost:5173",
  },

  // Token encryption (AES-256-GCM). Store a 32-byte key as base64.
  encryption: {
    key: process.env.TOKEN_ENCRYPTION_KEY || "",
  },

  // PostgreSQL
  db: {
    host: process.env.PGHOST || "localhost",
    port: parseInt(process.env.PGPORT, 10) || 5432,
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "",
    database: process.env.PGDATABASE || "mailpilot",
    // Optional connection string (Neon/Railway). If set, it takes
    // precedence over the individual PG* variables.
    connectionString: process.env.DATABASE_URL || "",
  },

  // Optional SMTP fallback for future providers. Only used when a user
  // has no connected OAuth account and SMTP_HOST is configured.
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    fromEmail: process.env.SMTP_FROM_EMAIL || "",
    fromName: process.env.SMTP_FROM_NAME || "MailPilot AI",
  },

  // Uploads — temporary only. Files are deleted immediately after sending.
  uploads: {
    maxSizeMb: parseInt(process.env.UPLOAD_MAX_SIZE_MB, 10) || 10,
    maxFiles: parseInt(process.env.UPLOAD_MAX_FILES, 10) || 5,
    allowedExtensions: (
      process.env.ALLOWED_EXTENSIONS || ".pdf,.doc,.docx,.csv,.txt"
    )
      .split(",")
      .map((e) => e.trim().toLowerCase()),
    allowedMimeTypes: (
      process.env.ALLOWED_MIME_TYPES ||
      "application/pdf,application/msword," +
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
        "text/csv,text/plain"
    )
      .split(",")
      .map((m) => m.trim().toLowerCase()),
  },

  // Email limits
  emailLimits: {
    maxTo: parseInt(process.env.MAX_TO, 10) || 50,
    maxCc: parseInt(process.env.MAX_CC, 10) || 10,
    maxBcc: parseInt(process.env.MAX_BCC, 10) || 10,
    maxSubjectLength: parseInt(process.env.MAX_SUBJECT_LENGTH, 10) || 200,
  },
};

module.exports = config;
module.exports.parseDuration = parseDuration;
