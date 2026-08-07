/**
 * Connected account data access layer.
 *
 * A connected_account links a user to a mailbox identity (e.g. Gmail)
 * for a provider ('google', future 'outlook', ...). OAuth tokens are
 * stored ENCRYPTED (AES-256-GCM) — this model only handles persistence.
 */
const pool = require("../config/db");

const connectedAccountModel = {
  /**
   * Creates a connected account row (tokens should already be encrypted).
   */
  async create({
    userId,
    provider,
    providerEmail,
    accessToken,
    refreshToken,
    tokenExpiry,
    scopes,
  }) {
    const { rows } = await pool.query(
      `INSERT INTO connected_accounts
         (user_id, provider, provider_email, access_token, refresh_token,
          token_expiry, scopes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        userId,
        provider,
        providerEmail,
        accessToken,
        refreshToken || null,
        tokenExpiry || null,
        scopes && scopes.length ? scopes : null,
      ]
    );
    return rows[0];
  },

  /**
   * Finds an active account by provider + provider email.
   */
  async findByProvider(provider, providerEmail) {
    const { rows } = await pool.query(
      `SELECT * FROM connected_accounts
       WHERE provider = $1 AND provider_email = $2
       LIMIT 1`,
      [provider, providerEmail]
    );
    return rows[0] || null;
  },

  /**
   * Finds all accounts for a user.
   */
  async findByUserId(userId) {
    const { rows } = await pool.query(
      `SELECT id, user_id, provider, provider_email, token_expiry, scopes,
              is_active, created_at, updated_at
       FROM connected_accounts
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );
    return rows;
  },

  /**
   * Finds an account by its id (includes tokens for sending).
   */
  async findById(id) {
    const { rows } = await pool.query(
      `SELECT * FROM connected_accounts WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },

  /**
   * Finds the most recent active account for a user + provider.
   */
  async findActiveByUserAndProvider(userId, provider) {
    const { rows } = await pool.query(
      `SELECT * FROM connected_accounts
       WHERE user_id = $1 AND provider = $2 AND is_active = TRUE
       ORDER BY created_at DESC
       LIMIT 1`,
      [userId, provider]
    );
    return rows[0] || null;
  },

  /**
   * Updates tokens after a refresh.
   */
  async updateTokens(id, { accessToken, refreshToken, tokenExpiry, scopes }) {
    const { rows } = await pool.query(
      `UPDATE connected_accounts SET
         access_token = COALESCE($2, access_token),
         refresh_token = COALESCE($3, refresh_token),
         token_expiry = COALESCE($4, token_expiry),
         scopes = COALESCE($5, scopes)
       WHERE id = $1
       RETURNING id, provider, provider_email, token_expiry, updated_at`,
      [
        id,
        accessToken,
        refreshToken,
        tokenExpiry || null,
        scopes && scopes.length ? scopes : undefined,
      ]
    );
    return rows[0] || null;
  },

  /**
   * Marks an account inactive (disconnect).
   */
  async deactivate(id) {
    await pool.query(
      `UPDATE connected_accounts SET is_active = FALSE WHERE id = $1`,
      [id]
    );
  },
};

module.exports = connectedAccountModel;
