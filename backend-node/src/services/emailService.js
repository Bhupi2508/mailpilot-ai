/**
 * Email business logic.
 *
 * Provides two flows:
 *   - send: one email to all recipients (shared "To" field)
 *   - sendIndividual: one private email per recipient
 *
 * Both persist to email_history and delete temporary attachment files
 * immediately after sending (only metadata is stored).
 *
 * Emails are sent through a provider selected by the provider factory:
 *   - Gmail API (when the user has a connected Google account)
 *   - SMTP (optional fallback)
 */
const fs = require("fs");
const config = require("../config");
const ApiError = require("../utils/ApiError");
const logger = require("../utils/logger");
const emailHistoryModel = require("../models/emailHistoryModel");
const { resolveForUser } = require("./providers/emailProviderFactory");

class EmailService {
  /**
   * Sends a single email to all recipients (shared "To" field).
   * @returns {Promise<{emailId, messageId, provider, recipients}>}
   */
  async send({
    user,
    subject,
    to,
    cc,
    bcc,
    bodyType,
    body,
    files,
    provider = "auto",
    accountId,
  }) {
    const result = await this.sendAndPersist({
      user,
      sendingMode: "shared",
      to,
      cc: cc || [],
      bcc: bcc || [],
      subject,
      bodyType,
      body,
      files,
      provider,
      accountId,
      individualRecipient: null,
    });

    return result;
  }

  /**
   * Sends one private email per recipient.
   * @returns {Promise<{emails: Array, total, sent, failed}>}
   */
  async sendIndividual({
    user,
    subject,
    to,
    cc,
    bcc,
    bodyType,
    body,
    files,
    provider = "auto",
    accountId,
  }) {
    const toArray = to;
    const ccArray = cc || [];
    const bccArray = bcc || [];

    const emails = [];
    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of toArray) {
      try {
        // Each recipient gets their own email with only them in "To".
        const result = await this.sendAndPersist({
          user,
          sendingMode: "individual",
          to: toArray, // persist full list for history context
          cc: ccArray,
          bcc: bccArray,
          subject,
          bodyType,
          body,
          files,
          provider,
          accountId,
          individualRecipient: recipient,
        });
        sentCount += 1;
        emails.push(result);
      } catch (err) {
        failedCount += 1;
        logger.error(
          `[email] individual send failed for ${recipient}: ${err.message}`
        );
        emails.push({
          status: "failed",
          recipient,
          error: err.message,
        });
      }
    }

    return {
      emails,
      total: toArray.length,
      sent: sentCount,
      failed: failedCount,
    };
  }

  /**
   * Sends via the resolved provider and persists history.
   * Deletes temporary attachment files afterwards.
   */
  async sendAndPersist({
    user,
    sendingMode,
    to,
    cc,
    bcc,
    subject,
    bodyType,
    body,
    files,
    provider = "auto",
    accountId,
    individualRecipient = null,
  }) {
    // Build the per-recipient "To" for an individual send.
    const messageTo = individualRecipient ? [individualRecipient] : to;

    const message = {
      to: messageTo,
      cc: cc && cc.length ? cc : undefined,
      bcc: bcc && bcc.length ? bcc : undefined,
      subject,
      bodyType,
      html: bodyType === "html" ? body : undefined,
      text: bodyType === "text" ? body : undefined,
    };

    if (files && files.length) {
      message.attachments = files.map((f) => ({
        filename: f.originalname,
        originalName: f.originalname,
        path: f.path,
        mimeType: f.mimetype,
      }));
    }

    const attachmentNames = (files || []).map((f) => f.originalname);

    let info;
    let resolvedProvider;
    try {
      const resolved = await resolveForUser(user, {
        provider: provider === "auto" ? undefined : provider,
        accountId,
      });
      resolvedProvider = resolved.provider;
      info = await resolvedProvider.send({
        user,
        message,
        options: resolved.options,
      });
    } catch (err) {
      logger.error(
        `[email] send failed via ${
          resolvedProvider ? resolvedProvider.name : "?"
        }: ${err.message}`
      );
      const record = await this.persist({
        user,
        sendingMode,
        to,
        cc,
        bcc,
        subject,
        bodyType,
        body,
        provider: resolvedProvider ? resolvedProvider.name : "unknown",
        status: "failed",
        errorMessage: err.response || err.message || "Provider send failed",
        files,
        attachmentNames,
        individualRecipient,
      });
      throw new ApiError(
        502,
        `Failed to send email: ${err.message}`,
        null,
        true,
        { emailId: record?.id }
      );
    } finally {
      // NEVER store uploaded files. Delete them immediately after the send
      // attempt, regardless of success or failure.
      this.cleanupTemporaryFiles(files);
    }

    const record = await this.persist({
      user,
      sendingMode,
      to,
      cc,
      bcc,
      subject,
      bodyType,
      body,
      provider: resolvedProvider.name,
      providerMessageId: info.messageId,
      status: "sent",
      sentAt: new Date(),
      files,
      attachmentNames,
      individualRecipient,
    });

    return {
      emailId: record.id,
      messageId: info.messageId,
      provider: resolvedProvider.name,
      recipient: individualRecipient || null,
    };
  }

  /**
   * Persists a flattened email history record.
   */
  async persist({
    user,
    sendingMode,
    to,
    cc,
    bcc,
    subject,
    bodyType,
    body,
    provider,
    providerMessageId = null,
    status,
    errorMessage = null,
    sentAt = null,
    attachmentNames,
    individualRecipient = null,
  }) {
    return emailHistoryModel.create({
      userId: user.id,
      provider,
      providerMessageId,
      subject,
      body: bodyType === "html" || bodyType === "text" ? body : null,
      bodyType,
      toRecipients: to,
      ccRecipients: cc || [],
      bccRecipients: bcc || [],
      sendingMode,
      attachmentCount: attachmentNames ? attachmentNames.length : 0,
      attachmentNames: attachmentNames || [],
      status,
      errorMessage,
      sentAt,
    });
  }

  /**
   * Deletes temporary uploaded files from disk.
   */
  cleanupTemporaryFiles(files) {
    if (!files || !files.length) return;
    for (const file of files) {
      if (file && file.path) {
        try {
          fs.unlinkSync(file.path);
          logger.debug(`[email] deleted temp attachment: ${file.path}`);
        } catch (err) {
          logger.warn(
            `[email] could not delete temp attachment ${file.path}: ${err.message}`
          );
        }
      }
    }
  }

  /**
   * Returns paginated email history for a user.
   */
  async getHistory(user, { page = 1, limit = 20 }) {
    const offset = (page - 1) * limit;
    const [emails, total] = await Promise.all([
      emailHistoryModel.findAllByUser(user.id, { limit, offset }),
      emailHistoryModel.countByUser(user.id),
    ]);

    return {
      emails,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}

module.exports = new EmailService();
