# PMS Wealth Simulation Redesign + 7Y/10Y Returns — Design

## Summary

Two related enhancements to the PMS Compare modal (`app/pms-screener/PMSCompare.jsx`) and the single-fund detail drawer (`app/pms-screener/page.jsx`):

1. Redesign "Wealth Creation Simulation" from a single 1-year figure into a 3-stop "Growth Journey Strip" (1Y → 3Y → 5Y), applied to both locations.
2. Add 7Y and 10Y return periods to the Returns section in both locations, sourced from the existing `/api/pms-quartile` route's `iaTwrr` field (the bulk `/api/pms-data` leaderboard only goes up to 5Y + Inception).

Comparison weighting (`PERIOD_WEIGHTS`) is extended to include the two new periods. No changes to the main PMS screener table (`~1,189`-fund Equity list) — see "Scope decision" below for why.

## Background

This follows directly from the APMI Quartile Ranking integration (`docs/superpowers/plans/2026-07-19-pms-quartile-integration.md`), which added `/api/pms-quartile` — a per-fund, on-demand endpoint returning peer-quartile data for 6 fixed periods (1Y/2Y/3Y/5Y/7Y/10Y), including each fund's own TWRR (`iaTwrr`) for periods the bulk leaderboard doesn't cover.

## Scope decision: main table excluded

The main screener table lists ~1,189 funds just for the Equity strategy. A sortable/filterable 7Y or 10Y column would require that data for every row, not just the visible page — infeasible to live-fetch per-fund at that scale (1,189+ APMI requests) within Vercel's constraints. The only feasible path would be a new batch pipeline (scheduled GitHub Action + Postgres table, mirroring the existing `build-screener.mjs`/`build-breadth.mjs` pattern) precomputing the whole universe monthly.

**Decision (confirmed by user): skip the main table entirely.** 7Y/10Y appears only in the Compare modal (≤3 funds) and the single-fund detail drawer (1 fund) — both already do on-demand, per-fund fetching at a scale (1-3 funds) where live fetching is fine. This also means **no new caching/storage pipeline is needed**: the existing `/api/pms-quartile` 3-layer cache (6h memory / 30-day Vercel Blob) already covers this scope, and its 30-day blob TTL already closely matches APMI's own monthly publish cadence. A batch pipeline would only pay for itself if the main table needed this data — it doesn't, per this decision.

## 1. Wealth Simulation redesign — "Growth Journey Strip"

**Visual design** (validated via mockup): 1Y → 3Y → 5Y shown left-to-right as three connected "stops," each showing the ₹ value (on a ₹50L basis) and % gain, joined by arrows to visually convey compounding over time.

**Responsive behavior:** below ~480px viewport width, the strip collapses to stacked vertical rows (same three numbers, no arrows) — validated as the preferred fallback since 3 stops + 2 arrows becomes illegible at phone width, and the stacked layout keeps all data legible with no loss of information (only the "journey" visual is dropped on the smallest screens).

**Where it appears:**
- **Compare modal** (`PMSCompareModal`): the existing `💰 Wealth Creation Simulation · ₹50 Lakh Invested 1 Year Ago` section (currently `fmtWealth(f.ret1Y)` only) becomes 3 stops per fund column, using `f.ret1Y`, `f.ret3Y`, `f.ret5Y` — all already present on `funds` today via the bulk `/api/pms-data` scrape. **No new data fetch required for this section.** Per-period "best fund" highlighting extends from the existing 1Y-only badge to all three stops, consistent with how the Returns section already highlights the best fund per period (reusing the existing `winners` computation, which already covers `ret1Y`/`ret3Y`/`ret5Y`).
- **Single-fund drawer** (`page.jsx`): the existing `Wealth Creation Simulation · ₹50 Lakh` card (currently `selected.ret1Y` only) becomes the same 3-stop strip using `selected.ret1Y`/`selected.ret3Y`/`selected.ret5Y` — likewise already available on `selected`, no new fetch. No "best" highlighting here (only one fund is ever shown).

## 2. 7Y/10Y returns

**Data source:** `/api/pms-quartile`'s `iaTwrr` field for `period: '7Y'` and `period: '10Y'`. Both Compare and the drawer already call (or, for the drawer, will newly call) this endpoint per-fund — see "Data flow" below.

**Compare modal:** `PERIODS` array gains two entries (`{label:'7 Years', key:'ret7Y'}`, `{label:'10 Years', key:'ret10Y'}`). Since `ret7Y`/`ret10Y` don't exist on the raw `funds` prop (they come from the quartile fetch, not the bulk leaderboard), the modal computes an enriched fund array — each fund merged with its `ret7Y`/`ret10Y` looked up from the already-fetched `quartileData` — and uses that enriched array everywhere the Returns section, `winners`, and `scores` currently use `funds`. This keeps the existing scoring/highlighting logic itself unchanged; it just operates on a richer per-fund object.

**Single-fund drawer:** `retPeriods` array (currently built from `selected.ret1M` … `selected.retInception`) gains two entries for 7Y/10Y, sourced from a **new** per-fund quartile fetch — the drawer doesn't call `/api/pms-quartial` today. This mirrors the existing `drawerBenchmark` pattern (a lazy fetch triggered when `selected` changes / the drawer opens, not fetched for the whole table): a new `drawerQuartile` state, fetched with the same request shape Compare already uses (`iaid` from `selected.apmiLink`, `provider` from `selected.portfolioManager`, `strategy`, `year`/`month` from `dataMonths` keyed by `selected.dataMonth`).

**Graceful degradation:** many funds (especially younger ones) will have `null`/NA for 7Y and/or 10Y — same as the existing Quartile Ranking section already handles today (renders "—" rather than breaking layout). The Returns section already skips a period row entirely if all shown funds are null for it (existing `allNull` check) — this applies unchanged to the two new periods.

## 3. Comparison weighting

`PERIOD_WEIGHTS` (Compare modal) gains two entries, continuing the existing scheme's established progression (each step from 3Y onward increases by 0.5):

| Period | 1M | 3M | 6M | 1Y | 2Y | 3Y | 5Y | 7Y | 10Y | Inception |
|---|---|---|---|---|---|---|---|---|---|---|
| Weight | 0.5 | 0.75 | 1 | 1.5 | 2 | 2.5 | 3 | **3.5** | **4** | 2 |

Rationale: longer verified track record earns more trust in the weighted verdict, the same logic already applied when 3Y/5Y were weighted above the shorter periods. The existing "skip a period from scoring if fewer than 2 funds have data for it" rule already handles the common case where 7Y/10Y data is sparse — no change needed to the scoring algorithm itself, only to the weights table it reads from.

## Testing approach

No test runner is configured in this repo (established in the prior quartile-integration plan). Verification: `npm run build` for a clean compile, plus manual dev-server checks — both wealth-simulation locations at desktop and sub-480px widths, the Returns section with a fund that has 7Y/10Y data and one that doesn't (graceful NA), and the Compare verdict banner/weighting with the new periods present.
