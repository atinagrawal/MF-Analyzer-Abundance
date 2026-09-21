# Technical Design Specification: Programmatic AMC & PMS Provider Directory Hubs (§5.2)

**Platform:** Abundance Financial Services (`mfcalc.getabundance.in`)  
**Credentials:** Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor)  
**Status:** Approved for Implementation  
**Date:** September 21, 2026  
**Target Delivery:** Tier 3 SEO & GEO Growth Initiative  

---

## 1. Executive Summary & Objective

Modern search queries for investment managers fall into two high-intent clusters:
1. **Mutual Fund AMC Queries:**  
   > *"HDFC Mutual Fund schemes list", "SBI Mutual Fund AUM and fund managers", "Nippon India MF office address and contact", "List of AMCs in India"*
2. **PMS Provider Queries:**  
   > *"Carnelian PMS strategies and factsheets", "Abakkus PMS portfolio manager and performance", "Top PMS providers in India"*

While Abundance already possesses scheme-level detail pages (`/fund/[code]` and `/pms/[id]`) and stock-level reverse lookups (`/stocks-in-funds/[ticker]`), it lacks **directory hubs** aggregated at the **asset manager / provider level**.

This project builds:
1. **The Mutual Fund AMC Directory & Profile Hubs (`/amc` and `/amc/[slug]`)**:
   - Covers all **52 distinct AMCs** active in India today (verified directly against `mf_screener`).
   - Harvests AMC structured facts (`amc_info`: AUM, rank, launch date, address, website, contact) and manager directories (`fund_manager_details`: name, education, experience, funds managed) via an extension of the existing §5.1 sync engine (`scripts/sync-all-fund-holdings.mjs`).
   - Strictly excludes third-party narrative descriptions (`description` and `more_description`) to eliminate copyright risk, relying purely on non-copyrightable public facts and official data.
   - Deduplicates and stores structured profiles in Cloudflare R2 under `amc-profiles/<amc-slug>.json`.
   - Surfaces real-time scheme tables, category allocations (Equity, Hybrid, Debt, Solution), 1Y/3Y/5Y returns, and ground-truth AUM computed from `amfi-aum.json`.
2. **The PMS Provider Directory & Profile Hubs (`/pms-provider` and `/pms-provider/[slug]`)**:
   - Covers all **18 tracked PMS providers** in `pms-factsheets.json` (Carnelian, Stallion, Narnolia, Renaissance, Sundaram, Green Lantern, ICICI Prudential, Alchemy, Abakkus, Buoyant, Dezerv, Negen, Motilal Oswal, Invesco, InCred, Green Portfolio, Equitree, Aditya Birla).
   - Displays strategy counts, direct links to strategy detail pages (`/pms/[id]`), and direct PDF factsheet downloads.
   - Strictly obeys v1 boundary: zero blocking on APMI PDF extraction for AUM or manager bios, and no historical factsheet archives.
3. **Canonical Routing & 308 Redirects**:
   - Automatic 308 permanent redirects for short aliases (e.g., `/amc/hdfc` → `/amc/hdfc-mutual-fund`, `/amc/sbi` → `/amc/sbi-mutual-fund`, `/amc/ppfas` → `/amc/ppfas-mutual-fund`, `/pms-provider/green-lantern` → `/pms-provider/greenlantern`).
4. **GEO Optimization & Markdown Feeds (`?format=md`)**:
   - Server-side content negotiation via Next.js middleware supporting `?format=md` and `Accept: text/markdown` for LLMs and AI search engines.
5. **Schema.org Structured Data & Dual Regulatory Compliance**:
   - `FinancialService`, `Organization`, `BreadcrumbList`, and `ItemList` JSON-LD schemas.
   - Dual attribution on every page and markdown feed:
     > *"Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor)."*

---

## 2. Grounded Codebase Realities & Scoping Decisions

### 2.1 Copyright Protection: Cutting Narrative Descriptions
* `amc_info.description` and `more_description` from Groww contain written narrative paragraphs that reflect Groww's copyrightable expression.
* In accordance with sound IP and compliance practice, **we strictly discard both fields**.
* Only non-copyrightable structured facts are stored:
  - Official entity name & legal name
  - Registered office address, phone number, official website
  - Launch date / founding date & AMFI rank
  - Official scheme directory from `mf_screener`
  - Total AUM verified against official AMFI disclosures (`amfi-aum.json`)
  - Fund manager directory (name, education, experience, funds managed)

### 2.2 Complete Fund-Manager Roster vs. Fast-Path Bootstrap
* Sampling 1-2 schemes per AMC in a fast-path mode only reveals the managers assigned to those specific schemes. A major fund house like HDFC or SBI has dozens of managers across diverse equity, hybrid, debt, and thematic portfolios.
* Therefore:
  - `--amc-only` is maintained strictly for local testing, rapid development, and initial bootstrap.
  - The **authoritative source of truth** is the scheduled full execution of `scripts/sync-all-fund-holdings.mjs`, which crawls all ~870 active schemes. During this crawl, `amcMap` accumulates and deduplicates managers by `person_name`, merging their `funds_managed` lists across all schemes of the AMC before persisting `amc-profiles/<amc-slug>.json` to R2.

### 2.3 Verified Universe: Exactly 52 Distinct AMCs & 18 PMS Providers
* Live query on `mf_screener WHERE amc IS NOT NULL GROUP BY amc` confirms exactly **52 distinct AMCs**.
* Live audit of `scripts/sync_pms_factsheets.js` and R2 `pms-factsheets.json` confirms exactly **18 PMS providers**:
  1. `carnelian` (Carnelian Capital Advisors)
  2. `stallion` (Stallion Asset)
  3. `narnolia` (Narnolia Financial Advisors)
  4. `renaissance` (Renaissance Investment Managers)
  5. `sundaram` (Sundaram Alternate Assets)
  6. `greenlantern` (Green Lantern Capital)
  7. `iciciprudential` (ICICI Prudential Asset Management Company)
  8. `alchemy` (Alchemy Capital Management)
  9. `abakkus` (Abakkus Investment Managers)
  10. `buoyant` (Buoyant Capital)
  11. `dezerv` (Dezerv Investments)
  12. `negen` (Negen Capital)
  13. `motilaloswal` (Motilal Oswal Asset Management Company)
  14. `invesco` (Invesco Asset Management)
  15. `incred` (InCred Asset Management)
  16. `greenportfolio` (Green Portfolio)
  17. `equitree` (Equitree Capital Advisors)
  18. `adityabirla` (Aditya Birla Sun Life AMC Limited)

---

## 3. End-to-End System Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Data Source Layer                               │
│  1. PostgreSQL: mf_screener (52 AMCs, ~2,500 schemes, categories, NAV) │
│  2. Cloudflare R2: amfi-aum.json (Scheme-level official AMFI AUM)      │
│  3. Cloudflare R2: pms-factsheets.json (18 PMS Providers, 102 docs)   │
│  4. Cloudflare R2: pms-cache/pms-equity-*.json (1,215 APMI strategies) │
│  5. Groww Internal Scheme Detail API (amc_info + fund_manager_details) │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│        ETL Layer: Proactive Profile Harvesting (GitHub Action)         │
│        scripts/sync-all-fund-holdings.mjs                              │
│        - Captures structured facts only (NO narrative copy)            │
│        - Accumulates & deduplicates fund managers by person_name       │
│        - Authoritative: full crawl across all ~870 active schemes      │
│        - Dedicated --amc-only flag (runs in ~45s for bootstrap/dev)    │
│        - Stores profiles in Cloudflare R2: amc-profiles/<slug>.json    │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
┌────────────────────────────────────────────────────────────────────────┐
│        Application / Server Layer (Next.js 15 App Router)              │
│        - lib/amcProfiles.js: Reads amc-profiles/<slug>.json with cache │
│        - lib/pmsFactsheetsCache.js: Reads pms-factsheets.json          │
│        - middleware.js: Rewrites ?format=md to /api/amc & /api/pms-... │
│        - Canonical 308 Redirects: /amc/sbi -> /amc/sbi-mutual-fund     │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
         ┌───────────────────────────┴───────────────────────────┐
         ▼                                                       ▼
┌──────────────────────────────────┐   ┌──────────────────────────────────┐
│  MF Directory & Hub Routes       │   │  PMS Provider Hub Routes         │
│  - /amc (Directory of 52 AMCs)   │   │  - /pms-provider (Directory)     │
│  - /amc/[slug] (Profile & Funds) │   │  - /pms-provider/[slug] (Profile)│
│  - /api/amc/[slug] (Markdown)    │   │  - /api/pms-provider/[slug] (MD) │
│  - /sitemap-amc.xml              │   │  - /sitemap-pms.xml              │
└──────────────────────────────────┘   └──────────────────────────────────┘
```

---

## 4. Pipeline Component 1: AMC Profile Harvesting & Storage

### 4.1 Schema for `amc-profiles/<amc-slug>.json` in R2
Stored in Cloudflare R2 under key `amc-profiles/${amcSlug}.json`:

```json
{
  "amcSlug": "hdfc-mutual-fund",
  "amcName": "HDFC Mutual Fund",
  "syncedAt": "2026-09-21T11:30:00.000Z",
  "info": {
    "name": "HDFC Mutual Fund",
    "legalName": "HDFC Asset Management Company Limited",
    "address": "\"HDFC House\", 2nd Floor, H.T. Parekh Marg, 165-166, Backbay Reclamation, Churchgate, Mumbai 400020",
    "phone": "1800-3010-6767 / 1800-419-7676",
    "email": "hello@hdfcfund.com",
    "website": "https://www.hdfcfund.com",
    "launchDate": "1999-12-10T00:00:00.000Z",
    "rank": "3"
  },
  "managers": [
    {
      "name": "Prashant Jain",
      "education": "B.Tech (IIT Kanpur), PGDM (IIM Bangalore)",
      "experience": "Over 30 years of experience in fund management and research...",
      "fundsManaged": [
        { "schemeName": "HDFC Flexi Cap Fund", "schemeCode": "100033" },
        { "schemeName": "HDFC Top 100 Fund", "schemeCode": "100034" }
      ]
    }
  ]
}
```

Notice: `description` and `more_description` are strictly omitted.

### 4.2 Updating `lib/holdingsLookup.js`
In `formatDetailResponse(detail, amfiCode, schemeName)`:
- Extract structured facts only:
  ```javascript
  amcInfo: detail.amc_info ? {
    name: detail.amc_info.name || null,
    legalName: detail.amc_info.legal_name || detail.amc_info.name || null,
    address: detail.amc_info.address || null,
    phone: detail.amc_info.phone || null,
    email: detail.amc_info.email || null,
    website: detail.amc_info.vro_website || null,
    launchDate: detail.amc_info.launch_date || null,
    rank: detail.amc_info.rank || null,
  } : null,
  fundManagerDetails: Array.isArray(detail.fund_manager_details) ? detail.fund_manager_details : null,
  ```

---

## 5. Component 2: Route Hierarchy & Canonicalization

### 5.1 `/amc` — Mutual Fund AMC Directory Hub
* **URL:** `https://mfcalc.getabundance.in/amc`
* Searchable and sortable grid of all 52 AMCs.
* Displays official logo, total AUM (₹ Cr), scheme counts by category (Equity, Hybrid, Debt), and average 3Y return.

### 5.2 `/amc/[slug]` — Individual AMC Hub & Scheme Directory
* **URL:** `https://mfcalc.getabundance.in/amc/[slug]`
* Canonical slug: `slugify(amc)` (e.g. `hdfc-mutual-fund`, `sbi-mutual-fund`).
* 308 Permanent Redirects for short aliases: `/amc/hdfc` → `/amc/hdfc-mutual-fund`, `/amc/sbi` → `/amc/sbi-mutual-fund`, `/amc/icici` → `/amc/icici-prudential-mutual-fund`, `/amc/ppfas` → `/amc/ppfas-mutual-fund`, etc.
* Sections:
  1. Hero Header: Logo, Legal Name, Rank, Total AUM (₹ Cr), Launch Date, Address, Phone, Website.
  2. Fund Manager Directory: Cards for each manager with education, experience, and direct links to schemes managed.
  3. Interactive Scheme Table: All schemes from `mf_screener` with category filters, AUM, NAV, 1Y/3Y/5Y returns, and checkboxes linking to `/compare/[slug]`.
  4. Dual regulatory attribution footer.

### 5.3 `/pms-provider` — PMS Provider Directory Hub
* **URL:** `https://mfcalc.getabundance.in/pms-provider`
* Lists all 18 tracked PMS providers.
* Displays provider logo, strategy count, latest factsheet period, and link to `/pms-provider/[slug]`.

### 5.4 `/pms-provider/[slug]` — PMS Provider Hub & Strategies
* **URL:** `https://mfcalc.getabundance.in/pms-provider/[slug]`
* Canonical slugs: `carnelian`, `stallion`, `narnolia`, `renaissance`, `sundaram`, `greenlantern`, `iciciprudential`, `alchemy`, `abakkus`, `buoyant`, `dezerv`, `negen`, `motilaloswal`, `invesco`, `incred`, `greenportfolio`, `equitree`, `adityabirla`.
* Sections:
  1. Provider Header: Logo, Display Name, Strategy Count, Latest Update.
  2. Strategies & Factsheets Table: Strategy name, document type, period, link to `/pms/[id]` (via resolved APMI IAID), direct PDF download link, and extracted portfolio metrics.
  3. Dual regulatory attribution footer.

---

## 6. Component 3: GEO & Token-Efficient Markdown Feeds (`?format=md`)

* Middleware rewrite rules in `middleware.js`:
  - `/amc/[slug]` with `?format=md` or `Accept: text/markdown` → `/api/amc/[slug]`
  - `/pms-provider/[slug]` with `?format=md` or `Accept: text/markdown` → `/api/pms-provider/[slug]`
* Handlers return pure `text/markdown; charset=utf-8` formatted for AI engine ingestion with full structured facts and statutory dual attribution.

---

## 7. Component 4: Regulatory Compliance & Dual Attribution

Mandatory footer on every page and markdown feed:
> *"Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor)."*

Zero subjective scoring or unverified star ratings; strictly factual disclosures.

---

## 8. Component 5: Sitemaps & Internal Link Graph

* `app/sitemap-amc.xml/route.js`: Dynamic sitemap listing `/amc` and all 52 `/amc/[slug]` URLs.
* `app/sitemap-pms.xml/route.js`: Updated to include `/pms-provider` and all 18 `/pms-provider/[slug]` URLs.
* Internal cross-links:
  - Fund detail pages (`/fund/[code]`) link to their parent AMC (`/amc/[slug]`).
  - PMS detail pages (`/pms/[id]`) link to their parent PMS provider (`/pms-provider/[slug]`).
  - Navigation bar and footer include links to "AMCs" and "PMS Providers".
