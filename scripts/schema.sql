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

-- ── Email OTP attempt limiter ────────────────────────────────────────────────
-- Tracks failed 6-digit code verification attempts per email. Read/written by
-- app/api/auth/verify-otp/route.js. attempts resets to 1 (not incremented)
-- once updated_at is more than 15 minutes old, so a lockout is always bounded
-- by the same 15-minute window the code itself expires within — never
-- effectively permanent. Only a SUCCESSFUL verification deletes the row;
-- merely requesting a new code does not reset it.
CREATE TABLE IF NOT EXISTS otp_attempts (
  identifier TEXT        PRIMARY KEY,
  attempts   INT         NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Email OTP code-to-token mapping ──────────────────────────────────────────
-- Maps a short-lived, independently-generated 6-digit code to the REAL
-- high-entropy NextAuth verification token for the same sign-in request.
-- Read/written by auth.js (insert) and app/api/auth/verify-otp/route.js
-- (lookup + delete on success). The code is NEVER itself usable as a
-- NextAuth token — /api/auth/verify-otp always translates code -> token
-- via this table before calling NextAuth's own callback endpoint, so
-- guessing the code only ever goes through that attempt-limited route.
-- token is stored in retrievable (plaintext) form deliberately: verification
-- must reconstruct the real callback call from a submitted code, which a
-- one-way hash would prevent. Same trust boundary as this database's other
-- plaintext secrets (e.g. accounts.access_token above).
CREATE TABLE IF NOT EXISTS otp_codes (
  identifier TEXT        NOT NULL,
  code       TEXT        NOT NULL,
  token      TEXT        NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, code)
);

-- ── Consultation-booking email verification ─────────────────────────────────
-- Anti-spam gate for the public Book-a-Consultation page (app/book-consultation/
-- page.jsx) — proves the visitor controls the email address before the Cal.com
-- booking widget is revealed. Deliberately SEPARATE from otp_codes/otp_attempts
-- above: those gate sign-in and must never share a lockout counter with this
-- unrelated, unauthenticated flow (a spammer burning wrong consultation-page
-- guesses must not also lock a real user out of signing in). No token/session
-- is issued here — a match just flips the page to the booking step client-side.
CREATE TABLE IF NOT EXISTS consultation_otp (
  identifier TEXT        NOT NULL,   -- email
  code       TEXT        NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, code)
);

CREATE TABLE IF NOT EXISTS consultation_otp_attempts (
  identifier TEXT        PRIMARY KEY,
  attempts   INT         NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
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

-- Saved Proposal Studio proposals — same shape as cas_portfolios: this row
-- is just the searchable/listable metadata, the full proposal payload
-- (selected funds, amounts, client details) lives in Vercel Blob at
-- blob_key. id is also the client-facing "Proposal ID" (displayed as
-- PROP-<first 8 hex chars, uppercased> by the app, not stored pre-formatted
-- here so the raw UUID stays the actual unique key).
CREATE TABLE IF NOT EXISTS proposals (
  id            TEXT        NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_name   TEXT        NOT NULL DEFAULT '',
  client_email  TEXT        NOT NULL DEFAULT '',
  client_phone  TEXT        NOT NULL DEFAULT '',
  proposal_type TEXT        NOT NULL,   -- 'lumpsum' | 'sip'
  total_amount  NUMERIC     NOT NULL DEFAULT 0,
  fund_count    INT         NOT NULL DEFAULT 0,
  blob_key      TEXT        NOT NULL,   -- Vercel Blob key for the full saved proposal JSON
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proposals_user ON proposals(user_id);

-- =============================================================================
-- Role values: 'client' | 'distributor' | 'admin'
-- Promote a user manually:
--   UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
-- =============================================================================
