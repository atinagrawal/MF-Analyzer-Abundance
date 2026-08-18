# CAS Member Merge (Design)

## Goal

Let the CAS owner (or an admin/distributor managing them) manually fix a
CAS statement where one real investor has been wrongly split into two
"members" in the UI — most commonly because the CAS parser didn't restate
a folio's PAN on every one of its blocks, so that folio falls into a
generic "Shared"/"Unknown Investor" bucket instead of the real person's
group. Confirmed against two real cases this session:
`docs/superpowers/plans/2026-08-17-per-user-rate-limiter.md`'s sibling
bug reports — a single-PAN, 29-folio CAS (kaushal.iitr@gmail.com,
uploaded 2026-08-16) where ~10 folios came back with `PAN: ""` from the
parser, splitting one investor into two members in both `/portfolio` and
CAS Tracker.

An automatic fix already shipped for the unambiguous case (exactly one
valid PAN in the whole statement — see `app/portfolio/page.jsx` and
`app/cas-tracker/page.js`, commit `fbf78c0`). This feature covers
everything that heuristic can't: a statement with 2+ real PANs where it's
unclear which member a blank-PAN folio belongs to, or a folio whose own
PAN string is well-formed but simply wrong (a parser/OCR error producing
a bogus extra "member" that's actually the same person as an existing
one). Neither case can be auto-decided — only a human who recognizes their
own (or their client's) folios can make that call. This is always a
manual, human-confirmed action; the system never guesses.

## Background — what already exists

- `app/portfolio/page.jsx` and `app/cas-tracker/page.js` each
  independently group a CAS statement's folios into "members" keyed by
  PAN (a pattern already duplicated between the two files, like
  `calculateFifoCost` — see `app/portfolio/page.jsx`'s header comment
  "ported verbatim... so this page's numbers always agree with CAS
  Tracker's"). A folio with a missing/malformed PAN falls into a
  synthetic `'SHARED'` (portfolio page) or `'UNKNOWN'` (CAS Tracker)
  bucket, both defaulting to a generic display name ("Shared" /
  "Unknown Investor").
- `pan_investor_names` (table + `/api/cas/pan-name` route) already lets
  an owner (or admin/distributor managing them) label the investor name
  for a real PAN, stored **globally by PAN** (a PAN is a stable identity
  everywhere), authorized against `cas_portfolios.pans` via
  `lib/casAuth.js`'s `authorizedPans`/`resolveOwnerId`. This is the
  precedent this feature's authorization model reuses directly.
- `cas_portfolios` already stores every uploaded statement's blob key;
  `/api/cas/save` already computes each statement's distinct valid PANs
  server-side (trusted, not client-supplied) at upload time.
- Folio numbers are the registrar's own stable identifier for an
  investment account — more reliable than the PAN text field, which is
  exactly what's inconsistently restated across folios in the same
  statement (confirmed in the case above). They are **not** stored in
  any new table by this feature (see Data model) — they're only ever
  read from CAS statements the app already has saved.

## Data model

**No table duplicates folio numbers or auto-derived PAN resolutions** —
those are always computed live by re-reading the owner's own already-saved
CAS statements. The only new persistence is for genuine human decisions,
which the system has no other way to know:

```sql
CREATE TABLE folio_pan_overrides (
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folio_no    TEXT        NOT NULL,  -- base folio number, no "/ 0" suffix
                                      -- (matches folio_transmissions' key convention)
  pan         TEXT        NOT NULL,
  updated_by  TEXT        NOT NULL REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, folio_no)
);
```

Scoped by `user_id` (the CAS owner) rather than global-by-folio: unlike a
PAN, a folio number is only a stable identity within one investor's own
world, and scoping by owner avoids any risk of one account's override
ever leaking into another's statement.

## Resolution order

Applied per folio, identically in both `app/portfolio/page.jsx` and
`app/cas-tracker/page.js`, when grouping a statement's folios into
members:

1. The folio's own valid PAN in the current statement (existing).
2. A manual override on file for this folio (`folio_pan_overrides`).
3. The same folio number found with a valid PAN in one of the owner's
   *other* saved CAS statements (live lookup against R2, nothing stored
   — see `GET /api/cas/resolve-folios` below).
4. The "only one valid PAN in this whole statement" auto-fix already
   shipped (commit `fbf78c0`).
5. Fall back to `'SHARED'`/`'UNKNOWN'`, same as today — the user can now
   fix this via a manual merge (see UI below).

## API

All three endpoints follow `/api/cas/pan-name`'s existing authorization
shape exactly: `auth()` required; `resolveOwnerId(session, targetUserId)`
resolves who the request is acting on behalf of (self, or an admin/
distributor's target); any PAN referenced must appear in
`authorizedPans(ownerId, [pan])` — i.e. one the owner has actually seen
via their own saved uploads, checked server-side against
`cas_portfolios.pans`, never trusted from the client.

- **`GET /api/cas/resolve-folios?folios=A,B,C&excludeBlobKey=...&targetUserId=`**
  For each requested folio number: check `folio_pan_overrides` first: if
  present, return `{ pan, source: 'manual' }`. Otherwise, scan the
  owner's other saved `cas_portfolios` blobs (excluding `excludeBlobKey`,
  the statement currently being viewed, so a folio never resolves
  against itself) for that folio number with a valid PAN; if found,
  return `{ pan, source: 'history' }`. A folio with no match in either
  source is simply omitted from the response (still unresolved — the
  caller falls through to the existing sole-PAN heuristic, then
  Shared/Unknown). If the same folio number resolves to *conflicting*
  PANs across different past statements (a rare AMC folio-number reuse),
  treat it as unresolved rather than guessing — omit it.
- **`POST /api/cas/merge-member`** — body `{ folioNos: [...], targetPan,
  targetUserId? }`. Validates `targetPan` via `authorizedPans`; upserts
  each `(user_id, folio_no)` into `folio_pan_overrides` with
  `pan = targetPan`. This always overwrites any existing override for
  that folio (a later manual decision supersedes an earlier one).
- **`DELETE /api/cas/merge-member`** — body `{ folioNos: [...],
  targetUserId? }`. Deletes the override rows for those folios. A folio
  with no override row is a no-op, not an error (it may already be
  correctly resolved via history or the sole-PAN heuristic). Backs the
  "Undo" control.

## UI

Both `app/portfolio/page.jsx` and `app/cas-tracker/page.js` already
render a "VIEWING: [member chips]" row.

- **Chip-level quick action**: each non-"All members" chip gets a small
  overflow control → "Merge into…" → a dropdown listing the CAS's other
  current members → confirm, showing the folio count and value that will
  move. Calls `POST /api/cas/merge-member` with that chip's current
  member's folio numbers as `folioNos` and the chosen target's PAN.
- **Manage members panel**: a modal/expandable section (same component,
  used by both pages) listing every member for the currently-viewed CAS
  — PAN, display name, folio count — with its own "Merge with…" control
  per row, plus a separate list of active manual overrides for this
  statement (folio, target member name, who set it, when) each with an
  "Undo" button calling the `DELETE` endpoint.
- After any merge or undo, both pages re-run their existing folio→member
  grouping (no page reload needed) so the chip row, holdings list, and
  totals update immediately.

## Error handling / edge cases

- Merging into a `targetPan` the owner hasn't actually seen (spoofed or
  stale request): `403`, identical to `pan-name`'s existing check.
- `resolve-folios` finds the same folio number with conflicting PANs
  across two different past statements: leave unresolved rather than
  guess (see API section above) — surfaces as Shared/Unknown, same as no
  match, so the human can resolve it manually instead of the system
  silently picking one.
- Undoing an override that was never manually set (the folio was already
  correctly resolved via history or the sole-PAN heuristic): no-op, not
  an error — the `DELETE` simply finds no row to remove.
- A merge target PAN that later stops appearing in any saved upload
  (e.g. the statement it came from is deleted): the override row still
  exists and still resolves that folio to that PAN string; only a NEW
  merge or `resolve-folios` call re-validates `authorizedPans` — existing
  overrides aren't retroactively invalidated. Acceptable: the PAN string
  itself doesn't stop being real just because no currently-saved
  statement mentions it, and the affected folio's own display would
  simply show under a masked-PAN label same as any real PAN with no
  known name.

## Testing

No new pure `lib/` module — `resolve-folios`'s matching logic (manual
override takes priority, exclude the current blob, treat conflicting
historical PANs as unresolved) is straightforward enough to verify via
the same plain Node + `assert` convention this repo already uses,
against a small set of mocked saved-statement fixtures. `merge-member`'s
POST/DELETE endpoints follow the exact authorization shape already
proven by `/api/cas/pan-name` — manual verification (merge a chip, undo
it, confirm both pages' holdings/totals update) is sufficient, matching
how that existing feature was verified.

## Out of scope

- Auto-detecting *which* member a Shared/Unknown folio probably belongs
  to (e.g. by matching scheme/AMC patterns) — this is deliberately
  always a human decision, never a guess.
- Merging members across two different CAS *owners* (accounts) — a
  merge only ever operates within one owner's own statement; the
  existing `authorizedPans` check already prevents a target PAN outside
  the owner's own seen history.
- Retroactively re-validating existing overrides when the source
  statement they were confirmed against is deleted (see Error handling).
