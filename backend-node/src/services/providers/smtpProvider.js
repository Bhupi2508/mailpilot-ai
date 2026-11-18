/**
 * Generic SMTP provider (Nodemailer). Works with any SMTP server, including
 * Gmail/Google Workspace (smtp.gmail.com + App Password) and Microsoft 365
 * (smtp.office365.com, where the tenant allows SMTP AUTH). Credentials come
 * from server-side environment variables only.
 */
const nodemailer = require("nodemailer");
const { ProviderError } = require("./errors");
const { smtpPolicy, isSenderAllowed } = require("./senderPolicy");

// Commands that run before any message data is transmitted. A network failure
// during these means the message was certainly not accepted.
const PRE_DATA = /^(CONN|EHLO|HELO|LHLO|STARTTLS|AUTH|MAIL FROM|RCPT TO)/i;
const QUOTA = /quota|rate limit|too many|limit exceeded/i;

function classifySmtpError(err) {
  const rc = Number(err.responseCode) || 0;
  const safe = `SMTP ${rc || err.code || "error"}: ${String(err.response || err.message || "").slice(0, 200)}`;
  if (err.code === "EAUTH" || [530, 534, 535].includes(rc)) {
    return new ProviderError("fatal", "SMTP authentication failed. Check SMTP_USER / SMTP_PASS.", { code: "auth_failed" });
  }
  if (rc >= 400 && rc < 500) return new ProviderError("transient", safe, { code: "deferred" });
  if (rc >= 500) {
    if (QUOTA.test(String(err.response))) return new ProviderError("fatal", safe, { code: "quota_exceeded" });
    return new ProviderError("permanent", safe, { code: "rejected" });
  }
  if (["ECONNECTION", "EDNS", "ETIMEDOUT", "ESOCKET", "ETLS", "ECONNREFUSED"].includes(err.code)) {
    if (!err.command || PRE_DATA.test(err.command)) {
      return new ProviderError("transient", `Could not reach the SMTP server (${err.code}).`, { code: "connection_failed" });
    }
    return new ProviderError(
      "unknown",
      "The connection dropped while sending. The server may or may not have accepted this message.",
      { code: "connection_lost" }
    );
  }
  if (err.code === "EENVELOPE") return new ProviderError("permanent", safe, { code: "rejected" });
  return new ProviderError("unknown", "Unexpected SMTP error; delivery state is unknown.", { code: "unknown" });
}

function createSmtpProvider(smtp, { concurrency = 2, transport } = {}) {
  const transporter =
    transport ||
    nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      requireTLS: !smtp.secure && smtp.requireTls,
      auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
      pool: true,
      maxConnections: concurrency,
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 60000,
      disableFileAccess: false,
      disableUrlAccess: true,
    });
  // The configured sender is the default (used for system mail such as verification codes).
  const defaultFrom = { name: smtp.fromName, address: smtp.fromEmail };
  const policy = smtpPolicy(smtp);

  return {
    name: "smtp",
    simulated: false,
    sender: smtp.fromEmail,
    senderPolicy: () => policy,
    async verify() {
      try {
        await transporter.verify();
        return { ok: true, message: `Connected and authenticated to ${smtp.host}:${smtp.port}.` };
      } catch (err) {
        return { ok: false, message: classifySmtpError(err).message };
      }
    },
    async send(message) {
      const from = message.from || defaultFrom;
      // Defense in depth: never hand the server an unauthorized sender.
      if (!isSenderAllowed(policy, from.address)) {
        throw new ProviderError("permanent", `${from.address} is not an authorized sender for this SMTP account.`, { code: "sender_not_authorized" });
      }
      try {
        const info = await transporter.sendMail({ ...message, from });
        return { messageId: info.messageId, response: info.response };
      } catch (err) {
        throw classifySmtpError(err);
      }
    },
    async close() {
      if (transporter.close) transporter.close();
    },
  };
}

module.exports = { createSmtpProvider, classifySmtpError };
