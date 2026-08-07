/**
 * Email provider factory.
 *
 * Resolves the correct provider for a given user and optional preference.
 *
 * Resolution strategy:
 *   1. If the caller explicitly requests a provider name (options.provider),
 *      return that provider.
 *   2. Otherwise, prefer the user's connected Gmail account (Gmail API) when
 *      available, falling back to SMTP.
 *
 * To add a new provider, create a provider class and register it in the
 * `providers` map below.
 */
const smtpProvider = require("./smtpProvider");
const gmailApiProvider = require("./gmailApiProvider");

const providers = {
  smtp: smtpProvider,
  gmail_api: gmailApiProvider,
  // Add future providers here, e.g.:
  // outlook: require("./outlookProvider"),
};

/**
 * Returns a provider by name.
 * @param {string} name
 */
function getProvider(name) {
  const provider = providers[String(name || "").toLowerCase()];
  if (!provider) {
    throw new Error(`Unsupported email provider: ${name}`);
  }
  return provider;
}

/**
 * Resolves the best provider for a user.
 * @param {object} user
 * @param {object} opts
 * @param {string} [opts.provider] - Explicit provider preference.
 * @returns {Promise<{provider, options}>}
 */
async function resolveForUser(user, opts = {}) {
  if (opts.provider) {
    return { provider: getProvider(opts.provider), options: opts };
  }

  // Prefer Gmail API when the user has a connected Gmail account.
  const connectedAccountModel = require("../../models/connectedAccountModel");
  const gmail = await connectedAccountModel.findActiveByUserAndProvider(
    user.id,
    "google"
  );
  if (gmail) {
    return {
      provider: getProvider("gmail_api"),
      options: { ...opts, accountId: gmail.id },
    };
  }

  // Fallback to SMTP (only if configured).
  return { provider: getProvider("smtp"), options: opts };
}

module.exports = { getProvider, resolveForUser, providers };
