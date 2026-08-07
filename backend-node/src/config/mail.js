/**
 * Optional SMTP transporter (fallback provider).
 *
 * MailPilot's primary email path is the Gmail API (via the user's own
 * connected Google account). SMTP is kept only as an OPTIONAL fallback
 * for future providers or local testing, and only activates when
 * SMTP_HOST is configured in the environment.
 *
 * If SMTP_HOST is not set, `transporter` is null and the SMTP provider
 * will report that it is unavailable.
 */
const nodemailer = require("nodemailer");
const config = require("./index");

let transporter = null;

if (config.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.secure,
    auth: {
      user: config.smtp.user,
      pass: config.smtp.pass,
    },
  });
}

module.exports = transporter;
