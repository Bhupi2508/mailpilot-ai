#!/usr/bin/env node
/**
 * Validates configuration and checks the email provider WITHOUT sending email.
 * For SMTP this connects and authenticates (EHLO/STARTTLS/AUTH), then quits.
 *
 *   npm run check:provider
 */
require("dotenv").config({ quiet: true });
const { loadConfig, ConfigError } = require("../src/config");
const { createProvider } = require("../src/services/providers");

(async () => {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  config.warnings.forEach((w) => console.warn(`warning: ${w}`));
  console.log(`EMAIL_PROVIDER=${config.emailProvider}`);
  const provider = createProvider(config, { googleOAuth: {} });
  const result = await provider.verify();
  await provider.close?.();
  console.log(`${result.ok ? "OK" : "FAILED"}: ${result.message}`);
  if (config.emailProvider === "gmail") {
    console.log("Gmail tokens are per user: sign in with Google in the app to connect an account.");
  }
  process.exit(result.ok ? 0 : 1);
})();
