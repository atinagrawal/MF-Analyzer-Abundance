# Portfolio Creator Design

## Goal

A premium tool where a user selects one or more mutual funds (from their CAS Tracker holdings and/or a manual search) and gets a full portfolio analysis — combined asset/sector/stock exposure, fund-overlap detection, scheme details, M-Cap allocation, and benchmark comparison — matching the depth of a real advisor-prepared MF investment proposal. The same analysis can be exported as a branded PDF proposal, saved to the user's account for later re-download.

## Data source and naming policy

Per-fund holdings, AUM, expense ratio, category, and risk rating come from an external mutual-fund data platform's undocumented scheme-detail API (already used elsewhere this session for exit-load data; same endpoint family). This is an internal engineering detail only.

**Global constraint, binding on every task in the eventual plan:** no user-facing text, UI copy, PDF content, footnote, or "data as of / source: X" label anywhere in the product may name this data source. Internal code, comments, env var names, and this spec may reference it plainly (engineers need the real endpoint to build against it) — the restriction is scoped to anything a user or the PDF recipient would see.

### Holdings data shape (verified live)

The detail endpoint returns `holdings` as an array of positional arrays, not labeled objects:

```
[scheme_code, as_of_date, security_name, asset_class, sector, instrument_type, null, market_value_cr, weightage_pct, null, null, stock_slug]
```

- `asset_class` is one of `EQUITY` / `DEBT` / `CASH` / `REALEST` / `MF` (fund-of-funds underlying).
- `weightage_pct` can be negative (short futures positions in some funds). For every calculation in this spec (asset allocation, sector/stock exposure, overlap, M-Cap allocation), negative weights are clamped to 0 before aggregating — a short hedge isn't a "holding" in the sense these sections measure, and letting a negative value flow into a `min()` overlap sum or a percentage total would produce a nonsensical negative contribution.
- **No ISIN is present per holding.** Only a free-text `security_name` and a `stock_slug`. This matters for the M-Cap Allocation section (below).
- Scheme-level fields used elsewhere in this spec: `aum`, `expense_ratio`, `category`, `sub_category`, `risk` (a string like `"Very High"`, usable directly as a risk rating — no need to source BSE's riskometer separately), `return_stats[0]` (per-fund trailing returns, not used here since this spec's benchmark section uses this site's own rolling-returns/index infrastructure instead — the API's own `index_return1y/3y/5y` fields are confirmed null across every fund checked this session, so they aren't a usable benchmark source).
- **`launch_date` is excluded from this design entirely.** Verified live: HDFC Flexi Cap Fund (real inception 1995) returns `launch_date: "01-Jan-2013"` — exactly the date SEBI mandated direct plans, not the fund's actual birth date. Any fund older than 2013 would show a fabricated-looking date, so the Scheme Details section never surfaces an inception date.

## Fund picker (Section 1)

Two ways to add funds to the analysis, both feeding the same in-memory list of selected schemes:

1. **From CAS Tracker** — reuse the already-parsed holdings from `app/cas-tracker/page.js` (each holding has `scheme.amfi`, `isin`, `name`). Present as a checklist the user can multi-select from, deduped by AMFI code across all their PANs.
2. **Manual search** — a debounced live fund search, following the same UX pattern as `app/backtest/page.js`'s existing `Picker` component (reused directly, not rebuilt — it already does debounced search against `/api/mf?q=`, filters out Direct-only noise, ranks Growth plans).

**Works with as few as 1 fund.** Every section below renders for N≥1 except Portfolio Overlap (Section 5), which requires N≥2 and otherwise shows a hint: "Add another fund to see overlap analysis."

## Sections 2–4: Combined exposure (asset allocation, sector, stock)

For each selected fund, fetch its `holdings` array (cached per fund — holdings don't change intraday, a daily cache is sufficient, following this site's existing 3-layer cache pattern: in-memory → Blob → live fetch). Combine across funds using **portfolio-weighted aggregation**: each fund contributes `(fund's allocation % of the total proposed portfolio) × (holding's weightage_pct within that fund)`.

The "fund's allocation % of the total portfolio" comes from an allocation input next to each selected fund (defaults to equal-weight across N funds, user-editable, must sum to 100%).

- **Section 2 — Asset Allocation**: sum weightage by `asset_class` (Equity / Debt / Cash / Other, collapsing `REALEST`/`MF` into Other) across all funds, portfolio-weighted.
- **Section 3 — Sector Exposure**: sum weightage by `sector` field (equity holdings only, matching the reference proposal's convention), top 10 + "Other" bucket.
- **Section 4 — Stock Exposure**: sum weightage by `security_name`, top 10 + "Other" bucket, plus a separate "Debt & Other Securities" bucket for non-equity weight (matching the reference proposal's exact layout).

## Section 5: Portfolio Overlap (N≥2 only)

Pairwise fund-to-fund overlap score, equity-only (matching the reference proposal's explicit "Overlapping of Equity Stocks only" convention): for each pair of funds, sum `min(weight_in_fund_A, weight_in_fund_B)` across every stock held by both (matched by `security_name`, normalized — lowercase, strip "Ltd"/"Limited"/punctuation). Rendered as an N×N grid, diagonal = 100.

Non-equity holdings (debt, cash) are excluded from the overlap calculation entirely, not just zeroed — matching the reference document's methodology.

## Section 6: Scheme Details table

Per fund: AUM (`aum`), expense ratio (`expense_ratio`), risk rating (`risk`), number of equity holdings (count of `holdings` where `asset_class === 'EQUITY'`), category/sub-category. **No inception/launch date** (see Data source section above).

## Section 7: Scheme M-Cap Allocation

Per fund, and a portfolio-weighted average row: % of equity holdings classified Large / Mid / Small Cap.

**Data source**: AMFI's official semi-annual stock categorization, published at `https://www.amfiindia.com/otherdata/categorisation-of-stocks` (verified live — a stable download link pattern `https://portal.amfiindia.com/spages/AverageMarketCapitalization<DDMon>2026.xlsx`, refreshed every Jun 30 / Dec 31). Verified structure: `Sr. No., Company name, ISIN, BSE Symbol, <mkt cap columns>, Categorization as per SEBI Circular dated Oct 6, 2017` (values: `Large Cap` / `Mid Cap` / `Small Cap`), ~5,400 rows.

**The join is by name, not ISIN** — AMFI's list is ISIN-keyed, but each fund's holdings only carry `security_name` (see Data source section above; no ISIN in the holdings array). Match by normalizing both sides' company names (lowercase, strip `Ltd`/`Limited`/`.`/extra whitespace) before comparing. Any holding whose name doesn't match anything in AMFI's list — a genuine miss, not a wrong classification — is bucketed as "Unclassified" rather than silently dropped or guessed at, and its weight is excluded from the Large/Mid/Small percentages' denominator (so "Unclassified" is shown as its own explicit line, not hidden).

A small sync script, `scripts/sync-amfi-categorization.mjs`, downloads the current AMFI xlsx (already-installed `xlsx` package parses it — see Task-level detail in the implementation plan) and stores the normalized-name → category mapping as a small JSON lookup, checked into the repo like other periodic data snapshots on this site. Run manually, twice a year, whenever AMFI republishes (30 Jun / 31 Dec) — no cron needed given how infrequently the source data changes.

## Section 8: Fund vs. Benchmark Performance

Best-effort comparison using this site's own existing `/api/nifty-tri`-family infrastructure (BSE-sourced price index, not a true TRI — same caveat this site already carries elsewhere) matched against each fund's declared benchmark name. Where no confident match exists, the section simply omits that fund's benchmark line rather than guessing.

## PDF Proposal export

**Mirrors the on-screen sections exactly** — same 8 sections, same numbers, generated from the same computed data (not a separately-maintained layout). Branded with this site's existing forest-green identity (`--g1: #1b5e20` / `--g2: #2e7d32` palette, Raleway/JetBrains Mono), and the same ARN/APRN/GST disclosure line already used in `components/Footer.jsx`.

**Generation**: server-side, via a new dependency `@react-pdf/renderer` — pure-JS PDF generation with no headless-browser dependency, which matters given this site runs on Vercel Hobby's serverless limits (the codebase's only existing "export to PDF" precedent, `app/backtest/page.js`'s `doExport`, uses a client-side print-window popup, which cannot produce a byte stream to persist server-side — not reusable here).

**Storage and account integration**: generated PDF is uploaded to Vercel Blob (same pattern as this site's existing Blob-backed caches), and a row is written to a new `portfolio_proposals` table:

```sql
CREATE TABLE portfolio_proposals (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,               -- user-editable label, e.g. "Retirement portfolio v2"
  fund_codes JSONB NOT NULL,        -- the selected funds + their allocation %s, so it can be re-viewed/regenerated
  blob_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Proposals list on a "My Proposals" panel (within the Portfolio Creator page), newest first, each row linking to its stored PDF and offering a "regenerate" action (re-runs the same fund list through current data, producing a fresh PDF+row rather than mutating the old one — proposals are immutable snapshots).

## Premium gating

Reuses the existing `session.user.plan` → `isPro` → `ProGate` pattern from commit `3878c5c` (inline Razorpay checkout, ₹499/yr + 18% GST, no redirect). The entire Portfolio Creator page sits behind `ProGate`; signed-out users see the existing `BreadthGate`-style sign-in prompt first.

## Explicitly out of scope for this spec

- **Backtest-page overlap reuse**: deferred as a follow-up. `app/backtest/page.js` has zero holdings/sector data today; once this spec's overlap-computation logic exists as a shared module, surfacing it as an additional panel in backtest's `Results` view is a small, separate follow-on spec — not built here.
- **The `scripts/portfolio_aggregator/` AMC-disclosure pipeline** is not used as a data source for this feature (the external API is faster and already covers effectively all AMCs; the pipeline's per-AMC scrapers need independent, unrelated maintenance work). The weightage-parsing bugs found and fixed in that pipeline this session stand on their own merits and aren't part of this spec's scope.

## Testing

- `npm run build`.
- Unit-level: the overlap min-weight-sum calculation and the name-normalization matcher (both AMFI join and cross-fund stock matching) are pure functions — straightforward to test with a few hand-built fixture fund holdings.
- Manual verification checklist for the user (browser automation isn't available in this environment): select 1 fund, confirm 7 sections render and overlap shows the "add another fund" hint; add a 2nd fund, confirm overlap renders and all percentages re-weight correctly; adjust the allocation % slider between funds and confirm combined sections recompute; generate a PDF proposal and confirm it matches the on-screen sections and carries no reference to the underlying data source anywhere; check "My Proposals" lists it and the stored PDF re-downloads correctly; confirm the whole page is gated behind Pro (test as a free-plan user, confirm `ProGate` appears).
