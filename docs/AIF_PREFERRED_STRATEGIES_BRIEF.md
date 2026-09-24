# AIF Preferred Strategies — Research & Build Brief

**For:** Gemini. **Status:** Approved to proceed — key architecture decisions
below were made by Atin directly (not left open), but there is a **required
research step before any code is written** (Section 2) — the pattern of
guessing a data-source URL or assuming a schema and finding out later it was
wrong has cost real bugs multiple times this session (the NSE PDF URL, the
"S&P BSE SENSEX" schema link, the Nifty Smallcap 50 row corruption). Don't
repeat that here with AIF managers' factsheet sources.

## 1. Decisions already made — don't re-ask these

1. **New, separate page family**: `/aif-preferred`, not a tab inside
   `/pms-preferred`. AIFs (SEBI AIF Regulations, 2012) and PMS are legally
   distinct regulated categories with different eligibility/minimum-
   investment rules — keep them structurally separate, but **reuse
   `/pms-preferred`'s proven architecture** under the hood (quick-info
   drawer, compare tool, directory-card grid, `isPaidUser` gating from
   `lib/permissions.js`).
2. **Curated, not comprehensive**: a small, hand-picked "strategies we
   recommend" list, the same editorial model as `/pms-preferred` (~35
   strategies) — not an attempt at the full AIF universe.
3. **Fully public**: performance data, comparisons, and detail pages are
   public and SEO-visible, same openness level as `/pms-preferred` — no
   eligibility gate on the content itself. (Standard regulatory disclosures
   — ARN-251838 / APRN04279, the disclaimer language already used
   everywhere on this site — still apply; see Section 2.2 for the
   AIF-specific disclosure requirement to add on top of that.)
4. **Automated sync pipeline from day one**, modeled on
   `scripts/sync_pms_factsheets.js` — not a one-off manual data entry.
   Atin will provide factsheets for a handful of AIFs to start; those
   become the seed/bootstrap set. Section 2.1 below is how you determine
   which AIF managers can actually be added to an automated pipeline
   (same "verified live, not assumed" standard `sync_pms_factsheets.js`
   already follows for PMS providers like Abakkus).

## 2. Required research before writing any code

### 2.1 Per-AIF-manager factsheet source feasibility

For each AIF strategy Atin provides a factsheet for, and for any additional
well-known AIF managers you identify as candidates for the curated list:

- Find whether that manager publishes factsheets at a **stable, fetchable
  URL** (same pattern `sync_pms_factsheets.js` already verified for PMS
  providers — e.g. Abakkus's fixed S3 URLs with no date in the filename).
  Live-test every URL with `curl` before writing it into any script —
  don't infer a pattern from one example and assume it holds for others.
- Note which managers do **not** have a stable public URL (common for
  AIF — many managers only send factsheets to investors/distributors
  directly, not publish them). For those, the ingestion path is: Atin
  supplies the PDF manually (as he's already doing for the seed set), you
  extract structured data from it the same way `sync_pms_factsheets.js`'s
  Gemini-extraction step does for PMS factsheets, store the result, and
  document that this manager needs manual factsheet updates rather than
  automated sync — don't force a scraping approach where none exists.
- **Category-specific data shape**: AIFs report differently than PMS.
  Category I/II AIFs (venture, private equity, private credit) are
  typically closed-ended, illiquid, and report IRR / TVPI / DPI rather
  than a rolling CAGR; Category III AIFs (long-short, hedge-style) are
  closer to PMS in reporting NAV-based returns and drawdown. Don't assume
  every AIF in the curated list can be forced into the same "quarterly
  return %" shape `/pms-preferred` uses — check each factsheet's actual
  reported metrics first and let the data model accommodate both shapes
  (e.g. an AIF card/detail page shows IRR + fund life-stage for a PE fund,
  and NAV-based returns for a Cat III fund, not a forced-fit single metric
  set).

### 2.2 SEBI AIF advertisement disclosure requirements

SEBI issued a specific circular (2022) governing what AIF advertisements
must and must not contain — this is stricter and more specific than the
general mutual-fund-style disclaimer already used across this site. Find
the actual current circular text (SEBI's own site, not a summary
blog post — same "verified live, not paraphrased" standard as everything
else), and identify the specific mandatory disclosure elements (standard
risk-factor language, warnings about illiquidity/lock-in, any prohibited
claims) that need to appear on `/aif-preferred` and its detail pages.
Quote what you find precisely — if you can't verify the exact clause,
say so explicitly rather than presenting a paraphrase as the real text
(a research doc earlier this session did that with NSE's ToS and it had
to be corrected).

## 3. Architecture — ground it in what's already proven

- **Data storage**: follow `/pms-preferred`'s pattern
  (`lib/pmsDetailsCache.js` — R2-blob-first, keyed by an identifier, no
  dedicated Postgres table) rather than the Postgres-table pattern used
  by `index_constituents`/`mf_screener`. This is the closer architectural
  sibling per Section 1.1 — stay consistent with it unless your research
  in 2.1 surfaces a concrete reason not to (e.g. if the curated AIF set
  needs relational queries the PMS pattern doesn't support — justify the
  deviation if you make one, don't default to a different pattern
  silently).
- **Page structure**: `app/aif-preferred/page.jsx` (hub) with the same
  card-grid + drawer interaction model as
  `app/pms-preferred/PmsPreferredInteractive.jsx`, and (if Section 2.1's
  research shows enough per-AIF detail data to justify it) individual
  detail pages under `app/aif-preferred/[slug]`, following the
  `app/pms/[id]` precedent for structure.
- **Gating**: reuse `isPaidUser` from `lib/permissions.js` directly (not
  an inlined copy — that exact mistake was already made and fixed once
  this session on the `/indices` pages) for whatever, if anything, ends
  up Pro-gated. Given "fully public" was the decision in Section 1.3,
  the baseline expectation is nothing is gated — only gate something if
  there's a clear reason (e.g. CSV export, matching how `/pms-preferred`
  gates period-return history/alpha but keeps name/category/fees public).
- **Compare tool**: `/pms-preferred` already has a working side-by-side
  compare feature (`app/pms-preferred/PmsPreferredCompare.jsx`) — reuse
  that pattern for AIFs if the data shape allows a meaningful comparison
  (see the IRR-vs-NAV-return caveat in 2.1 — comparing a Cat I PE fund
  against a Cat III long-short fund side by side may not be meaningful;
  use judgment here and explain your reasoning in the design doc rather
  than silently forcing a comparison that doesn't make sense).

## 4. Design and SEO/GEO — yours to own

Atin has asked you to take full ownership of visual design and SEO/GEO
for this feature (unlike the index-constituent-pages work, where Claude
scoped SEO structure directly). Concretely:

- Visual design: your call, but stay consistent with this site's existing
  design system (Forest green palette, Raleway + JetBrains Mono, the
  card/drawer patterns already established in `/pms-preferred`) rather
  than introducing a new visual language for one page family.
- SEO/GEO: follow the patterns already proven on this site — JSON-LD
  (`FinancialProduct`/`Organization`/`FAQPage`/`BreadcrumbList` as
  appropriate — `/pms-preferred` and `/indices` are both real, working
  references), markdown content-negotiation via `?format=md` /
  `Accept: text/markdown` (see `middleware.js`'s existing `/indices`
  and `/amc` entries for the pattern), sitemap + robots.js registration
  **in the same commit as the pages ship**, not backfilled later (this
  exact mistake — shipping routes unregistered — has already happened
  twice this session).

## 5. What happens next

1. You do the Section 2 research and report back findings (same format as
   the index-constituents research: evidence per claim, not summary).
2. Atin sends over the seed factsheets for the initial curated AIFs.
3. You produce a design doc + implementation plan
   (`docs/superpowers/specs/` / `docs/superpowers/plans/`), same as the
   index-constituent-pages Phase 1 process.
4. Claude reviews the plan, then independently verifies every claim in
   your build report the same way as the rest of this session — live
   curl checks, direct DB/blob queries, build verification, and a
   post-deploy production check. Nothing ships as "done" on the strength
   of a summary alone.
