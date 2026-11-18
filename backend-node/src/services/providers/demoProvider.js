/**
 * Demo provider: SIMULATES delivery and never contacts a mail server.
 *
 * Deterministic outcomes so the UI can show success and failure:
 *   *@fail.example   -> permanent rejection
 *   *@flaky.example  -> temporary failure on the first attempt, then accepted
 *   anything else    -> accepted (simulated)
 */
const crypto = require("crypto");
const { ProviderError } = require("./errors");
const { anyPolicy } = require("./senderPolicy");

function createDemoProvider({ latencyMs = 400 } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  return {
    name: "demo",
    simulated: true,
    senderPolicy: anyPolicy, // nothing is delivered, so any From is fine
    async verify() {
      return { ok: true, message: "Demo mode: messages are simulated and never sent." };
    },
    async send(message, ctx = {}) {
      if (latencyMs) await sleep(latencyMs / 2 + Math.random() * latencyMs);
      const address = message.to[0].address;
      if (address.endsWith("@fail.example")) {
        throw new ProviderError("permanent", "Simulated rejection: mailbox unavailable (550).", { code: "rejected" });
      }
      if (address.endsWith("@flaky.example") && (ctx.attempt || 1) === 1) {
        throw new ProviderError("transient", "Simulated temporary failure (451). Will retry.", { code: "deferred" });
      }
      return { messageId: `<demo-${crypto.randomUUID()}@mailpilot.local>` };
    },
    async close() {},
  };
}

module.exports = { createDemoProvider };
