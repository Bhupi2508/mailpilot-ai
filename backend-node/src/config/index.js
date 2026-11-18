/**
 * Configuration: reads environment variables, applies defaults and validates
 * them. `loadConfig(env)` is pure so tests can build configs without touching
 * process.env. Validation problems are collected and reported together.
 */
const path = require("path");

const BACKEND_ROOT = path.resolve(__dirname, "../..");
const EMAIL_PROVIDERS = ["demo", "smtp", "gmail"];
const SAME_SITE = ["lax", "strict", "none"];

class ConfigError extends Error {
  constructor(problems) {
    super(
      "Invalid configuration:\n" + problems.map((p) => `  - ${p}`).join("\n")
    );
    this.problems = problems;
  }
}

function loadConfig(env = process.env) {
  const problems = [];
  const warnings = [];

  const str = (name, fallback = "") => {
    const v = env[name];
    return v === undefined || v === null ? fallback : String(v).trim();
  };
  const int = (name, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
    const raw = str(name);
    if (raw === "") return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min || n > max) {
      problems.push(`${name} must be an integer between ${min} and ${max} (got "${raw}").`);
      return fallback;
    }
    return n;
  };
  const bool = (name, fallback) => {
    const raw = str(name).toLowerCase();
    if (raw === "") return fallback;
    if (["true", "1", "yes"].includes(raw)) return true;
    if (["false", "0", "no"].includes(raw)) return false;
    problems.push(`${name} must be true or false (got "${raw}").`);
    return fallback;
  };
  const list = (name, fallback) => {
    const raw = str(name);
    if (!raw) return fallback;
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  };
  const resolvePath = (p) => (path.isAbsolute(p) ? p : path.resolve(BACKEND_ROOT, p));

  const nodeEnv = str("NODE_ENV", "development");
  const isProd = nodeEnv === "production";
  const isTest = nodeEnv === "test";

  const appUrl = str("APP_URL", "http://localhost:5173").replace(/\/+$/, "");
  if (!/^https?:\/\/[^/]+/.test(appUrl)) {
    problems.push(`APP_URL must be an absolute http(s) URL (got "${appUrl}").`);
  }

  const corsOrigins = list("CORS_ORIGINS", [appUrl]);
  if (corsOrigins.includes("*")) {
    problems.push("CORS_ORIGINS cannot be '*' because the API uses credentialed cookies. List explicit origins.");
  }

  const dataDir = resolvePath(str("DATA_DIR", "./data"));

  const config = {
    env: nodeEnv,
    isProd,
    isTest,
    port: int("PORT", 3400, { min: 1, max: 65535 }),
    appUrl,
    corsOrigins,
    trustProxy: int("TRUST_PROXY", 0, { min: 0, max: 10 }),
    logLevel: str("LOG_LEVEL", isTest ? "error" : isProd ? "info" : "debug"),
    webDistDir: str("WEB_DIST_DIR") ? resolvePath(str("WEB_DIST_DIR")) : path.resolve(BACKEND_ROOT, "../web-ui/dist"),
    serveWebUi: bool("SERVE_WEB_UI", true),

    db: {
      url: str("DATABASE_URL"),
      sqlitePath: str("SQLITE_PATH") ? resolvePath(str("SQLITE_PATH")) : path.join(dataDir, "mailpilot.db"),
    },
    dataDir,
    attachmentsDir: path.join(dataDir, "attachments"),

    auth: {
      sessionTtlHours: int("SESSION_TTL_HOURS", 168, { min: 1, max: 24 * 90 }),
      cookieSecure: bool("COOKIE_SECURE", isProd),
      cookieSameSite: str("COOKIE_SAMESITE", "lax").toLowerCase(),
      allowRegistration: bool("ALLOW_REGISTRATION", !isProd),
    },

    emailProvider: str("EMAIL_PROVIDER", "demo").toLowerCase(),

    smtp: {
      host: str("SMTP_HOST"),
      port: int("SMTP_PORT", 587, { min: 1, max: 65535 }),
      secure: bool("SMTP_SECURE", false),
      requireTls: bool("SMTP_REQUIRE_TLS", true),
      user: str("SMTP_USER"),
      pass: env.SMTP_PASS === undefined ? "" : String(env.SMTP_PASS),
      fromEmail: str("SMTP_FROM_EMAIL"),
      fromName: str("SMTP_FROM_NAME", "MailPilot AI"),
      // Extra addresses (a@x.com) or whole domains (@x.com) the SMTP account may send as.
      allowedFrom: list("SMTP_ALLOWED_FROM", []).map((v) => v.toLowerCase()),
    },

    otp: {
      ttlSeconds: int("OTP_TTL_SECONDS", 120, { min: 30, max: 900 }),
      resendCooldownSeconds: int("OTP_RESEND_COOLDOWN_SECONDS", 30, { min: 0, max: 600 }),
      maxAttempts: int("OTP_MAX_ATTEMPTS", 5, { min: 1, max: 20 }),
      maxSendsPerHour: int("OTP_MAX_SENDS_PER_HOUR", 5, { min: 1, max: 50 }),
    },

    google: {
      clientId: str("GOOGLE_CLIENT_ID"),
      clientSecret: str("GOOGLE_CLIENT_SECRET"),
      redirectUri: str("GOOGLE_REDIRECT_URI"),
    },
    tokenEncryptionKey: str("TOKEN_ENCRYPTION_KEY"),

    sending: {
      concurrency: int("SEND_CONCURRENCY", 2, { min: 1, max: 20 }),
      delayMs: int("SEND_DELAY_MS", 200, { min: 0, max: 60000 }),
      maxAttempts: int("SEND_MAX_ATTEMPTS", 3, { min: 1, max: 10 }),
      retryBaseMs: int("SEND_RETRY_BASE_MS", 2000, { min: 0, max: 600000 }),
      pollMs: int("QUEUE_POLL_MS", 1000, { min: 50, max: 60000 }),
      demoLatencyMs: int("DEMO_LATENCY_MS", 400, { min: 0, max: 10000 }),
    },

    limits: {
      maxTo: int("MAX_TO", 100, { min: 1, max: 5000 }),
      maxCc: int("MAX_CC", 10, { min: 0, max: 100 }),
      maxBcc: int("MAX_BCC", 10, { min: 0, max: 100 }),
      maxSubjectLength: int("MAX_SUBJECT_LENGTH", 200, { min: 1, max: 998 }),
      maxBodyKb: int("MAX_BODY_KB", 512, { min: 1, max: 10240 }),
      maxRecipientsPerDay: int("MAX_RECIPIENTS_PER_DAY", 500, { min: 1, max: 1000000 }),
    },

    uploads: {
      maxFiles: int("UPLOAD_MAX_FILES", 5, { min: 0, max: 20 }),
      maxFileMb: int("UPLOAD_MAX_FILE_MB", 10, { min: 1, max: 25 }),
      maxTotalMb: int("UPLOAD_MAX_TOTAL_MB", 15, { min: 1, max: 25 }),
      retentionHours: int("ATTACHMENT_RETENTION_HOURS", 24, { min: 0, max: 24 * 30 }),
    },

    rateLimit: {
      windowMinutes: int("RATE_LIMIT_WINDOW_MIN", 15, { min: 1, max: 1440 }),
      max: int("RATE_LIMIT_MAX", 1200, { min: 1, max: 100000 }),
      authMax: int("RATE_LIMIT_AUTH_MAX", 20, { min: 1, max: 10000 }),
      sendPerHour: int("RATE_LIMIT_SEND_PER_HOUR", 30, { min: 1, max: 10000 }),
    },
  };

  // --- Cross-field validation ---------------------------------------------
  if (!SAME_SITE.includes(config.auth.cookieSameSite)) {
    problems.push(`COOKIE_SAMESITE must be one of ${SAME_SITE.join(", ")}.`);
  }
  if (config.auth.cookieSameSite === "none" && !config.auth.cookieSecure) {
    problems.push("COOKIE_SAMESITE=none requires COOKIE_SECURE=true.");
  }
  if (isProd && !config.auth.cookieSecure) {
    warnings.push("COOKIE_SECURE=false in production: session cookies will be sent over plain HTTP.");
  }
  if (config.uploads.maxFileMb > config.uploads.maxTotalMb) {
    problems.push("UPLOAD_MAX_FILE_MB cannot be larger than UPLOAD_MAX_TOTAL_MB.");
  }
  if (config.db.url && !/^postgres(ql)?:\/\//.test(config.db.url)) {
    problems.push("DATABASE_URL must be a postgres:// or postgresql:// URL. Leave it empty to use SQLite.");
  }

  if (!EMAIL_PROVIDERS.includes(config.emailProvider)) {
    problems.push(`EMAIL_PROVIDER must be one of ${EMAIL_PROVIDERS.join(", ")} (got "${config.emailProvider}").`);
  }

  if (config.emailProvider === "smtp") {
    const s = config.smtp;
    if (!s.host) problems.push("EMAIL_PROVIDER=smtp requires SMTP_HOST.");
    if (!s.fromEmail) problems.push("EMAIL_PROVIDER=smtp requires SMTP_FROM_EMAIL.");
    else if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s.fromEmail)) {
      problems.push("SMTP_FROM_EMAIL must be a valid email address.");
    }
    if (Boolean(s.user) !== Boolean(s.pass)) {
      problems.push("Set both SMTP_USER and SMTP_PASS, or neither (for unauthenticated relays).");
    }
    for (const entry of s.allowedFrom) {
      if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(entry) && !/^@([a-z0-9-]+\.)+[a-z]{2,}$/.test(entry)) {
        problems.push(`SMTP_ALLOWED_FROM entry "${entry}" must be an address (a@x.com) or a domain (@x.com).`);
      }
    }
    if (/[\r\n"<>]/.test(s.fromName)) problems.push("SMTP_FROM_NAME must not contain quotes, angle brackets or line breaks.");
  }

  if (config.emailProvider === "gmail") {
    const g = config.google;
    if (!g.clientId) problems.push("EMAIL_PROVIDER=gmail requires GOOGLE_CLIENT_ID.");
    if (!g.clientSecret) problems.push("EMAIL_PROVIDER=gmail requires GOOGLE_CLIENT_SECRET.");
    if (!g.redirectUri) problems.push("EMAIL_PROVIDER=gmail requires GOOGLE_REDIRECT_URI.");
    const key = Buffer.from(config.tokenEncryptionKey || "", "base64");
    if (key.length !== 32) {
      problems.push(
        "EMAIL_PROVIDER=gmail requires TOKEN_ENCRYPTION_KEY: 32 random bytes, base64-encoded. " +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
      );
    }
  }

  if (isProd && config.emailProvider === "demo") {
    warnings.push("EMAIL_PROVIDER=demo in production: no real emails will be sent.");
  }

  // Which sign-in methods are offered depends on the provider.
  config.authMethods = {
    demo: config.emailProvider === "demo",
    password: config.emailProvider !== "gmail",
    google: config.emailProvider === "gmail",
  };

  config.warnings = warnings;
  if (problems.length) throw new ConfigError(problems);
  return config;
}

module.exports = { loadConfig, ConfigError, EMAIL_PROVIDERS };
