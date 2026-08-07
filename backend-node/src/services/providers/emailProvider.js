/**
 * Abstract base class for email providers.
 *
 * All concrete providers (SMTP, Gmail API, Outlook, SendGrid, AWS SES, ...)
 * extend this class and implement the `send` method. The `name` getter
 * returns a stable identifier that is persisted in the email_history table.
 *
 * This enables the provider/adapter pattern: adding a new provider is just a
 * new subclass + registration in the emailProviderFactory.
 */
class EmailProvider {
  /**
   * Stable provider name (e.g. 'smtp', 'gmail', 'outlook').
   */
  get name() {
    throw new Error("EmailProvider.name must be implemented by subclass.");
  }

  /**
   * Sends an email.
   *
   * @param {object} options
   * @param {object} options.user - The authenticated MailPilot user.
   * @param {object} options.message - Normalized message payload.
   * @param {object} options.options - Provider-specific options (e.g. accountId).
   * @returns {Promise<{messageId: string, accepted: string[], rejected: string[], response?: string}>}
   */
  async send({ user, message, options }) {
    throw new Error(
      `EmailProvider.send must be implemented by ${this.name} provider.`
    );
  }
}

module.exports = EmailProvider;
