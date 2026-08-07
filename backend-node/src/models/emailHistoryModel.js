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
   * Returns all emails for a user, newest first.
   */
  async findAllByUser(userId, { limit = 20, offset = 0 } = {}) {
    const { rows } = await pool.query(
      `SELECT id, user_id, provider, provider_message_id, subject, body,
              body_type, to_recipients, cc_recipients, bcc_recipients,
              sending_mode, attachment_count, attachment_names, status,
              error_message, sent_at, created_at, updated_at
       FROM email_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return rows;
  },

  /**
   * Counts all emails for a user.
   */
  async countByUser(userId) {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS total FROM email_history WHERE user_id = $1`,
      [userId]
    );
    return rows[0].total;
  },
};

module.exports = emailHistoryModel;
