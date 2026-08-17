# Per-User Rate Limiter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop scripted enumeration abuse against this app's parameterized-cache-key lookup routes, without requiring sign-in on routes that are deliberately public.

**Architecture:** A single Postgres-backed two-tier counter (`lib/rateLimit.js`, reusing `lib/db.js`'s pool) checked at the top of each of three routes, keyed by **signed-in user ID** where a route already requires auth, or by **request IP** where it deliberately doesn't (see the mid-planning scope correction below). One shared pure message-formatting function bridges both this app's route styles (App Router `Response.json` and the one remaining Pages Router `(req,res)` handler).

**Tech Stack:** Next.js App Router + one Pages Router API route (Node runtime), Postgres (`lib/db.js`'s existing pool), plain Node + `assert` tests.

## Global Constraints — including one correction made during planning

- **Scope correction, confirmed with the user during planning:** the design spec assumed all three target routes require a signed-in session. Reading them in full during this planning pass showed that's only true for `app/api/distributor/route.js`. `pages/api/mf.js` and `app/api/proposal-studio/holdings/route.js` are **deliberately public** — the former very likely backs the public MF Calculator homepage, the latter explicitly serves public share-link viewers who never sign in (per its own header comment). Resolution (user-approved): key the counter on **`user:<id>`** for the authenticated route, and on **`ip:<address>`** for the two public ones — same table, same mechanism, different key. This supersedes the spec's "Out of scope: IP-based limiting" line for exactly these two routes; the spec's IP-limiting exclusion still holds everywhere else.
- Two tiers per (subject, route): **100 requests / 10 minutes** (burst) and **1,500 requests / day** (sustained). A request is limited if it exceeds either tier.
- `app/api/distributor/route.js` only: skip the check entirely when `session.user.role` is `'admin'` or `'distributor'`. The two IP-keyed routes have no equivalent exemption (see Task 3/4's notes on why).
- 429 response: a specific, directly-displayable message including a retry estimate and a support-contact line — never a bare generic failure.
- No new external service — everything runs through the existing Postgres pool (`lib/db.js`).
- Test convention: plain Node + `assert`, `node tests/<file>.test.js`, no framework, matching `tests/amfiDistributor.test.js`'s dynamic-`import()` pattern for an ES-module `lib/` file.

---

## File Structure

- **Create** `lib/rateLimit.js` — `checkRateLimit`, `formatRetryLabel`, `rateLimitMessage`, `rateLimitResponse` (App Router), `getClientIp` (App Router `Request`), `getClientIpFromNodeReq` (Pages Router `req`).
- **Create** `tests/rateLimit.test.js` — unit tests for the pure/mockable pieces above.
- **Modify** `scripts/schema.sql` — new `rate_limit_counters` table.
- **Modify** `app/api/distributor/route.js` — user-keyed check, admin/distributor exempt.
- **Modify** `app/api/proposal-studio/holdings/route.js` — IP-keyed check.
- **Modify** `pages/api/mf.js` — IP-keyed check, `?code=` paths only (not `?q=` search or `?codes=` batch — the design spec named `?code=` specifically as the per-parameter-cache-miss risk; the other two shapes are out of scope, not silently expanded into).
- **Modify** `scripts/send_lifecycle_emails.mjs` — daily cleanup of old counter rows.

---

### Task 1: `lib/rateLimit.js` — the shared limiter

**Files:**
- Create: `lib/rateLimit.js`
- Create: `tests/rateLimit.test.js`
- Modify: `scripts/schema.sql`

**Interfaces:**
- Produces: `checkRateLimit(subjectKey: string, routeKey: string, tiers?): Promise<{limited: false} | {limited: true, retryAfterSeconds: number}>`; `formatRetryLabel(retryAfterSeconds: number): string`; `rateLimitMessage(retryAfterSeconds: number): string`; `rateLimitResponse({retryAfterSeconds}): Response`; `getClientIp(request: Request): string`; `getClientIpFromNodeReq(req): string`; `DEFAULT_TIERS`. `subjectKey` convention: `` `user:${id}` `` or `` `ip:${address}` ``, established by this task, consumed by Tasks 2-4.

- [ ] **Step 1: Add the table to `scripts/schema.sql`**

Add this new section at the end of `scripts/schema.sql` (after the existing `lifecycle_emails_sent` table definition, following the file's own established style of a section-header comment followed by the `CREATE TABLE IF NOT EXISTS`):

```sql
-- ── Rate limiting ────────────────────────────────────────────────────────────
-- Two-tier (burst + sustained) per-subject-per-route counter, checked by
-- lib/rateLimit.js. subject_key is 'user:<id>' for a route that already
-- requires a signed-in session, or 'ip:<address>' for a route that's
-- deliberately public (see docs/superpowers/specs/2026-08-17-per-user-rate-limiter-design.md
-- and that spec's mid-planning scope correction in
-- docs/superpowers/plans/2026-08-17-per-user-rate-limiter.md). window_secs
-- distinguishes the two tiers (600 = 10-minute burst, 86400 = 1-day
-- sustained) so both share one table. Old rows are swept out daily by
-- scripts/send_lifecycle_emails.mjs.
CREATE TABLE IF NOT EXISTS rate_limit_counters (
  subject_key  TEXT        NOT NULL,
  route_key    TEXT        NOT NULL,
  window_secs  INT         NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count        INT         NOT NULL DEFAULT 1,
  PRIMARY KEY (subject_key, route_key, window_secs, window_start)
);
```

- [ ] **Step 2: Write the failing tests**

Create `tests/rateLimit.test.js`:

```js
// tests/rateLimit.test.js
//
// Unit tests for lib/rateLimit.js. checkRateLimit is tested against a
// mocked pool.query (via a hand-rolled fake db.js module isn't practical
// here since lib/rateLimit.js imports lib/db.js's default export directly
// -- instead these tests exercise the pure formatting functions in full,
// and checkRateLimit's logic is exercised indirectly through a minimal
// in-memory fake pool passed nowhere -- see the note on checkRateLimit's
// own test below for how this is handled without a mocking framework.
// lib/rateLimit.js uses ES module import/export syntax, and this
// project's package.json has no "type": "module", so plain require()
// cannot load it -- use dynamic import(), same as tests/amfiDistributor.test.js.
// Run with: node tests/rateLimit.test.js

const assert = require('assert');
const Module = require('module');

(async () => {
  // lib/rateLimit.js imports lib/db.js (a real pg.Pool connecting via
  // POSTGRES_URL) purely so checkRateLimit can call pool.query -- that's
  // the one piece genuinely worth mocking, since this test must run with
  // no real database available. Intercept the module resolution for
  // '../lib/db.js' (as seen from lib/rateLimit.js) before importing
  // rateLimit.js, swapping in a fake pool whose query() returns a
  // scripted sequence of { rows: [{ count }] } results.
  const dbPath = require.resolve('../lib/db.js');
  const fakePoolState = { queries: [], responses: [] };
  const fakePool = {
    query: async (sql, params) => {
      fakePoolState.queries.push({ sql, params });
      const next = fakePoolState.responses.shift();
      return next ?? { rows: [{ count: 1 }] };
    },
  };
  require.cache[dbPath] = {
    id: dbPath, filename: dbPath, loaded: true, exports: fakePool,
  };

  const { checkRateLimit, formatRetryLabel, rateLimitMessage, DEFAULT_TIERS } = await import('../lib/rateLimit.js');

  console.log('=== Running rateLimit Unit Tests ===\n');

  let passed = 0;
  let failed = 0;

  function test(name, fn) {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (e) {
      console.error(`✗ ${name}`);
      console.error(`  Error: ${e.message}`);
      failed++;
    }
  }

  async function asyncTest(name, fn) {
    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (e) {
      console.error(`✗ ${name}`);
      console.error(`  Error: ${e.message}`);
      failed++;
    }
  }

  // ── formatRetryLabel / rateLimitMessage ──────────────────────────────
  test('formatRetryLabel: under a minute rounds up to 1 minute', () => {
    assert.strictEqual(formatRetryLabel(59), '1 minute');
  });

  test('formatRetryLabel: exactly 61 seconds is 2 minutes', () => {
    assert.strictEqual(formatRetryLabel(61), '2 minutes');
  });

  test('formatRetryLabel: just under an hour is in minutes', () => {
    assert.strictEqual(formatRetryLabel(3599), '60 minutes');
  });

  test('formatRetryLabel: at or over an hour switches to hours', () => {
    assert.strictEqual(formatRetryLabel(3601), '1 hour');
  });

  test('formatRetryLabel: several hours pluralizes correctly', () => {
    assert.strictEqual(formatRetryLabel(7261), '2 hours');
  });

  test('rateLimitMessage includes the retry label and a support contact', () => {
    const msg = rateLimitMessage(120);
    assert.ok(msg.includes('2 minutes'), 'should include the formatted retry label');
    assert.ok(msg.includes('contact@getabundance.in'), 'should include a support contact');
  });

  // ── checkRateLimit ────────────────────────────────────────────────────
  await asyncTest('checkRateLimit returns not-limited when both tiers are under their limit', async () => {
    fakePoolState.responses = [{ rows: [{ count: 5 }] }, { rows: [{ count: 5 }] }];
    const result = await checkRateLimit('user:test1', 'test-route', [
      { windowSeconds: 600, limit: 100 },
      { windowSeconds: 86400, limit: 1500 },
    ]);
    assert.deepStrictEqual(result, { limited: false });
    assert.strictEqual(fakePoolState.queries.length, 2, 'should have checked both tiers');
  });

  await asyncTest('checkRateLimit stops at the first tier exceeded and does not check the second', async () => {
    fakePoolState.queries = [];
    fakePoolState.responses = [{ rows: [{ count: 101 }] }];
    const result = await checkRateLimit('user:test2', 'test-route', [
      { windowSeconds: 600, limit: 100 },
      { windowSeconds: 86400, limit: 1500 },
    ]);
    assert.strictEqual(result.limited, true);
    assert.strictEqual(typeof result.retryAfterSeconds, 'number');
    assert.strictEqual(fakePoolState.queries.length, 1, 'should not query the second tier once the first is already over');
  });

  test('checkRateLimit is not limited at exactly the boundary (count === limit)', async () => {
    fakePoolState.queries = [];
    fakePoolState.responses = [{ rows: [{ count: 100 }] }, { rows: [{ count: 1500 }] }];
    const result = await checkRateLimit('user:test3', 'test-route');
    assert.deepStrictEqual(result, { limited: false });
  });

  test('DEFAULT_TIERS matches the documented burst + sustained shape', () => {
    assert.deepStrictEqual(DEFAULT_TIERS, [
      { windowSeconds: 600, limit: 100 },
      { windowSeconds: 86400, limit: 1500 },
    ]);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `node tests/rateLimit.test.js`
Expected: fails immediately with a module-not-found error (`lib/rateLimit.js` doesn't exist yet).

- [ ] **Step 4: Write the implementation**

Create `lib/rateLimit.js`:

```js
/**
 * lib/rateLimit.js
 *
 * Two-tier (burst + sustained), Postgres-backed rate limiter shared by
 * every protected route. Reuses lib/db.js's existing pool -- no new
 * service. See docs/superpowers/specs/2026-08-17-per-user-rate-limiter-design.md.
 *
 * subjectKey convention: 'user:<id>' for a route that already requires a
 * signed-in session, 'ip:<address>' for a route that's deliberately
 * public (see the plan doc's mid-planning scope correction for why both
 * exist).
 */

import pool from '@/lib/db';

export const DEFAULT_TIERS = [
  { windowSeconds: 600,   limit: 100 },   // burst
  { windowSeconds: 86400, limit: 1500 },  // sustained
];

// Atomically increments the counter for each tier in order and returns the
// FIRST tier exceeded (stopping there -- a caller already over the burst
// tier doesn't also need the sustained tier checked), or { limited: false }
// if neither tier is over. Call AFTER any auth() check and BEFORE any
// external fetch or heavy DB work in the route.
export async function checkRateLimit(subjectKey, routeKey, tiers = DEFAULT_TIERS) {
  for (const { windowSeconds, limit } of tiers) {
    const windowStart = new Date(Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000);
    const { rows } = await pool.query(
      `INSERT INTO rate_limit_counters (subject_key, route_key, window_secs, window_start, count)
       VALUES ($1, $2, $3, $4, 1)
       ON CONFLICT (subject_key, route_key, window_secs, window_start)
       DO UPDATE SET count = rate_limit_counters.count + 1
       RETURNING count`,
      [subjectKey, routeKey, windowSeconds, windowStart]
    );
    if (rows[0].count > limit) {
      const retryAfterSeconds = Math.ceil((windowStart.getTime() + windowSeconds * 1000 - Date.now()) / 1000);
      return { limited: true, retryAfterSeconds };
    }
  }
  return { limited: false };
}

// Pure formatting -- shared by both this app's route styles (App Router's
// rateLimitResponse() below returns a Fetch API Response; the one Pages
// Router route, pages/api/mf.js, uses its own (req,res)-style error
// helper and calls rateLimitMessage() directly instead).
export function formatRetryLabel(retryAfterSeconds) {
  const mins = Math.ceil(retryAfterSeconds / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'}`;
  const hours = Math.ceil(mins / 60);
  return `${hours} hour${hours === 1 ? '' : 's'}`;
}

export function rateLimitMessage(retryAfterSeconds) {
  return `You're doing that too fast — try again in ${formatRetryLabel(retryAfterSeconds)}. If this seems wrong, contact support at contact@getabundance.in.`;
}

// App Router (Fetch API Response) helper.
export function rateLimitResponse({ retryAfterSeconds }) {
  return Response.json(
    { error: rateLimitMessage(retryAfterSeconds), retryAfterSeconds },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

// Best-effort real client IP from a Fetch API Request (App Router).
// Vercel's edge network sets x-forwarded-for to the true client IP as the
// first entry in a possibly-comma-separated list.
export function getClientIp(request) {
  const fwd = request.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'unknown';
}

// Same, for a Pages Router (req, res) handler's Node-style request object.
export function getClientIpFromNodeReq(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return (Array.isArray(fwd) ? fwd[0] : fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node tests/rateLimit.test.js`
Expected: `10 passed, 0 failed`

- [ ] **Step 6: Commit**

```bash
git add lib/rateLimit.js tests/rateLimit.test.js scripts/schema.sql
git commit -m "feat(rate-limit): add shared two-tier Postgres-backed rate limiter"
```

---

### Task 2: Wire into `app/api/distributor/route.js` (user-keyed)

**Files:**
- Modify: `app/api/distributor/route.js` (whole file is 102 lines; auth check at lines 49-52)

**Interfaces:**
- Consumes: `checkRateLimit`, `rateLimitResponse` from `lib/rateLimit.js` (Task 1).

- [ ] **Step 1: Add the check right after the existing auth check**

Add the import alongside the file's existing imports (after `import { extractArnDigits, fetchDistributorByArn } from '@/lib/amfiDistributor';`):

```js
import { checkRateLimit, rateLimitResponse } from '@/lib/rateLimit';
```

Change:

```js
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
```

to:

```js
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 });
  }

  // Skip for the app owner's own staff -- the abuse concern is outside
  // users, not trusted admin/distributor accounts doing their own work.
  if (session.user.role !== 'admin' && session.user.role !== 'distributor') {
    const rl = await checkRateLimit(`user:${session.user.id}`, 'distributor-lookup');
    if (rl.limited) return rateLimitResponse(rl);
  }

  const { searchParams } = new URL(req.url);
```

- [ ] **Step 2: Manual verification**

With `npm run dev` running and signed in as a `client`-role test account (not admin/distributor), script more than 100 requests to `/api/distributor?arn=251838` within 10 minutes and confirm a `429` lands with the expected message and a `Retry-After` header. Repeat signed in as an admin account and confirm it's never limited under the same load.

- [ ] **Step 3: Commit**

```bash
git add app/api/distributor/route.js
git commit -m "feat(rate-limit): protect /api/distributor, exempting admin/distributor"
```

---

### Task 3: Wire into `app/api/proposal-studio/holdings/route.js` (IP-keyed)

**Files:**
- Modify: `app/api/proposal-studio/holdings/route.js` (whole file is 38 lines)

**Interfaces:**
- Consumes: `checkRateLimit`, `rateLimitResponse`, `getClientIp` from `lib/rateLimit.js` (Task 1).

- [ ] **Step 1: Add the IP-keyed check**

This route has no session at all in the common case (public share-link viewers) — there is no admin/distributor exemption to apply here; every caller, including the route's own owner using their own editor, is IP-keyed identically. This is an accepted simplification (see this plan's Self-Review Notes) rather than adding session-detection complexity for a route that's public by design.

Change:

```js
import { getHoldingsData } from '@/lib/holdingsLookup';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const amfiCode = searchParams.get('amfiCode');
  const schemeName = searchParams.get('schemeName');

  if (!amfiCode || !schemeName) {
    return Response.json({ error: 'amfiCode and schemeName are required' }, { status: 400 });
  }

  try {
```

to:

```js
import { getHoldingsData } from '@/lib/holdingsLookup';
import { checkRateLimit, rateLimitResponse, getClientIp } from '@/lib/rateLimit';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const amfiCode = searchParams.get('amfiCode');
  const schemeName = searchParams.get('schemeName');

  if (!amfiCode || !schemeName) {
    return Response.json({ error: 'amfiCode and schemeName are required' }, { status: 400 });
  }

  // Public, unauthenticated route (see the file header comment) -- keyed
  // by IP rather than a user id, since there's often no signed-in user at
  // all (a share-link viewer). See
  // docs/superpowers/plans/2026-08-17-per-user-rate-limiter.md's
  // mid-planning scope correction for why this route differs from
  // app/api/distributor/route.js's user-keyed check.
  const ip = getClientIp(request);
  const rl = await checkRateLimit(`ip:${ip}`, 'proposal-holdings-lookup');
  if (rl.limited) return rateLimitResponse(rl);

  try {
```

- [ ] **Step 2: Manual verification**

With `npm run dev` running, script more than 100 requests to `/api/proposal-studio/holdings?amfiCode=118955&schemeName=Test` (any valid-looking params — the rate check runs before the actual lookup) within 10 minutes, all from the same machine (same IP), and confirm a `429` lands with the expected message.

- [ ] **Step 3: Commit**

```bash
git add app/api/proposal-studio/holdings/route.js
git commit -m "feat(rate-limit): protect /api/proposal-studio/holdings by IP"
```

---

### Task 4: Wire into `pages/api/mf.js` (IP-keyed, `?code=` paths only)

**Files:**
- Modify: `pages/api/mf.js` (whole file is 424 lines; handler starts at line 241, the `?codes=` batch block at 253, `?q=` search at 289, `?code=&latest=1` at 337, `?code=` full history at 362)

**Interfaces:**
- Consumes: `checkRateLimit`, `rateLimitMessage`, `getClientIpFromNodeReq` from `lib/rateLimit.js` (Task 1). Uses `rateLimitMessage` (not `rateLimitResponse`, which returns an App-Router `Response` object incompatible with this Pages Router route's `(req, res)` handler) alongside the file's own existing `sendError` helper.

- [ ] **Step 1: Add the import**

At the top of `pages/api/mf.js`, change:

```js
import { r2Get } from '../../lib/r2';
```

to:

```js
import { r2Get } from '../../lib/r2';
import { checkRateLimit, rateLimitMessage, getClientIpFromNodeReq } from '../../lib/rateLimit';
```

- [ ] **Step 2: Add one check covering both `?code=` paths**

Both the "latest NAV only" (`if (code && latest)`) and "full NAV history" (`if (code)`) blocks are keyed by the same `code` parameter and share the same per-scheme-code cache-miss risk the design spec identified — one check covers both rather than duplicating it. `?q=` search and `?codes=` batch are explicitly out of scope (see this plan's File Structure section) and must not be touched.

Change:

```js
  // ── LATEST NAV only ──
  if (code && latest) {
```

to:

```js
  // ── Rate limit: any ?code= lookup (latest-only or full history) is the
  // per-scheme-code cache-miss risk this route's design spec identified.
  // ?q= search and ?codes= batch are explicitly out of scope -- see
  // docs/superpowers/plans/2026-08-17-per-user-rate-limiter.md's File
  // Structure section. No session exists on this route in the common
  // case, so this is IP-keyed like app/api/proposal-studio/holdings/route.js. ──
  if (code) {
    const ip = getClientIpFromNodeReq(req);
    const rl = await checkRateLimit(`ip:${ip}`, 'mf-code-lookup');
    if (rl.limited) {
      res.setHeader('Retry-After', String(rl.retryAfterSeconds));
      return sendError(res, 429, rateLimitMessage(rl.retryAfterSeconds), 'RATE_LIMITED');
    }
  }

  // ── LATEST NAV only ──
  if (code && latest) {
```

- [ ] **Step 3: Manual verification**

With `npm run dev` running, script more than 100 requests to `/api/mf?code=119551` within 10 minutes from the same machine and confirm a `429` with the expected message and `errorCode: 'RATE_LIMITED'`. Then confirm `/api/mf?q=hdfc` (search) and `/api/mf?codes=119551,120503&latest=1` (batch) are both completely unaffected even after the `?code=` limit has been tripped — they must keep working normally, since they were deliberately left out of scope.

- [ ] **Step 4: Commit**

```bash
git add pages/api/mf.js
git commit -m "feat(rate-limit): protect /api/mf's ?code= lookups by IP"
```

---

### Task 5: Daily cleanup

**Files:**
- Modify: `scripts/send_lifecycle_emails.mjs` (whole file is 166 lines as of this plan's writing; anchor point is the line immediately before `await pool.end();` in `main()` — re-read the file's actual current state before editing, since sub-project 1's plan, if it has already executed, adds a block in this same location and this task's diff must not silently overwrite or duplicate it)

**Interfaces:**
- None — this task only adds a `DELETE` statement; it doesn't produce anything another task consumes.

- [ ] **Step 1: Read the current file and find the anchor**

Open `scripts/send_lifecycle_emails.mjs` and find the line `await pool.end();` inside `main()`. Whatever code immediately precedes it (whether that's still the original `console.log('[lifecycle] done — nudge: ...')` line, or an already-updated version from sub-project 1's Task 5 that also mentions `trial_ended`), the new cleanup block goes immediately **before** `await pool.end();`, after whatever the last existing block's closing is — do not remove or alter any existing block.

- [ ] **Step 2: Add the cleanup block**

Insert immediately before `await pool.end();`:

```js
  // ── Rate-limit counter cleanup: both tiers (10-minute, 1-day) are
  // irrelevant after 2 days -- keeps rate_limit_counters from growing
  // unbounded. See docs/superpowers/specs/2026-08-17-per-user-rate-limiter-design.md. ──
  const { rowCount: cleanedCount } = await pool.query(
    `DELETE FROM rate_limit_counters WHERE window_start < NOW() - INTERVAL '2 days'`
  );
  console.log(`[lifecycle] rate_limit_counters cleanup: ${cleanedCount} old row(s) deleted`);
```

- [ ] **Step 3: Manual verification**

Against a local/test database with `POSTGRES_URL` set, insert a test row into `rate_limit_counters` with a `window_start` several days in the past, run `node scripts/send_lifecycle_emails.mjs`, and confirm the console reports at least 1 row deleted and the row is actually gone afterward.

- [ ] **Step 4: Commit**

```bash
git add scripts/send_lifecycle_emails.mjs
git commit -m "feat(rate-limit): clean up old rate_limit_counters rows in the daily cron"
```

---

## Self-Review Notes

- **Spec coverage:** shared limiter + table (Task 1) ✓, the confirmed authenticated route (Task 2) ✓, the two confirmed public routes now IP-keyed per the mid-planning correction (Tasks 3-4) ✓, cleanup (Task 5) ✓. The five not-yet-audited candidate routes the spec flagged (`fund-detail/[code]`, `sif-detail/[id]`, `sector-detail`, `sif-history`, `stress-test`) remain explicitly out of scope for this plan, unchanged from the spec.
- **Major deviation from the spec, user-approved during planning:** the spec's schema used `user_id` as the counter table's key column, assuming every target route has one. Two of three don't. This plan renames it to `subject_key` (`'user:<id>'` or `'ip:<address>'`) — same mechanism, generalized key. The spec's "Out of scope: IP-based limiting" line is superseded for exactly `pages/api/mf.js` and `app/api/proposal-studio/holdings/route.js`; it still holds everywhere else (nothing else in this plan uses IP-keying).
- **Client-side 429 handling:** the spec left this as "a per-call-site implementation detail... not an architectural decision," and this plan doesn't add a dedicated task for it. No shared fetch-wrapper utility exists anywhere in this codebase (confirmed during planning) — auditing and updating every caller of `/api/mf`, `/api/proposal-studio/holdings`, and `/api/distributor` individually would be a large, poorly-bounded task far beyond what was scoped. The 429 response's `error` field is a complete, directly-displayable sentence, so any caller already following this codebase's common `if (!res.ok) throw new Error(d.error)` pattern (used pervasively elsewhere in this app) surfaces it reasonably well with zero additional changes. Revisit as a separate, explicitly-scoped follow-up if a specific caller's handling turns out to be worse than that.
- **Accepted simplification:** `app/api/proposal-studio/holdings/route.js` and `pages/api/mf.js` have no admin/distributor exemption (unlike Task 2's user-keyed route) — both are IP-keyed with no reliable session to check in the common anonymous case, and adding "check for an optional session, exempt if admin" purely for the rare case the app owner is signed in while hitting a public route was judged not worth the added complexity. If this proves annoying in practice (e.g. during heavy manual testing), it's a small, isolated follow-up.
- **Type consistency:** `subjectKey` string format (`'user:<id>'` / `'ip:<address>'`) is produced identically by Tasks 2/3/4 and consumed identically by Task 1's `checkRateLimit` — no other shape is introduced.
