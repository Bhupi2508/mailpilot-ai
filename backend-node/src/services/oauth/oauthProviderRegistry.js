/**
 * OAuth provider registry.
 *
 * Maps a provider name (e.g. 'google') to its adapter class instance.
 *
 * To add a new provider (Outlook, Yahoo, Zoho, etc.):
 *   1. Create a provider class that implements the same interface
 *      (getAuthUrl, exchangeCode, refreshAccessToken, getUserProfile).
 *   2. Register it here under its name.
 *
 * Adding a new provider requires no other code changes.
 */
const googleProvider = require("./googleProvider");

const registry = {
  [googleProvider.name]: googleProvider,
};

/**
 * Returns a provider adapter by name.
 * @param {string} name
 * @returns {object}
 */
function getProvider(name) {
  const provider = registry[String(name || "").toLowerCase()];
  if (!provider) {
    throw new Error(`Unsupported OAuth provider: ${name}`);
  }
  return provider;
}

/**
 * Lists all registered provider names.
 */
function listProviders() {
  return Object.keys(registry);
}

module.exports = { getProvider, listProviders, registry };
