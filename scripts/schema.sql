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

-- Public share links (docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md).
-- NULL = not currently shared. A non-null value is a high-entropy random
-- token (lib/proposalShareToken.js), distinct from the proposal's own id,
-- generated only when sharing is turned on. UNIQUE so a token can never
-- collide across proposals; the partial index keeps the index small since
-- most rows will have share_token = NULL.
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_proposals_share_token ON proposals(share_token) WHERE share_token IS NOT NULL;

-- ── users: paid-plan + distributor columns ──────────────────────────────────
-- Added by the Lifetime-plan and distributor-scoping features, after the
-- base `users` table above was first written. plan/plan_expires_at are the
-- source auth.js's session callback normalizes into session.user.plan
-- ('free' | 'pro'). Raw `plan` values: 'free' | 'pro' | 'pro_lifetime' |
-- 'trial' (a time-boxed Pro grant -- see app/api/admin/users/route.js's
-- PATCH handler and
-- docs/superpowers/specs/2026-08-17-pro-trial-mechanism-design.md). A
-- trial row is deliberately left as plan='trial' forever after it
-- expires -- doubles as a "this client has used a trial" marker for the
-- admin panel, since the session callback's own expiry check already
-- handles downgrading actual access without needing the stored value to
-- change. distributor_id/created_by back lib/permissions.js's
-- canManageUser() (a distributor may manage a client only if one of these
-- points at that distributor).
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan               TEXT NOT NULL DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_expires_at    TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS razorpay_order_id  TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS distributor_id     TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS created_by         TEXT REFERENCES users(id) ON DELETE SET NULL;

-- Which PAN, among this account's multi-PAN family CAS uploads, the CAS
-- Tracker should default its "active" tab to -- the first PAN casparser
-- happens to list is not necessarily the actual person using the tool.
-- Set via app/api/cas/default-pan/route.js; for an admin viewing a client
-- (?userId=), this is the CLIENT's own row, not the admin's -- it's a
-- property of whose family CAS this is, not who's currently looking at it.
-- No FK to a PANs table (PANs aren't a first-class entity anywhere else in
-- this schema either, e.g. pan_investor_names.pan is also a bare TEXT key).
ALTER TABLE users ADD COLUMN IF NOT EXISTS default_pan        TEXT;

-- Last time this user's session was checked by the app (throttled to at
-- most once/hour per user in the auth.js session callback, so this is
-- "active within the last hour" resolution, not exact). Powers "days since
-- last visit" in the admin panel and the lifecycle-email drip script's
-- win-back window -- neither of which had ANY usage signal before this,
-- since sessions rows are just NextAuth's token store, not a usage log.
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at      TIMESTAMPTZ;

-- Dedup log for automated lifecycle emails (scripts/send_lifecycle_emails.mjs
-- and auth.js's createUser welcome-email hook). UNIQUE(user_id, email_type)
-- is the actual guard against double-sends -- both callers INSERT ... ON
-- CONFLICT DO NOTHING rather than pre-checking, so a race between two runs
-- can't send the same email twice.
CREATE TABLE IF NOT EXISTS lifecycle_emails_sent (
  id         TEXT        NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
  user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email_type TEXT        NOT NULL,  -- 'welcome' | 'day3_nudge' | 'day14_winback' | 'trial_ended'
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, email_type)
);

-- ── Data-engine tables ───────────────────────────────────────────────────────
-- Populated by scheduled GitHub Actions workflows running scripts/*.mjs and
-- scripts/sync_*.js against public data sources (AMFI, BSE, NSE, mfapi.in),
-- not by user requests. The app only ever reads these.

-- MF screener — scripts/build-screener.mjs
CREATE TABLE IF NOT EXISTS mf_screener (
  code            TEXT    NOT NULL PRIMARY KEY,
  name            TEXT    NOT NULL,
  amc             TEXT,
  category        TEXT,
  structure       TEXT,
  isin            TEXT,
  nav             NUMERIC,
  nav_date        TEXT,
  ret_1m          NUMERIC,
  ret_3m          NUMERIC,
  ret_6m          NUMERIC,
  ret_1y          NUMERIC,
  ret_3y          NUMERIC,
  ret_5y          NUMERIC,
  ret_7y          NUMERIC,
  ret_10y         NUMERIC,
  ret_inception   NUMERIC,
  inception_date  TEXT,
  vol             NUMERIC,
  max_dd          NUMERIC,
  ret_per_risk    NUMERIC,
  age_years       NUMERIC,
  flag            TEXT,
  asof            TEXT
);
CREATE INDEX IF NOT EXISTS idx_mf_screener_category  ON mf_screener(category);
CREATE INDEX IF NOT EXISTS idx_mf_screener_structure ON mf_screener(structure);
CREATE INDEX IF NOT EXISTS idx_mf_screener_ret3y      ON mf_screener(ret_3y);

-- Resolved fund-inception cache (avoids re-resolving the same scheme's
-- since-inception NAV/date on every build-screener run) -- scripts/build-screener.mjs
CREATE TABLE IF NOT EXISTS mf_inception (
  code            TEXT    NOT NULL PRIMARY KEY,
  inception_date  TEXT    NOT NULL,
  inception_nav   NUMERIC NOT NULL,
  source          TEXT    NOT NULL
);

-- SEBI SIF (Specialised Investment Fund) screener — scripts/build-sif-screener.mjs
CREATE TABLE IF NOT EXISTS sif_screener (
  scheme_id                  TEXT    NOT NULL PRIMARY KEY,  -- e.g. 'SIF-01'
  nav_name                   TEXT    NOT NULL,
  sif_name                   TEXT,
  category                   TEXT,
  nav                        NUMERIC,
  nav_date                   TEXT,
  ret_1m                     NUMERIC,
  ret_3m                     NUMERIC,
  ret_6m                     NUMERIC,
  ret_1y                     NUMERIC,
  ret_3y                     NUMERIC,
  ret_5y                     NUMERIC,
  ret_7y                     NUMERIC,
  ret_10y                    NUMERIC,
  vol                        NUMERIC,
  max_dd                     NUMERIC,
  ret_per_risk               NUMERIC,
  age_years                  NUMERIC,
  inception_date             TEXT,
  ret_inception              NUMERIC,
  ret_inception_annualized   BOOLEAN,
  asof                       TEXT
);
CREATE INDEX IF NOT EXISTS idx_sif_screener_category ON sif_screener(category);

-- SEBI monthly stress-test / portfolio-concentration disclosures, per scheme
-- per month -- scripts/build-screener.mjs
CREATE TABLE IF NOT EXISTS mf_stress_test (
  scheme_code           INTEGER NOT NULL,
  scheme_name           TEXT    NOT NULL,
  amc_name              TEXT,
  category              TEXT    NOT NULL,
  month                 DATE    NOT NULL,
  aum_cr                NUMERIC,
  days_50pct            NUMERIC,
  days_25pct            NUMERIC,
  top10_investors_pct   NUMERIC,
  large_cap_pct         NUMERIC,
  mid_cap_pct           NUMERIC,
  small_cap_pct         NUMERIC,
  cash_pct              NUMERIC,
  std_dev_portfolio     NUMERIC,
  std_dev_benchmark     NUMERIC,
  beta                  NUMERIC,
  pe_portfolio          NUMERIC,
  pe_benchmark          NUMERIC,
  pe_benchmark_1ya      NUMERIC,
  pe_benchmark_2ya      NUMERIC,
  turnover_ratio        NUMERIC,
  fetched_at            TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (scheme_code, month)
);

-- BSE benchmark index dashboard (PE/PB/yield + trailing returns per index) --
-- scripts/build-bse-index-dashboard.mjs
CREATE TABLE IF NOT EXISTS bse_index_dashboard (
  symbol      TEXT NOT NULL PRIMARY KEY,
  name        TEXT NOT NULL,
  cat         TEXT NOT NULL,
  short       TEXT,
  r1m         NUMERIC,
  r3m         NUMERIC,
  r1y         NUMERIC,
  r3y         NUMERIC,
  r5y         NUMERIC,
  pe          NUMERIC,
  pb          NUMERIC,
  dy          NUMERIC,
  as_of       DATE,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bse_index_dashboard_cat ON bse_index_dashboard(cat);

-- Daily NSE-listed-stock OHLCV bars -- scripts/ingest-eod.mjs
CREATE TABLE IF NOT EXISTS stock_eod (
  trade_date  DATE    NOT NULL,
  isin        TEXT    NOT NULL,
  symbol      TEXT,
  name        TEXT,
  series      TEXT,
  open        NUMERIC,
  high        NUMERIC,
  low         NUMERIC,
  close       NUMERIC NOT NULL,
  prev_close  NUMERIC,
  volume      BIGINT,
  turnover    NUMERIC,
  PRIMARY KEY (trade_date, isin)
);
CREATE INDEX IF NOT EXISTS idx_stock_eod_isin_date ON stock_eod(isin, trade_date);
CREATE INDEX IF NOT EXISTS idx_stock_eod_date       ON stock_eod(trade_date);

-- Per-stock daily technical signals (DMAs, golden/death cross, 52w hi/lo) --
-- derived from stock_eod by scripts/build-signals.mjs
CREATE TABLE IF NOT EXISTS stock_signals (
  snap_date      DATE    NOT NULL,
  isin           TEXT    NOT NULL,
  symbol         TEXT,
  name           TEXT,
  close          NUMERIC,
  above_20       BOOLEAN,
  above_50       BOOLEAN,
  above_100      BOOLEAN,
  above_150      BOOLEAN,
  above_200      BOOLEAN,
  dma20          NUMERIC,
  dma50          NUMERIC,
  dma100         NUMERIC,
  dma150         NUMERIC,
  dma200         NUMERIC,
  golden_cross   BOOLEAN,
  death_cross    BOOLEAN,
  bull_stacked   BOOLEAN,
  bear_stacked   BOOLEAN,
  new_high_52w   BOOLEAN,
  new_low_52w    BOOLEAN,
  pct_from_52h   NUMERIC,
  pct_from_52l   NUMERIC,
  adv_dec        SMALLINT,
  PRIMARY KEY (snap_date, isin)
);
CREATE INDEX IF NOT EXISTS idx_stock_signals_date ON stock_signals(snap_date);
CREATE INDEX IF NOT EXISTS idx_stock_signals_isin ON stock_signals(isin, snap_date);

-- Market-wide breadth snapshot, one row per trading day -- scripts/build-breadth.mjs
CREATE TABLE IF NOT EXISTS market_breadth (
  snap_date     DATE PRIMARY KEY,
  universe      INTEGER,
  a20           INTEGER,
  t20           INTEGER,
  a50           INTEGER,
  t50           INTEGER,
  a100          INTEGER,
  t100          INTEGER,
  a150          INTEGER,
  t150          INTEGER,
  a200          INTEGER,
  t200          INTEGER,
  advancing     INTEGER,
  declining     INTEGER,
  unchanged     INTEGER,
  new_high      INTEGER,
  new_low       INTEGER,
  regime_pct    NUMERIC,
  golden_cross  INTEGER,
  death_cross   INTEGER,
  bull_stacked  INTEGER,
  bear_stacked  INTEGER,
  asof          TIMESTAMPTZ DEFAULT NOW()
);

-- Same breadth metrics as market_breadth, split per sector -- scripts/build-sector-breadth.mjs
CREATE TABLE IF NOT EXISTS sector_breadth (
  snap_date     DATE NOT NULL,
  sector        TEXT NOT NULL,
  universe      INTEGER,
  a20           INTEGER,
  t20           INTEGER,
  a50           INTEGER,
  t50           INTEGER,
  a100          INTEGER,
  t100          INTEGER,
  a150          INTEGER,
  t150          INTEGER,
  a200          INTEGER,
  t200          INTEGER,
  advancing     INTEGER,
  declining     INTEGER,
  unchanged     INTEGER,
  new_high      INTEGER,
  new_low       INTEGER,
  regime_pct    NUMERIC,
  golden_cross  INTEGER,
  death_cross   INTEGER,
  bull_stacked  INTEGER,
  bear_stacked  INTEGER,
  asof          TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (snap_date, sector)
);
CREATE INDEX IF NOT EXISTS idx_sector_breadth_date ON sector_breadth(snap_date);

-- ISIN -> sector lookup feeding sector_breadth -- scripts/ingest-sector-map.mjs
CREATE TABLE IF NOT EXISTS sector_isin_map (
  isin    TEXT NOT NULL,
  sector  TEXT NOT NULL,
  PRIMARY KEY (isin, sector)
);
CREATE INDEX IF NOT EXISTS idx_sector_isin_map_sector ON sector_isin_map(sector);

-- AMFI state-wise / age-wise AUM report, cached by calendar month since AMFI
-- only republishes it monthly -- pages/api/amfi-statewise.js (fetch-on-read,
-- not a scheduled sync script)
CREATE TABLE IF NOT EXISTS amfi_statewise_cache (
  id          SERIAL PRIMARY KEY,
  data_month  CHAR(7)     NOT NULL UNIQUE,  -- 'YYYY-MM'
  amfi_date   VARCHAR(20) NOT NULL,
  payload     JSONB       NOT NULL,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── manual_holdings: user-entered holdings not covered by a CAS upload ──────
-- Lets a client/distributor manually record a holding (e.g. an offline-only
-- fund, or one bought before CAS tracking started) alongside their uploaded
-- CAS portfolios. pan is optional -- ties the row into the same
-- pan_investor_names authorization model as cas_portfolios when set.
CREATE TABLE IF NOT EXISTS manual_holdings (
  id             SERIAL      PRIMARY KEY,
  user_id        TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fund_name      TEXT        NOT NULL,
  amfi_code      TEXT,
  fund_type      TEXT        NOT NULL DEFAULT 'Equity MF',
  units          NUMERIC     NOT NULL,
  purchase_nav   NUMERIC     NOT NULL,
  purchase_date  DATE,
  folio          TEXT,
  notes          TEXT,
  pan            TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS manual_holdings_user_idx ON manual_holdings(user_id);
CREATE INDEX IF NOT EXISTS manual_holdings_pan_idx  ON manual_holdings(pan) WHERE pan IS NOT NULL;

-- =============================================================================
-- Role values: 'client' | 'distributor' | 'admin'
-- Promote a user manually:
--   UPDATE users SET role = 'admin' WHERE email = 'you@example.com';
-- =============================================================================
