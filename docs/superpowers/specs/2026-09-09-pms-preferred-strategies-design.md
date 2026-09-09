# PMS Preferred Strategies Page — Design Spec

**Status:** Approved by Atin, ready for implementation planning.

## Goal

A new page, `/pms-preferred`, that showcases a curated, objectively-derived
subset of the 35 PMS strategies (across 8 providers) this session already
built deep factsheet-extraction data for — holdings, sector/market-cap
allocation, fundamentals vs benchmark, all live in R2's
`pms-factsheets.json`. Framed as "Abundance's editorial picks" rather than a
recommendation: inclusion is driven by a disclosed, factual, automatically-
recomputed rule (Top Quartile vs APMI peers), not manual curation — an
important distinction given Atin is a SEBI/APMI-registered PMS distributor,
not a licensed investment adviser. The page must also surface insight no
single strategy's own factsheet can show — cross-strategy aggregates only
possible because this app holds all 35 strategies' extracted data together
(most-held stock across the set, sector with the most aggregate conviction,
best alpha, best Sharpe ratio). Free and SEO-indexable; a sortable/
filterable table view of the same set is Pro-gated.

## Background: what already exists that this builds on

- **`pms-factsheets.json`** (R2, written by `scripts/sync_pms_factsheets.js`,
  read via `lib/pmsFactsheetsCache.js`): for each of 8 providers, a list of
  `{ strategyName, docType, period, title, url, extracted? }` documents.
  `extracted` (only on `docType: 'factsheet'` docs that succeeded) has the
  shape: `{ asOfDate, marketCapAllocation, sectorAllocation, topHoldings,
  portfolioAttributes, portfolioChanges, extractedAt }` — see
  `scripts/sync_pms_factsheets.js`'s `EXTRACTION_SCHEMA_PROMPT` for the exact
  field-level shape of each. Not every strategy's `extracted` is fully
  populated — some fields are honestly `null` where a factsheet doesn't
  publish that metric (e.g. no Sharpe Ratio table at all, no top holdings
  with weights). 35 of the tracked strategies currently have `extracted`
  data; this page only ever considers strategies where `extracted` is
  present at all.
- **APMI quartile data** (`lib/pmsQuartileCache.js`'s `getPmsQuartileCached
  (id, providerName, strategyCategory, year, month)`): returns an array of
  rows shaped `{ period, label, peers, iaTwrr, benchmark, quartile }` for
  APMI's own periods — confirmed live shape includes `label` values "1
  Year", "2 Years", "3 Years", "5 Years", "7 Years", "10 Years" (no "Since
  Inception" row in this particular table). A period a strategy is too young
  to have real peer data for still appears as a row, but with `peers` as the
  only populated field — `iaTwrr`, `benchmark`, and `quartile` are `null`.
  `quartile` is a string exactly `"Top Quartile"` when applicable (rendered
  today via `pmsd-quartile-badge` on `/pms/[id]`).
- **Confusing but load-bearing existing quirk:** the `strategyCategory`
  parameter `getPmsQuartileCached` takes is `details.strategyName` from
  `getPmsDetailsCached` — despite the name, this field holds APMI's broad
  category ("Equity", "Debt", …), **not** the product's actual identity
  (that's `details.iaName` / `details.productName`). Follow the exact same
  call pattern already used in `app/api/pms-detail/[id]/route.js` (`details
  .strategyName || 'Equity'`) — don't rename or "fix" this quirk as part of
  this work, it's relied on elsewhere.
- **The PMS leaderboard cache** (`pms-cache/pms-equity-{YYYY}-{MM}.json`,
  written by `app/api/pms-data/route.js`'s scraper): an array of `{ id,
  portfolioManager, strategyName, apmiLink, aum, ret1M, ret3M, … }` rows —
  `apmiLink` contains the real APMI `IAID` as a query param
  (`?IAID={n}`). This is the *only* place in the app that already maps a
  provider+strategy pair to its IAID at scale; every other place (including
  this feature) needs to resolve an IAID by scanning this cache, since
  `pms-factsheets.json`'s documents don't carry one. All 35 tracked
  strategies are Equity category — only `pms-equity-*.json` needs scanning
  for this work (a future Debt/Hybrid provider would need extending this,
  out of scope now).
- **Existing fuzzy-matching precedent** (`lib/pmsFactsheetsCache.js`'s
  `STOPWORDS`, `significantWords()`, and `getFactsheetDataForStrategy()`):
  strips generic PMS/corporate words from both sides, then scores a
  candidate by what fraction of *its own* distinguishing words appear in the
  target string, picking the highest-scoring match. That function matches
  in the opposite direction from what this feature needs (given an IAID's
  real `iaName`, find the matching factsheet document) — this feature needs
  the reverse (given a factsheet's `providerName` + `strategyName`, find the
  matching leaderboard row's IAID). Re-implement the same scoring algorithm
  in the new script rather than importing it, to keep the two files
  decoupled (this session's own precedent: every provider fetcher in
  `sync_pms_factsheets.js` is self-contained rather than sharing matching
  helpers across files).
- **`scripts/sync_pms_factsheets.js`'s `PROVIDERS` export**: each entry has
  `{ key, displayName, matchFragments, fetch }` — `matchFragments` (e.g.
  `['sundaram']`, `['green lantern']`) is exactly the substring-match list
  needed to filter the leaderboard cache down to one provider's rows before
  the per-strategy name-scoring step. Reuse this via `require
  ('./sync_pms_factsheets.js').PROVIDERS` rather than duplicating the list.
- **`.github/workflows/pms-factsheets-sync.yml`**: the existing monthly (10th
  of each month) scheduled job. This feature adds a second step to the same
  job, after the existing factsheet sync step, rather than a new workflow —
  guarantees the preferred-list computation always runs against that same
  run's fresh `pms-factsheets.json`, and needs no new secrets (same R2 creds
  already present in the job).

## Non-Goals

- No manual/hand-maintained strategy list — the whole point is an
  automatically-recomputed, disclosed, factual rule.
- No new Postgres table — matches every other PMS data source in this app
  (R2-blob-only), see `lib/pmsPreferredCache.js` below.
- Debt/Hybrid/Multi-Asset strategies — none of the 8 tracked providers'
  factsheet-extracted strategies are outside Equity today; extending IAID
  resolution to other leaderboard caches is future scope if that changes.
- A dedicated `sitemap-pms-preferred.xml` — this is one static-ish URL, not
  per-id like `/pms/[id]`, so it's a plain entry in the existing
  `app/sitemap.xml`, not a new generated sitemap route.
- Re-deriving performance/return figures independently — all returns used
  for the "best alpha" insight come from data already cached by
  `getPmsPeriodHistoryCached`, not a new scrape.

## Architecture

### New computation script: `scripts/compute_preferred_pms.mjs`

Run as an added step in `.github/workflows/pms-factsheets-sync.yml`
immediately after the existing `node scripts/sync_pms_factsheets.js` step,
so it always sees that run's just-written `pms-factsheets.json`. Also
runnable manually (`node --env-file=.env.local scripts/compute_preferred_pms.mjs`)
for local verification, matching every other script in `scripts/`.

**Step 1 — Load candidates.** Read `pms-factsheets.json` from R2. For every
document across every provider where `docType === 'factsheet'` and
`extracted` is present, that's a candidate: `{ providerKey, providerName
(from PROVIDERS displayName), strategyName, extracted }`.

**Step 2 — Resolve each candidate's IAID.** Load the freshest available
`pms-cache/pms-equity-{YYYY}-{MM}.json` (try the current year/month, then
walk backward month-by-month up to 3 months if that exact key doesn't exist
yet — the leaderboard cache and the factsheet sync don't necessarily refresh
on identical days). Filter that array to rows whose `portfolioManager`
(lowercased) contains any of the candidate's provider's `matchFragments`.
Among those rows, score each by the same `significantWords`-overlap
approach as `lib/pmsFactsheetsCache.js` (candidate's own distinguishing
words found in the target ÷ candidate's total distinguishing words), using
the row's `strategyName` as the target and the factsheet document's
`strategyName` as the candidate. Take the highest-scoring row with score >
0, first-found wins on an exact tie (matches `getFactsheetDataForStrategy`'s
own `score > bestScore` — strictly-greater, never overwrites an equal
score); if none score above 0, log a warning and drop this candidate (never
guess an IAID). Extract the `IAID` from that row's `apmiLink` query string.

**Step 3 — Pull quartile eligibility.** For each resolved IAID: call
`getPmsDetailsCached(id)` (for `providerName`/`strategyName`-as-category),
`getPmsPeriodHistoryCached(id)` (for the latest `asOnMonth`, needed to call
quartile), then `getPmsQuartileCached(id, details.providerName, details
.strategyName || 'Equity', year, month)` — exactly the same three-call
sequence `app/api/pms-detail/[id]/route.js` already makes, all already
cached (memory → R2 → live), so this is cheap for strategies whose
`/pms/[id]` pages have been visited recently and only slow (not wrong) for
genuinely cold ones.

**Step 4 — Apply the Top-Quartile rule** (pure function, unit-testable, no
network calls — see Testing):
```
isPreferred(quartileRows):
  threeYear = quartileRows.find(r => r.label === '3 Years')
  if threeYear && threeYear.quartile != null:
    return threeYear.quartile === 'Top Quartile'
  # No real 3-Year peer data (too new) -- fall back to majority-of-available
  withData = quartileRows.filter(r => r.quartile != null)
  if withData.length === 0: return false   # nothing to judge on -- excluded, never guessed
  topCount = withData.filter(r => r.quartile === 'Top Quartile').length
  return topCount >= Math.ceil(withData.length / 2)
```
A candidate whose IAID resolution failed (Step 2) never reaches this
function — it's already excluded.

**Step 5 — Compute cross-strategy aggregates**, over the qualifying set
only (not all 35 candidates):
- **Most-held stock**: tally `extracted.topHoldings[].name` (exact string,
  case-sensitive — these come from real company names in real factsheets,
  no fuzzy dedup) across every qualifying strategy; the name with the
  highest count wins, report `{ name, count, strategies: [names it appears
  in] }`. Strategies with `topHoldings: null` (a couple of Sundaram/Alchemy
  ones) are simply skipped for this tally, not treated as zero. A count tie
  breaks alphabetically by name (deterministic, avoids the result silently
  changing between two equal-count runs).
- **Top aggregate sector**: sum `extracted.sectorAllocation[].weightPct` per
  distinct `sector` string across qualifying strategies (raw sum, not
  averaged — a sector that's heavily represented across many strategies
  *should* dominate this ranking); report `{ sector, totalWeightPct,
  strategies: [names] }`. A sum tie breaks alphabetically by sector name,
  same reasoning as above.
- **Best alpha**: for each qualifying strategy, `performance.ia.year1 -
  performance.benchmark.year1` from the same `getPmsPeriodHistoryCached`
  data already pulled in Step 3 (latest month's row); skip strategies where
  either side is `null` (too new for a 1-Year figure); report the strategy
  with the highest positive spread.
- **Best Sharpe**: highest `extracted.portfolioAttributes.sharpeRatio
  .strategy` among qualifying strategies that have one (several don't
  publish it at all — skipped, not zero).

**Step 6 — Write the result** to R2 key `pms-preferred-strategies.json`:
```json
{
  "computedAt": "2026-09-09T12:00:00.000Z",
  "criteria": {
    "quartilePeriodPrimary": "3 Years",
    "fallbackRule": "Top Quartile in at least half of periods with real peer data, when 3-Year data isn't available yet"
  },
  "strategies": [
    {
      "iaid": 324,
      "providerKey": "sundaram",
      "providerName": "Sundaram Alternate Assets",
      "strategyName": "SISOP",
      "category": "Equity",
      "aumCr": 2271.9,
      "qualifyingPeriod": "3 Years",
      "quartile": "Top Quartile",
      "extracted": { "...": "the same shape already in pms-factsheets.json, carried through as-is" }
    }
  ],
  "insights": {
    "mostHeldStock": { "name": "...", "count": 7, "strategies": ["..."] },
    "topSector": { "sector": "...", "totalWeightPct": 214.3, "strategies": ["..."] },
    "bestAlpha": { "strategyName": "...", "providerName": "...", "alphaPct": 33.96 },
    "bestSharpe": { "strategyName": "...", "providerName": "...", "sharpeRatio": 1.61 }
  }
}
```
Use `scripts/lib/r2SyncSafety.js`'s `backupThenPut()` for the write, same
safety net as `sync_pms_factsheets.js`.

### New read-side cache: `lib/pmsPreferredCache.js`

Same `createR2JsonCache(key, ttlMs)` one-liner pattern as
`lib/pmsFactsheetsCache.js` and `lib/nfoData.js`. TTL 24 hours (this doc
only changes once a month via the script, but a short TTL means a manual
re-run of the script during testing is picked up promptly rather than
waiting out a long cache).

### New page: `app/pms-preferred/page.jsx` + `PmsPreferredClient.jsx` + `pms-preferred.css`

Server component `page.jsx`: reads `getPreferredStrategies()`, calls
`notFound()` only if the doc is entirely missing (never for "empty
strategies array" — see Error Handling), builds `generateMetadata` (title,
description, canonical) and JSON-LD (`ItemList` naming the qualifying
strategies, in the same `@graph` style as `app/fund/[code]/page.js`'s
`buildFaqJsonLd`) entirely from the free fields, `dynamic = 'force-dynamic'`
matching every other PMS page.

Client component `PmsPreferredClient.jsx`, mirroring `PMSDetailClient.jsx`'s
structure:
- **Always rendered (free):** intro copy + the disclosed criteria + the
  standard non-advice disclaimer (reuse the exact disclaimer copy already at
  the bottom of `/pms/[id]`); a 3–4 tile "Insights" section (most-held
  stock, top sector, best alpha, best Sharpe — each naming its source
  strategy and linking to that strategy's `/pms/[id]` page); a responsive
  card grid, one card per qualifying strategy (provider logo via the
  existing `getPMSLogo` helper, category, AUM, and one headline stat —
  qualifying period + "Top Quartile"), each card linking to `/pms/[id]`.
- **Pro-gated:** a sortable/filterable table of the same qualifying set
  (columns: strategy, provider, category, AUM, 1Y/3Y return, quartile
  period) — client-side `isPro` check identical to the pattern already used
  for Pro sections on `/pms/[id]`, so crawlers (unauthenticated) only ever
  see the free grid — exactly the content meant to be indexed.

### Sitemap / robots

Add `https://mfcalc.getabundance.in/pms-preferred` as a plain `<url>` entry
in `app/sitemap.xml` (it's one URL, not a per-id generated set — no new
`sitemap-*.xml` route needed). No `robots.js` change needed (the page isn't
under `/api/`).

## Error Handling

- **R2 doc entirely missing** (script never ran, or its write failed): page
  renders a genuine "coming soon" state, not a 404 and not fabricated
  content — same principle as the rest of this pipeline.
- **R2 doc present but `strategies` is empty** (rule genuinely excluded
  everyone this month — plausible in a bad quarter): page renders the
  criteria/disclaimer section plus an honest "no strategies currently meet
  this bar" message, not an empty-looking broken page.
- **IAID resolution fails for a candidate:** logged, candidate excluded from
  consideration entirely (never included with a guessed IAID, never
  silently treated as "not qualifying" in a way indistinguishable from a
  real quartile miss — the log line is what future debugging relies on).
- **A qualifying strategy is missing a field needed for one insight** (no
  `topHoldings`, no `sharpeRatio`, no 1Y return): excluded from *that one*
  aggregate's computation only, stays fully present as a qualifying
  strategy in the main list — one missing metric never disqualifies a
  strategy from the page.

## Testing

Matches this repo's established convention for these pipeline scripts (see
`sync_pms_factsheets.js`'s own `--self-test`): no test framework, verify via
`npm run build` for the page, a live run of the new script against real R2
data, and eyeballing the real output. The rule-application logic is worth
an isolated, offline self-test the same way — pure functions, no network:
- `isPreferred()`: a strategy with real 3-Year Top Quartile data (passes); a
  strategy with real 3-Year data that's *not* Top Quartile (fails, even if
  every other period is Top Quartile — 3-Year is authoritative when
  present); a strategy with no 3-Year data but Top Quartile in 2 of its 3
  available periods (passes, majority); a strategy with no 3-Year data and
  Top Quartile in only 1 of 3 (fails); a strategy with zero periods carrying
  real data at all (fails, not guessed).
- The aggregate tallies (most-held stock, top sector, best alpha, best
  Sharpe): fixture input with a few strategies, at least one deliberately
  missing each field being aggregated, confirming it's skipped for that
  metric without affecting the others.
