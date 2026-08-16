# AMFI Distributor Lookup — CAS Tracker Resolution (Design)

## Goal

Resolve the raw `scheme.advisor` string casparser already extracts per CAS
holding into a real distributor profile (name, phone, email), shown as a
small hover badge on each CAS Tracker fund card, plus a "who sold this"
rollup summary across all holdings. This is sub-project 2 of 2, depending on
the shared `/api/distributor` route and `lib/amfiDistributor.js` built in
sub-project 1 (`docs/superpowers/specs/2026-08-16-amfi-distributor-proposal-studio-design.md`).

**Portfolio (`app/portfolio/page.jsx`) is explicitly out of scope for now** —
per product decision, this ships to CAS Tracker only. The resolution logic is
deliberately built as a page-agnostic module (not embedded in CAS Tracker's
component tree) so enabling it on Portfolio later is adding the badge JSX and
importing the module, not re-deriving the resolution logic.

## Background — verified facts

`app/cas-tracker/page.js` already carries a raw `advisor` string on every
CAS-derived holding (`const advisorStr = scheme.advisor || 'Direct / N/A';`,
around the line documented as ~1601-1602), sourced directly from casparser's
own field — this app does no extraction work for it today. **Correction to
an earlier claim made during this design's brainstorming:** this value is
**not** hidden inside a drawer — it's already rendered permanently, in plain
text, on every CAS-derived fund card's always-visible "folio-meta" row
(around the line documented as ~2823-2826: a `<span className="label">Advisor</span>`
/ `<span className="value">{fund.advisor}</span>` pair, inside a `folio-meta`
block that is not gated behind any collapsed/detail state).

The exact string format of `scheme.advisor` for a real CAS has **not** been
verified against a live PDF this session (explicitly waived by the user) —
it is assumed to commonly be an `ARN-XXXXXX`-shaped string (matching the
Proposal Studio UI's own `ARN-` convention) but may also be blank, "Direct",
or occasionally a name depending on AMC/RTA formatting quirks. The resolution
logic must degrade gracefully for every one of those cases, not assume a
clean format.

The card's "Type + source badges" row (around the line documented as
~2777-2809) already establishes the exact pattern to follow: a `<span>` with
inline styles matching the row's existing badges (SIF, Transmitted, family
member name, Admin Added), using a plain `title="..."` attribute for hover
text — no custom tooltip component exists or is needed.

## Architecture

### `lib/distributorResolution.js` (new, plain functions, page-agnostic)

```js
export { extractArnDigits } from './amfiDistributor'; // re-exported, single source of truth

// Takes the raw advisor strings off a set of holdings, dedupes to the
// distinct resolvable ARNs, fetches each via GET /api/distributor?arn=...
// in parallel (Promise.allSettled -- one slow/failing lookup must not block
// the others), and returns a map keyed by ARN so callers can look up by
// whatever `extractArnDigits(fund.advisor)` returns for each holding.
export async function resolveDistributors(advisorStrings) {
  const arns = [...new Set(advisorStrings.map(extractArnDigits).filter(Boolean))];
  const results = await Promise.allSettled(
    arns.map(arn => fetch(`/api/distributor?arn=${arn}`).then(r => r.json()))
  );
  const map = {};
  arns.forEach((arn, i) => {
    const r = results[i];
    map[arn] = r.status === 'fulfilled' && r.value.found ? r.value.distributor : null;
  });
  return map;
}
```

This is intentionally the same shape as the `navHistoryCache` /
`fetchNavHistory` pattern already established in this page for the
Transaction History drawer (client-side cache keyed by a derived string,
populated on demand, `Promise.allSettled` for parallel fetches) — no new
pattern introduced.

### CAS Tracker page changes (`app/cas-tracker/page.js`)

- New state: `distributorCache` (`{ [arn]: DistributorRecord | null }`),
  same shape convention as `navHistoryCache`.
- Populated once via `resolveDistributors()` after holdings are computed for
  the active view (whichever `currentInfo.holdings` / family-merged list is
  already the source of truth for the fund grid), not per-card and not
  per-hover — a hover must never trigger a network call.
- The existing "Advisor" row (~2823-2826) is **replaced** (not
  supplemented) for CAS-derived holdings:
  - If `extractArnDigits(fund.advisor)` resolves to a non-null cached
    record: render a small badge in the existing "Type + source badges" row
    (~2777-2809), styled identically to the neighboring SIF/Transmitted
    badges, e.g. `🧑‍💼 {record.name.split(' ')[0]}` (first name/word only,
    to keep the badge compact — full name still available in the tooltip).
    `title` attribute: `"{record.name}\nARN-{record.arn}\n📞 {record.phone}\n✉ {record.email}"`
    (native multi-line tooltip via `\n`, matching the plain-text-only
    constraint of the `title` attribute — no rich HTML tooltip).
  - Otherwise (unresolvable string, not found in registry, or the lookup
    failed): fall back to exactly today's behavior — the plain "Advisor"
    label/value row, unchanged. No error state is ever shown on a card; an
    unresolvable advisor is simply not enriched, not flagged as broken.
- Manual holdings are untouched — they have no `scheme.advisor` field and
  this feature does not apply to them.

### "Who sold this" rollup

A small summary card placed near CAS Tracker's existing top-level portfolio
stats (exact insertion point — which existing stat-card row/section — to be
pinned down in the implementation plan by reading the current stats section
layout, since this design doc doesn't cite exact line numbers for it).
Built entirely from `distributorCache` plus the current holdings list — no
extra fetches:

- Group holdings by `extractArnDigits(fund.advisor)` (or an explicit
  "Direct/Unrecognized" bucket for holdings that don't resolve).
  Format: `"12 of 15 holdings via ARN-XXXXXX (Distributor Name) · 3 via Direct"`
  — sorted by count descending, distributor name from `distributorCache`
  falling back to just the ARN if the lookup came back null (found in CAS
  data but not in AMFI's registry — worth showing as a fact, not hiding).
- Renders nothing (not even an empty card) if every holding is "Direct" or
  unresolvable — a rollup with nothing to roll up is noise, not information.

## Error handling summary

| `scheme.advisor` value | Badge | Rollup bucket |
|---|---|---|
| Blank / "Direct" / non-ARN-shaped text | Falls back to plain text row (unchanged from today) | "Direct" bucket |
| ARN-shaped, found in AMFI registry | Resolved badge + tooltip | Named bucket |
| ARN-shaped, not found in AMFI registry | Falls back to plain text row | Bucket by raw ARN, no name |
| ARN-shaped, AMFI lookup failed (network/5xx) | Falls back to plain text row | Excluded from rollup entirely (indistinguishable from "not yet resolved" — showing it as "Direct" would be actively wrong) |

## Testing

- `lib/distributorResolution.js`: unit test `resolveDistributors` against a
  mocked `fetch` covering dedup (two holdings, same ARN → one network call),
  a mix of found/not-found/error results, and an all-unresolvable input
  (empty map, zero calls) — plain Node + `assert`, matching this repo's
  existing test convention.
- Manual verification: open a real (or the existing test) CAS with at least
  one non-"Direct" `scheme.advisor` value and confirm the badge/tooltip
  render; confirm the rollup card appears/doesn't appear correctly for both
  an all-Direct CAS and a mixed one.

## Out of scope (this sub-project)

- Portfolio integration (deferred — see Goal section for why this is
  future-ready rather than a rework later).
- Verifying `scheme.advisor`'s real-world string format against a live CAS
  (explicitly waived by the user; the defensive `extractArnDigits` handling
  above is the mitigation).
- The `arn-social-media-links` endpoint.
