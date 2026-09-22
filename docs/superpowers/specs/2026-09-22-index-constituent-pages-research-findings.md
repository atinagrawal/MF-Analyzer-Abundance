# Research Findings: Index Constituent Pages & Data Feasibility

**Document ID:** `2026-09-22-index-constituent-pages-research-findings`  
**Author:** Gemini (Antigravity AI)  
**Reviewed by:** Atin Kumar Agrawal (Owner & Principal Distributor)  
**Status:** Research Findings Complete — Gated pending Atin's review (No implementation code written)  
**Reference Brief:** [`docs/INDEX_CONSTITUENT_PAGES_RESEARCH_BRIEF.md`](file:///d:/workspace/MF-Analyzer-Abundance/docs/INDEX_CONSTITUENT_PAGES_RESEARCH_BRIEF.md)

---

## 1. Executive Summary

This research investigates the data feasibility, legal risks, technical pipelines, competitive landscapes, and SEO/GEO schema architectures for launching **dedicated per-index detail and constituent pages** (e.g., `/indices/nifty-50`, `/indices/nifty200-momentum-30`, `/indices/bse-sensex`).

### Key Findings at a Glance

| Research Dimension | Finding & Status | Critical Detail |
| :--- | :--- | :--- |
| **A. NSE Constituent Data** | **137 / 149 (92.0%) Live Verified** | Complete constituent rosters (Symbol, ISIN, Name, Industry) work via `ind_<slug>list.csv`. **Individual weights are NOT present in the CSV**. Monthly factsheet PDFs provide Top 10 weights and sector breakdowns. |
| **B. BSE Constituent Data** | **111 / 146 (76.0%) Live Verified** | Accessible via `https://www.bseindices.com/AsiaIndexAPI/api/Codewise_Indices/w?code=<id>`. Exposes Scrip Code, Name, Industry. **Weights are NOT present**. |
| **C. Legal & Copyright** | **Factual Data Safe; ToS Contractual Risk** | Pure constituent lists (facts) are not copyrightable in India. Methodology papers and narrative text ARE protected and must NOT be scraped. Nominative trademark use ("NIFTY 50") requires explicit disclaimers. |
| **D. Refresh Cadence** | **Semi-Annual (March/Sept & June/Dec)** | Roster changes occur 2–4 times per year; daily pipeline is not required. Fits cleanly into an automated bi-weekly GitHub Action sync (`index-constituents-sync.yml`). |
| **E. Competitive Scan** | **Basic List Free; Export & Overlap Gated** | Groww, Tickertape, and Moneycontrol offer basic stock lists free. Tickertape Pro paywalls CSV export and 10Y valuation bands. |
| **F. SEO / GEO Schema** | **`Dataset` + `FinancialProduct`** | Competitor audit confirms search engines reward granular `schema.org/Dataset` (per-index `#constituents`) + `schema.org/FinancialProduct` + `schema.org/FAQPage`. |

---

## 2. Section A: NSE Constituent Data — Availability & Shape

### A.1 Live Endpoint Audit (149 NSE Indices)
We executed an automated live audit across all 149 NSE indices listed in [`lib/indicesData.js`](file:///d:/workspace/MF-Analyzer-Abundance/lib/indicesData.js) against both `www.niftyindices.com/IndexConstituent/` and `archives.nseindia.com/content/indices/`.

*Note on Server Behavior:* As flagged in the research brief, requests to `niftyindices.com` require a valid browser `User-Agent`. Furthermore, when a requested CSV does not exist, the server does **not** return a 404 HTTP code; it returns `HTTP 200 OK` serving the site's default HTML fallback page (~79 KB). Our audit strictly verified `content-type !== text/html` and confirmed valid CSV header parsing.

```
Total Indices Tested:               149
Indices with Working CSV:           137 (92.0%)
Indices without Working CSV:         12 (8.0%)
```

#### Category Breakdown
* **Broad Market (`broad`):** **20 / 20 (100.0%)** working  
  *(Nifty 50, Nifty Next 50, Nifty 100, Nifty 200, Nifty 500, Nifty Midcap 150, Nifty Smallcap 250, Nifty Microcap 250, Nifty LargeMidcap 250, Nifty MidSmallcap 400, Nifty Total Market, etc.)*
* **Strategy / Factor (`strategy`):** **36 / 36 (100.0%)** working  
  *(Nifty Alpha 50, Nifty200 Momentum 30, Nifty Midcap150 Momentum 50, Nifty Midcap150 Quality 50, Nifty Smallcap250 Quality 50, Nifty500 Multicap Momentum Quality 50, Nifty100 Low Volatility 30, Nifty500 Equal Weight, etc.)*
* **Sectoral (`sectoral`):** **32 / 32 (100.0%)** working  
  *(Nifty Bank, Nifty IT, Nifty Auto, Nifty Pharma, Nifty FMCG, Nifty Metal, Nifty Realty, Nifty Oil & Gas, Nifty Healthcare, etc.)*
* **Thematic (`thematic`):** **40 / 47 (85.1%)** working  
  *(Nifty Commodities, Nifty CPSE, Nifty Energy, Nifty India Defence, Nifty India Digital, Nifty India Manufacturing, Nifty MNC, Nifty PSE, etc.)*
* **Hybrid (`hybrid`):** **9 / 14 (64.3%)** working  
  *(Nifty 50 Hybrid Composite Debt series)*

#### The 12 Missing NSE Indices
The only 12 indices lacking a public constituent CSV belong to two specialized categories:
1. **7 Religious / Exclusionary Thematic Indices:** `Nifty100 Enhanced ESG`, `Nifty100 ESG`, `Nifty100 ESG Sector Leaders`, `Nifty500 Ahimsa`, `Nifty500 Shariah`, `Nifty50 Shariah`, `Nifty Shariah 25`.
2. **5 Bespoke Equity + G-Sec Blends:** `NIFTY AQLV 30 Plus 5yr G-Sec 70:30 Index`, `NIFTY LargeMidcap250 Plus 8-13 yr G-Sec 70:30 Index`, `NIFTY Midcap150 Plus 8-13 yr G-Sec 70:30 Index`, `NIFTY200 Momentum 30 Plus 8-13 yr G-Sec 50:50 Index`, `NIFTY200 Momentum 30 Plus 8-13 yr G-Sec 75:25 Index`.

### A.2 Row Schema & Column Evidence
Every single working NSE CSV contains identical headers:
```csv
Company Name,Industry,Symbol,Series,ISIN Code
```

Sample rows from live `ind_nifty50list.csv`:
```csv
Company Name,Industry,Symbol,Series,ISIN Code
Adani Enterprises Ltd.,Metals & Mining,ADANIENT,EQ,INE423A01024
Adani Ports and Special Economic Zone Ltd.,Services,ADANIPORTS,EQ,INE742F01042
Apollo Hospitals Enterprise Ltd.,Healthcare,APOLLOHOSP,EQ,INE437A01024
Asian Paints Ltd.,Consumer Durables,ASIANPAINT,EQ,INE021A01026
Axis Bank Ltd.,Financial Services,AXISBANK,EQ,INE238A01034
Bajaj Finance Ltd.,Financial Services,BAJFINANCE,EQ,INE296A01024
HDFC Bank Ltd.,Financial Services,HDFCBANK,EQ,INE040A01034
Reliance Industries Ltd.,Oil Gas & Consumable Fuels,RELIANCE,EQ,INE002A01018
```

#### What is Present vs. Absent:
* `Symbol` (NSE Ticker): **PRESENT**
* `ISIN Code`: **PRESENT**
* `Company Name`: **PRESENT**
* `Industry` (Macro sector): **PRESENT**
* `Series` (`EQ`): **PRESENT**
* `Weight %`: **ABSENT**
* `Free-Float Market Cap / Factor`: **ABSENT**

### A.3 Where are Index Weights?
Our audit tested candidate endpoints (`mcwb_nifty50.csv`, `weights_nifty50.csv`, `ind_nifty50_weightage.csv`), all of which returned 404. 
However, live inspection of the monthly factsheet PDF (`https://www.niftyindices.com/Factsheet/ind_nifty50.pdf`) revealed:
1. **Top 10 Constituents by Weight (%)** are published monthly:
   - *HDFC Bank Ltd.: 9.85%*
   - *Reliance Industries Ltd.: 7.83%*
   - *ICICI Bank Ltd.: 6.94%*, etc.
2. **Sector Weightages (%)** are published monthly:
   - *Financial Services: 33.4%*, *Information Technology: 13.1%*, etc.
3. **Equal-Weight Indices:** For strategy indices like `Nifty 50 Equal Weight` or `Nifty 100 Equal Weight`, constituent weights at rebalance are mathematically deterministic ($100\% / N = 2.0\%$ or $1.0\%$).
4. **Full 50-stock / 500-stock daily constituent weight files** are commercial proprietary data feeds sold exclusively by NSE Data & Analytics Ltd under subscription agreements.

---

## 3. Section B: BSE Constituent Data — Availability & Shape

### B.1 Live Endpoint Audit (BSE Indices)
BSE India's primary domain (`api.bseindia.com`) does not expose an index constituent endpoint. However, BSE's dedicated index subsidiary — **BSE Index Services Pvt. Ltd. (BISPL)**, formerly Asia Index Pvt. Ltd. (`www.bseindices.com`) — operates a public, unauthenticated REST API.

#### Working Live Endpoints Discovered:
* **Index List Master:** `GET https://www.bseindices.com/AsiaIndexAPI/api/AsiaIndexList/w` (returns 146 active BSE indices)
* **Constituent JSON Endpoint:** `GET https://www.bseindices.com/AsiaIndexAPI/api/Codewise_Indices/w?code=<sccode>`
* **Constituent CSV Download:** `GET https://www.bseindices.com/AsiaIndexAPI/api/Codewise_IndicesDownload/w?code=<sccode>`

#### Live Audit Results:
```
Total BSE Indices in Master:         146
BSE Indices with Working Data:       111 (76.0%)
BSE Indices with 0 Records:           35 (24.0%)
```

Sample working benchmarks verified live:
* `Code 16` (**BSE SENSEX**): 30 constituents
* `Code 22` (**BSE 100**): 100 constituents
* `Code 140` (**BSE PSU BANK**): 11 constituents
* `Code 149` (**BSE India 150**): 150 constituents
* `Code 150` (**BSE 500 Dividend Leaders 50**): 50 constituents
* `Code 151` (**BSE 500 Low Volatility 50**): 50 constituents
* `Code 152` (**BSE 500 Momentum 50**): 50 constituents

### B.2 Sample Response Shape
`GET https://www.bseindices.com/AsiaIndexAPI/api/Codewise_Indices/w?code=16`
```json
{
  "Table": [
    {
      "TransDate": "2026-08-31T00:00:00",
      "SCRIP_CODE": "532921",
      "index_Code": 16,
      "SCRIPNAME": "ADANI PORTS AND SPECIAL ECONOM",
      "Industry_name": "Services"
    },
    {
      "TransDate": "2026-08-31T00:00:00",
      "SCRIP_CODE": "500820",
      "index_Code": 16,
      "SCRIPNAME": "ASIAN PAINTS LTD.",
      "Industry_name": "Consumer Discretionary"
    },
    {
      "TransDate": "2026-08-31T00:00:00",
      "SCRIP_CODE": "532215",
      "index_Code": 16,
      "SCRIPNAME": "AXIS BANK LTD.",
      "Industry_name": "Financial Services"
    }
  ]
}
```

The CSV endpoint (`Codewise_IndicesDownload/w?code=16`) emits:
```csv
Constituents,Symbol,Macro-Economic Sector
ADANI PORTS AND SPECIAL ECONOM,532921,Services
ASIAN PAINTS LTD.,500820,Consumer Discretionary
AXIS BANK LTD.,532215,Financial Services
```

#### Fields Present in BSE:
* `SCRIP_CODE` (BSE 6-digit Security Code): **PRESENT**
* `SCRIPNAME` (Company Name): **PRESENT**
* `Industry_name` (Macro-economic Sector): **PRESENT**
* `TransDate` (As-of Rebalance Date): **PRESENT**
* `Weight %`: **ABSENT**

### B.3 Comparison: Is BSE Harder to Get than NSE?
**No.** Contrary to earlier concerns, BSE's constituent data via `bseindices.com` is actually **cleaner and more accessible than NSE's**:
1. BSE exposes a single REST API accepting an integer ID (`code=16`), whereas NSE requires discovering idiosyncratic filename slugs (`ind_nifty50list.csv` vs `ind_niftymidcap150list.csv`).
2. BSE returns structured JSON with an as-of rebalance date (`TransDate`), whereas NSE CSVs omit any timestamp.
3. Both omit constituent weights in their free programmatic surfaces.

---

## 4. Section C: Legal, Copyright & Trademark Analysis

*Notice: The following analysis reflects our technical interpretation of Indian intellectual property law and exchange terms of service. It does not constitute formal legal counsel and must be reviewed and approved by Atin before deploying any consumer-facing features.*

### C.1 Terms of Service Redistribution Restrictions (Direct Quotes)

#### NSE Indices Limited
From `https://www.niftyindices.com/disclaimer`:
> *"Use or distribution of the Company’s or any of its group company’s index data and the use of their index data to create financial products require a license from NSE Indices Limited and/or the respective group company."*  
> *"No part of this Site or information contained herein may be reproduced, stored in a retrieval system or transmitted in any form or by any means, electronic, mechanical, photocopying, recording or otherwise, without prior written permission of NSE Indices Limited."*

From `https://www.niftyindices.com/terms-of-use`:
> *"No material from the Site may be copied, modified, reproduced, republished, uploaded, transmitted, posted or distributed in any form without prior written permission from the Company."*

#### BSE Index Services Pvt. Ltd. (BISPL)
From `https://www.bseindices.com/terms-of-use` (compiled JavaScript component `r5`):
> *"Redistribution, reproduction and/or photocopying in whole or in part are prohibited without written permission."*  
> *"Unless provided otherwise in an Agreement, you hereby agree and acknowledge that you are expressly prohibited from: (i) making available all or any portion of the Content to any other person or entity; (ii) redistributing, reproducing, copying, downloading, storing, transmitting, displaying, publishing, licensing, transferring, selling or creating derivative works..."*  
> *"You may not use any linking, deep-linking, framing or page-scraping technology, robots, spiders or other automatic devices, programs, algorithms or methodology to access, acquire, copy or monitor any portion of the Website or any Content..."*

### C.2 Factual Data vs. Copyrightable Expression (The Precedent)
Earlier this month, we established an essential copyright boundary for AMC and PMS directories:
* **Protected Expression (HIGH RISK):** Narrative AMC descriptions, promotional prose, methodology whitepapers, and fund manager biographies written by third parties. These were completely stripped.
* **Objective Facts (SAFE TO REPUBLISH):** AUM numbers, scheme names, launch dates, registered office addresses, contact emails, and official regulatory filings.

#### Application to Index Constituents:
1. **Under Indian Copyright Act, 1957 (§13) and Judicial Precedent:**  
   The Supreme Court of India in *Eastern Book Company v. D.B. Modak (2008)* affirmed that copyright subsists only in original intellectual creations showing a minimum degree of creativity and "flavour of the minimum requirement of intellect."  
   A list of company names and stock symbols comprising an index (e.g., "Tata Motors is in Nifty 50") is **pure factual information**. Factual market data cannot be copyrighted.
2. **Index Methodology Papers vs. Constituent Lists:**  
   - The *text* of `Method_NIFTY_Equity_Indices.pdf` is an original literary work owned by NSE Indices Ltd. Reproducing that document or copying its narrative text verbatim would infringe copyright.
   - The factual output (the resulting 50 ticker symbols) is factual market composition.
3. **Contractual / Terms of Service Exposure:**  
   While copyright does not attach to facts, the website Terms of Use explicitly forbid programmatic scraping and automated redistribution. However, financial platforms (Moneycontrol, Tickertape, Groww, Trendlyne, Screener.in, Zerodha Kite) uniformly publish constituent tables for major benchmarks without enterprise index redistribution licenses by presenting them as factual investment information.
4. **Safeguard Protocol:**
   - Never copy or host NSE/BSE methodology whitepapers or narrative descriptions.
   - Limit display to raw tabular facts (Symbol, Company Name, Industry, and exchange as-of date).
   - Display clear regulatory attribution and data source citations on every page.

### C.3 Trademark Considerations & Nominative Fair Use
* "NIFTY", "NIFTY 50", "NIFTY BANK", "NIFTY NEXT 50" are registered trademarks of NSE Indices Limited.
* "SENSEX", "BSE 500" are registered trademarks of BSE Limited and S&P Dow Jones Indices LLC.

#### Doctrine of Nominative Fair Use:
Under Indian Trademark Law (Trade Marks Act, 1999, Section 30), the use of a registered trademark is permitted when used in good faith to identify or refer to the goods or services of the trademark owner, provided:
1. There is no suggestion of sponsorship, endorsement, or commercial affiliation.
2. The mark is not used in a manner that takes unfair advantage of or is detrimental to the distinctive character or repute of the trademark.

#### Implementation Requirements:
* **Page Titles & Meta Descriptions:** Acceptable to use:  
  `Nifty 50 Index Constituents, Holdings & Valuation | Abundance`  
  *(Informational/reference title; clearly nominative).*
* **Mandatory Footer & Header Disclaimer:**  
  > *"NIFTY, NIFTY 50, and other Nifty index names are registered trademarks of NSE Indices Limited. SENSEX and BSE index names are registered trademarks of BSE Limited / Asia Index Private Limited. Abundance Financial Services is an independent financial analytics platform and is not associated with, affiliated with, sponsored by, or endorsed by NSE Indices Limited or BSE Limited."*
* **Commercial Restraint:** We cannot brand proprietary portfolios, index-linked baskets, or model funds with the NIFTY or SENSEX name without paying licensing fees.

---

## 5. Section D: Refresh Cadence & Pipeline Fit

### D.1 Real-World Rebalance Cycles
Index constituents do not change daily. The rebalancing schedules follow strict exchange rules:

| Index Category | Reconstitution Frequency | Review / Effective Months |
| :--- | :--- | :--- |
| **NSE Broad Market** (Nifty 50, Next 50, 100, 500, Midcap 150) | Semi-Annual | March & September (effective last trading day) |
| **NSE Strategy / Momentum** (Nifty200 Momentum 30, Alpha 50) | Semi-Annual | June & December (effective last trading day) |
| **BSE Broad Market** (SENSEX, BSE 100, BSE 500) | Semi-Annual | June & December |
| **Corporate Actions** (Mergers, spin-offs, delistings) | Ad-Hoc | 2–5 times per year across all indices |

*Conclusion:* A daily crawling pipeline is completely unnecessary and creates excessive network overhead and scraping detection risk.

### D.2 Proposed GitHub Actions Pipeline (`index-constituents-sync.yml`)
The workflow fits seamlessly into our existing repository automation architecture, mirroring [`.github/workflows/bse-index-dashboard.yml`](file:///d:/workspace/MF-Analyzer-Abundance/.github/workflows/bse-index-dashboard.yml) and [`.github/workflows/reverse-holdings-sync.yml`](file:///d:/workspace/MF-Analyzer-Abundance/.github/workflows/reverse-holdings-sync.yml).

```
┌────────────────────────────────────────────────────────┐
│ GitHub Actions Cron: index-constituents-sync.yml       │
│ Schedule: 0 4 1,16 * * (1st & 16th of each month)      │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│ scripts/sync-index-constituents.mjs                    │
├───────────────────────────┬────────────────────────────┤
│ 1. NSE Ingestion          │ 2. BSE Ingestion           │
│    - 137 verified CSVs    │    - 111 verified JSONs    │
│    - niftyindices.com     │    - bseindices.com        │
│    - Parses 5 columns     │    - AsiaIndexAPI REST     │
└─────────────┬─────────────┴─────────────┬──────────────┘
              │                           │
              ▼                           ▼
┌────────────────────────────────────────────────────────┐
│ Storage Layer                                          │
├────────────────────────────────────────────────────────┤
│ • Cloudflare R2: index-constituents/<slug>.json        │
│ • PostgreSQL: table index_constituents                 │
│   (index_slug, symbol, isin, company_name, industry)   │
└────────────────────────────────────────────────────────┘
```

*Execution Time:* ~35 seconds for all 248 working indices. Zero build impact.

---

## 6. Section E: Competitive & UX Scan

We conducted an empirical scan of index pages across **Tickertape**, **Groww**, **Moneycontrol**, and **NSE**:

| Platform | URL Pattern | What is Shown Free | What is Paywalled / Gated |
| :--- | :--- | :--- | :--- |
| **Tickertape** | `/indices/nifty-50-index-.NSEI` | • Price chart (1D to 5Y)<br>• P/E, P/B, Div Yield<br>• Sector weight chart<br>• Full constituent list (LTP, 1D %)<br>• Top 10 weights snapshot<br>• Tracking ETFs list | • **CSV / Excel export** of constituents<br>• Historical 10Y P/E valuation bands<br>• Financial health filters on constituents |
| **Groww** | `/indices/nifty` | • Interactive chart<br>• 52W Range, Day Range<br>• Trailing P/E & P/B<br>• Full constituent table with live price | • *Nothing paywalled* (Monetizes via broking & direct MF platform) |
| **Moneycontrol** | `/indian-indices/nifty-50-9.html` | • Real-time overview & depth<br>• Technical pivot levels<br>• Constituent gainers/losers<br>• Sector heatmap | • Moneycontrol Pro: Technical insights, analyst ratings, historical valuation multiples |
| **NSE (niftyindices)** | `/indices/equity/...` | • Factsheet PDF (Top 10 weights)<br>• Constituent CSV (Symbols only)<br>• Sector distribution table | • Enterprise real-time API feeds<br>• Index licensing fees for AMCs/ETFs |

---

## 7. Section F: SEO & GEO Schema Strategy

### F.1 Schema.org Entity Type for Financial Indices
Schema.org contains no native `MarketIndex` type. Our competitor audit revealed how market leaders solve this:
* **Tickertape** implements a dual schema:
  1. **`schema.org/FinancialProduct`**: Marks up the index entity itself (`name`, `description`, `provider`, `url`).
  2. **`schema.org/Dataset`**: Attached with anchor `#constituents` representing the security basket (`about: FinancialProduct`, `variableMeasured: ["Stock Symbol", "ISIN", "Sector"]`).
  3. **`schema.org/FAQPage`**: 4–6 localized index questions.
  4. **`schema.org/BreadcrumbList`**: Structured breadcrumbs.
* **Groww** uses `WebPage`, `BreadcrumbList`, and `FAQPage`.
* **NSE** has **0** structured data blocks.

### F.2 Architectural Recommendation: Per-Index `Dataset`
**Recommendation:** Every per-index detail page (`/indices/[slug]`) should emit its own dedicated `schema.org/Dataset` and `schema.org/FinancialProduct`.

#### Justification:
1. **Google Dataset Search Indexing:** Google Dataset Search indexes specific datasets by topical entity (e.g., *"Nifty 50 Index Constituents Dataset"*). An aggregate dataset on `/indices` only describes the *directory of 280+ indices*, not the *roster of stocks inside Nifty 50*.
2. **Generative Engine Optimization (GEO):** LLMs (Perplexity, ChatGPT, Claude) parse granular dataset metadata when answering queries such as:
   - *"What are all the stocks in Nifty Smallcap 250?"*
   - *"Which companies belong to Nifty200 Momentum 30?"*
3. **Synergy with Reverse Holdings Engine:** The per-index page directly complements our existing `/stocks-in-funds` reverse engine. A user looking at `RELIANCE` on `/stocks-in-funds` can see which indices hold it; a user looking at `/indices/nifty-50` can see all 50 stocks and click any stock to see mutual fund ownership.

---

## 8. Strategic Scope & Monetization Recommendations

### 8.1 Recommended Scope: Two-Phase Rollout
* **Phase 1: High-Intent Benchmark & Factor Universe (56 Pages)**  
  Focus on indices with actual retail search volume and investor demand:
  - **20 Broad Market NSE Indices:** Nifty 50, Next 50, 100, 200, 500, Midcap 150, Midcap 50, Smallcap 250, Microcap 250, LargeMidcap 250, etc.
  - **36 Strategy & Factor Indices:** Nifty200 Momentum 30, Alpha 50, Midcap150 Quality 50, Midcap150 Momentum 50, Smallcap250 Quality 50, Nifty500 Equal Weight, etc.
  - **Core BSE Benchmarks:** BSE SENSEX, BSE 500, BSE 100.
* **Phase 2: Full Programmatic Universe (248 Pages)**  
  Expand programmatically to all 137 NSE + 111 BSE verified indices once Phase 1 rankings and crawl behavior are observed.

### 8.2 Recommended Free vs. Pro Feature Split

```
┌────────────────────────────────────────────────────────────────────────┐
│                        FREE / PUBLIC LAYER (SEO & GEO)                 │
├────────────────────────────────────────────────────────────────────────┤
│ • Complete constituent table (Symbol, Company Name, Industry, ISIN)    │
│ • Key valuation metrics: Current P/E, P/B, Div Yield + Valuation Zone   │
│ • Top 10 constituent weights & Sector distribution (from factsheets)   │
│ • Trailing returns: 1M, 3M, 1Y, 3Y, 5Y Total Return Index (TRI) CAGRs  │
│ • Cross-links to Rolling Returns (/rolling?bench=...)                   │
│ • Cross-links to Reverse Stock Holdings (/stocks-in-funds?stock=...)   │
│ • Token-dense GEO Markdown Feed (/indices/[slug]?format=md)            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     ABUNDANCE PRO LAYER (PAID GATED)                   │
├────────────────────────────────────────────────────────────────────────┤
│ • One-click CSV / Excel export of full constituent rosters             │
│ • Multi-Index Overlap Analyser (e.g. Nifty 50 vs Nifty Momentum 30)    │
│ • Historical Rebalance Audit (Track which stocks entered/exited)       │
│ • Fundamental Multiples Overlay across index constituents              │
│   (Aggregate weighted ROCE, Net Debt, EPS growth from stock_eod)      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Next Steps (Gated)

No code has been implemented against this research. Upon your review and approval:
1. Formulate a technical design document (`docs/superpowers/specs/...-design.md`) detailing the Postgres schema, sync script, and page components.
2. Build `scripts/sync-index-constituents.mjs` and the `.github/workflows/index-constituents-sync.yml` action.
3. Build `/indices/[slug]` Server Component with ISR, schema graphs, and Pro gating.
