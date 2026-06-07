-- scripts/screener-schema.sql
-- Run once in Vercel Storage → Query (or psql) before the first GitHub Actions run.
-- The nightly job DELETEs + bulk-INSERTs this table; the app reads it via /api/screener.

CREATE TABLE IF NOT EXISTS mf_screener (
  code          TEXT PRIMARY KEY,          -- AMFI scheme code (Regular + Growth)
  name          TEXT NOT NULL,
  amc           TEXT,
  category      TEXT,                       -- SEBI sub-category (from AMFI section header)
  structure     TEXT,                       -- 'Open Ended' / 'Close Ended' / 'Interval'
  nav           NUMERIC,
  nav_date      TEXT,
  ret_1m        NUMERIC,                    -- % absolute (sub-year, not annualised)
  ret_3m        NUMERIC,                    -- % absolute
  ret_6m        NUMERIC,                    -- % absolute
  ret_1y        NUMERIC,                    -- % CAGR (1y point-to-point)
  ret_3y        NUMERIC,                    -- % CAGR
  ret_5y        NUMERIC,                    -- % CAGR
  ret_7y        NUMERIC,                    -- % CAGR
  ret_10y       NUMERIC,                    -- % CAGR (uses a narrow window ~10y back; AMFI caps span at 5y, not reach)
  vol           NUMERIC,                    -- annualised volatility %, month-end basis
  max_dd        NUMERIC,                    -- max drawdown %, month-end basis
  ret_per_risk  NUMERIC,                    -- ret_3y / vol
  age_years     NUMERIC,                    -- years of NAV history available (capped at lookback)
  flag          TEXT,                       -- 'check' = implausible move, review before display
  asof          TEXT                        -- snapshot date (latest AMFI NAV date)
);

CREATE INDEX IF NOT EXISTS idx_mf_screener_category ON mf_screener (category);
CREATE INDEX IF NOT EXISTS idx_mf_screener_structure ON mf_screener (structure);
CREATE INDEX IF NOT EXISTS idx_mf_screener_ret3y ON mf_screener (ret_3y);
