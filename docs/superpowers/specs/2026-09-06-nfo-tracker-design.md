# NFO Tracker — Design Spec

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement the plan derived from this spec.

**Goal:** Add an "Open Now" New Fund Offer (NFO) tracker — one listing page plus per-scheme detail pages — covering both regular Mutual Funds and SIFs, sourced entirely from AMFI's own public JSON API, with zero new Postgres load.

**Why now:** Discovered live during this session that AMFI publishes a first-party, unauthenticated JSON feed of currently-open NFOs (both MF and SIF) that nothing on this site currently surfaces. A competitor (sif360.com) has a similar tracker for SIFs only; this spec covers both fund types and is sourced directly from the regulator's own feed rather than a third party's proxy of it.

## Context carried into this spec (verified live this session, not guessed)

- `GET https://www.amfiindia.com/api/new-fund-offer` — no params — returns every currently-open **MF** NFO, grouped by AMC: `[{MutualFund, items: [{Scheme_Id, MutualFund, SchemeName, MF_Id}]}]`.
- `GET https://www.amfiindia.com/api/sif-nfo` — same shape for **SIF** NFOs. Confirmed live-empty at investigation time (zero SIF NFOs open that day) — the sync and UI must treat an empty type as a normal state, not an error.
- `GET https://www.amfiindia.com/api/new-fund-offer?Scheme_Id=X` and `.../api/sif-nfo?Scheme_Id=X` — detail lookup. Verified real shape:
  ```json
  {
    "NewFundOffer": [{
      "MutualFund": "Bank of India Mutual Fund",
      "items": [{
        "Scheme_Id": "14562",
        "MF_Id": "46",
        "MutualFund": "Bank of India Mutual Fund",
        "SchemeName": "BANK OF INDIA VALUE FUND",
        "SchemeType": "Open Ended",
        "SchemeCategory": "Equity Schemes - Value Fund",
        "ObjectiveofScheme": "The investment objective ...",
        "NewFundLaunchDate": "2026-08-28T00:00:00.000Z",
        "NewFundEarliestClosureDate": "2026-09-11T00:00:00.000Z",
        "NewFundOfferClosureDate": "2026-09-11T00:00:00.000Z",
        "IndicateLoadSeparately": "",
        "OfferPriceRs": "10",
        "MinimumSubscriptionAmount": "5000",
        "ForFurtherDetailsPleaseVisitWebsite": "https://www.boimf.in",
        "infoDocumentUrl": "https://portal.amfiindia.com/spages/14562.pdf"
      }]
    }],
    "type": "detailed"
  }
  ```
  No auth, no referer header required (verified via plain `curl` with only a `User-Agent`).
- **Unverified assumption, flagged honestly:** the SIF detail endpoint's field shape (`/api/sif-nfo?Scheme_Id=X`) was never directly observed — the SIF summary list was empty at investigation time, so there was nothing to detail-fetch. The spec assumes it mirrors the MF detail shape exactly (same underlying JS bundle pattern calls both the same way), but this is an inference, not a verified fact. **Task 1 must confirm this against a real SIF NFO the first time one is open** (or, if none is open during implementation, the sync script's SIF-parsing path must be defensive — same field-presence checks as the MF path, never assume a field exists — and this line item stays open until a real SIF NFO is observed end-to-end).
- **Hard limitation, accepted as out of scope for this spec:** this feed only lists NFOs that have *already opened*. There is no official source for "coming soon / pre-launch" funds — that tier would require hand-curated editorial content and is explicitly deferred to a future spec if ever wanted.
- **Incident-driven constraint (binding on this spec):** two recent production outages both traced to a personalized route querying Postgres under real concurrent load (subsequently reverted both times). This feature is public, non-personalized, small reference data — it MUST NOT add any new Postgres query path. It follows the R2-JSON-cache pattern already proven safe by `amfi-aum.json` / `sif-aum.json`, not the Postgres pool.

### Existing patterns this spec reuses (repo-verified, read in full before writing tasks)

- `scripts/sync_amfi_aum.js` + `scripts/lib/r2SyncSafety.js` (`backupThenPut`, `smoketestKey`) — the scheduled-sync-to-R2 pattern, including the "refuse to overwrite good data with a suspiciously smaller result" partial-failure guard and the automatic `${key}.backup` rollback copy. The NFO sync copies this shape exactly, with one deliberate difference: an NFO list legitimately shrinking to zero (all NFOs closed) is valid, not a failure — see Task-level guard rule below.
- `.github/workflows/amfi-aum-sync.yml` — cron + `workflow_dispatch`, `node-version: 24`, `npm install aws4fetch --no-save`, R2 secrets via env. The NFO workflow is a near-identical copy with a daily cron instead of monthly.
- `lib/r2JsonCache.js`'s `createR2JsonCache(key, ttlMs)` — in-memory-cached getter over one R2 JSON blob, serves last-known-good on a transient R2 read failure rather than throwing. Used as-is for the NFO reader.
- `app/api/screener/route.js`'s `export const revalidate = 21600` — proven route-level caching for public, non-personalized data, avoiding Postgres entirely for a GET route. The NFO API route uses the same mechanism at a shorter interval (see below).
- `app/sif/[id]/page.js` — the exact `generateMetadata` + JSON-LD shape to mirror for the NFO detail page: `@graph` of `FinancialProduct` + `FAQPage`, canonical URL, OG image URL pattern, `dynamic = 'force-dynamic'`, `notFound()`-equivalent handling for an unresolvable slug.
- `app/sitemap-funds.xml/route.js` + `app/robots.js` — dedicated-sitemap-per-content-type pattern (XML string template, `revalidate`, `Cache-Control` header) and the `sitemap` array in `robots.js` that lists every sitemap. Add `sitemap-nfo.xml` the same way.
- `components/Navbar.jsx` — nav is a config array of grouped dropdown sections (`Screeners`, `Market Data`, `Tools`), e.g. line 40-48's `market` group (`market-watch`, `breadth`, `indices`, `industry`, `report`, `geography`). The NFO link is a new entry in this `market` group, immediately after `industry` (`📈 Industry Pulse`) since both are "what's moving right now" content.
- Design system: Forest green palette, Raleway + JetBrains Mono, 1100px container — reused as-is. No new visual identity.
- `app/book-consultation/page.jsx` — existing internal route for the "Talk to an Advisor" CTA (already fixed elsewhere this session to be linked internally rather than to the external getabundance.in site).

## Scope

**In scope (this spec):**
- Daily sync of AMFI's open-NFO feed (MF + SIF) into one R2 JSON blob.
- `/nfo` — listing page: tabs (All / Mutual Fund / SIF), card grid, honest empty states.
- `/nfo/[slug]` — per-scheme detail page with full SEO treatment.
- `app/sitemap-nfo.xml` + `robots.js` update.
- One `Navbar.jsx` entry.

**Explicitly out of scope (do not build):**
- "Upcoming / pre-launch" NFO tier (no official data source).
- Email capture / "notify me" lead-gen flow.
- Any new Postgres table, query, or migration.
- Auto-linking an NFO to an existing `/fund/[code]` or `/sif/[id]` page beyond a simple best-effort name match (see Task 4) — never a fabricated link.

## Data model

### Normalized shape (what the sync script writes to R2, one JSON document)

```json
{
  "syncedAt": "2026-09-06T04:00:00.000Z",
  "mf": [
    {
      "type": "mf",
      "schemeId": "14562",
      "mfId": "46",
      "amcName": "Bank of India Mutual Fund",
      "schemeName": "Bank Of India Value Fund",
      "slug": "bank-of-india-value-fund",
      "schemeType": "Open Ended",
      "category": "Equity Schemes - Value Fund",
      "objective": "The investment objective of the scheme is to generate long-term capital appreciation ...",
      "openDate": "2026-08-28",
      "closeDate": "2026-09-11",
      "offerPrice": 10,
      "minInvestment": 5000,
      "amcWebsite": "https://www.boimf.in",
      "infoDocumentUrl": "https://portal.amfiindia.com/spages/14562.pdf",
      "status": "open"
    }
  ],
  "sif": [ /* same shape, type: "sif" */ ]
}
```

Field mapping from AMFI's raw response, applied identically for both the `mf` and `sif` arrays:

| Normalized field | Source field |
|---|---|
| `schemeId` | `Scheme_Id` (kept as string — matches how `sd_id`/scheme ids are handled elsewhere in this repo, e.g. `sif-history`) |
| `mfId` | `MF_Id` |
| `amcName` | `MutualFund` |
| `schemeName` | `SchemeName`, converted from the feed's raw ALL-CAPS/mixed casing to title case (see Task 1 for the exact function — a small, testable pure function, not a guess) |
| `slug` | kebab-case of the title-cased `schemeName` (see Task 1) |
| `schemeType` | `SchemeType` |
| `category` | `SchemeCategory` |
| `objective` | `ObjectiveofScheme`, trimmed |
| `openDate` | `NewFundLaunchDate`, formatted `YYYY-MM-DD` |
| `closeDate` | `NewFundOfferClosureDate` (fall back to `NewFundEarliestClosureDate` only if the closure date is missing — never fabricate a date) |
| `offerPrice` | `OfferPriceRs`, parsed as a number |
| `minInvestment` | `MinimumSubscriptionAmount`, parsed as a number |
| `amcWebsite` | `ForFurtherDetailsPleaseVisitWebsite` |
| `infoDocumentUrl` | `infoDocumentUrl` |
| `status` | computed: `"open"` if today ≤ `closeDate`, else `"closed"` |

### Archival rule (avoids link rot / silent 404s)

The sync script never simply drops an entry the moment it disappears from AMFI's "open" feed. On each run:
1. Fetch the current open list from AMFI (source of truth for anything with `status: "open"`).
2. Load the *previous* R2 document.
3. Any entry present in the previous document but absent from the new open list, whose `closeDate` is within the last 30 days, is carried forward into the new document with `status: "closed"`.
4. Anything closed for more than 30 days is dropped entirely.

This means a detail page never 404s the instant an NFO closes — it flips to a "this NFO has closed" state for 30 days, then the URL naturally stops being generated in the sitemap and the page returns `notFound()`. No manual cleanup step, no orphaned links.

### Partial-failure guard (mirrors `sync_amfi_aum.js`, deliberately adjusted)

The AUM script's guard ("new count < 50% of old count ⇒ refuse to overwrite") does not directly apply here — an NFO list legitimately going from N to 0 is a valid, expected outcome (all NFOs closed with nothing new open), not a sign of a broken fetch. The correct guard for this script is at the HTTP-response level, not the count level: **if either AMFI endpoint returns a non-200 or unparsable body, abort the whole run and preserve the existing R2 document untouched** (reusing `backupThenPut`'s existing-value passthrough). A successful 200 with an empty `NewFundOffer: []` array is written through normally — that is real data, not a failure.

## Serving layer

- **`lib/nfoData.js`** (new) — exports:
  - `getNfoData()` — wraps `createR2JsonCache('amfi-nfo.json', 60 * 60 * 1000)` (1h in-memory TTL layered under the underlying R2 read, same as every other `createR2JsonCache` use in this repo).
  - `getNfoBySlug(slug)` — calls `getNfoData()`, searches `mf` then `sif` arrays for a matching `slug`, returns the entry or `null`. Never throws on a miss.
- **`app/api/nfo/route.js`** (new) — `export const revalidate = 3600;` public `GET`, returns the full normalized document as-is (`{syncedAt, mf, sif}`). No auth, no Postgres, no personalization — matches `/api/screener`'s proven shape. Used by the listing page's client-side tab filter so switching tabs doesn't require a full page reload; the initial server-rendered page still gets its data directly from `getNfoData()` (no self-fetch over HTTP from the server component).

## Pages

### `/nfo` — listing page (`app/nfo/page.jsx`, server component + small client filter island)

- Server component calls `getNfoData()` directly, renders the initial "All" view server-side (fast first paint, real content for crawlers — this page's SEO value depends on real server-rendered text, not a client-only fetch).
- Tabs: **All / Mutual Fund / SIF** — a small client component (`app/nfo/NfoFilterTabs.jsx`) that re-filters the already-fetched data client-side (no extra network call needed for a same-session tab switch; the `/api/nfo` route exists for any future client-only consumer, not because this page needs it for the tab switch itself).
- Each card: AMC name (logo via existing `lib/logoMap.json` lookup, falling back to a plain text badge when no logo entry exists — never block rendering on a missing logo), scheme name (linked to its detail page), category tag, a **"Closes in N days"** chip computed from the real `closeDate` (plain arithmetic against the render-time date, not a client-side JS countdown timer — no fake urgency, no hydration mismatch risk), min investment, offer price.
- Empty state, per tab, when that array is empty: a plain, honest message ("No SIF NFOs are open right now.") plus a link to `/sifs` (the existing SIF screener) so the visitor isn't left at a dead end. This path is exercised for real from day one, since SIF is confirmed empty at spec time.
- Closed-but-archived entries (see Archival rule) are NOT shown on this listing page — the listing only ever shows `status: "open"` entries. Archived/closed entries exist solely so their detail page doesn't 404; they are intentionally not surfaced in the browsable list.

### `/nfo/[slug]` — detail page (`app/nfo/[slug]/page.jsx`)

Mirrors `app/sif/[id]/page.js`'s SEO shape exactly:
- `dynamic = 'force-dynamic'` (data comes from R2 via `getNfoBySlug`, not Postgres, so this is cheap — matches the freshness expectation of time-sensitive open/close dates).
- `generateMetadata`: title `"${schemeName} NFO — Open Date, Price & Minimum Investment | Abundance"`, description built from `objective` + key dates + AMC, canonical `https://mfcalc.getabundance.in/nfo/${slug}`.
- JSON-LD `@graph`: one `FinancialProduct` (`name`, `description`, `provider.name` = `amcName`, `url` = canonical, `category`, `identifier` = `schemeId`, `offers: {"@type": "Offer", "price": offerPrice, "priceCurrency": "INR", "validFrom": openDate, "validThrough": closeDate}`) — the `offers`/`validFrom`/`validThrough` block is new relative to the `sif/[id]` precedent (there is no open/close-date concept for an already-launched fund), included here because it is exactly the structured-data shape search engines expect for a time-bound offer.
- An unresolvable slug returns Next's `notFound()`, same as the `sif/[id]` precedent's `robots: {index: false, follow: false}` path for a missing scheme — this spec follows `notFound()` specifically since there is no case here (unlike `sif/[id]`, which tolerates a bad id format) where a "not found but still render something" state makes sense.
- A `status: "closed"` entry still renders (does not `notFound()`) — same key-facts layout, with a clearly-worded "This NFO closed on {closeDate} and is no longer accepting subscriptions." banner in place of the open-state CTA.
- Body content: objective paragraph, a key-facts table (category, scheme type, offer price, min investment, open date, close date, AMC), an external-link block to the official `infoDocumentUrl` PDF and `amcWebsite` (both `target="_blank" rel="noopener noreferrer"`, visually marked as external), a "Talk to an Advisor" CTA linking to `/book-consultation`.
- Best-effort cross-link (never fabricated): if `getNfoBySlug`'s entry's `schemeName` matches an existing row in `mf_screener` or `sif_screener` by fuzzy name match (reuse the existing `cleanSearchTerm`-style normalization already used in `lib/holdingsLookup.js` for the same kind of matching, rather than inventing a new one), show a "View full analysis" link to that fund's `/fund/[code]` or `/sif/[id]` page. This is the one place this feature touches Postgres — a single indexed `SELECT code, name FROM mf_screener WHERE name ILIKE $1 LIMIT 1`-style lookup, read-only, on a low-traffic detail page, not a hot path — same risk class as the read-only lookups `holdingsLookup.js` already does today, not the personalized/high-concurrency pattern that caused the past incidents. If no match, the link is simply omitted.

## SEO

- **`app/sitemap-nfo.xml/route.js`** (new) — `export const revalidate = 86400;`, reads `getNfoData()` (not Postgres), emits one `<url>` for `/nfo` itself plus one per entry across `mf` and `sif` whose `status` is `"open"` **or** `"closed"` within the 30-day archive window (i.e. every slug the detail page will actually resolve, so nothing in the sitemap ever 404s).
- **`app/robots.js`**: add `'https://mfcalc.getabundance.in/sitemap-nfo.xml'` to the existing `sitemap` array. No change needed to `allow`/`disallow` — `/nfo` and `/nfo/*` are public pages already covered by the blanket `'/'` allow rule.
- Evergreen slugs (see Data model) mean a shared/bookmarked NFO link keeps working through the fund's entire open→closed-archived lifecycle.

## UI

Same design system as the rest of the site — Forest green palette, Raleway + JetBrains Mono, 1100px container (`app/globals.css` conventions). New scoped classes only (`.nfo-card`, `.nfo-chip`, `.nfo-tabs`, `.nfo-empty-state`, `.nfo-facts-table`, `.nfo-closed-banner`), added to `app/globals.css` following the existing convention of scoped feature-prefixed class blocks (e.g. the existing `.pf-health-*` block) rather than a new stylesheet file, since this is consistent with how single-feature CSS is already organized in this repo.

From SIF360 (researched this session): the *idea* of a clean card grid with a live-feeling status chip is worth carrying over; their specific layout, colors, ticker-strip, and lead-gen modal are not being copied.

## Navigation

`components/Navbar.jsx`'s `market` group gets one new entry, placed immediately after `industry` (line ~46-47):
```js
{ key: 'nfo', label: '🆕 New Fund Offers', href: '/nfo', desc: 'Live MF & SIF NFOs open for subscription' },
```

## Testing & verification

This repo has no automated test framework for pipeline/page work of this kind (established convention). Verification is:
1. Run `scripts/sync_amfi_nfo.js` locally against the real live AMFI endpoints; inspect the written R2 document by hand for both the `mf` and `sif` arrays, confirm the archival rule behaves correctly on a second run (re-run after manually editing one entry's `closeDate` into the past in the previous document to simulate a closure).
2. `npm run build` clean.
3. Live render of `/nfo` with real synced data: confirm the SIF empty-state renders correctly (real, not simulated, since SIF is confirmed empty at spec time), confirm at least one real MF NFO card renders correctly, confirm the tab filter works.
4. Live render of `/nfo/[slug]` for a real open NFO and (once the 30-day window has real data, or by temporarily hand-editing a local R2 copy) a closed one.
5. Validate the JSON-LD block through a structured-data validator (matching this repo's existing SEO QA habit for other JSON-LD pages).
6. Confirm `/sitemap-nfo.xml` and `robots.js`'s updated sitemap list both resolve correctly.

## Files touched

- `scripts/sync_amfi_nfo.js` (new)
- `.github/workflows/amfi-nfo-sync.yml` (new)
- `lib/nfoData.js` (new)
- `app/api/nfo/route.js` (new)
- `app/nfo/page.jsx` (new)
- `app/nfo/NfoFilterTabs.jsx` (new)
- `app/nfo/[slug]/page.jsx` (new)
- `app/sitemap-nfo.xml/route.js` (new)
- `app/globals.css` (edit — append new scoped class block)
- `app/robots.js` (edit — one line added to `sitemap` array)
- `components/Navbar.jsx` (edit — one entry added to the `market` group)

## Global Constraints

- No new Postgres query path except the single, explicitly-scoped, read-only best-effort name-match lookup on the detail page (Task covering `/nfo/[slug]`) — never a query on the listing page or the API route.
- Never fabricate a date, price, or link — every field traces to a real AMFI response field; a missing field is omitted from the UI, never guessed.
- Evergreen slugs — a slug, once generated, is never regenerated differently for the same `schemeId` (store the mapping implicitly via the stable slug function from Task 1, not by ad hoc string-building at render time).
- Reuse `app/book-consultation` for the advisor CTA — never link to the external getabundance.in contact page (this was already corrected sitewide earlier this session).
- No Claude/AI signature in any commit. Work directly on `main`. Commit automatically once each task is verified; push only when explicitly asked.
