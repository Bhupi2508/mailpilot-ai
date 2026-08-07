/**
 * OAuth orchestration service.
 *
 * Provider-based, so adding Outlook / Zoho / Yahoo / Microsoft 365 later
 * only requires a new provider adapter + registry entry.
 *
 * Handles:
 *   - Generating provider authorization URLs (state-parameter protected)
 *   - Processing the OAuth callback (exchange code, find-or-create user,
 *     upsert the connected account, store encrypted tokens)
 *   - Retrieving a valid access token for a connected account,
 *     auto-refreshing when expired or near expiry.
 *
 * On success the callback returns ONLY the MailPilot JWT to the frontend —
 * Google tokens never leave the server.
 */
const config = require("../../config");
const ApiError = require("../../utils/ApiError");
const { encrypt, decrypt } = require("../../utils/crypto");
const userModel = require("../../models/userModel");
const connectedAccountModel = require("../../models/connectedAccountModel");
const { getProvider } = require("./oauthProviderRegistry");
const { signAccessToken } = require("../tokenService");

const REFRESH_MARGIN_MS = 60 * 1000; // refresh if within 60s of expiry

class OAuthService {
  /**
   * Builds the authorization URL for a provider.
   * @param {string} providerName
   * @returns {{url: string, state: string}}
   */
  async getAuthUrl(providerName) {
    const provider = this._resolveProvider(providerName);
    const state = provider.generateState
      ? provider.generateState()
      : require("crypto").randomBytes(32).toString("hex");

    const url = provider.getAuthUrl(state);
    return { url, state };
  }

  /**
   * Processes an OAuth callback for a provider.
   *
   * Steps:
   *  1. Exchange the authorization code for tokens + profile.
   *  2. Find-or-create the MailPilot user.
   *  3. Upsert the connected_account (store encrypted tokens).
   *  4. Return the MailPilot JWT access token.
   *
   * @param {string} providerName
   * @param {string} code
   * @returns {Promise<{user, connectedAccount, accessToken, expiresIn}>}
   */
  async handleCallback(providerName, code) {
    const provider = this._resolveProvider(providerName);

    let tokens;
    let profile;
    try {
      const result = await provider.exchangeCode(code);
      tokens = result.tokens;
      profile = result.profile;
    } catch (err) {
      throw new ApiError(
        400,
        `Failed to exchange OAuth code for ${providerName}: ${err.message}`
      );
    }

    if (!profile || !profile.email) {
      throw new ApiError(400, "Provider did not return a valid email address.");
    }

    // --- Find-or-create the user ---
    let user = await userModel.findByEmail(profile.email);
    if (!user) {
      user = await userModel.create({
        googleId: providerName === "google" ? profile.id : null,
        name: profile.name || profile.email.split("@")[0],
        email: profile.email,
        profilePicture: profile.picture || null,
      });
    } else {
      // Update profile data from the provider.
      await userModel.updateProfile(user.id, {
        googleId: providerName === "google" ? profile.id : null,
        name: profile.name || null,
        profilePicture: profile.picture || null,
      });
    }

    // --- Upsert the connected account (encrypted tokens) ---
    const scopes = this._normalizeScopes(tokens.scope);
    const tokenExpiry = tokens.expiry_date
      ? new Date(Number(tokens.expiry_date))
      : null;

    let account = await connectedAccountModel.findByProvider(
      providerName,
      profile.email
    );

    if (account) {
      if (account.user_id !== user.id) {
        throw new ApiError(
          409,
          `This ${providerName} account is already linked to another MailPilot user.`
        );
      }
      await connectedAccountModel.updateTokens(account.id, {
        accessToken: encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : undefined,
        tokenExpiry,
        scopes,
      });
    } else {
      account = await connectedAccountModel.create({
        userId: user.id,
        provider: providerName,
        providerEmail: profile.email,
        accessToken: encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : null,
        tokenExpiry,
        scopes,
      });
    }

    // --- Issue the MailPilot JWT (only this is returned to the frontend) ---
    const accessToken = signAccessToken(user.id);
    const expiresInMs = config.parseDuration(
      config.jwtExpiresIn,
      15 * 60 * 1000
    );

    return {
      user,
      connectedAccount: {
        id: account.id,
        provider: providerName,
        email: profile.email,
      },
      accessToken,
      expiresIn: expiresInMs,
    };
  }

  /**
   * Returns a valid (non-expired) access token for a connected account,
   * refreshing it automatically if expired or near expiry.
   *
   * @param {string} accountId
   * @param {string} providerName
   * @returns {Promise<string>} plaintext provider access token
   */
  async getAccessToken(accountId, providerName) {
    const account = await connectedAccountModel.findById(accountId);
    if (!account) {
      throw new ApiError(404, "Connected account not found.");
    }
    if (!account.is_active) {
      throw new ApiError(403, "Connected account is deactivated.");
    }

    const provider = this._resolveProvider(providerName);
    const accessToken = decrypt(account.access_token);
    const refreshToken = account.refresh_token
      ? decrypt(account.refresh_token)
      : null;

    const now = Date.now();
    const expiresAt = account.token_expiry
      ? new Date(account.token_expiry).getTime()
      : null;

    // Refresh if no expiry stored, expired, or within the safety margin.
    if (!expiresAt || expiresAt - now <= REFRESH_MARGIN_MS) {
      if (!refreshToken) {
        throw new ApiError(
          401,
          "Access token is expired and no refresh token is available. Please reconnect the account."
        );
      }

      const { tokens } = await provider.refreshAccessToken(refreshToken);
      const newExpiry = tokens.expiry_date
        ? new Date(Number(tokens.expiry_date))
        : null;

      await connectedAccountModel.updateTokens(accountId, {
        accessToken: encrypt(tokens.access_token),
        refreshToken: tokens.refresh_token
          ? encrypt(tokens.refresh_token)
          : undefined,
        tokenExpiry: newExpiry,
        scopes: this._normalizeScopes(tokens.scope),
      });

      return tokens.access_token;
    }

    return accessToken;
  }

  /**
   * Normalizes a scopes value (string or array) into a string array.
   */
  _normalizeScopes(scope) {
    if (!scope) return [];
    if (Array.isArray(scope))
      return scope.map((s) => String(s).trim()).filter(Boolean);
    return String(scope)
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Resolves a provider adapter by name.
   */
  _resolveProvider(providerName) {
    const provider = getProvider(providerName);
    if (!provider) {
      throw new ApiError(400, `Unsupported OAuth provider: ${providerName}`);
    }
    return provider;
  }
}

module.exports = new OAuthService();
