-- =============================================================================
-- MFCalc Abundance — Database Schema
-- Run this ONCE in: Vercel Dashboard → Storage → your DB → Query tab
-- =============================================================================

-- ── NextAuth required tables ────────────────────────────────────────────────
-- These are the exact table names @auth/pg-adapter expects.
-- https://authjs.dev/getting-started/adapters/pg

CREATE TABLE IF NOT EXISTS verification_token (
  identifier TEXT        NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  token      TEXT        NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE IF NOT EXISTS accounts (
  id                  TEXT        NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "userId"            TEXT        NOT NULL,
  type                TEXT        NOT NULL,
  provider            TEXT        NOT NULL,
  "providerAccountId" TEXT        NOT NULL,
  refresh_token       TEXT,
  access_token        TEXT,
  expires_at          BIGINT,
  id_token            TEXT,
  scope               TEXT,
  session_state       TEXT,
  token_type          TEXT,
  UNIQUE (provider, "providerAccountId")
);

CREATE TABLE IF NOT EXISTS sessions (
  id             TEXT        NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  "userId"       TEXT        NOT NULL,
  expires        TIMESTAMPTZ NOT NULL,
  "sessionToken" TEXT        NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS users (
  id              TEXT        NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  name            TEXT,
  email           TEXT        UNIQUE,
  "emailVerified" TIMESTAMPTZ,
  image           TEXT,
  -- ── App-specific fields ──
  role            TEXT        NOT NULL DEFAULT 'client',  -- 'client' | 'distributor' | 'admin'
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Foreign keys
ALTER TABLE accounts ADD CONSTRAINT fk_accounts_user
  FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE sessions ADD CONSTRAINT fk_sessions_user
  FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE;

-- ── App tables ───────────────────────────────────────────────────────────────

-- CAS portfolio uploads (one user can have multiple uploads)
CREATE TABLE IF NOT EXISTS cas_portfolios (
  id          TEXT        NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name   TEXT        NOT NULL,
  blob_key    TEXT        NOT NULL,   -- Vercel Blob key for the parsed JSON payload
  pan_count   INT         NOT NULL DEFAULT 0,
  pans        TEXT[]      NOT NULL DEFAULT '{}',  -- PANs found in this upload — the
                                                    -- authorization source for
                                                    -- pan_investor_names below (a
                                                    -- user/admin may only read or
                                                    -- rename a PAN that appears in
                                                    -- one of their own saved uploads)
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cas_portfolios_user ON cas_portfolios(user_id);

-- PAN → investor name labels for multi-PAN (family) CAS statements.
-- Keyed globally by PAN, not per-user: the same PAN can legitimately
-- reappear across different users' family CAS uploads, and once named
-- once (by the investor or an admin), the label should carry over.
-- Disclosed in the CAS Tracker page's FAQ. Reads/writes are authorized
-- against cas_portfolios.pans (see app/api/cas/pan-name/route.js) — a
-- caller may only see or set a name for a PAN that appears in one of
-- their own (or, for admin, the impersonated user's) saved uploads.
CREATE TABLE IF NOT EXISTS pan_investor_names (
  pan           TEXT        NOT NULL PRIMARY KEY,
  investor_name TEXT        NOT NULL,
  updated_by    TEXT        REFERENCES users(id) ON DELETE SET NULL,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- Role values: 'client' | 'distributor' | 'admin'
-- Promote a user manually:
--   UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
-- =============================================================================
