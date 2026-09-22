# Implementation Plan: Per-Index Detail & Constituent Pages (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build dedicated, SEO/GEO-optimized per-index detail pages for 64 high-intent Indian market benchmarks at `/indices/[slug]`, featuring full constituent stock rosters, trailing valuations, Total Return Index (TRI) CAGRs, deep links to the Reverse Stock Holdings Engine (`/stocks-in-funds?stock=...`), and Pro-gated analytics.

**Spec Reference:** [`docs/superpowers/specs/2026-09-22-index-constituent-pages-phase1-design.md`](file:///d:/workspace/MF-Analyzer-Abundance/docs/superpowers/specs/2026-09-22-index-constituent-pages-phase1-design.md)  
**Research Reference:** [`docs/superpowers/specs/2026-09-22-index-constituent-pages-research-findings.md`](file:///d:/workspace/MF-Analyzer-Abundance/docs/superpowers/specs/2026-09-22-index-constituent-pages-research-findings.md)  
**Brief Reference:** [`docs/INDEX_CONSTITUENT_PAGES_PHASE1_BRIEF.md`](file:///d:/workspace/MF-Analyzer-Abundance/docs/INDEX_CONSTITUENT_PAGES_PHASE1_BRIEF.md)

---

## Global Constraints & Rules

1. **Reconciled Scope:** Exactly 64 indices in Phase 1 (20 Broad Market NSE, 36 Strategy/Factor NSE, 8 Core BSE Benchmarks). No missing or rounded numbers.
2. **Defensive Ingestion:** Never overwrite an existing database roster with an empty payload on fetch error; surface errors in GitHub Actions logs.
3. **No Narrative Scraping:** Zero scraping of proprietary exchange methodology whitepapers or copyrighted prose. Display strictly factual constituent rosters (Symbol, Company Name, Industry, Series, ISIN) with exchange as-of timestamps.
4. **Mandatory Attribution:** Every page, JSON payload, and GEO markdown document must carry:
   > *"Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor)."*
5. **No `cd` Commands & Clean Commits:** Do not use `cd` in terminal steps (use `Cwd`). Never append `Co-authored-by:` or AI signatures to git commits.

---

## Plan Structure Overview

| Task | Area | Description |
| :--- | :--- | :--- |
| **Task 1** | Database Migration | Add `index_constituents` table and indexes to `scripts/schema.sql` |
| **Task 2** | Configuration | Master index mapping and metadata in `lib/indexConstituentsConfig.js` |
| **Task 3** | Ingestion Pipeline | Dual-source ingestion script `scripts/sync-index-constituents.mjs` |
| **Task 4** | Automation Workflow | GitHub Actions workflow `.github/workflows/index-constituents-sync.yml` |
| **Task 5** | Data Access Layer | Data reading, caching, and markdown generator in `lib/indexConstituents.js` |
| **Task 6** | Content Negotiation | Update `middleware.js` to support `/indices/:path*` markdown rewrite |
| **Task 7** | GEO API Route | Route handler `app/api/indices/[slug]/route.js` serving `text/markdown` |
| **Task 8** | Server Component | Dynamic ISR Server Component `app/indices/[slug]/page.jsx` with JSON-LD |
| **Task 9** | Client Component | Interactive table, search, valuation gauges, and Pro gate in `IndexDetailClient.jsx` |
| **Task 10**| Hub Integration | Link `/indices` table rows to `/indices/[slug]` in `app/indices/IndicesClient.jsx` |
| **Task 11**| Sitemaps & Robots | Dynamic sitemap `app/sitemap-indices.xml/route.js` and `app/robots.js` update |
| **Task 12**| Build & Verification | Verification of HTML output, GEO negotiation, build pass, and git commit |

---

## Detailed Task Specifications

### Task 1: Database Migration (`scripts/schema.sql`)
- [ ] **Step 1:** Append `CREATE TABLE IF NOT EXISTS index_constituents` and lookup indexes (`idx_constituents_slug_date`, `idx_constituents_symbol`, `idx_constituents_isin`) to `scripts/schema.sql`.

### Task 2: Master Index Configuration (`lib/indexConstituentsConfig.js`)
- [ ] **Step 1:** Create `lib/indexConstituentsConfig.js` exporting:
  - `PHASE1_INDICES`: Array of exactly 64 index definitions with `name`, `slug`, `exchange` ('NSE' | 'BSE'), `category`, `sourceType` ('nse_csv' | 'bse_api'), and `sourceId`.
  - `toIndexSlug(name)`: Canonical slug generator.
  - `getIndexConfigBySlug(slug)`: Fast map lookup.

### Task 3: Dual-Source Ingestion Script (`scripts/sync-index-constituents.mjs`)
- [ ] **Step 1:** Create standalone script `scripts/sync-index-constituents.mjs` that:
  - Connects to Postgres (via `DATABASE_URL` / `POSTGRES_URL`).
  - Iterates over all 64 Phase 1 indices with concurrency 4.
  - Fetches NSE CSVs from `niftyindices.com` with browser User-Agent and AbortSignal timeout.
  - Fetches BSE JSONs from `bseindices.com/AsiaIndexAPI/api/Codewise_Indices/w?code=<id>`.
  - Validates row counts and non-empty columns.
  - Upserts into Postgres table `index_constituents`.
  - Writes R2 cache objects `index-constituents/<slug>.json` when R2 credentials are present.
  - Summarizes audit results and exits with error code if any index fails.

### Task 4: GitHub Actions Workflow (`.github/workflows/index-constituents-sync.yml`)
- [ ] **Step 1:** Create `.github/workflows/index-constituents-sync.yml` running on bi-weekly cron (`0 4 1,16 * *`) and `workflow_dispatch`.

### Task 5: Data Access Layer (`lib/indexConstituents.js`)
- [ ] **Step 1:** Create `lib/indexConstituents.js` providing:
  - `getIndexDetail(slug)`: Merges index metadata, returns, valuation (from `lib/indicesData.js`), and constituent array.
  - `getIndexConstituents(slug)`: Retrieves stock list from Postgres with fallback to R2 cache.
  - `formatIndexMarkdown(detail)`: High-density markdown formatter for GEO engines.

### Task 6: Edge Content Negotiation (`middleware.js`)
- [ ] **Step 1:** Update `config.matcher` in `middleware.js` to include `/indices/:path*`.
- [ ] **Step 2:** Add route rewrite for `/indices/[slug]` when `?format=md` or `Accept: text/markdown` is requested, directing to `/api/indices/[slug]?format=md`.

### Task 7: GEO API Route Handler (`app/api/indices/[slug]/route.js`)
- [ ] **Step 1:** Create `app/api/indices/[slug]/route.js` handling GET requests and returning `text/markdown; charset=utf-8` or JSON.

### Task 8: Server Component (`app/indices/[slug]/page.jsx`)
- [ ] **Step 1:** Create async Server Component `app/indices/[slug]/page.jsx` with:
  - Incremental Static Regeneration (`export const revalidate = 21600`).
  - Dynamic `generateMetadata({ params })` generating search-optimized title, description, and canonical URL.
  - Full JSON-LD structured data graph (`FinancialProduct`, `Dataset`, `BreadcrumbList`, `FAQPage`).
  - Pre-rendered H1, valuation badges, educational context, and accessible FAQ accordion.

### Task 9: Interactive Client Component (`app/indices/[slug]/IndexDetailClient.jsx`)
- [ ] **Step 1:** Create `app/indices/[slug]/IndexDetailClient.jsx` providing:
  - Instant search filter by symbol or company name.
  - Sector filter pills.
  - Valuation gauge visualization with historical fair-value bands.
  - Table rows with active link to `/stocks-in-funds?stock=${symbol}`.
  - Pro-gated CSV export button using `isProUser` check and upgrade toast.
  - Multi-Index Overlap Analyser teaser card.

### Task 10: Cross-Link from Main `/indices` Table (`app/indices/IndicesClient.jsx`)
- [ ] **Step 1:** Update `app/indices/IndicesClient.jsx` to wrap each index name with Next.js `<Link href={`/indices/${item.slug}`}>`.

### Task 11: SEO Sitemaps & Crawler Manifests
- [ ] **Step 1:** Create `app/sitemap-indices.xml/route.js` listing `/indices` and all 64 Phase 1 `/indices/[slug]` URLs.
- [ ] **Step 2:** Update `app/robots.js` allowing `/indices/` and `/api/indices/` and registering `https://mfcalc.getabundance.in/sitemap-indices.xml`.
- [ ] **Step 3:** Update `public/llms.txt` and `public/llms-full.txt` documenting the per-index markdown endpoints.

### Task 12: Build & Production Verification
- [ ] **Step 1:** Run `npm run build` and ensure 0 errors across all routes.
- [ ] **Step 2:** Run a verification script inspecting `.next/server/app/indices/[slug].html` to confirm static pre-rendering of constituents and JSON-LD.
- [ ] **Step 3:** Verify GEO markdown feed via local fetch.
- [ ] **Step 4:** Git commit and push to `origin/main`.
