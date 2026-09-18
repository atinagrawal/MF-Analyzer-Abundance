# Portfolio Review / Quartile Ranking Planner (Design)

## Goal

Add a "Portfolio Review" report to CAS Tracker that groups a client's (or
family's) mutual fund holdings by SEBI sub-category and ranks each one into
a performance quartile (1-4) against every other fund in that category —
the same shape as the "Scheme Analysis" pages of an NJ Wealth Portfolio
Review Report, which the user supplied as a style reference (a real client
statement, `Puneet_Agarwal_446676_1764417351157.pdf`, pages 11-12).

By default the report **excludes** holdings sold under Abundance's own ARN
(ARN-251838) — the point is to surface the funds NOT under this advisor's
management (other distributors, self-directed picks) so they can be
reviewed for a possible switch/consolidation. A checkbox lets the advisor
include their own funds too; off by default.

## Background — verified facts

Read directly from the reference PDF (rendered via PyMuPDF, since
`pdftoppm`/poppler isn't installed in this environment — `pdftotext -layout`
mis-orders the merged-cell columns, so pages were rendered to PNG and read
visually instead):

- Page 5 ("Distributor/Advisor Wise Break Up") shows the client's holdings
  split by ARN: 97.77% under `ARN-112443`, 2.23% under `MUMB8059`. Page
  11-12's Scheme Analysis total (₹31,94,311) matches the grand total across
  **both** — NJ's own report does not exclude either distributor. The
  "skip funds sold by us" requirement is therefore a decision for **our**
  tool, not something being copied from NJ's behavior.
- Page 11-12 groups holdings under bold SEBI sub-category header rows
  (Large Cap Fund, Small Cap Fund, ...), each header row showing a
  category-level "Median (3 Yrs)/Median (5 Yrs)" return, followed by each
  held scheme's own row: ISIN, current value, holding %, its own
  Median(3Yr)/Median(5Yr) rolling return, and an "NJ Quartile Ranking"
  column pair (3 Yrs / 5 Yrs, values 1-4). A fund without enough history
  for a period shows blank/NA in both the return and quartile cells (e.g.
  Axis Multicap Fund, inception too recent for 3Yr/5Yr data).
- NJ's "Median" figures are **rolling-window** returns (the median of many
  overlapping N-year CAGR windows across a fund's full history), not a
  single point-to-point return — confirmed by the category header row and
  each fund's own row showing different numbers under the same column
  pair. This is a materially heavier computation than what this app
  currently stores (see next point) and is **not** what v1 will compute —
  see Decision 1 below.

Existing infrastructure this feature reuses as-is (no new data engine):

- `mf_screener` (`scripts/screener-schema.sql`, built nightly by
  `scripts/build-screener.mjs` on GitHub Actions) already has `category`
  (SEBI sub-category, straight from AMFI's own section headers — the same
  taxonomy NJ's report uses) and `ret_1y`/`ret_3y`/`ret_5y` (point-to-point
  CAGR, `NUMERIC`, `NULL` when a fund lacks enough history) for the entire
  Regular+Growth fund universe.
- `/api/screener` (`app/api/screener/route.js`) already returns this whole
  dataset as JSON, 6h-cached (`revalidate = 21600`) — the same endpoint
  `app/screener/ScreenerClient.jsx` uses. No new backend route is needed to
  get peer data into the browser.
- `mf_screener`'s own universe comment: "Regular plan + Growth option only
  (Direct and income options hidden)" — Direct-plan holdings will not have
  a peer row to join against (see Decision 3).
- Every CAS holding already carries `amfiCode`, `advisor`, `folio`, and the
  owning `pan` (via `__ownerPan` in family view) — verified in
  `buildAllHoldings()` and `calculateFifoCost()`'s callers,
  `app/cas-tracker/page.js`. `amfiCode` joins straight into
  `mf_screener.code`; `advisor`/`folio`/`pan` are exactly what
  `resolveHoldingArn(pan, folio, advisorStr, overrides)`
  (`lib/distributorResolution.js`) already takes, returning bare ARN
  digits (e.g. `'251838'`, not `'ARN-251838'`).
- The floating "📊 Plan Redemption" selection bar and the
  `PortfolioRedemptionPlanner` drawer (`app/cas-tracker/page.js`) already
  establish the UI pattern this feature follows: a wide right-side drawer,
  a `window.print()` button, a branded print stylesheet matching
  `exportPdf`'s isolated-window pattern, and (as of the family-name fix
  shipped alongside this design) correct single-vs-multi-owner name
  resolution in the header.
- `app/pms/[id]/PMSDetailClient.jsx` + `pms-detail.css` already render an
  unrelated but visually-precedented "Peer Quartile Ranking" table
  (`.pmsd-quartile-table`, `.pmsd-quartile-badge`) for PMS strategies —
  that data comes from a live APMI scrape (`lib/pmsQuartileCache.js`), a
  different system with no reusable calculation logic for mutual funds,
  but its badge styling is a reasonable visual starting point for
  consistency.

User decisions made during brainstorming (2026-09-18):

1. **v1 computes quartiles from `ret_1y`/`ret_3y`/`ret_5y` (point-to-point
   CAGR), not true rolling-window medians.** Rolling windows would require
   fetching and windowing full NAV history per fund in a category — a new,
   much heavier data engine — and the user explicitly deferred that call
   ("take your call") after asking mainly about missing-data fallback
   behavior. The report will label columns honestly ("3Yr Return", not
   "3Yr Rolling Return") to avoid overclaiming NJ's methodology. Flagged
   as a documented limitation, revisit if this proves insufficient once
   the user sees it.
2. Missing data handled **per-period, independently** — 1Yr, 3Yr, and 5Yr
   quartiles are each computed and shown separately (three columns, not
   one blended/fallback number), and a fund with no return for a given
   period shows "-" for that column only (matches NJ's own NA convention).
   The user explicitly permitted "do it for 1, 3 and 5 in all cases."
3. ARN exclusion: **default-excluded**, with a checkbox to include the
   logged-in distributor's own funds. Hardcode `'251838'` (bare digits) as
   "Abundance's own ARN" — this is already how every other disclaimer/
   footer in the codebase identifies the firm (`ARN-251838` appears as a
   literal string across `app/page.js`, `lib/proposalEmail.js`,
   `app/api/admin/notify/route.js`, etc.); there is no per-advisor-account
   ARN concept anywhere in this single-advisor app to key off instead.
4. Lives in **CAS Tracker only** for v1 (not `/portfolio`) — the ARN
   exclusion checkbox is advisor-facing language, matching how the
   existing ARN-resolution/"who sold this" features are already CAS
   Tracker-only per `docs/superpowers/specs/2026-08-16-amfi-distributor-cas-tracker-design.md`.

## Architecture

### `lib/quartileRanking.js` (new, pure functions, no React/page dependency)

Mirrors `lib/distributorResolution.js`'s page-agnostic style so a later
effort can wire this into `/portfolio` without re-deriving the logic.

```js
// Buckets `funds` (mf_screener rows already filtered to one category) into
// quartiles for one return period ('ret_1y' | 'ret_3y' | 'ret_5y').
// Returns a Map<code, 1|2|3|4> — only for funds with a non-null value for
// this period; callers show "-" for any fund/period absent from the map.
// Quartile 1 = top 25% of returns in the category, 4 = bottom 25%.
export function quartilesForPeriod(categoryFunds, period) {
  const ranked = categoryFunds
    .filter(f => f[period] != null)
    .sort((a, b) => b[period] - a[period]);
  const n = ranked.length;
  const result = new Map();
  ranked.forEach((f, i) => {
    const quartile = Math.min(4, Math.floor((i / n) * 4) + 1);
    result.set(f.code, quartile);
  });
  return result;
}

// Full report builder: given the client's (already ARN-filtered) holdings
// and the full mf_screener dataset, groups by category, computes all three
// periods' quartiles, and returns [{ category, categoryMedian: {ret_1y,
// ret_3y, ret_5y}, funds: [{ ...holding, quartiles: {ret_1y, ret_3y,
// ret_5y} }] }, ...], plus an `unranked` array for holdings with no
// mf_screener match (Direct plans, manual holdings with no amfiCode).
export function buildQuartileReport(holdings, screenerFunds) {
  const byCode = new Map(screenerFunds.map(f => [f.code, f]));
  // ... groups holdings by byCode.get(h.amfiCode)?.category, calls
  // quartilesForPeriod per category/period, computes category median via
  // a simple median() helper over each period's non-null values.
}
```

Unit tests (`tests/quartileRanking.test.js`, following this repo's
`node tests/x.test.js`-with-`assert` convention — no framework) cover:
bucketing math at small/odd `n` (ties, n<4), a fund missing one period but
present in another, an empty category, and the unranked/no-match path.

### `components/PortfolioReviewPlanner.jsx` (new drawer component)

Same shape as `components/RedemptionPlanner.jsx` (a fixed-position
right-side drawer, backdrop, `onClose`), not embedded inline in
`app/cas-tracker/page.js` like `PortfolioRedemptionPlanner` is — kept as
its own file since this component owns a `/api/screener` fetch and a
sizeable render, and doesn't need any of the redemption planner's local
state.

Props: `holdings` (the currently-viewed holdings — respects
`activePan`/family-pooled selection exactly like the existing "📊
Redemption Planner" button does), `activePan`, `investorName`,
`familyName`, `arnOverrides`, `onClose`.

Behavior:
1. On open, `fetch('/api/screener')` once (client-side; the route is
   already 6h-cached server-side, so this is cheap and matches how the
   Screener page itself fetches).
2. Checkbox "Include funds sold by Abundance (ARN-251838)", unchecked by
   default. Filtering holding-by-holding via
   `resolveHoldingArn(h.__ownerPan || activePan, h.folio, h.advisor, arnOverrides) !== '251838'`
   when unchecked — the `__ownerPan || activePan` fallback is required
   verbatim (not just `activePan`) so this resolves correctly per-holding
   in pooled family view too; it's the exact expression already used at
   `app/cas-tracker/page.js:2734`, so `activePan` must be passed down as a
   prop alongside `holdings`.
3. Calls `buildQuartileReport()` on the filtered holdings + fetched
   screener data.
4. Renders one table per category: header row with category name and
   category median return(s) for context, then each fund's row (name,
   current value, holding %, quartile badge × 3 periods — "-" for
   missing). An "Unranked" section at the end for no-match holdings, with
   a one-line explanation (Direct plan / manual holding, not in the
   screener universe).
5. Header name uses the same single-vs-multi-owner resolution as
   `PortfolioRedemptionPlanner`'s `displayName` (real name when every
   included holding belongs to one member, `familyName` otherwise) —
   duplicated locally rather than extracted into a shared helper for this
   first usage; extract if a third consumer needs it.
6. Footer note: "N funds, ₹X excluded — sold under Abundance's own ARN"
   when the exclusion is active, so the exclusion is always visible, never
   silent. Standard disclaimer line (ARN-251838, "not investment advice"),
   matching every other PDF export in this codebase.
7. 🖨 Print button (`window.print()`), CSS scoped the same way
   `PortfolioRedemptionPlanner`'s print rules already are.

### Wiring into `app/cas-tracker/page.js`

New button "📊 Portfolio Review" next to the existing "📊 Redemption
Planner" button (~`app/cas-tracker/page.js:2527`) — **not** disabled in
family view (unlike the redemption planner button), since a quartile
report across pooled family holdings is meaningful (each row still shows
its own owner via the existing `__ownerName` tag pattern). New state
`const [showPortfolioReview, setShowPortfolioReview] = useState(false)`,
rendered as a sibling to the existing drawer overlays
(`app/cas-tracker/page.js:~3280-3300`).

## Data flow / error handling

- `/api/screener` failing or returning empty: show an inline error in the
  drawer ("Peer fund data unavailable — try again shortly"), same
  non-fatal-fetch pattern already used throughout this page (e.g. the
  pan-name/default-pan fetches' `catch { /* non-fatal */ }` blocks) —
  never blocks the drawer from opening, just leaves the report empty with
  an explanation.
- A holding with `amfiCode` present but not found in the fetched screener
  dataset (delisted/merged scheme, or a SIF — `mf_screener` is MF-only,
  SIFs have their own `sif_screener` table per the Data Engines memory)
  goes to the Unranked bucket, same as a holding with no `amfiCode` at
  all — one code path, not two.
- No new failure modes for existing features: this is purely additive
  (new button, new drawer, new lib file, new component) — nothing in the
  existing redemption/export/FIFO code paths is touched.

## Testing

- `tests/quartileRanking.test.js` (new) — pure-function unit tests as
  described above, run via `node tests/quartileRanking.test.js` per this
  repo's existing convention.
- Manual verification in the running app (`/cas-tracker`, an uploaded
  multi-holding CAS): quartile numbers spot-checked against a few funds'
  known category standing; ARN checkbox toggling in/out the right
  holdings; family-view owner attribution on each row; print output.

## Out of scope for v1

- True rolling-window median returns (Decision 1) — `mf_screener` would
  need a new NAV-history-windowing data engine; revisit if point-to-point
  quartiles prove misleading in practice.
- `/portfolio` (client-facing) surface — CAS Tracker only for now
  (Decision 4), consistent with the existing ARN-resolution feature's own
  scope decision.
- Extending `mf_screener`'s universe to include Direct plans, which would
  let Direct-plan holdings get a real quartile instead of landing in
  Unranked — a build-screener.mjs change, out of scope here.
