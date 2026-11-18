const test = require("node:test");
const assert = require("node:assert/strict");
const { loadConfig, ConfigError } = require("../src/config");

const problems = (env) => {
  try {
    loadConfig(env);
    return [];
  } catch (e) {
    assert.ok(e instanceof ConfigError);
    return e.problems.join("\n");
  }
};

test("defaults to demo mode with no configuration", () => {
  const c = loadConfig({});
  assert.equal(c.emailProvider, "demo");
  assert.deepEqual(c.authMethods, { demo: true, password: true, google: false });
  assert.equal(c.db.url, "");
});

test("smtp requires host and sender, and both credentials or neither", () => {
  assert.match(problems({ EMAIL_PROVIDER: "smtp" }), /SMTP_HOST[\s\S]*SMTP_FROM_EMAIL/);
  assert.match(problems({ EMAIL_PROVIDER: "smtp", SMTP_HOST: "h", SMTP_FROM_EMAIL: "a@b.co", SMTP_USER: "u" }), /both SMTP_USER and SMTP_PASS/);
  const ok = loadConfig({ EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.example.com", SMTP_FROM_EMAIL: "me@example.com", SMTP_USER: "u", SMTP_PASS: "p" });
  assert.equal(ok.authMethods.demo, false);
});

test("gmail requires OAuth credentials and a 32-byte encryption key", () => {
  assert.match(problems({ EMAIL_PROVIDER: "gmail" }), /GOOGLE_CLIENT_ID[\s\S]*TOKEN_ENCRYPTION_KEY/);
  const ok = loadConfig({
    EMAIL_PROVIDER: "gmail",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    GOOGLE_REDIRECT_URI: "http://localhost:3400/api/auth/google/callback",
    TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString("base64"),
  });
  assert.deepEqual(ok.authMethods, { demo: false, password: false, google: true });
});

test("rejects unsafe or malformed values", () => {
  assert.match(problems({ CORS_ORIGINS: "*" }), /CORS_ORIGINS/);
  assert.match(problems({ EMAIL_PROVIDER: "sendgrid" }), /EMAIL_PROVIDER/);
  assert.match(problems({ PORT: "abc" }), /PORT/);
  assert.match(problems({ DATABASE_URL: "mysql://x" }), /DATABASE_URL/);
  assert.match(problems({ COOKIE_SAMESITE: "none", COOKIE_SECURE: "false" }), /COOKIE_SECURE/);
});

test("production defaults: secure cookies, registration closed", () => {
  const c = loadConfig({ NODE_ENV: "production" });
  assert.equal(c.auth.cookieSecure, true);
  assert.equal(c.auth.allowRegistration, false);
  assert.ok(c.warnings.some((w) => /demo/.test(w)));
});

test("OTP defaults and SMTP_ALLOWED_FROM validation", () => {
  const c = loadConfig({});
  assert.equal(c.otp.ttlSeconds, 120);
  assert.equal(c.otp.maxAttempts, 5);
  const smtp = { EMAIL_PROVIDER: "smtp", SMTP_HOST: "h", SMTP_FROM_EMAIL: "me@example.com" };
  assert.deepEqual(loadConfig({ ...smtp, SMTP_ALLOWED_FROM: "A@x.com, @y.com" }).smtp.allowedFrom, ["a@x.com", "@y.com"]);
  assert.match(problems({ ...smtp, SMTP_ALLOWED_FROM: "not-valid" }), /SMTP_ALLOWED_FROM/);
  assert.match(problems({ OTP_TTL_SECONDS: "5" }), /OTP_TTL_SECONDS/);
});
