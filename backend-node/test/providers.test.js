const test = require("node:test");
const assert = require("node:assert/strict");
const { SMTPServer } = require("smtp-server");
const { createSmtpProvider, classifySmtpError } = require("../src/services/providers/smtpProvider");
const { createGmailProvider, buildRaw, classifyHttp } = require("../src/services/providers/gmailProvider");
const { createDemoProvider } = require("../src/services/providers/demoProvider");
const { buildMessage } = require("../src/services/messageBuilder");

const content = {
  subject: "Hi {{first_name}}",
  body: "<p>Hello {{first_name}}</p>",
  bodyType: "html",
  cc: [{ name: "", email: "cc@example.com" }],
  bcc: [{ name: "", email: "hidden@example.com" }],
};
const message = buildMessage(content, { name: "Jane", email: "jane@example.com" }, [
  { filename: "a.txt", contentType: "text/plain", content: "attached" },
]);

/** Starts a local SMTP server (port 0 = random) that records what it receives. Nothing leaves this machine. */
async function localSmtp({ rejectRcpt } = {}) {
  const received = [];
  const server = new SMTPServer({
    authOptional: false,
    disabledCommands: ["STARTTLS"],
    onAuth(auth, session, cb) {
      if (auth.username === "user" && auth.password === "pass") return cb(null, { user: "user" });
      cb(Object.assign(new Error("Invalid credentials"), { responseCode: 535 }));
    },
    onRcptTo(address, session, cb) {
      if (rejectRcpt && address.address === rejectRcpt) return cb(Object.assign(new Error("No such user"), { responseCode: 550 }));
      cb();
    },
    onData(stream, session, cb) {
      const chunks = [];
      stream.on("data", (c) => chunks.push(c));
      stream.on("end", () => {
        received.push({ envelope: session.envelope.rcptTo.map((r) => r.address), raw: Buffer.concat(chunks).toString() });
        cb();
      });
    },
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { received, port: server.server.address().port, close: () => new Promise((r) => server.close(r)) };
}

const smtpConfig = (port, overrides = {}) => ({
  host: "127.0.0.1",
  port,
  secure: false,
  requireTls: false,
  user: "user",
  pass: "pass",
  fromEmail: "me@example.com",
  fromName: "Me",
  ...overrides,
});

test("SMTP: real SMTP session delivers one To, visible CC, BCC only in the envelope", async (t) => {
  const srv = await localSmtp();
  const smtp = createSmtpProvider(smtpConfig(srv.port));
  t.after(async () => {
    await smtp.close();
    await srv.close();
  });
  assert.equal((await smtp.verify()).ok, true);
  const res = await smtp.send(message);
  assert.ok(res.messageId);
  const [{ envelope, raw }] = srv.received;
  assert.deepEqual(envelope.sort(), ["cc@example.com", "hidden@example.com", "jane@example.com"]);
  assert.match(raw, /^To: Jane <jane@example\.com>$/m);
  assert.match(raw, /^Cc: cc@example\.com$/m);
  assert.match(raw, /^From: Me <me@example\.com>$/m);
  assert.doesNotMatch(raw, /hidden@example\.com/, "BCC must not appear in the delivered headers");
  assert.match(raw, /filename=a\.txt/);
});

test("SMTP: the recipient receives the chosen From; an unauthorized From never reaches the server", async (t) => {
  const srv = await localSmtp();
  const smtp = createSmtpProvider(smtpConfig(srv.port, { allowedFrom: ["@allowed.example"] }));
  t.after(async () => {
    await smtp.close();
    await srv.close();
  });
  const msg = { ...message, from: { name: "Jane Doe", address: "jane@allowed.example" } };
  await smtp.send(msg);
  const [{ raw }] = srv.received;
  assert.match(raw, /^From: Jane Doe <jane@allowed\.example>$/m);

  await assert.rejects(
    smtp.send({ ...message, from: { name: "", address: "ceo@evil.example" } }),
    (e) => e.kind === "permanent" && e.code === "sender_not_authorized"
  );
  assert.equal(srv.received.length, 1, "the server only saw the authorized message");
});

test("SMTP: bad credentials are fatal; a rejected recipient is permanent", async (t) => {
  const srv = await localSmtp({ rejectRcpt: "jane@example.com" });
  const bad = createSmtpProvider(smtpConfig(srv.port, { pass: "wrong" }));
  const good = createSmtpProvider(smtpConfig(srv.port));
  t.after(async () => {
    await bad.close();
    await good.close();
    await srv.close();
  });
  const check = await bad.verify();
  assert.equal(check.ok, false);
  assert.match(check.message, /authentication failed/);
  await assert.rejects(bad.send(message), (e) => e.kind === "fatal" && e.code === "auth_failed");
  await assert.rejects(good.send({ ...message, cc: [], bcc: [] }), (e) => e.kind === "permanent");
  assert.equal(srv.received.length, 0);
});

test("SMTP: an unreachable server is a safe-to-retry connection failure", async () => {
  const smtp = createSmtpProvider(smtpConfig(1));
  await assert.rejects(smtp.send(message), (e) => e.kind === "transient" && e.code === "connection_failed");
  await smtp.close();
});

test("SMTP: errors are classified so retries are only done when safe", () => {
  const k = (e) => classifySmtpError(e).kind;
  assert.equal(k({ code: "EAUTH", responseCode: 535 }), "fatal");
  assert.equal(k({ responseCode: 451, response: "451 try later" }), "transient");
  assert.equal(k({ responseCode: 550, response: "550 no such user" }), "permanent");
  assert.equal(k({ responseCode: 550, response: "550 Daily sending quota exceeded" }), "fatal");
  assert.equal(k({ code: "ECONNECTION", command: "CONN" }), "transient");
  assert.equal(k({ code: "ETIMEDOUT", command: "DATA" }), "unknown");
  assert.equal(k({ code: "ESOCKET" }), "transient");
  assert.equal(k({ code: "EWHATEVER" }), "unknown");
});

test("Gmail: raw message keeps Bcc header (Gmail strips it) and one To", async () => {
  const raw = (await buildRaw({ ...message, from: "me@gmail.com" })).toString();
  assert.match(raw, /^To: Jane <jane@example\.com>$/m);
  assert.match(raw, /^Bcc: hidden@example\.com$/m);
  assert.match(raw, /^From: me@gmail\.com$/m);
});

test("Gmail: HTTP errors are classified", () => {
  assert.equal(classifyHttp(401, {}).kind, "fatal");
  assert.equal(classifyHttp(429, {}, "3").retryAfterMs, 3000);
  assert.equal(classifyHttp(403, { error: { errors: [{ reason: "dailyLimitExceeded" }] } }).kind, "fatal");
  assert.equal(classifyHttp(400, {}).kind, "permanent");
  assert.equal(classifyHttp(500, {}).kind, "unknown");
  assert.equal(classifyHttp(503, {}).kind, "transient");
});

test("Gmail: sends via the media upload endpoint with the user's token (mocked fetch)", async () => {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    calls.push({ url, opts });
    return { ok: true, status: 200, json: async () => ({ id: "gmail-123" }), headers: new Headers() };
  };
  const gmail = createGmailProvider({ googleOAuth: { getAccessToken: async () => "tok" }, fetchImpl });
  const res = await gmail.send(message, { accountId: "acc", sender: "me@gmail.com" });
  assert.equal(res.messageId, "gmail-123");
  assert.match(calls[0].url, /upload\/gmail\/v1\/users\/me\/messages\/send\?uploadType=media/);
  assert.equal(calls[0].opts.headers.Authorization, "Bearer tok");
  assert.equal(calls[0].opts.headers["Content-Type"], "message/rfc822");
});

test("Demo: simulates success, permanent failure and a retryable failure", async () => {
  const demo = createDemoProvider({ latencyMs: 0 });
  const to = (address) => ({ to: [{ address }] });
  assert.match((await demo.send(to("a@example.com"))).messageId, /^<demo-/);
  await assert.rejects(demo.send(to("a@fail.example")), (e) => e.kind === "permanent");
  await assert.rejects(demo.send(to("a@flaky.example"), { attempt: 1 }), (e) => e.kind === "transient");
  assert.ok(await demo.send(to("a@flaky.example"), { attempt: 2 }));
});
