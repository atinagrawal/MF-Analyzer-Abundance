# AMFI Distributor Lookup — CAS Tracker Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the raw `scheme.advisor` string CAS Tracker already carries per holding into a real distributor profile via the shared AMFI lookup service (sub-project 1, already shipped), shown as a small hover badge on each fund card, plus a "who sold this" rollup summary.

**Architecture:** A new page-agnostic `lib/distributorResolution.js` batches ARN resolution through the already-shipped, auth-gated `GET /api/distributor?arn=` route. `app/cas-tracker/page.js` gains a `distributorCache` state (same shape/convention as its existing `navHistoryCache`), populated once whenever new CAS data loads, and reads from it to replace the existing permanently-visible plain-text "Advisor" row with either a resolved hover badge or the unchanged original text.

**Tech Stack:** Next.js App Router client component (`app/cas-tracker/page.js`, `'use client'`), plain Node + `assert` tests (no framework).

## Global Constraints

- Depends on sub-project 1 (already shipped, on `main`): `lib/amfiDistributor.js` exports `extractArnDigits`; `GET /api/distributor?arn=` is auth-gated (requires a signed-in session) and returns `{ found: boolean, distributor: DistributorRecord|null, cachedAt: ISO }` where `DistributorRecord` is `{ arn, name, phone, email, address, city, pin, kydCompliant, arnValidFrom, arnValidTill, euin, sifValidFrom, sifValidTill }`. CAS Tracker is itself an authenticated page, so its same-origin `fetch()` calls to this route carry the session cookie automatically — no special handling needed.
- **Portfolio (`app/portfolio/page.jsx`) is explicitly out of scope — do not touch it.** `lib/distributorResolution.js` is deliberately page-agnostic so a later, separate effort can wire it into Portfolio without touching this plan's work.
- A hover must never trigger a network call — all resolution happens once, batched, when holdings data loads, not per-card and not per-hover.
- Manual holdings have no `scheme.advisor` field and are untouched by this feature.
- An unresolvable/not-found/failed-lookup advisor string is never shown as an error — it silently falls back to today's existing plain-text behavior.
- Test convention: plain Node + `assert`, `node tests/<file>.test.js`, no framework. `lib/distributorResolution.js` uses ES module `export` syntax (consumed by a `'use client'` page) — its test file uses the `require('assert')` + `await import(...)` dynamic-import pattern (like `tests/amfiDistributor.test.js`), not a plain top-level `require()`.

---

## File Structure

- **Create** `lib/distributorResolution.js` — re-exports `extractArnDigits` from `lib/amfiDistributor.js`, adds `resolveDistributors(advisorStrings)`.
- **Create** `tests/distributorResolution.test.js` — unit tests for `resolveDistributors` against a mocked `fetch`.
- **Modify** `app/cas-tracker/page.js` — new `distributorCache` state (~line 1423, after `detailFund`), a new resolution effect (~after `fetchNavHistory`, ~line 1943), the fund card's "Advisor" row replaced with a conditional badge/fallback (~lines 2776-2830), and a new "who sold this" rollup card (~after line 2691, before the filter-toggle block).

---

### Task 1: `lib/distributorResolution.js` — batch ARN resolver

**Files:**
- Create: `lib/distributorResolution.js`
- Test: `tests/distributorResolution.test.js`

**Interfaces:**
- Consumes: `extractArnDigits` from `lib/amfiDistributor.js` (already shipped).
- Produces: `extractArnDigits` (re-exported, same function), `resolveDistributors(advisorStrings: string[]): Promise<{ [arn: string]: DistributorRecord|null }>`. Consumed by Task 2 and Task 3.

- [ ] **Step 1: Write the failing tests**

Create `tests/distributorResolution.test.js`:

```js
// tests/distributorResolution.test.js
//
// Unit tests for lib/distributorResolution.js's resolveDistributors, against
// a mocked global.fetch. lib/distributorResolution.js uses ES module
// import/export syntax (it's consumed by a 'use client' Next.js page), and
// this project's package.json has no "type": "module", so plain require()
// cannot load it under Node's CommonJS default -- use dynamic import()
// instead, same as tests/amfiDistributor.test.js.
// Run with: node tests/distributorResolution.test.js

const assert = require('assert');

(async () => {
  const { resolveDistributors } = await import('../lib/distributorResolution.js');

  console.log('=== Running distributorResolution Unit Tests ===\n');

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

  // Installs a mock global.fetch for the duration of `fn`, recording every
  // URL requested, then restores the original fetch afterward regardless of
  // whether fn throws.
  async function withMockFetch(responder, fn) {
    const calls = [];
    const original = global.fetch;
    global.fetch = async (url) => {
      calls.push(url);
      const body = responder(url);
      return { json: async () => body };
    };
    try {
      await fn(calls);
    } finally {
      global.fetch = original;
    }
  }

  await test('resolves a single ARN-shaped advisor string', async () => {
    await withMockFetch(
      () => ({ found: true, distributor: { arn: '251838', name: 'ATIN KUMAR AGRAWAL', phone: '9808105923', email: 'atin@getabundance.in' } }),
      async (calls) => {
        const map = await resolveDistributors(['ARN-251838']);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(map['251838'].name, 'ATIN KUMAR AGRAWAL');
      }
    );
  });

  await test('dedupes two holdings with the same ARN into one network call', async () => {
    await withMockFetch(
      () => ({ found: true, distributor: { arn: '251838', name: 'ATIN KUMAR AGRAWAL' } }),
      async (calls) => {
        const map = await resolveDistributors(['ARN-251838', 'ARN-251838']);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(Object.keys(map).length, 1);
      }
    );
  });

  await test('unresolvable advisor strings (blank, Direct, a name) trigger zero network calls', async () => {
    await withMockFetch(
      () => ({ found: true, distributor: { arn: '000000', name: 'X' } }),
      async (calls) => {
        const map = await resolveDistributors(['Direct / N/A', '', 'Some Advisor Name']);
        assert.strictEqual(calls.length, 0);
        assert.deepStrictEqual(map, {});
      }
    );
  });

  await test('a well-formed but not-found ARN maps to null', async () => {
    await withMockFetch(
      () => ({ found: false, distributor: null }),
      async () => {
        const map = await resolveDistributors(['ARN-999999']);
        assert.strictEqual(map['999999'], null);
      }
    );
  });

  await test('a failed lookup (rejected fetch) maps to null rather than throwing', async () => {
    const original = global.fetch;
    global.fetch = async () => { throw new Error('network down'); };
    try {
      const map = await resolveDistributors(['ARN-777777']);
      assert.strictEqual(map['777777'], null);
    } finally {
      global.fetch = original;
    }
  });

  await test('a mix of found, not-found, and failed ARNs each resolve independently', async () => {
    const original = global.fetch;
    global.fetch = async (url) => {
      if (url.includes('arn=111111')) return { json: async () => ({ found: true, distributor: { arn: '111111', name: 'Found Advisor' } }) };
      if (url.includes('arn=222222')) return { json: async () => ({ found: false, distributor: null }) };
      throw new Error('simulated network failure');
    };
    try {
      const map = await resolveDistributors(['ARN-111111', 'ARN-222222', 'ARN-333333']);
      assert.strictEqual(map['111111'].name, 'Found Advisor');
      assert.strictEqual(map['222222'], null);
      assert.strictEqual(map['333333'], null);
    } finally {
      global.fetch = original;
    }
  });

  await test('an empty input array resolves to an empty map with zero calls', async () => {
    await withMockFetch(
      () => ({ found: true, distributor: {} }),
      async (calls) => {
        const map = await resolveDistributors([]);
        assert.strictEqual(calls.length, 0);
        assert.deepStrictEqual(map, {});
      }
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/distributorResolution.test.js`
Expected: fails immediately with a module-not-found error (`lib/distributorResolution.js` doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/distributorResolution.js`:

```js
/**
 * lib/distributorResolution.js
 *
 * Page-agnostic batch resolver for CAS-holding advisor strings, built on
 * top of the shared AMFI distributor lookup service (lib/amfiDistributor.js,
 * app/api/distributor/route.js -- see docs/superpowers/specs/
 * 2026-08-16-amfi-distributor-proposal-studio-design.md). Deliberately has
 * no React/page dependency so a later effort can wire this into
 * app/portfolio/page.jsx without re-deriving any of this logic -- see
 * docs/superpowers/specs/2026-08-16-amfi-distributor-cas-tracker-design.md.
 */

export { extractArnDigits } from './amfiDistributor';

import { extractArnDigits } from './amfiDistributor';

// Takes the raw advisor strings off a set of holdings (e.g. every CAS-
// derived fund's `advisor` field, "Direct / N/A" and blanks included),
// dedupes to the distinct resolvable ARNs, fetches each via the already-
// authenticated GET /api/distributor?arn=... in parallel (Promise.allSettled
// -- one slow/failing lookup must never block the others), and returns a
// map keyed by bare ARN digits so callers can look up by whatever
// extractArnDigits(fund.advisor) returns for each holding. An ARN that's
// well-formed but not found in AMFI's registry, or whose lookup fails
// outright, both map to null -- callers treat both the same way (fall back
// to unenriched display), per this feature's error-handling design.
export async function resolveDistributors(advisorStrings) {
  const arns = [...new Set(advisorStrings.map(extractArnDigits).filter(Boolean))];
  if (arns.length === 0) return {};

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

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/distributorResolution.test.js`
Expected: `7 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add lib/distributorResolution.js tests/distributorResolution.test.js
git commit -m "feat(distributor): add page-agnostic batch ARN resolver for CAS Tracker"
```

---

### Task 2: CAS Tracker fund card — resolved distributor badge

**Files:**
- Modify: `app/cas-tracker/page.js` (state declaration ~line 1423, new effect ~line 1943 after `fetchNavHistory`, card rendering ~lines 2776-2830)

**Interfaces:**
- Consumes: `resolveDistributors`, `extractArnDigits` from `lib/distributorResolution.js` (Task 1).
- Produces: `distributorCache` state (`{ [arn]: DistributorRecord|null }`) in the page's top-level component, consumed by Task 3.

- [ ] **Step 1: Add the import**

At the top of `app/cas-tracker/page.js`, add (grouping alongside the existing component-level imports, e.g. right after the `TransactionHistoryDrawer` import):

```js
import { resolveDistributors, extractArnDigits } from '@/lib/distributorResolution';
```

- [ ] **Step 2: Add `distributorCache` state**

Immediately after the existing line:

```js
  const [detailFund,     setDetailFund]     = useState(null);  // holding object for the fund/SIF details drawer (same one screener uses)
```

add:

```js
  const [distributorCache, setDistributorCache] = useState({}); // ARN (bare digits) → DistributorRecord|null -- see lib/distributorResolution.js
```

- [ ] **Step 3: Add the resolution effect**

Immediately after the closing brace of the existing `fetchNavHistory` function (the function whose header comment starts "Historical NAV curve for the Transaction History drawer's optional chart overlay..."), add a new effect:

```js
  // Resolves every CAS-derived holding's raw `advisor` string to a real
  // distributor profile, once per portfolioDataByPan change (i.e. whenever
  // new CAS data actually loads) rather than per-render or per-hover.
  // Already-resolved ARNs are skipped on subsequent firings (e.g. loading a
  // second family member's PAN after the first) so re-loading doesn't
  // re-fetch ARNs this page already knows about.
  useEffect(() => {
    const allAdvisorStrings = Object.values(portfolioDataByPan)
      .flatMap(info => (info.holdings || []).map(h => h.advisor));
    const newArns = [...new Set(allAdvisorStrings.map(extractArnDigits).filter(Boolean))]
      .filter(arn => !(arn in distributorCache));
    if (newArns.length === 0) return;
    resolveDistributors(newArns).then(map => {
      setDistributorCache(prev => ({ ...prev, ...map }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioDataByPan]);
```

(The `eslint-disable` matches this file's existing convention for effects that intentionally omit a referenced value — here `distributorCache` itself — from the dependency array, since including it would create a fetch-loop: the effect writes to `distributorCache`, and re-running whenever it changes would refire immediately after every resolution.)

- [ ] **Step 4: Replace the fund card's Advisor row**

Locate this block (inside the fund card's CAS-only metadata section):

```jsx
                          {/* CAS-only metadata */}
                          {!isManual && (
                            <div className="folio-meta">
                              <div className="folio-row">
                                <div>
                                  <span className="label">Folio</span><br />
                                  <span className="value">{fund.folio || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="label">Nominee</span><br />
                                  <span className="value">{fund.nominee}</span>
                                </div>
                                <div className="folio-full">
                                  <span className="label">Advisor</span><br />
                                  <span className="value">{fund.advisor}</span>
                                </div>
                              </div>
                            </div>
                          )}
```

First, compute the resolved distributor for this card. Immediately before this block (still inside the same `.map((fund, idx) => { ... })` callback, alongside the other per-card derived values like `fGain`/`fGainPct`/`fProfit`), add:

```js
                    const advisorArn = !isManual ? extractArnDigits(fund.advisor) : null;
                    const resolvedDistributor = advisorArn ? distributorCache[advisorArn] : null;
```

Then replace the block above with:

```jsx
                          {/* CAS-only metadata */}
                          {!isManual && (
                            <div className="folio-meta">
                              <div className="folio-row">
                                <div>
                                  <span className="label">Folio</span><br />
                                  <span className="value">{fund.folio || 'N/A'}</span>
                                </div>
                                <div>
                                  <span className="label">Nominee</span><br />
                                  <span className="value">{fund.nominee}</span>
                                </div>
                                {!resolvedDistributor && (
                                  <div className="folio-full">
                                    <span className="label">Advisor</span><br />
                                    <span className="value">{fund.advisor}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
```

(This keeps today's plain-text Advisor row exactly as-is when there's nothing resolved to show instead -- unresolvable strings, not-found ARNs, and failed lookups all leave `resolvedDistributor` `null`/`undefined`, so this row is untouched for those cases.)

Now add the badge itself to the "Type + source badges" row. Locate:

```jsx
                          {/* Type + source badges */}
                          <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                            {isFamilyView && fund.__ownerName && (
```

Change to (adding one new conditional badge before the family-owner one -- order doesn't matter functionally, this keeps the family-owner badge first since it was already there):

```jsx
                          {/* Type + source badges */}
                          <div style={{ display: 'flex', gap: 5, marginTop: 5, flexWrap: 'wrap' }}>
                            {resolvedDistributor && (
                              <span style={{
                                fontSize: '.52rem', fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                                background: 'var(--g-xlight)', color: 'var(--g2)', border: '1px solid var(--g-light)',
                                fontFamily: "'JetBrains Mono', monospace", letterSpacing: '.5px',
                              }} title={`${resolvedDistributor.name}\nARN-${resolvedDistributor.arn}\n📞 ${resolvedDistributor.phone || 'N/A'}\n✉ ${resolvedDistributor.email || 'N/A'}`}>
                                🧑‍💼 {resolvedDistributor.name.split(' ')[0]}
                              </span>
                            )}
                            {isFamilyView && fund.__ownerName && (
```

(Leave everything else in that badges block — the SIF, Transmitted, and Admin Added badges, and the closing `</div>` — exactly as it already is.)

- [ ] **Step 5: Manual verification**

With the dev server running and a real CAS uploaded that has at least one holding with a non-"Direct" `scheme.advisor` value resolvable to a real AMFI ARN (Abundance's own test data, or any known ARN):
1. Confirm the fund card shows the new "🧑‍💼 FirstName" badge, and hovering it shows a multi-line tooltip with the full name, ARN, phone, and email.
2. Confirm the old "Advisor" folio-meta row is gone for that specific card (replaced by the badge).
3. For a holding whose `scheme.advisor` is "Direct / N/A" or otherwise unresolvable, confirm the plain "Advisor: Direct / N/A" row still renders exactly as before, with no badge.
4. Confirm no visible error state ever appears for an unresolvable/not-found/failed-lookup advisor.

- [ ] **Step 6: Commit**

```bash
git add app/cas-tracker/page.js
git commit -m "feat(cas-tracker): show resolved distributor badge on fund cards"
```

---

### Task 3: "Who sold this" distributor rollup summary

**Files:**
- Modify: `app/cas-tracker/page.js` (new rollup card ~after line 2691, before the filter-toggle block)

**Interfaces:**
- Consumes: `distributorCache` (Task 2), `extractArnDigits` from `lib/distributorResolution.js` (Task 1), `currentInfo.holdings` (existing).

- [ ] **Step 1: Add the rollup card**

Locate the closing of the top-level stats IIFE:

```jsx
                  </div>
                </div>
              );
            })()}

            {/* ── Filter toggle (only when SIF holdings exist) ── */}
```

Insert a new block between the `})()}` and the filter-toggle comment:

```jsx
                  </div>
                </div>
              );
            })()}

            {/* ── "Who sold this" distributor rollup ── */}
            {(() => {
              const casHoldings = (currentInfo.holdings || []);
              if (casHoldings.length === 0) return null;

              const buckets = {}; // key: resolved ARN or 'DIRECT' → { count, label }
              casHoldings.forEach(h => {
                const arn = extractArnDigits(h.advisor);
                if (!arn) {
                  buckets.DIRECT = buckets.DIRECT || { count: 0, label: 'Direct' };
                  buckets.DIRECT.count++;
                  return;
                }
                const record = distributorCache[arn];
                // A well-formed ARN whose lookup hasn't resolved yet, or
                // whose lookup genuinely failed, is excluded entirely --
                // indistinguishable from "still loading", and bucketing it
                // as Direct would be actively wrong (this holding DOES have
                // a distributor, we just don't know who yet/couldn't verify).
                if (record === undefined) return;
                const key = record ? arn : `UNKNOWN_${arn}`;
                const label = record ? record.name : `ARN-${arn}`;
                buckets[key] = buckets[key] || { count: 0, label };
                buckets[key].count++;
              });

              const entries = Object.values(buckets).sort((a, b) => b.count - a.count);
              // Nothing to roll up (every holding is Direct, or every
              // non-Direct holding is still unresolved/failed) -- a rollup
              // with nothing informative to add is noise, not information.
              if (entries.length === 0 || (entries.length === 1 && entries[0] === buckets.DIRECT)) return null;

              const totalResolvableCount = casHoldings.length;
              const summary = entries
                .map(e => `${e.count} of ${totalResolvableCount} holding${totalResolvableCount === 1 ? '' : 's'} via ${e.label}`)
                .join(' · ');

              return (
                <div style={{
                  marginBottom: 18, padding: '10px 16px', borderRadius: 10,
                  background: 'var(--s2)', border: '1.5px solid var(--border)',
                  fontSize: '.7rem', color: 'var(--text2)', lineHeight: 1.6,
                }}>
                  {summary}
                </div>
              );
            })()}

            {/* ── Filter toggle (only when SIF holdings exist) ── */}
```

- [ ] **Step 2: Manual verification**

1. Open a CAS where every holding is "Direct / N/A" — confirm the rollup card does NOT render (not even empty).
2. Open a CAS with a mix of Direct and at least one resolvable distributor — confirm the rollup card shows something like "8 of 10 holdings via 251838 (Atin Kumar Agrawal) · 2 of 10 holdings via Direct", sorted by count descending.
3. Confirm switching between PAN tabs / family view updates the rollup to reflect only the currently-active `currentInfo.holdings` (the rollup is computed from `currentInfo`, which already changes with the active view, unlike the resolution effect in Task 2 which resolves ARNs across all loaded PANs up front).

- [ ] **Step 3: Commit**

```bash
git add app/cas-tracker/page.js
git commit -m "feat(cas-tracker): add who-sold-this distributor rollup summary"
```

---

## Self-Review Notes

- **Spec coverage:** `lib/distributorResolution.js` batch resolver (Task 1) ✓, resolved hover badge replacing the plain Advisor row (Task 2) ✓, "who sold this" rollup (Task 3) ✓. Out-of-scope items (Portfolio integration, verifying `scheme.advisor`'s real-world format, the social-media-links endpoint) are untouched by any task, matching the spec.
- **Corrections applied during planning:** all line numbers in this plan were re-derived from the actual current `app/cas-tracker/page.js` (confirmed via direct read at plan-writing time), not trusted from the design spec's own citations or any earlier session note — the file was substantially refactored (RedemptionPlanner/TransactionHistoryDrawer extraction) after those were written. The design spec's citations turned out to still be close (off by roughly 10-25 lines in most places), but none were assumed correct without verification.
- **Auth non-issue confirmed:** `GET /api/distributor?arn=` requires a signed-in session (added during sub-project 1's final review, after the design spec was written). CAS Tracker is itself only reachable by signed-in users, so its same-origin `fetch()` calls carry the session cookie automatically — no plan change needed, noted explicitly in Global Constraints so no task re-litigates it.
- **Type consistency:** `distributorCache`'s shape (`{ [arn]: DistributorRecord|null }`) is identical to what `resolveDistributors` (Task 1) returns and what Task 2's effect merges in and Task 3's rollup reads — no renaming or reshaping across tasks.
