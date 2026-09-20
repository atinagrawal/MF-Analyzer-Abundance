# Technical Design Specification: "Who Owns This Stock?" Reverse Holdings Engine (§5.1)

**Platform:** Abundance Financial Services (`mfcalc.getabundance.in`)  
**Credentials:** Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor)  
**Status:** Design Phase (Pre-Implementation Architectural Review)  
**Date:** September 20, 2026  
**Target Delivery:** Tier 3 SEO & GEO Growth Initiative  

---

## 1. Executive Summary & Objective

Today, Abundance possesses a forward lookup engine: given a fund or SIF scheme code, [`lib/holdingsLookup.js`](file:///d:/workspace/MF-Analyzer-Abundance/lib/holdingsLookup.js) resolves its underlying portfolio holdings on demand and caches the result in Cloudflare R2 under `portfolio-creator-holdings/${amfiCode}.json`.

However, the high-intent organic search question:  
> *"Which mutual funds and PMS strategies hold Zomato / Reliance / HDFC Bank / CDSL?"*

cannot be answered by a forward lookup. Answering it requires an **inverted index** (`stock -> funds/strategies`).

This project builds:
1. An automated **ETL Data Pipeline** running on scheduled **GitHub Actions** that populates a complete R2 holdings cache of the active equity/hybrid fund universe and inverts it into a high-performance PostgreSQL table: `stock_fund_holdings`.
2. A high-leverage, programmatic SEO & GEO hub at **`/stocks-in-funds/[ticker]`** (repurposing the deprecated placeholder `app/stock-screener/page.js`), complete with interactive institutional ownership breakdowns, category splits, comparison deep-links, `FinancialProduct` schema markup, and token-efficient AI markdown feeds (`?format=md`).

---

## 2. Grounded Codebase Realities & Verified Truths

Following our codebase inspection and the initial verification findings:

### 2.1 The Groww Internal API Dependency (Accepted Operational Risk)
* **Reality**: [`lib/holdingsLookup.js`](file:///d:/workspace/MF-Analyzer-Abundance/lib/holdingsLookup.js) fetches fund holdings from Groww's undocumented internal endpoint (`groww.in/v1/api/data/mf/web/v1/scheme/search/...`). It is not an official public API.
* **Accepted Risk**: If Groww alters payload shapes, introduces Cloudflare CAPTCHAs, or aggressively rate-limits requests, the crawl could stall.
* **Engineering Mitigations in Spec**:
  1. **Internal Request-Level Throttle (No Bursting)**: `getHoldingsData()` makes multiple rapid sequential HTTP requests per fund (`resolveSearchId` + detail fetch + optional alias check). A simple outer sleep between funds is insufficient because internal requests would still burst with 0ms spacing. We implement a dedicated queue/token-bucket throttler guaranteeing that **every single outbound HTTP request to `groww.in`** is spaced by at least **500ms + randomized jitter (±100ms)**.
  2. **Exponential Backoff**: On HTTP 429 or 503, pause execution for `2s * retryCount` with up to 3 retries before logging failure.
  3. **Respecting 7-Day / Monthly Cache TTL**: Only fetch schemes that are completely missing from R2 or whose cached `ts` is older than the current monthly portfolio disclosure cycle (>7 days old and `as_of_date` is not latest).
  4. **Failure Isolation**: A failed fund lookup is appended to `data/reverse-holdings-needs-review.json` and does not crash the ETL pipeline; the inversion job proceeds with all successfully cached portfolios.

### 2.2 Recalibrated Fund Universe (Verified Live Against Postgres)
* The original SEO growth plan estimated *"~1,200 unique master portfolios"*.
* **Live Database Query**: We verified against `mf_screener` that the active universe of equity, hybrid, and solution-oriented schemes is currently **876 unique master schemes** (~870 funds).
* **Dynamic Derivation**: The sync script will **never hardcode 870 or 1,200**. Instead, it dynamically queries `mf_screener` for all non-debt, non-liquid master scheme records, deriving the target universe at runtime.

### 2.3 Repurposing `app/stock-screener/page.js`
* Codebase audit confirms `app/stock-screener/page.js` is a dead 5-line redirect (`redirect('/market-breadth')`), referenced nowhere else in navigation.
* It will be cleanly replaced with the new **`/stocks-in-funds`** hub and dynamic **`/stocks-in-funds/[ticker]`** route hierarchy.

### 2.4 PMS Factsheet Reality (Correcting the "18 Separate JSONs" Assumption)
* The original plan mentioned *"18 PMS factsheet JSONs"*.
* **Live R2 Reality**: PMS factsheet data is actually consolidated into **one unified R2 document: `pms-factsheets.json`** (synced monthly via `scripts/sync_pms_factsheets.js`).
* This single file contains **102 strategy documents** across **11 providers** (Carnelian, Motilal Oswal, Invesco, InCred, Green Portfolio, Aditya Birla, Negen, etc.), of which **25+ strategies** have Gemini-extracted `topHoldings` arrays.
* The batch inversion script reads this single `pms-factsheets.json` directly from R2, extracting all available strategy holdings without needing 18 separate HTTP round-trips.

### 2.5 Compute Environment: GitHub Actions, Not Vercel Functions
* Crawling ~870 funds at 2 req/sec requires ~7.5 to 9 minutes of wall-clock time on cold runs.
* Vercel Serverless Function execution limits (typically 15s–60s) cannot host this ETL job.
* The ETL will run on a scheduled GitHub Actions workflow (like `groww-exit-loads-sync.yml` and `pms-factsheets-sync.yml`) with a 30-minute timeout ceiling.

---

## 3. End-to-End System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PostgreSQL: mf_screener                         │
│       Query ~876 active equity, hybrid & solution-oriented funds       │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│        STEP 1: Proactive Cache Population (GitHub Action)              │
│        scripts/sync-all-fund-holdings.mjs                              │
│        - Checks Cloudflare R2 cache: portfolio-creator-holdings/*.json │
│        - Identifies missing or stale (>7d) schemes                     │
│        - Rate-limited fetch (2 req/s + jitter) via Groww internal API  │
│        - Stores normalized JSON in R2                                  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│        STEP 2: Batch Inversion & Normalization (GitHub Action)         │
│        scripts/build-reverse-holdings-index.mjs                        │
│        - Scans all R2 portfolio-creator-holdings/*.json                │
│        - Scans R2 pms-factsheets.json (extracted topHoldings)          │
│        - Maps security names & slugs to stock_signals (Ticker / ISIN)  │
│        - Inverts into { stock -> [holding funds & PMS strategies] }    │
│        - Atomic batch upsert into PostgreSQL: stock_fund_holdings      │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│        STEP 3: User-Facing Frontend & SEO Engine                       │
│        app/stocks-in-funds/page.jsx (Search & Popular Stock Hub)       │
│        app/stocks-in-funds/[ticker]/page.jsx                           │
│        - Server-rendered institutional holding table                   │
│        - Category allocation split & Top Concentrated Funds            │
│        - FinancialProduct & ItemList Schema JSON-LD                    │
│        - Universal Markdown Content Negotiation (?format=md)           │
│        - AMFI ARN-251838 Distributor Regulatory Citations              │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Pipeline Component 1: Proactive Cache Population

**Script:** `scripts/sync-all-fund-holdings.mjs`

### 4.1 Target Universe Selection Query
```sql
SELECT code, name, category, amc, nav, ret_3y
FROM mf_screener
WHERE category NOT ILIKE '%debt%'
  AND category NOT ILIKE '%liquid%'
  AND category NOT ILIKE '%money market%'
  AND category NOT ILIKE '%overnight%'
  AND category NOT ILIKE '%ultra short%'
  AND category NOT ILIKE '%gilt%'
  AND category NOT ILIKE '%duration%'
  AND category NOT ILIKE '%bond%'
  AND category NOT ILIKE '%floater%'
  AND category NOT ILIKE '%banking and psu%'
ORDER BY ret_3y DESC NULLS LAST, code ASC;
```

> [!NOTE]
> **AUM Data Location**: Fund AUM does *not* exist in `mf_screener` (the live schema contains performance, risk, and category metrics). Real fund AUM is loaded from Cloudflare R2: `amfi-aum.json` (as managed by `lib/holdingsLookup.js` via `createR2JsonCache('amfi-aum.json')`). If AUM-based crawl prioritization is desired, the script cross-references `code` against `amfi-aum.json` in memory.

### 4.2 Staleness Evaluation
For each fund `code`:
1. Query R2: `r2Get('portfolio-creator-holdings/${code}.json')`.
2. Freshness check:
   - If payload exists, contains `holdings` with `length > 0`, and `ts` is within 7 days, skip.
   - If payload is missing or stale, queue for fetch.

### 4.3 Rate-Limited Fetch Worker with Request-Level Throttling
Inside [`lib/holdingsLookup.js`](file:///d:/workspace/MF-Analyzer-Abundance/lib/holdingsLookup.js), resolving a single fund requires multiple sequential HTTP calls to Groww (`resolveSearchId` hitting `/search/v1/entity`, scheme detail fetch hitting `/scheme/search/${searchId}`, and optional alias checks). A simple outer delay between funds would still cause intra-fund request bursts with 0ms spacing.

The pipeline implements a **centralized request throttler** wrapping all outbound HTTP calls to `groww.in`:
```javascript
// Minimum delay queue / token bucket guaranteeing >= 500ms spacing between EVERY outbound HTTP request
class RequestThrottler {
  constructor(minDelayMs = 500, jitterMs = 100) {
    this.minDelayMs = minDelayMs;
    this.jitterMs = jitterMs;
    this.lastRequestTime = 0;
  }

  async acquire() {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    const requiredSpacing = this.minDelayMs + Math.random() * this.jitterMs;
    if (elapsed < requiredSpacing) {
      await sleep(requiredSpacing - elapsed);
    }
    this.lastRequestTime = Date.now();
  }
}
```

> [!IMPORTANT]
> **Throttler Scope & Opt-In Caller Design (Zero Latency Regression)**:
> `fetchWithRetry`, `resolveSearchId`, and `fetchFresh` are private to [`lib/holdingsLookup.js`](file:///d:/workspace/MF-Analyzer-Abundance/lib/holdingsLookup.js). Adding an unconditional delay inside `lib/holdingsLookup.js` would penalize live, user-facing callers (PortfolioReviewPlanner, Compare overlap engine, CAS Diagnostic create route, and fund detail pages) with an artificial 500ms+ delay on cache misses.
>
> Therefore, request throttling is strictly **opt-in**:
> - `getHoldingsData(amfiCode, schemeName, options = {})` accepts an optional `{ throttle: false }` configuration.
> - Default behavior (`throttle: false`) executes immediately with zero artificial delay, preserving identical, low-latency performance for all existing production callers.
> - When `options.throttle: true` (or when a shared `throttler` instance is provided), internal calls (`resolveSearchId`, detail fetch, alias checks) pass through `throttler.acquire()`.
> - Only the batch ETL script (`scripts/sync-all-fund-holdings.mjs`) passes `{ throttle: true }`, ensuring crawl safety without affecting user-facing application routes.

* **On HTTP 429 / 503**: Pauses execution for `2s * retryCount` (up to 3 retries) with exponential backoff.
* **On persistent failure**: Logs failure to `data/reverse-holdings-needs-review.json` and continues to the next fund.

---

## 5. Pipeline Component 2: Batch Inversion & Normalization

**Script:** `scripts/build-reverse-holdings-index.mjs`

### 5.1 Mutual Fund Inversion
1. Lists all `portfolio-creator-holdings/*.json` keys from R2.
2. Loads R2 `amfi-aum.json` for fallback AUM calculations.
3. For each fund:
   - Filters holdings to `assetClass === 'EQUITY'` (or instrumentType === 'Equity').
   - Normalizes `stockSlug` (e.g. `hdfc-bank-ltd`), `securityName` (e.g. `HDFC Bank Ltd`), and `sector`.
   - Derives `market_value_cr` via the **Market Value Waterfall**:
     - **Primary**: Direct read from cached holding object: `holding.marketValueCr` (`normalizeHoldings()` in `lib/holdingsLookup.js` already extracts `marketValueCr: parseFloat(h[7]) || 0` when generating the cached fund document).
     - **Fallback**: If `holding.marketValueCr` is 0, missing, or falsy, calculate `(holding.weightagePct / 100) * (aumCr || 0)`, where `aumCr` is resolved from `amfi-aum.json`.
   - Records: AMFI code, scheme name, AMC/provider name, category, `weightagePct`, `market_value_cr`, and `as_of_date`.

### 5.2 PMS Strategy Inversion
1. Fetches `r2Get('pms-factsheets.json')`.
2. Iterates across all providers and documents:
   - Checks `doc.extracted.topHoldings || doc.extracted.holdings`.
   - Normalizes stock name (e.g. "Laurus Labs" -> slug `laurus-labs-ltd`).
   - Sets `market_value_cr = null` (disclosed PMS factsheets report portfolio weight percentage only; absolute holding values in ₹ Cr are not disclosed by PMS providers).
   - Records: Holder type `'PMS'`, provider name (e.g. `'Carnelian'`), strategy name (e.g. `'Shift Strategy'`), weight %, `market_value_cr: null`, and document `period`.

### 5.3 Stock Ticker, ISIN Resolution & Match Confidence
To enable clean URLs like `/stocks-in-funds/HDFCBANK` or `/stocks-in-funds/RELIANCE`, each holding is cross-referenced against `stock_signals` / `stock_eod`:
- **Step A (`match_confidence = 'exact_symbol'`)**: Exact alphanumeric match against `stock_signals.symbol` (e.g. `HDFCBANK`, `INFY`, `TCS`).
- **Step B (`match_confidence = 'normalized_name'`)**: Normalized company name match against `stock_signals.name` (stripping `LTD`, `LIMITED`, `PVT`, punctuation).
- **Step C (`match_confidence = 'manual_alias'`)**: Matched via curated dictionary of known aliases (e.g. corporate renames, foreign shares like Alphabet/Amazon held by international or flexi cap funds).
- **Step D (`match_confidence = 'unmatched'`)**: Retains canonical `stock_slug` (e.g. `foreign-holding-xyz`); `ticker` and `isin` set to `null`. Enables auditing of unmapped securities without dropping records.

---

## 6. Pipeline Component 3: Database Schema (`stock_fund_holdings`)

### 6.1 Table DDL
```sql
CREATE TABLE IF NOT EXISTS stock_fund_holdings (
  id BIGSERIAL PRIMARY KEY,
  stock_slug VARCHAR(120) NOT NULL,          -- canonical slug: 'hdfc-bank-ltd'
  ticker VARCHAR(30),                        -- NSE symbol: 'HDFCBANK'
  isin VARCHAR(12),                          -- ISIN: 'INE040A01034'
  company_name TEXT NOT NULL,                -- 'HDFC Bank Ltd'
  sector VARCHAR(80),                        -- 'Financial Services'
  holder_type VARCHAR(10) NOT NULL,          -- 'MF' or 'PMS'
  scheme_code VARCHAR(40) NOT NULL,          -- AMFI code or PMS strategy ID
  scheme_name TEXT NOT NULL,                 -- 'Parag Parikh Flexi Cap Fund'
  provider_name TEXT NOT NULL,               -- 'PPFAS Mutual Fund'
  category VARCHAR(80),                      -- 'Flexi Cap Fund'
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
```

### 6.2 Atomic Table Refresh & Snapshot-Only Scope (Zero Downtime)
To avoid queries hitting half-populated tables during the monthly inversion:
1. Populate `stock_fund_holdings_staging`.
2. In a single atomic PostgreSQL transaction:
   ```sql
   BEGIN;
   DROP TABLE IF EXISTS stock_fund_holdings_old;
   ALTER TABLE IF EXISTS stock_fund_holdings RENAME TO stock_fund_holdings_old;
   ALTER TABLE stock_fund_holdings_staging RENAME TO stock_fund_holdings;
   DROP TABLE IF EXISTS stock_fund_holdings_old;
   COMMIT;
   ```

> [!NOTE]
> **Snapshot-Only Scope (v1)**: The table intentionally stores the latest monthly disclosure snapshot only. Historical time-series comparisons or monthly shift tracking (e.g. "Funds that bought/sold this month") are out of scope for v1 and reserved for a future release.

---

## 7. Pipeline Component 4: GitHub Actions Workflow

**File:** `.github/workflows/reverse-holdings-sync.yml`

* **Schedule**:
  - Mutual funds disclose portfolios monthly by the 10th.
  - Runs on the **11th and 18th of every month at 04:00 UTC** (giving buffer for AMC factsheet releases and vendor ingestion).
  - Also includes `workflow_dispatch` for manual triggers.
* **Environment**:
  - `runs-on: ubuntu-latest`
  - `timeout-minutes: 30`
  - Secrets required: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `DATABASE_URL`.
* **Execution Steps**:
  1. `node scripts/sync-all-fund-holdings.mjs`
  2. `node scripts/build-reverse-holdings-index.mjs`
  3. Upload `reverse-holdings-needs-review.json` as build artifact.

---

## 8. Frontend Route Architecture (`/stocks-in-funds/[ticker]`)

### 8.1 URL Structure & Resolution (Approved Decisions)
* **Canonical URL Scheme**: Primary canonical URL is uppercase NSE symbol (e.g. `/stocks-in-funds/HDFCBANK`). Lowercase slugs (e.g. `/stocks-in-funds/hdfc-bank-ltd`) issue a permanent `308` redirect to the uppercase ticker.
* **Hub Page**: `app/stocks-in-funds/page.jsx`
  - Search input with instant autocomplete matching ~1,500 NSE stocks.
  - "Most Widely Held Stocks" leaderboard (Top 50 stocks by mutual fund count and aggregate institutional holding value in ₹ Cr).
  - Top institutional moves / sector distribution.
* **Detail Page**: `app/stocks-in-funds/[ticker]/page.jsx`
  - Resolves `params.ticker` by uppercase NSE symbol (`HDFCBANK`) or redirects lowercase slug (`hdfc-bank-ltd`).
  - Fetches all holders from `stock_fund_holdings`:
    - Summary metrics: Total Fund Count, Total ₹ Cr Held, Average Portfolio Weight, Top Holding Scheme.
    - Category breakdown bar (e.g. 35% Flexi Cap, 28% Large Cap, 18% ELSS, etc.).
    - Unified Institutional Holders Data Table:
      - Filter Pills: `[All | Mutual Funds | PMS]` with distinct "PMS" badges for strategy entries.
      - Columns: Scheme Name, Category, Provider (AMC), Allocation Weight (%), Market Value (₹ Cr, displays "—" for PMS), 3Y CAGR, Detail Link (`/fund/[code]`).
      - Category filter dropdown (e.g. "Only Mid Cap", "Only Small Cap").
      - Direct Comparison Action: Checkbox selection of any 2 funds -> "Compare Funds" -> redirects directly to `/compare/[slug-a]-vs-[slug-b]`!

### 8.2 SEO, GEO & Schema Integration
* **Canonical URL**: `https://mfcalc.getabundance.in/stocks-in-funds/[ticker]`
* **Title Format**: `Who Owns [Company Name]? Top Mutual Funds & PMS Holding [Ticker] | Abundance`
* **Meta Description**: `Discover which mutual funds and PMS strategies hold [Company Name] ([Ticker]). View complete portfolio weights, market values, and top institutional holders. Abundance Financial Services (ARN-251838) · Atin Kumar Agrawal (APRN04279).`
* **Structured Data (JSON-LD)**:
  - `FinancialProduct` describing the stock and institutional holding metrics.
  - `ItemList` schema enumerating the top 10 holding schemes with direct links.
  - `BreadcrumbList`: Home -> Stocks in Funds -> [Ticker].
* **Universal Markdown Feed (`?format=md`)**:
  - Following our verified pattern on `/fund/[code]` and `/compare/[slug]`:
  - AI bots (`GPTBot`, `PerplexityBot`, `ClaudeBot`) receive concise, high-density markdown tables detailing institutional ownership for GEO citations.

### 8.3 Regulatory Boundary Enforcement (AMFI ARN-251838 & APMI APRN04279)
* No subjective buy/sell recommendations or rating badges (e.g., *"Must-buy stock because funds are buying"*).
* Display strictly factual data from SEBI-mandated monthly portfolio disclosures.
* Mandatory disclaimer footer:
  > *"Institutional holding data compiled from publicly disclosed mutual fund and PMS monthly factsheets. For informational purposes only; does not constitute investment advice, equity research, or a stock recommendation. Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor)."*

---

## 9. Implementation Roadmap & Phasing

- **Phase 1**: Database Schema & Migration (`stock_fund_holdings` + staging + indexes).
- **Phase 2**: Universal Cache Population Script with Request-Level Throttler (`scripts/sync-all-fund-holdings.mjs`).
- **Phase 3**: Batch Inversion & Normalization Script with Waterfall AUM & Match Confidence (`scripts/build-reverse-holdings-index.mjs`).
- **Phase 4**: GitHub Actions Workflow Setup (`.github/workflows/reverse-holdings-sync.yml`).
- **Phase 5**: Frontend Hub & Detail Pages (`app/stocks-in-funds/` & `[ticker]/`, deleting `app/stock-screener/page.js`).
- **Phase 6**: Markdown Feed (`?format=md`), SEO Schemas & Live Verification.

---

## 10. Design Decisions Summary (Confirmed & Approved)
1. **Primary Canonical URL**: Uppercase NSE symbol (e.g. `/stocks-in-funds/HDFCBANK`) with 308 redirect from slug (e.g. `/stocks-in-funds/hdfc-bank-ltd`).
2. **Holders Table Presentation**: Unified table with `[All | Mutual Funds | PMS]` filter pills and distinct "PMS" badge.
3. **Data Scope**: Monthly snapshot only (v1 scope).
4. **Market Value Derivation**: Positional `h[7]` -> Fallback `(weightagePct / 100) * aumCr` from `amfi-aum.json` -> `NULL` for PMS.
5. **Crawl Safety**: Request-level throttler guaranteeing >= 500ms spacing between *every* individual HTTP request to Groww.
6. **Regulatory Attribution**: Distinct legal recognition of Abundance Financial Services (ARN-251838) and Atin Kumar Agrawal (APRN04279).
