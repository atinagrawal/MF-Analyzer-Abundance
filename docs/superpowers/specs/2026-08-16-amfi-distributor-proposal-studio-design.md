# AMFI Distributor Lookup — Shared Service + Proposal Studio Integration (Design)

## Goal

Integrate AMFI India's public (undocumented) distributor-registry API so Proposal
Studio can auto-fill and live-verify a distributor's own details from their ARN
number, instead of requiring five fields to be typed by hand with no way to
catch a wrong or expired ARN. This is sub-project 1 of 2; sub-project 2 (CAS
Tracker distributor resolution, `docs/superpowers/specs/2026-08-16-amfi-distributor-cas-tracker-design.md`)
depends on the shared service built here but is otherwise independent.

## Background — verified facts

Two AMFI endpoints were confirmed live this session via direct `curl` (not
assumed from documentation — AMFI does not publish a contract for either):

- `GET https://www.amfiindia.com/api/distributor-agent?strOpt=ALL&search={arn_or_name}&page=1&pageSize=10`
  Returns `{"data":[{ARN, ARNHolderName, Address, ARNValidFrom, ARNValidTill,
  Pin, City, KYDCompliant: "Y"|"N", EUIN, SIF_Validity_From, SIF_Validity_to,
  TelephoneNumber_O, TelephoneNumber_R, Email}], "meta":{page,pageSize,total,pageCount}}`.
  Confirmed working for an exact ARN (`search=251838` → one record) and for
  fuzzy name search (`search=ATIN KUMAR` → 14 unrelated people). Only exact-ARN
  lookup is used in this sub-project.
- `GET https://www.amfiindia.com/api/arn-social-media-links?arn={arn}` — **not
  used anywhere in this spec** (explicitly descoped: the trust badge shows
  ARN + validity + KYD + phone/email, not social/website links).

Both are internal Next.js API routes AMFI's own frontend calls — no published
contract, no documented rate limits, no stability guarantee. This app already
depends on similarly undocumented/best-effort external sources (mfapi.in for
NAV history, AMFI's own NAV-history CSV endpoint, Groww's exit-load data) with
the same mitigation: server-side-only calls, aggressive caching, and graceful
degradation rather than blocking any user flow on an upstream failure.

Proposal Studio's existing `AdvisorDetailsCard` (`app/proposal-studio/ProposalStudioClient.jsx`,
function starting at the line documented as ~199) has five plain text inputs
today: `advisorName`, `advisorPhone`, `advisorEmail`, `advisorArn` (defaults to
`'ARN-251838'`), `advisorEuin` — all manually typed, no validation. The
read-only/shared/print view (`app/proposal-studio/ProposalReadOnlyView.jsx`,
~line 61-77) renders `{advisorName}`, `{advisorPhone}`, `{advisorEmail}` and
`{advisorArn}{advisorEuin ? ' · EUIN: ...' : ''}` from those same values —
this is the same DOM the browser print/PDF flow uses, so anything rendered
here appears in both the shared link and any printed copy.

The UI's ARN convention includes the `ARN-` prefix (`'ARN-251838'`); AMFI's
API wants bare digits (`search=251838`). Every consumer of the shared service
must normalize this the same way, so normalization lives in the shared helper,
not duplicated per caller.

## Architecture

### 1. `lib/amfiDistributor.js` (new, server-only)

```js
// Extracts a bare 4-7 digit ARN from free text -- handles "ARN-251838",
// "251838", surrounding whitespace/punctuation. Returns null for anything
// that isn't ARN-shaped (blank, "Direct", a person's name, junk), so callers
// know not to attempt a lookup rather than sending garbage upstream.
export function extractArnDigits(text) { ... }

// Calls AMFI's distributor-agent search for an exact ARN, returns a
// normalized record or null if AMFI has no record for that ARN. Throws on
// network/API failure (distinct from "not found") so the caller can tell
// "verified absent" apart from "couldn't verify right now".
export async function fetchDistributorByArn(arn) {
  const res = await fetch(
    `https://www.amfiindia.com/api/distributor-agent?strOpt=ALL&search=${arn}&page=1&pageSize=10`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MFCalc/2.0)' }, signal: AbortSignal.timeout(15_000) }
  );
  if (!res.ok) throw new Error(`AMFI distributor endpoint returned ${res.status}`);
  const json = await res.json();
  const rec = (json.data || []).find(d => d.ARN === arn);
  if (!rec) return null;
  return {
    arn: rec.ARN,
    name: rec.ARNHolderName,
    phone: rec.TelephoneNumber_O || rec.TelephoneNumber_R || '',
    email: rec.Email || '',
    address: rec.Address || '',
    city: rec.City || '',
    pin: rec.Pin || '',
    kydCompliant: rec.KYDCompliant === 'Y',
    arnValidFrom: rec.ARNValidFrom,
    arnValidTill: rec.ARNValidTill,
    euin: rec.EUIN || '',
    sifValidFrom: rec.SIF_Validity_From,
    sifValidTill: rec.SIF_Validity_to,
  };
}
```

### 2. `app/api/distributor/route.js` (new)

`GET /api/distributor?arn=251838` — same 2-layer cache shape as the existing
`app/api/sif-nav/route.js` (R2 via `lib/r2.js`'s exact-key `r2Get`/`r2Put`),
adapted to per-ARN keys instead of one shared blob:

- Cache key: `distributor-arn/{arn}.json`.
- TTL: **30 days** — registration data changes rarely; KYD/expiry status is
  the only field that can shift meaningfully, and a month is an acceptable
  staleness bound for that (explicit product decision, not a technical
  limit) while cutting AMFI calls and user-facing latency dramatically.
- On cache hit within TTL: return cached payload, `X-Cache: HIT`.
- On cache miss/stale: call `fetchDistributorByArn`, cache the result
  (including a `null`/not-found result, so a bad ARN doesn't get re-queried
  every time), return `X-Cache: MISS`.
- On upstream failure with no usable cache (even stale): `502` with an error
  body. Callers must treat `502` as "couldn't verify," never as "not a real
  distributor" — those are different states with different UI treatment.
- Response shape: `{ found: boolean, distributor: {...} | null, cachedAt: ISO }`.

Route handler must validate `arn` is a bare digit string (reuse
`extractArnDigits` for the check) before calling AMFI, returning `400` for a
malformed param rather than forwarding it upstream.

## Proposal Studio integration

### `AdvisorDetailsCard` (`app/proposal-studio/ProposalStudioClient.jsx`)

New local state: `arnLookup: { status: 'idle' | 'loading' | 'ok' | 'not_found' | 'error', data: DistributorRecord | null }`.

Trigger points (both go through `extractArnDigits(advisorArn)` first; a
`null` result skips the fetch entirely):
- `onBlur` of the ARN input.
- Once on mount, if `advisorArn` already has a resolvable value (covers the
  `'ARN-251838'` default and reopening a saved proposal, where blur never
  fires automatically).

On `status === 'ok'`: fill `advisorName`, `advisorPhone`, `advisorEmail`,
`advisorEuin` **only where currently empty** — a field the distributor has
already typed into (even a different value than AMFI's) is never overwritten.
`advisorArn` itself is never rewritten by the lookup; it's the input driving
the lookup, not an output of it.

Inline UI directly under the ARN field:
- `loading`: small "Verifying ARN…" text with a spinner.
- `ok` + compliant + not expired: no extra note (clean state, nothing to flag).
- `ok` + (`!kydCompliant` or `arnValidTill` in the past): an amber warning line
  — "KYD not compliant" or "ARN expired \<date\>" as applicable.
- `not_found`: a quiet "ARN not found in AMFI registry — check the number."
- `error`: a quiet "Couldn't verify ARN right now" — never implies the ARN is
  invalid, since this is an upstream/network failure, not a registry lookup.

`arnLookup.status` plus the compliant/expired checks are threaded down to
wherever the Share and Send Email actions live. Those two actions **disable
themselves client-side** (with a tooltip explaining why) when the last-checked
ARN is not-compliant or expired. This is a **client-side-only** gate per
product decision — a compliance nudge for Abundance's own distributors, not a
security boundary, so `app/api/proposal-studio/share/route.js` and
`send-email/route.js` are **not** changed in this sub-project. Saving and
building the proposal are never blocked, regardless of ARN status.

### `ProposalReadOnlyView.jsx`

Line ~75's `{advisorArn}{advisorEuin ? ...}` becomes a small badge:
`AMFI Registered · ARN-251838 · Valid till Aug 2028` (only rendered when a
successful lookup happened during editing — falls back to today's plain
`{advisorArn}{advisorEuin...}` text if no lookup data is available, e.g. an
old saved proposal from before this feature existed, or the distributor never
triggered a successful lookup). The existing phone/email lines just above
(73-74) are unchanged — they already satisfy showing contact info alongside
the badge. This view renders from data already resolved and stored with the
proposal when it was built; it does **not** perform a fresh lookup at
view/share/print time (a shared/printed proposal is static content).

**Data model:** the resolved `arnLookup.data` (or at least
`{ kydCompliant, arnValidTill }` plus the badge display string) must be
persisted alongside the other advisor fields whenever a proposal is saved
(`app/api/proposal-studio/save/route.js`'s payload) and shared
(`app/api/proposal-studio/share/route.js`), so `ProposalReadOnlyView` can
render the badge without needing to be logged in as the original distributor
or re-hit AMFI. Exact field name to be finalized in the implementation plan
(e.g. `advisorArnVerified: { kydCompliant, arnValidTill, checkedAt }`).

## Error handling summary

| Condition | Auto-fill behavior | Share/Send | Read-only badge |
|---|---|---|---|
| ARN not AMFI-shaped (blank/"Direct"/junk) | No lookup attempted | Enabled | Falls back to plain ARN text |
| Lookup succeeds, compliant, not expired | Fills empty fields | Enabled | Shows badge |
| Lookup succeeds, not compliant or expired | Fills empty fields, shows amber note | **Disabled** (client-side) | Shows badge with the same warning styling |
| ARN not found in registry | No fill | Enabled (can't gate on data that doesn't exist) | Falls back to plain ARN text |
| AMFI unreachable / non-200 / timeout | No fill, "couldn't verify" note | Enabled (fail open — never block on an upstream outage) | Falls back to plain ARN text |

## Testing

- `lib/amfiDistributor.js`: unit tests for `extractArnDigits` (prefixed,
  bare, whitespace, "Direct", blank, a name, a too-short/too-long digit run)
  using plain Node + `assert` (`node tests/<file>.test.js`), matching this
  repo's existing test convention (no framework).
- `app/api/distributor/route.js`: no existing route handler in this repo
  (`tests/*.test.js`) is unit-tested directly — all existing tests cover pure
  `lib/`-level logic only. Consistent with that convention, this route is
  covered by manual verification (below) rather than a route-level test; the
  cache-hit/miss/normalization logic that's worth unit testing already lives
  in `lib/amfiDistributor.js`, covered above.
- Manual verification (both required before calling this done): (1) enter
  Abundance's own ARN `251838` in a fresh Proposal Studio session and confirm
  auto-fill + a clean badge; (2) enter a fabricated non-existent ARN and
  confirm the "not found" state, no fill, Share still enabled.

## Out of scope (this sub-project)

- The `arn-social-media-links` endpoint (not used anywhere).
- Server-side enforcement of the compliance gate.
- The public ARN verification tool page (dropped from the overall project).
- Any change to CAS Tracker or Portfolio — that's sub-project 2.
