/**
 * Gmail API email provider.
 *
 * Sends emails through the user's own Gmail account using the Gmail API
 * (`users.messages.send`), leveraging the OAuth tokens stored in the
 * connected_accounts table. Access tokens are auto-refreshed via
 * oauthService when expired.
 *
 * This avoids ever asking the user for SMTP credentials or an App Password.
 */
const { google } = require("googleapis");
const EmailProvider = require("./emailProvider");
const oauthService = require("../oauth/oauthService");
const connectedAccountModel = require("../../models/connectedAccountModel");
const ApiError = require("../../utils/ApiError");

class GmailApiProvider extends EmailProvider {
  get name() {
    return "gmail_api";
  }

  /**
   * Determines the Gmail account to use for a user.
   * Prefers the `options.accountId` if given, otherwise the first active
   * Gmail account for the user.
   */
  async resolveAccount(user, options = {}) {
    if (options.accountId) {
      const account = await connectedAccountModel.findById(options.accountId);
      if (!account) {
        throw new ApiError(404, "Gmail account not found.");
      }
      if (account.provider !== "google" || !account.is_active) {
        throw new ApiError(
          400,
          "The selected account is not an active Google account."
        );
      }
      return account;
    }

    const account = await connectedAccountModel.findActiveByUserAndProvider(
      user.id,
      "google"
    );
    if (!account) {
      throw new ApiError(
        400,
        "No connected Gmail account found. Please connect your Gmail account."
      );
    }
    return account;
  }

  async send({ user, message, options = {} }) {
    const account = await this.resolveAccount(user, options);
    const accessToken = await oauthService.getAccessToken(account.id, "google");

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: accessToken });

    const gmail = google.gmail({ version: "v1", auth });

    const raw = this._buildMimeMessage({
      from: account.provider_email,
      to: message.to,
      cc: message.cc,
      bcc: message.bcc,
      subject: message.subject,
      bodyType: message.bodyType,
      html: message.html,
      text: message.text,
      attachments: message.attachments,
    });

    let res;
    try {
      res = await gmail.users.messages.send({
        userId: "me",
        requestBody: { raw },
      });
    } catch (err) {
      throw new ApiError(
        502,
        `Gmail API send failed: ${err.message}`,
        null,
        true
      );
    }

    return {
      messageId: res.data.id,
      accepted: message.to,
      rejected: [],
      response: `Gmail message id: ${res.data.id}`,
    };
  }

  /**
   * Builds a base64url-encoded RFC-2822 MIME message for the Gmail API.
   */
  _buildMimeMessage({
    from,
    to,
    cc,
    bcc,
    subject,
    bodyType,
    html,
    text,
    attachments,
  }) {
    const boundary = `mailpilot_${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2)}`;

    const headers = [
      `From: ${from}`,
      `To: ${Array.isArray(to) ? to.join(", ") : to}`,
    ];
    if (cc && cc.length)
      headers.push(`Cc: ${Array.isArray(cc) ? cc.join(", ") : cc}`);
    if (bcc && bcc.length)
      headers.push(`Bcc: ${Array.isArray(bcc) ? bcc.join(", ") : bcc}`);
    headers.push(`Subject: ${this._encodeHeader(subject)}`);
    headers.push("MIME-Version: 1.0");
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);

    let body = headers.join("\r\n");
    body += `\r\n\r\n--${boundary}\r\n`;
    body += `Content-Type: multipart/alternative; boundary="${boundary}_alt"\r\n\r\n`;
    body += `--${boundary}_alt\r\n`;
    body += "Content-Type: text/plain; charset=UTF-8\r\n";
    body += "Content-Transfer-Encoding: base64\r\n\r\n";
    body += Buffer.from(text || "").toString("base64");
    body += `\r\n--${boundary}_alt\r\n`;
    body += "Content-Type: text/html; charset=UTF-8\r\n";
    body += "Content-Transfer-Encoding: base64\r\n\r\n";
    body += Buffer.from(html || "").toString("base64");
    body += `\r\n--${boundary}_alt--\r\n`;

    if (attachments && attachments.length) {
      const fs = require("fs");
      for (const att of attachments) {
        body += `\r\n--${boundary}\r\n`;
        body += `Content-Type: ${
          att.mimeType || "application/octet-stream"
        }; name="${this._encodeHeader(att.filename)}"\r\n`;
        body += `Content-Disposition: attachment; filename="${this._encodeHeader(
          att.filename
        )}"\r\n`;
        body += "Content-Transfer-Encoding: base64\r\n\r\n";
        try {
          const data = fs.readFileSync(att.path);
          body += data.toString("base64");
        } catch (err) {
          // Skip unreadable attachment.
        }
        body += "\r\n";
      }
    }

    body += `\r\n--${boundary}--\r\n`;

    return Buffer.from(body, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }

  _encodeHeader(value) {
    return String(value || "").replace(
      /([^\x00-\x7F])/g,
      (ch) => `=?UTF-8?B?${Buffer.from(ch).toString("base64")}?=`
    );
  }
}

module.exports = new GmailApiProvider();
