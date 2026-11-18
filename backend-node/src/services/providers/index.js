/**
 * Creates the single email provider selected by EMAIL_PROVIDER.
 * There is deliberately no fallback: if a real provider fails, the delivery
 * fails. Demo (simulated) sending only happens when EMAIL_PROVIDER=demo.
 */
const { createDemoProvider } = require("./demoProvider");
const { createSmtpProvider } = require("./smtpProvider");
const { createGmailProvider } = require("./gmailProvider");

function createProvider(config, { googleOAuth } = {}) {
  switch (config.emailProvider) {
    case "demo":
      return createDemoProvider({ latencyMs: config.sending.demoLatencyMs });
    case "smtp":
      return createSmtpProvider(config.smtp, { concurrency: config.sending.concurrency });
    case "gmail":
      return createGmailProvider({ googleOAuth });
    default:
      throw new Error(`Unsupported EMAIL_PROVIDER "${config.emailProvider}".`);
  }
}

module.exports = { createProvider };
