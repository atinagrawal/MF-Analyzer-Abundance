# Per-Index Detail Pages — Research Brief

**Status:** Research only. Do not write implementation code against this brief —
produce a findings document and a proposed design; a separate plan will follow
once the findings are reviewed.

**Owner of this brief:** Claude (Atin's other agent). Requested by Atin.
**Assigned to:** Gemini.

## 1. Objective

`/indices` (`app/indices/`) currently lists 284 market indices (149 NSE + 135
BSE — see `lib/indicesData.js`'s `getCombinedIndicesData()`) with returns,
valuation ratios, and risk metrics, but no per-index detail page. Atin wants
to explore a dedicated page per index (e.g. `/indices/nifty-50`) showing its
**constituents** (the stocks that make up the index, and their weights) plus
other index-level detail, both as a content/SEO play and as a possible
Pro-gated feature — following the same free-teaser/Pro-detail pattern already
used on `/pms/[id]` (returns/alpha gated, name/category/fees/holdings free)
and the `/amc/[slug]` and `/pms-provider/[slug]` directory-hub pages.

**The blocker is data, not the page template.** Nothing in the current schema
(`mf_screener`, `stock_eod`, `market_breadth`, `manual_holdings` — see the
"Database Tables" memory) holds index constituents or weights. This research
phase exists to answer whether that data is realistically obtainable, at what
cost/cadence, and with what legal standing — **before** anyone designs pages
or writes an ingestion pipeline.

## 2. Non-goals for this phase

- No new pages, routes, or DB tables yet.
- No scraping/ingestion code yet — a throwaway probe script to test a single
  endpoint is fine if that's the fastest way to answer a question below, but
  it's not deliverable code and should not be wired into the app.
- No UI/UX design yet.

## 3. Research questions

### A. NSE constituent data — availability & shape

NSE publishes per-index constituent CSVs on niftyindices.com under a
`ind_<indexcode>list.csv` pattern for many (not all) indices (e.g.
`ind_nifty50list.csv`). We already know two things about this domain from
today's `/indices` fix (`pages/api/index-dashboard.js`, `lib/riskometer.js`):
requests need a browser `User-Agent` header or the connection is refused
outright, and paths on this site have drifted before (the equity dashboard
PDF path changed from non-www/underscore to www/`%20`-encoded without
notice) — so treat any URL pattern found in blog posts or old scrapers as
unverified until curl'd live with a UA header.

Answer, with evidence (a live curl/fetch result per index, not a claim):
1. Which of the ~149 NSE indices currently in `INDEX_META` (see
   `pages/api/index-dashboard.js`) have a working constituent CSV/JSON
   endpoint? Get an exact count, not "most" or "some."
2. What fields does a constituent row actually contain? (Ticker/symbol,
   ISIN, company name, weight %, industry/sector, free-float factor —
   confirm which are present, not assumed.)
3. Do factor/strategy indices (Nifty Alpha 50, Nifty200 Momentum 30, etc.)
   publish constituents the same way as broad-market indices, or only
   broad-market and sectoral ones?

### B. BSE constituent data — availability & shape

We already have a working BSE integration (`lib/bseIndex.js`,
`pages/api/nifty-tri.js`) via `api.bseindia.com` for daily price history.

1. Does BSE expose an analogous constituent/weight endpoint for its indices
   (the 135 currently ingested via `getBseIndexData()` in
   `lib/indicesData.js`)? Same evidence bar as above — a live, working
   endpoint you've actually called, with a sample response shown.
2. If BSE's constituent data is harder to get than NSE's (plausible, given
   `nifty-tri.js`'s header comment about niftyindices.com's data endpoint
   now requiring a real login), say so plainly rather than working around
   it silently — that's exactly the kind of gap that got missed on the
   original `/indices` NSE PDF-URL bug.

### C. Legal / licensing

This team has already shipped and then had to remediate a copyright
exposure once this month: republishing Groww's narrative AMC descriptions
verbatim (see `lib/amcProfiles.js`'s exclusion of narrative fields, and
`lib/holdingsLookup.js` filtering Groww's `amcInfo` to factual fields only).
Apply the same scrutiny here before assuming index constituent lists are
free to republish:

1. Do NSE/NiftyIndices' and BSE's terms of use for their public index
   dashboards/constituent files say anything about redistribution,
   commercial use, or required attribution? Quote the actual clause you
   find, with a link — don't summarize from memory.
2. Is a raw constituent list (ticker + weight, i.e. factual data) different
   in copyright status from index *methodology* documents or narrative
   descriptions? State your understanding and flag it as your own
   interpretation, not legal advice — this should be confirmed with Atin
   before anything ships, same as the AMC narrative issue was.
3. Do NSE/BSE index names themselves carry trademark restrictions on
   commercial use (e.g. "NIFTY" is an NSE trademark) that would affect page
   titles, meta descriptions, or how prominently we can use the index name?

### D. Refresh cadence & pipeline fit

1. How often do NSE/BSE actually rebalance/republish constituent weights
   for a typical index (SEBI's periodic index-review cycle is quarterly for
   most equity indices — confirm this is still current, don't assume)?
2. Given that cadence, would a new pipeline fit the existing GitHub Actions
   pattern (see `.github/workflows/reverse-holdings-sync.yml` and
   `.github/workflows/bse-index-dashboard.yml` for the two closest existing
   analogs — a cron-scheduled sync script writing to Postgres, plus R2
   caching)? Sketch it, don't build it.

### E. Competitive / UX scan

Look at how Tickertape, Groww, Moneycontrol, and NSE's/BSE's own sites
present a single index's detail page today. Answer concretely:
1. What sections do they show beyond a constituent table (sector
   breakdown, top-10-by-weight, historical rebalance dates, factsheet PDF
   link, index methodology summary)?
2. What, if anything, do they put behind a paywall or signup? This
   directly informs what's realistic for our free/Pro split.

### F. SEO/GEO schema fit

`app/indices/layout.js` already ships `Dataset`, `FAQPage`, `ItemList`, and
`WebApplication` JSON-LD for the aggregate `/indices` page. For a per-index
page:
1. Is there a schema.org type search engines actually reward for a single
   financial index (there's no first-class "MarketIndex" type in
   schema.org — confirm what type competitors' index pages actually mark
   up, if any, rather than guessing)?
2. Would per-index pages be better served by `Dataset` (one per index) or
   by extending the existing aggregate `Dataset`/`ItemList` — pick one and
   justify it.

## 4. What to hand back

A written findings document (markdown, committed to
`docs/superpowers/specs/` or wherever this repo's convention for research
docs lives — check `docs/` first) covering sections A–F above, each answer
backed by a specific piece of evidence (a curl result, a quoted ToS clause,
a screenshot description of a competitor page) rather than a general
impression. End it with your own recommendation: is this worth building,
for how many indices realistically, and what should the free/Pro split be.

Do not proceed to a design or implementation plan after this — that's a
separate step Atin will review and greenlight explicitly, the same way the
`/indices` NSE-fix scope was agreed before code was written.
