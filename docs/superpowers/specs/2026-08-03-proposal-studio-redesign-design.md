# Proposal Studio Redesign Design

## Goal

Rework the just-shipped Portfolio Creator page into **Proposal Studio** — a tool that builds an investment proposal (either analyzing an existing basket of funds or planning a new lump-sum/SIP allocation), fixing the data-accuracy and UX gaps found during real-world testing: Direct-plan-only AUM/expense-ratio being shown regardless of the actual plan, no Growth/IDCW filtering, no way to collapse sections, no fund logos, and a raw-% allocation input that doesn't match how a real proposal is built (an amount per fund, not an abstract percentage).

## Rename: Portfolio Creator → Proposal Studio

The page isn't indexed or SEO-optimized yet, so this is the right time to rename before any of that work happens. New route: `/proposal-studio` (was `/portfolio-creator`). This is a mechanical rename across the whole feature for consistency, not just the visible title:

- `app/portfolio-creator/` → `app/proposal-studio/` (`layout.js`, `page.jsx`, `PortfolioCreatorClient.jsx` → `ProposalStudioClient.jsx`, `portfolio-creator.css` → `proposal-studio.css`)
- `app/api/portfolio-creator/holdings/route.js` → `app/api/proposal-studio/holdings/route.js`
- `components/Navbar.jsx`'s `NAV_TOOLS` entry: `key: 'proposal-studio'`, `label` updated, `href: '/proposal-studio'`
- No functional change to `lib/portfolioAnalysis.js` — it's referenced by file path, not by feature name, and doesn't change.

## Proposal type & amount input (replaces raw % allocation)

Each proposal is **either** a Lumpsum proposal **or** a SIP proposal, never mixed — if someone wants both, they build two separate proposals. This keeps the amount math in one unit throughout a single proposal, so no lumpsum/SIP conversion logic is needed.

**New top-level state:**
```js
const [proposalType, setProposalType] = useState('lumpsum'); // 'lumpsum' | 'sip'
const [sipFrequency, setSipFrequency] = useState('monthly');  // 'daily' | 'monthly' -- only relevant when proposalType === 'sip'
const [totalAmount, setTotalAmount] = useState(0);
```

**UI**: a segmented toggle (Lumpsum / SIP) above the fund picker; when SIP is selected, a second small toggle (Daily / Monthly, Monthly default) appears next to the Total Amount field. The Total Amount field itself is a single ₹ input regardless of type — its meaning (one-time total vs. per-period total) is implied by the proposalType/frequency toggles next to it.

**Per-fund amounts**: `selectedFunds` entries change from `{amfiCode, schemeName, allocationPct}` to `{amfiCode, schemeName, amount}`. Adding/removing a **manually-searched** fund re-splits `totalAmount` evenly across all currently-selected manually-added funds (same behavior the existing equal-split-percent logic already has, just dividing a ₹ total instead of 100). Each fund's amount is independently editable afterward, same UX as today's allocation-% input, just showing ₹ instead of %. Changing `totalAmount` itself triggers a fresh even re-split across current *manually-added* funds (matches the simplest, most predictable behavior — no attempt to preserve prior manual edits' *ratios* across a changed total, since that adds complexity for a rare edit path).

**CAS-imported funds pre-fill their real amount instead of splitting evenly.** A CAS holding already carries its actual current value (`scheme.valuation`'s NAV × `scheme.close` units, the same computation `app/portfolio/page.jsx` already does) — forcing the user to manually re-type a total and re-split evenly would discard real data they already have. When a fund is added via the CAS-import tab, its `amount` is pre-filled with that computed current value, `proposalType` is implied `'lumpsum'` (an existing holding is money already invested, not a periodic plan), and `totalAmount` auto-increases by that fund's value rather than triggering an even re-split of the whole total. The user can still edit any CAS-imported fund's amount afterward (e.g. to model "what if I added more to this one") exactly like a manually-added fund. Mixing CAS-imported and manually-searched funds in the same proposal is allowed — manually-added funds continue to split whatever *portion* of `totalAmount` isn't already claimed by pre-filled CAS amounts, evenly among themselves.

**Feeding the existing analysis library** (`lib/portfolioAnalysis.js` — unchanged): the `allocations` map every existing function expects is now *derived* at render time: `Object.fromEntries(selectedFunds.map(f => [f.amfiCode, totalAmount > 0 ? (f.amount / totalAmount) * 100 : 0]))`. No changes needed to `combineExposure`/`computeOverlap`/`computeMCapAllocation` — they only ever cared about relative percentage, not the ₹ amounts behind it.

The existing "should sum to 100%" warning becomes "amounts should sum to ₹{totalAmount} total", same warning-styling, comparing `sum(selectedFunds.map(f => f.amount))` against `totalAmount`.

## Fund picker: Growth-only default, IDCW toggle

The **manual search tab** gets a new toggle, default off: "Show IDCW/Dividend plans". When off (default), search results exclude any scheme name matching `/\b(idcw|dividend|bonus|payout|reinvest)\b/i`, in addition to the existing Direct-plan exclusion already in place. When the toggle is on, IDCW/Dividend variants are included too.

This filter applies **only** to the manual-search tab. The **CAS-import tab** shows the user's real holdings exactly as parsed from their statement, unfiltered — hiding a real IDCW holding just because of this toggle would misrepresent what the user actually owns.

## Scheme Details: remove AUM and expense ratio

Both fields are Direct-plan-only data (the only variant the underlying data source indexes), and showing them as if they apply to whatever plan a proposal is actually for is misleading — expense ratio in particular is materially different between Direct and Regular. Remove both columns from the rendered `SchemeDetailsTable`. The API route can keep returning them (harmless, no reason to touch that contract) — this is a rendering-only change, with a code comment marking it as a known gap:

```js
// TODO: AUM and expense ratio removed from this table -- both are Direct-plan-only
// values from the underlying data source, misleading for a Regular-plan proposal.
// Re-add once a reliable per-plan (Direct vs Regular) source is found.
```

Remaining columns: fund name, category/sub-category, risk rating, equity holdings count.

## UI: collapsible sections, logos, full-holdings view

- **Collapsible sections**: each of Asset Allocation, Sector Exposure, Stock Exposure, Portfolio Overlap, Scheme Details, and M-Cap Allocation gets wrapped in a shared `CollapsibleSection` component (title bar with an expand/collapse chevron, `useState` per instance, defaults open, not persisted across reloads — simplest behavior, no new storage needed).
- **AMC logos**: the "Selected funds" list in the fund picker gets each fund's AMC logo next to its name, reusing the existing `ProviderAvatar`/`getMFLogoFromSchemeName` components already used on `/portfolio` and `/backtest` — no new logo-fetching logic needed.
- **Full holdings view**: Stock Exposure's top-10-plus-Other table gets a "Show all N holdings" expand link — when expanded, renders the complete combined stock list instead of just the top 10. Defaults to collapsed (matching the reference proposal document's own top-10 convention), so a portfolio's full multi-hundred-row combined stock list isn't dumped on screen by default.
- **General visual polish**: bring the page's styling up to the level already established by `MFCompare.jsx`/`ScreenerClient.jsx` (consistent card treatment, spacing, hover states) rather than the plainer table-only look it shipped with. No exact CSS is specified here — implementation should follow the site's existing forest-green design system (`--g1`/`--g2`/`--g3`, Raleway/JetBrains Mono) and match the polish level of those two reference files.

## Explicitly out of scope

- **Full branded/saved PDF export** is a separate, immediately-following spec (not bundled here) — it depends on this spec's amount-based data model (a real proposal PDF needs to show ₹ SIP/lumpsum amounts per fund, not raw %), so it's sequenced right after this one, not deferred indefinitely.
- **Reliable per-plan AUM/expense-ratio source** is a noted TODO, not solved here.
- The Benchmark section (already hidden) and the AMC-disclosure pipeline fixes remain out of scope, same as the original spec.

## Testing

- `npm run build`.
- Unit-level: no changes needed to `tests/portfolioAnalysis.test.js` (the library itself is untouched) — but a small new test worth adding: deriving `allocations` from `{amount, totalAmount}` produces the expected percentages, including the `totalAmount === 0` guard (avoid divide-by-zero).
- Manual verification checklist: switch between Lumpsum/SIP proposal types, confirm the Daily/Monthly toggle only appears for SIP; add/remove manually-searched funds and confirm their amounts re-split evenly; add a CAS-imported fund and confirm its amount pre-fills with its real current value (not an even split) and `totalAmount` increases accordingly; edit an individual fund's amount and confirm the "should sum to" warning appears/clears correctly; toggle IDCW visibility in manual search and confirm CAS import is unaffected; confirm Scheme Details no longer shows AUM/expense ratio; collapse/expand each section; confirm fund logos render in the selected-funds list; expand "Show all holdings" in Stock Exposure and confirm the full list renders.
