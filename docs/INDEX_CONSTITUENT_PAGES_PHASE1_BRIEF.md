# Per-Index Detail Pages — Phase 1 Design & Implementation Brief

**Status:** Greenlit. Produce a technical design + implementation plan, then
build Phase 1. This is the follow-up to
`docs/INDEX_CONSTITUENT_PAGES_RESEARCH_BRIEF.md` and
`docs/superpowers/specs/2026-09-22-index-constituent-pages-research-findings.md`
— read both; this brief doesn't repeat their content.

## 1. Decision on the legal question

Reviewed the findings doc's Section C. Two notes before you proceed, then a
decision:

- The data-availability findings (A, B) were independently verified live
  (NSE CSV pattern + header schema, BSE `bseindices.com` API + response
  shape, including the claimed-missing Nifty500 Shariah 404) and hold up —
  good research, build on it directly.
- The specific sentences quoted in Section C don't match verbatim text found
  on NSE's actual `/terms-of-use` and `/disclaimer` pages (the substance —
  "no reproduction without written permission," licensing required for
  index-linked products — is real, just not verbatim as quoted; BSE's ToS
  couldn't be checked at all, `bseindices.com` serves a client-rendered
  shell to a plain fetch). Flagging this so it's not repeated: don't present
  synthesized text in quotation marks as a direct source quote in future
  research docs — say "paraphrased from X" when that's what it is.

**Decision (Atin's call, not a legal opinion):** NSE and BSE are stock
exchanges with a regulatory transparency function; index composition is
public, non-proprietary factual data, not a licensed commercial data feed.
Proceed on that basis — no further legal gate before building. Still apply
the standard hygiene this site already uses elsewhere (attribution line,
"Source: NSE Indices Limited / BSE Ltd." + as-of date on every constituent
table, no republishing of methodology whitepapers or narrative text,
nominative-only use of "NIFTY"/"SENSEX" trademarks) — that's good practice
regardless of the legal risk question, and matches how `/indices` already
attributes NSE/BSE today.

## 2. Phase 1 scope — reconcile the count first

The findings doc's Phase 1 lists "20 Broad Market NSE + 36 Strategy/Factor
NSE + core BSE benchmarks (SENSEX, BSE 500)" and separately labels it
"56 High-Intent Pages" — 20+36 is already 56 before adding the BSE
benchmarks, so the count and the list don't reconcile. Before writing the
design doc, publish the exact Phase 1 index list (name + slug + NSE or BSE)
as a table, get the count right, and use that table as the actual scope —
not a rounded number.

## 3. What the design + implementation plan needs to cover

Standard `superpowers:writing-plans` structure applies (this repo already
uses it — see `docs/superpowers/plans/`). Specific things this plan must
address, grounded in existing code:

**Data pipeline**
- New Postgres table (e.g. `index_constituents`: index_slug, symbol, isin,
  company_name, industry, exchange, as_of_date) — follow the existing
  migration pattern in `scripts/schema.sql`.
- Sync script + GitHub Actions workflow on the bi-weekly cadence the
  findings doc proposed, modeled on
  `.github/workflows/reverse-holdings-sync.yml` (cron shape) and
  `.github/workflows/bse-index-dashboard.yml` (the NSE+BSE dual-source
  fetch pattern already used for `/indices`). R2 cache key convention:
  follow `lib/indicesData.js`'s existing `idx-dashboard2-*` naming style.
- Apply the same defensive pattern just fixed on `/indices` this session
  (commit `3e246be`): don't let one source's fetch failure silently drop
  data or leave a stale/empty page — surface it. And don't hardcode a URL
  pattern without a live-verified fallback check — this exact codebase has
  now hit silent URL drift twice (the NSE Index Dashboard PDF path, and the
  original nifty-tri.js NSE session-cookie breakage).

**Pages**
- Route: `/indices/[slug]` (slug scheme should match the kebab-case
  convention `toFundSlug`-style helpers already use elsewhere, e.g.
  `lib/compareSlug.js`). Reuse the existing hub+detail structure from
  `app/amc/[slug]` / `app/pms-provider/[slug]` rather than inventing a new
  page shape.
- Link every row in `/indices`' main table (`app/indices/IndicesClient.jsx`)
  to its detail page.
- Cross-links: each constituent stock row should deep-link to
  `/stocks-in-funds?stock=...` (the reverse holdings engine) as the
  findings doc proposed — that's the genuine differentiator, not the
  static list by itself.

**Free/Pro split**
- Use the split the findings doc proposed (full constituent table + trailing
  valuation + top-10 weights + TRI CAGRs + deep links free; CSV export +
  overlap analyser + rebalance-history audit Pro). Gate it with the site's
  existing `isProUser` check pattern (see `app/pms/[id]` and
  `app/indices/IndicesClient.jsx`'s own `isProUser` block) — don't invent a
  new gating mechanism.

**SEO/GEO**
- Per-index `Dataset` + `FinancialProduct` + `FAQPage` JSON-LD, following
  the structure already shipped in `app/indices/layout.js` for the
  aggregate page. Extend `app/robots.js` and the sitemap
  (`app/sitemap-*.xml` pattern) to include the new routes — this site has
  twice shipped a new route family without registering it in
  robots/sitemap first (`5aa3bfc` had to backfill AMC/PMS-provider/
  stocks-in-funds hubs after the fact) — don't repeat that, register routes
  in the same commit that ships the pages.
- Markdown content-negotiation (`?format=md`) for each detail page,
  matching the pattern just added to `/indices` in `77aea7d`/middleware.js.

## 4. What comes back for review

A design doc (`docs/superpowers/specs/`) and implementation plan
(`docs/superpowers/plans/`), per this repo's existing skill convention —
same review gate as every other piece of work this session: I'll verify the
plan and, once it's built, verify the implementation against live
endpoints and a production check before it's considered done.
