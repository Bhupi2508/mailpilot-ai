/**
 * Application logger (console, structured lines).
 *
 * Never log passwords, tokens, session ids, message bodies or full email
 * addresses: use maskEmail() for addresses.
 */
const winston = require("winston");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "test" ? "error" : "info"),
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      const extra = Object.keys(meta).length ? " " + JSON.stringify(meta) : "";
      return `${timestamp} ${level.toUpperCase()} ${message}${extra}`;
    })
  ),
  transports: [new winston.transports.Console()],
});

/** "jane.doe@example.com" -> "j***@example.com" */
function maskEmail(email) {
  const s = String(email || "");
  const at = s.lastIndexOf("@");
  if (at < 1) return "***";
  return `${s[0]}***${s.slice(at)}`;
}

module.exports = { logger, maskEmail };
