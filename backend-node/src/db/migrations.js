/**
 * Versioned, portable schema migrations (SQLite + PostgreSQL).
 *
 * Conventions: ids are TEXT (UUIDs generated in JS), timestamps are ISO-8601
 * UTC strings in TEXT (they sort correctly as text), booleans are INTEGER 0/1,
 * lists are JSON in TEXT. Append new migrations; never edit applied ones.
 */
const MIGRATIONS = [
  {
    version: 1,
    name: "initial schema",
    statements: [
      `CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL DEFAULT '',
        password_hash TEXT,
        google_id TEXT UNIQUE,
        avatar_url TEXT,
        is_demo INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_sessions_user ON sessions (user_id)`,
      `CREATE INDEX idx_sessions_expires ON sessions (expires_at)`,
      `CREATE TABLE connected_accounts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        provider_email TEXT NOT NULL,
        access_token_enc TEXT,
        refresh_token_enc TEXT,
        token_expires_at TEXT,
        scopes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE (provider, provider_email)
      )`,
      `CREATE INDEX idx_accounts_user ON connected_accounts (user_id, provider)`,
      `CREATE TABLE batches (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider TEXT NOT NULL,
        simulated INTEGER NOT NULL DEFAULT 0,
        sender TEXT NOT NULL DEFAULT '',
        account_id TEXT,
        subject TEXT NOT NULL,
        body TEXT NOT NULL,
        body_type TEXT NOT NULL,
        cc TEXT NOT NULL DEFAULT '[]',
        bcc TEXT NOT NULL DEFAULT '[]',
        attachments TEXT NOT NULL DEFAULT '[]',
        attachments_available INTEGER NOT NULL DEFAULT 0,
        attachments_expire_at TEXT,
        idempotency_key TEXT,
        request_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        total INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        UNIQUE (user_id, idempotency_key)
      )`,
      `CREATE INDEX idx_batches_user_created ON batches (user_id, created_at)`,
      `CREATE TABLE deliveries (
        id TEXT PRIMARY KEY,
        batch_id TEXT NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        position INTEGER NOT NULL,
        recipient_email TEXT NOT NULL,
        recipient_name TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        error_code TEXT,
        error_message TEXT,
        provider_message_id TEXT,
        accepted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_deliveries_batch ON deliveries (batch_id, position)`,
      `CREATE INDEX idx_deliveries_queue ON deliveries (status, next_attempt_at)`,
      `CREATE INDEX idx_deliveries_user_created ON deliveries (user_id, created_at)`,
    ],
  },
  {
    version: 2,
    name: "email verification (OTP) and per-batch sender name",
    statements: [
      // Existing accounts were created through verified sign-in, so they stay verified.
      `ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 1`,
      `ALTER TABLE batches ADD COLUMN sender_name TEXT NOT NULL DEFAULT ''`,
      `CREATE TABLE email_otps (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        code_hash TEXT NOT NULL,
        salt TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        last_sent_at TEXT NOT NULL,
        window_started_at TEXT NOT NULL,
        send_count INTEGER NOT NULL DEFAULT 1
      )`,
      `CREATE INDEX idx_otps_expires ON email_otps (expires_at)`,
    ],
  },
];

async function migrate(db) {
  await db.run(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )`
  );
  const applied = new Set(
    (await db.all("SELECT version FROM schema_migrations")).map((r) => Number(r.version))
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    await db.transaction(async (tx) => {
      for (const sql of m.statements) await tx.run(sql);
      await tx.run("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)", [
        m.version,
        m.name,
        new Date().toISOString(),
      ]);
    });
  }
}

module.exports = { migrate, MIGRATIONS };
