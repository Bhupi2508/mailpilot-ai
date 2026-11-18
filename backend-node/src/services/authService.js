/**
 * Accounts and sessions.
 *
 * - Passwords are hashed with bcrypt (cost 12); plaintext is never stored.
 * - Sessions are random 256-bit tokens kept in an HttpOnly cookie. Only the
 *   SHA-256 of the token is stored, so a database leak does not leak sessions.
 */
const bcrypt = require("bcryptjs");
const ApiError = require("../utils/ApiError");
const { randomToken, sha256, uuid } = require("../utils/crypto");
const { isValidEmail } = require("./recipients");

const DEMO_EMAIL = "demo@mailpilot.local";

function publicUser(u) {
  return u && { id: u.id, email: u.email, name: u.name, avatarUrl: u.avatar_url || null, isDemo: Boolean(Number(u.is_demo)) };
}

function createAuthService({ db, config }) {
  const rounds = config.isTest ? 4 : 12;
  // Used to keep login timing similar whether or not the account exists.
  const dummyHash = bcrypt.hashSync("not-a-real-password", rounds);

  function validateCredentials({ email, password }) {
    const errors = [];
    const e = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!isValidEmail(e)) errors.push({ field: "email", message: "Enter a valid email address." });
    const p = typeof password === "string" ? password : "";
    if (p.length < 8) errors.push({ field: "password", message: "Password must be at least 8 characters." });
    else if (Buffer.byteLength(p) > 72) errors.push({ field: "password", message: "Password must be at most 72 bytes." });
    return { email: e, password: p, errors };
  }

  async function createSession(userId) {
    const token = randomToken(32);
    const now = new Date();
    const expires = new Date(now.getTime() + config.auth.sessionTtlHours * 3600 * 1000);
    await db.run("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)", [
      sha256(token),
      userId,
      now.toISOString(),
      expires.toISOString(),
    ]);
    return { token, expires };
  }

  return {
    publicUser,
    createSession,

    async register({ email, password, name }) {
      if (!config.authMethods.password || !config.auth.allowRegistration) {
        throw new ApiError(403, "Registration is disabled on this server.", { code: "registration_disabled" });
      }
      const v = validateCredentials({ email, password });
      if (v.errors.length) throw new ApiError(422, v.errors[0].message, { code: "validation_failed", details: v.errors });
      const cleanName = String(name || "")
        .replace(/[\u0000-\u001f<>]/g, "")
        .trim()
        .slice(0, 100);
      if (v.email === DEMO_EMAIL) throw new ApiError(422, "This email address is reserved.");
      const displayName = cleanName || v.email.split("@")[0];
      const passwordHash = await bcrypt.hash(v.password, rounds);

      // The account is created UNVERIFIED and cannot sign in until the emailed
      // code is confirmed. Registering again with an email that is still
      // unverified restarts verification on the same row (no duplicate account).
      const restart = async (existing) => {
        if (Number(existing.email_verified)) {
          throw new ApiError(409, "An account with this email already exists. Sign in instead.", { code: "email_taken" });
        }
        await db.run("UPDATE users SET name = ?, password_hash = ?, updated_at = ? WHERE id = ? AND email_verified = 0", [
          displayName,
          passwordHash,
          new Date().toISOString(),
          existing.id,
        ]);
        return db.get("SELECT * FROM users WHERE id = ?", [existing.id]);
      };
      const existing = await db.get("SELECT * FROM users WHERE email = ?", [v.email]);
      if (existing) return restart(existing);

      const now = new Date().toISOString();
      const id = uuid();
      try {
        await db.run(
          "INSERT INTO users (id, email, name, password_hash, email_verified, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
          [id, v.email, displayName, passwordHash, now, now]
        );
      } catch (err) {
        if (err.code !== "23505" && !String(err.code).startsWith("SQLITE_CONSTRAINT")) throw err;
        return restart(await db.get("SELECT * FROM users WHERE email = ?", [v.email])); // lost a registration race
      }
      return db.get("SELECT * FROM users WHERE id = ?", [id]);
    },

    async login({ email, password }) {
      if (!config.authMethods.password) throw new ApiError(403, "Password sign-in is disabled on this server.");
      const e = typeof email === "string" ? email.trim().toLowerCase() : "";
      const p = typeof password === "string" ? password : "";
      const user = e ? await db.get("SELECT * FROM users WHERE email = ?", [e]) : null;
      const ok = await bcrypt.compare(p, user?.password_hash || dummyHash);
      if (!user || !user.password_hash || !ok) {
        throw new ApiError(401, "Incorrect email or password.", { code: "invalid_credentials" });
      }
      // Only revealed after the password is right, so this can't be used to probe for accounts.
      if (!Number(user.email_verified)) {
        throw new ApiError(403, "Your email address isn't verified yet. Complete registration by entering the code we emailed you.", {
          code: "email_not_verified",
        });
      }
      return user;
    },

    async demoUser() {
      if (!config.authMethods.demo) throw new ApiError(403, "Demo sign-in is only available when EMAIL_PROVIDER=demo.");
      let user = await db.get("SELECT * FROM users WHERE email = ?", [DEMO_EMAIL]);
      if (!user) {
        const now = new Date().toISOString();
        await db.run(
          "INSERT INTO users (id, email, name, is_demo, created_at, updated_at) VALUES (?, ?, 'Demo User', 1, ?, ?) ON CONFLICT (email) DO NOTHING",
          [uuid(), DEMO_EMAIL, now, now]
        );
        user = await db.get("SELECT * FROM users WHERE email = ?", [DEMO_EMAIL]);
      }
      return user;
    },

    async userForSession(token) {
      if (!token || typeof token !== "string" || token.length > 100) return null;
      return db.get(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ? AND u.email_verified = 1`,
        [sha256(token), new Date().toISOString()]
      );
    },

    async destroySession(token) {
      if (token) await db.run("DELETE FROM sessions WHERE id = ?", [sha256(String(token))]);
    },

    async sweepSessions() {
      await db.run("DELETE FROM sessions WHERE expires_at <= ?", [new Date().toISOString()]);
    },

    /** Used by the create-user script, independent of ALLOW_REGISTRATION. */
    async createUser({ email, password, name }) {
      const v = validateCredentials({ email, password });
      if (v.errors.length) throw new Error(v.errors.map((e) => e.message).join(" "));
      const now = new Date().toISOString();
      const id = uuid();
      await db.run("INSERT INTO users (id, email, name, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [
        id,
        v.email,
        String(name || v.email.split("@")[0]).slice(0, 100),
        await bcrypt.hash(v.password, rounds),
        now,
        now,
      ]);
      return id;
    },
  };
}

module.exports = { createAuthService, publicUser, DEMO_EMAIL };
