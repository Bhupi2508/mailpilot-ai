const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { setup, mockProvider, idemKey, waitForBatch, registerUser } = require("./helpers");
const { ProviderError } = require("../src/services/providers/errors");

const email = (overrides = {}) => ({
  to: ["Jane Doe <jane@example.com>", "bob@example.com", "carol@example.com"],
  cc: ["manager@example.com"],
  bcc: ["archive@example.com"],
  subject: "Hello {{first_name|there}}",
  body: "<p>Hi {{first_name|there}}</p>",
  body_type: "html",
  ...overrides,
});

test("auth: register, me, logout, login, wrong password", async (t) => {
  const s = await setup({ provider: mockProvider() });
  t.after(() => s.cleanup());
  const { email: addr, password } = await registerUser(s.client, "Alice@Example.com");

  const me = await s.client.get("/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.user.email, "alice@example.com");
  assert.equal(me.body.user.password_hash, undefined, "never expose the password hash");

  const cookie = (await s.newClient().post("/api/auth/login").send({ email: addr, password })).headers["set-cookie"][0];
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Lax/i);

  assert.equal((await s.client.post("/api/auth/logout")).status, 204);
  assert.equal((await s.client.get("/api/auth/me")).body.user, null);

  assert.equal((await s.client.post("/api/auth/login").send({ email: addr, password: "wrong-password" })).status, 401);
  assert.equal((await s.client.post("/api/auth/login").send({ email: "nobody@example.com", password })).status, 401);
  assert.equal((await s.client.post("/api/auth/register").send({ email: addr, password })).status, 409);
  assert.equal((await s.client.post("/api/auth/register").send({ email: "x@example.com", password: "short" })).status, 422);

  const row = await s.db.get("SELECT password_hash FROM users WHERE email = ?", [addr.toLowerCase()]);
  assert.match(row.password_hash, /^\$2[aby]\$/, "stored as a bcrypt hash");
});

test("security: CSRF header required, auth required, registration can be disabled", async (t) => {
  const s = await setup({ provider: mockProvider(), env: { ALLOW_REGISTRATION: "false" } });
  t.after(() => s.cleanup());
  const noHeader = await s.client.agent.post("/api/auth/demo");
  assert.equal(noHeader.status, 403);
  assert.equal(noHeader.body.error.code, "csrf_failed");
  assert.equal((await s.client.get("/api/emails/batches")).status, 401);
  assert.equal((await s.client.post("/api/emails/send").send(email())).status, 401);
  assert.equal((await s.client.post("/api/auth/register").send({ email: "a@example.com", password: "password123" })).status, 403);
  const cfg = await s.client.get("/api/config");
  assert.equal(cfg.body.auth.registration, false);
  assert.ok(!/secret|"pass"|smtp_|host/i.test(JSON.stringify(cfg.body)), "config endpoint must not expose secrets");
});

test("auth rate limiting", async (t) => {
  const s = await setup({ provider: mockProvider(), env: { RATE_LIMIT_AUTH_MAX: "3" } });
  t.after(() => s.cleanup());
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await s.client.post("/api/auth/login").send({ email: "a@x.com", password: "x" })).status);
  assert.deepEqual(statuses, [401, 401, 401, 429]);
});

test("send: N recipients become N individual messages; CC/BCC on each; history has no shared lists", async (t) => {
  const provider = mockProvider();
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  await registerUser(s.client);

  const res = await s.client.post("/api/emails/send").set("Idempotency-Key", idemKey()).send(email());
  assert.equal(res.status, 202);
  assert.equal(res.body.batch.total, 3);
  const batch = await waitForBatch(s.client, res.body.batch.id);

  assert.equal(batch.status, "completed");
  assert.equal(batch.counts.accepted, 3);
  assert.equal(provider.sent.length, 3);
  const tos = provider.sent.map((x) => x.message.to.map((a) => a.address));
  assert.deepEqual(tos.sort(), [["bob@example.com"], ["carol@example.com"], ["jane@example.com"]]);
  for (const { message } of provider.sent) {
    assert.deepEqual(message.cc.map((a) => a.address), ["manager@example.com"]);
    assert.deepEqual(message.bcc.map((a) => a.address), ["archive@example.com"]);
  }
  const jane = provider.sent.find((x) => x.message.to[0].address === "jane@example.com");
  assert.equal(jane.message.subject, "Hello Jane");
  assert.deepEqual(batch.deliveries.map((d) => d.email), ["jane@example.com", "bob@example.com", "carol@example.com"]);
});

test("send: validation errors are reported per field", async (t) => {
  const s = await setup({ provider: mockProvider() });
  t.after(() => s.cleanup());
  await registerUser(s.client);
  const res = await s.client
    .post("/api/emails/send")
    .set("Idempotency-Key", idemKey())
    .send({ to: ["bad-address"], subject: "", body: "" });
  assert.equal(res.status, 422);
  const fields = res.body.error.details.map((d) => d.field);
  assert.deepEqual(fields.sort(), ["body", "subject", "to"]);
  const noKey = await s.client.post("/api/emails/send").send(email());
  assert.equal(noKey.status, 400);
  assert.equal(noKey.body.error.code, "idempotency_key_required");
});

test("partial failure: one rejected recipient does not fail the others; transient errors are retried", async (t) => {
  const tries = {};
  const provider = mockProvider((m) => {
    const to = m.to[0].address;
    tries[to] = (tries[to] || 0) + 1;
    if (to === "bob@example.com") return new ProviderError("permanent", "550 no such user");
    if (to === "carol@example.com" && tries[to] < 2) return new ProviderError("transient", "451 try later");
    return null;
  });
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  await registerUser(s.client);

  const res = await s.client.post("/api/emails/send").set("Idempotency-Key", idemKey()).send(email());
  const batch = await waitForBatch(s.client, res.body.batch.id);
  const by = Object.fromEntries(batch.deliveries.map((d) => [d.email, d]));
  assert.equal(batch.status, "partial");
  assert.equal(by["jane@example.com"].status, "accepted");
  assert.equal(by["bob@example.com"].status, "failed");
  assert.match(by["bob@example.com"].error, /550/);
  assert.equal(by["carol@example.com"].status, "accepted");
  assert.equal(by["carol@example.com"].attempts, 2);
  assert.equal(tries["bob@example.com"], 1, "permanent failures are not retried");
  assert.equal(batch.canRetry, true);
});

test("transient failures stop after SEND_MAX_ATTEMPTS", async (t) => {
  const provider = mockProvider(() => new ProviderError("transient", "421 busy"));
  const s = await setup({ provider, env: { SEND_MAX_ATTEMPTS: "3" } });
  t.after(() => s.cleanup());
  await registerUser(s.client);
  const res = await s.client.post("/api/emails/send").set("Idempotency-Key", idemKey()).send(email({ to: ["a@example.com"] }));
  const batch = await waitForBatch(s.client, res.body.batch.id);
  assert.equal(batch.deliveries[0].status, "failed");
  assert.equal(batch.deliveries[0].attempts, 3);
  assert.equal(provider.calls, 3);
});

test("fatal provider error skips the rest; unknown outcomes are never retried", async (t) => {
  let n = 0;
  const provider = mockProvider((m) => {
    n += 1;
    if (m.to[0].address === "a@example.com") return new ProviderError("unknown", "connection dropped mid-send");
    if (m.to[0].address === "b@example.com") return new ProviderError("fatal", "SMTP authentication failed.", { code: "auth_failed" });
    return null;
  });
  const s = await setup({ provider, env: { SEND_CONCURRENCY: "1" } });
  t.after(() => s.cleanup());
  await registerUser(s.client);
  const res = await s.client
    .post("/api/emails/send")
    .set("Idempotency-Key", idemKey())
    .send(email({ to: ["a@example.com", "b@example.com", "c@example.com", "d@example.com"], cc: [], bcc: [] }));
  const batch = await waitForBatch(s.client, res.body.batch.id);
  assert.deepEqual(
    batch.deliveries.map((d) => d.status),
    ["unknown", "failed", "skipped", "skipped"]
  );
  assert.equal(n, 2, "nothing is attempted after a fatal error");
  assert.match(batch.deliveries[2].error, /^Not attempted/);
  assert.equal(batch.status, "failed");
});

test("idempotency: same key + same email replays; same key + different email conflicts", async (t) => {
  const provider = mockProvider();
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  await registerUser(s.client);
  const key = idemKey();

  const first = await s.client.post("/api/emails/send").set("Idempotency-Key", key).send(email());
  const again = await s.client.post("/api/emails/send").set("Idempotency-Key", key).send(email());
  assert.equal(first.status, 202);
  assert.equal(again.status, 200);
  assert.equal(again.headers["idempotent-replayed"], "true");
  assert.equal(again.body.batch.id, first.body.batch.id);

  const conflict = await s.client.post("/api/emails/send").set("Idempotency-Key", key).send(email({ subject: "Different" }));
  assert.equal(conflict.status, 409);

  await waitForBatch(s.client, first.body.batch.id);
  assert.equal(provider.sent.length, 3, "replayed request must not send again");
  const count = await s.db.get("SELECT COUNT(*) AS n FROM batches");
  assert.equal(Number(count.n), 1);
});

test("retry re-sends only failed deliveries", async (t) => {
  let failBob = true;
  const provider = mockProvider((m) => (m.to[0].address === "bob@example.com" && failBob ? new ProviderError("permanent", "550") : null));
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  await registerUser(s.client);
  const res = await s.client.post("/api/emails/send").set("Idempotency-Key", idemKey()).send(email());
  await waitForBatch(s.client, res.body.batch.id);

  failBob = false;
  const retry = await s.client.post(`/api/emails/batches/${res.body.batch.id}/retry`);
  assert.equal(retry.status, 202);
  assert.equal(retry.body.requeued, 1);
  const batch = await waitForBatch(s.client, res.body.batch.id);
  assert.equal(batch.status, "completed");
  assert.equal(provider.sent.filter((x) => x.message.to[0].address === "jane@example.com").length, 1, "accepted ones are not resent");
  assert.equal((await s.client.post(`/api/emails/batches/${res.body.batch.id}/retry`)).status, 409);
});

test("attachments: validated, attached to every message, deleted after the batch completes", async (t) => {
  const provider = mockProvider();
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  await registerUser(s.client);

  const bad = await s.client
    .post("/api/emails/send")
    .set("Idempotency-Key", idemKey())
    .field("to", "a@example.com")
    .field("subject", "Files")
    .field("body", "See attached")
    .field("body_type", "text")
    .attach("attachments", Buffer.from("MZ..."), "invoice.pdf");
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error.code, "invalid_attachments");

  const res = await s.client
    .post("/api/emails/send")
    .set("Idempotency-Key", idemKey())
    .field("to", "a@example.com")
    .field("to", "b@example.com")
    .field("subject", "Files")
    .field("body", "See attached")
    .field("body_type", "text")
    .attach("attachments", Buffer.from("%PDF-1.4 hello"), "invoice.pdf")
    .attach("attachments", Buffer.from("col1,col2\n1,2"), "data.csv");
  assert.equal(res.status, 202, JSON.stringify(res.body));
  const batch = await waitForBatch(s.client, res.body.batch.id);
  assert.equal(batch.status, "completed");
  for (const { message } of provider.sent) {
    assert.deepEqual(message.attachments.map((a) => a.filename), ["invoice.pdf", "data.csv"]);
    assert.equal(message.text, "See attached");
  }
  assert.equal(fs.existsSync(path.join(s.config.attachmentsDir, batch.id)), false, "files deleted after completion");
  assert.equal(batch.attachmentsAvailable, false);
});

test("users cannot see each other's batches", async (t) => {
  const s = await setup({ provider: mockProvider() });
  t.after(() => s.cleanup());
  await registerUser(s.client);
  const res = await s.client.post("/api/emails/send").set("Idempotency-Key", idemKey()).send(email());
  const other = s.newClient();
  await registerUser(other);
  assert.equal((await other.get(`/api/emails/batches/${res.body.batch.id}`)).status, 404);
  assert.equal((await other.post(`/api/emails/batches/${res.body.batch.id}/retry`)).status, 404);
  assert.equal((await other.get("/api/emails/batches")).body.batches.length, 0);
});

test("history list, search, filters and stats", async (t) => {
  const s = await setup({ provider: mockProvider() });
  t.after(() => s.cleanup());
  await registerUser(s.client);
  const a = await s.client.post("/api/emails/send").set("Idempotency-Key", idemKey()).send(email({ subject: "Quarterly 100% update" }));
  const b = await s.client.post("/api/emails/send").set("Idempotency-Key", idemKey()).send(email({ subject: "Invitation" }));
  await waitForBatch(s.client, a.body.batch.id);
  await waitForBatch(s.client, b.body.batch.id);

  const all = await s.client.get("/api/emails/batches");
  assert.equal(all.body.pagination.total, 2);
  assert.equal(all.body.batches[0].counts.accepted, 3);
  const found = await s.client.get("/api/emails/batches?search=100%25");
  assert.deepEqual(found.body.batches.map((x) => x.subject), ["Quarterly 100% update"]);
  assert.equal((await s.client.get("/api/emails/batches?status=completed")).body.pagination.total, 2);
  assert.equal((await s.client.get("/api/emails/batches?status=bogus")).status, 422);

  const stats = await s.client.get("/api/emails/stats");
  assert.equal(stats.body.batches, 2);
  assert.equal(stats.body.accepted, 6);
  assert.equal(stats.body.last24h, 6);
});

test("preview renders one recipient's message and sends nothing", async (t) => {
  const provider = mockProvider();
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  await registerUser(s.client);
  const res = await s.client.post("/api/emails/preview").send({ ...email(), index: 0, attachments: [{ filename: "a.pdf" }] });
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 3);
  assert.equal(res.body.message.subject, "Hello Jane");
  assert.deepEqual(res.body.message.to.map((a) => a.address), ["jane@example.com"]);
  assert.deepEqual(res.body.message.attachments, ["a.pdf"]);
  assert.equal(provider.calls, 0);
  assert.equal(Number((await s.db.get("SELECT COUNT(*) AS n FROM batches")).n), 0);
});

test("daily recipient quota", async (t) => {
  const s = await setup({ provider: mockProvider(), env: { MAX_RECIPIENTS_PER_DAY: "4" } });
  t.after(() => s.cleanup());
  await registerUser(s.client);
  assert.equal((await s.client.post("/api/emails/send").set("Idempotency-Key", idemKey()).send(email())).status, 202);
  const over = await s.client.post("/api/emails/send").set("Idempotency-Key", idemKey()).send(email());
  assert.equal(over.status, 429);
  assert.equal(over.body.error.code, "quota_exceeded");
});

test("concurrency is bounded by SEND_CONCURRENCY", async (t) => {
  const provider = mockProvider(null, { delayMs: 30 });
  const s = await setup({ provider, env: { SEND_CONCURRENCY: "2", MAX_TO: "20" } });
  t.after(() => s.cleanup());
  await registerUser(s.client);
  const to = Array.from({ length: 10 }, (_, i) => `r${i}@example.com`);
  const res = await s.client.post("/api/emails/send").set("Idempotency-Key", idemKey()).send(email({ to, cc: [], bcc: [] }));
  await waitForBatch(s.client, res.body.batch.id);
  assert.equal(provider.sent.length, 10);
  assert.ok(provider.maxInFlight <= 2, `max in flight was ${provider.maxInFlight}`);
});

test("restart: in-flight deliveries become 'unknown', queued ones resume", async (t) => {
  const s1 = await setup({ provider: mockProvider(), startQueue: false });
  await registerUser(s1.client);
  const res = await s1.client
    .post("/api/emails/send")
    .set("Idempotency-Key", idemKey())
    .send(email({ to: ["a@example.com", "b@example.com"], cc: [], bcc: [] }));
  const id = res.body.batch.id;
  // Simulate a crash while the first delivery was being sent.
  await s1.db.run("UPDATE deliveries SET status = 'sending', attempts = 1 WHERE recipient_email = 'a@example.com'");
  await s1.queue.stop();

  const provider = mockProvider();
  const s2 = await setup({ provider, db: s1.db });
  t.after(() => s2.cleanup());
  s2.client.agent.jar = s1.client.agent.jar;
  const batch = await waitForBatch(s2.client, id);
  const by = Object.fromEntries(batch.deliveries.map((d) => [d.email, d.status]));
  assert.deepEqual(by, { "a@example.com": "unknown", "b@example.com": "accepted" });
  assert.deepEqual(provider.sent.map((x) => x.message.to[0].address), ["b@example.com"]);
});

test("demo mode: demo login and simulated results with deterministic failures", async (t) => {
  const s = await setup();
  t.after(() => s.cleanup());
  assert.equal((await s.client.get("/api/config")).body.simulated, true);
  const login = await s.client.post("/api/auth/demo");
  assert.equal(login.status, 200);
  assert.equal(login.body.user.isDemo, true);
  const res = await s.client
    .post("/api/emails/send")
    .set("Idempotency-Key", idemKey())
    .send(email({ to: ["ok@example.com", "no@fail.example", "slow@flaky.example"] }));
  assert.equal(res.body.batch.simulated, true);
  const batch = await waitForBatch(s.client, res.body.batch.id);
  assert.deepEqual(batch.deliveries.map((d) => d.status), ["accepted", "failed", "accepted"]);
});

test("health and unknown routes", async (t) => {
  const s = await setup({ provider: mockProvider() });
  t.after(() => s.cleanup());
  assert.equal((await s.client.get("/health")).body.status, "ok");
  assert.equal((await s.client.get("/api/nope")).status, 404);
  const bad = await s.client.post("/api/auth/login").set("Content-Type", "application/json").send("{not json");
  assert.equal(bad.status, 400);
});

test("status endpoints are exempt from the general rate limit, other routes are not", async (t) => {
  const s = await setup({ provider: mockProvider(), env: { RATE_LIMIT_MAX: "3" } });
  t.after(() => s.cleanup());
  for (let i = 0; i < 8; i++) {
    assert.equal((await s.client.get("/api/config")).status, 200);
    assert.equal((await s.client.get("/api/auth/me")).status, 200);
  }
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push((await s.client.get("/api/emails/batches")).status);
  assert.ok(codes.includes(429), `expected a 429 among ${codes}`);
});
