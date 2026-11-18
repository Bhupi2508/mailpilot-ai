const test = require("node:test");
const assert = require("node:assert/strict");
const { setup, mockProvider, idemKey, waitForBatch, registerUser } = require("./helpers");
const { smtpPolicy, isSenderAllowed } = require("../src/services/providers/senderPolicy");

const body = (extra = {}) => ({ to: ["a@example.com", "b@example.com"], subject: "Hi", body: "Hello", body_type: "text", ...extra });
const strict = { mode: "list", addresses: ["shared@corp.example"], domains: ["@allowed.example"] };

test("8. From defaults to the signed-in user's verified email", async (t) => {
  const provider = mockProvider();
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  const { email } = await registerUser(s.client);

  const senders = await s.client.get("/api/emails/senders");
  assert.equal(senders.body.default, email);
  assert.equal(senders.body.defaultAuthorized, true);

  const preview = await s.client.post("/api/emails/preview").send(body());
  assert.equal(preview.body.message.from, `Test User <${email}>`);

  const res = await s.client.post("/api/emails/send").set("Idempotency-Key", idemKey()).send(body());
  const batch = await waitForBatch(s.client, res.body.batch.id);
  assert.equal(batch.sender, email);
  assert.equal(provider.sent.length, 2);
  for (const { message } of provider.sent) assert.deepEqual(message.from, { name: "Test User", address: email });
});

test("9. an authorized custom From is used for every message", async (t) => {
  const provider = mockProvider(null, { policy: strict });
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  await registerUser(s.client);

  const senders = (await s.client.get("/api/emails/senders")).body;
  assert.equal(senders.mode, "list");
  assert.deepEqual(senders.addresses, ["shared@corp.example"]);
  assert.equal(senders.defaultAuthorized, false, "the user's own address is not authorized on this server");

  for (const from of ["shared@corp.example", "Ops Team <ops@allowed.example>", "SHARED@corp.example"]) {
    provider.sent.length = 0;
    const res = await s.client.post("/api/emails/send").set("Idempotency-Key", idemKey()).send(body({ from }));
    assert.equal(res.status, 202, JSON.stringify(res.body));
    const batch = await waitForBatch(s.client, res.body.batch.id);
    assert.equal(batch.status, "completed");
    const expected = from.toLowerCase().replace(/^.*<|>$/g, "");
    assert.ok(provider.sent.length === 2 && provider.sent.every((x) => x.message.from.address === expected), from);
  }
  const named = await s.client.post("/api/emails/preview").send(body({ from: "Ops Team <ops@allowed.example>" }));
  assert.equal(named.body.message.from, "Ops Team <ops@allowed.example>");
});

test("10. an unauthorized or invalid From is rejected before anything is queued", async (t) => {
  const provider = mockProvider(null, { policy: strict });
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  const { email } = await registerUser(s.client);

  // Even the user's own address is rejected when the server doesn't authorize it.
  for (const from of [undefined, email, "ceo@evil.example", "x@allowed.example.evil.com"]) {
    const res = await s.client.post("/api/emails/send").set("Idempotency-Key", idemKey()).send(body({ from }));
    assert.equal(res.status, 422, String(from));
    assert.equal(res.body.error.code, "sender_not_authorized");
    assert.equal(res.body.error.details[0].field, "from");
    assert.match(res.body.error.message, /shared@corp\.example/);
  }
  const invalid = await s.client.post("/api/emails/send").set("Idempotency-Key", idemKey()).send(body({ from: "not-an-email" }));
  assert.equal(invalid.status, 422);
  assert.equal(invalid.body.error.details[0].field, "from");
  assert.equal((await s.client.post("/api/emails/preview").send(body({ from: "ceo@evil.example" }))).status, 422);

  assert.equal(provider.calls, 0);
  assert.equal(Number((await s.db.get("SELECT COUNT(*) AS n FROM batches")).n), 0);
});

test("From is part of idempotency: same key with a different From conflicts", async (t) => {
  const provider = mockProvider(null, { policy: strict });
  const s = await setup({ provider });
  t.after(() => s.cleanup());
  await registerUser(s.client);
  const key = idemKey();
  const first = await s.client.post("/api/emails/send").set("Idempotency-Key", key).send(body({ from: "shared@corp.example" }));
  assert.equal(first.status, 202);
  const same = await s.client.post("/api/emails/send").set("Idempotency-Key", key).send(body({ from: "shared@corp.example" }));
  assert.equal(same.status, 200);
  const other = await s.client.post("/api/emails/send").set("Idempotency-Key", key).send(body({ from: "ops@allowed.example" }));
  assert.equal(other.status, 409);
});

test("sender policy: SMTP allowlist is built from env, domains match exactly", () => {
  const policy = smtpPolicy({ fromEmail: "Me@Corp.Example", user: "apikey", allowedFrom: ["alias@corp.example", "@verified.example"] });
  assert.deepEqual(policy.addresses.sort(), ["alias@corp.example", "me@corp.example"], "a non-address SMTP_USER is ignored");
  assert.equal(isSenderAllowed(policy, "ME@corp.example"), true);
  assert.equal(isSenderAllowed(policy, "anyone@verified.example"), true);
  assert.equal(isSenderAllowed(policy, "anyone@sub.verified.example"), false);
  assert.equal(isSenderAllowed(policy, "anyone@evilverified.example"), false);
  assert.equal(isSenderAllowed(policy, "stranger@elsewhere.example"), false);
  assert.equal(isSenderAllowed({ mode: "any" }, "whoever@anywhere.example"), true);
});
