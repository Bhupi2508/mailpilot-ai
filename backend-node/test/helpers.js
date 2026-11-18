/**
 * Test helpers: in-memory SQLite, temp data dir, mock providers that never
 * contact a mail server, and a supertest agent that keeps cookies.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");
const { loadConfig } = require("../src/config");
const { createSqlite } = require("../src/db/sqlite");
const { createPostgres } = require("../src/db/postgres");
const { migrate } = require("../src/db/migrations");
const { buildContainer } = require("../src/container");
const { ProviderError } = require("../src/services/providers/errors");

function testConfig(env = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mailpilot-test-"));
  return loadConfig({
    NODE_ENV: "test",
    DATA_DIR: dataDir,
    SERVE_WEB_UI: "false",
    SEND_DELAY_MS: "0",
    SEND_RETRY_BASE_MS: "0",
    QUEUE_POLL_MS: "50",
    DEMO_LATENCY_MS: "0",
    RATE_LIMIT_AUTH_MAX: "1000",
    RATE_LIMIT_SEND_PER_HOUR: "1000",
    ...env,
  });
}

/** A provider that records messages. `behavior(message, ctx)` may return an Error to throw. */
function mockProvider(behavior, { name = "smtp", delayMs = 5, policy = { mode: "any", addresses: [], domains: [] } } = {}) {
  let inFlight = 0;
  // `otps` holds verification emails (kept apart from `sent`, which is recipient mail).
  const state = { sent: [], calls: 0, maxInFlight: 0, otps: [], failOtp: false };
  return Object.assign(state, {
    name,
    simulated: false,
    sender: "sender@example.com",
    senderPolicy: () => policy,
    async verify() {
      return { ok: true, message: "mock" };
    },
    async send(message, ctx) {
      if (ctx?.purpose === "otp") {
        if (state.failOtp) throw new ProviderError("transient", "mock otp failure");
        state.otps.push({ to: message.to[0].address, subject: message.subject, text: message.text, from: message.from });
        return { messageId: "<otp@test>" };
      }
      state.calls += 1;
      inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, inFlight);
      try {
        await new Promise((r) => setTimeout(r, delayMs));
        const outcome = behavior ? behavior(message, ctx) : null;
        if (outcome instanceof Error) throw outcome;
        state.sent.push({ message, ctx });
        return { messageId: `<mock-${state.sent.length}@test>` };
      } finally {
        inFlight -= 1;
      }
    },
    async close() {},
  });
}

async function setup({ env, provider, startQueue = true, db } = {}) {
  const config = testConfig(env);
  const database = db || (await createTestDb());
  const c = await buildContainer(config, { db: database, provider });
  if (startQueue) await c.queue.start();
  const agent = request.agent(c.app);
  const client = {
    agent,
    get: (url) => agent.get(url),
    post: (url) => agent.post(url).set("x-mailpilot-client", "test"),
    provider: c.provider,
  };
  return {
    ...c,
    client,
    newClient() {
      const a = request.agent(c.app);
      return { agent: a, get: (url) => a.get(url), post: (url) => a.post(url).set("x-mailpilot-client", "test"), provider: c.provider };
    },
    async cleanup() {
      await c.close();
      fs.rmSync(config.dataDir, { recursive: true, force: true });
    },
  };
}

/** In-memory SQLite by default; set TEST_DATABASE_URL to run the suite against PostgreSQL. */
async function createTestDb() {
  const url = process.env.TEST_DATABASE_URL;
  const db = url ? createPostgres(url) : createSqlite(":memory:");
  if (url) await db.exec("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await migrate(db);
  return db;
}

let keyCounter = 0;
const idemKey = () => `test-key-${Date.now()}-${++keyCounter}`;

async function waitForBatch(client, id, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await client.get(`/api/emails/batches/${id}`);
    if (res.body.batch && res.body.batch.status !== "sending") return res.body.batch;
    if (Date.now() > deadline) throw new Error(`batch ${id} still sending: ${JSON.stringify(res.body.batch?.counts)}`);
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** The most recent verification code the mock provider "emailed" to this address. */
function lastOtp(provider, email) {
  const mail = [...provider.otps].reverse().find((m) => m.to === email.toLowerCase());
  const m = mail && /\b(\d{6})\b/.exec(mail.text);
  if (!m) throw new Error(`no verification email for ${email}`);
  return m[1];
}

/** Registers and verifies an account (via the emailed code); the client ends up signed in. */
async function registerUser(client, email = `user${++keyCounter}@example.com`, password = "correct-horse-battery") {
  const reg = await client.post("/api/auth/register").send({ email, password, name: "Test User" });
  if (reg.status !== 202) throw new Error(`register failed: ${reg.status} ${JSON.stringify(reg.body)}`);
  const res = await client.post("/api/auth/verify-otp").send({ email, code: lastOtp(client.provider, email) });
  if (res.status !== 200) throw new Error(`verify failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { email, password, user: res.body.user };
}

module.exports = { testConfig, mockProvider, setup, idemKey, waitForBatch, registerUser, lastOtp };
