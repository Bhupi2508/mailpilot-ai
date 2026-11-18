/**
 * Google OAuth 2.0 (authorization-code flow) for EMAIL_PROVIDER=gmail.
 *
 * Users sign in with Google and grant `gmail.send`; MailPilot then sends
 * through their own Gmail account. Google tokens are encrypted at rest
 * (AES-256-GCM, TOKEN_ENCRYPTION_KEY) and never sent to the browser.
 */
const { encrypt, decrypt, uuid } = require("../utils/crypto");
const ApiError = require("../utils/ApiError");
const { ProviderError } = require("./providers/errors");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/gmail.send"];
const REFRESH_MARGIN_MS = 60 * 1000;

function createGoogleOAuth({ config, db, fetchImpl = fetch }) {
  const g = config.google;
  const key = config.tokenEncryptionKey;

  async function tokenRequest(params) {
    const res = await fetchImpl(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: g.clientId, client_secret: g.clientSecret, ...params }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`Google token endpoint returned ${res.status} (${data.error || "error"}).`);
      err.status = res.status;
      err.oauthError = data.error;
      throw err;
    }
    return data;
  }

  return {
    authorizationUrl(state) {
      const params = new URLSearchParams({
        client_id: g.clientId,
        redirect_uri: g.redirectUri,
        response_type: "code",
        scope: SCOPES.join(" "),
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "true",
        state,
      });
      return `${AUTH_URL}?${params}`;
    },

    /** Exchanges the code, then finds/creates the user and stores tokens. */
    async completeSignIn(code) {
      const tokens = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: g.redirectUri });
      const scopes = String(tokens.scope || "").split(/\s+/).filter(Boolean);
      if (!scopes.includes("https://www.googleapis.com/auth/gmail.send")) {
        throw new ApiError(403, "Gmail send permission was not granted.", { code: "scope_missing" });
      }
      const res = await fetchImpl(USERINFO_URL, { headers: { Authorization: `Bearer ${tokens.access_token}` } });
      const profile = await res.json();
      if (!res.ok || !profile.email || profile.email_verified === false) {
        throw new ApiError(400, "Google did not return a verified email address.", { code: "oauth_profile" });
      }
      const email = profile.email.toLowerCase();
      const now = new Date().toISOString();
      const expiresAt = new Date(Date.now() + (Number(tokens.expires_in) || 3600) * 1000).toISOString();

      return db.transaction(async (tx) => {
        let user =
          (await tx.get("SELECT * FROM users WHERE google_id = ?", [profile.sub])) ||
          (await tx.get("SELECT * FROM users WHERE email = ?", [email]));
        if (user) {
          await tx.run("UPDATE users SET google_id = ?, name = ?, avatar_url = ?, updated_at = ? WHERE id = ?", [
            profile.sub,
            profile.name || user.name,
            profile.picture || null,
            now,
            user.id,
          ]);
        } else {
          user = { id: uuid() };
          await tx.run(
            "INSERT INTO users (id, email, name, google_id, avatar_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [user.id, email, profile.name || email.split("@")[0], profile.sub, profile.picture || null, now, now]
          );
        }

        const account = await tx.get("SELECT * FROM connected_accounts WHERE provider = 'google' AND provider_email = ?", [email]);
        if (account && account.user_id !== user.id) {
          throw new ApiError(409, "This Google account is linked to a different MailPilot user.");
        }
        if (account) {
          await tx.run(
            `UPDATE connected_accounts SET access_token_enc = ?, refresh_token_enc = COALESCE(?, refresh_token_enc),
               token_expires_at = ?, scopes = ?, updated_at = ? WHERE id = ?`,
            [
              encrypt(tokens.access_token, key),
              tokens.refresh_token ? encrypt(tokens.refresh_token, key) : null,
              expiresAt,
              scopes.join(" "),
              now,
              account.id,
            ]
          );
        } else {
          await tx.run(
            `INSERT INTO connected_accounts (id, user_id, provider, provider_email, access_token_enc, refresh_token_enc,
               token_expires_at, scopes, created_at, updated_at) VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?, ?)`,
            [
              uuid(),
              user.id,
              email,
              encrypt(tokens.access_token, key),
              tokens.refresh_token ? encrypt(tokens.refresh_token, key) : null,
              expiresAt,
              scopes.join(" "),
              now,
              now,
            ]
          );
        }
        return tx.get("SELECT * FROM users WHERE id = ?", [user.id]);
      });
    },

    findAccount(userId) {
      return db.get(
        "SELECT * FROM connected_accounts WHERE user_id = ? AND provider = 'google' ORDER BY updated_at DESC LIMIT 1",
        [userId]
      );
    },

    /** Returns a usable access token, refreshing it if it is about to expire. */
    async getAccessToken(accountId) {
      const account = await db.get("SELECT * FROM connected_accounts WHERE id = ?", [accountId]);
      if (!account) throw new ProviderError("fatal", "The Gmail account is no longer connected.", { code: "account_missing" });
      const expires = account.token_expires_at ? Date.parse(account.token_expires_at) : 0;
      if (account.access_token_enc && expires - Date.now() > REFRESH_MARGIN_MS) {
        return decrypt(account.access_token_enc, key);
      }
      if (!account.refresh_token_enc) {
        throw new ProviderError("fatal", "Gmail access expired. Sign in with Google again.", { code: "auth_failed" });
      }
      let tokens;
      try {
        tokens = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(account.refresh_token_enc, key) });
      } catch (err) {
        if (err.oauthError === "invalid_grant" || err.status === 400 || err.status === 401) {
          throw new ProviderError("fatal", "Gmail access was revoked or expired. Sign in with Google again.", { code: "auth_failed" });
        }
        throw new ProviderError("transient", "Could not refresh the Gmail access token.", { code: "token_refresh_failed" });
      }
      await db.run("UPDATE connected_accounts SET access_token_enc = ?, token_expires_at = ?, updated_at = ? WHERE id = ?", [
        encrypt(tokens.access_token, key),
        new Date(Date.now() + (Number(tokens.expires_in) || 3600) * 1000).toISOString(),
        new Date().toISOString(),
        accountId,
      ]);
      return tokens.access_token;
    },
  };
}

module.exports = { createGoogleOAuth, SCOPES };
