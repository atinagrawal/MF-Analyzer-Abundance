# Technical Design Specification: Per-Index Detail & Constituent Pages (Phase 1)

**Document ID:** `2026-09-22-index-constituent-pages-phase1-design`  
**Author:** Gemini (Antigravity AI)  
**Reviewed by:** Atin Kumar Agrawal (Owner & Principal Distributor)  
**Status:** Under Review — Gated before implementation  
**Reference Briefs:**  
- [`docs/INDEX_CONSTITUENT_PAGES_RESEARCH_BRIEF.md`](file:///d:/workspace/MF-Analyzer-Abundance/docs/INDEX_CONSTITUENT_PAGES_RESEARCH_BRIEF.md)  
- [`docs/superpowers/specs/2026-09-22-index-constituent-pages-research-findings.md`](file:///d:/workspace/MF-Analyzer-Abundance/docs/superpowers/specs/2026-09-22-index-constituent-pages-research-findings.md)  
- [`docs/INDEX_CONSTITUENT_PAGES_PHASE1_BRIEF.md`](file:///d:/workspace/MF-Analyzer-Abundance/docs/INDEX_CONSTITUENT_PAGES_PHASE1_BRIEF.md)

---

## 1. Executive Summary & Objectives

This specification defines the technical design for **Phase 1 of Per-Index Detail Pages** at `/indices/[slug]`. 

While `/indices` provides an aggregate valuation and performance dashboard across 284 Indian market benchmarks, individual index pages give retail investors, financial advisors, and AI engines deep visibility into:
1. **Full Constituent Rosters:** All individual underlying stocks (Symbol, Company Name, Macro Sector, Series, ISIN).
2. **Reverse Stock Holdings Engine Integration:** Every constituent stock deep-links directly to `/stocks-in-funds?stock=<SYMBOL>`, allowing users to immediately inspect institutional mutual fund ownership, concentration, and fund manager buy/sell activity.
3. **Valuation Gauges & TRI Performance:** Trailing P/E, P/B, Dividend Yield, historical fair-value bands, and 1M/3M/1Y/3Y/5Y Total Return Index (TRI) CAGRs.
4. **Top 10 Weights & Sector Distributions:** Extracted from official monthly factsheets.
5. **Generative Engine Optimization (GEO):** Token-dense Markdown feeds (`/indices/[slug]?format=md` and `Accept: text/markdown`) with full regulatory attribution (*ARN-251838 / APRN04279*).
6. **Structured Data:** Granular `schema.org/Dataset` (anchored to `#constituents`), `schema.org/FinancialProduct`, `schema.org/FAQPage`, and `schema.org/BreadcrumbList`.
7. **Abundance Pro Monetization:** Free public access to the constituent table and metrics; Pro-gating for one-click CSV export, multi-index overlap analysis, and historical rebalance audits.

---

## 2. Reconciled Phase 1 Index Scope (Exactly 64 Indices)

The Phase 1 scope reconciles **all 20 Broad Market NSE indices**, **all 36 Strategy/Factor NSE indices**, and **8 Core BSE benchmark indices**. Every index in this table has a live-verified, working constituent data source.

### 2.1 Complete Phase 1 Master Scope Table

| # | Index Name | Exchange | Category | Slug | Source Type & Identifier | Constituents |
|:---|:---|:---:|:---|:---|:---|:---:|
| 1 | Nifty 50 | NSE | Broad Market | `nifty-50` | CSV: `ind_nifty50list.csv` | 50 |
| 2 | Nifty Next 50 | NSE | Broad Market | `nifty-next-50` | CSV: `ind_niftynext50list.csv` | 50 |
| 3 | Nifty 100 | NSE | Broad Market | `nifty-100` | CSV: `ind_nifty100list.csv` | 100 |
| 4 | Nifty 200 | NSE | Broad Market | `nifty-200` | CSV: `ind_nifty200list.csv` | 200 |
| 5 | Nifty 500 | NSE | Broad Market | `nifty-500` | CSV: `ind_nifty500list.csv` | 501 |
| 6 | Nifty Midcap 150 | NSE | Broad Market | `nifty-midcap-150` | CSV: `ind_niftymidcap150list.csv` | 150 |
| 7 | Nifty Midcap 50 | NSE | Broad Market | `nifty-midcap-50` | CSV: `ind_niftymidcap50list.csv` | 50 |
| 8 | Nifty Smallcap 250 | NSE | Broad Market | `nifty-smallcap-250` | CSV: `ind_niftysmallcap250list.csv` | 251 |
| 9 | Nifty Smallcap 50 | NSE | Broad Market | `nifty-smallcap-50` | CSV: `ind_niftysmallcap50list.csv` | 50 |
| 10 | Nifty LargeMidcap 250 | NSE | Broad Market | `nifty-largemidcap-250` | CSV: `ind_niftylargemidcap250list.csv` | 250 |
| 11 | Nifty MidSmallcap 400 | NSE | Broad Market | `nifty-midsmallcap-400` | CSV: `ind_niftymidsmallcap400list.csv` | 401 |
| 12 | Nifty Midcap 100 | NSE | Broad Market | `nifty-midcap-100` | CSV: `ind_niftymidcap100list.csv` | 100 |
| 13 | Nifty Smallcap 100 | NSE | Broad Market | `nifty-smallcap-100` | CSV: `ind_niftysmallcap100list.csv` | 100 |
| 14 | Nifty500 Multicap 50:25:25 | NSE | Broad Market | `nifty500-multicap-50-25-25` | CSV: `ind_nifty500multicap502525_list.csv` | 501 |
| 15 | Nifty Microcap 250 | NSE | Broad Market | `nifty-microcap-250` | CSV: `ind_niftymicrocap250_list.csv` | 254 |
| 16 | Nifty Midcap Select | NSE | Broad Market | `nifty-midcap-select` | CSV: `ind_niftymidcapselect_list.csv` | 25 |
| 17 | Nifty Total Market | NSE | Broad Market | `nifty-total-market` | CSV: `ind_niftytotalmarket_list.csv` | 755 |
| 18 | Nifty500 LargeMidSmall Equal-Cap Weighted | NSE | Broad Market | `nifty500-largemidsmall-equal-cap-weighted` | CSV: `ind_nifty500largemidsmallequalcapweighted_list.csv` | 501 |
| 19 | Nifty Smallcap 500 | NSE | Broad Market | `nifty-smallcap-500` | CSV: `ind_niftysmallcap500_list.csv` | 505 |
| 20 | Nifty MidSmallcap400 50:50 | NSE | Broad Market | `nifty-midsmallcap400-50-50` | CSV: `ind_niftymidsmallcap4005050_list.csv` | 401 |
| 21 | Nifty100 Alpha 30 | NSE | Strategy / Factor | `nifty100-alpha-30` | CSV: `ind_nifty100alpha30list.csv` | 30 |
| 22 | Nifty100 Equal Weight | NSE | Strategy / Factor | `nifty100-equal-weight` | CSV: `ind_nifty100equalweightlist.csv` | 100 |
| 23 | Nifty100 Low Volatility 30 | NSE | Strategy / Factor | `nifty100-low-volatility-30` | CSV: `ind_nifty100lowvolatility30list.csv` | 30 |
| 24 | Nifty100 Quality 30 | NSE | Strategy / Factor | `nifty100-quality-30` | CSV: `ind_nifty100quality30list.csv` | 30 |
| 25 | Nifty200 Alpha 30 | NSE | Strategy / Factor | `nifty200-alpha-30` | CSV: `ind_nifty200alpha30list.csv` | 30 |
| 26 | Nifty200 Momentum 30 | NSE | Strategy / Factor | `nifty200-momentum-30` | CSV: `ind_nifty200momentum30list.csv` | 30 |
| 27 | Nifty200 Quality 30 | NSE | Strategy / Factor | `nifty200-quality-30` | CSV: `ind_nifty200quality30list.csv` | 30 |
| 28 | Nifty200 Value 30 | NSE | Strategy / Factor | `nifty200-value-30` | CSV: `ind_nifty200valuelist.csv` | 30 |
| 29 | Nifty500 Equal Weight | NSE | Strategy / Factor | `nifty500-equal-weight` | CSV: `ind_nifty500equalweight_list.csv` | 501 |
| 30 | Nifty500 Flexicap Quality 30 | NSE | Strategy / Factor | `nifty500-flexicap-quality-30` | CSV: `ind_nifty500flexicapquality30_list.csv` | 30 |
| 31 | Nifty500 Low Volatility 50 | NSE | Strategy / Factor | `nifty500-low-volatility-50` | CSV: `ind_nifty500lowvolatility50_list.csv` | 50 |
| 32 | Nifty500 Momentum 50 | NSE | Strategy / Factor | `nifty500-momentum-50` | CSV: `ind_nifty500momentum50_list.csv` | 50 |
| 33 | Nifty500 Multicap Momentum Quality 50 | NSE | Strategy / Factor | `nifty500-multicap-momentum-quality-50` | CSV: `ind_nifty500multicapmomentumquality50_list.csv` | 50 |
| 34 | Nifty500 Multifactor MQVLv 50 | NSE | Strategy / Factor | `nifty500-multifactor-mqvlv-50` | CSV: `ind_nifty500multifactormqvl50_list.csv` | 50 |
| 35 | Nifty500 Quality 50 | NSE | Strategy / Factor | `nifty500-quality-50` | CSV: `ind_nifty500quality50_list.csv` | 50 |
| 36 | Nifty500 Value 50 | NSE | Strategy / Factor | `nifty500-value-50` | CSV: `ind_nifty500value50_list.csv` | 50 |
| 37 | Nifty50 Equal Weight | NSE | Strategy / Factor | `nifty50-equal-weight` | CSV: `ind_nifty50equalweightlist.csv` | 50 |
| 38 | Nifty50 Value 20 | NSE | Strategy / Factor | `nifty50-value-20` | CSV: `ind_nifty50valuelist.csv` | 20 |
| 39 | Nifty Alpha 50 | NSE | Strategy / Factor | `nifty-alpha-50` | CSV: `ind_niftyalpha50list.csv` | 50 |
| 40 | Nifty Alpha Low-Volatility 30 | NSE | Strategy / Factor | `nifty-alpha-low-volatility-30` | CSV: `ind_niftyalphalowvolatility30list.csv` | 30 |
| 41 | Nifty Alpha Quality Low-Volatility 30 | NSE | Strategy / Factor | `nifty-alpha-quality-low-volatility-30` | CSV: `ind_niftyalphaqualitylowvolatility30list.csv` | 30 |
| 42 | Nifty Alpha Quality Value Low-Volatility 30 | NSE | Strategy / Factor | `nifty-alpha-quality-value-low-volatility-30` | CSV: `ind_niftyalphaqualityvaluelowvolatility30_list.csv` | 30 |
| 43 | Nifty Dividend Opportunities 50 | NSE | Strategy / Factor | `nifty-dividend-opportunities-50` | CSV: `ind_niftydivopps50list.csv` | 50 |
| 44 | Nifty Growth Sectors 15 | NSE | Strategy / Factor | `nifty-growth-sectors-15` | CSV: `ind_niftygrowthsectors15list.csv` | 15 |
| 45 | Nifty High Beta 50 | NSE | Strategy / Factor | `nifty-high-beta-50` | CSV: `ind_niftyhighbeta50list.csv` | 50 |
| 46 | Nifty Low Volatility 50 | NSE | Strategy / Factor | `nifty-low-volatility-50` | CSV: `ind_niftylowvolatility50list.csv` | 50 |
| 47 | Nifty Midcap150 Momentum 50 | NSE | Strategy / Factor | `nifty-midcap150-momentum-50` | CSV: `ind_niftymidcap150momentum50_list.csv` | 50 |
| 48 | Nifty Midcap150 Quality 50 | NSE | Strategy / Factor | `nifty-midcap150-quality-50` | CSV: `ind_niftymidcap150quality50_list.csv` | 50 |
| 49 | Nifty MidSmallcap400 Momentum Quality 100 | NSE | Strategy / Factor | `nifty-midsmallcap400-momentum-quality-100` | CSV: `ind_niftymidsmallcap400momentumquality100_list.csv` | 100 |
| 50 | Nifty Quality Low-Volatility 30 | NSE | Strategy / Factor | `nifty-quality-low-volatility-30` | CSV: `ind_niftyqualitylowvolatility30list.csv` | 30 |
| 51 | Nifty Smallcap250 Momentum Quality 100 | NSE | Strategy / Factor | `nifty-smallcap250-momentum-quality-100` | CSV: `ind_niftysmallcap250momentumquality100_list.csv` | 100 |
| 52 | Nifty Smallcap250 Quality 50 | NSE | Strategy / Factor | `nifty-smallcap250-quality-50` | CSV: `ind_niftysmallcap250quality50_list.csv` | 50 |
| 53 | Nifty Top 10 Equal Weight | NSE | Strategy / Factor | `nifty-top-10-equal-weight` | CSV: `ind_niftytop10equalweight_list.csv` | 10 |
| 54 | Nifty Top 15 Equal Weight | NSE | Strategy / Factor | `nifty-top-15-equal-weight` | CSV: `ind_niftytop15equalweight_list.csv` | 15 |
| 55 | Nifty Top 20 Equal Weight | NSE | Strategy / Factor | `nifty-top-20-equal-weight` | CSV: `ind_niftytop20equalweight_list.csv` | 20 |
| 56 | Nifty Total Market Momentum Quality 50 | NSE | Strategy / Factor | `nifty-total-market-momentum-quality-50` | CSV: `ind_niftytotalmarketmomentumquality50_list.csv` | 50 |
| 57 | BSE SENSEX | BSE | Broad Market | `bse-sensex` | JSON: `AsiaIndexAPI code=16` | 30 |
| 58 | BSE 500 | BSE | Broad Market | `bse-500` | JSON: `AsiaIndexAPI code=17` | 500 |
| 59 | BSE 100 | BSE | Broad Market | `bse-100` | JSON: `AsiaIndexAPI code=22` | 100 |
| 60 | BSE 200 | BSE | Broad Market | `bse-200` | JSON: `AsiaIndexAPI code=23` | 200 |
| 61 | BSE MidCap | BSE | Broad Market | `bse-midcap` | JSON: `AsiaIndexAPI code=81` | 157 |
| 62 | BSE SmallCap | BSE | Broad Market | `bse-smallcap` | JSON: `AsiaIndexAPI code=103` | 250 |
| 63 | BSE SENSEX 50 | BSE | Broad Market | `bse-sensex-50` | JSON: `AsiaIndexAPI code=98` | 50 |
| 64 | BSE SENSEX Next 50 | BSE | Broad Market | `bse-sensex-next-50` | JSON: `AsiaIndexAPI code=99` | 50 |

---

## 3. Architecture & Data Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA INGESTION PIPELINE                         │
├──────────────────────────────────┬─────────────────────────────────────┤
│ 1. NSE Constituent Worker        │ 2. BSE Constituent Worker           │
│    - niftyindices.com CSVs       │    - bseindices.com AsiaIndexAPI    │
│    - 56 Phase 1 indices          │    - 8 Core Phase 1 indices         │
│    - User-Agent + 5s timeout     │    - REST JSON endpoint             │
└────────────────┬─────────────────┴──────────────────┬──────────────────┘
                 │                                    │
                 ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       STORAGE & DUAL PERSISTENCE                       │
├──────────────────────────────────┬─────────────────────────────────────┤
│ Cloudflare R2 Cache              │ PostgreSQL Database                 │
│  Key: index-constituents/        │  Table: index_constituents          │
│       <slug>.json                │  Columns: (index_slug, symbol, isin,│
│  Fast serverless fallback        │           company_name, industry,   │
│                                  │           exchange, as_of_date)     │
└────────────────┬─────────────────┴──────────────────┬──────────────────┘
                 │                                    │
                 ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                        DATA ACCESS LAYER                               │
├────────────────────────────────────────────────────────────────────────┤
│ lib/indexConstituents.js                                               │
│  - getIndexDetail(slug): Merges valuation & returns (lib/indicesData)  │
│    with constituent roster (Postgres / R2 cache)                       │
│  - getIndexConstituents(slug): Returns structured constituent array    │
│  - formatIndexMarkdown(slug): Generates token-dense GEO Markdown feed  │
└────────────────┬────────────────────────────────────┬──────────────────┘
                 │                                    │
                 ├────────────────────────────────────┤
                 ▼                                    ▼
┌──────────────────────────────────┬─────────────────────────────────────┐
│          FRONTEND UI             │        AI / GEO MARKDOWN FEED       │
├──────────────────────────────────┼─────────────────────────────────────┤
│ • /indices/[slug] Page           │ • app/api/indices/[slug]/route.js   │
│   - Hero: Name, Exchange, P/E    │   - text/markdown; charset=utf-8    │
│   - Valuation Gauges + TRI Table │   - Factual valuation & CAGRs       │
│   - Top 10 Weights & Sector bars │   - Complete constituent table      │
│   - Searchable Constituent Table │   - Regulatory attribution          │
│   - Deep links to /stocks-in-    │ • Edge Middleware Content Negot.    │
│     funds?stock=...              │   - /indices/:slug?format=md        │
│   - Pro Gated: Export CSV &      │   - Accept: text/markdown           │
│     Overlap Analyser             │ • Sitemaps: app/sitemap-indices.xml │
└──────────────────────────────────┴─────────────────────────────────────┘
```

---

## 4. Database Schema Specification

Following the migration pattern in [`scripts/schema.sql`](file:///d:/workspace/MF-Analyzer-Abundance/scripts/schema.sql), we define the `index_constituents` table and metadata lookup table:

```sql
-- Table: index_constituents
-- Stores constituent stocks for all tracked NSE and BSE indices
CREATE TABLE IF NOT EXISTS index_constituents (
  id           BIGSERIAL PRIMARY KEY,
  index_slug   TEXT NOT NULL,
  symbol       TEXT NOT NULL,
  isin         TEXT,
  company_name TEXT NOT NULL,
  industry     TEXT,
  series       TEXT DEFAULT 'EQ',
  exchange     TEXT NOT NULL, -- 'NSE' or 'BSE'
  weight_pct   NUMERIC,       -- Populated for equal-weight or factsheet top-10
  as_of_date   DATE NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_index_stock UNIQUE (index_slug, symbol, as_of_date)
);

-- Fast lookup index for index detail views
CREATE INDEX IF NOT EXISTS idx_constituents_slug_date 
  ON index_constituents (index_slug, as_of_date DESC);

-- Fast lookup for reverse queries ("Which indices contain this stock?")
CREATE INDEX IF NOT EXISTS idx_constituents_symbol 
  ON index_constituents (symbol);

CREATE INDEX IF NOT EXISTS idx_constituents_isin 
  ON index_constituents (isin);
```

---

## 5. Ingestion Pipeline & Automation

### 5.1 Ingestion Script: `scripts/sync-index-constituents.mjs`
Modeled on `scripts/build-bse-index-dashboard.mjs` and `scripts/sync-all-fund-holdings.mjs`:
1. Iterates over the 64 Phase 1 master index configurations.
2. Fetches constituent data with:
   - User-Agent header: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36`
   - Strict 8-second timeout (`AbortSignal.timeout(8000)`)
   - Exponential backoff retry (up to 2 retries on 5xx or network drop)
3. Defensive verification:
   - For NSE: Validates that response is `application/octet-stream` or `text/csv`, starts with `Company Name,Industry,Symbol`, and row count $\ge 10$.
   - For BSE: Validates that response is valid JSON with `Table.length >= 10`.
4. Upserts into Postgres (`index_constituents`) and writes a JSON snapshot to Cloudflare R2 under `index-constituents/<slug>.json`.
5. Logs an audit summary. If an individual index fetch fails, the script continues to sync remaining indices and exits with non-zero error reporting so GitHub Actions surfaces the failure immediately.

### 5.2 GitHub Actions Workflow: `.github/workflows/index-constituents-sync.yml`
```yaml
name: Index Constituents Bi-Weekly Sync

on:
  schedule:
    # Runs on the 1st and 16th of each month at 04:00 UTC (09:30 IST)
    # Rebalance effective dates occur at month-end; 1st captures fresh additions
    - cron: '0 4 1,16 * *'
  workflow_dispatch:

concurrency:
  group: index-constituents-sync
  cancel-in-progress: false

jobs:
  sync:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Install dependencies
        run: npm install pg aws4fetch --no-save

      - name: Ingest Index Constituents
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          POSTGRES_URL: ${{ secrets.DATABASE_URL }}
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
        run: node scripts/sync-index-constituents.mjs
```

---

## 6. Page Architecture & Component Specifications

### 6.1 Server Component (`app/indices/[slug]/page.jsx`)
* **Route:** `/indices/[slug]`
* **Rendering:** Incremental Static Regeneration (ISR `revalidate = 21600` / 6 hours).
* **Metadata:** Programmatic title and description tailored for search intent:
  * *Title:* `{Index Name} Constituents, Holdings & Valuation ({Year}) | Abundance`
  * *Description:* `Complete constituent list of {Index Name} ({Exchange}) tracking {N} companies. View P/E ({PE}x), P/B, Dividend Yield, sector weights, and institutional mutual fund ownership. Abundance Financial Services (ARN-251838) · Atin Kumar Agrawal (APRN04279).`
* **JSON-LD Structured Data:**
  - `schema.org/FinancialProduct` (Index definition)
  - `schema.org/Dataset` (Anchored to `#constituents`, listing `variableMeasured: ["Stock Symbol", "ISIN", "Sector", "Exchange"]`)
  - `schema.org/BreadcrumbList` (`Home` → `Market Indices` → `{Index Name}`)
  - `schema.org/FAQPage` (4 contextual Q&As generated per index)
* **Pre-rendering:** Renders the complete H1, breadcrumbs, valuation hero, educational guide, accessible FAQ accordion, and complete constituent table directly into static HTML for 0-JS crawlability.

### 6.2 Client Component (`app/indices/[slug]/IndexDetailClient.jsx`)
Encapsulates all client-side interactivity:
1. **Interactive Search:** Instant token filtering by company name or stock symbol.
2. **Sector Filter Pills:** Filter constituent table by Macro-Economic Sector.
3. **Table Columns:**
   - `#` (Row index)
   - `Company Name`
   - `Symbol` (Badged with exchange `NSE` or `BSE`)
   - `Sector / Industry`
   - `ISIN`
   - `MF Ownership Action` → **`View Funds Holding This Stock ➔`** (Deep link to `/stocks-in-funds?stock=${symbol}`)
4. **Valuation Gauges:** Visual P/E gauge bar showing the index's current level against historical zones (Undervalued / Fair Value / Overvalued).
5. **Top 10 Constituents & Sector Weight Bars:** Renders visual breakdown if weight data is available.

---

## 7. Free vs. Pro Gating Specification

Following the site's standard pattern (used in `app/indices/IndicesClient.jsx`, `app/geography/page.js`, `app/fund/[code]/FundDetailClient.jsx`, and `app/pms/[id]`):

```jsx
const isProUser = Boolean(
  session?.user?.role === 'admin' ||
  session?.user?.role === 'distributor' ||
  session?.user?.isPro ||
  (session?.user?.proTrialUntil && new Date(session.user.proTrialUntil) > new Date())
);
```

### 7.1 Free Tier (Public SEO & GEO Acquisition)
* Full constituent roster table (all 50 to 500 stocks).
* All valuation ratios (P/E, P/B, Div Yield) and historical valuation gauge status.
* Trailing returns (1M, 3M, 1Y, 3Y, 5Y TRI CAGRs).
* Top 10 weights & sector breakdown.
* Direct deep links to Reverse Stock Holdings Engine (`/stocks-in-funds?stock=...`).
* Direct deep links to Rolling Returns (`/rolling?bench=...`).
* Complete GEO Markdown Feed (`/indices/[slug]?format=md`).

### 7.2 Abundance Pro Tier (Locked / Gated)
* **One-Click CSV / Excel Export:**  
  Export full constituent lists with symbols, ISINs, and sectors. Clicking the button for free users triggers:
  `flashToast('Export CSV is a Pro feature — upgrade at /pricing')`.
* **Multi-Index Overlap Analyser:**  
  Allows comparing two indices (e.g., *Nifty 50 vs. Nifty200 Momentum 30* or *Nifty 100 vs. BSE 100*) to see common stocks, unique stocks, and weight overlap. Free users see a preview of top 5 overlapping stocks with a Pro unlock banner.
* **Constituent Rebalance Audit:**  
  Displays additions and deletions from the most recent semi-annual reconstitution. Free users see the count of changes; full audit table is Pro-gated.

---

## 8. SEO, GEO & Sitemaps Specification

### 8.1 Sitemaps (`app/sitemap-indices.xml/route.js`)
Modeled on `app/sitemap-amc.xml/route.js`:
* Dynamically lists:
  - `https://mfcalc.getabundance.in/indices` (Priority 0.85, daily)
  - `https://mfcalc.getabundance.in/indices/${slug}` for all 64 Phase 1 indices (Priority 0.75, weekly)
* Cached with `s-maxage=86400, stale-while-revalidate=604800`.

### 8.2 Robots.txt (`app/robots.js`)
* Add `/indices/` and `/api/indices/` to `rules[0].allow` (general search engines) and `rules[1].allow` (AI user agents like `GPTBot`, `PerplexityBot`, `ClaudeBot`).
* Add `'https://mfcalc.getabundance.in/sitemap-indices.xml'` to `sitemap` array.

### 8.3 Content Negotiation (`middleware.js` & `app/api/indices/[slug]/route.js`)
* Extend `middleware.js` config matcher with `/indices/:path*`.
* When a crawler or user requests `/indices/[slug]?format=md` or sends `Accept: text/markdown`:
  Middleware rewrites request to `/api/indices/[slug]?format=md`.
* Route Handler returns `text/markdown; charset=utf-8` containing:
  - Regulatory citation header (*ARN-251838 / APRN04279*)
  - Index summary, exchange, category, and valuation metrics
  - Complete markdown constituent table
  - Reverse lookup deep links

### 8.4 Cross-Linking from Aggregate `/indices` Dashboard
In [`app/indices/IndicesClient.jsx`](file:///d:/workspace/MF-Analyzer-Abundance/app/indices/IndicesClient.jsx):
* Convert each index name in the main table to an active Next.js `<Link href={`/indices/${item.slug}`}>` with hover underline and title attribute.
* Add an explicit **"Constituents"** badge or link column leading to the detail page.

---

## 9. Verification & Safety Protocols

1. **No Silent Failures:** Ingestion errors must be surfaced via GitHub Actions logs; failed downloads must never overwrite a valid existing database roster with an empty table.
2. **Defensive Fallback:** If Postgres is temporarily unreachable during SSR, `lib/indexConstituents.js` falls back to Cloudflare R2 cache `index-constituents/<slug>.json`.
3. **Build Zero-Warning Verification:** Full `npm run build` check ensuring all 64 static/ISR routes compile cleanly.
4. **Mandatory Attribution:** Every page, JSON payload, and markdown document contains the distributor attribution:  
   > *"Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor)."*
