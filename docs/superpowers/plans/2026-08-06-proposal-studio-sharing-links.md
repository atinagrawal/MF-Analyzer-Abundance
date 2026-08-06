# Proposal Studio Shareable Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a distributor share a saved Proposal Studio proposal via a public, no-login-required link, and optionally email that link to the client — following `docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md` exactly.

**Architecture:** One new nullable `share_token` column on `proposals` gates a new public `GET /api/proposal-studio/shared/[token]` route. The existing fetch-holdings-then-compute-then-render pipeline inside `ProposalStudioTool` (currently embedded in `app/proposal-studio/ProposalStudioClient.jsx`) is extracted into a shared `app/proposal-studio/ProposalSections.jsx` module so a new read-only `ProposalReadOnlyView` component can reuse it verbatim. A new `ShareControls` widget (Share/Copy/Unshare/Send Email) is shared between the editor's own actions bar and a new owner-only `mine/[id]` page. Data is always recomputed live from each fund's current holdings — no frozen snapshot.

**Tech Stack:** Next.js 16 App Router, React 19, `pg` (Postgres), Cloudflare R2 (`lib/r2.js`), Resend (branded email, mirroring `auth.js`'s `buildEmail`), plain Node + `assert` tests (`node tests/<file>.test.js`).

## Global Constraints

- Never name the underlying holdings-data vendor in any user-facing text (existing site-wide rule).
- Reuse existing patterns: the CAS/proposals save-then-R2 pattern, `auth.js`'s branded-email pattern, the inline two-step delete-confirm pattern, the ownership-check shape used by `/api/proposal-studio/load` and `/delete`.
- Schema changes are applied manually by the project owner via the Vercel Dashboard → Storage → Query tab — no automated migration runner exists in this project.
- No new rate-limiting infrastructure — matches this app's existing security posture for other hard-to-guess-random-ID-gated resources.
- Share links use a dedicated random token in its own column — never the proposal's internal `id`.
- Editing a loaded proposal and saving always creates a new proposal (new `id`, unshared) — already true of `saveProposal()`; this design relies on that staying unchanged.
- Anonymous viewers see the full live-page view, read-only, including the Export/Print button.
- No auto-expiry — a share link is valid until manually revoked.
- Sending email: the sender types the recipient address each time, pre-filled from the proposal's saved client email if present but always editable and shown, never auto-sent silently.
- Data freshness is always live: both the editor and the public share link re-fetch each fund's current holdings and recompute everything fresh on every view. The R2-saved payload shape is unchanged by this feature.
- Pro-gating applies to *creating* new proposals only. Managing an *existing* saved proposal (view/edit/share/unshare/send-email) is gated on ownership alone, not current Pro plan status.
- This sandbox has no live DB/R2/Resend credentials — every task that touches those must say so plainly in its own testing section, never claim false coverage.

---

## File Structure

- **Modify** `scripts/schema.sql` — add `share_token` column + index.
- **Create** `lib/proposalShareToken.js` — token generation + idempotent ensure-token helper (CommonJS, matches `lib/portfolioAnalysis.js`/`lib/chartSvg.js`'s dual Node-test/Next-import style).
- **Create** `tests/proposalShareToken.test.js`
- **Create** `app/api/proposal-studio/share/route.js`
- **Create** `app/api/proposal-studio/unshare/route.js`
- **Create** `app/api/proposal-studio/shared/[token]/route.js` — public, no `auth()` call.
- **Create** `lib/proposalEmail.js` — branded share email + email-format validator (CommonJS).
- **Create** `tests/proposalEmail.test.js`
- **Create** `app/api/proposal-studio/send-email/route.js`
- **Modify** `app/api/proposal-studio/load/route.js` — small additive change: also select/return `share_token` so the owner page can show current share status without a second route.
- **Create** `app/proposal-studio/ProposalSections.jsx` — extracted shared pieces (`formatProposalId`, `useMCapIndex`, `InlineSvg`, `CollapsibleSection`, `fullSecurityExposure`, `exportProposalPDF`, `ExposureTable`, `SchemeDetailsTable`, `OverlapGrid`, `MCapTable`, `GrowthProjectionTable`, `ClosingSection`, `ProposalAnalysisBlock`).
- **Modify** `app/proposal-studio/ProposalStudioClient.jsx` — import from `ProposalSections.jsx` instead of defining these inline; delete the moved code.
- **Create** `app/proposal-studio/ShareControls.jsx` — Share/Copy/Unshare/Send-Email widget, reused by the editor and the owner page.
- **Create** `app/proposal-studio/ProposalReadOnlyView.jsx` — read-only rendering of a proposal (public + owner pages both use this).
- **Modify** `app/proposal-studio/ProposalStudioClient.jsx` (again, separate task) — wire `ShareControls` into `.pfc-actions`, add a "View" link to `SavedProposalsSection`, add `?load=<id>` auto-load-from-URL support.
- **Create** `app/proposal-studio/view/[token]/page.js` — public page.
- **Create** `app/proposal-studio/mine/[id]/page.js` — owner-only page.
- **Modify** `app/proposal-studio/proposal-studio.css` — new classes for read-only party cards, share controls, saved-list "View" link, not-found message (added incrementally, in the task that first uses each class).

---

### Task 1: Database schema — add `share_token` column

**Files:**
- Modify: `scripts/schema.sql:145-166`

**Interfaces:**
- Produces: `proposals.share_token` (nullable `TEXT UNIQUE`) and `idx_proposals_share_token`, which every later task in this plan depends on.

- [ ] **Step 1: Add the column and partial index**

Insert immediately after the existing `CREATE INDEX IF NOT EXISTS idx_proposals_user ON proposals(user_id);` line (currently line 166), before the `-- ====...` footer comment block:

```sql
-- Public share links (docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md).
-- NULL = not currently shared. A non-null value is a high-entropy random
-- token (lib/proposalShareToken.js), distinct from the proposal's own id,
-- generated only when sharing is turned on. UNIQUE so a token can never
-- collide across proposals; the partial index keeps the index small since
-- most rows will have share_token = NULL.
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_proposals_share_token ON proposals(share_token) WHERE share_token IS NOT NULL;
```

- [ ] **Step 2: Verify the file still parses as valid SQL**

There is no automated migration runner in this project (see the file's own header: "Run this ONCE in: Vercel Dashboard → Storage → your DB → Query tab"). Read the edited section back and confirm the `ALTER TABLE`/`CREATE INDEX` statements are syntactically well-formed and placed after the `proposals` table definition. This sandbox has no live DB — the statements cannot be executed here. **The user must run this SQL manually on the live database before any task in this plan that touches `share_token` can work in production** (Tasks 3, 4, 6, 7 and their consumers).

- [ ] **Step 3: Commit**

```bash
git add scripts/schema.sql
git commit -m "feat(proposal-studio): add share_token column for shareable links"
```

---

### Task 2: `lib/proposalShareToken.js` — token generation + idempotent ensure-token

**Files:**
- Create: `lib/proposalShareToken.js`
- Test: `tests/proposalShareToken.test.js`

**Interfaces:**
- Produces: `generateShareToken()` → string; `ensureShareToken(pool, id)` → `Promise<string>`. Both imported by Task 3 (`share`/`unshare` routes) and Task 6 (`send-email` route) as `import { generateShareToken, ensureShareToken } from '@/lib/proposalShareToken';`.

- [ ] **Step 1: Write the failing test**

Create `tests/proposalShareToken.test.js`:

```js
// tests/proposalShareToken.test.js
//
// Unit tests for lib/proposalShareToken.js's token generation and the
// idempotent ensure-token helper (using a lightweight fake pool instead of
// a live database).
// Run with: node tests/proposalShareToken.test.js

const assert = require('assert');
const { generateShareToken, ensureShareToken } = require('../lib/proposalShareToken');

console.log('=== Running Proposal Share Token Unit Tests ===\n');

let passed = 0;
let failed = 0;

async function test(name, fn) {
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

async function main() {
  await test('generateShareToken returns a non-empty base64url string', () => {
    const token = generateShareToken();
    assert.strictEqual(typeof token, 'string');
    assert.ok(token.length > 0);
    assert.ok(/^[A-Za-z0-9_-]+$/.test(token), `token contains non-base64url characters: ${token}`);
  });

  await test('generateShareToken returns a different value on each call', () => {
    const a = generateShareToken();
    const b = generateShareToken();
    assert.notStrictEqual(a, b);
  });

  await test('ensureShareToken returns the existing token without writing, if one is already set', async () => {
    const calls = [];
    const fakePool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.trim().startsWith('SELECT')) return { rows: [{ share_token: 'existing-token' }] };
        throw new Error('UPDATE should not have been called when a token already exists');
      },
    };
    const token = await ensureShareToken(fakePool, 'proposal-1');
    assert.strictEqual(token, 'existing-token');
    assert.strictEqual(calls.length, 1);
  });

  await test('ensureShareToken generates and persists a new token when none is set', async () => {
    const calls = [];
    const fakePool = {
      query: async (sql, params) => {
        calls.push({ sql, params });
        if (sql.trim().startsWith('SELECT')) return { rows: [{ share_token: null }] };
        if (sql.trim().startsWith('UPDATE')) return { rows: [] };
        throw new Error(`Unexpected query: ${sql}`);
      },
    };
    const token = await ensureShareToken(fakePool, 'proposal-2');
    assert.ok(/^[A-Za-z0-9_-]+$/.test(token));
    assert.strictEqual(calls.length, 2);
    assert.ok(calls[1].sql.trim().startsWith('UPDATE'));
    assert.deepStrictEqual(calls[1].params, [token, 'proposal-2']);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/proposalShareToken.test.js`
Expected: fails immediately with a module-not-found error (`lib/proposalShareToken.js` doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/proposalShareToken.js`:

```js
/**
 * lib/proposalShareToken.js
 *
 * Share-token generation for Proposal Studio's shareable links (see
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md).
 * A token is a high-entropy random string, distinct from a proposal's own
 * internal id, stored in proposals.share_token -- NULL means "not shared".
 *
 * CommonJS (module.exports), matching lib/portfolioAnalysis.js and
 * lib/chartSvg.js's dual-purpose style so this stays importable both via
 * Next's `import` (route files) and plain `node`/`require` (tests/*.test.js
 * runs with no framework or ESM loader configured).
 */

const { randomBytes } = require('crypto');

// ~192 bits of entropy, base64url so it's safe to drop straight into a URL
// path segment with no further encoding.
function generateShareToken() {
  return randomBytes(24).toString('base64url');
}

// Idempotent: an already-shared proposal keeps its existing token (re-
// clicking Share must never invalidate a link already sent out) rather than
// minting a new one every call. `pool` is passed in rather than imported
// directly so this stays testable with a lightweight fake pool instead of a
// live database -- see tests/proposalShareToken.test.js.
async function ensureShareToken(pool, id) {
  const existing = await pool.query(`SELECT share_token FROM proposals WHERE id = $1`, [id]);
  const currentToken = existing.rows[0]?.share_token;
  if (currentToken) return currentToken;

  const token = generateShareToken();
  await pool.query(`UPDATE proposals SET share_token = $1 WHERE id = $2`, [token, id]);
  return token;
}

module.exports = { generateShareToken, ensureShareToken };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/proposalShareToken.test.js`
Expected: `4 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add lib/proposalShareToken.js tests/proposalShareToken.test.js
git commit -m "feat(proposal-studio): add share-token generation helper"
```

---

### Task 3: Share & Unshare API routes

**Files:**
- Create: `app/api/proposal-studio/share/route.js`
- Create: `app/api/proposal-studio/unshare/route.js`

**Interfaces:**
- Consumes: `ensureShareToken(pool, id)` from Task 2; `pool` from `@/lib/db` (existing); `auth` from `@/auth` (existing).
- Produces: `POST /api/proposal-studio/share` → `{ ok: true, shareToken, shareUrl }`; `POST /api/proposal-studio/unshare` → `{ ok: true }`. Both consumed by `ShareControls.jsx` (Task 9).

- [ ] **Step 1: Write `share/route.js`**

```js
/**
 * app/api/proposal-studio/share/route.js
 *
 * POST /api/proposal-studio/share
 * Body (JSON): { id }
 *
 * Turns on public sharing for a saved proposal: generates (or reuses) a
 * random share token, stored in proposals.share_token, and returns the
 * public URL anyone can open without signing in
 * (/proposal-studio/view/[token], see
 * app/api/proposal-studio/shared/[token]/route.js). Same ownership-check
 * shape as /delete and /load. Idempotent: re-clicking Share on an
 * already-shared proposal returns the SAME token rather than invalidating a
 * link that may already have been sent out.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';
import { ensureShareToken } from '@/lib/proposalShareToken';

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) {
      return Response.json({ error: 'Missing id' }, { status: 400 });
    }

    const result = await pool.query(`SELECT user_id FROM proposals WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (row.user_id !== session.user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const shareToken = await ensureShareToken(pool, id);
    const origin = new URL(req.url).origin;

    return Response.json({ ok: true, shareToken, shareUrl: `${origin}/proposal-studio/view/${shareToken}` });

  } catch (err) {
    console.error('[proposal-studio/share]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Write `unshare/route.js`**

```js
/**
 * app/api/proposal-studio/unshare/route.js
 *
 * POST /api/proposal-studio/unshare
 * Body (JSON): { id }
 *
 * Turns off public sharing: clears proposals.share_token so the old link
 * 404s (app/api/proposal-studio/shared/[token]/route.js can no longer find
 * a matching row). Same ownership-check shape as /share.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) {
      return Response.json({ error: 'Missing id' }, { status: 400 });
    }

    const result = await pool.query(`SELECT user_id FROM proposals WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (row.user_id !== session.user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    await pool.query(`UPDATE proposals SET share_token = NULL WHERE id = $1`, [id]);

    return Response.json({ ok: true });

  } catch (err) {
    console.error('[proposal-studio/unshare]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: builds cleanly (no automated test — these routes need a live DB + session, which this sandbox doesn't have; `npm run build` only catches syntax/import errors). Manual test checklist deferred to the end of this plan.

- [ ] **Step 4: Commit**

```bash
git add app/api/proposal-studio/share/route.js app/api/proposal-studio/unshare/route.js
git commit -m "feat(proposal-studio): add share/unshare API routes"
```

---

### Task 4: Public `GET /api/proposal-studio/shared/[token]` route

**Files:**
- Create: `app/api/proposal-studio/shared/[token]/route.js`

**Interfaces:**
- Consumes: `pool` from `@/lib/db`, `r2Get` from `@/lib/r2` (both existing, unchanged).
- Produces: `GET /api/proposal-studio/shared/[token]` → `200` with `{ clientName, clientEmail, clientPhone, advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin, proposalType, sipFrequency, selectedFunds }`, or `404` with `{ error: 'Not found' }`. Consumed by `app/proposal-studio/view/[token]/page.js` (Task 12).

- [ ] **Step 1: Write the route**

```js
/**
 * app/api/proposal-studio/shared/[token]/route.js
 *
 * GET /api/proposal-studio/shared/[token]
 *
 * Public, unauthenticated lookup for a shared proposal -- no auth() call at
 * all, since a share link is meant to be opened by anyone holding it,
 * including someone who has never signed in (see
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md).
 * A revoked link and a link that never existed return the SAME generic 404
 * on purpose -- they must be indistinguishable to a caller. Never returns
 * id, user_id, or blob_key -- only the fields ProposalReadOnlyView needs.
 */

import pool     from '@/lib/db';
import { r2Get } from '@/lib/r2';

export async function GET(req, { params }) {
  try {
    const { token } = await params;
    if (!token) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const result = await pool.query(
      `SELECT blob_key FROM proposals WHERE share_token = $1`,
      [token]
    );
    const row = result.rows[0];
    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const payload = await r2Get(row.blob_key);
    if (!payload) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    return Response.json({
      clientName: payload.clientName,
      clientEmail: payload.clientEmail,
      clientPhone: payload.clientPhone,
      advisorName: payload.advisorName,
      advisorPhone: payload.advisorPhone,
      advisorEmail: payload.advisorEmail,
      advisorArn: payload.advisorArn,
      advisorEuin: payload.advisorEuin,
      proposalType: payload.proposalType,
      sipFrequency: payload.sipFrequency,
      selectedFunds: payload.selectedFunds,
    });

  } catch (err) {
    console.error('[proposal-studio/shared]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: builds cleanly. No automated test (needs a live DB + R2 to exercise). Manual test checklist deferred to the end of this plan.

- [ ] **Step 3: Commit**

```bash
git add "app/api/proposal-studio/shared/[token]/route.js"
git commit -m "feat(proposal-studio): add public shared-proposal lookup route"
```

---

### Task 5: `lib/proposalEmail.js` — branded share email + validator

**Files:**
- Create: `lib/proposalEmail.js`
- Test: `tests/proposalEmail.test.js`

**Interfaces:**
- Produces: `buildProposalShareEmail({ clientName, advisorName, advisorPhone, advisorEmail, shareUrl, proposalType })` → `{ subject, html, text }`; `isPlausibleEmail(email)` → boolean. Both consumed by `app/api/proposal-studio/send-email/route.js` (Task 6).

- [ ] **Step 1: Write the failing test**

Create `tests/proposalEmail.test.js`:

```js
// tests/proposalEmail.test.js
//
// Unit tests for lib/proposalEmail.js's branded share-email builder and
// email-format validator.
// Run with: node tests/proposalEmail.test.js

const assert = require('assert');
const { buildProposalShareEmail, isPlausibleEmail } = require('../lib/proposalEmail');

console.log('=== Running Proposal Email Unit Tests ===\n');

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

test('isPlausibleEmail accepts a normal address', () => {
  assert.strictEqual(isPlausibleEmail('client@example.com'), true);
});

test('isPlausibleEmail rejects malformed or empty input', () => {
  assert.strictEqual(isPlausibleEmail('not-an-email'), false);
  assert.strictEqual(isPlausibleEmail('missing-domain@'), false);
  assert.strictEqual(isPlausibleEmail(''), false);
  assert.strictEqual(isPlausibleEmail(null), false);
  assert.strictEqual(isPlausibleEmail(undefined), false);
});

test('buildProposalShareEmail subject names the advisor', () => {
  const { subject } = buildProposalShareEmail({
    advisorName: 'Atin Kumar Agrawal',
    shareUrl: 'https://mfcalc.getabundance.in/proposal-studio/view/abc',
    proposalType: 'sip',
  });
  assert.strictEqual(subject, 'Atin Kumar Agrawal has shared an investment proposal with you');
});

test('buildProposalShareEmail html and text both include the share link', () => {
  const url = 'https://mfcalc.getabundance.in/proposal-studio/view/xyz123';
  const { html, text } = buildProposalShareEmail({ advisorName: 'A', clientName: 'B', shareUrl: url, proposalType: 'lumpsum' });
  assert.ok(html.includes(url), 'html missing share URL');
  assert.ok(text.includes(url), 'text missing share URL');
});

test('buildProposalShareEmail escapes HTML-unsafe characters in names', () => {
  const { html } = buildProposalShareEmail({ advisorName: 'A & <B>', clientName: 'C & <D>', shareUrl: 'https://x', proposalType: 'sip' });
  assert.ok(!html.includes('<B>'), 'advisor name was not escaped');
  assert.ok(!html.includes('<D>'), 'client name was not escaped');
  assert.ok(html.includes('A &amp; &lt;B&gt;'));
});

test('buildProposalShareEmail omits the contact line when advisor has no phone/email', () => {
  const { html, text } = buildProposalShareEmail({ advisorName: 'A', shareUrl: 'https://x', proposalType: 'sip' });
  assert.ok(!html.includes('Questions?'));
  assert.ok(!text.includes('Questions?'));
});

test('buildProposalShareEmail includes the contact line when advisor has phone/email', () => {
  const { html, text } = buildProposalShareEmail({ advisorName: 'A', advisorPhone: '9999999999', advisorEmail: 'a@x.com', shareUrl: 'https://x', proposalType: 'sip' });
  assert.ok(html.includes('9999999999') && html.includes('a@x.com'));
  assert.ok(text.includes('9999999999') && text.includes('a@x.com'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node tests/proposalEmail.test.js`
Expected: fails immediately with a module-not-found error.

- [ ] **Step 3: Write the implementation**

Create `lib/proposalEmail.js`:

```js
/**
 * lib/proposalEmail.js
 *
 * Branded HTML/text email for Proposal Studio's "Send Email" action --
 * mirrors auth.js's buildEmail() visual conventions (same brand green,
 * logo, card layout, footer) so a client's inbox sees a consistent
 * Abundance look regardless of which feature sent the email. See
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md.
 *
 * CommonJS (module.exports), matching lib/portfolioAnalysis.js and
 * lib/chartSvg.js's dual-purpose style -- importable both via Next's
 * `import` (send-email/route.js) and plain `node`/`require`
 * (tests/proposalEmail.test.js).
 */

const BRAND = '#1a7a4a';
const MUTED = '#64748b';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Basic input-validation shape check, not a security control -- the route
// that uses this is already gated on the proposal's own owner (see
// app/api/proposal-studio/send-email/route.js).
function isPlausibleEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function buildProposalShareEmail({ clientName, advisorName, advisorPhone, advisorEmail, shareUrl, proposalType }) {
  const greetingName = clientName ? esc(clientName) : 'there';
  const advisorEsc = advisorName ? esc(advisorName) : 'your advisor';
  const typeLabel = proposalType === 'sip' ? 'SIP' : 'Lumpsum';
  const contactLine = [advisorPhone ? esc(advisorPhone) : null, advisorEmail ? esc(advisorEmail) : null].filter(Boolean).join(' · ');

  const subject = `${advisorEsc} has shared an investment proposal with you`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafb;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafb;padding:40px 16px;">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
  <tr><td align="center" style="padding-bottom:24px;">
    <img src="https://mfcalc.getabundance.in/logo-192.png" alt="Abundance Financial Services" width="80" height="80" style="display:block;margin:0 auto 14px;border-radius:14px;border:1.5px solid #e2e8f0;" />
    <div style="font-size:20px;font-weight:900;color:${BRAND};letter-spacing:-.5px;">Abundance Financial Services</div>
    <div style="font-size:12px;color:${MUTED};margin-top:4px;font-family:'Courier New',monospace;">ARN-251838 · Haldwani, Uttarakhand</div>
  </td></tr>
  <tr><td style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;border-top:4px solid ${BRAND};padding:36px 32px;box-shadow:0 4px 20px rgba(0,0,0,.06);">
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1e293b;letter-spacing:-.4px;">Hi ${greetingName},</h1>
    <p style="margin:0 0 20px;font-size:14px;color:${MUTED};line-height:1.6;">${advisorEsc} has shared a ${typeLabel} investment proposal with you. No sign-in needed — just click below to view it.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:24px;">
      <a href="${shareUrl}" style="display:inline-block;padding:14px 32px;background:${BRAND};color:#fff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none;letter-spacing:-.2px;">View Proposal →</a>
    </td></tr></table>
    <p style="margin:0 0 4px;font-size:12px;color:${MUTED};line-height:1.6;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="margin:0 0 20px;font-size:11px;color:${BRAND};word-break:break-all;font-family:'Courier New',monospace;">${shareUrl}</p>
    ${contactLine ? `<p style="margin:0;font-size:12px;color:${MUTED};line-height:1.6;">Questions? Reach ${advisorEsc} at ${contactLine}.</p>` : ''}
    <p style="margin:20px 0 0;font-size:12px;color:${MUTED};border-top:1px solid #f1f5f9;padding-top:16px;line-height:1.6;">Full terms and disclaimers are shown on the proposal page itself.</p>
  </td></tr>
  <tr><td align="center" style="padding-top:20px;">
    <p style="margin:0;font-size:11px;color:${MUTED};font-family:'Courier New',monospace;">Abundance Financial Services · ARN-251838 · mfcalc.getabundance.in</p>
  </td></tr>
</table></td></tr></table>
</body></html>`;

  const text = `Hi ${clientName || 'there'},\n\n${advisorName || 'Your advisor'} has shared a ${typeLabel} investment proposal with you. No sign-in needed.\n\nView it here: ${shareUrl}\n\n${contactLine ? `Questions? Reach ${advisorName || 'your advisor'} at ${contactLine}.\n\n` : ''}Abundance Financial Services · ARN-251838`;

  return { subject, html, text };
}

module.exports = { buildProposalShareEmail, isPlausibleEmail };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node tests/proposalEmail.test.js`
Expected: `7 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add lib/proposalEmail.js tests/proposalEmail.test.js
git commit -m "feat(proposal-studio): add branded share-email template"
```

---

### Task 6: `POST /api/proposal-studio/send-email` route

**Files:**
- Create: `app/api/proposal-studio/send-email/route.js`

**Interfaces:**
- Consumes: `ensureShareToken` (Task 2), `buildProposalShareEmail`/`isPlausibleEmail` (Task 5), `r2Get` (`@/lib/r2`, existing), `pool` (`@/lib/db`, existing), `auth` (`@/auth`, existing).
- Produces: `POST /api/proposal-studio/send-email` → `{ ok: true, shareToken, shareUrl }` on success (the caller needs `shareToken` back because this route may share the proposal for the first time). Consumed by `ShareControls.jsx` (Task 9).

- [ ] **Step 1: Write the route**

```js
/**
 * app/api/proposal-studio/send-email/route.js
 *
 * POST /api/proposal-studio/send-email
 * Body (JSON): { id, toEmail }
 *
 * Emails a proposal's share link to a recipient the sender types in --
 * never auto-sent silently (see
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md,
 * decision 6). Requires the caller to own the proposal (same ownership
 * check as /share, /unshare, /delete). Shares the proposal first if it
 * isn't already shared -- a link must exist before it can be emailed --
 * and returns the resulting shareToken/shareUrl so the caller can update
 * its own UI without a second round-trip.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';
import { r2Get } from '@/lib/r2';
import { ensureShareToken } from '@/lib/proposalShareToken';
import { buildProposalShareEmail, isPlausibleEmail } from '@/lib/proposalEmail';

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id, toEmail } = await req.json();
    if (!id || !toEmail) {
      return Response.json({ error: 'Missing id or toEmail' }, { status: 400 });
    }
    if (!isPlausibleEmail(toEmail)) {
      return Response.json({ error: 'That does not look like a valid email address.' }, { status: 400 });
    }

    const result = await pool.query(`SELECT user_id, blob_key FROM proposals WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (row.user_id !== session.user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await r2Get(row.blob_key);
    if (!payload) {
      return Response.json({ error: 'Saved payload missing from storage' }, { status: 404 });
    }

    const shareToken = await ensureShareToken(pool, id);
    const origin = new URL(req.url).origin;
    const shareUrl = `${origin}/proposal-studio/view/${shareToken}`;

    const { subject, html, text } = buildProposalShareEmail({
      clientName: payload.clientName,
      advisorName: payload.advisorName,
      advisorPhone: payload.advisorPhone,
      advisorEmail: payload.advisorEmail,
      shareUrl,
      proposalType: payload.proposalType,
    });

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Abundance Financial Services <noreply@getabundance.in>',
        to: toEmail.trim(),
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      console.error('[proposal-studio/send-email] Resend error:', res.status, error);
      return Response.json({ error: 'Could not send the email.' }, { status: 502 });
    }

    return Response.json({ ok: true, shareToken, shareUrl });

  } catch (err) {
    console.error('[proposal-studio/send-email]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: builds cleanly. No automated test (needs live DB/R2/Resend credentials). Manual test checklist deferred to the end of this plan.

- [ ] **Step 3: Commit**

```bash
git add app/api/proposal-studio/send-email/route.js
git commit -m "feat(proposal-studio): add send-email API route"
```

---

### Task 7: `/load` route — include `shareToken` in the response

**Files:**
- Modify: `app/api/proposal-studio/load/route.js:27-44`

**Interfaces:**
- Produces: `GET /api/proposal-studio/load?id=...` now also returns `shareToken` (string or `null`) alongside its existing fields. Consumed by `app/proposal-studio/mine/[id]/page.js` (Task 13) to initialize `ShareControls`.

This is a small, additive change to an existing route. The spec's "API Routes" section calls `/load` "unchanged" in the sense that its auth/ownership behavior and role (still what "Edit this proposal" calls) don't change — but `mine/[id]` needs to know current share status on first load without a redundant extra request, and `/load` is the only ownership-checked read path for a single proposal. Adding one column to the `SELECT` and one field to the response is backward-compatible (existing callers that don't read `shareToken` are unaffected).

- [ ] **Step 1: Edit the route**

In `app/api/proposal-studio/load/route.js`, change:

```js
    const result = await pool.query(
      `SELECT user_id, blob_key FROM proposals WHERE id = $1`,
      [id]
    );
```

to:

```js
    const result = await pool.query(
      `SELECT user_id, blob_key, share_token FROM proposals WHERE id = $1`,
      [id]
    );
```

and change:

```js
    return Response.json({ id, ...payload });
```

to:

```js
    return Response.json({ id, shareToken: row.share_token, ...payload });
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: builds cleanly.

- [ ] **Step 3: Commit**

```bash
git add app/api/proposal-studio/load/route.js
git commit -m "feat(proposal-studio): include share token in /load response"
```

---

### Task 8: Extract `ProposalSections.jsx` from `ProposalStudioClient.jsx`

**Files:**
- Create: `app/proposal-studio/ProposalSections.jsx`
- Modify: `app/proposal-studio/ProposalStudioClient.jsx:1-14` (imports), `:156-161` (remove `formatProposalId`), `:325` (remove `mCapIndex` useState), `:354-359` (remove mCapIndex effect, replace with hook call), `:564-654` (replace the analysis IIFE with `<ProposalAnalysisBlock>`), `:657-1263` (delete — moved to the new file)

**Interfaces:**
- Produces (from `./ProposalSections`): `formatProposalId(id)`, `useMCapIndex()`, `InlineSvg`, `CollapsibleSection`, `fullSecurityExposure(funds, allocations)`, `exportProposalPDF(args)`, `ExposureTable`, `SchemeDetailsTable`, `OverlapGrid`, `MCapTable`, `GrowthProjectionTable`, `ClosingSection`, `ProposalAnalysisBlock`.
- `ProposalAnalysisBlock` props: `{ selectedFunds, holdingsByFund, holdingsError, totalAmount, mCapIndex, proposalType, sipFrequency, clientName, clientEmail, clientPhone, advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin, proposalId, actionsExtra }`. `actionsExtra` is an optional React node rendered in the actions bar after the Export button.
- Consumed by: `ProposalStudioClient.jsx` (this task) and `ProposalReadOnlyView.jsx` (Task 10).

This is a mechanical extraction — no behavior changes. Every function body below is copied verbatim from the current file (already read in full during planning); only where each piece now *lives* changes, plus the new `ProposalAnalysisBlock` wrapper around the analysis-rendering logic that used to be an inline IIFE inside `ProposalStudioTool`'s JSX.

- [ ] **Step 1: Create `app/proposal-studio/ProposalSections.jsx`**

```jsx
'use client';

/**
 * app/proposal-studio/ProposalSections.jsx
 *
 * Shared rendering pipeline for Proposal Studio: the presentational
 * sections (Asset Allocation, Sector/Security Exposure, Scheme Details,
 * Overlap, M-Cap, Growth Projection, Closing/Disclaimer), the branded PDF
 * export, and ProposalAnalysisBlock -- the fetch-independent compute+render
 * pipeline that turns a fund list + its loaded holdings into that full
 * output. Used by BOTH the editable tool (ProposalStudioTool in
 * ProposalStudioClient.jsx, which layers Save/Export/Delete/edit controls
 * around it) and the read-only view (ProposalReadOnlyView.jsx, used by the
 * public share page and the owner's "My Saved Proposals" detail page). See
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md,
 * "Architecture: Shared Rendering Pipeline".
 */

import { useState, useEffect } from 'react';
import RiskGauge from '@/components/RiskGauge';
import { getMFLogoFromSchemeName } from '@/lib/providerLogos';
import { combineExposure, computeOverlap, computeMCapAllocation, normalizeName, isComparableHolding } from '@/lib/portfolioAnalysis';
import { donutChartSvg, barRankingSvg, overlapHeatmapSvg, stackedBarSvg } from '@/lib/chartSvg';
import { blendedRate, buildProjectionTable, ASSUMED_CAGR } from '@/lib/growthProjection';

export function formatProposalId(id) {
  return 'PROP-' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase();
}

// Loads the AMFI M-Cap categorization index once -- shared by the editable
// tool and the read-only view so both compute M-Cap Allocation identically.
export function useMCapIndex() {
  const [mCapIndex, setMCapIndex] = useState(null);
  useEffect(() => {
    fetch('/data/amfi-cap-categorization.json')
      .then((r) => r.json())
      .then((d) => setMCapIndex(new Map(Object.entries(d.categories))))
      .catch(() => setMCapIndex(new Map()));
  }, []);
  return mCapIndex;
}

// `svg` is always our own generated string from lib/chartSvg.js (never
// user-controlled raw HTML/markup) -- the same trust boundary already
// relied on elsewhere in this file for scheme logos.
export function InlineSvg({ svg, className }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function CollapsibleSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="pfc-section">
      <button className="pfc-section-header" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <h2 className="pfc-section-title">{title}</h2>
        <span className={`pfc-chevron ${open ? 'pfc-chevron-open' : ''}`}>▾</span>
      </button>
      {open && <div className="pfc-section-body">{children}</div>}
    </section>
  );
}

// Same per-security aggregation combineExposure uses internally, without the
// top-10 truncation -- scoped to this file since only the "show all
// holdings" expansion needs the untruncated list. Named holdings of any
// asset class (equity stocks, specific bonds, REITs, gold/other ETFs) are
// included, matching combineExposure's isComparableHolding filter; generic
// cash-equivalent bucket names (Repo, Net Current Assets, etc.) are excluded.
export function fullSecurityExposure(funds, allocations) {
  const security = new Map(); // normalizedName -> {name, pct}
  for (const fund of funds) {
    const fundWeight = (allocations[fund.amfiCode] || 0) / 100;
    for (const h of fund.holdings) {
      if (!isComparableHolding(h)) continue;
      // Unclamped -- a short futures position (negative weightagePct, e.g.
      // in a long-short SIF strategy) must show its true negative weight,
      // not get floored to 0. Clamping here previously made a short
      // position appear as a phantom "0.00%" holding instead of what it
      // actually is, and silently broke the list's total (verified live,
      // 2026-08: a real long-short SIF's holdings summed to 112% instead
      // of 100% because of this).
      const w = (h.weightagePct || 0) * fundWeight;
      const key = normalizeName(h.securityName);
      const existing = security.get(key) || { name: h.securityName, pct: 0 };
      existing.pct += w;
      security.set(key, existing);
    }
  }
  return [...security.values()]
    .map((r) => ({ name: r.name, pct: Math.round(r.pct * 100) / 100 }))
    .sort((a, b) => b.pct - a.pct);
}

// Branded print/PDF export -- opens a self-contained HTML document in a new
// window and triggers the browser's print dialog (Save as PDF), matching the
// pattern already established in app/backtest/page.js's doExport(). Recomputes
// overlap/M-Cap from the same lib/portfolioAnalysis functions the live tables
// use, rather than threading pre-built rows through, so this stays correct if
// those functions change.
export function exportProposalPDF({
  proposalType, sipFrequency, totalAmount, selectedFunds,
  assetAllocation, sectorExposure, stockExposure, readyFunds, allocations, mCapIndex,
  erroredFunds, clientName, clientEmail, clientPhone, holdingsByFund, proposalId,
  advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin,
}) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const typeLabel = proposalType === 'sip' ? `SIP (${sipFrequency === 'daily' ? 'Daily' : 'Monthly'})` : 'Lumpsum';
  const proposalIdLabel = proposalId ? formatProposalId(proposalId) : '';

  const kpi = (l, v) => `<div class="banner-cell"><div class="banner-lbl">${l}</div><div class="banner-val">${v}</div></div>`;
  const banner = [
    kpi(`Total ${proposalType === 'sip' ? 'SIP' : 'Lumpsum'}`, inr(totalAmount)),
    kpi('Funds', String(selectedFunds.length)),
    kpi('Type', typeLabel),
  ].join('');

  // Cover "what's inside" preview -- only lists sections this specific
  // proposal actually includes (Portfolio Overlap needs 2+ funds, M-Cap
  // needs the AMFI categorization index to have loaded), so it never
  // promises a section that isn't there.
  const coverToc = [
    'Selected Funds & Scheme Details',
    'Asset Allocation',
    'Sector & Security Exposure',
    readyFunds.length >= 2 ? 'Portfolio Overlap' : null,
    mCapIndex ? 'M-Cap Allocation' : null,
    'Growth Projection',
  ].filter(Boolean);
  const coverTocHTML = coverToc.map((item) => `<span>${esc(item)}</span>`).join('');

  const fundRows = selectedFunds.map((f) => {
    const logo = getMFLogoFromSchemeName(f.schemeName);
    const logoImg = logo
      ? `<img src="${logo}" alt="" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;border-radius:3px;border:1px solid #d7e7d8" onerror="this.style.display='none'">`
      : '';
    const pct = totalAmount > 0 ? (f.amount / totalAmount) * 100 : 0;
    return `<tr><td>${logoImg}${esc(f.schemeName)}</td><td class="num">${inr(f.amount)}</td><td class="num">${pct.toFixed(1)}%</td></tr>`;
  }).join('');

  const pctRows = (rows) => rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${r.pct.toFixed(2)}%</td></tr>`).join('');
  const exposureSection = (title, rows, chartType) => rows.length === 0 ? '' : `
    <div class="sec-block">
    <div class="sec">${title}</div>
    ${chartType === 'donut' ? `<div class="chart-center">${donutChartSvg(rows)}</div>` : chartType === 'bars' ? barRankingSvg(rows.slice(0, 10)) : ''}
    <table class="ptable"><tbody>${pctRows(rows)}</tbody></table>
    </div>`;

  // The "Selected Funds" table below lists every fund with its amount, but
  // the analysis sections (allocation/exposure/overlap/M-Cap) only cover
  // readyFunds -- a fund whose holdings failed to load is silently absent
  // from those percentages. Call that out explicitly rather than letting
  // the numbers look complete when they aren't.
  const erroredNoteHTML = erroredFunds && erroredFunds.length > 0
    ? `<div class="meta" style="margin-top:10px">&#9888;&#65039; Excluded from Asset Allocation, Sector/Security Exposure, Overlap, and M-Cap Allocation below (holdings data unavailable): ${erroredFunds.map((f) => esc(f.schemeName)).join('; ')}.</div>`
    : '';

  let overlapHTML = '';
  if (readyFunds.length >= 2) {
    const grid = computeOverlap(readyFunds);
    const names = readyFunds.map((f) => selectedFunds.find((s) => s.amfiCode === f.amfiCode)?.schemeName || f.amfiCode);
    overlapHTML = `
      <div class="sec-block">
      <div class="sec">Portfolio Overlap (Named Holdings)</div>
      ${overlapHeatmapSvg(names, grid)}
      <table class="ptable"><thead><tr><th></th>${names.map((n) => `<th class="num">${esc(n)}</th>`).join('')}</tr></thead>
      <tbody>${grid.map((row, i) => `<tr><th style="text-align:left">${esc(names[i])}</th>${row.map((v, j) => `<td class="num${i === j ? ' diag' : ''}">${v.toFixed(1)}%</td>`).join('')}</tr>`).join('')}</tbody></table>
      </div>`;
  }

  let mcapHTML = '';
  if (mCapIndex && readyFunds.length > 0) {
    const rows = readyFunds.map((f) => {
      const name = selectedFunds.find((s) => s.amfiCode === f.amfiCode)?.schemeName || f.amfiCode;
      const allocationPct = allocations[f.amfiCode] || 0;
      return { name, allocationPct, ...computeMCapAllocation(f, mCapIndex) };
    });
    const totalAllocation = rows.reduce((s, r) => s + r.allocationPct, 0);
    const weightedAvg = totalAllocation > 0
      ? {
          large: rows.reduce((s, r) => s + r.large * r.allocationPct, 0) / totalAllocation,
          mid: rows.reduce((s, r) => s + r.mid * r.allocationPct, 0) / totalAllocation,
          small: rows.reduce((s, r) => s + r.small * r.allocationPct, 0) / totalAllocation,
          unclassified: rows.reduce((s, r) => s + r.unclassified * r.allocationPct, 0) / totalAllocation,
          derivatives: rows.reduce((s, r) => s + r.derivatives * r.allocationPct, 0) / totalAllocation,
        }
      : { large: 0, mid: 0, small: 0, unclassified: 0, derivatives: 0 };
    mcapHTML = `
      <div class="sec-block">
      <div class="sec">Scheme M-Cap Allocation</div>
      ${stackedBarSvg(rows)}
      <p style="font-size:.62rem;color:#5e8a5e;margin-bottom:8px;line-height:1.5;">
        Large Cap/Mid Cap/Small Cap/Others always sum to 100% of the fund's cash-equity holdings. <b>Derivatives</b> is a separate figure -- net futures exposure as a % of the fund's total assets, shown alongside rather than folded into that 100%.
      </p>
      <table class="ptable"><thead><tr><th style="text-align:left">Fund</th><th class="num">Large Cap</th><th class="num">Mid Cap</th><th class="num">Small Cap</th><th class="num">Others</th><th class="num">Derivatives</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${r.large.toFixed(1)}%</td><td class="num">${r.mid.toFixed(1)}%</td><td class="num">${r.small.toFixed(1)}%</td><td class="num">${r.unclassified.toFixed(1)}%</td><td class="num">${r.derivatives.toFixed(1)}%</td></tr>`).join('')}
      <tr class="avg"><td>Portfolio (weighted avg)</td><td class="num">${weightedAvg.large.toFixed(1)}%</td><td class="num">${weightedAvg.mid.toFixed(1)}%</td><td class="num">${weightedAvg.small.toFixed(1)}%</td><td class="num">${weightedAvg.unclassified.toFixed(1)}%</td><td class="num">${weightedAvg.derivatives.toFixed(1)}%</td></tr>
      </tbody></table>
      </div>`;
  }

  const projectionRate = blendedRate(assetAllocation);
  const projectionRows = buildProjectionTable({ proposalType, totalAmount, sipFrequency, blendedRate: projectionRate });
  const projectionHTML = `
    <div class="sec-block">
    <div class="sec">Growth Projection</div>
    <p style="font-size:.62rem;color:#5e8a5e;margin-bottom:8px;line-height:1.5;">
      Assumed return: <b>${(projectionRate * 100).toFixed(2)}% p.a.</b>, blended from this portfolio's asset mix per AMFI Best Practices Guidelines Circular No. 109 (Equity ${(ASSUMED_CAGR.EQUITY * 100).toFixed(2)}%, Debt ${(ASSUMED_CAGR.DEBT * 100).toFixed(2)}%, Gold ${(ASSUMED_CAGR.GOLD * 100).toFixed(2)}%).
    </p>
    <table class="ptable"><thead><tr><th style="text-align:left">Year</th><th class="num">Total Invested</th><th class="num">Projected Value</th><th class="num">Gain</th></tr></thead>
    <tbody>${projectionRows.map((r) => `<tr><td>${r.year}</td><td class="num">${inr(r.totalInvested)}</td><td class="num">${inr(r.projectedValue)}</td><td class="num">${inr(r.projectedValue - r.totalInvested)}</td></tr>`).join('')}</tbody></table>
    <p style="font-size:.55rem;color:#5e8a5e;margin-top:6px;">Past performance may or may not be sustained in future and is not a guarantee of any future returns. This is an illustration using AMFI's prescribed assumed rates, not a projection specific to the funds in this proposal.</p>
    </div>`;

  const schemeDetailRows = selectedFunds.map((f) => {
    const d = holdingsByFund[f.amfiCode];
    if (!d) return '';
    const aum = d.aumCr != null ? d.aumCr.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—';
    const aumWithAsOf = d.aumCr != null && d.aumAsOf ? `${aum}<br/><span style="font-size:.7em;font-weight:400;color:#8fae8f">${esc(d.aumAsOf)}</span>` : aum;
    const riskLabel = d.risk ? esc(d.risk) + (d.riskSource === 'benchmark' ? ' (benchmark)' : '') : '—';
    const categoryLabel = d.category ? esc(d.category) + (d.subCategory ? ` · ${esc(d.subCategory)}` : '') : '—';
    return `<tr><td>${esc(f.schemeName)}</td><td>${categoryLabel}</td><td>${riskLabel}</td><td class="num">${aumWithAsOf}</td><td>${esc(d.launchDate || '—')}</td></tr>`;
  }).join('');
  const schemeDetailsHTML = `
    <div class="sec-block">
    <div class="sec">Scheme Details</div>
    <table class="ptable"><thead><tr><th style="text-align:left">Fund</th><th style="text-align:left">Category</th><th style="text-align:left">Risk</th><th class="num">AUM (Cr)</th><th style="text-align:left">Inception</th></tr></thead>
    <tbody>${schemeDetailRows}</tbody></table>
    </div>`;

  const win = window.open('', '_blank', 'width=960,height=760');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Investment Proposal${clientName ? ' - ' + esc(clientName) : ''} | Abundance Financial Services</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Raleway",sans-serif;background:#fff;color:#162616;padding:30px 36px}
.ph{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:2.5px solid #2e7d32;margin-bottom:18px}
.pt{font-size:1.05rem;font-weight:800;color:#2e7d32}.pa{font-size:.6rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;margin-top:2px}
.logo{height:44px;object-fit:contain;mix-blend-mode:multiply}
.sec{font-size:.56rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#5e8a5e;margin:16px 0 8px;display:flex;align-items:center;gap:7px}
.sec::after{content:"";flex:1;height:1px;background:#c2dfc2}
.banner-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
.banner-cell{background:#edf6ed;border:1.5px solid #c2dfc2;border-radius:8px;padding:10px 12px;text-align:center}
.banner-lbl{font-size:.52rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#5e8a5e;margin-bottom:3px}
.banner-val{font-family:"JetBrains Mono",monospace;font-size:.9rem;font-weight:700;color:#1b5e20}
.ptable{width:100%;border-collapse:collapse;font-size:.62rem;margin-bottom:4px}
.ptable th{background:#1e4d20;color:#fff;font-size:.58rem;font-weight:700;letter-spacing:.5px;padding:6px 8px;text-align:right}
.ptable th:first-child{text-align:left}
.ptable td{padding:5px 8px;border-bottom:1px solid #e8f5e9;text-align:right;font-family:"JetBrains Mono",monospace;font-size:.65rem;font-weight:600}
.ptable td:first-child{text-align:left;font-family:"Raleway",sans-serif;font-weight:700;max-width:220px}
.ptable tr:nth-child(even) td{background:#f5fbf5}
.ptable .diag{background:#dcedc8;font-weight:800}
.ptable tr.avg td{background:#edf6ed;font-weight:800}
.num{text-align:right}
svg{max-width:100%;height:auto;display:block;margin-bottom:8px}
.chart-center{display:flex;justify-content:center}
.dis{padding:9px 13px;border-radius:7px;background:#fffde7;border-left:3px solid #f9a825;font-size:.6rem;color:#5d4037;line-height:1.65;font-family:"JetBrains Mono",monospace;margin-top:14px}
.closing-cols{display:flex;gap:28px;margin-bottom:6px}
.closing-col{flex:1}
.closing-h{font-size:.62rem;font-weight:800;color:#1b5e20;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.closing-list{margin:0;padding-left:16px;font-size:.62rem;line-height:1.6;color:#333}
.closing-list li{margin-bottom:4px}
.meta{font-size:.55rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;margin-top:6px}
@media print{body{padding:0 20px 16px;-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:1.6cm .8cm .8cm .8cm;size:A4 portrait}}
.cover { min-height: 700px; display: flex; flex-direction: column; justify-content: center; background: linear-gradient(135deg, #0a2e0a 0%, #1b5e20 50%, #2e7d32 100%); color: #fff; padding: 60px 50px; margin: -30px -36px 0; }
.cover-logo img { height: 48px; object-fit: contain; margin-bottom: 30px; }
.cover-title { font-size: 2.2rem; font-weight: 800; margin-bottom: 30px; }
.cover-blocks { display: flex; gap: 40px; margin-bottom: 30px; }
.cover-label { font-size: .6rem; letter-spacing: 1.5px; text-transform: uppercase; opacity: .65; margin-bottom: 4px; }
.cover-name { font-size: 1.1rem; font-weight: 700; }
.cover-detail { font-size: .8rem; opacity: .8; margin-top: 2px; }
.cover-stats { margin-bottom: 20px; }
.cover-toc { margin-bottom: 24px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,.18); }
.cover-toc-label { font-size: .6rem; letter-spacing: 1.5px; text-transform: uppercase; opacity: .55; margin-bottom: 10px; }
.cover-toc-list { display: flex; flex-wrap: wrap; gap: 8px 22px; }
.cover-toc-list span { font-size: .78rem; font-weight: 600; opacity: .88; display: inline-flex; align-items: center; gap: 7px; }
.cover-toc-list span::before { content: ""; width: 5px; height: 5px; border-radius: 50%; background: #fff; opacity: .55; }
.cover-date { opacity: .55; font-size: .75rem; }
.cover-powered-by { margin-top: 14px; display: flex; align-items: center; gap: 7px; opacity: .5; font-size: .65rem; letter-spacing: .2px; }
.cover-powered-by img { height: 12px; width: auto; object-fit: contain; opacity: .9; }
.cover-powered-by b { font-weight: 700; }
.page-break { page-break-after: always; }
.running-header { display: none; }
@media print {
  /* The running header is position:fixed so Chrome repeats it on every
     physical page -- but CSS padding on the body element only reserves
     space ONCE, at the very start of the document's content flow (page 1),
     not per-page: a paginated box's own padding doesn't repeat at each
     fragment boundary. That meant every page after page 1 had its actual
     first ~34px of content (a section title, the first chart row) rendered
     directly under the fixed header and visually cropped/hidden behind it.
     @page margin, unlike body padding, DOES apply consistently on every
     physical page -- so the header's clearance now lives there (the
     print @page rule above, margin: 1.6cm .8cm .8cm .8cm) instead of in
     body's padding-top, which is removed here. */
  .running-header { display: flex; align-items: center; gap: 8px; position: fixed; top: 0; left: 0; right: 0; padding: 8px 36px; background: #fff; border-bottom: 1px solid #e8f5e9; font-size: .6rem; color: #5e8a5e; font-weight: 700; z-index: 10; }
  .running-header img { height: 16px; }
  .cover { margin: 0 -20px 0; }
}
.sec-block { page-break-inside: avoid; }
</style></head><body>
<div class="running-header"><img src="/logo-og.png" onerror="this.style.display='none'">Abundance Financial Services</div>
<div class="cover">
  <div class="cover-logo"><img src="/logo-mark-white.png" onerror="this.style.display='none'"></div>
  <div class="cover-title">Investment Proposal</div>
  <div class="cover-blocks">
    <div class="cover-block">
      <div class="cover-label">Prepared For</div>
      <div class="cover-name">${esc(clientName || 'Client')}</div>
      ${clientEmail ? `<div class="cover-detail">${esc(clientEmail)}</div>` : ''}
      ${clientPhone ? `<div class="cover-detail">${esc(clientPhone)}</div>` : ''}
    </div>
    <div class="cover-block">
      <div class="cover-label">Prepared By</div>
      <div class="cover-name">${esc(advisorName || 'Advisor')}</div>
      ${advisorPhone ? `<div class="cover-detail">${esc(advisorPhone)}</div>` : ''}
      ${advisorEmail ? `<div class="cover-detail">${esc(advisorEmail)}</div>` : ''}
      <div class="cover-detail">${esc(advisorArn)}</div>
    </div>
  </div>
  <div class="cover-stats banner-grid">${banner}</div>
  <div class="cover-toc">
    <div class="cover-toc-label">What's Inside</div>
    <div class="cover-toc-list">${coverTocHTML}</div>
  </div>
  <div class="cover-date">${esc(dateStr)}${proposalIdLabel ? ` · Proposal ID: ${esc(proposalIdLabel)}` : ''}</div>
  <div class="cover-powered-by"><img src="/logo-mark-white.png" onerror="this.style.display='none'"> Powered by <b>Abundance Financial Services</b></div>
</div>
<div class="page-break"></div>
<div class="ph">
  <div><div class="pt">Investment Proposal — ${esc(typeLabel)}</div>
  <div class="pa">Abundance Financial Services® · ${esc(advisorArn)} · AMFI Registered Mutual Fund &amp; SIF Distributor</div></div>
  <img class="logo" src="/logo-og.png" onerror="this.style.display='none'">
</div>
<div class="sec-block">
<div class="sec">Selected Funds</div>
<table class="ptable"><thead><tr><th style="text-align:left">Fund</th><th class="num">Amount</th><th class="num">% of Total</th></tr></thead><tbody>${fundRows}</tbody></table>
</div>
${erroredNoteHTML}
${schemeDetailsHTML}
${exposureSection('Asset Allocation', assetAllocation, 'donut')}
${exposureSection('Sector Exposure', sectorExposure, 'bars')}
${exposureSection('Security Exposure (Top Holdings)', stockExposure, 'bars')}
${overlapHTML}
${mcapHTML}
${projectionHTML}
<div class="sec-block">
  <div class="sec">Expectations, Next Steps &amp; Disclaimer</div>
  <div class="closing-cols">
    <div class="closing-col">
      <div class="closing-h">Expectations From You</div>
      <ul class="closing-list">
        <li>Confirm the investment amount and Lumpsum/SIP type above reflect what you actually intend to invest.</li>
        <li>Review the asset allocation and satisfy yourself it matches your risk appetite and time horizon.</li>
        <li>Review the funds/SIFs selected, their allocation, and the overlap and M-Cap figures shown above.</li>
        <li>Review each fund's category, risk rating, AUM, and inception date in Scheme Details.</li>
        <li>Read the disclaimer below in full before proceeding.</li>
      </ul>
    </div>
    <div class="closing-col">
      <div class="closing-h">Next Steps</div>
      <ul class="closing-list">
        <li>Get in touch with any questions or changes before we proceed.</li>
        <li>Confirm your go-ahead so we can help you execute this plan.</li>
        <li>Complete any KYC/account requirements needed for the funds involved.</li>
        <li>We'll share the actual transaction/application forms once you confirm.</li>
      </ul>
    </div>
  </div>
  <div class="dis">&#9888;&#65039; <strong style="color:#e65100">Disclaimer:</strong> This investment proposal has been prepared by ${esc(advisorName || 'the preparer')}, an AMFI-registered Mutual Fund and SIF Distributor, based on the information and preferences you've shared with us. It illustrates a possible portfolio for your reference — it is not investment advice, a recommendation, or a solicitation to invest in any specific fund, and there is no assurance the allocation or funds shown will achieve any particular outcome. Mutual fund and SIF investments are subject to market risks, including possible loss of principal; past performance is not indicative of future results, and the Growth Projection above uses AMFI's own prescribed assumed rates, not a fund-specific forecast. Please read the Scheme Information Document, Statement of Additional Information, and Key Information Memorandum of each scheme carefully before investing. This proposal is non-binding — you are under no obligation to act on it, and we encourage you to seek independent financial, tax, or legal advice where needed. Figures are based on each fund's most recently disclosed portfolio and AMFI's own Large/Mid/Small-cap categorization. | ${esc(advisorName || '')} | ${esc(advisorArn)} | Abundance Financial Services | EUIN: ${esc(advisorEuin)}</div>
</div>
<div class="meta">Generated ${esc(dateStr)}${proposalIdLabel ? ` · Proposal ID: ${esc(proposalIdLabel)}` : ''} · mfcalc.getabundance.in/proposal-studio</div>
</body></html>`);
  win.document.close();
  // onload (fires once fonts/images finish) and the fixed-delay fallback
  // (in case onload never fires -- some browser/extension edge cases) used
  // to BOTH call win.print() unconditionally, so a user who saved from the
  // first dialog would immediately see a second one pop up. printTriggered
  // guarantees only whichever fires first actually opens the dialog.
  let printTriggered = false;
  function triggerPrint() {
    if (printTriggered) return;
    printTriggered = true;
    try { win.focus(); win.print(); } catch (e) {}
  }
  win.onload = () => setTimeout(triggerPrint, 600);
  setTimeout(triggerPrint, 1400);
}

export function ExposureTable({ title, rows, fullRows, chart }) {
  const [showAll, setShowAll] = useState(false);
  const displayRows = showAll && fullRows ? fullRows : rows;
  return (
    <CollapsibleSection title={title}>
      {chart === 'donut' && <InlineSvg className="pfc-chart pfc-chart-center" svg={donutChartSvg(rows)} />}
      {chart === 'bars' && <InlineSvg className="pfc-chart" svg={barRankingSvg(rows.slice(0, 10))} />}
      <div className="pfc-table-wrap">
        <table className="pfc-table">
          <tbody>
            {displayRows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="pfc-table-pct">{r.pct.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fullRows && (
        <button className="pfc-show-all" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show top 10 only' : `Show all ${fullRows.length} holdings`}
        </button>
      )}
    </CollapsibleSection>
  );
}

// TODO: Expense ratio still not shown here -- it's a Direct-plan-only value
// from the underlying data source, misleading for a Regular-plan proposal.
// Re-add once a reliable per-plan (Direct vs Regular) source is found. AUM
// and Inception Date below come from data/amfi-aum.json instead (AMFI's own
// scheme-level AUM disclosure), which is plan-agnostic, so no such caveat
// applies to those two columns.
//
// RISK_SCORE_BY_LABEL: RiskGauge needs a numeric score (1-7) to position the
// needle, but /api/proposal-studio/holdings only returns the label (from the
// underlying data source's own "risk" field, or the benchmark fallback's
// label) -- map label back to the same score scale RiskGauge already uses
// via RISK_CONFIG's ordering.
const RISK_SCORE_BY_LABEL = { 'Low': 1, 'Low To Moderate': 2, 'Moderate': 3, 'Moderately High': 4, 'High': 5, 'Very High': 6 };

export function SchemeDetailsTable({ selectedFunds, holdingsByFund }) {
  return (
    <CollapsibleSection title="Scheme Details">
      <div className="pfc-table-wrap">
        <table className="pfc-table pfc-table-wide">
          <thead>
            <tr>
              <th>Fund</th>
              <th>Category</th>
              <th>Risk</th>
              <th className="pfc-table-pct">AUM (Cr)</th>
              <th>Inception</th>
              <th className="pfc-table-pct">Equity Holdings</th>
            </tr>
          </thead>
          <tbody>
            {selectedFunds.map((f) => {
              const d = holdingsByFund[f.amfiCode];
              if (!d) return null;
              const equityCount = d.holdings.filter((h) => h.assetClass === 'EQUITY').length;
              return (
                <tr key={f.amfiCode}>
                  <td>{f.schemeName}</td>
                  <td>{d.category}{d.subCategory ? ` · ${d.subCategory}` : ''}</td>
                  <td>
                    {d.risk ? <RiskGauge label={d.risk} score={RISK_SCORE_BY_LABEL[d.risk] || 3} /> : '—'}
                    {d.riskSource === 'benchmark' && <span className="pfc-risk-benchmark-note"> (benchmark)</span>}
                  </td>
                  <td className="pfc-table-pct">
                    <div className="pfc-aum-cell">
                      <span>{d.aumCr != null ? d.aumCr.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}</span>
                      {d.aumCr != null && d.aumAsOf && <span className="pfc-aum-asof">{d.aumAsOf}</span>}
                    </div>
                  </td>
                  <td>{d.launchDate || '—'}</td>
                  <td className="pfc-table-pct">{equityCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

export function OverlapGrid({ funds, selectedFunds }) {
  const grid = computeOverlap(funds);
  const names = funds.map((f) => selectedFunds.find((s) => s.amfiCode === f.amfiCode)?.schemeName || f.amfiCode);

  return (
    <CollapsibleSection title="Portfolio Overlap (Named Holdings)">
      <InlineSvg className="pfc-chart pfc-chart-scroll" svg={overlapHeatmapSvg(names, grid)} />
      <div className="pfc-table-wrap">
        <table className="pfc-table pfc-overlap-table">
          <thead>
            <tr>
              <th></th>
              {names.map((n, i) => <th key={i}>{n}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, i) => (
              <tr key={i}>
                <th>{names[i]}</th>
                {row.map((v, j) => (
                  <td key={j} className={`pfc-table-pct ${i === j ? 'pfc-overlap-diag' : ''}`}>{v.toFixed(1)}%</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

export function GrowthProjectionTable({ proposalType, totalAmount, sipFrequency, assetAllocation }) {
  const rate = blendedRate(assetAllocation);
  const rows = buildProjectionTable({ proposalType, totalAmount, sipFrequency, blendedRate: rate });
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

  return (
    <CollapsibleSection title="Growth Projection">
      <p className="pfc-projection-note">
        Assumed return: <b>{(rate * 100).toFixed(2)}% p.a.</b>, blended from your portfolio's actual asset mix using AMFI's own fixed illustration rates
        (Equity {(ASSUMED_CAGR.EQUITY * 100).toFixed(2)}%, Debt {(ASSUMED_CAGR.DEBT * 100).toFixed(2)}%, Gold {(ASSUMED_CAGR.GOLD * 100).toFixed(2)}% — AMFI Best Practices Guidelines Circular No. 109).
      </p>
      <div className="pfc-table-wrap">
        <table className="pfc-table">
          <thead>
            <tr>
              <th>Year</th>
              <th className="pfc-table-pct">Total Invested</th>
              <th className="pfc-table-pct">Projected Value</th>
              <th className="pfc-table-pct">Gain</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year}>
                <td>{r.year}</td>
                <td className="pfc-table-pct">{inr(r.totalInvested)}</td>
                <td className="pfc-table-pct">{inr(r.projectedValue)}</td>
                <td className="pfc-table-pct">{inr(r.projectedValue - r.totalInvested)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pfc-projection-disclaimer">
        Past performance may or may not be sustained in future and is not a guarantee of any future returns. This is an illustration using AMFI's prescribed assumed rates, not a projection specific to the funds in this proposal.
      </p>
    </CollapsibleSection>
  );
}

export function ClosingSection({ advisorName, advisorArn, advisorEuin }) {
  return (
    <CollapsibleSection title="Expectations, Next Steps & Disclaimer">
      <div className="pfc-closing-cols">
        <div className="pfc-closing-col">
          <h4>Expectations From You</h4>
          <ul>
            <li>Confirm the investment amount and Lumpsum/SIP type reflect what you actually intend to invest.</li>
            <li>Review the asset allocation and satisfy yourself it matches your risk appetite and time horizon.</li>
            <li>Review the funds/SIFs selected, their allocation, and the overlap and M-Cap figures above.</li>
            <li>Review each fund's category, risk rating, AUM, and inception date in Scheme Details.</li>
            <li>Read the disclaimer below in full before proceeding.</li>
          </ul>
        </div>
        <div className="pfc-closing-col">
          <h4>Next Steps</h4>
          <ul>
            <li>Get in touch with any questions or changes before we proceed.</li>
            <li>Confirm your go-ahead so we can help you execute this plan.</li>
            <li>Complete any KYC/account requirements needed for the funds involved.</li>
            <li>We'll share the actual transaction/application forms once you confirm.</li>
          </ul>
        </div>
      </div>
      <p className="pfc-closing-disclaimer">
        This investment proposal has been prepared by {advisorName || 'the preparer'}, an AMFI-registered Mutual Fund and SIF Distributor, based on the information and preferences you've shared with us. It illustrates a possible portfolio for your reference — it is not investment advice, a recommendation, or a solicitation to invest in any specific fund, and there is no assurance the allocation or funds shown will achieve any particular outcome. Mutual fund and SIF investments are subject to market risks, including possible loss of principal; past performance is not indicative of future results, and the Growth Projection above uses AMFI's own prescribed assumed rates, not a fund-specific forecast. Please read the Scheme Information Document, Statement of Additional Information, and Key Information Memorandum of each scheme carefully before investing. This proposal is non-binding — you are under no obligation to act on it, and we encourage you to seek independent financial, tax, or legal advice where needed. Figures are based on each fund's most recently disclosed portfolio and AMFI's own Large/Mid/Small-cap categorization. | {advisorName || ''} | {advisorArn} | Abundance Financial Services | EUIN: {advisorEuin}
      </p>
    </CollapsibleSection>
  );
}

export function MCapTable({ selectedFunds, readyFunds, mCapIndex, allocations }) {
  const rows = readyFunds.map((f) => {
    const selected = selectedFunds.find((s) => s.amfiCode === f.amfiCode);
    const name = selected?.schemeName || f.amfiCode;
    const allocationPct = allocations[f.amfiCode] || 0;
    return { name, allocationPct, ...computeMCapAllocation(f, mCapIndex) };
  });

  // Portfolio-weighted average row: weight each fund's Large/Mid/Small/
  // Others/Derivatives % by that fund's allocation %, summed and divided
  // by the total allocation actually represented by readyFunds (not a
  // hardcoded 100, since some selected funds may still be loading).
  const totalAllocation = rows.reduce((s, r) => s + r.allocationPct, 0);
  const weightedAvg = totalAllocation > 0
    ? {
        large: rows.reduce((s, r) => s + r.large * r.allocationPct, 0) / totalAllocation,
        mid: rows.reduce((s, r) => s + r.mid * r.allocationPct, 0) / totalAllocation,
        small: rows.reduce((s, r) => s + r.small * r.allocationPct, 0) / totalAllocation,
        unclassified: rows.reduce((s, r) => s + r.unclassified * r.allocationPct, 0) / totalAllocation,
        derivatives: rows.reduce((s, r) => s + r.derivatives * r.allocationPct, 0) / totalAllocation,
      }
    : { large: 0, mid: 0, small: 0, unclassified: 0, derivatives: 0 };

  return (
    <CollapsibleSection title="Scheme M-Cap Allocation">
      <InlineSvg className="pfc-chart pfc-chart-scroll" svg={stackedBarSvg(rows)} />
      <p className="pfc-projection-note">
        Large Cap/Mid Cap/Small Cap/Others always sum to 100% of the fund's cash-equity holdings. <b>Derivatives</b> is a separate figure — net futures exposure as a % of the fund's total assets, shown alongside rather than folded into that 100%, since a short position should reduce it rather than vanish.
      </p>
      <div className="pfc-table-wrap">
        <table className="pfc-table pfc-table-wide">
          <thead>
            <tr>
              <th>Fund</th>
              <th className="pfc-table-pct">Large Cap</th>
              <th className="pfc-table-pct">Mid Cap</th>
              <th className="pfc-table-pct">Small Cap</th>
              <th className="pfc-table-pct">Others</th>
              <th className="pfc-table-pct">Derivatives</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="pfc-table-pct">{r.large.toFixed(1)}%</td>
                <td className="pfc-table-pct">{r.mid.toFixed(1)}%</td>
                <td className="pfc-table-pct">{r.small.toFixed(1)}%</td>
                <td className="pfc-table-pct">{r.unclassified.toFixed(1)}%</td>
                <td className="pfc-table-pct">{r.derivatives.toFixed(1)}%</td>
              </tr>
            ))}
            <tr className="pfc-mcap-avg">
              <td>Portfolio (weighted avg)</td>
              <td className="pfc-table-pct">{weightedAvg.large.toFixed(1)}%</td>
              <td className="pfc-table-pct">{weightedAvg.mid.toFixed(1)}%</td>
              <td className="pfc-table-pct">{weightedAvg.small.toFixed(1)}%</td>
              <td className="pfc-table-pct">{weightedAvg.unclassified.toFixed(1)}%</td>
              <td className="pfc-table-pct">{weightedAvg.derivatives.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

// The fetch-independent compute+render pipeline shared by the editable tool
// (ProposalStudioTool) and the read-only view (ProposalReadOnlyView) --
// both already have selectedFunds/holdingsByFund/holdingsError in state
// (each populates them with its own fetch effect, since the editable tool
// additionally defaults a manual fund's amount from its minimum investment
// on arrival, which a read-only view never needs to do) and hand them here
// to turn into the actual analysis output. `actionsExtra` is an optional
// node rendered in the actions bar after the Export button (Save/Share
// controls for the editable tool and the owner's mine/[id] page; omitted
// entirely by the public read-only view).
export function ProposalAnalysisBlock({
  selectedFunds, holdingsByFund, holdingsError, totalAmount, mCapIndex,
  proposalType, sipFrequency, clientName, clientEmail, clientPhone,
  advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin,
  proposalId, actionsExtra,
}) {
  const readyFunds = selectedFunds
    .filter((f) => holdingsByFund[f.amfiCode])
    .map((f) => ({ amfiCode: f.amfiCode, holdings: holdingsByFund[f.amfiCode].holdings }));
  const erroredFunds = selectedFunds.filter((f) => holdingsError[f.amfiCode]);
  const allocations = Object.fromEntries(
    selectedFunds.map((f) => [f.amfiCode, totalAmount > 0 ? (f.amount / totalAmount) * 100 : 0]),
  );
  const pendingCount = selectedFunds.length - readyFunds.length - erroredFunds.length;

  const errorNotices = erroredFunds.length > 0 && (
    <div className="pfc-fund-errors">
      {erroredFunds.map((f) => (
        <div className="pfc-error-hint" key={f.amfiCode}>
          Couldn't load holdings for {f.schemeName}: {holdingsError[f.amfiCode]}
        </div>
      ))}
    </div>
  );

  if (readyFunds.length === 0) {
    if (erroredFunds.length === selectedFunds.length) {
      return errorNotices;
    }
    return (
      <>
        {errorNotices}
        <div className="pfc-hint">Loading holdings…</div>
      </>
    );
  }

  const { assetAllocation, sectorExposure, stockExposure } = combineExposure(readyFunds, allocations);

  return (
    <>
      {errorNotices}
      {pendingCount > 0 && <div className="pfc-hint">Loading holdings for {pendingCount} more fund(s)…</div>}

      <div className="pfc-actions">
        <button
          className="pfc-export-btn"
          disabled={pendingCount > 0}
          title={pendingCount > 0 ? 'Wait for all fund holdings to finish loading before exporting' : undefined}
          onClick={() => exportProposalPDF({
            proposalType, sipFrequency, totalAmount, selectedFunds,
            assetAllocation, sectorExposure, stockExposure, readyFunds, allocations, mCapIndex,
            erroredFunds, clientName, clientEmail, clientPhone, holdingsByFund, proposalId,
            advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin,
          })}
        >
          {pendingCount > 0 ? 'Export / Print Proposal (loading…)' : 'Export / Print Proposal'}
        </button>
        {actionsExtra}
      </div>

      <ExposureTable title="Asset Allocation" rows={assetAllocation} chart="donut" />
      <ExposureTable title="Sector Exposure" rows={sectorExposure} chart="bars" />
      <ExposureTable title="Security Exposure" rows={stockExposure} fullRows={fullSecurityExposure(readyFunds, allocations)} chart="bars" />

      <SchemeDetailsTable selectedFunds={selectedFunds} holdingsByFund={holdingsByFund} />

      {readyFunds.length >= 2 && (
        <OverlapGrid funds={readyFunds} selectedFunds={selectedFunds} />
      )}
      {readyFunds.length === 1 && (
        <div className="pfc-hint">Add another fund to see overlap analysis.</div>
      )}

      {mCapIndex && <MCapTable selectedFunds={selectedFunds} readyFunds={readyFunds} mCapIndex={mCapIndex} allocations={allocations} />}

      <GrowthProjectionTable proposalType={proposalType} totalAmount={totalAmount} sipFrequency={sipFrequency} assetAllocation={assetAllocation} />

      <ClosingSection advisorName={advisorName} advisorArn={advisorArn} advisorEuin={advisorEuin} />

      {/* BenchmarkSection hidden for launch: it only matches funds benchmarked
          directly to a BSE index, which excludes most real funds. Revisit once
          AMFI's official FundCategory -> NSE/BSE index mapping
          (https://www.amfiindia.com/otherdata/listofbenchmarkindices) is wired up
          with NSE-first (pages/api/index-dashboard.js) / BSE-fallback matching. */}
    </>
  );
}
```

- [ ] **Step 2: Update `ProposalStudioClient.jsx`'s imports**

Replace lines 1-14:

```jsx
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProviderAvatar from '@/components/ProviderAvatar';
import RiskGauge from '@/components/RiskGauge';
import { startCheckout } from '@/lib/checkoutClient';
import { getMFLogoFromSchemeName } from '@/lib/providerLogos';
import { combineExposure, computeOverlap, computeMCapAllocation, normalizeName, isComparableHolding } from '@/lib/portfolioAnalysis';
import { PROPOSAL_STUDIO_FAQ } from '@/lib/proposalStudioFaq';
import { donutChartSvg, barRankingSvg, overlapHeatmapSvg, stackedBarSvg } from '@/lib/chartSvg';
import { blendedRate, buildProjectionTable, ASSUMED_CAGR } from '@/lib/growthProjection';
```

with:

```jsx
'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProviderAvatar from '@/components/ProviderAvatar';
import { startCheckout } from '@/lib/checkoutClient';
import { getMFLogoFromSchemeName } from '@/lib/providerLogos';
import { PROPOSAL_STUDIO_FAQ } from '@/lib/proposalStudioFaq';
import { formatProposalId, useMCapIndex, CollapsibleSection, ProposalAnalysisBlock } from './ProposalSections';
```

(`RiskGauge`, `combineExposure`/`computeOverlap`/`computeMCapAllocation`/`normalizeName`/`isComparableHolding`, `donutChartSvg`/`barRankingSvg`/`overlapHeatmapSvg`/`stackedBarSvg`, and `blendedRate`/`buildProjectionTable`/`ASSUMED_CAGR` are no longer used directly in this file — every consumer of them moved to `ProposalSections.jsx`. `CollapsibleSection` is now imported rather than defined locally, since `SavedProposalsSection` still uses it.)

- [ ] **Step 3: Remove the local `formatProposalId` definition**

Delete the block at (current) lines 156-161:

```jsx
function formatProposalId(id) {
  return 'PROP-' + String(id).replace(/-/g, '').slice(0, 8).toUpperCase();
}

```

- [ ] **Step 4: Replace the `mCapIndex` state + effect with the shared hook**

In `ProposalStudioTool`, delete the state declaration:

```jsx
  const [mCapIndex, setMCapIndex] = useState(null);         // Map<normalizedName, category>
```

and delete the effect:

```jsx
  // Load the AMFI M-Cap categorization index once on mount.
  useEffect(() => {
    fetch('/data/amfi-cap-categorization.json')
      .then((r) => r.json())
      .then((d) => setMCapIndex(new Map(Object.entries(d.categories))))
      .catch(() => setMCapIndex(new Map()));
  }, []);

```

Add, right after the `totalAmount` derived value (`const totalAmount = selectedFunds.reduce(...)`):

```jsx
  const mCapIndex = useMCapIndex();
```

- [ ] **Step 5: Replace the inline analysis IIFE with `ProposalAnalysisBlock`**

Replace the entire block from `{selectedFunds.length > 0 && (() => {` through its closing `})()}` (current lines 564-652, i.e. everything between the `<FundPicker ... />` close tag and the closing `</div>` of `ProposalStudioTool`'s return) with:

```jsx
      {selectedFunds.length > 0 && (
        <ProposalAnalysisBlock
          selectedFunds={selectedFunds}
          holdingsByFund={holdingsByFund}
          holdingsError={holdingsError}
          totalAmount={totalAmount}
          mCapIndex={mCapIndex}
          proposalType={proposalType}
          sipFrequency={sipFrequency}
          clientName={clientName}
          clientEmail={clientEmail}
          clientPhone={clientPhone}
          advisorName={advisorName}
          advisorPhone={advisorPhone}
          advisorEmail={advisorEmail}
          advisorArn={advisorArn}
          advisorEuin={advisorEuin}
          proposalId={savedProposalId}
          actionsExtra={
            <>
              <button className="pfc-save-btn" disabled={saveStatus === 'saving'} onClick={saveProposal}>
                {saveStatus === 'saving' ? 'Saving…' : 'Save Proposal'}
              </button>
              {saveStatus === 'saved' && savedProposalId && (
                <span className="pfc-proposal-id">Saved · Proposal ID: {formatProposalId(savedProposalId)}</span>
              )}
              {saveStatus === 'error' && <span className="pfc-error-hint">{saveError}</span>}
            </>
          }
        />
      )}
```

(Task 11 replaces this `actionsExtra` value again to add `ShareControls` — this task only needs to reproduce today's exact behavior with the new shared component.)

- [ ] **Step 6: Delete the moved definitions**

Delete the entire block from `function InlineSvg({ svg, className })` through the end of `MCapTable` (current lines 657-1263 — i.e. everything between the closing `</div>` of `ProposalStudioTool` / `}` closing that function, and `function FundPicker(...)`). All of it now lives in `ProposalSections.jsx` (Step 1).

`FundPicker` (current lines 1264-1434) is untouched and stays in `ProposalStudioClient.jsx`.

- [ ] **Step 7: Build check**

Run: `npm run build`
Expected: builds cleanly with no unused-import warnings and no missing-reference errors. This is a pure refactor — the editor's behavior must be pixel-identical to before. Also run the existing pure-logic regression suite to confirm nothing in the shared math broke in transit:

```bash
node tests/portfolioAnalysis.test.js
node tests/chartSvg.test.js
node tests/riskometer.test.js
```

Expected: all still pass (this task doesn't touch any of those files' logic, but confirms the extraction didn't accidentally change an imported function's behavior).

- [ ] **Step 8: Manual smoke test**

Run `npm run dev`, open `/proposal-studio`, add 2+ funds from search, confirm: Asset Allocation/Sector/Security tables render, "Show all N holdings" toggle works, Overlap grid renders for 2+ funds, M-Cap table renders, Growth Projection renders, Save Proposal still works, Export/Print still opens a populated PDF window. This is the critical manual check for this task since it's a large mechanical move with no per-component automated test.

- [ ] **Step 9: Commit**

```bash
git add app/proposal-studio/ProposalSections.jsx app/proposal-studio/ProposalStudioClient.jsx
git commit -m "refactor(proposal-studio): extract shared rendering pipeline into ProposalSections.jsx"
```

---

### Task 9: `ShareControls.jsx` — Share/Copy/Unshare/Send-Email widget

**Files:**
- Create: `app/proposal-studio/ShareControls.jsx`
- Modify: `app/proposal-studio/proposal-studio.css` (append)

**Interfaces:**
- Consumes: `POST /api/proposal-studio/share`, `POST /api/proposal-studio/unshare`, `POST /api/proposal-studio/send-email` (Tasks 3, 6).
- Produces: `<ShareControls proposalId={string} initialShareToken={string|null} clientEmail={string|undefined} />`. Consumed by `ProposalStudioClient.jsx` (Task 11) and `app/proposal-studio/mine/[id]/page.js` (Task 13).

- [ ] **Step 1: Write the component**

```jsx
'use client';

/**
 * app/proposal-studio/ShareControls.jsx
 *
 * Share/Copy Link/Unshare/Send Email widget for a saved proposal -- shared
 * by two call sites: ProposalStudioTool's own .pfc-actions bar right after
 * a fresh save (initialShareToken is always null there, since saveProposal
 * always creates a brand-new, as-yet-unshared row -- see
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md,
 * decision 3), and app/proposal-studio/mine/[id]/page.js for a proposal
 * reopened later from "My Saved Proposals" (initialShareToken there comes
 * from /api/proposal-studio/load's shareToken field).
 */

import { useState } from 'react';

export default function ShareControls({ proposalId, initialShareToken, clientEmail }) {
  const [shareToken, setShareToken] = useState(initialShareToken || null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState('');
  const [copyLabel, setCopyLabel] = useState('Copy Link');
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(clientEmail || '');
  const [emailStatus, setEmailStatus] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'
  const [emailError, setEmailError] = useState('');

  const shareUrl = shareToken && typeof window !== 'undefined'
    ? `${window.location.origin}/proposal-studio/view/${shareToken}`
    : '';

  async function handleShare() {
    setShareBusy(true);
    setShareError('');
    try {
      const res = await fetch('/api/proposal-studio/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proposalId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not share this proposal.');
      setShareToken(data.shareToken);
    } catch (err) {
      setShareError(err.message);
    } finally {
      setShareBusy(false);
    }
  }

  async function handleUnshare() {
    setShareBusy(true);
    setShareError('');
    try {
      const res = await fetch('/api/proposal-studio/unshare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proposalId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not unshare this proposal.');
      setShareToken(null);
    } catch (err) {
      setShareError(err.message);
    } finally {
      setShareBusy(false);
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopyLabel('Copied!');
    } catch {
      setCopyLabel('Copy failed');
    }
    setTimeout(() => setCopyLabel('Copy Link'), 1500);
  }

  async function handleSendEmail(e) {
    e.preventDefault();
    setEmailStatus('sending');
    setEmailError('');
    try {
      const res = await fetch('/api/proposal-studio/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: proposalId, toEmail: emailTo }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not send the email.');
      setEmailStatus('sent');
      // send-email/route.js shares the proposal first if it wasn't already
      // -- the response carries the resulting token, so this reflects that
      // immediately instead of requiring the user to reopen the page.
      if (data.shareToken) setShareToken(data.shareToken);
    } catch (err) {
      setEmailStatus('error');
      setEmailError(err.message);
    }
  }

  return (
    <div className="pfc-share-controls">
      {!shareToken && (
        <button type="button" className="pfc-save-btn" disabled={shareBusy} onClick={handleShare}>
          {shareBusy ? 'Sharing…' : 'Share'}
        </button>
      )}
      {shareToken && (
        <>
          <input className="pfc-client-input pfc-share-link-input" readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
          <button type="button" className="pfc-save-btn" onClick={handleCopy}>{copyLabel}</button>
          <button type="button" className="pfc-saved-delete" disabled={shareBusy} onClick={handleUnshare}>
            {shareBusy ? 'Unsharing…' : 'Unshare'}
          </button>
        </>
      )}
      {shareError && <span className="pfc-error-hint">{shareError}</span>}

      <button type="button" className="pfc-save-btn" onClick={() => setEmailOpen((o) => !o)}>
        {emailOpen ? 'Close' : 'Send Email'}
      </button>

      {emailOpen && (
        <form className="pfc-send-email-form" onSubmit={handleSendEmail}>
          <input
            className="pfc-client-input"
            type="email"
            required
            placeholder="Client email"
            value={emailTo}
            onChange={(e) => setEmailTo(e.target.value)}
          />
          <button type="submit" className="pfc-save-btn" disabled={emailStatus === 'sending'}>
            {emailStatus === 'sending' ? 'Sending…' : 'Send'}
          </button>
          {emailStatus === 'sent' && <span className="pfc-hint">Email sent.</span>}
          {emailStatus === 'error' && <span className="pfc-error-hint">{emailError}</span>}
        </form>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS**

Append to `app/proposal-studio/proposal-studio.css`:

```css
.pfc-share-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pfc-share-link-input { flex: 1 1 220px; max-width: 360px; font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted); background: var(--surface2, #edf6ed); }
.pfc-send-email-form { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; width: 100%; margin-top: 4px; }
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: builds cleanly (this component isn't wired into any page yet — that happens in Tasks 11 and 13 — so this step only confirms it compiles standalone).

- [ ] **Step 4: Commit**

```bash
git add app/proposal-studio/ShareControls.jsx app/proposal-studio/proposal-studio.css
git commit -m "feat(proposal-studio): add ShareControls widget"
```

---

### Task 10: `ProposalReadOnlyView.jsx`

**Files:**
- Create: `app/proposal-studio/ProposalReadOnlyView.jsx`
- Modify: `app/proposal-studio/proposal-studio.css` (append)

**Interfaces:**
- Consumes: `formatProposalId`, `useMCapIndex`, `ProposalAnalysisBlock` from `./ProposalSections` (Task 8); `GET /api/proposal-studio/holdings` (existing, unchanged, public).
- Produces: `<ProposalReadOnlyView clientName clientEmail clientPhone advisorName advisorPhone advisorEmail advisorArn advisorEuin proposalType sipFrequency selectedFunds proposalId? />`. Consumed by `app/proposal-studio/view/[token]/page.js` (Task 12) and `app/proposal-studio/mine/[id]/page.js` (Task 13).

- [ ] **Step 1: Write the component**

```jsx
'use client';

/**
 * app/proposal-studio/ProposalReadOnlyView.jsx
 *
 * Read-only rendering of a proposal -- used by BOTH the public
 * /proposal-studio/view/[token] page (no proposalId passed, since the
 * public API route never returns one) and the owner's
 * /proposal-studio/mine/[id] page (proposalId passed so Export/Print can
 * show "Proposal ID: PROP-XXXX" like the editor does). Runs its own
 * holdings-fetch effect -- simpler than ProposalStudioTool's, since a
 * read-only view never needs to default a fund's amount from its minimum
 * investment (amounts are already fixed by whoever saved the proposal) --
 * then hands the result to the same ProposalAnalysisBlock the editable
 * tool uses, so the two stay pixel-identical for the parts they share. See
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md.
 */

import { useState, useEffect } from 'react';
import { useMCapIndex, ProposalAnalysisBlock } from './ProposalSections';

export default function ProposalReadOnlyView({
  clientName, clientEmail, clientPhone,
  advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin,
  proposalType, sipFrequency, selectedFunds, proposalId,
}) {
  const [holdingsByFund, setHoldingsByFund] = useState({});
  const [holdingsError, setHoldingsError] = useState({});
  const mCapIndex = useMCapIndex();

  useEffect(() => {
    selectedFunds.forEach(({ amfiCode, schemeName }) => {
      if (holdingsByFund[amfiCode] || holdingsError[amfiCode]) return;
      fetch(`/api/proposal-studio/holdings?amfiCode=${encodeURIComponent(amfiCode)}&schemeName=${encodeURIComponent(schemeName)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setHoldingsError((prev) => ({ ...prev, [amfiCode]: data.error }));
          } else {
            setHoldingsByFund((prev) => ({ ...prev, [amfiCode]: data }));
          }
        })
        .catch(() => setHoldingsError((prev) => ({ ...prev, [amfiCode]: 'Failed to load holdings' })));
    });
  }, [selectedFunds, holdingsByFund, holdingsError]);

  const totalAmount = selectedFunds.reduce((s, f) => s + (f.amount || 0), 0);

  return (
    <div className="pfc-tool">
      <div className="pfc-readonly-parties">
        <div className="pfc-readonly-party">
          <div className="pfc-readonly-label">Prepared For</div>
          <div className="pfc-readonly-name">{clientName || 'Client'}</div>
          {clientEmail && <div className="pfc-readonly-detail">{clientEmail}</div>}
          {clientPhone && <div className="pfc-readonly-detail">{clientPhone}</div>}
        </div>
        <div className="pfc-readonly-party">
          <div className="pfc-readonly-label">Prepared By</div>
          <div className="pfc-readonly-name">{advisorName || 'Advisor'}</div>
          {advisorPhone && <div className="pfc-readonly-detail">{advisorPhone}</div>}
          {advisorEmail && <div className="pfc-readonly-detail">{advisorEmail}</div>}
          <div className="pfc-readonly-detail">{advisorArn}{advisorEuin ? ` · EUIN: ${advisorEuin}` : ''}</div>
        </div>
      </div>

      {selectedFunds.length > 0 && (
        <ProposalAnalysisBlock
          selectedFunds={selectedFunds}
          holdingsByFund={holdingsByFund}
          holdingsError={holdingsError}
          totalAmount={totalAmount}
          mCapIndex={mCapIndex}
          proposalType={proposalType}
          sipFrequency={sipFrequency}
          clientName={clientName}
          clientEmail={clientEmail}
          clientPhone={clientPhone}
          advisorName={advisorName}
          advisorPhone={advisorPhone}
          advisorEmail={advisorEmail}
          advisorArn={advisorArn}
          advisorEuin={advisorEuin}
          proposalId={proposalId}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add CSS**

Append to `app/proposal-studio/proposal-studio.css`:

```css
.pfc-readonly-parties { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px; }
.pfc-readonly-party { flex: 1 1 220px; background: var(--surface, #fff); border: 1px solid var(--border); border-radius: 12px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.04); }
.pfc-readonly-label { font: 600 11px Raleway, sans-serif; letter-spacing: .5px; text-transform: uppercase; color: var(--muted); margin-bottom: 6px; }
.pfc-readonly-name { font: 700 15px Raleway, sans-serif; color: var(--text, #1e293b); margin-bottom: 2px; }
.pfc-readonly-detail { font: 400 13px Raleway, sans-serif; color: var(--muted); }
.pfc-readonly-notfound { text-align: center; padding: 80px 20px; color: var(--muted); font: 500 15px Raleway, sans-serif; }
```

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: builds cleanly (not wired into a page yet — Tasks 12/13 do that).

- [ ] **Step 4: Commit**

```bash
git add app/proposal-studio/ProposalReadOnlyView.jsx app/proposal-studio/proposal-studio.css
git commit -m "feat(proposal-studio): add ProposalReadOnlyView component"
```

---

### Task 11: Wire `ShareControls`, "View" link, and `?load=` auto-load into `ProposalStudioClient.jsx`

**Files:**
- Modify: `app/proposal-studio/ProposalStudioClient.jsx`

**Interfaces:**
- Consumes: `ShareControls` (Task 9), `formatProposalId` (already imported per Task 8).
- Produces: the editor's `.pfc-actions` bar now shows Share/Copy/Unshare/Send-Email once a proposal is saved; the saved-proposals list has a "View" link per row to `/proposal-studio/mine/[id]`; visiting `/proposal-studio?load=<id>` auto-loads that proposal into the editor (what `mine/[id]`'s "Edit this proposal" button — Task 13 — navigates to).

- [ ] **Step 1: Import `ShareControls` and `Suspense`**

At the top of `ProposalStudioClient.jsx`, change:

```jsx
import { useState, useEffect, useRef, useMemo } from 'react';
```

to:

```jsx
import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
```

and add, alongside the other local imports:

```jsx
import { useSearchParams } from 'next/navigation';
import ShareControls from './ShareControls';
```

- [ ] **Step 2: Wrap `<ProposalStudioTool />` in `<Suspense>`**

In the top-level `ProposalStudioClient` component, change:

```jsx
        {isAuthed && isPro && <ProposalStudioTool />}
```

to:

```jsx
        {isAuthed && isPro && (
          <Suspense fallback={<div className="pfc-hint">Loading…</div>}>
            <ProposalStudioTool />
          </Suspense>
        )}
```

(`useSearchParams`, added to `ProposalStudioTool` in Step 3, requires a `Suspense` boundary around any component that calls it — same pattern already used in `app/complete-profile/page.jsx`.)

- [ ] **Step 3: Auto-load a proposal from `?load=<id>`**

In `ProposalStudioTool`, right after the existing CAS-derived-fund-list effect (the one ending `return () => { cancelled = true; };`, just before `function addCasFund`), add:

```jsx
  // Lets app/proposal-studio/mine/[id]/page.js's "Edit this proposal"
  // button navigate here and have that proposal load automatically,
  // reusing the same loadSavedProposal flow a saved-list row click already
  // triggers.
  const searchParams = useSearchParams();
  const loadParam = searchParams.get('load');
  useEffect(() => {
    if (loadParam) loadSavedProposal(loadParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadParam]);
```

(This effect references `loadSavedProposal`, which is defined further down in the same component. Function declarations are hoisted within the component body's execution, and by the time this effect actually *runs* — after the initial render — `loadSavedProposal` already exists as a closure variable, so this is safe despite appearing before its `async function loadSavedProposal(id) {...}` definition in source order. `useSearchParams` itself must be called unconditionally at the top level of the component per React's Hook rules — placing this snippet directly after the CAS-fund-list effect keeps it grouped with the other startup effects rather than scattered.)

- [ ] **Step 4: Add `ShareControls` to the actions bar**

Change the `actionsExtra` value from Task 8's Step 5 (currently just the Save button/status) to:

```jsx
          actionsExtra={
            <>
              <button className="pfc-save-btn" disabled={saveStatus === 'saving'} onClick={saveProposal}>
                {saveStatus === 'saving' ? 'Saving…' : 'Save Proposal'}
              </button>
              {saveStatus === 'saved' && savedProposalId && (
                <span className="pfc-proposal-id">Saved · Proposal ID: {formatProposalId(savedProposalId)}</span>
              )}
              {saveStatus === 'error' && <span className="pfc-error-hint">{saveError}</span>}
              {saveStatus === 'saved' && savedProposalId && (
                <ShareControls key={savedProposalId} proposalId={savedProposalId} initialShareToken={null} clientEmail={clientEmail} />
              )}
            </>
          }
```

(`initialShareToken` is always `null` here: `saveProposal()` always `INSERT`s a brand-new row, per decision 3, so a just-saved proposal is never already shared. `key={savedProposalId}` forces `ShareControls` to remount — resetting its internal share state — whenever the user saves again and gets a different id, e.g. after editing and re-saving.)

- [ ] **Step 5: Add a "View" link to `SavedProposalsSection`**

In `SavedProposalsSection`'s row rendering, change:

```jsx
                  <>
                    <button className="pfc-saved-main" onClick={() => onLoad(p.id)}>
                      <span className="pfc-saved-id">{formatProposalId(p.id)}</span>
                      <span className="pfc-saved-name">{p.client_name || 'Unnamed client'}</span>
                      <span className="pfc-saved-meta">
                        {p.proposal_type === 'sip' ? 'SIP' : 'Lumpsum'} · ₹{Number(p.total_amount).toLocaleString('en-IN')} · {p.fund_count} fund{p.fund_count === 1 ? '' : 's'} · {new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </button>
                    <button className="pfc-saved-delete" onClick={() => setDeletingId(p.id)}>Delete</button>
                  </>
```

to:

```jsx
                  <>
                    <button className="pfc-saved-main" onClick={() => onLoad(p.id)}>
                      <span className="pfc-saved-id">{formatProposalId(p.id)}</span>
                      <span className="pfc-saved-name">{p.client_name || 'Unnamed client'}</span>
                      <span className="pfc-saved-meta">
                        {p.proposal_type === 'sip' ? 'SIP' : 'Lumpsum'} · ₹{Number(p.total_amount).toLocaleString('en-IN')} · {p.fund_count} fund{p.fund_count === 1 ? '' : 's'} · {new Date(p.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </button>
                    <a className="pfc-saved-view" href={`/proposal-studio/mine/${p.id}`}>View</a>
                    <button className="pfc-saved-delete" onClick={() => setDeletingId(p.id)}>Delete</button>
                  </>
```

- [ ] **Step 6: Add CSS for the "View" link**

Append to `app/proposal-studio/proposal-studio.css`:

```css
.pfc-saved-view { flex-shrink: 0; display: flex; align-items: center; border: none; background: transparent; color: var(--g2); cursor: pointer; font: 500 12px Raleway, sans-serif; padding: 8px 12px; align-self: stretch; text-decoration: none; transition: background 0.15s; }
.pfc-saved-view:hover { background: var(--surface2, #edf6ed); }
```

- [ ] **Step 7: Build check**

Run: `npm run build`
Expected: builds cleanly.

- [ ] **Step 8: Manual smoke test**

Run `npm run dev`, sign in, save a proposal in `/proposal-studio`, confirm Share/Copy Link/Send Email controls appear and (with a live DB — see the manual checklist at the end of this plan) function. Confirm the saved-proposals list shows a "View" link per row (it will 404 until Task 13 lands, which is expected mid-plan). Confirm `/proposal-studio?load=<some-existing-id-you-own>` auto-populates the editor exactly like clicking that row would.

- [ ] **Step 9: Commit**

```bash
git add app/proposal-studio/ProposalStudioClient.jsx app/proposal-studio/proposal-studio.css
git commit -m "feat(proposal-studio): wire share controls, view link, and edit-via-url into the editor"
```

---

### Task 12: Public page `app/proposal-studio/view/[token]/page.js`

**Files:**
- Create: `app/proposal-studio/view/[token]/page.js`

**Interfaces:**
- Consumes: `GET /api/proposal-studio/shared/[token]` (Task 4), `ProposalReadOnlyView` (Task 10).

- [ ] **Step 1: Write the page**

```jsx
'use client';

/**
 * app/proposal-studio/view/[token]/page.js
 *
 * Public, unauthenticated view of a shared proposal -- no sign-in check,
 * mirroring the public /api/proposal-studio/shared/[token] route it calls.
 * A revoked or unknown token shows a plain message rather than a raw
 * error, matching the API route's deliberately generic 404. See
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md.
 */

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import '../../proposal-studio.css';
import ProposalReadOnlyView from '../../ProposalReadOnlyView';

export default function ProposalPublicViewPage() {
  const { token } = useParams();
  const [state, setState] = useState({ loading: true, data: null, notFound: false });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/proposal-studio/shared/${encodeURIComponent(token)}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) setState({ loading: false, data: null, notFound: true });
        else setState({ loading: false, data, notFound: false });
      })
      .catch(() => { if (!cancelled) setState({ loading: false, data: null, notFound: true }); });
    return () => { cancelled = true; };
  }, [token]);

  return (
    <>
      <Navbar />
      <main className="pfc-page">
        {state.loading && <div className="pfc-hint">Loading proposal…</div>}
        {!state.loading && state.notFound && (
          <div className="pfc-readonly-notfound">This proposal link isn't available. It may have been removed, or the link may be incorrect.</div>
        )}
        {!state.loading && state.data && (
          <>
            <h1 className="pfc-title">Investment Proposal</h1>
            <p className="pfc-subtitle">Shared by {state.data.advisorName || 'your advisor'} via Abundance Financial Services.</p>
            <ProposalReadOnlyView
              clientName={state.data.clientName}
              clientEmail={state.data.clientEmail}
              clientPhone={state.data.clientPhone}
              advisorName={state.data.advisorName}
              advisorPhone={state.data.advisorPhone}
              advisorEmail={state.data.advisorEmail}
              advisorArn={state.data.advisorArn}
              advisorEuin={state.data.advisorEuin}
              proposalType={state.data.proposalType}
              sipFrequency={state.data.sipFrequency}
              selectedFunds={state.data.selectedFunds || []}
            />
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: builds cleanly.

- [ ] **Step 3: Manual smoke test**

Deferred to the end-of-plan manual checklist (needs a live DB/R2-backed share token to open).

- [ ] **Step 4: Commit**

```bash
git add "app/proposal-studio/view/[token]/page.js"
git commit -m "feat(proposal-studio): add public shared-proposal view page"
```

---

### Task 13: Owner page `app/proposal-studio/mine/[id]/page.js`

**Files:**
- Create: `app/proposal-studio/mine/[id]/page.js`

**Interfaces:**
- Consumes: `GET /api/proposal-studio/load` (Task 7's updated response), `ShareControls` (Task 9), `ProposalReadOnlyView` (Task 10), `formatProposalId` (`./ProposalSections`, Task 8).

- [ ] **Step 1: Write the page**

```jsx
'use client';

/**
 * app/proposal-studio/mine/[id]/page.js
 *
 * Owner-only detail page for a saved proposal: read-only rendering plus
 * Edit/Share/Unshare/Send-Email controls. [id] is the proposal's raw
 * internal UUID (the same value formatProposalId() cosmetically shortens
 * to PROP-XXXXXXXX elsewhere) -- not the formatted display id, which is
 * not a routable identifier. Redirects signed-out visitors to /login; shows
 * a friendly message (not a raw error) if signed in but not the owner. See
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md.
 */

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import '../../proposal-studio.css';
import ProposalReadOnlyView from '../../ProposalReadOnlyView';
import ShareControls from '../../ShareControls';
import { formatProposalId } from '../../ProposalSections';

export default function ProposalOwnerViewPage() {
  const { id } = useParams();
  const router = useRouter();
  const { status } = useSession();
  const [state, setState] = useState({ loading: true, data: null, forbidden: false });

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    fetch(`/api/proposal-studio/load?id=${encodeURIComponent(id)}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) { setState({ loading: false, data: null, forbidden: true }); return; }
        setState({ loading: false, data, forbidden: false });
      })
      .catch(() => { if (!cancelled) setState({ loading: false, data: null, forbidden: true }); });
    return () => { cancelled = true; };
  }, [id, status]);

  if (state.loading || status === 'loading') {
    return (
      <>
        <Navbar />
        <main className="pfc-page"><div className="pfc-hint">Loading proposal…</div></main>
        <Footer />
      </>
    );
  }

  if (state.forbidden) {
    return (
      <>
        <Navbar />
        <main className="pfc-page">
          <div className="pfc-readonly-notfound">This proposal isn't available, or you don't have access to it.</div>
        </main>
        <Footer />
      </>
    );
  }

  const data = state.data;

  return (
    <>
      <Navbar activePage="proposal-studio" />
      <main className="pfc-page">
        <h1 className="pfc-title">Proposal {formatProposalId(id)}</h1>
        <p className="pfc-subtitle">{data.clientName || 'Client'} · {data.proposalType === 'sip' ? 'SIP' : 'Lumpsum'}</p>

        <div className="pfc-actions">
          <button type="button" className="pfc-save-btn" onClick={() => router.push(`/proposal-studio?load=${encodeURIComponent(id)}`)}>
            Edit this proposal
          </button>
          <ShareControls proposalId={id} initialShareToken={data.shareToken} clientEmail={data.clientEmail} />
        </div>

        <ProposalReadOnlyView
          clientName={data.clientName}
          clientEmail={data.clientEmail}
          clientPhone={data.clientPhone}
          advisorName={data.advisorName}
          advisorPhone={data.advisorPhone}
          advisorEmail={data.advisorEmail}
          advisorArn={data.advisorArn}
          advisorEuin={data.advisorEuin}
          proposalType={data.proposalType}
          sipFrequency={data.sipFrequency}
          selectedFunds={data.selectedFunds || []}
          proposalId={id}
        />
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: builds cleanly.

- [ ] **Step 3: Manual smoke test**

Deferred to the end-of-plan manual checklist (needs a live DB — sign in, save a proposal, click its "View" link from Task 11, confirm Edit/Share/Unshare/Send-Email all work end to end).

- [ ] **Step 4: Commit**

```bash
git add "app/proposal-studio/mine/[id]/page.js"
git commit -m "feat(proposal-studio): add owner proposal detail page with share controls"
```

---

## Manual Verification After Deployment

Nothing touching the database, R2, or Resend can be exercised in this sandbox (no live credentials). Once all tasks above are merged and deployed:

1. **Run the schema change once**, in the Vercel Dashboard → Storage → your DB → Query tab:
   ```sql
   ALTER TABLE proposals ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
   CREATE INDEX IF NOT EXISTS idx_proposals_share_token ON proposals(share_token) WHERE share_token IS NOT NULL;
   ```
2. **Share → copy → open anonymously**: as a signed-in Pro user, save a proposal, click Share on the editor's actions bar, copy the link, open it in a private/incognito window. Confirm it renders fully (all sections, Export/Print works) with no sign-in prompt.
3. **Unshare → confirm 404**: click Unshare, reload the same link. Confirm it shows "This proposal link isn't available" rather than the proposal.
4. **Re-share is idempotent**: click Share again on the same proposal. Confirm the link is different from the one issued in step 2 (a fresh token, since the old one was cleared by Unshare) and works the same way.
5. **Send Email**: open a saved proposal's "Send Email" form, send to a real inbox, confirm the email arrives with correct branding, the advisor's name/phone/email, and a working link — and confirm the editor/owner page's Share UI now shows that proposal as shared (send-email shares it automatically if it wasn't already).
6. **Owner page (`mine/[id]`)**: from "My Saved Proposals", click "View" on a row, confirm the detail page loads, Edit navigates back into the editor with that proposal pre-loaded, and Share/Unshare/Send-Email all work from there too.
7. **Ownership enforcement**: while signed in as a *different* user, try to open `/proposal-studio/mine/<someone-else's-id>` directly. Confirm it shows the friendly "not available" message, not the proposal.
8. **Live-data freshness**: confirm a shared proposal's Asset Allocation/Overlap/M-Cap numbers reflect each fund's *current* disclosed holdings (not a snapshot from when it was saved) — matches decision 7 in the spec.
