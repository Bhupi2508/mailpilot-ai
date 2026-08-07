/**
 * Google OAuth2 authorization-code provider.
 *
 * Implements the provider interface used by the registry:
 *   getAuthUrl(state, opts)
 *   exchangeCode(code)
 *   refreshAccessToken(refreshToken)
 *   getUserProfile(accessToken)
 *
 * Uses the googleapis library for token exchange and refresh.
 */
const crypto = require("crypto");
const { google } = require("googleapis");
const config = require("../../config");

const NAME = "google";

class GoogleProvider {
  constructor() {
    this.name = NAME;
    this.config = config.oauth.google;

    this.oauth2Client = new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret,
      this.config.redirectUri
    );
  }

  /**
   * Builds the authorization URL for the browser.
   * @returns {string}
   */
  getAuthUrl(state, opts = {}) {
    this.oauth2Client.setCredentials({});
    const url = this.oauth2Client.generateAuthUrl({
      access_type: opts.accessType || "offline",
      prompt: opts.prompt || "consent",
      scope: opts.scope || this.config.scopes,
      state,
      include_granted_scopes: true,
    });
    return url;
  }

  /**
   * Exchanges an authorization code for tokens + profile info.
   * @returns {Promise<{tokens, profile}>}
   */
  async exchangeCode(code) {
    const { tokens } = await this.oauth2Client.getToken(code);
    this.oauth2Client.setCredentials(tokens);

    const profile = await this.getUserProfile(tokens.access_token);
    return { tokens, profile };
  }

  /**
   * Refreshes an expired access token using a refresh token.
   * @param {string} refreshToken
   * @returns {Promise<{tokens, profile}>}
   */
  async refreshAccessToken(refreshToken) {
    this.oauth2Client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await this.oauth2Client.refreshAccessToken();
    const profile = await this.getUserProfile(credentials.access_token);
    return { tokens: credentials, profile };
  }

  /**
   * Fetches the user's basic profile from Google.
   * @param {string} accessToken
   * @returns {Promise<{id, email, name, picture}>}
   */
  async getUserProfile(accessToken) {
    const oauth2 = google.oauth2({ version: "v2", auth: this.oauth2Client });
    const res = await oauth2.userinfo.get({ access_token: accessToken });
    const data = res.data;
    return {
      id: data.id,
      email: (data.email || "").toLowerCase(),
      name: data.name || "",
      picture: data.picture || null,
    };
  }

  /**
   * Generates a random state parameter for CSRF protection.
   */
  generateState() {
    return crypto.randomBytes(32).toString("hex");
  }
}

module.exports = new GoogleProvider();
