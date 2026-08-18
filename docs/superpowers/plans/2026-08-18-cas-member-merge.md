# CAS Member Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a CAS owner (or an admin/distributor managing them) manually merge two wrongly-split "members" of a CAS statement back into one, and have that decision — plus any folio the app can already resolve from the owner's other saved statements — survive into future uploads without repeating the fix.

**Architecture:** One new table (`folio_pan_overrides`) stores only genuine human decisions. A new `GET /api/cas/resolve-folios` endpoint answers "what PAN does this ambiguous folio belong to?" by checking overrides first, then live-scanning the owner's *other* saved CAS blobs in R2 — nothing about folio numbers or resolved PANs is duplicated into a new table beyond explicit manual overrides. Two new mutation endpoints (`POST`/`DELETE /api/cas/merge-member`) write/remove those overrides. A shared `components/CasMemberMerge.jsx` component provides the actual merge/undo UI, mounted by both `app/portfolio/page.jsx` and `app/cas-tracker/page.js`, each of which independently wires the new resolution-order step into its own existing (already-duplicated-by-precedent) folio-grouping logic.

**Tech Stack:** Next.js 16 (App Router API routes + Pages... no, both target pages are App Router client components), Postgres (`pg` via `lib/db.js`), Cloudflare R2 (`lib/r2.js`), plain Node + `assert` for the one pure-logic test file.

## Global Constraints

- **Folio number normalization**: everywhere in this feature, "folio number" means the BASE folio number with any `"/ 0"`-style registrar suffix stripped — `(folio.folio || '').split('/')[0].trim()`. This matches the existing `folio_transmissions` key convention already used identically in both `app/portfolio/page.jsx` (`baseFolioNo`) and `app/cas-tracker/page.js` (`baseFolioNo`). Every task that reads or writes a folio number must apply this exact normalization.
- **PAN validation**: reuse `PAN_REGEX` from `lib/casAuth.js` (`/^[A-Z]{5}[0-9]{4}[A-Z]$/`) everywhere a PAN string needs validating — do not redefine it.
- **Authorization — do NOT reuse `resolveOwnerId` from `lib/casAuth.js` for the new routes.** That helper only recognizes `session.user.role === 'admin'` for acting on another user's behalf, which under-serves this feature's approved scope (owner + admin/distributor managing them, confirmed during brainstorming). Instead, follow `app/api/cas/list/route.js`'s existing pattern, which already correctly supports both roles via `canManageUser` (`lib/permissions.js`):
  ```js
  const targetUserId = body.targetUserId || searchParams.get('targetUserId');
  const ownerId = (targetUserId && targetUserId !== session.user.id) ? targetUserId : session.user.id;
  if (ownerId !== session.user.id && !(await canManageUser(session, ownerId))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }
  ```
  Still reuse `authorizedPans(ownerId, pans)` from `lib/casAuth.js` unchanged — it's role-agnostic (just queries `cas_portfolios` by whatever `ownerId` you pass it), so it composes fine with the `canManageUser`-based resolution above.
- **No Claude/AI co-author signature in any commit, ever.**
- Repo convention: work directly on `main`, no feature branches. Stage only the exact files each commit touches — never a broad `git add -A`/`git add .` (this repo's working directory has had unrelated concurrent uncommitted work swept into a commit before).
- Testing convention: plain Node + `assert`, `node tests/<file>.test.js`, no test framework. Only `lib/resolveFolioPan.js` (Task 2) gets a dedicated test file — the API routes and the two page integrations are manually verified, matching how the sibling `pan-name` feature was verified.

---

### Task 1: `folio_pan_overrides` table + migration script

**Files:**
- Modify: `scripts/schema.sql`
- Create: `scripts/migrate-folio-pan-overrides.mjs`

**Interfaces:**
- Produces: the `folio_pan_overrides` table, columns `user_id TEXT`, `folio_no TEXT`, `pan TEXT`, `updated_by TEXT`, `updated_at TIMESTAMPTZ`, primary key `(user_id, folio_no)` — every later task's SQL reads/writes this exact shape.

- [ ] **Step 1: Add the table to `scripts/schema.sql`**

Read the file's `cas_portfolios` and `pan_investor_names` sections (around line 114-145) first to match the existing comment style and placement — add the new table immediately after `pan_investor_names` (they're conceptually related: both are per-PAN CAS metadata):

```sql
-- Manual "this folio actually belongs to this PAN" corrections, for a CAS
-- statement where the parser didn't restate a folio's own PAN and it fell
-- into a generic "Shared"/"Unknown Investor" bucket instead of the real
-- person's group (see docs/superpowers/specs/2026-08-18-cas-member-merge-design.md).
-- Scoped by user_id (the CAS owner), NOT global like pan_investor_names --
-- a folio number is only a stable identity within one investor's own
-- world, so scoping by owner avoids any risk of one account's override
-- ever applying to a different account's statement. Written ONLY by an
-- explicit human merge action (app/api/cas/merge-member/route.js) --
-- never by any automatic process. The "this folio's PAN can be inferred
-- from the owner's other saved statements" case needs no storage at all;
-- it's answered live by GET /api/cas/resolve-folios re-reading those
-- statements from R2 directly.
CREATE TABLE IF NOT EXISTS folio_pan_overrides (
  user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folio_no    TEXT        NOT NULL,
  pan         TEXT        NOT NULL,
  updated_by  TEXT        NOT NULL REFERENCES users(id),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, folio_no)
);
```

- [ ] **Step 2: Create the migration script**

Read `scripts/migrate-lifecycle-tracking.mjs` first — match its exact shape (connect via `POSTGRES_URL`, run the idempotent DDL, log, `pool.end()`):

```js
/**
 * scripts/migrate-folio-pan-overrides.mjs
 *
 * One-time migration: creates the folio_pan_overrides table (schema also
 * documented in scripts/schema.sql). Idempotent (IF NOT EXISTS), safe to re-run.
 *
 * Usage:
 *   node scripts/migrate-folio-pan-overrides.mjs
 * Env: POSTGRES_URL (required).
 */

import pg from 'pg';

async function main() {
  const pgUrl = process.env.POSTGRES_URL;
  if (!pgUrl) {
    console.error('POSTGRES_URL is required.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });

  console.log('[migrate] creating folio_pan_overrides...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS folio_pan_overrides (
      user_id     TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      folio_no    TEXT        NOT NULL,
      pan         TEXT        NOT NULL,
      updated_by  TEXT        NOT NULL REFERENCES users(id),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, folio_no)
    )
  `);

  console.log('[migrate] done.');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Verify**

Run `node --check scripts/migrate-folio-pan-overrides.mjs` (syntax only — do NOT run it against the live database; the controller runs it separately after this task is reviewed). Confirm the `CREATE TABLE` statement in this file is byte-identical (column-for-column) to the one added to `scripts/schema.sql`.

- [ ] **Step 4: Commit**

```bash
git add scripts/schema.sql scripts/migrate-folio-pan-overrides.mjs
git commit -m "chore(cas-merge): add folio_pan_overrides table + migration script"
```

---

### Task 2: `lib/resolveFolioPan.js` (pure matching logic) + `GET /api/cas/resolve-folios`

**Files:**
- Create: `lib/resolveFolioPan.js`
- Create: `tests/resolveFolioPan.test.js`
- Create: `app/api/cas/resolve-folios/route.js`

**Interfaces:**
- Consumes: `PAN_REGEX`, `authorizedPans` from `lib/casAuth.js` (read that file in full — already exists, do not modify); `canManageUser` from `lib/permissions.js`; `pool` from `lib/db.js`; `r2Get` from `lib/r2.js`; the `Global Constraints` authorization pattern above.
- Produces: `pickFolioResolutions(folioNos, overridesByFolio, historicalSightingsByFolio)` — exported from `lib/resolveFolioPan.js`, pure function, no I/O. `overridesByFolio` is `{ [folioNo]: pan }` (already-fetched override rows). `historicalSightingsByFolio` is `{ [folioNo]: string[] }` (list of PAN strings seen for that folio across the owner's other statements — may contain duplicates or conflicting values). Returns `{ [folioNo]: { pan, source: 'manual' | 'history' } }`, omitting any folio it can't confidently resolve. Task 5 and 6 call `GET /api/cas/resolve-folios` (not this function directly) to get the same shape over HTTP.

- [ ] **Step 1: Write the failing tests**

Create `tests/resolveFolioPan.test.js`, following `tests/amfiDistributor.test.js`'s plain Node + `assert` structure (read that file first for the exact `test()`/summary-printing pattern used across this repo's test files):

```js
import assert from 'node:assert';
import { pickFolioResolutions } from '../lib/resolveFolioPan.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✓ ${name}`); passed++; }
  catch (e) { console.log(`✗ ${name}`); console.log(`  ${e.message}`); failed++; }
}

test('manual override takes priority over history', () => {
  const result = pickFolioResolutions(
    ['F1'],
    { F1: 'AAAAA1111A' },
    { F1: ['BBBBB2222B'] }
  );
  assert.deepStrictEqual(result, { F1: { pan: 'AAAAA1111A', source: 'manual' } });
});

test('resolves via a single consistent historical sighting', () => {
  const result = pickFolioResolutions(
    ['F1'],
    {},
    { F1: ['AAAAA1111A'] }
  );
  assert.deepStrictEqual(result, { F1: { pan: 'AAAAA1111A', source: 'history' } });
});

test('resolves via multiple identical historical sightings (same PAN, several statements)', () => {
  const result = pickFolioResolutions(
    ['F1'],
    {},
    { F1: ['AAAAA1111A', 'AAAAA1111A', 'AAAAA1111A'] }
  );
  assert.deepStrictEqual(result, { F1: { pan: 'AAAAA1111A', source: 'history' } });
});

test('conflicting historical PANs for the same folio are left unresolved', () => {
  const result = pickFolioResolutions(
    ['F1'],
    {},
    { F1: ['AAAAA1111A', 'BBBBB2222B'] }
  );
  assert.deepStrictEqual(result, {});
});

test('a folio with no override and no history is omitted, not an error', () => {
  const result = pickFolioResolutions(['F1'], {}, {});
  assert.deepStrictEqual(result, {});
});

test('resolves each requested folio independently', () => {
  const result = pickFolioResolutions(
    ['F1', 'F2', 'F3'],
    { F1: 'AAAAA1111A' },
    { F2: ['BBBBB2222B'], F3: ['CCCCC3333C', 'DDDDD4444D'] }
  );
  assert.deepStrictEqual(result, {
    F1: { pan: 'AAAAA1111A', source: 'manual' },
    F2: { pan: 'BBBBB2222B', source: 'history' },
  });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run to verify it fails**

Run: `node tests/resolveFolioPan.test.js`
Expected: fails immediately — `lib/resolveFolioPan.js` doesn't exist yet (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Implement `lib/resolveFolioPan.js`**

```js
/**
 * lib/resolveFolioPan.js
 *
 * Pure decision logic for GET /api/cas/resolve-folios: given a folio's
 * manual override (if any) and whatever PAN(s) that same folio number was
 * seen under across the owner's OTHER saved CAS statements, decide what
 * PAN it should resolve to. Split from the route handler (which does the
 * actual DB/R2 reads) purely so this decision logic is testable without
 * mocking either -- same pattern this repo already uses for
 * lib/rateLimit.js's formatRetryLabel.
 */

// folioNos: string[] -- every folio number the caller wants resolved.
// overridesByFolio: { [folioNo]: pan } -- already-fetched folio_pan_overrides rows.
// historicalSightingsByFolio: { [folioNo]: string[] } -- PAN(s) seen for that
//   folio number across the owner's other saved statements (may be empty,
//   single, repeated, or conflicting).
// Returns { [folioNo]: { pan, source: 'manual' | 'history' } } -- a folio
// with no override and either no history or CONFLICTING history is
// omitted entirely (left unresolved) rather than guessed.
export function pickFolioResolutions(folioNos, overridesByFolio, historicalSightingsByFolio) {
  const result = {};
  for (const folioNo of folioNos) {
    const override = overridesByFolio[folioNo];
    if (override) {
      result[folioNo] = { pan: override, source: 'manual' };
      continue;
    }
    const sightings = historicalSightingsByFolio[folioNo] || [];
    const distinctPans = [...new Set(sightings)];
    if (distinctPans.length === 1) {
      result[folioNo] = { pan: distinctPans[0], source: 'history' };
    }
    // 0 sightings (unresolved) or 2+ conflicting distinct PANs (ambiguous)
    // both fall through here -- omitted, not guessed.
  }
  return result;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node tests/resolveFolioPan.test.js`
Expected: `6 passed, 0 failed`

- [ ] **Step 5: Implement the route**

Read `app/api/cas/pan-name/route.js` and `app/api/cas/load/route.js` in full first (both already exist) — this route's overall shape (fetch → auth → validate → query → respond, `console.error` + generic error response on failure) matches those exactly, EXCEPT for authorization, which follows this plan's Global Constraints section (`canManageUser`, not `resolveOwnerId`), since this route must support distributor.

Create `app/api/cas/resolve-folios/route.js`:

```js
/**
 * app/api/cas/resolve-folios/route.js
 *
 * GET /api/cas/resolve-folios?folios=A,B,C&excludeBlobKey=...[&targetUserId=...]
 *
 * For each requested (base) folio number, resolves which PAN it belongs
 * to: a manual override on file takes priority; otherwise, the owner's
 * OTHER saved CAS statements (excluding excludeBlobKey, the one currently
 * being viewed) are scanned live for that same folio number under a
 * valid PAN. A folio this can't confidently resolve is simply omitted --
 * the caller falls through to its own remaining resolution steps (the
 * "only one valid PAN in this statement" auto-fix, then Shared/Unknown).
 *
 * See docs/superpowers/specs/2026-08-18-cas-member-merge-design.md.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';
import { r2Get } from '@/lib/r2';
import { canManageUser } from '@/lib/permissions';
import { pickFolioResolutions } from '@/lib/resolveFolioPan';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const folioNos = (searchParams.get('folios') || '')
      .split(',').map(f => f.trim()).filter(Boolean);
    const excludeBlobKey = searchParams.get('excludeBlobKey') || '';
    const targetUserId = searchParams.get('targetUserId') || '';

    if (!folioNos.length) {
      return Response.json({ resolutions: {} });
    }

    const ownerId = (targetUserId && targetUserId !== session.user.id) ? targetUserId : session.user.id;
    if (ownerId !== session.user.id && !(await canManageUser(session, ownerId))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 1. Manual overrides for these folios.
    const { rows: overrideRows } = await pool.query(
      `SELECT folio_no, pan FROM folio_pan_overrides WHERE user_id = $1 AND folio_no = ANY($2)`,
      [ownerId, folioNos]
    );
    const overridesByFolio = {};
    overrideRows.forEach(r => { overridesByFolio[r.folio_no] = r.pan; });

    // 2. For whatever's left, scan the owner's OTHER saved statements.
    const stillUnresolved = folioNos.filter(f => !overridesByFolio[f]);
    const historicalSightingsByFolio = {};
    if (stillUnresolved.length) {
      const { rows: otherPortfolios } = await pool.query(
        `SELECT blob_key FROM cas_portfolios WHERE user_id = $1 AND blob_key != $2`,
        [ownerId, excludeBlobKey]
      );
      const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
      for (const { blob_key } of otherPortfolios) {
        let data;
        try {
          data = await r2Get(blob_key);
        } catch {
          continue; // an unreadable old statement just contributes nothing
        }
        if (!data) continue;
        (data.folios || []).forEach(folio => {
          const baseFolioNo = (folio.folio || '').split('/')[0].trim();
          if (!stillUnresolved.includes(baseFolioNo)) return;
          const pan = (folio.PAN || '').toUpperCase().trim();
          if (pan.length === 10 && PAN_RE.test(pan)) {
            (historicalSightingsByFolio[baseFolioNo] ||= []).push(pan);
          }
        });
      }
    }

    const resolutions = pickFolioResolutions(folioNos, overridesByFolio, historicalSightingsByFolio);
    return Response.json({ resolutions });

  } catch (err) {
    console.error('[cas/resolve-folios]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 6: Verify**

Run `node --check app/api/cas/resolve-folios/route.js` and `node --check lib/resolveFolioPan.js`. Re-run `node tests/resolveFolioPan.test.js` (`6 passed, 0 failed`).

- [ ] **Step 7: Commit**

```bash
git add lib/resolveFolioPan.js tests/resolveFolioPan.test.js app/api/cas/resolve-folios/route.js
git commit -m "feat(cas-merge): add resolve-folios endpoint (manual override + cross-statement history)"
```

---

### Task 3: `POST` / `DELETE /api/cas/merge-member`

**Files:**
- Create: `app/api/cas/merge-member/route.js`

**Interfaces:**
- Consumes: `PAN_REGEX`, `authorizedPans` from `lib/casAuth.js`; `canManageUser` from `lib/permissions.js`; `pool` from `lib/db.js`; this plan's Global Constraints authorization pattern.
- Produces: `POST` body `{ folioNos: string[], targetPan: string, targetUserId?: string }` → `{ ok: true, folioNos, targetPan }` on success. `DELETE` body `{ folioNos: string[], targetUserId?: string }` → `{ ok: true, removed: <count> }`. Tasks 5 and 6 call these from the shared UI component (Task 4).

- [ ] **Step 1: Implement the route**

Read `app/api/cas/pan-name/route.js` in full first (already read for Task 2, re-confirm its POST validation/error-message shape — this route's POST follows the same "validate → authorize → upsert → respond" structure, response-shape errors included).

Create `app/api/cas/merge-member/route.js`:

```js
/**
 * app/api/cas/merge-member/route.js
 *
 * POST   /api/cas/merge-member   { folioNos, targetPan, targetUserId? }
 *   Manually attributes each given folio number to targetPan -- the
 *   "merge member A into member B" action. Always overwrites any
 *   existing override for a folio (a later manual decision supersedes an
 *   earlier one).
 *
 * DELETE /api/cas/merge-member   { folioNos, targetUserId? }
 *   Removes the override for each given folio number, letting it fall
 *   back through the normal resolution order (a prior CAS statement's
 *   history, then the sole-PAN-in-statement auto-fix, then Shared/
 *   Unknown). A folio with no override row is a no-op, not an error.
 *
 * Authorization matches app/api/cas/resolve-folios/route.js exactly --
 * see docs/superpowers/plans/2026-08-18-cas-member-merge.md's Global
 * Constraints for why this uses canManageUser rather than
 * lib/casAuth.js's resolveOwnerId (which is admin-only).
 *
 * See docs/superpowers/specs/2026-08-18-cas-member-merge-design.md.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';
import { canManageUser } from '@/lib/permissions';
import { PAN_REGEX, authorizedPans } from '@/lib/casAuth';

export const dynamic = 'force-dynamic';

async function resolveAndAuthorizeOwner(session, targetUserId) {
  const ownerId = (targetUserId && targetUserId !== session.user.id) ? targetUserId : session.user.id;
  if (ownerId !== session.user.id && !(await canManageUser(session, ownerId))) {
    return null;
  }
  return ownerId;
}

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const folioNos  = Array.isArray(body.folioNos) ? body.folioNos.map(f => String(f).trim()).filter(Boolean) : [];
    const targetPan = (body.targetPan || '').trim().toUpperCase();

    if (!folioNos.length) {
      return Response.json({ error: 'folioNos must be a non-empty array' }, { status: 400 });
    }
    if (!PAN_REGEX.test(targetPan)) {
      return Response.json({ error: 'Invalid targetPan' }, { status: 400 });
    }

    const ownerId = await resolveAndAuthorizeOwner(session, body.targetUserId);
    if (!ownerId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const allowed = await authorizedPans(ownerId, [targetPan]);
    if (!allowed.length) {
      return Response.json({ error: 'This PAN was not found in your saved CAS uploads' }, { status: 403 });
    }

    for (const folioNo of folioNos) {
      await pool.query(
        `INSERT INTO folio_pan_overrides (user_id, folio_no, pan, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (user_id, folio_no) DO UPDATE SET
           pan        = EXCLUDED.pan,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
        [ownerId, folioNo, targetPan, session.user.id]
      );
    }

    return Response.json({ ok: true, folioNos, targetPan });
  } catch (err) {
    console.error('[cas/merge-member] POST error:', err.message);
    return Response.json({ error: 'Could not save merge' }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const folioNos = Array.isArray(body.folioNos) ? body.folioNos.map(f => String(f).trim()).filter(Boolean) : [];

    if (!folioNos.length) {
      return Response.json({ error: 'folioNos must be a non-empty array' }, { status: 400 });
    }

    const ownerId = await resolveAndAuthorizeOwner(session, body.targetUserId);
    if (!ownerId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await pool.query(
      `DELETE FROM folio_pan_overrides WHERE user_id = $1 AND folio_no = ANY($2)`,
      [ownerId, folioNos]
    );

    return Response.json({ ok: true, removed: result.rowCount });
  } catch (err) {
    console.error('[cas/merge-member] DELETE error:', err.message);
    return Response.json({ error: 'Could not undo merge' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Verify**

Run `node --check app/api/cas/merge-member/route.js`.

- [ ] **Step 3: Commit**

```bash
git add app/api/cas/merge-member/route.js
git commit -m "feat(cas-merge): add merge-member POST/DELETE endpoints"
```

---

### Task 4: Shared `components/CasMemberMerge.jsx`

**Files:**
- Create: `components/CasMemberMerge.jsx`

**Interfaces:**
- Consumes: nothing from this app's other modules beyond React itself and `fetch` — a self-contained, presentational + interactive component (matches `components/RedemptionPlanner.jsx`'s existing pattern of a shared modal/drawer component driven entirely by props and its own local state). Read `components/RedemptionPlanner.jsx` in full first for this repo's established prop-driven-modal shape (open/onClose, styling conventions, how it calls its own API endpoints, loading/error state handling).
- Produces: default export `CasMemberMerge`, props:
  - `open: boolean`, `onClose: () => void`
  - `members: { pan: string, name: string, folioNos: string[] }[]` — every current member for the CAS being viewed, INCLUDING the synthetic Shared/Unknown bucket if present (its `pan` field is the literal string `'SHARED'` or `'UNKNOWN'` as already used by the calling page; this component treats it as just another member to merge FROM, never as a valid merge TARGET — filtered out of the "merge into" target dropdown).
  - `overrides: { folioNo: string, pan: string, targetName: string, updatedBy: string, updatedAt: string }[]` — active manual overrides for folios in THIS statement (for the "Undo" list). `targetName` is whatever member name that PAN currently resolves to, precomputed by the caller.
  - `targetUserId: string | undefined`
  - `initialFromPan: string | undefined` — when set (opened via a chip's quick action), pre-selects that member as the merge source on open.
  - `onMerged: () => void` — called after a successful POST or DELETE so the caller re-fetches/recomputes its own holdings/totals.
  Later tasks (5, 6) import and render `<CasMemberMerge />`, passing these props from their own existing member/PAN state.

- [ ] **Step 1: Implement the component**

```jsx
'use client';

import { useState, useEffect } from 'react';

const SYNTHETIC_PANS = new Set(['SHARED', 'UNKNOWN']);

export default function CasMemberMerge({
  open, onClose, members, overrides, targetUserId, initialFromPan, onMerged,
}) {
  const [fromPan, setFromPan] = useState(initialFromPan || '');
  const [toPan, setToPan]     = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (open) {
      setFromPan(initialFromPan || '');
      setToPan('');
      setError('');
    }
  }, [open, initialFromPan]);

  if (!open) return null;

  const fromMember = members.find(m => m.pan === fromPan);
  const targetCandidates = members.filter(m => m.pan !== fromPan && !SYNTHETIC_PANS.has(m.pan));

  async function doMerge() {
    if (!fromMember || !toPan) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/cas/merge-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folioNos: fromMember.folioNos, targetPan: toPan, targetUserId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not save this merge.');
        setBusy(false);
        return;
      }
      setBusy(false);
      onMerged();
    } catch {
      setError('Could not save this merge. Please try again.');
      setBusy(false);
    }
  }

  async function undoOverride(folioNo) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/cas/merge-member', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folioNos: [folioNo], targetUserId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not undo this merge.');
        setBusy(false);
        return;
      }
      setBusy(false);
      onMerged();
    } catch {
      setError('Could not undo this merge. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="cmm-overlay" onClick={onClose}>
      <div className="cmm-panel" onClick={e => e.stopPropagation()}>
        <div className="cmm-head">
          <h3>Manage members</h3>
          <button className="cmm-close" onClick={onClose}>✕</button>
        </div>

        <div className="cmm-section">
          <div className="cmm-section-title">Merge a member into another</div>
          <p className="cmm-hint">
            Use this when the same investor shows up as two separate members —
            most often because one folio is missing its PAN. This moves ALL of
            that folio's holdings under the member you pick below.
          </p>
          <div className="cmm-merge-row">
            <select value={fromPan} onChange={e => setFromPan(e.target.value)}>
              <option value="">Merge which member…</option>
              {members.map(m => (
                <option key={m.pan} value={m.pan}>{m.name} ({m.folioNos.length} folio{m.folioNos.length === 1 ? '' : 's'})</option>
              ))}
            </select>
            <span>into</span>
            <select value={toPan} onChange={e => setToPan(e.target.value)} disabled={!fromPan}>
              <option value="">Pick target member…</option>
              {targetCandidates.map(m => (
                <option key={m.pan} value={m.pan}>{m.name}</option>
              ))}
            </select>
            <button onClick={doMerge} disabled={busy || !fromPan || !toPan}>
              {busy ? 'Merging…' : 'Merge'}
            </button>
          </div>
          {error && <div className="cmm-error">⚠ {error}</div>}
        </div>

        {overrides.length > 0 && (
          <div className="cmm-section">
            <div className="cmm-section-title">Active manual merges</div>
            <div className="cmm-override-list">
              {overrides.map(o => (
                <div key={o.folioNo} className="cmm-override-row">
                  <span>Folio {o.folioNo} → {o.targetName}</span>
                  <button onClick={() => undoOverride(o.folioNo)} disabled={busy}>Undo</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add minimal styling**

Read `app/globals.css`'s existing modal/overlay conventions first (search for `-overlay` and `-panel` class patterns already used, e.g. by whatever backs `RedemptionPlanner`'s own modal chrome) and add a `cmm-*` block matching that same visual language (overlay backdrop, centered panel, `var(--border)`/`var(--text)`/`var(--g1)` custom properties already used throughout this app — do not invent new colors). Keep it minimal: this is a utility panel, not a marketing surface.

- [ ] **Step 3: Verify**

Run `node --check` is not meaningful for a `.jsx` file with JSX syntax (confirmed elsewhere this session it silently no-ops) — instead run `npm run build` once after this task's file is in place, expecting it to still succeed even though nothing imports this component yet (an unused-but-valid file doesn't break the build).

- [ ] **Step 4: Commit**

```bash
git add components/CasMemberMerge.jsx app/globals.css
git commit -m "feat(cas-merge): add shared CasMemberMerge component"
```

---

### Task 5: Wire into `app/portfolio/page.jsx`

**Files:**
- Modify: `app/portfolio/page.jsx`

**Interfaces:**
- Consumes: `pickFolioResolutions` is NOT called directly here — this task calls `GET /api/cas/resolve-folios` over HTTP. `CasMemberMerge` from Task 4 (exact prop shape above).

Read the CURRENT full file before starting (it has been edited twice already this session — don't trust remembered line numbers). Locate:
- The `panMap`-building loop (currently has the `distinctValidPans`/`solePan` single-PAN auto-fix already shipped — search for `distinctValidPans`).
- The "VIEWING:" chip row (search for `pf-pan-chips`).

- [ ] **Step 1: Fetch resolutions for still-ambiguous folios and apply them**

In the `panMap`-building section, AFTER the existing `distinctValidPans`/`solePan` computation and BEFORE the `mergedFolios.forEach(folio => { ... const validPan = ... })` loop that builds `panMap`, insert a step that identifies folios still unresolved by the existing two tiers (own PAN, sole-PAN-in-statement) and fetches resolutions for them:

```js
            // Folios the existing tiers (own PAN, sole-PAN-in-statement)
            // can't resolve -- check manual overrides + the owner's other
            // saved statements before falling back to Shared. See
            // docs/superpowers/specs/2026-08-18-cas-member-merge-design.md.
            const stillAmbiguousFolios = [];
            mergedFolios.forEach(folio => {
              const pan = (folio.PAN || '').toUpperCase().trim();
              if (pan.length === 10 && PAN_RE.test(pan)) return; // own PAN, fine
              if (solePan) return; // already resolved by the sole-PAN heuristic
              const baseFolioNo = (folio.folio || '').split('/')[0].trim();
              if (baseFolioNo) stillAmbiguousFolios.push(baseFolioNo);
            });

            let externalResolutions = {};
            if (stillAmbiguousFolios.length) {
              try {
                const targetQS2 = isViewingOther ? `&targetUserId=${encodeURIComponent(viewUserId)}` : '';
                // Any one of this statement's own blob keys works as excludeBlobKey
                // here -- resolve-folios only uses it to skip THIS upload when
                // scanning the owner's other saved statements, and every
                // ambiguous folio in stillAmbiguousFolios came from files
                // already loaded into mergedFolios, so excluding any single one
                // of them is enough to avoid a statement resolving against itself.
                const anyBlobKey = ports[0]?.blob_key || '';
                const res = await fetch(
                  `/api/cas/resolve-folios?folios=${encodeURIComponent(stillAmbiguousFolios.join(','))}&excludeBlobKey=${encodeURIComponent(anyBlobKey)}${targetQS2}`
                );
                if (res.ok) {
                  const body = await res.json();
                  externalResolutions = body.resolutions || {};
                }
              } catch { /* non-fatal -- these folios simply stay Shared for now */ }
            }
```

- [ ] **Step 2: Use `externalResolutions` in the `validPan` computation**

Find the existing line (from the already-shipped single-PAN fix):
```js
              const validPan = pan.length === 10 && PAN_RE.test(pan) ? pan : (solePan || 'SHARED');
```
Replace with:
```js
              const baseFolioNo = (folio.folio || '').split('/')[0].trim();
              const validPan = pan.length === 10 && PAN_RE.test(pan)
                ? pan
                : (solePan || externalResolutions[baseFolioNo]?.pan || 'SHARED');
```
(If a `baseFolioNo` constant already exists at this exact point in the loop for the `folioTransmission` lookup slightly above it, reuse that existing variable instead of redeclaring it — read the surrounding code to confirm before editing, since redeclaring a `const` with the same name in the same scope is a syntax error.)

- [ ] **Step 3: Track folio numbers and build the `members`/`overrides` props for the merge component**

Each `panMap[validPan]` entry needs a `folioNos` list for the merge component. Find where `panMap[validPan]` is initialized (the `if (!panMap[validPan]) { panMap[validPan] = { pan: validPan, name: ..., current: 0, invested: 0, holdings: [] }; }` block) and add `folioNos: []`. Then, in the same per-folio loop (not per-scheme — once per folio, not once per scheme within it), push: `panMap[validPan].folioNos.push(baseFolioNo);` — place this once per folio iteration, guarding against duplicates from multiple schemes in the same folio with `if (!panMap[validPan].folioNos.includes(baseFolioNo)) panMap[validPan].folioNos.push(baseFolioNo);`.

Add new state near the other portfolio-page state declarations (`useState` calls around line 310-335):
```js
  const [mergeOpen, setMergeOpen]           = useState(false);
  const [mergeFromPan, setMergeFromPan]     = useState('');
  const [activeOverrides, setActiveOverrides] = useState([]); // populated in Step 4
  const [refreshKey, setRefreshKey]         = useState(0); // already exists -- confirm before adding
```
(`refreshKey` already exists per the file's existing `useEffect` dependency array at the end of `loadAll`'s effect — read the file to confirm; if it exists, don't redeclare it, just reuse it to trigger a re-run of `loadAll` after a merge via `setRefreshKey(k => k + 1)`.)

- [ ] **Step 4: Populate `activeOverrides` for the Undo list**

After `setPanPortfolios(panMap)` (in the same block where totals/topHoldings are set), also derive and set the active overrides list from `externalResolutions` filtered to `source === 'manual'`:
```js
            setActiveOverrides(
              Object.entries(externalResolutions)
                .filter(([, r]) => r.source === 'manual')
                .map(([folioNo, r]) => ({
                  folioNo, pan: r.pan,
                  targetName: panMap[r.pan]?.name || r.pan,
                  updatedBy: '', updatedAt: '',
                }))
            );
```

- [ ] **Step 5: Mount the merge UI**

In the "VIEWING:" chip row section (`pf-pan-selector`), add a small trigger next to each chip and a "Manage members" link, then mount the component once near the end of the component's JSX (sibling to other modals this page already renders — search for how `TransactionHistoryDrawer` or similar is conditionally mounted in this same file for the exact pattern):

```jsx
            {hasMultiPan && (
              <div className="pf-pan-selector">
                <span className="pf-pan-label">Viewing:</span>
                <div className="pf-pan-chips">
                  <button
                    className={`pf-pan-chip${activePan === 'all' ? ' active' : ''}`}
                    onClick={() => setActivePan('all')}
                  >
                    All members
                  </button>
                  {panKeys.map(pan => (
                    <button
                      key={pan}
                      className={`pf-pan-chip${activePan === pan ? ' active' : ''}`}
                      onClick={() => setActivePan(pan)}
                    >
                      {panPortfolios[pan].name}
                    </button>
                  ))}
                </div>
                <button
                  className="pf-text-btn"
                  onClick={() => { setMergeFromPan(''); setMergeOpen(true); }}
                >
                  Manage members
                </button>
              </div>
            )}
```

And near this page's other conditionally-rendered modals:
```jsx
      <CasMemberMerge
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        members={panKeys.map(pan => ({ pan, name: panPortfolios[pan].name, folioNos: panPortfolios[pan].folioNos || [] }))}
        overrides={activeOverrides}
        targetUserId={isViewingOther ? viewUserId : undefined}
        initialFromPan={mergeFromPan}
        onMerged={() => { setMergeOpen(false); setRefreshKey(k => k + 1); }}
      />
```

Add the import near this file's other component imports: `import CasMemberMerge from '@/components/CasMemberMerge';`

- [ ] **Step 6: Verify**

Run `npm run build` — must succeed. Manually verify (dev server, `npm run dev`): open `/portfolio` for an account with a multi-member CAS, confirm "Manage members" opens the panel, merging a member folds its holdings into the target (chip count updates, target's current/invested totals increase), and Undo reverts it.

- [ ] **Step 7: Commit**

```bash
git add app/portfolio/page.jsx
git commit -m "feat(cas-merge): wire member-merge resolution and UI into the portfolio page"
```

---

### Task 6: Wire into `app/cas-tracker/page.js`

**Files:**
- Modify: `app/cas-tracker/page.js`

**Interfaces:**
- Consumes: same as Task 5 — `GET /api/cas/resolve-folios`, `CasMemberMerge` from Task 4.

Read the CURRENT full file before starting. Locate:
- `processCasData` (has the already-shipped `panList`/`isSinglePan`/`solePan` single-PAN auto-fix — search for `solePan`).
- The "VIEWING" pan-tabs row (search for `pan-tabs`, around where `realPanKeys`/`visiblePanKeys` are computed, and the existing `✎` rename button at `pan-tab-rename-btn`).

- [ ] **Step 1: Fetch resolutions for still-ambiguous folios inside `processCasData`**

Mirror Task 5 Step 1's shape, adapted to this file's variable names (`allPans`/`panList`/`solePan` instead of `distinctValidPans`). Insert this AFTER the existing `solePan` computation and BEFORE the `(data.folios || []).forEach(folio => { let rawPan = ... })` loop that builds `portfolioData`:

```js
    const stillAmbiguousFolios = [];
    (data.folios || []).forEach(folio => {
      const pan = (folio.PAN || '').toUpperCase().trim();
      if (pan.length === 10 && PAN_REGEX.test(pan)) return;
      if (solePan) return;
      const baseFolioNo = (folio.folio || '').split('/')[0].trim();
      if (baseFolioNo) stillAmbiguousFolios.push(baseFolioNo);
    });

    let externalResolutions = {};
    if (stillAmbiguousFolios.length) {
      try {
        const targetQS = effectiveTargetUserId ? `&targetUserId=${encodeURIComponent(effectiveTargetUserId)}` : '';
        // blobKeyForExclusion isn't available inside processCasData today --
        // add a new parameter (see Step 2) so callers can pass it through.
        const res = await fetch(
          `/api/cas/resolve-folios?folios=${encodeURIComponent(stillAmbiguousFolios.join(','))}&excludeBlobKey=${encodeURIComponent(blobKeyForExclusion || '')}${targetQS}`
        );
        if (res.ok) {
          const body = await res.json();
          externalResolutions = body.resolutions || {};
        }
      } catch { /* non-fatal */ }
    }
```

- [ ] **Step 2: Thread a `blobKeyForExclusion` parameter through `processCasData`**

`processCasData(data, cached, targetUserIdOverride)` doesn't currently receive the blob key of the statement being viewed. Find its signature and every call site (`loadSavedPortfolio`, the fresh-upload path, the admin `?load=` auto-open path — read the file to find all of them) and add a fourth parameter:

```js
  async function processCasData(data, cached, targetUserIdOverride, blobKeyForExclusion) {
```

At `loadSavedPortfolio(blobKey, targetUserIdOverride)`, pass it through: `await processCasData(data, false, targetUserIdOverride, blobKey);`. For the fresh-upload call site (a just-parsed, not-yet-saved statement has no blob key yet — pass `''`, which `resolve-folios` treats as "nothing to exclude," matching its behavior when `excludeBlobKey` is empty).

- [ ] **Step 3: Use `externalResolutions` in the `rawPan` computation**

Find the existing line (from the already-shipped single-PAN fix):
```js
      let rawPan = (folio.PAN || '').toUpperCase().trim();
      if (!rawPan || rawPan.length !== 10 || !PAN_REGEX.test(rawPan)) {
        rawPan = solePan || 'UNKNOWN';
      }
```
Replace with:
```js
      let rawPan = (folio.PAN || '').toUpperCase().trim();
      if (!rawPan || rawPan.length !== 10 || !PAN_REGEX.test(rawPan)) {
        const baseFolioNo = (folio.folio || '').split('/')[0].trim();
        rawPan = solePan || externalResolutions[baseFolioNo]?.pan || 'UNKNOWN';
      }
```

- [ ] **Step 4: Track folio numbers per PAN and the active-overrides list**

In the `portfolioData[rawPan]` initialization block, add `folioNos: []`. In the same per-folio loop, push the base folio number once per folio (guard against duplicates the same way as Task 5 Step 3). After the folios loop finishes (where `portfolioData` is otherwise complete, near where `panInvestorMap`/`globalName` resolution wraps up), derive and store the manual-override subset for the Undo list — add new state near this file's other `useState` calls (`editingPan`, `familyPans`, etc.):

```js
  const [mergeOpen, setMergeOpen]             = useState(false);
  const [mergeFromPan, setMergeFromPan]       = useState('');
  const [activeOverrides, setActiveOverrides] = useState([]);
```

and, inside `processCasData` after `portfolioData` is fully built:

```js
    setActiveOverrides(
      Object.entries(externalResolutions)
        .filter(([, r]) => r.source === 'manual')
        .map(([folioNo, r]) => ({
          folioNo, pan: r.pan,
          targetName: portfolioData[r.pan]?.investorName || r.pan,
          updatedBy: '', updatedAt: '',
        }))
    );
```

- [ ] **Step 5: Mount the merge UI**

In the pan-tabs section (near the existing `👨‍👩‍👧‍👦 All Family` button), add a "Manage members" trigger, and mount `<CasMemberMerge />` near where this file already conditionally renders its other modal-like components (search for how the existing PAN-rename UI's sibling elements are structured for placement):

```jsx
                <button
                  className="pan-tab-rename-btn"
                  title="Manage members (merge or undo)"
                  onClick={() => { setMergeFromPan(''); setMergeOpen(true); }}
                >
                  ⇄ Manage
                </button>
```

```jsx
      <CasMemberMerge
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        members={realPanKeys.map(pan => ({
          pan, name: portfolioDataByPan[pan].investorName, folioNos: portfolioDataByPan[pan].folioNos || [],
        }))}
        overrides={activeOverrides}
        targetUserId={(isAdmin && viewedUserId) ? viewedUserId : undefined}
        initialFromPan={mergeFromPan}
        onMerged={() => { setMergeOpen(false); /* re-run whichever load triggered the current view */ }}
      />
```

For `onMerged`, this page's exact re-fetch call depends on how the currently-viewed statement was loaded (`loadSavedPortfolio(blobKey)` for a saved one, or the fresh-parse path for a just-uploaded one) — read the surrounding code to call back into whichever of those two paths produced the CURRENT view, passing the same arguments it was originally called with (store the most recent load's blob key /fresh-data in a ref or state if not already available, so `onMerged` can re-invoke it without the user re-selecting the file).

Add the import near this file's other component imports: `import CasMemberMerge from '@/components/CasMemberMerge';`

- [ ] **Step 6: Verify**

Run `npm run build` — must succeed. Manually verify (dev server): open CAS Tracker, load the kaushal.iitr@gmail.com multi-member view (or any multi-PAN CAS with a Shared/Unknown bucket), confirm "⇄ Manage" opens the panel, merging folds holdings correctly, Undo reverts, and re-check that the same merge is now ALSO reflected on `/portfolio` for the same account (since both pages call the same `resolve-folios` endpoint and see the same `folio_pan_overrides` rows).

- [ ] **Step 7: Commit**

```bash
git add app/cas-tracker/page.js
git commit -m "feat(cas-merge): wire member-merge resolution and UI into CAS Tracker"
```

---

## Self-Review Notes

- **Spec coverage**: Data model (Task 1), all three API endpoints (Tasks 2-3), resolution order steps 1-5 (Tasks 5-6, steps 1-3 of each), UI chip action + Manage panel (Task 4-6), error handling (403 on unauthorized target PAN — Task 3; conflicting-history omission — Task 2's `pickFolioResolutions`; no-op undo — Task 3's `DELETE`) are all covered.
- **Authorization deviation flagged explicitly** in Global Constraints and repeated in Task 2/3's file headers, since it deviates from the naive "just copy pan-name" instruction given during dispatch — `canManageUser` is used instead of `resolveOwnerId` specifically so distributor-role access (already supported by `app/portfolio/page.jsx`'s existing `canViewOthers`) actually works for this feature, matching the approved spec.
- **Type/shape consistency**: `{ [folioNo]: { pan, source } }` is the exact shape returned by both `pickFolioResolutions` (Task 2) and threaded through Tasks 5-6's `externalResolutions` usage. `members`/`overrides` prop shapes in Task 4 match exactly what Tasks 5 and 6 construct and pass in.
- Task 6 has more inherent uncertainty than Task 5 around exact re-fetch wiring for `onMerged` (this file's load paths are more varied — saved vs. fresh-upload vs. admin auto-open) — flagged explicitly in Step 5 rather than papered over with a placeholder, since the implementer needs to read the current file to get this right.
