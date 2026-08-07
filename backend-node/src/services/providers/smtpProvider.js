/**
 * SMTP email provider.
 *
 * Wraps the optional Nodemailer transporter as a fallback / local provider.
 * Only available when SMTP_HOST is configured in the environment. Used when
 * a user has no connected OAuth account, or when SMTP is explicitly requested.
 */
const ApiError = require("../../utils/ApiError");
const EmailProvider = require("./emailProvider");

class SmtpProvider extends EmailProvider {
  get name() {
    return "smtp";
  }

  async send({ user, message, options }) {
    const transporter = this._transporter();
    if (!transporter) {
      throw new ApiError(
        503,
        "SMTP is not configured. Connect a Gmail account or set SMTP_HOST."
      );
    }

    const mailOptions = {
      from: this._sender(),
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      subject: message.subject,
    };

    if (message.bodyType === "text") {
      mailOptions.text = message.text || "";
    } else {
      mailOptions.html = message.html || "";
    }

    if (message.attachments && message.attachments.length) {
      mailOptions.attachments = message.attachments;
    }

    const info = await transporter.sendMail(mailOptions);
    return {
      messageId: info.messageId,
      accepted: info.accepted || [],
      rejected: info.rejected || [],
      response: info.response || null,
    };
  }

  _transporter() {
    const config = require("../../config");
    if (!config.smtp.host) return null;
    return require("../../config/mail");
  }

  _sender() {
    const config = require("../../config");
    return `"${config.smtp.fromName}" <${config.smtp.fromEmail}>`;
  }
}

module.exports = new SmtpProvider();
