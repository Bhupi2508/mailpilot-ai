const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, mockProvider, lastOtp, registerUser } = require("./helpers");

const creds = (email) => ({ email, password: "correct-horse-battery", name: "Pat Example" });
const noCooldown = { OTP_RESEND_COOLDOWN_SECONDS: "0" };
const userCount = async (s, email) => Number((await s.db.get("SELECT COUNT(*) AS n FROM users WHERE email = ?", [email])).n);
const isVerified = async (s, email) => Number((await s.db.get("SELECT email_verified AS v FROM users WHERE email = ?", [email])).v) === 1;

test("1-2. register emails a code; correct code verifies the account and signs in", async (t) => {
  const provider = mockProvider();
  const s = await setup({ provider });
  t.after(() => s.cleanup());

  const reg = await s.client.post("/api/auth/register").send(creds("pat@example.com"));
  assert.equal(reg.status, 202);
  assert.equal(reg.body.verification.expiresInSeconds, 120, "OTP lives 2 minutes");
  assert.equal(reg.body.verification.demoCode, undefined, "the code is never returned outside demo mode");
  assert.equal(provider.otps.length, 1);
  assert.equal(provider.otps[0].to, "pat@example.com");
  assert.match(provider.otps[0].text, /\b\d{6}\b/);
  assert.equal(provider.sent.length, 0, "verification mail is not recipient mail");

  // No session yet, and the account is unverified.
  assert.equal((await s.client.get("/api/auth/me")).body.user, null);
  assert.equal(await isVerified(s, "pat@example.com"), false);

  // The code is stored hashed, never in plaintext.
  const code = lastOtp(provider, "pat@example.com");
  const row = await s.db.get("SELECT * FROM email_otps");
  assert.ok(!Object.values(row).some((v) => String(v) === code), "plaintext code must not be stored");
  assert.match(row.code_hash, /^[0-9a-f]{64}$/);

  const ok = await s.client.post("/api/auth/verify-otp").send({ email: "pat@example.com", code });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.email, "pat@example.com");
  assert.equal((await s.client.get("/api/auth/me")).body.user.email, "pat@example.com");
  assert.equal(await isVerified(s, "pat@example.com"), true);
  assert.equal(await s.db.get("SELECT * FROM email_otps"), undefined, "code is invalidated after use");

  // Single use: replaying the code is rejected.
  const replay = await s.newClient().post("/api/auth/verify-otp").send({ email: "pat@example.com", code });
  assert.equal(replay.status, 409);
});

test("3. wrong code fails, and attempts are capped (brute-force protection)", async (t) => {
  const provider = mockProvider();
  const s = await setup({ provider, env: { ...noCooldown, OTP_MAX_ATTEMPTS: "3" } });
  t.after(() => s.cleanup());
  await s.client.post("/api/auth/register").send(creds("pat@example.com"));
  const real = lastOtp(provider, "pat@example.com");
  const wrong = real === "000000" ? "111111" : "000000";

  const first = await s.client.post("/api/auth/verify-otp").send({ email: "pat@example.com", code: wrong });
  assert.equal(first.status, 400);
  assert.equal(first.body.error.code, "otp_invalid");
  assert.match(first.body.error.message, /2 attempts left/);
  await s.client.post("/api/auth/verify-otp").send({ email: "pat@example.com", code: wrong });
  const third = await s.client.post("/api/auth/verify-otp").send({ email: "pat@example.com", code: wrong });
  assert.match(third.body.error.message, /Request a new code/);

  // Locked: even the right code is refused until a new one is requested.
  const locked = await s.client.post("/api/auth/verify-otp").send({ email: "pat@example.com", code: real });
  assert.equal(locked.status, 429);
  assert.equal(locked.body.error.code, "otp_locked");
  assert.equal(await isVerified(s, "pat@example.com"), false);

  // A fresh code unlocks verification.
  assert.equal((await s.client.post("/api/auth/resend-otp").send({ email: "pat@example.com" })).status, 202);
  const fresh = lastOtp(provider, "pat@example.com");
  assert.equal((await s.client.post("/api/auth/verify-otp").send({ email: "pat@example.com", code: fresh })).status, 200);
});

test("parallel guesses cannot exceed the attempt cap", async (t) => {
  const provider = mockProvider();
  const s = await setup({ provider, env: { OTP_MAX_ATTEMPTS: "3" } });
  t.after(() => s.cleanup());
  await s.client.post("/api/auth/register").send(creds("pat@example.com"));
  const real = lastOtp(provider, "pat@example.com");
  const wrong = real === "000000" ? "111111" : "000000";
  const results = await Promise.all(
    Array.from({ length: 8 }, () => s.newClient().post("/api/auth/verify-otp").send({ email: "pat@example.com", code: wrong }))
  );
  assert.equal(results.filter((r) => r.status === 400).length, 3);
  assert.equal(results.filter((r) => r.status === 429).length, 5);
});

test("4. an expired code is rejected server-side and the account stays unverified", async (t) => {
  const provider = mockProvider();
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  await s.client.post("/api/auth/register").send(creds("pat@example.com"));
  const code = lastOtp(provider, "pat@example.com");
  await s.db.run("UPDATE email_otps SET expires_at = ?", [new Date(Date.now() - 1000).toISOString()]);

  const res = await s.client.post("/api/auth/verify-otp").send({ email: "pat@example.com", code });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "otp_expired");
  assert.equal(await isVerified(s, "pat@example.com"), false);
  assert.equal((await s.client.get("/api/auth/me")).body.user, null);
});

test("5. registering again with the same unverified email restarts verification without duplicates", async (t) => {
  const provider = mockProvider();
  const s = await setup({ provider, env: noCooldown });
  t.after(() => s.cleanup());
  await s.client.post("/api/auth/register").send(creds("pat@example.com"));
  const oldCode = lastOtp(provider, "pat@example.com");

  const again = await s.client.post("/api/auth/register").send({ ...creds("pat@example.com"), password: "a-different-password" });
  assert.equal(again.status, 202);
  assert.equal(provider.otps.length, 2, "a fresh code was emailed");
  assert.equal(await userCount(s, "pat@example.com"), 1, "no duplicate account");

  const newCode = lastOtp(provider, "pat@example.com");
  if (newCode !== oldCode) {
    const stale = await s.client.post("/api/auth/verify-otp").send({ email: "pat@example.com", code: oldCode });
    assert.equal(stale.status, 400, "the old code stops working");
  }
  assert.equal((await s.client.post("/api/auth/verify-otp").send({ email: "pat@example.com", code: newCode })).status, 200);

  // The most recently submitted password is the one that works.
  const login = await s.newClient().post("/api/auth/login").send({ email: "pat@example.com", password: "a-different-password" });
  assert.equal(login.status, 200);
  // Once verified, registering again is a conflict.
  assert.equal((await s.client.post("/api/auth/register").send(creds("pat@example.com"))).status, 409);
});

test("resend cooldown and hourly cap are enforced by the server", async (t) => {
  const provider = mockProvider();
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  await s.client.post("/api/auth/register").send(creds("pat@example.com"));

  const tooSoon = await s.client.post("/api/auth/resend-otp").send({ email: "pat@example.com" });
  assert.equal(tooSoon.status, 429);
  assert.equal(tooSoon.body.error.code, "otp_cooldown");
  assert.ok(tooSoon.body.error.details[0].retryAfterSeconds > 0);
  assert.equal(provider.otps.length, 1, "no email was sent during the cooldown");

  // Registering during the cooldown reuses the code that is already out instead of emailing again.
  const reg = await s.client.post("/api/auth/register").send(creds("pat@example.com"));
  assert.equal(reg.status, 202);
  assert.equal(reg.body.verification.sent, false);
  assert.equal(provider.otps.length, 1);

  const capped = await setup({ provider: mockProvider(), env: { ...noCooldown, OTP_MAX_SENDS_PER_HOUR: "2" } });
  t.after(() => capped.cleanup());
  await capped.client.post("/api/auth/register").send(creds("a@example.com"));
  assert.equal((await capped.client.post("/api/auth/resend-otp").send({ email: "a@example.com" })).status, 202);
  const third = await capped.client.post("/api/auth/resend-otp").send({ email: "a@example.com" });
  assert.equal(third.status, 429);
  assert.equal(third.body.error.code, "otp_resend_limit");
});

test("6-7. unverified accounts cannot log in; verified accounts can", async (t) => {
  const provider = mockProvider();
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  await s.client.post("/api/auth/register").send(creds("pat@example.com"));

  const blocked = await s.newClient().post("/api/auth/login").send({ email: "pat@example.com", password: "correct-horse-battery" });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, "email_not_verified");
  assert.match(blocked.body.error.message, /verif/i);
  assert.ok(!blocked.headers["set-cookie"], "no session is issued");

  // A wrong password must not reveal that the account exists.
  const wrong = await s.newClient().post("/api/auth/login").send({ email: "pat@example.com", password: "nope-nope-nope" });
  assert.equal(wrong.status, 401);

  await registerUser(s.newClient(), "other@example.com", "another-good-password");
  const ok = await s.newClient().post("/api/auth/login").send({ email: "other@example.com", password: "another-good-password" });
  assert.equal(ok.status, 200);
});

test("a failed verification email gives the cooldown back and sends no valid code", async (t) => {
  const provider = mockProvider();
  provider.failOtp = true;
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  const reg = await s.client.post("/api/auth/register").send(creds("pat@example.com"));
  assert.equal(reg.status, 503);
  assert.equal(reg.body.error.code, "otp_send_failed");

  provider.failOtp = false;
  const retry = await s.client.post("/api/auth/resend-otp").send({ email: "pat@example.com" });
  assert.equal(retry.status, 202, "can retry immediately");
  assert.equal(provider.otps.length, 1);
});

test("resend for unknown or verified emails reveals nothing and sends nothing", async (t) => {
  const provider = mockProvider();
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  await registerUser(s.newClient(), "done@example.com");
  const before = provider.otps.length;
  for (const email of ["nobody@example.com", "done@example.com"]) {
    const res = await s.client.post("/api/auth/resend-otp").send({ email });
    assert.equal(res.status, 202);
  }
  assert.equal(provider.otps.length, before);
  assert.equal((await s.client.post("/api/auth/resend-otp").send({ email: "not-an-email" })).status, 422);
  assert.equal((await s.client.post("/api/auth/verify-otp").send({ email: "nobody@example.com", code: "123456" })).status, 400);
  assert.equal((await s.client.post("/api/auth/verify-otp").send({ email: "nobody@example.com", code: "12ab" })).status, 422);
});

test("demo mode shows the code in the response instead of emailing it", async (t) => {
  const s = await setup(); // real demo provider
  t.after(() => s.cleanup());
  const reg = await s.client.post("/api/auth/register").send(creds("pat@example.com"));
  assert.equal(reg.status, 202);
  assert.match(reg.body.verification.demoCode, /^\d{6}$/);
  const ok = await s.client.post("/api/auth/verify-otp").send({ email: "pat@example.com", code: reg.body.verification.demoCode });
  assert.equal(ok.status, 200);
});

test("cleanup removes old codes and long-abandoned unverified registrations only", async (t) => {
  const provider = mockProvider();
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  await s.client.post("/api/auth/register").send(creds("old@example.com"));
  await s.client.post("/api/auth/register").send(creds("fresh@example.com"));
  const { id } = await s.db.get("SELECT id FROM users WHERE email = 'old@example.com'");
  const longAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000).toISOString();
  await s.db.run("UPDATE users SET updated_at = ? WHERE id = ?", [longAgo, id]);
  await s.db.run("UPDATE email_otps SET expires_at = ? WHERE user_id = ?", [longAgo, id]);
  const verified = await registerUser(s.newClient(), "verified@example.com");
  await s.db.run("UPDATE users SET updated_at = ? WHERE email = ?", [longAgo, verified.email]);

  await s.otpService.sweep();
  assert.equal(await userCount(s, "old@example.com"), 0);
  assert.equal(await userCount(s, "fresh@example.com"), 1);
  assert.equal(await userCount(s, "verified@example.com"), 1, "verified accounts are never swept");
  assert.equal(Number((await s.db.get("SELECT COUNT(*) AS n FROM email_otps")).n), 1);
});
