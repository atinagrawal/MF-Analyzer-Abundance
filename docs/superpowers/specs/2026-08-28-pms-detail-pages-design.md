# PMS Detail Pages — Design Spec

**Status:** Approved by Atin, ready for implementation planning.

## Goal

Give every PMS (Portfolio Management Service) strategy in the PMS Screener its
own dedicated, shareable, SEO-indexable page at `/pms/[iaid]` — the same role
`/fund/[code]` already plays for mutual funds. The page must show data the
PMS Screener's drawer doesn't today, most importantly **fee structure**
(fixed/variable fees, hurdle rate, performance fee, exit load), which Atin
flagged as a real gap. It must also surface APMI's month-on-month historical
performance data (confirmed available back to April 2023), gated so free
visitors and crawlers see real, useful content while richer analytics stay a
Pro feature — mirroring the MF fund detail page's existing gate exactly.

## Background: what APMI's IaInsight page actually offers

Investigated `https://www.apmiindia.org/apmi/IaInsight.htm?IAID={id}` live
(DOM inspection, network interception, then verified server-side with plain
`curl` — no cookies/session required for any of this). Confirmed:

- **Static details** (`<label><b>Field</b></label>...<p>Value</p>` markup,
  trivially parseable), server-rendered in the initial page HTML:
  PMS Provider Name, Benchmark, Strategy Name, Product Name, IA Name
  (the strategy's actual brand name, e.g. "RISING STAR"), Date of Inception,
  Age, Min. Investment Amount, Fixed Fees Structure, Variable Fees Structure
  (AMC % / Hurdle Rate / Performance Fee), Exit Load, Purpose, AUM (₹ Cr),
  1-Month and 1-Year Portfolio Turnover, and a Fund Manager card (name,
  work experience, email — often "NA" in practice).
- **Period-Wise Performance, historically queryable.** The page's "Submit"
  button (choose month/year) calls:
  ```
  POST https://www.apmiindia.org/apmi/getPerformanceChart.htm
  Content-Type: application/x-www-form-urlencoded
  Body: iaid={id}&serviceType=D&asondate={YYYY-MM-DD, last day of month}
  ```
  No auth needed — verified with a cookie-free `curl`. The response is an
  HTML fragment with a hidden input `#perlists` whose `value` attribute is a
  Java-`toString()`-style array (NOT valid JSON — needs a custom parser) of
  two objects: the IA's own figures (`BENCHMARK_ID=null`) and the benchmark's
  (`BENCHMARK_ID={n}`), each with `MONTH1, MONTH3, MONTH6, YEAR1, YEAR2,
  YEAR3, YEAR4, YEAR5, SINCE_INCEPTION` as of that month. **April 2023 is the
  confirmed floor** — March 2023 returns "No Records Found"; the current
  month works with today's date.
- **A rolling 12-month IA-vs-benchmark line chart** is also on the page, but
  it's baked into the initial server-rendered HTML for "today" only — not
  independently queryable by date the way the bar chart is. Not part of this
  spec (see Non-Goals).

**Scale finding that drives the architecture below:** the Equity/
Discretionary leaderboard alone (`POST /apmi/welcomeiaperformance.htm?
action=loadIAReport`, the endpoint `app/api/pms-data/route.js` already
scrapes) returned **~1,200 `<tr>` rows**. Our PMS Screener already covers
four strategies (Equity, Debt, Multi Asset, Hybrid), all Discretionary. The
full universe is thousands of strategies — most obscure, tiny-AUM, and never
viewed. Backfilling full history for all of them eagerly would mean tens of
thousands of requests to APMI's servers for pages nobody visits.

## Non-Goals

- The rolling 12-month line chart baked into APMI's own page (not
  independently queryable by date — low value to replicate).
- A self-serve "invest now" flow for PMS (unlike MF, PMS onboarding is
  agreement-based, not a platform signup link) — the page's CTA links to the
  existing Contact page instead of `StartInvestingButton`.
- Any new Postgres table. Everything here is cached scrape output, matching
  the existing `pms-data` / `pms-benchmark` / `pms-quartile` precedent of
  R2-blob-only storage.
- Advisory/Non-Discretionary service types (`serviceType` values other than
  `D`) — out of scope, matches the existing screener's current coverage.

## Architecture

### New data endpoints (three-layer cache: memory → R2 blob → live APMI fetch)

Follow the exact pattern already established by `app/api/pms-benchmark/
route.js` and `app/api/pms-quartile/route.js` — in-memory `Map`, R2 blob with
TTL, deduplicated in-flight promises, stale-on-error fallback.

**1. `app/api/pms-details/route.js`** — `GET ?iaid=N`

Scrapes `IaInsight.htm?IAID=N`'s static fields (see list above). Cache: 30
days memory / 90 days blob (`pms-details-cache/{iaid}.json`) — these fields
change rarely, same TTL class as `lib/apmiProviderMap.js`.

**2. `app/api/pms-period-history/route.js`** — `GET ?iaid=N`

Returns the full April-2023-to-latest monthly series for that IAID: an array
of `{ asOnMonth: 'YYYY-MM', ia: {month1, month3, ..., sinceInception},
benchmark: {...} }`.

- **First request for an IAID with no cached history:** walks
  `getPerformanceChart.htm` sequentially, one request per month from
  2023-04 to the current month (~40 requests at time of writing, growing by
  one per month), with a small delay between requests (e.g. 150-250ms) to
  stay a good citizen of APMI's servers. Stores the full array permanently
  in R2 (`pms-period-history-cache/{iaid}.json`, no TTL expiry — past
  months' data never changes).
  - At Vercel's 300s default Fluid Compute timeout, ~40 requests at
    ~300-500ms round-trip plus the inter-request delay comfortably fits in
    one invocation; no need for a multi-request resumable backfill in v1.
- **Subsequent requests:** read the cached array from R2. If its latest
  cached month is older than the current reporting month (APMI's own
  monthly release, same "reporting window" concept `pms-data` already
  models), fetch just the 1-2 new months and append — never re-fetch
  history that's already cached.
- A parser (`parseAsOnDateObjects(rawFragmentValue)`) for the Java-toString
  array format is a hard requirement here — write it as an isolated,
  exported function (mirroring `parseQuartileTable`'s precedent in
  `pms-quartile/route.js`) so it can be unit-verified against a saved
  fixture independent of the network call.

### Eager pre-warm for the strategies people actually see

**`scripts/backfill-pms-detail-pages.mjs`** (new script, `workflow_dispatch`
+ a monthly GitHub Actions schedule shortly after APMI's own monthly release
window — matches the timing model `bootstrap-nav-history.mjs` and the
existing `pms-data` "reporting window" already use):

1. Fetches the current leaderboard for all four strategies (reusing the
   existing `scrapeAPMI`-equivalent call shape from `pms-data/route.js`).
2. Filters to the **curated set**: strategies from providers NOT in the
   screener's existing small-AUM exclusion — port the exact rule from
   `app/pms-screener/page.jsx`'s `smallAumProviders` (₹50Cr threshold for
   Equity, ₹10Cr for Debt/Multi Asset/Hybrid, evaluated at the provider
   level: a provider is excluded only if *all* its strategies are below
   threshold). This is the same set the screener shows by default without
   the "All Funds" toggle — i.e., strategies real visitors can actually
   find.
3. For each curated strategy, hits both new endpoints (details +
   period-history) to warm/extend the R2 cache, rate-limited between
   requests.
4. Everything below the curated threshold is NOT pre-warmed — its page
   still works, it just backfills on that visitor's first real view
   (identical to how `pms-benchmark` already behaves today for every
   strategy). Given ~40 sequential requests, that first view is slower
   (several seconds) but functionally correct; a loading state on the
   history chart section handles this in the UI.

### Storage

R2 JSON blobs only — `pms-details-cache/{iaid}.json`,
`pms-period-history-cache/{iaid}.json` — no new Postgres table, no schema
migration. Consistent with every other PMS data endpoint in this codebase.

## Access gating (mirrors `app/api/fund-detail/[code]/route.js` exactly)

New route **`app/api/pms-detail/[id]/route.js`** computes `isPro` server-side
from the session (`role === 'admin' | plan === 'pro' | 'pro_lifetime' |
'lifetime' | isPro | getUserPlan(id) === 'pro'` — the identical boolean
already used in `fund-detail`), and returns a genuinely smaller payload to
non-Pro callers — not a client-side-hidden div. A non-Pro visitor's browser
never receives the gated fields, matching the security model already in
place for MF holdings/stress-test.

**Free tier (public, server-rendered, crawlable):**
- Hero: IA name, provider, strategy/service-type tags, benchmark name, AUM
- Key facts: inception date, age, min investment, category
- **Fee & Terms card**: fixed fees, variable fees (AMC/hurdle/performance
  breakdown), exit load, purpose — deliberately free. This is the literal
  gap Atin flagged ("we don't show fund charges"); gating it would defeat
  the point, and it's exactly the kind of specific, unique-per-page content
  ("[Strategy] PMS fee structure") that's worth ranking for.
- FAQ block (new `lib/pmsDetailFaq.js`, matching `lib/pmsFaq.js`'s existing
  convention of one source of truth feeding both the `FAQPage` JSON-LD and
  the rendered HTML accordion)

**Pro-gated (matches what's already gated on the MF page: returns
breakdown, NAV history chart, holdings):**
- Current period-wise performance bar (1M→SI vs benchmark)
- Historical monthly growth chart (the April-2023-onward backfill — also
  the most expensive part of the pipeline to produce, so gating it doubles
  as a rate-limiting incentive)
- Quartile ranking (reuses the already-built `/api/pms-quartile`)
- Portfolio turnover (1M/1Y)
- Fund manager details

Non-Pro response shape: `{ data: publicFields, performance: null,
history: null, quartile: null, turnover: null, fundManager: null,
isPro: false }` — same all-or-nothing shape `fund-detail` uses (no partial
"preview" tier, matching that page's precedent over the SIF page's
different partial-preview approach).

## Route, page & reused components

- **`app/pms/[id]/page.jsx`** + **`PMSDetailClient.jsx`** — structurally
  mirrors `app/fund/[code]/page.js` + `FundDetailClient.jsx`: a server
  component resolving metadata from the free-tier fields only (so
  `generateMetadata` never needs a session), `notFound()` for an unknown
  IAID, JSON-LD (`FinancialProduct` + `FAQPage`, same `@graph` shape as the
  MF page's `buildFaqJsonLd`).
- `[id]` = IAID (numeric), matching `/fund/[code]`'s numeric-code
  convention for consistency.
- **Historical growth chart:** reuse `app/screener/CompareGrowthChart.jsx`
  as-is — it already accepts exactly the shape needed
  (`Array<{name, color, data: Array<{t, v}>}>`). Reconstruct a "₹100
  invested" cumulative series from the monthly `MONTH1` returns:
  `v[0] = 100`, `v[i] = v[i-1] * (1 + MONTH1_i / 100)`, `t` = last day of
  each `AS_ON_DATE` month. No new charting code required.
- **Provider logo:** reuse the existing `getPMSLogo` helper already used in
  `pms-screener/page.jsx`.
- **Internal linking:** add a "Full Strategy Report →" button to the PMS
  Screener's drawer (`app/pms-screener/page.jsx`), matching the fund detail
  page's existing "Full Fund Report →" pattern in the MF screener drawer —
  this is what makes the new pages actually discoverable/crawlable rather
  than orphaned.

## SEO

- `generateMetadata` builds title (`"{IA Name} PMS by {Provider} — Fees,
  Returns & Quartile Ranking | Abundance"`) and description from the free
  fields (provider, strategy, category, AUM, fee summary, inception).
- JSON-LD: `FinancialProduct` (name, provider, category, description) +
  `FAQPage` (from `lib/pmsDetailFaq.js`), same `@graph` array shape as the
  MF page.
- New **`app/sitemap-pms.xml/route.js`**, mirroring `sitemap-funds.xml`'s
  structure but sourced from a live leaderboard fetch (no DB table exists
  for PMS) filtered to the same curated (non-small-AUM) set the backfill
  script uses — the long-tail strategies still resolve as real working
  pages via internal links, just aren't proactively pushed into the
  sitemap. Add to `app/robots.js`'s `sitemap` array and add `/api/pms-detail/`
  to its `allow` list, matching how `/api/fund-detail/` is already allowed.

## Mobile / responsive

New `app/pms/[id]/pms-detail.css`, porting `fund-detail.css`'s existing
breakpoint conventions (hero row collapses to column at ≤768px, stat grids
reflow to fewer columns) rather than inventing new ones.

## Testing / verification

This repo has no automated test suite for pages/pipelines like this — per
existing convention, verification is: `npm run build` after code changes, a
live spot-check of the new endpoints against real APMI data (as already done
during this design's research), and a manual check of both the free and
Pro-gated views (toggle a test account's plan) before shipping. The
Java-toString parser (`parseAsOnDateObjects`) should get a small standalone
verification against a saved fixture string, mirroring how
`parseQuartileTable` in `pms-quartile/route.js` is already structured for
exactly that kind of isolated check.

## Open risk

APMI's `getPerformanceChart.htm` and `IaInsight.htm` are undocumented,
scraped endpoints with no stability guarantee — same risk already accepted
for the three existing PMS endpoints this spec extends. If APMI changes its
markup or the Java-toString response format, the parser breaks loudly
(fail-fast, no silent empty-data fallback) rather than serving stale or
wrong figures.
