/**
 * Gmail API provider: sends through the signed-in user's own Gmail account
 * (users.messages.send) using their OAuth token. The RFC 822 message is built
 * by Nodemailer's MailComposer and uploaded as-is.
 */
const MailComposer = require("nodemailer/lib/mail-composer");
const { ProviderError } = require("./errors");

// Media upload accepts raw RFC 822 messages up to 35 MB (attachments included).
const SEND_URL = "https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media";
const PRE_CONNECT = ["ENOTFOUND", "ECONNREFUSED", "EAI_AGAIN"];

function buildRaw(message) {
  return new Promise((resolve, reject) => {
    // keepBcc: Gmail reads the Bcc header from the raw message and removes it.
    const mail = new MailComposer(message).compile();
    mail.keepBcc = true;
    mail.build((err, buf) => (err ? reject(err) : resolve(buf)));
  });
}

function classifyHttp(status, body, retryAfter) {
  const reason = body?.error?.errors?.[0]?.reason || body?.error?.status || "";
  const detail = `Gmail API ${status}${reason ? ` (${reason})` : ""}`;
  const retryAfterMs = Number(retryAfter) > 0 ? Number(retryAfter) * 1000 : undefined;
  if (status === 401) return new ProviderError("fatal", "Gmail rejected the access token. Sign in with Google again.", { code: "auth_failed" });
  if (status === 429 || (status === 403 && /rateLimit/i.test(reason))) {
    return new ProviderError("transient", `${detail}: rate limited.`, { code: "rate_limited", retryAfterMs });
  }
  if (status === 403 && /dailyLimit|quota/i.test(reason)) {
    return new ProviderError("fatal", `${detail}: sending quota exhausted.`, { code: "quota_exceeded" });
  }
  if (status === 403) return new ProviderError("fatal", `${detail}: permission denied.`, { code: "forbidden" });
  if (status === 503) return new ProviderError("transient", `${detail}: service unavailable.`, { code: "unavailable", retryAfterMs });
  if (status >= 500) return new ProviderError("unknown", `${detail}: server error; delivery state unknown.`, { code: "server_error" });
  return new ProviderError("permanent", `${detail}: message rejected.`, { code: "rejected" });
}

function createGmailProvider({ googleOAuth, fetchImpl = fetch }) {
  return {
    name: "gmail",
    simulated: false,
    async verify() {
      return { ok: true, message: "Gmail API mode: each user sends from their own connected Google account." };
    },
    /** ctx.accountId identifies the sender's connected Google account. */
    async send(message, ctx) {
      const token = await googleOAuth.getAccessToken(ctx.accountId);
      const raw = await buildRaw({ ...message, from: message.from || ctx.sender });
      let res;
      try {
        res = await fetchImpl(SEND_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "message/rfc822" },
          body: raw,
        });
      } catch (err) {
        const code = err.cause?.code;
        if (PRE_CONNECT.includes(code)) {
          throw new ProviderError("transient", `Could not reach the Gmail API (${code}).`, { code: "connection_failed" });
        }
        throw new ProviderError("unknown", "Network error while calling the Gmail API; delivery state unknown.", {
          code: "connection_lost",
        });
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw classifyHttp(res.status, body, res.headers.get("retry-after"));
      return { messageId: body.id };
    },
    async close() {},
  };
}

module.exports = { createGmailProvider, buildRaw, classifyHttp };
