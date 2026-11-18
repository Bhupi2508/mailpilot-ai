/**
 * Email OTP verification for password registration.
 *
 * - 6-digit code from a CSPRNG, stored only as salted SHA-256 (never plaintext).
 * - Expiry, attempt limits, cooldown and the hourly resend cap are enforced
 *   here on the server; the browser countdown is display only.
 * - The failed-attempt counter is incremented atomically BEFORE the code is
 *   compared, so parallel guesses can't exceed OTP_MAX_ATTEMPTS.
 * - Accepting a code deletes it in the same transaction that marks the user
 *   verified, so a code works exactly once.
 * - In demo mode nothing is emailed; the code is returned to the UI instead.
 *   It is never returned in any other mode.
 */
const crypto = require("crypto");
const ApiError = require("../utils/ApiError");
const { randomToken, sha256, safeEqual } = require("../utils/crypto");
const { logger, maskEmail } = require("../utils/logger");
const { isValidEmail } = require("./recipients");

const HOUR_MS = 3600 * 1000;
const UNVERIFIED_RETENTION_MS = 7 * 24 * HOUR_MS;
const isUniqueViolation = (err) => err && (err.code === "23505" || String(err.code).startsWith("SQLITE_CONSTRAINT"));

function createOtpService({ db, config, provider }) {
  const o = config.otp;
  const hash = (salt, code) => sha256(`${salt}:${code}`);
  const secondsUntil = (ms, now) => Math.max(0, Math.ceil((ms - now) / 1000));
  const ttlText = o.ttlSeconds % 60 === 0 ? `${o.ttlSeconds / 60} minute${o.ttlSeconds === 60 ? "" : "s"}` : `${o.ttlSeconds} seconds`;

  const stateOf = (email, row, now) => ({
    email,
    expiresInSeconds: row ? secondsUntil(Date.parse(row.expires_at), now) : 0,
    resendInSeconds: row ? secondsUntil(Date.parse(row.last_sent_at) + o.resendCooldownSeconds * 1000, now) : 0,
  });

  function otpMessage(email, code) {
    return {
      to: [{ name: "", address: email }],
      cc: [],
      bcc: [],
      subject: "Your MailPilot verification code",
      text:
        `Your MailPilot verification code is ${code}\n\n` +
        `It expires in ${ttlText}. If you didn't create a MailPilot account, you can ignore this email.`,
      html:
        `<p>Your MailPilot verification code is</p><p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p>` +
        `<p>It expires in ${ttlText}. If you didn't create a MailPilot account, you can ignore this email.</p>`,
      attachments: [],
    };
  }

  /**
   * Creates a fresh code for an unverified user and emails it. Replaces (and so
   * invalidates) any earlier code. Enforces the cooldown and hourly cap.
   * With reuseOnCooldown, a request during the cooldown is not an error: it
   * returns the state of the code that is already out (sent: false).
   */
  async function issue(user, { reuseOnCooldown = false } = {}) {
    const now = Date.now();
    const row = await db.get("SELECT * FROM email_otps WHERE user_id = ?", [user.id]);
    let windowStart = now;
    let count = 0;
    if (row) {
      const waitSec = secondsUntil(Date.parse(row.last_sent_at) + o.resendCooldownSeconds * 1000, now);
      if (waitSec > 0) {
        if (reuseOnCooldown) return { ...stateOf(user.email, row, now), sent: false };
        throw new ApiError(429, `Please wait ${waitSec}s before requesting another code.`, {
          code: "otp_cooldown",
          details: [{ field: "otp", message: "Resend cooldown", retryAfterSeconds: waitSec, expiresInSeconds: secondsUntil(Date.parse(row.expires_at), now) }],
        });
      }
      if (Date.parse(row.window_started_at) + HOUR_MS > now) {
        windowStart = Date.parse(row.window_started_at);
        count = Number(row.send_count);
      }
    }
    if (count >= o.maxSendsPerHour) {
      const retry = secondsUntil(windowStart + HOUR_MS, now);
      throw new ApiError(429, "Too many verification codes were requested. Please try again later.", {
        code: "otp_resend_limit",
        details: [{ field: "otp", message: "Hourly limit", retryAfterSeconds: retry, expiresInSeconds: row ? secondsUntil(Date.parse(row.expires_at), now) : 0 }],
      });
    }

    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const salt = randomToken(12);
    const sentAt = new Date(now).toISOString();
    const expiresAt = new Date(now + o.ttlSeconds * 1000).toISOString();
    const values = [hash(salt, code), salt, expiresAt, sentAt, new Date(windowStart).toISOString(), count + 1];
    try {
      if (row) {
        await db.run(
          `UPDATE email_otps SET code_hash = ?, salt = ?, expires_at = ?, attempts = 0, last_sent_at = ?,
             window_started_at = ?, send_count = ? WHERE user_id = ?`,
          [...values, user.id]
        );
      } else {
        await db.run(
          `INSERT INTO email_otps (code_hash, salt, expires_at, last_sent_at, window_started_at, send_count, user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [...values, user.id]
        );
      }
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      throw new ApiError(429, "A code was just requested. Please wait a moment.", { code: "otp_cooldown" });
    }

    const state = { ...stateOf(user.email, { expires_at: expiresAt, last_sent_at: sentAt }, now), sent: true };
    if (provider.simulated) return { ...state, demoCode: code }; // demo mode: nothing is emailed

    try {
      await provider.send(otpMessage(user.email, code), { purpose: "otp" });
    } catch (err) {
      logger.error("verification email failed", { to: maskEmail(user.email), error: err.message });
      // Invalidate the unsent code and give the cooldown back so the user can retry.
      await db.run("UPDATE email_otps SET expires_at = ?, last_sent_at = ? WHERE user_id = ?", [
        sentAt,
        row ? row.last_sent_at : "1970-01-01T00:00:00.000Z",
        user.id,
      ]);
      throw new ApiError(503, "We couldn't send the verification email. Please try again in a moment.", { code: "otp_send_failed" });
    }
    logger.info("verification code sent", { to: maskEmail(user.email) });
    return state;
  }

  async function findPending(emailInput) {
    const email = String(emailInput || "").trim().toLowerCase();
    if (!isValidEmail(email)) throw new ApiError(422, "Enter a valid email address.", { code: "validation_failed", details: [{ field: "email", message: "Enter a valid email address." }] });
    return { email, user: await db.get("SELECT * FROM users WHERE email = ?", [email]) };
  }

  return {
    issue,

    /** Resend: always a fresh code; unknown or already-verified emails get the same neutral answer. */
    async resend(emailInput) {
      const { email, user } = await findPending(emailInput);
      if (!user || Number(user.email_verified)) {
        return { email, sent: true, expiresInSeconds: o.ttlSeconds, resendInSeconds: o.resendCooldownSeconds };
      }
      return issue(user);
    },

    /** Checks the code; on success marks the user verified and returns them. */
    async verify(emailInput, codeInput) {
      const { email, user } = await findPending(emailInput);
      const code = String(codeInput ?? "").trim();
      if (!/^\d{6}$/.test(code)) {
        throw new ApiError(422, "Enter the 6-digit code from your email.", { code: "otp_invalid", details: [{ field: "code", message: "Enter the 6-digit code." }] });
      }
      const invalid = new ApiError(400, "That code is incorrect or has expired. Request a new one.", { code: "otp_invalid" });
      if (!user) throw invalid;
      if (Number(user.email_verified)) throw new ApiError(409, "This email is already verified. Sign in instead.", { code: "already_verified" });

      const expired = () => new ApiError(400, "This code has expired. Request a new one.", { code: "otp_expired" });
      const row = await db.get("SELECT * FROM email_otps WHERE user_id = ?", [user.id]);
      if (!row || Date.parse(row.expires_at) <= Date.now()) throw expired();

      // Claim an attempt atomically before comparing.
      const claim = await db.run("UPDATE email_otps SET attempts = attempts + 1 WHERE user_id = ? AND attempts < ?", [user.id, o.maxAttempts]);
      if (!claim.changes) {
        throw new ApiError(429, "Too many incorrect attempts. Request a new code.", { code: "otp_locked" });
      }
      if (!safeEqual(hash(row.salt, code), row.code_hash)) {
        const used = (await db.get("SELECT attempts FROM email_otps WHERE user_id = ?", [user.id]))?.attempts ?? o.maxAttempts;
        const left = Math.max(0, o.maxAttempts - Number(used));
        throw new ApiError(400, left > 0 ? `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` : "Incorrect code. Request a new code.", {
          code: "otp_invalid",
          details: [{ field: "code", message: "Incorrect code", remainingAttempts: left }],
        });
      }

      await db.transaction(async (tx) => {
        const used = await tx.run("DELETE FROM email_otps WHERE user_id = ? AND code_hash = ?", [user.id, row.code_hash]);
        if (!used.changes) throw expired(); // already consumed by a parallel request
        await tx.run("UPDATE users SET email_verified = 1, updated_at = ? WHERE id = ?", [new Date().toISOString(), user.id]);
      });
      return db.get("SELECT * FROM users WHERE id = ?", [user.id]);
    },

    /** Removes long-expired codes and registrations that were never verified. */
    async sweep() {
      const now = Date.now();
      await db.run("DELETE FROM email_otps WHERE expires_at < ?", [new Date(now - HOUR_MS).toISOString()]);
      await db.run("DELETE FROM users WHERE email_verified = 0 AND updated_at < ?", [new Date(now - UNVERIFIED_RETENTION_MS).toISOString()]);
    },
  };
}

module.exports = { createOtpService };
