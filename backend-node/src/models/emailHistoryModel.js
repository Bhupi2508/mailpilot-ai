/**
 * Email history data access layer.
 *
 * Stores a flattened record of every sent email. Recipients and
 * attachment names are stored as PostgreSQL arrays. Actual attachment
 * files are NEVER persisted — they are deleted immediately after sending.
 */
const pool = require("../config/db");

const emailHistoryModel = {
  /**
   * Creates an email history record.
   */
  async create({
    userId,
    provider,
    providerMessageId = null,
    subject,
    body = null,
    bodyType = "html",
    toRecipients,
    ccRecipients = [],
    bccRecipients = [],
    sendingMode = "shared",
    attachmentCount = 0,
    attachmentNames = [],
    status = "pending",
    errorMessage = null,
    sentAt = null,
  }) {
    const { rows } = await pool.query(
      `INSERT INTO email_history
        (user_id, provider, provider_message_id, subject, body, body_type,
         to_recipients, cc_recipients, bcc_recipients, sending_mode,
         attachment_count, attachment_names, status, error_message, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       RETURNING *`,
      [
        userId,
        provider,
        providerMessageId,
        subject,
        body || null,
        bodyType,
        JSON.stringify(toRecipients),
        JSON.stringify(ccRecipients),
        JSON.stringify(bccRecipients),
        sendingMode,
        attachmentCount,
        JSON.stringify(attachmentNames),
        status,
        errorMessage || null,
        sentAt || null,
      ]
    );
    return rows[0];
  },

  /**
   * Builds the WHERE clause + params for filtering a user's history.
   * Supports optional subject search and status/mode filters.
   */
  _buildFilter(userId, { search, status, mode } = {}) {
    const conditions = ["user_id = $1"];
    const params = [userId];
    let paramIndex = 1;

    if (search) {
      paramIndex += 1;
      conditions.push(`subject ILIKE $${paramIndex}`);
      params.push(`%${search}%`);
    }

    if (status) {
      paramIndex += 1;
      conditions.push(`status = $${paramIndex}`);
      params.push(status);
    }

    if (mode) {
      paramIndex += 1;
      conditions.push(`sending_mode = $${paramIndex}`);
      params.push(mode);
    }

    return { where: conditions.join(" AND "), params };
  },

  /**
   * Returns all emails for a user, newest first, with optional filters.
   * @param {object} opts
   * @param {number} [opts.limit=20]
   * @param {number} [opts.offset=0]
   * @param {string} [opts.search] - Subject substring search.
   * @param {string} [opts.status] - 'sent' | 'failed' | 'pending'.
   * @param {string} [opts.mode] - 'shared' | 'individual'.
   */
  async findAllByUser(
    userId,
    { limit = 20, offset = 0, search, status, mode } = {}
  ) {
    const { where, params } = this._buildFilter(userId, {
      search,
      status,
      mode,
    });
    const orderIdx = params.length;

    const { rows } = await pool.query(
      `SELECT id, user_id, provider, provider_message_id, subject, body,
              body_type, to_recipients, cc_recipients, bcc_recipients,
              sending_mode, attachment_count, attachment_names, status,
              error_message, sent_at, created_at, updated_at
       FROM email_history
       WHERE ${where}
       ORDER BY created_at DESC
       LIMIT $${orderIdx + 1} OFFSET $${orderIdx + 2}`,
      [...params, limit, offset]
    );
    return rows;
  },

  /**
   * Counts all emails for a user, honoring the same filters.
   */
  async countByUser(userId, filters = {}) {
    const { where, params } = this._buildFilter(userId, filters);
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM email_history WHERE ${where}`,
      params
    );
    return rows[0].total;
  },

  /**
   * Computes aggregate dashboard statistics for a user.
   * @returns {Promise<object>}
   */
  async getStats(userId) {
    const { rows } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'sent')::int AS success,
         COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
         COUNT(*) FILTER (WHERE sending_mode = 'individual')::int AS separate,
         COUNT(*) FILTER (WHERE sending_mode = 'shared')::int AS consolidated,
         COUNT(*) FILTER (
           WHERE created_at::date = CURRENT_DATE
         )::int AS today
       FROM email_history
       WHERE user_id = $1`,
      [userId]
    );
    return rows[0];
  },
};

module.exports = emailHistoryModel;
