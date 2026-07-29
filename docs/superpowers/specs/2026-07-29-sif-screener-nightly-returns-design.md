# SIF Screener Nightly Returns — Design

## Summary

Bring the SIF section of the MF Screener (`app/screener/page.js`) to feature parity with the MF section: real derived returns/risk metrics, a Columns selector, sortable columns, and return-based leader cards — instead of today's NAV-only table. This requires a new nightly precompute pipeline for SIF data, mirroring the existing MF pipeline (`scripts/build-screener.mjs` → `mf_screener` Postgres table → `/api/screener`), since SIF returns must be derived live from real NAV history rather than read from a precomputed source, and doing that live for every visible row on every page load isn't viable at scale.

## Background

- SIF's underlying data is genuinely different from MF's: MF has 1,800+ funds with returns precomputed nightly into `mf_screener`; SIF has only ~31 schemes (after excluding IDCW/payout/reinvest/bonus/segregated variants, confirmed via a live count against production) with no precomputed table at all — every return today would need deriving from real NAV history on demand.
- The MF/SIF fund-comparison feature (`app/screener/compareEngine.js`) already has proven, shipped return/risk derivation logic (`deriveReturnsFromSeries`, `deriveRiskFromSeries`) and NAV-history fetching (`fetchNavSeries`, including a wide-window-then-narrow-fallback resilience pattern for AMFI's undocumented range limits) — used today only for up to 3 user-selected funds at a time inside the comparison modal.
- This codebase's established convention is that standalone build scripts (`scripts/build-screener.mjs`) do NOT cross-import from the Next.js app (`app/`, `lib/`) — they reimplement whatever logic they need internally, since the app's `@/` path alias doesn't resolve outside Next.js's own bundler. The new SIF build script follows the same convention.
- MF's own screener page copy already reads "Live · rebuilt daily from AMFI NAVs" despite being a once-daily nightly build — this codebase already treats "Live" as "sourced from AMFI's real feed," not literally real-time, and relies on a transparent "as of {date}" disclosure rather than any staleness-detection machinery. This design follows the same convention for SIF.
- An earlier same-day fix (commit `3d44813`) added a client-side IDCW filter to the SIF table as an interim measure. This design's build-time filter supersedes it; the client-side filter should be removed once this ships.

## 1. Nightly build script

A new `scripts/build-sif-screener.mjs`, modeled directly on `build-screener.mjs`'s standalone style — no shared imports with the app, adapted copies of the proven math instead.

Steps:
1. Fetch all SIF schemes from AMFI's `sif-latest-nav` endpoint directly (the same one `/api/sif-nav` proxies) — bulk, one call.
2. Filter out IDCW/payout/reinvest/bonus/segregated variants via the same regex already used client-side today: `/(idcw|payout|re-?invest|bonus|segregated)\b/i` tested against each scheme's `nav_name`. This is the authoritative filter going forward; the client-side one added in commit `3d44813` is removed as part of this work.
3. For each remaining scheme (~31 today), fetch its NAV history directly from AMFI's `sif-nav-history` endpoint (the same one `/api/sif-history` proxies), using a standalone-adapted copy of `fetchNavSeries`'s wide-window-first (5 years), narrow-window-fallback (400 days) resilience pattern, since AMFI's undocumented API rejects overly-wide date ranges outright.
4. Compute per scheme, via standalone-adapted copies of the existing, proven logic:
   - `ret_1m/3m/6m/1y/3y/5y/7y/10y` — sub-year periods as absolute change, 1y+ as CAGR (same split as `deriveReturnsFromSeries`).
   - `ret_inception` and `ret_inception_annualized` — same sub-year/1y+ split and method-tracking as the comparison feature's now-corrected inception logic.
   - `vol`, `max_dd`, `ret_per_risk` — same formulas as `deriveRiskFromSeries`.
   - `age_years` — from the scheme's real first NAV date.
5. Write to a new `sif_screener` table via `DELETE` + bulk `INSERT`, mirroring `mf_screener`'s exact write pattern (not a safer upsert) — an intentional match to MF's existing, accepted trade-off (a script crash mid-run could leave the table briefly empty until the next successful nightly run), not a new risk introduced by this design.

Scheduling: added as an additional step in the existing `.github/workflows/screener.yml` workflow, which already runs on the cron `30 2 * * *` (~08:00 IST daily, chosen because AMFI typically publishes NAVs by night). The new SIF build step runs in the same job, on the same schedule, rather than as a separate workflow file, since both feed the same page and depend on the same "AMFI has published by morning" assumption.

## 2. Data model

New `sif_screener` table:

```sql
CREATE TABLE IF NOT EXISTS sif_screener (
  scheme_id TEXT PRIMARY KEY,
  nav_name TEXT NOT NULL,
  sif_name TEXT,
  category TEXT,
  nav NUMERIC,
  nav_date DATE,
  ret_1m NUMERIC, ret_3m NUMERIC, ret_6m NUMERIC, ret_1y NUMERIC,
  ret_3y NUMERIC, ret_5y NUMERIC, ret_7y NUMERIC, ret_10y NUMERIC,
  vol NUMERIC, max_dd NUMERIC, ret_per_risk NUMERIC,
  age_years NUMERIC, inception_date DATE,
  ret_inception NUMERIC,
  ret_inception_annualized BOOLEAN,
  asof DATE
);
```

Matches `mf_screener`'s column set exactly (renamed `code`→`scheme_id`, `name`→`nav_name`, `amc`→`sif_name`; no `structure` column, since that concept doesn't apply to SIF), plus one new column: `ret_inception_annualized`. This doesn't exist in `mf_screener` because MF's server pipeline is always-CAGR-or-null (inferable at read time from whether `ret_inception` is non-null — confirmed against `scripts/build-screener.mjs`'s existing `retInception` computation, a single CAGR-only ternary with a 0.5-year threshold and no absolute branch). SIF's pipeline, like the comparison feature's client-side derivation, has a genuine sub-year/1y+ split, so the method must be stored explicitly rather than inferred.

Matching MF's schema in full (including the currently-always-null `ret_3y/5y/7y/10y` columns for today's sub-1-year-old SIFs) is deliberate: as SIFs age past 1/3/5 years, those columns start populating with zero schema changes needed later — the same forward-looking principle already applied to the comparison feature's dynamic peer-rank period and inception-method labeling.

## 3. New API route

`/api/sif-screener` — a fast `SELECT * FROM sif_screener ORDER BY ...`, mirroring `/api/screener`'s exact response shape and caching headers (`Cache-Control: s-maxage=..., stale-while-revalidate=...`).

## 4. Main table data source switch

`app/screener/page.js`'s main SIF table switches from `/api/sif-nav` (live, 4-hour Vercel Blob cache) to `/api/sif-screener` (nightly precomputed) — full switch, not a merge of two sources, matching MF's architecture exactly as agreed. The eyebrow copy changes from "Live · from AMFI SIF NAV API" to "Live · rebuilt daily from AMFI NAVs", matching MF's own phrasing exactly.

`/api/sif-nav` and `/api/sif-history` are NOT touched or deprecated by this work — they continue serving their other existing consumers (the fund-detail drawer's live sparkline, and the comparison feature's on-demand per-fund NAV fetch) unchanged. Switching those to the nightly source too is explicitly out of scope for this iteration; a natural follow-up if wanted later.

## 5. UI changes

- **Columns selector**: the SIF table gains the exact same "Columns:" toggle bar as MF, reusing MF's existing `METRICS` array/component directly (not a parallel copy) — NAV / 1M / 3M / 6M / 1Y / 3Y / 5Y / 7Y / 10Y / Vol / Max DD / Ret/Risk / Inception, identical behavior on both tables.
- **Sorting**: no new sort logic needed — the SIF table's existing sort function is already generic over strings and numbers; clicking a new numeric column header to sort by it works as soon as the column exists.
- **Leader cards**: switch from showing raw NAV to showing a real derived return, using a "longest available common period" selection computed independently **per category**: for each category, walk the existing `RANK_PERIOD_FALLBACK` list (3Y → 1Y → 6M → 3M → 1M, already built for the comparison feature's peer-rank) and use the longest period where **at least 2 of that category's SIFs** have data — reusing the same "needs ≥2 comparable data points to be meaningful" rule already applied throughout the comparison feature (`categoryPeerRank`, `computeVerdictScores`, `bestIndexFor`). A category with slightly older funds might rank leaders by 1Y while an all-brand-new category ranks by 1M; this shifts automatically as SIFs age, with no future code changes needed. Naturally caps at 3Y, matching MF's own leader cards (fixed at "top 3 by 3-year return").
- The client-side IDCW filter added in commit `3d44813` is removed, superseded by the new build-time filter.

## 6. Error handling

- Per-scheme isolation: a fetch or derivation failure for one SIF only nulls that scheme's return/risk columns — never blocks the other ~30. Mirrors the existing per-fund isolation already in `fetchNavSeries`/`applyDerivedStats`.
- Whole-job failure (e.g. AMFI unreachable): no special retry or alerting beyond what MF's own pipeline already has (none) — an intentional match, not a gap. The table is only touched by a run that reaches the write step.

## 7. Testing

- Standalone Node verification scripts (matching this session's established convention) proving the build script's adapted return/risk math against hand-constructed NAV series — largely re-confirming formulas already validated in `compareEngine.js`'s own test suite, just checking the standalone copies match exactly.
- A manual dry-run of the build script against a handful of real scheme IDs (not the full ~31) before wiring it into the scheduled workflow, to catch any AMFI-response-shape surprises early.
- `npm run build` for a clean compile, plus a manual browser walkthrough of the updated SIF table, Columns selector, sorting, and leader cards once implemented.
