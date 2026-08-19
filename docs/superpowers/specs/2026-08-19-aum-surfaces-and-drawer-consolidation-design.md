# AUM Surfaces + Drawer Consolidation (Design)

## Goal

Two related pieces of work, both surfaced while adding AUM (fund/SIF size,
in Cr) to the fund detail page:

1. **Close the remaining gaps** where AUM data already exists server-side
   but no UI reads it: the SIF detail page, Screener's own inline drawer,
   and the SIF Screener page (which also gets a "View Full SIF Page"
   link it's currently missing).
2. **Consolidate two near-duplicate drawer implementations** —
   `app/screener/ScreenerClient.jsx`'s own `Detail`/`SifDetail` and
   `components/HoldingDetailDrawer.jsx`'s `FundDetailDrawer`/
   `SifDetailDrawer` — into one shared presentational implementation, so
   this exact gap (a UI fix landing in one copy but not the other)
   structurally can't recur.

## Background — what already exists, confirmed this session

- `lib/holdingsLookup.js` already exports `getAumInfo(amfiCode)` — cheap
  (two already-warm R2-cached JSON reads via `createR2JsonCache`, no
  external vendor call), returns `{ aumCr, aumAsOf }`, keyed by plain
  AMFI code or `"SIF-XXX"` scheme ID (`amfi-aum.json`/`sif-aum.json`
  never share key space, so a plain fallback is safe).
- `app/api/fund-detail/[code]/route.js` and `app/api/sif-detail/[id]/route.js`
  already call `getAumInfo()` and include `aumCr`/`aumAsOf` in their
  responses (`fund`/`scheme` objects respectively) — done in an earlier
  change this session. **Three consumers of these exact responses never
  read those two fields**, confirmed by grepping each file for
  `aumCr`/`aumAsOf` and finding zero matches:
  - `app/sif/[id]/SifDetailClient.jsx` (the SIF detail page itself)
  - `app/screener/ScreenerClient.jsx`'s `Detail` and `SifDetail`
  - `app/sifs/SifScreener.jsx` (doesn't even fetch a per-scheme detail
    response — see below)
- `app/fund/[code]/FundDetailClient.jsx` and
  `components/HoldingDetailDrawer.jsx`'s `FundDetailDrawer`/
  `SifDetailDrawer` **do** already show AUM (both done in an earlier
  change this session) — confirming the data flow works correctly
  end-to-end once something actually reads the field.
- `app/sifs/SifScreener.jsx` (the SIF Screener page, `/sifs`) is a
  genuinely different UI from the other two drawer pairs — not a
  duplicate of anything. Its per-scheme "detail" view is
  `NavHistoryModal`, a narrow NAV-history-only panel (date-range picker,
  chart, a period-return/high/low/data-points stats row, a raw data
  table) — no KPI grid, no holdings, no stress data, no AUM, and no link
  out to the full `/sif/[id]` page. Its data comes from `initialData`
  (server-fetched in `app/sifs/page.js` via `GET /api/sif-nav`, 4h
  revalidate), not from `/api/sif-detail/[id]`.
- `app/api/sif-nav/route.js` returns `{ schemes: [...], count, nav_date,
  cached_at }`, R2-cached 4h, where each scheme is `{ sif_name, sif_id,
  scheme_id, nav_name, isin_po, isin_ri, type, category, nav, nav_date }`
  — no AUM. This same route is also consumed elsewhere (CAS Tracker,
  Portfolio) purely for NAV lookups — any change here must stay strictly
  additive (new fields only) so those other consumers are unaffected.
- `ScreenerClient.jsx`'s `Detail({ f, stress, onClose })` and
  `SifDetail({ s, onClose })` receive the fund/SIF row **as a prop** —
  Screener already has it in memory from its own bulk listing query, so
  reusing it avoids a redundant fetch. Both still independently fetch
  `holdings` (via the same `/api/fund-detail/[code]` /
  `/api/sif-detail/[id]` routes the shared drawer uses) and a NAV-history
  series (`/api/mf?code=` / `/api/sif-history`) — confirmed identical to
  `HoldingDetailDrawer.jsx`'s own fetch logic for those two pieces.
- `HoldingDetailDrawer.jsx`'s `FundDetailDrawer({ code, onClose })` /
  `SifDetailDrawer({ schemeId, onClose })` only ever receive a bare
  code/ID — CAS Tracker and Portfolio show funds found inside an
  uploaded CAS statement and never have a pre-loaded screener row for an
  arbitrary fund, so these fetch `fund`/`scheme` (+ `stress`, `holdings`,
  NAV) entirely themselves.
- Confirmed via full read of both files: the JSX each renders (header,
  flag/liquidity warnings, NAV chart, KPI grid, stress section, holdings
  section, meta line, "Key Operational Facts" block, CTA buttons) is
  essentially byte-for-byte identical between `Detail` and
  `FundDetailDrawer`, and between `SifDetail` and `SifDetailDrawer`. Same
  for the CSS — both files carry their own full copy of the
  `scr-drawer-*`/`scr-dk`/`scr-stress-*`/`scr-alloc-*`/`scr-pe-*`/
  `scr-sif-badge`/`scr-sif-notice` class rules.
  `HoldingDetailDrawer.jsx`'s own header comment already documents this
  duplication as a deliberate tradeoff at the time ("Deliberately
  self-contained rather than sharing ScreenerClient.jsx's own `<style>`
  block... importing it elsewhere would inject a lot of unrelated CSS").

## Part 1: close the three AUM-reading gaps + the missing SIF link

### 1a. SIF detail page

`app/sif/[id]/SifDetailClient.jsx`'s `sif-kpi-grid` array (currently:
Latest NAV, 1M/3M/6M Return, Since Inception, Volatility, Max Drawdown,
Ret/Risk) gains one more entry reading `sif.aumCr`/`sif.aumAsOf` — same
`{ lbl, val, sub, color }` shape the array already uses, following
`Latest NAV`'s exact formatting convention (`₹X Cr`, sub = "As of ...").

### 1b. `/api/sif-nav` gains AUM, and the SIF Screener page shows it

`lib/holdingsLookup.js` gains a new export, `getSifAumMap()`, returning
the raw parsed `sif-aum.json` object (the same R2-cached data
`getAumInfo()` already reads internally, just exposed for a bulk
merge instead of one scheme at a time — avoids N redundant `getAumInfo()`
calls in a loop for a several-hundred-scheme list).

`app/api/sif-nav/route.js`'s `fetchFromAMFI()` merges `aumCr`/`aumAsOf`
(from `getSifAumMap()`, keyed by `scheme_id`) into each scheme object —
purely additive fields, every existing consumer of this route
(CAS Tracker, Portfolio, this route's own cached payload shape)
continues to work unchanged since nothing existing is renamed or removed.

`app/sifs/SifScreener.jsx` then:
- Shows AUM on `SifCard` (grid view, next to the existing NAV block) and
  `SifRow` (list view, next to the existing NAV cell).
- Shows AUM in `NavHistoryModal`'s existing stats row (alongside Period
  Return / Current NAV / Period High / Period Low / Data Points).
- Gains a "View Full SIF Page →" link on each card/row (and in the
  modal's header), pointing at `/sif/${scheme.scheme_id}`, `target=
  "_blank"` — matching the exact CTA pattern already used in both
  existing drawer pairs.

## Part 2: consolidate the two drawer pairs into shared presentational components

Two new exports from `components/HoldingDetailDrawer.jsx`:

```
FundDetailPanel({ f, stress, holdings, nav, schemeFacts, onClose })
SifDetailPanel({ s, holdings, pts, histLoading, onClose })
```

Pure rendering — no `fetch`, no data-loading `useEffect`s. Each is the
exact JSX currently duplicated between the two implementations, moved
here once. The CSS `<style dangerouslySetInnerHTML>` injection moves
into these panels too (not their wrapper), so *any* caller that renders
a panel gets the necessary styles regardless of which wrapper (or none)
surrounds it.

**`HoldingDetailDrawer.jsx`'s own `FundDetailDrawer`/`SifDetailDrawer`**
become thin wrappers: unchanged fetch logic (still fetch `fund`+`stress`+
`holdings` / `scheme`+`holdings`, still fetch NAV history and
`schemeFacts`), but render `<FundDetailPanel .../>` / `<SifDetailPanel
.../>` instead of inlining the JSX themselves.

**`ScreenerClient.jsx`'s `Detail`/`SifDetail`** become thin wrappers too:
unchanged — still receive `f`/`stress`/`s` as props, still run their own
existing `holdings`+NAV(+`schemeFacts` for Detail) fetch effects — but
render the imported `<FundDetailPanel>`/`<SifDetailPanel>` instead of
their own duplicate JSX. Import from `@/components/HoldingDetailDrawer`.

**CSS cleanup in `ScreenerClient.jsx`**: once its `Detail`/`SifDetail`
render the shared panels (which bring their own styles), the
drawer-specific rules still sitting in `ScreenerClient.jsx`'s own CSS
template string become redundant. Remove them — but only after
confirming, class by class, that each candidate rule's selector isn't
*also* used by ScreenerClient.jsx's table/pager/search/leaders/FAQ
sections (several class names like `.scr-tag`, `.scr-pos`, `.scr-neg`,
`.scr-muted`, `.scr-btn` read as plausibly shared at a glance and need
verifying, not assuming, before deletion — a grep across the *whole*
file for each class name, not just within the old `Detail`/`SifDetail`
function bodies, before removing its rule). Where a class is genuinely
drawer-exclusive, delete its rule. Where it's shared, leave it in place.

## Error handling / edge cases

- `getSifAumMap()` returning `null`/empty (R2 unreachable): every AUM
  field downstream is optional (`?.`/`!= null` guards already used
  everywhere AUM is read) — the UI simply shows nothing extra, same
  degrade-gracefully behavior AUM already has elsewhere.
- The consolidation must not change any *existing* behavior — same
  fetch calls, same loading/error states, same field names passed
  through. This is a structural move (where the JSX lives), not a
  rewrite of what it does. Task-level review should diff the rendered
  output shape, not just "does it compile."
- `app/sifs/page.js`'s JSON-LD (`ItemList`, built server-side from
  `initialData.schemes`) is unaffected — it doesn't reference AUM and
  isn't required to; out of scope to add it there.

## Testing

No new pure-logic module — this is UI wiring plus a structural
JSX/CSS move. Verified by: `npm run build` succeeding, and manual
spot-checks per surface (SIF detail page shows AUM; `/sifs` cards/rows/
modal show AUM and the new link; Screener's own drawer — both fund and
SIF — shows AUM after the consolidation; CAS Tracker/Portfolio's drawer
still renders identically to before, since its wrapper's own fetch logic
is untouched). `getSifAumMap()` can be spot-checked the same way
`getAumInfo()` was verified earlier this session — a small throwaway
script confirming it resolves real AUM values for real scheme IDs.

## Out of scope

- Adding AUM to `app/sifs/page.js`'s server-rendered JSON-LD.
- Any change to `/api/fund-detail/[code]` or `/api/sif-detail/[id]`
  themselves (already carry AUM correctly; only their under-reading
  consumers are being fixed).
- A parallel consolidation of anything beyond the fund/SIF detail
  drawer pair (e.g. `NavHistoryModal` stays its own separate thing —
  it's a genuinely different UI, not a duplicate, per Background above).
