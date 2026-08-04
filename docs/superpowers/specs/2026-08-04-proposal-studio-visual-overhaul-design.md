# Proposal Studio Visual Overhaul — Design

## Goal

Proposal Studio's live tool and its PDF export both read as plain data-dump tables today. This overhaul brings both up to a standard comparable to (and in places more rigorous than) the reference NJ Wealth proposal the user shared: a branded cover, real charts, client details, a fund-specific growth projection built on regulator-sanctioned assumptions, and a PDF that never strands a heading from its content across a page break.

## Context that shaped this design

- The user rejected a first instinct to literally clone NJ's structure (cover → TOC → personal letter → dense tables → disclaimer) as "templated." The chosen direction (confirmed via visual mockups) is a single bold branded cover with client + advisor + key stats, straight into chart-rich content — no TOC, no formal letter page.
- The user also rejected computing the growth projection from each fund's own historical NAV data (which this app could do, reusing the Backtest tool's XIRR engine) in favor of AMFI's own regulator-published fixed-CAGR methodology (Circular 109/2023-24), blended by the proposal's actual asset-class composition. This is simpler, authoritative, and matches how every AMFI-registered distributor is required to present illustrative returns.
- AUM was previously deferred because the existing Groww-sourced `aum` field on `/api/proposal-studio/holdings` is Direct-plan-only and would misstate a Regular-plan holding. This is now resolved: `scripts/sync_amfi_aum.js` (built in this same session, from AMFI's own scheme-details API, reverse-engineered and verified live) resolves AUM per plan-variant (Direct/Regular × Growth/IDCW each separately), writing `data/amfi-aum.json` keyed by AMFI scheme code.

## Global Constraints

- Never name the underlying holdings-data vendor (internally "Groww" in code comments) in any user-facing text — UI copy, PDF content, disclaimers.
- All new charts are inline SVG, no chart library, no CDN dependency — must render identically in the live React page and in the `window.open()` + `document.write()` print-window PDF flow already established for `app/backtest/page.js`'s `doExport()`.
- Reuse existing infrastructure over inventing new: the `RiskGauge` component and NSE-riskometer data already built for `app/indices/page.js` / `pages/api/index-dashboard.js`; the `combineExposure`/`computeOverlap`/`computeMCapAllocation` functions in `lib/portfolioAnalysis.js` unchanged; the branded-print-window pattern from `app/backtest/page.js`.
- AMFI Circular 109's assumed-return figures must be stored as named constants with their source/date in a comment — they're reviewed annually by AMFI and this file is the one place to update them each year.

## 1. Client Details

**Data model** (new state in `ProposalStudioTool`): `{ clientName, clientEmail, clientPhone }`.

- `clientName`/`clientEmail` prefill from `session.user.name` / `session.user.email` on mount, all three fields always editable.
- `clientPhone` has no account-level source — starts blank.
- Rendered as an always-visible card (`.pfc-client-details`) at the top of the tool, above `FundPicker` — never blocks basic use (matches the earlier lesson from making Total Amount optional).
- Flows into both the live page's own display and the PDF cover page.

## 2. Growth Projection

**New module: `lib/growthProjection.js`**

Fixed base CAGR constants, sourced from AMFI Best Practices Guidelines Circular 109/2023-24 (verified by reading the circular directly) and Circular 109-A/2024-25 (verified via the user's own NJ reference document, one year more current):

```js
// Source: AMFI Best Practices Guidelines Circular No. 109-A/2024-25 (equity,
// debt) and 109/2023-24 (gold — no more recent figure independently verified).
// AMFI reviews these annually; refresh from the latest circular each year.
const ASSUMED_CAGR = {
  EQUITY: 0.1262, // Nifty/Sensex, 10-yr rolling mean
  DEBT:   0.0661,  // 10-yr G-Sec, 10-yr rolling mean
  GOLD:   0.0934,  // Domestic gold, 10-yr rolling mean (2023-24 figure)
};
```

**Bucket mapping** — reuses the `assetAllocation` buckets `combineExposure()` already produces (Equity/Debt/Cash/Other):
- `Equity` → `ASSUMED_CAGR.EQUITY`
- `Debt` → `ASSUMED_CAGR.DEBT`
- `Cash` → `ASSUMED_CAGR.DEBT` (same short-duration debt-market family, no separate AMFI-sanctioned cash rate exists)
- `Other` (REITs, gold ETFs, unclassified) → `ASSUMED_CAGR.GOLD` (best available single proxy; AMFI's own Multi Asset Fund illustration uses gold as the third leg of exactly this kind of "everything that isn't equity or debt" bucket)

**Blended rate**: weighted average of the four bucket rates by their actual `assetAllocation` percentage — i.e., the exact portfolio composition already computed for the Asset Allocation section, not a generic assumption.

**Projection table**: Year 3/5/8/10/15/20 → Total Invested vs. Projected Value, matching NJ's table shape.
- Lumpsum: `FV = totalAmount * (1 + blendedRate) ^ years`; Total Invested is constant (`totalAmount`) at every row.
- SIP: standard SIP future-value formula (`FV = P * [(1+r)^n - 1] / r * (1+r)`, monthly compounding, `r` = blendedRate/12, `n` = months), matching the same formula family already used elsewhere in this app's SIP calculators. Total Invested at each row = monthly amount × months elapsed.

**Explicitly excluded**: "probability of negative returns" (NJ's version). Reasoning already given to and accepted by the user: even NJ's figure is an index-level proxy, not fund-specific, and a real per-fund rolling-window statistic would be unreliable for younger funds. Not reproducing a precise-looking number that can't be stood behind.

**Disclaimer requirement**: every rendering of this table (live page and PDF) must carry, verbatim per Circular 109 clause 7: "Past performance may or may not be sustained in future and is not a guarantee of any future returns," plus a note naming the AMFI circular as the source of the assumed rates.

## 3. Risk-o-meter

- Primary: the `risk` field already fetched per fund via `/api/proposal-studio/holdings` (sourced from the same external scheme-detail API used for everything else in this tool).
- Fallback (when `risk` is null): resolve the fund's `benchmarkName` (already fetched via the same route, currently unused) against the NSE Riskometer data already powering `/indices` — extract the lookup into a small shared helper (e.g. `lib/riskometer.js`) so both `pages/api/index-dashboard.js` and the new Proposal Studio code call the same normalization/lookup logic instead of duplicating it. Fuzzy-match `benchmarkName` against the indices list the same way other name-matching in this codebase already works (normalize, strip punctuation, case-insensitive).
- Visual: extract `RiskGauge` from `app/indices/page.js` into a shared component (e.g. `components/RiskGauge.jsx`) so Proposal Studio's Scheme Details table and PDF export both use the exact same SEBI-style semicircular gauge, no reimplementation.
- When neither the fund's own rating nor a resolvable benchmark rating exists, render nothing (empty gauge state), never a guessed value.
- Label the fallback state distinctly (e.g. "(benchmark)" suffix) so it's never confused with the fund's own official rating.

## 4. AUM

- Source: `data/amfi-aum.json`, produced by `scripts/sync_amfi_aum.js` (built and verified this session), keyed by AMFI scheme code: `{ [amfiCode]: { isin, schemeName, aumCr, asOf } }`.
- Refreshed quarterly via `.github/workflows/amfi-aum-sync.yml` (cron: 5th of Jan/Apr/Jul/Oct), matching the existing monthly BSE scheme-master sync's convention.
- Scheme Details table gains an AUM column, reading directly from this file (looked up by the fund's `amfiCode` — already the tool's primary key for every selected fund) — no per-request live fetch needed, no Direct/Regular ambiguity since the sync resolves per plan-variant.
- Expense Ratio remains deferred — the Direct/Regular mismatch problem hasn't been solved for that field, and this sync doesn't cover it (AMFI's scheme-details API wasn't tested for expense ratio in this session).

## 5. Shared visual components

All pure-SVG, no dependencies, used identically in the live page and the PDF:

- **Donut chart** — Asset Allocation, with legend.
- **Horizontal ranked bars** — Sector Exposure, Security Exposure.
- **Heatmap overlap grid** — replaces the flat `.pfc-overlap-table`; cell background intensity scales with overlap %, diagonal still visually distinct.
- **Stacked bars** — M-Cap Allocation, one stacked horizontal bar per fund row.
- **Scheme cards** — fund logo + name + category badge + amount + % allocation, replacing the plain `.pfc-selected-item` row's visual weight (structure/handlers unchanged, presentation upgraded).
- **Risk-o-meter gauge** — see §3.

## 6. Live page changes

Order top to bottom: Client Details card (new) → FundPicker (unchanged) → Asset Allocation (donut + table) → Sector Exposure (bars) → Security Exposure (bars) → Scheme Details (+ AUM, + Risk-o-meter gauge) → Portfolio Overlap (heatmap) → M-Cap Allocation (stacked bars) → Growth Projection (new). Same `CollapsibleSection` shell throughout.

## 7. PDF export changes

- **Cover page**: dark-green gradient hero (matching OG-image branding), logo, "Investment Proposal" title, client block (name/email/phone) + advisor block side by side, key-stats strip (Total/Type/Funds), date. Forced onto its own page via `page-break-after`.
- **Running header on every page**: small logo + firm name fixed to the top of each printed page via `position: fixed` in the print stylesheet — not just the cover (this was the user's explicit complaint: "My logo should be there in all the pages").
- **Pagination**: every section heading is wrapped with its immediately-following content in a single `page-break-inside: avoid` block, so a heading can never strand itself at the bottom of a page the way "Portfolio Overlap (Named Holdings)" did in the reported bug. Not forcing rigid one-section-per-page (NJ's approach wastes significant whitespace in several places) — content flows naturally except at that specific failure point.
- **Growth Projection section**: added, per §2.
- **Closing section**: disclaimer + brief next-steps, expanded from today's single paragraph, same ARN/EUIN convention already used sitewide.

## Out of scope (explicitly deferred, not silently dropped)

- Expense Ratio (Direct/Regular mismatch not solved by this AUM pipeline).
- "Probability of negative returns" statistic (see §2 reasoning).
- Server-rendered PDF file (e.g. via a headless-browser/Puppeteer pipeline) — staying with the existing browser print-to-PDF pattern.
- Multi-client / family-consolidated proposals.
