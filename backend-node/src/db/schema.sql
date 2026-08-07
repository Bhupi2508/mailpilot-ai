-- ============================================================
-- MailPilot AI — PostgreSQL Schema (OAuth-Only)
-- ============================================================
-- MailPilot AI is an email sending platform (NOT an email provider).
-- Users connect their own mailbox (Google first, Outlook later) and
-- send emails through their own account.
--
-- Design goals:
--   * Minimal tables for a lightweight MVP
--   * PostgreSQL arrays / JSONB where appropriate
--   * Only store what is required — never store uploaded files
--   * Optimized for Neon (free-tier PostgreSQL)
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_id       VARCHAR(255) UNIQUE,
  name            VARCHAR(100) NOT NULL,
  email           VARCHAR(255) NOT NULL UNIQUE,
  profile_picture TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------
-- Idempotent migrations for a pre-existing users table created by the
-- older email/password schema. These run safely even on a fresh DB
-- (all statements are IF NOT EXISTS / are no-ops when nothing to do).
-- ------------------------------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_picture TEXT;
ALTER TABLE users DROP COLUMN IF EXISTS password_hash;
ALTER TABLE users DROP COLUMN IF EXISTS auth_provider;
ALTER TABLE users DROP COLUMN IF EXISTS is_verified;
ALTER TABLE users DROP COLUMN IF EXISTS is_active;
ALTER TABLE users DROP COLUMN IF EXISTS last_login_at;
ALTER TABLE users DROP COLUMN IF EXISTS avatar_url;

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id);

-- ------------------------------------------------------------
-- connected_accounts
-- ------------------------------------------------------------
-- A user's connected mailbox identity (e.g. Gmail).
-- OAuth tokens are stored ENCRYPTED (AES-256-GCM) in access_token /
-- refresh_token. Only metadata required for sending is retained.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS connected_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        VARCHAR(50) NOT NULL,                 -- 'google', 'outlook', ...
  provider_email  VARCHAR(255) NOT NULL,
  access_token    TEXT NOT NULL,                        -- encrypted
  refresh_token   TEXT,                                 -- encrypted
  token_expiry    TIMESTAMPTZ,
  scopes          TEXT[],
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, provider_email)
);

CREATE INDEX IF NOT EXISTS idx_connected_accounts_user_id
  ON connected_accounts (user_id);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_provider
  ON connected_accounts (provider, provider_email);

-- ------------------------------------------------------------
-- email_history
-- ------------------------------------------------------------
-- Tracks every email sent through the platform. Recipients are stored
-- as PostgreSQL arrays; attachments are NOT stored — only their count
-- and names (the actual files are deleted immediately after sending).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider            VARCHAR(50) NOT NULL DEFAULT 'google',
  provider_message_id TEXT,
  subject             VARCHAR(200) NOT NULL,
  body                TEXT,
  body_type           VARCHAR(10) NOT NULL DEFAULT 'html'
                      CHECK (body_type IN ('html', 'text')),
  to_recipients       TEXT[] NOT NULL,
  cc_recipients       TEXT[] DEFAULT '{}',
  bcc_recipients      TEXT[] DEFAULT '{}',
  sending_mode        VARCHAR(20) NOT NULL DEFAULT 'shared'
                      CHECK (sending_mode IN ('shared', 'individual')),
  attachment_count    INTEGER NOT NULL DEFAULT 0,
  attachment_names    TEXT[] DEFAULT '{}',
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'sent', 'failed')),
  error_message       TEXT,
  sent_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------
-- Idempotent migrations for a pre-existing email_history table from
-- the older schema (CREATE TABLE IF NOT EXISTS is skipped when the
-- table already exists, so we add/migrate the new columns and drop
-- the old recipient/attachment tables entirely).
-- ------------------------------------------------------------------
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS provider VARCHAR(50)
  NOT NULL DEFAULT 'google';
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS provider_message_id TEXT;
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS body_type VARCHAR(10)
  NOT NULL DEFAULT 'html';
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS to_recipients TEXT[] NOT NULL
  DEFAULT '{}';
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS cc_recipients TEXT[] NOT NULL
  DEFAULT '{}';
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS bcc_recipients TEXT[] NOT NULL
  DEFAULT '{}';
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS sending_mode VARCHAR(20)
  NOT NULL DEFAULT 'shared';
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS attachment_count INTEGER
  NOT NULL DEFAULT 0;
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS attachment_names TEXT[]
  NOT NULL DEFAULT '{}';
ALTER TABLE email_history ADD COLUMN IF NOT EXISTS error_message TEXT;

ALTER TABLE email_history ALTER COLUMN subject TYPE VARCHAR(200);
ALTER TABLE email_history ALTER COLUMN status TYPE VARCHAR(20)
  USING status::VARCHAR(20);
ALTER TABLE email_history ALTER COLUMN status DROP DEFAULT;
ALTER TABLE email_history ALTER COLUMN status SET DEFAULT 'pending';

-- Drop legacy columns that no longer exist in the new schema.
ALTER TABLE email_history DROP COLUMN IF EXISTS sender_email;
ALTER TABLE email_history DROP COLUMN IF EXISTS recipient_type;
ALTER TABLE email_history DROP COLUMN IF EXISTS to_list;
ALTER TABLE email_history DROP COLUMN IF EXISTS cc_list;
ALTER TABLE email_history DROP COLUMN IF EXISTS bcc_list;
ALTER TABLE email_history DROP COLUMN IF EXISTS body_html;
ALTER TABLE email_history DROP COLUMN IF EXISTS body_text;
ALTER TABLE email_history DROP COLUMN IF EXISTS message_id;
ALTER TABLE email_history DROP COLUMN IF EXISTS smtp_response;
ALTER TABLE email_history DROP COLUMN IF EXISTS failed_at;
ALTER TABLE email_history DROP COLUMN IF EXISTS meta;

-- Drop legacy tables no longer used in the OAuth-only architecture.
DROP TABLE IF EXISTS email_recipients CASCADE;
DROP TABLE IF EXISTS email_attachments CASCADE;
DROP TABLE IF EXISTS refresh_tokens CASCADE;
DROP TABLE IF EXISTS password_reset_tokens CASCADE;
DROP TABLE IF EXISTS oauth_tokens CASCADE;
DROP TABLE IF EXISTS oauth_accounts CASCADE;
DROP TABLE IF EXISTS oauth_providers CASCADE;

CREATE INDEX IF NOT EXISTS idx_email_history_user_created
  ON email_history (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_history_status
  ON email_history (status);

-- ------------------------------------------------------------
-- Trigger: updated_at maintenance
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['users', 'connected_accounts', 'email_history']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      tbl, tbl
    );
  END LOOP;
END;
$$;

