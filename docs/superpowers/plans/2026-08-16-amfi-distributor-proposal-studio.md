# AMFI Distributor Lookup — Shared Service + Proposal Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Proposal Studio auto-fill and live-verify a distributor's own details from their ARN number via AMFI India's public distributor registry, with a client-side compliance gate on sharing/sending and a verified trust badge on shared proposals.

**Architecture:** A new server-only `lib/amfiDistributor.js` (ARN extraction + AMFI fetch + block-status helpers) backs a new cached `GET /api/distributor?arn=` route (R2, 30-day TTL, per-ARN key, following `app/api/sif-nav/route.js`'s exact pattern). Proposal Studio's existing `AdvisorDetailsCard` calls this route on ARN blur (and once on mount), fills empty advisor fields, and shows inline status. The verified status is persisted with the proposal so `ProposalReadOnlyView` can render a trust badge without a live re-check, and disables Share/Send Email client-side when the ARN is non-compliant or expired.

**Tech Stack:** Next.js App Router (`app/api/*/route.js`), React client components (`'use client'`), Cloudflare R2 via `lib/r2.js`, plain Node + `assert` tests (no framework).

## Global Constraints

- AMFI endpoint: `GET https://www.amfiindia.com/api/distributor-agent?strOpt=ALL&search={arn}&page=1&pageSize=10` — undocumented, no rate-limit guarantee. Server-side calls only, never from the client.
- Cache: Cloudflare R2 via `lib/r2.js`'s `r2Get`/`r2Put`, key `distributor-arn/{arn}.json`, **30-day TTL**.
- On upstream failure: serve a stale cache if one exists; only return `502` when there is no cache at all (fresh or stale).
- ARN UI convention includes the `ARN-` prefix (e.g. `'ARN-251838'`); AMFI's API wants bare digits. All extraction goes through one shared function, `extractArnDigits`.
- Auto-fill only ever writes to a field that is currently empty — never overwrites something the distributor already typed.
- The compliance gate (Share/Send Email disabled when not KYD-compliant or ARN expired) is **client-side only** in this plan — no changes to `app/api/proposal-studio/share/route.js` or `send-email/route.js`.
- The trust badge appears **only** in `ProposalReadOnlyView.jsx` (the on-screen shared-link / owner view) — **not** in `exportProposalPDF()`'s generated HTML (`ProposalSections.jsx`), which is explicitly out of scope for this plan.
- Test convention: plain Node + `assert`, run via `node tests/<file>.test.js`, no framework. `lib/amfiDistributor.js` uses ES module `export` syntax (matching `lib/riskometer.js`, since it's consumed by a Next.js App Router route) — its test file uses the same `require('assert')` + `await import(...)` pattern as `tests/riskometer.test.js`, not a plain top-level `require()`, since this project's `package.json` has no `"type": "module"`.

---

## File Structure

- **Create** `lib/amfiDistributor.js` — `extractArnDigits`, `fetchDistributorByArn`, `isArnBlocked`, `arnBlockedReason`. Pure/server-only, no React.
- **Create** `tests/amfiDistributor.test.js` — unit tests for the four functions above.
- **Create** `app/api/distributor/route.js` — the cached proxy route.
- **Modify** `app/proposal-studio/ProposalStudioClient.jsx` — `arnLookup` state, `checkArn()`, mount/blur triggers, `AdvisorDetailsCard`'s inline status UI, save-payload/`loadSavedProposal` wiring, `ShareControls` gate props.
- **Modify** `app/api/proposal-studio/save/route.js` — accept and persist `advisorArnVerified`.
- **Modify** `app/proposal-studio/ProposalReadOnlyView.jsx` — new `advisorArnVerified` prop, badge rendering.
- **Modify** `app/api/proposal-studio/shared/[token]/route.js` — add `advisorArnVerified` to the public response whitelist.
- **Modify** `app/proposal-studio/view/[token]/page.js` — thread `advisorArnVerified` through to `ProposalReadOnlyView`.
- **Modify** `app/proposal-studio/mine/[id]/page.js` — thread `advisorArnVerified` through to `ProposalReadOnlyView`, and gate its `ShareControls`.
- **Modify** `app/proposal-studio/ShareControls.jsx` — `arnBlocked`/`arnBlockedReason` props disable Share and Send Email.

---

### Task 1: `lib/amfiDistributor.js` — ARN extraction, AMFI fetch, block-status helpers

**Files:**
- Create: `lib/amfiDistributor.js`
- Test: `tests/amfiDistributor.test.js`

**Interfaces:**
- Produces: `extractArnDigits(text: string|null|undefined): string|null`, `fetchDistributorByArn(arn: string): Promise<DistributorRecord|null>` (throws on network/HTTP failure), `isArnBlocked(verified: {kydCompliant?: boolean, arnValidTill?: string}|null): boolean`, `arnBlockedReason(verified): string|null`. `DistributorRecord` shape: `{ arn, name, phone, email, address, city, pin, kydCompliant: boolean, arnValidFrom, arnValidTill, euin, sifValidFrom, sifValidTill }`.
- Consumed by: Task 2's route, Task 3/4/5/6's Proposal Studio changes.

- [ ] **Step 1: Write the failing tests**

Create `tests/amfiDistributor.test.js`:

```js
// tests/amfiDistributor.test.js
//
// Unit tests for lib/amfiDistributor.js's pure functions (extractArnDigits,
// isArnBlocked, arnBlockedReason). lib/amfiDistributor.js uses ES module
// import/export syntax (it's consumed by a Next.js App Router route), and
// this project's package.json has no "type": "module", so plain require()
// cannot load it under Node's CommonJS default -- use dynamic import()
// instead, same as tests/riskometer.test.js.
// Run with: node tests/amfiDistributor.test.js

const assert = require('assert');

(async () => {
  const { extractArnDigits, isArnBlocked, arnBlockedReason } = await import('../lib/amfiDistributor.js');

  console.log('=== Running amfiDistributor Unit Tests ===\n');

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

  // ── extractArnDigits ──────────────────────────────────────────────────
  test('extracts digits from an ARN- prefixed string', () => {
    assert.strictEqual(extractArnDigits('ARN-251838'), '251838');
  });

  test('extracts digits from an ARN-prefixed string with a space instead of a dash', () => {
    assert.strictEqual(extractArnDigits('ARN 251838'), '251838');
  });

  test('accepts a bare digit string with no prefix', () => {
    assert.strictEqual(extractArnDigits('251838'), '251838');
  });

  test('trims surrounding whitespace on a bare digit string', () => {
    assert.strictEqual(extractArnDigits('  251838  '), '251838');
  });

  test('returns null for "Direct"', () => {
    assert.strictEqual(extractArnDigits('Direct'), null);
  });

  test('returns null for a blank string', () => {
    assert.strictEqual(extractArnDigits(''), null);
  });

  test('returns null for a whitespace-only string', () => {
    assert.strictEqual(extractArnDigits('   '), null);
  });

  test('returns null for null input', () => {
    assert.strictEqual(extractArnDigits(null), null);
  });

  test('returns null for undefined input', () => {
    assert.strictEqual(extractArnDigits(undefined), null);
  });

  test('returns null for a person\'s name', () => {
    assert.strictEqual(extractArnDigits('Atin Kumar Agrawal'), null);
  });

  test('returns null for a digit run shorter than 4 digits', () => {
    assert.strictEqual(extractArnDigits('123'), null);
  });

  test('returns null for a digit run longer than 7 digits', () => {
    assert.strictEqual(extractArnDigits('12345678'), null);
  });

  test('returns null for an ARN-prefixed digit run longer than 7 digits', () => {
    assert.strictEqual(extractArnDigits('ARN-12345678'), null);
  });

  // ── isArnBlocked / arnBlockedReason ──────────────────────────────────
  test('isArnBlocked is false for null (no verification data)', () => {
    assert.strictEqual(isArnBlocked(null), false);
  });

  test('isArnBlocked is false for a compliant, non-expired ARN', () => {
    const future = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    assert.strictEqual(isArnBlocked({ kydCompliant: true, arnValidTill: future }), false);
  });

  test('isArnBlocked is true when not KYD compliant', () => {
    assert.strictEqual(isArnBlocked({ kydCompliant: false, arnValidTill: null }), true);
  });

  test('isArnBlocked is true when arnValidTill is in the past', () => {
    const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    assert.strictEqual(isArnBlocked({ kydCompliant: true, arnValidTill: past }), true);
  });

  test('arnBlockedReason is null for null (no verification data)', () => {
    assert.strictEqual(arnBlockedReason(null), null);
  });

  test('arnBlockedReason names KYD non-compliance', () => {
    assert.strictEqual(arnBlockedReason({ kydCompliant: false, arnValidTill: null }), 'This ARN is not KYD compliant.');
  });

  test('arnBlockedReason names expiry when compliant but expired', () => {
    const past = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    assert.strictEqual(arnBlockedReason({ kydCompliant: true, arnValidTill: past }), 'This ARN has expired.');
  });

  test('arnBlockedReason is null for a compliant, non-expired ARN', () => {
    const future = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
    assert.strictEqual(arnBlockedReason({ kydCompliant: true, arnValidTill: future }), null);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/amfiDistributor.test.js`
Expected: fails immediately with a module-not-found error (`lib/amfiDistributor.js` doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/amfiDistributor.js`:

```js
/**
 * lib/amfiDistributor.js
 *
 * Server-only wrapper around AMFI India's public (undocumented)
 * distributor-agent search API -- confirmed live via direct curl:
 * GET https://www.amfiindia.com/api/distributor-agent?strOpt=ALL&search={arn}&page=1&pageSize=10
 * No published contract, no documented rate limits -- same mitigation this
 * app already applies to mfapi.in/AMFI's other undocumented endpoints:
 * server-side-only calls, caching (see app/api/distributor/route.js), and
 * graceful degradation.
 *
 * See docs/superpowers/specs/2026-08-16-amfi-distributor-proposal-studio-design.md.
 */

// Extracts a bare 4-7 digit ARN from free text -- handles "ARN-251838",
// "ARN 251838", a bare "251838" (with surrounding whitespace), and returns
// null for anything that isn't ARN-shaped (blank, "Direct", a person's
// name, a too-short/too-long digit run), so callers know not to attempt a
// lookup rather than sending garbage upstream.
export function extractArnDigits(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (/^\d{4,7}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/ARN[\s-]*(\d{4,7})(?!\d)/i);
  return m ? m[1] : null;
}

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
  const rec = (json.data || []).find((d) => d.ARN === arn);
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

// Shared by AdvisorDetailsCard's inline warning, ShareControls' Share/Send
// Email gate, and ProposalReadOnlyView's trust badge, so "is this ARN OK"
// is computed exactly one way everywhere. Accepts either a live
// DistributorRecord (from fetchDistributorByArn) or the smaller persisted
// `advisorArnVerified` shape ({ kydCompliant, arnValidTill, checkedAt }) --
// both carry the two fields this needs.
export function isArnBlocked(verified) {
  if (!verified) return false;
  if (verified.kydCompliant === false) return true;
  if (verified.arnValidTill && new Date(verified.arnValidTill) < new Date()) return true;
  return false;
}

export function arnBlockedReason(verified) {
  if (!verified) return null;
  if (verified.kydCompliant === false) return 'This ARN is not KYD compliant.';
  if (verified.arnValidTill && new Date(verified.arnValidTill) < new Date()) return 'This ARN has expired.';
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/amfiDistributor.test.js`
Expected: `20 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add lib/amfiDistributor.js tests/amfiDistributor.test.js
git commit -m "feat(distributor): add AMFI ARN extraction and lookup helpers"
```

---

### Task 2: `app/api/distributor/route.js` — cached proxy route

**Files:**
- Create: `app/api/distributor/route.js`

**Interfaces:**
- Consumes: `extractArnDigits`, `fetchDistributorByArn` from `lib/amfiDistributor.js` (Task 1); `r2Get`, `r2Put` from `lib/r2.js` (existing).
- Produces: `GET /api/distributor?arn={digits}` → `200 { found: boolean, distributor: DistributorRecord|null, cachedAt: ISO }`, `400 { error }` for a missing/malformed `arn`, `502 { error }` only when both a live fetch and any cached copy (fresh or stale) are unavailable. Consumed by Task 3.

- [ ] **Step 1: Write the implementation**

Create `app/api/distributor/route.js`:

```js
/**
 * app/api/distributor/route.js
 *
 * GET /api/distributor?arn=251838
 *
 * Looks up an AMFI-registered mutual fund distributor by ARN via AMFI's own
 * (undocumented) distributor-agent search API, cached per-ARN in R2 for 30
 * days -- registration data barely changes; KYD/expiry status is the only
 * field that can shift meaningfully, and a month is an accepted staleness
 * bound for that (product decision, not a technical limit) in exchange for
 * far fewer AMFI calls and much lower latency for callers.
 *
 * Response shape: { found: boolean, distributor: {...} | null, cachedAt: ISO }
 * On upstream failure: serves a stale cache if one exists (a temporary AMFI
 * outage shouldn't make a caller treat a known-good distributor as
 * unverifiable); 502 only when there's no cache at all, fresh or stale.
 *
 * See docs/superpowers/specs/2026-08-16-amfi-distributor-proposal-studio-design.md.
 */

import { r2Get, r2Put } from '@/lib/r2';
import { extractArnDigits, fetchDistributorByArn } from '@/lib/amfiDistributor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const cacheKeyFor = (arn) => `distributor-arn/${arn}.json`;

async function blobGet(key) {
  try {
    return await r2Get(key);
  } catch {
    return null;
  }
}

async function blobPut(key, payload) {
  try {
    await r2Put(key, JSON.stringify(payload));
  } catch {
    /* fire-and-forget */
  }
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const arn = extractArnDigits(searchParams.get('arn') || '');
  if (!arn) {
    return Response.json({ error: 'Missing or malformed arn parameter' }, { status: 400 });
  }

  const key = cacheKeyFor(arn);
  const cached = await blobGet(key);

  // 1. Fresh cache hit
  if (cached?.cachedAt) {
    const age = Date.now() - new Date(cached.cachedAt).getTime();
    if (age < TTL_MS) {
      return Response.json(cached, {
        headers: {
          'X-Cache':       'HIT',
          'Cache-Control': `max-age=${Math.floor((TTL_MS - age) / 1000)}`,
        },
      });
    }
  }

  // 2. Cache miss or stale -- fetch fresh
  try {
    const distributor = await fetchDistributorByArn(arn);
    const payload = {
      found:     distributor !== null,
      distributor,
      cachedAt:  new Date().toISOString(),
    };

    blobPut(key, payload); // fire-and-forget

    return Response.json(payload, {
      headers: {
        'X-Cache':       'MISS',
        'Cache-Control': `max-age=${TTL_MS / 1000}`,
      },
    });
  } catch (err) {
    console.error('[distributor]', err.name, err.message);
    // A stale cache is still better than a hard failure.
    if (cached) {
      return Response.json(cached, { headers: { 'X-Cache': 'STALE' } });
    }
    return Response.json({ error: err.message }, { status: 502 });
  }
}
```

- [ ] **Step 2: Manual verification**

Start the dev server (`npm run dev`), then run:

```bash
curl -s "http://localhost:3000/api/distributor?arn=251838" | head -c 500
```
Expected: `{"found":true,"distributor":{"arn":"251838","name":"ATIN KUMAR AGRAWAL",...},"cachedAt":"..."}`, with response header `X-Cache: MISS` on the first call.

```bash
curl -s -D - "http://localhost:3000/api/distributor?arn=251838" -o /dev/null | grep -i x-cache
```
Expected: `X-Cache: HIT` on the second call (within 30 days of the first).

```bash
curl -s "http://localhost:3000/api/distributor?arn=00000099" 
```
Expected: `400`, malformed (9 digits, over the 7-digit max) — `{"error":"Missing or malformed arn parameter"}`.

```bash
curl -s "http://localhost:3000/api/distributor?arn=999999"
```
Expected: `{"found":false,"distributor":null,"cachedAt":"..."}` — a well-formed but non-existent ARN.

- [ ] **Step 3: Commit**

```bash
git add app/api/distributor/route.js
git commit -m "feat(distributor): add cached /api/distributor lookup route"
```

---

### Task 3: Proposal Studio ARN auto-fill and inline status

**Files:**
- Modify: `app/proposal-studio/ProposalStudioClient.jsx` (current relevant regions: `AdvisorDetailsCard` function at line 199, its render call at lines 543-550, `ProposalStudioTool`'s advisor state at lines 331-336, the advisor-prefill effect at lines 361-364)

**Interfaces:**
- Consumes: `extractArnDigits`, `isArnBlocked`, `arnBlockedReason` from `lib/amfiDistributor.js` (Task 1); `GET /api/distributor?arn=` (Task 2).
- Produces: `arnLookup` state (`{ status: 'idle'|'loading'|'ok'|'not_found'|'error', data: DistributorRecord|null }`) and `checkArn(rawArn)` function in `ProposalStudioTool`, consumed by Task 4 (save/load) and Task 6 (ShareControls gate).

- [ ] **Step 1: Add the import**

In `app/proposal-studio/ProposalStudioClient.jsx`, add to the top imports (after the existing `import ShareControls from './ShareControls';` at line 13):

```js
import { extractArnDigits, isArnBlocked, arnBlockedReason } from '@/lib/amfiDistributor';
```

- [ ] **Step 2: Add `arnLookup` state and `checkArn` to `ProposalStudioTool`**

In `ProposalStudioTool` (function starting at line 313), immediately after the existing line:

```js
  const [advisorFieldsTouched, setAdvisorFieldsTouched] = useState(false);
```

add:

```js
  // Live AMFI ARN verification -- see lib/amfiDistributor.js and
  // docs/superpowers/specs/2026-08-16-amfi-distributor-proposal-studio-design.md.
  const [arnLookup, setArnLookup] = useState({ status: 'idle', data: null }); // 'idle'|'loading'|'ok'|'not_found'|'error'

  // Fires on ARN-field blur, and once on mount (see the mount effect below)
  // so a saved proposal's already-populated ARN gets checked too, not just
  // freshly-typed ones. Auto-fill only ever writes an EMPTY field -- never
  // overwrites something the distributor already typed themselves.
  async function checkArn(rawArn) {
    const arn = extractArnDigits(rawArn);
    if (!arn) {
      setArnLookup({ status: 'idle', data: null });
      return;
    }
    setArnLookup({ status: 'loading', data: null });
    try {
      const res = await fetch(`/api/distributor?arn=${arn}`);
      const data = await res.json();
      if (!res.ok) {
        setArnLookup({ status: 'error', data: null });
        return;
      }
      if (!data.found) {
        setArnLookup({ status: 'not_found', data: null });
        return;
      }
      setArnLookup({ status: 'ok', data: data.distributor });
      if (!advisorName)  setAdvisorName(data.distributor.name);
      if (!advisorPhone) setAdvisorPhone(data.distributor.phone);
      if (!advisorEmail) setAdvisorEmail(data.distributor.email);
      if (!advisorEuin)  setAdvisorEuin(data.distributor.euin);
    } catch {
      setArnLookup({ status: 'error', data: null });
    }
  }
```

- [ ] **Step 3: Add the mount-time verification effect**

Immediately after the existing effect:

```js
  useEffect(() => {
    if (advisorFieldsTouched) return;
    if (session?.user?.name) setAdvisorName(session.user.name);
  }, [session, advisorFieldsTouched]);
```

add:

```js
  // Verify the ARN once on mount too (not just on blur) -- covers the
  // 'ARN-251838' default on a fresh session. loadSavedProposal() below
  // separately re-checks whatever ARN a loaded proposal carries.
  useEffect(() => {
    checkArn(advisorArn);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 4: Re-verify on `loadSavedProposal`**

In `loadSavedProposal` (starting at line 504), immediately after:

```js
      setAdvisorEuin(data.advisorEuin || 'E468841');
```

add:

```js
      checkArn(data.advisorArn || 'ARN-251838');
```

- [ ] **Step 5: Pass the new props to `AdvisorDetailsCard`**

In the `AdvisorDetailsCard` render call (lines 543-550), change:

```jsx
      <AdvisorDetailsCard
        advisorName={advisorName} setAdvisorName={setAdvisorName}
        advisorPhone={advisorPhone} setAdvisorPhone={setAdvisorPhone}
        advisorEmail={advisorEmail} setAdvisorEmail={setAdvisorEmail}
        advisorArn={advisorArn} setAdvisorArn={setAdvisorArn}
        advisorEuin={advisorEuin} setAdvisorEuin={setAdvisorEuin}
        onTouched={() => setAdvisorFieldsTouched(true)}
      />
```

to:

```jsx
      <AdvisorDetailsCard
        advisorName={advisorName} setAdvisorName={setAdvisorName}
        advisorPhone={advisorPhone} setAdvisorPhone={setAdvisorPhone}
        advisorEmail={advisorEmail} setAdvisorEmail={setAdvisorEmail}
        advisorArn={advisorArn} setAdvisorArn={setAdvisorArn}
        advisorEuin={advisorEuin} setAdvisorEuin={setAdvisorEuin}
        onTouched={() => setAdvisorFieldsTouched(true)}
        arnLookup={arnLookup}
        onArnBlur={() => checkArn(advisorArn)}
      />
```

- [ ] **Step 6: Update `AdvisorDetailsCard` itself**

Replace the whole function (lines 199-213):

```jsx
function AdvisorDetailsCard({ advisorName, setAdvisorName, advisorPhone, setAdvisorPhone, advisorEmail, setAdvisorEmail, advisorArn, setAdvisorArn, advisorEuin, setAdvisorEuin, onTouched }) {
  const handleChange = (setter) => (e) => { onTouched(); setter(e.target.value); };
  return (
    <section className="pfc-client-details">
      <h3>Prepared By (Your Details)</h3>
      <div className="pfc-client-fields">
        <input className="pfc-client-input" placeholder="Your name" value={advisorName} onChange={handleChange(setAdvisorName)} />
        <input className="pfc-client-input" type="tel" placeholder="Your phone" value={advisorPhone} onChange={handleChange(setAdvisorPhone)} />
        <input className="pfc-client-input" type="email" placeholder="Your email" value={advisorEmail} onChange={handleChange(setAdvisorEmail)} />
        <input className="pfc-client-input" placeholder="ARN number" value={advisorArn} onChange={handleChange(setAdvisorArn)} />
        <input className="pfc-client-input" placeholder="EUIN" value={advisorEuin} onChange={handleChange(setAdvisorEuin)} />
      </div>
    </section>
  );
}
```

with:

```jsx
function AdvisorDetailsCard({ advisorName, setAdvisorName, advisorPhone, setAdvisorPhone, advisorEmail, setAdvisorEmail, advisorArn, setAdvisorArn, advisorEuin, setAdvisorEuin, onTouched, arnLookup, onArnBlur }) {
  const handleChange = (setter) => (e) => { onTouched(); setter(e.target.value); };
  return (
    <section className="pfc-client-details">
      <h3>Prepared By (Your Details)</h3>
      <div className="pfc-client-fields">
        <input className="pfc-client-input" placeholder="Your name" value={advisorName} onChange={handleChange(setAdvisorName)} />
        <input className="pfc-client-input" type="tel" placeholder="Your phone" value={advisorPhone} onChange={handleChange(setAdvisorPhone)} />
        <input className="pfc-client-input" type="email" placeholder="Your email" value={advisorEmail} onChange={handleChange(setAdvisorEmail)} />
        <input className="pfc-client-input" placeholder="ARN number" value={advisorArn} onChange={handleChange(setAdvisorArn)} onBlur={onArnBlur} />
        <input className="pfc-client-input" placeholder="EUIN" value={advisorEuin} onChange={handleChange(setAdvisorEuin)} />
      </div>
      {arnLookup.status === 'loading' && <div className="pfc-hint">⏳ Verifying ARN…</div>}
      {arnLookup.status === 'ok' && isArnBlocked(arnLookup.data) && (
        <div style={{ fontSize: '.7rem', color: '#e65100', marginTop: 6, fontWeight: 700 }}>
          ⚠ {arnBlockedReason(arnLookup.data)}
        </div>
      )}
      {arnLookup.status === 'not_found' && (
        <div className="pfc-hint">ARN not found in AMFI registry — check the number.</div>
      )}
      {arnLookup.status === 'error' && (
        <div className="pfc-hint">Couldn't verify ARN right now.</div>
      )}
    </section>
  );
}
```

- [ ] **Step 7: Manual verification**

Run `npm run dev`, open Proposal Studio signed in as a Pro user.
1. Clear the ARN field, type `251838`, tab away (blur) — expect "⏳ Verifying ARN…" briefly, then no warning (Abundance's own ARN is compliant and current). Name/phone/email/EUIN fields, if previously empty, fill in.
2. Clear the ARN field, type `000000` (well-formed but almost certainly unregistered), blur — expect "ARN not found in AMFI registry — check the number." and no field changes.
3. Reload the page (fresh mount) — expect the mount effect to verify the default `ARN-251838` automatically within a second or two, no warning shown.

- [ ] **Step 8: Commit**

```bash
git add app/proposal-studio/ProposalStudioClient.jsx
git commit -m "feat(proposal-studio): auto-fill and live-verify advisor ARN"
```

---

### Task 4: Persist `advisorArnVerified` through save/load

**Files:**
- Modify: `app/proposal-studio/ProposalStudioClient.jsx` (`saveProposal` at lines 479-502)
- Modify: `app/api/proposal-studio/save/route.js`

**Interfaces:**
- Consumes: `arnLookup` state from Task 3.
- Produces: `advisorArnVerified: { kydCompliant: boolean, arnValidTill: string|null, checkedAt: string } | null` as a field on the saved proposal payload, consumed by Task 5.

- [ ] **Step 1: Include `advisorArnVerified` in the save payload**

In `ProposalStudioClient.jsx`'s `saveProposal` (lines 479-502), change:

```js
  async function saveProposal() {
    setSaveStatus('saving');
    setSaveError('');
    try {
      const res = await fetch('/api/proposal-studio/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName, clientEmail, clientPhone, proposalType, sipFrequency, totalAmount,
          advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin,
          selectedFunds: selectedFunds.map((f) => ({ amfiCode: f.amfiCode, schemeName: f.schemeName, amount: f.amount, source: f.source })),
        }),
      });
```

to:

```js
  async function saveProposal() {
    setSaveStatus('saving');
    setSaveError('');
    // Only a successful, freshly-checked lookup is worth persisting -- an
    // 'idle'/'loading'/'not_found'/'error' status means there's nothing
    // verified to show later, so ProposalReadOnlyView falls back to plain
    // ARN text for those (see Task 5).
    const advisorArnVerified = arnLookup.status === 'ok'
      ? { kydCompliant: arnLookup.data.kydCompliant, arnValidTill: arnLookup.data.arnValidTill, checkedAt: new Date().toISOString() }
      : null;
    try {
      const res = await fetch('/api/proposal-studio/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName, clientEmail, clientPhone, proposalType, sipFrequency, totalAmount,
          advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin, advisorArnVerified,
          selectedFunds: selectedFunds.map((f) => ({ amfiCode: f.amfiCode, schemeName: f.schemeName, amount: f.amount, source: f.source })),
        }),
      });
```

- [ ] **Step 2: Accept and store it in the save route**

In `app/api/proposal-studio/save/route.js`, change the destructure (lines 27-31):

```js
    const {
      clientName, clientEmail, clientPhone,
      proposalType, sipFrequency, totalAmount, selectedFunds,
      advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin,
    } = await req.json();
```

to:

```js
    const {
      clientName, clientEmail, clientPhone,
      proposalType, sipFrequency, totalAmount, selectedFunds,
      advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin, advisorArnVerified,
    } = await req.json();
```

and the payload object (lines 39-63), change:

```js
      advisorArn: advisorArn || '',
      advisorEuin: advisorEuin || '',
```

to:

```js
      advisorArn: advisorArn || '',
      advisorEuin: advisorEuin || '',
      // Snapshot of the last successful AMFI verification at save time --
      // lets ProposalReadOnlyView show a trust badge without needing a
      // live re-check (a shared/printed proposal is static content). null
      // when the advisor never had a successful lookup for this ARN.
      advisorArnVerified: advisorArnVerified || null,
```

- [ ] **Step 3: Update the route's doc comment**

Change the header comment's `Body (JSON):` line (line 5-7) to include the new field:

```js
 * Body (JSON): { clientName, clientEmail, clientPhone, proposalType,
 *                sipFrequency, totalAmount, selectedFunds,
 *                advisorName, advisorPhone, advisorEmail, advisorArn,
 *                advisorEuin, advisorArnVerified }
```

- [ ] **Step 4: Manual verification**

With the dev server running: build a proposal, ensure ARN `251838` has been verified (Task 3's flow), add at least one fund, click "Save Proposal". Then:

```bash
curl -s "http://localhost:3000/api/proposal-studio/load?id=<the returned id>" -H "Cookie: <your session cookie>" | python -m json.tool
```

Expected: the JSON includes `"advisorArnVerified": { "kydCompliant": true, "arnValidTill": "...", "checkedAt": "..." }`. (Simplest in-browser check: open the saved proposal's "My Saved Proposals" row, then inspect the Network tab's `/api/proposal-studio/load` response instead of using curl with a manually-copied cookie.)

- [ ] **Step 5: Commit**

```bash
git add app/proposal-studio/ProposalStudioClient.jsx app/api/proposal-studio/save/route.js
git commit -m "feat(proposal-studio): persist verified ARN status with saved proposals"
```

---

### Task 5: Trust badge in `ProposalReadOnlyView` + prop threading

**Files:**
- Modify: `app/proposal-studio/ProposalReadOnlyView.jsx`
- Modify: `app/api/proposal-studio/shared/[token]/route.js`
- Modify: `app/proposal-studio/view/[token]/page.js`
- Modify: `app/proposal-studio/mine/[id]/page.js`

**Interfaces:**
- Consumes: `advisorArnVerified` persisted by Task 4; `isArnBlocked`, `arnBlockedReason` from `lib/amfiDistributor.js` (Task 1).
- Produces: `ProposalReadOnlyView` gains an `advisorArnVerified` prop.

- [ ] **Step 1: Add the badge to `ProposalReadOnlyView.jsx`**

Add the import (after the existing `import { useMCapIndex, ProposalAnalysisBlock, prettifySchemeName } from './ProposalSections';` at line 20):

```js
import { isArnBlocked, arnBlockedReason } from '@/lib/amfiDistributor';
```

Change the function signature (lines 24-28):

```js
export default function ProposalReadOnlyView({
  clientName, clientEmail, clientPhone,
  advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin,
  proposalType, sipFrequency, selectedFunds: rawSelectedFunds, proposalId,
}) {
```

to:

```js
export default function ProposalReadOnlyView({
  clientName, clientEmail, clientPhone,
  advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin, advisorArnVerified,
  proposalType, sipFrequency, selectedFunds: rawSelectedFunds, proposalId,
}) {
```

Change line 75 from:

```jsx
          <div className="pfc-readonly-detail">{advisorArn}{advisorEuin ? ` · EUIN: ${advisorEuin}` : ''}</div>
```

to:

```jsx
          {advisorArnVerified ? (
            <div className="pfc-readonly-detail">
              {isArnBlocked(advisorArnVerified)
                ? <>⚠ {advisorArn}{advisorEuin ? ` · EUIN: ${advisorEuin}` : ''} — {arnBlockedReason(advisorArnVerified)}</>
                : <>✓ AMFI Registered · {advisorArn}{advisorArnVerified.arnValidTill ? ` · Valid till ${new Date(advisorArnVerified.arnValidTill).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}` : ''}</>}
            </div>
          ) : (
            <div className="pfc-readonly-detail">{advisorArn}{advisorEuin ? ` · EUIN: ${advisorEuin}` : ''}</div>
          )}
```

- [ ] **Step 2: Add `advisorArnVerified` to the public share route's whitelist**

In `app/api/proposal-studio/shared/[token]/route.js`, the response object (lines 39-51) — add one line after `advisorEuin: payload.advisorEuin,`:

```js
    return Response.json({
      clientName: payload.clientName,
      clientEmail: payload.clientEmail,
      clientPhone: payload.clientPhone,
      advisorName: payload.advisorName,
      advisorPhone: payload.advisorPhone,
      advisorEmail: payload.advisorEmail,
      advisorArn: payload.advisorArn,
      advisorEuin: payload.advisorEuin,
      advisorArnVerified: payload.advisorArnVerified,
      proposalType: payload.proposalType,
      sipFrequency: payload.sipFrequency,
      selectedFunds: payload.selectedFunds,
    });
```

- [ ] **Step 3: Thread the prop through the public view page**

In `app/proposal-studio/view/[token]/page.js`, the `ProposalReadOnlyView` call (lines 49-61) — add one line after `advisorEuin={state.data.advisorEuin}`:

```jsx
            <ProposalReadOnlyView
              clientName={state.data.clientName}
              clientEmail={state.data.clientEmail}
              clientPhone={state.data.clientPhone}
              advisorName={state.data.advisorName}
              advisorPhone={state.data.advisorPhone}
              advisorEmail={state.data.advisorEmail}
              advisorArn={state.data.advisorArn}
              advisorEuin={state.data.advisorEuin}
              advisorArnVerified={state.data.advisorArnVerified}
              proposalType={state.data.proposalType}
              sipFrequency={state.data.sipFrequency}
              selectedFunds={state.data.selectedFunds || []}
            />
```

- [ ] **Step 4: Thread the prop through the owner's view page**

In `app/proposal-studio/mine/[id]/page.js`, the `ProposalReadOnlyView` call (lines 87-100) — add one line after `advisorEuin={data.advisorEuin}`:

```jsx
        <ProposalReadOnlyView
          clientName={data.clientName}
          clientEmail={data.clientEmail}
          clientPhone={data.clientPhone}
          advisorName={data.advisorName}
          advisorPhone={data.advisorPhone}
          advisorEmail={data.advisorEmail}
          advisorArn={data.advisorArn}
          advisorEuin={data.advisorEuin}
          advisorArnVerified={data.advisorArnVerified}
          proposalType={data.proposalType}
          sipFrequency={data.sipFrequency}
          selectedFunds={data.selectedFunds || []}
          proposalId={id}
        />
```

(`load/route.js` needs no change — it already spreads the entire stored payload via `{ ...payload, id, shareToken }`, so `advisorArnVerified` flows through automatically.)

- [ ] **Step 5: Manual verification**

Using the proposal saved in Task 4's verification: open its share link (via "Share" in the editor, or the owner's `/proposal-studio/mine/[id]` page) in a fresh/incognito browser tab. Expect the "Prepared By" block to show "✓ AMFI Registered · ARN-251838 · Valid till \<date\>" instead of the old plain `ARN-251838 · EUIN: ...` line.

- [ ] **Step 6: Commit**

```bash
git add app/proposal-studio/ProposalReadOnlyView.jsx app/api/proposal-studio/shared/\[token\]/route.js app/proposal-studio/view/\[token\]/page.js app/proposal-studio/mine/\[id\]/page.js
git commit -m "feat(proposal-studio): show AMFI-verified trust badge on shared proposals"
```

---

### Task 6: Client-side Share/Send Email gate

**Files:**
- Modify: `app/proposal-studio/ShareControls.jsx`
- Modify: `app/proposal-studio/ProposalStudioClient.jsx` (the `ShareControls` render call at line 596)
- Modify: `app/proposal-studio/mine/[id]/page.js` (the `ShareControls` render call at line 84)

**Interfaces:**
- Consumes: `isArnBlocked`, `arnBlockedReason` from `lib/amfiDistributor.js` (Task 1); `arnLookup` (Task 3, live editor state); `data.advisorArnVerified` (Task 5, owner view).
- Produces: `ShareControls` gains `arnBlocked: boolean` and `arnBlockedReason: string|null` props.

- [ ] **Step 1: Add the gate to `ShareControls.jsx`**

Change the function signature (line 18):

```js
export default function ShareControls({ proposalId, initialShareToken, clientEmail }) {
```

to:

```js
export default function ShareControls({ proposalId, initialShareToken, clientEmail, arnBlocked = false, arnBlockedReason = null }) {
```

Change the "Share" button (lines 105-109):

```jsx
      {!shareToken && (
        <button type="button" className="pfc-save-btn" disabled={shareBusy} onClick={handleShare}>
          {shareBusy ? 'Sharing…' : 'Share'}
        </button>
      )}
```

to:

```jsx
      {!shareToken && (
        <button type="button" className="pfc-save-btn" disabled={shareBusy || arnBlocked} title={arnBlocked ? arnBlockedReason : undefined} onClick={handleShare}>
          {shareBusy ? 'Sharing…' : 'Share'}
        </button>
      )}
```

Change the "Send Email" toggle button (lines 121-123):

```jsx
      <button type="button" className="pfc-save-btn" onClick={() => setEmailOpen((o) => !o)}>
        {emailOpen ? 'Close' : 'Send Email'}
      </button>
```

to:

```jsx
      <button type="button" className="pfc-save-btn" disabled={arnBlocked} title={arnBlocked ? arnBlockedReason : undefined} onClick={() => setEmailOpen((o) => !o)}>
        {emailOpen ? 'Close' : 'Send Email'}
      </button>
```

(`Unshare` and `Copy Link` are intentionally left ungated — removing access or copying an already-live link should never be blocked, only the actions that grant *new* access.)

- [ ] **Step 2: Wire the live editor's gate**

In `app/proposal-studio/ProposalStudioClient.jsx`, add the import (it can share the line added in Task 3 — confirm `isArnBlocked, arnBlockedReason` are already imported from `@/lib/amfiDistributor`; they are, from Task 3 Step 1).

Change the `ShareControls` render call (line 596):

```jsx
                <ShareControls key={savedProposalId} proposalId={savedProposalId} initialShareToken={loadedShareToken} clientEmail={clientEmail} />
```

to:

```jsx
                <ShareControls
                  key={savedProposalId}
                  proposalId={savedProposalId}
                  initialShareToken={loadedShareToken}
                  clientEmail={clientEmail}
                  arnBlocked={arnLookup.status === 'ok' && isArnBlocked(arnLookup.data)}
                  arnBlockedReason={arnLookup.status === 'ok' ? arnBlockedReason(arnLookup.data) : null}
                />
```

- [ ] **Step 3: Wire the owner-view page's gate**

In `app/proposal-studio/mine/[id]/page.js`, add the import (after the existing `import { formatProposalId } from '../../ProposalSections';` at line 23):

```js
import { isArnBlocked, arnBlockedReason } from '@/lib/amfiDistributor';
```

Change the `ShareControls` render call (line 84):

```jsx
          <ShareControls proposalId={id} initialShareToken={data.shareToken} clientEmail={data.clientEmail} />
```

to:

```jsx
          <ShareControls
            proposalId={id}
            initialShareToken={data.shareToken}
            clientEmail={data.clientEmail}
            arnBlocked={isArnBlocked(data.advisorArnVerified)}
            arnBlockedReason={arnBlockedReason(data.advisorArnVerified)}
          />
```

- [ ] **Step 4: Manual verification**

1. In the editor, set the ARN to a value known to be non-compliant or expired (if none is available for live testing, temporarily hardcode `setArnLookup({ status: 'ok', data: { kydCompliant: false, arnValidTill: null } })` in a browser devtools console against the running page, or temporarily edit `checkArn`'s success branch to force `kydCompliant: false` for this test only, then revert). Save the proposal. Confirm "Share" and "Send Email" render disabled with a tooltip explaining why; "Unshare" (if already shared) and "Copy Link" remain unaffected.
2. Revert any temporary test edit, verify a normal compliant ARN (`251838`) leaves both buttons enabled.
3. Open `/proposal-studio/mine/[id]` for a proposal saved with a blocked `advisorArnVerified` and confirm the same disabled state appears there too.

- [ ] **Step 5: Commit**

```bash
git add app/proposal-studio/ShareControls.jsx app/proposal-studio/ProposalStudioClient.jsx app/proposal-studio/mine/\[id\]/page.js
git commit -m "feat(proposal-studio): disable Share/Send Email for a non-compliant or expired ARN"
```

---

## Self-Review Notes

- **Spec coverage:** `lib/amfiDistributor.js` (Task 1) ✓, `/api/distributor` route + caching (Task 2) ✓, `AdvisorDetailsCard` auto-fill/validation UI (Task 3) ✓, persisted verification data model (Task 4) ✓, trust badge (Task 5) ✓, client-side Share/Send gate (Task 6) ✓. Out-of-scope items (social-media-links endpoint, server-side gate enforcement, `exportProposalPDF` badge, CAS Tracker/Portfolio) are untouched by any task above, matching the spec and the mid-planning scope clarification.
- **Corrections to the spec, applied here:** (1) the design spec's claim that the shared/printed view reuses `ProposalReadOnlyView`'s own DOM for printing was wrong — `exportProposalPDF()` in `ProposalSections.jsx` builds an entirely separate HTML document; per the mid-planning decision, that function is explicitly untouched by this plan. (2) `app/api/proposal-studio/share/route.js` does not need to change — it only mints a share token against the already-saved R2 blob_key; the payload itself (including `advisorArnVerified`) is written once by `save/route.js` and never touched by `share/route.js`.
- **Type consistency:** `advisorArnVerified` is `{ kydCompliant: boolean, arnValidTill: string|null, checkedAt: string } | null` everywhere it's produced (Task 4) and consumed (Tasks 5 and 6's `isArnBlocked`/`arnBlockedReason`, which also accept the larger live `DistributorRecord` shape from Task 1/3 interchangeably since both carry `kydCompliant`/`arnValidTill`).
