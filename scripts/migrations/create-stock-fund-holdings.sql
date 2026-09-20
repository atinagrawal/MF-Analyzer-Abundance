-- =============================================================================
-- Migration: Create stock_fund_holdings & stock_fund_holdings_staging
-- "Who Owns This Stock?" Reverse Holdings Engine (§5.1)
-- =============================================================================

CREATE TABLE IF NOT EXISTS stock_fund_holdings (
  id BIGSERIAL PRIMARY KEY,
  stock_slug VARCHAR(120) NOT NULL,          -- canonical slug: 'hdfc-bank-ltd'
  ticker VARCHAR(30),                        -- NSE symbol: 'HDFCBANK'
  isin VARCHAR(12),                          -- ISIN: 'INE040A01034'
  company_name TEXT NOT NULL,                -- 'HDFC Bank Ltd'
  sector VARCHAR(120),                       -- 'Financial Services'
  holder_type VARCHAR(10) NOT NULL,          -- 'MF' or 'PMS'
  scheme_code VARCHAR(120) NOT NULL,         -- AMFI code or PMS strategy ID
  scheme_name TEXT NOT NULL,                 -- 'Parag Parikh Flexi Cap Fund'
  provider_name TEXT NOT NULL,               -- 'PPFAS Mutual Fund'
  category VARCHAR(120),                     -- 'Flexi Cap Fund'
  weight_pct NUMERIC(6, 3) NOT NULL,         -- 7.630
  market_value_cr NUMERIC(12, 2),            -- 11253.90 (NULL for PMS)
  as_of_date DATE NOT NULL,                  -- '2026-08-31'
  match_confidence VARCHAR(20) NOT NULL,     -- 'exact_symbol' | 'normalized_name' | 'manual_alias' | 'unmatched'
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_stock_scheme UNIQUE (stock_slug, scheme_code)
);

-- Performance & Query Indexes
CREATE INDEX IF NOT EXISTS idx_sfh_ticker ON stock_fund_holdings(ticker);
CREATE INDEX IF NOT EXISTS idx_sfh_stock_slug ON stock_fund_holdings(stock_slug);
CREATE INDEX IF NOT EXISTS idx_sfh_isin ON stock_fund_holdings(isin);
CREATE INDEX IF NOT EXISTS idx_sfh_scheme_code ON stock_fund_holdings(scheme_code);
CREATE INDEX IF NOT EXISTS idx_sfh_confidence ON stock_fund_holdings(match_confidence);
CREATE INDEX IF NOT EXISTS idx_sfh_ticker_weight ON stock_fund_holdings(ticker, weight_pct DESC);
CREATE INDEX IF NOT EXISTS idx_sfh_slug_weight ON stock_fund_holdings(stock_slug, weight_pct DESC);

-- Staging table for atomic zero-downtime ETL swaps
CREATE TABLE IF NOT EXISTS stock_fund_holdings_staging (
  LIKE stock_fund_holdings INCLUDING ALL
);
