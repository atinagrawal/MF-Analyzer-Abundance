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
//
// Mocking note (environment-specific -- see task-1-report.md for the full
// writeup): lib/db.js also uses ES module import/export syntax. On this
// repo's Node version (v20.20.2), any .js file containing import/export
// syntax gets loaded through Node's real ESM loader (its "detect-module"
// feature reparses it as ESM) regardless of how it's reached -- including
// via require() of a consumer, and including after require.cache has been
// pre-seeded with a fake entry at that file's resolved path. ESM-loaded
// modules are cached in Node's own per-URL module registry, which a
// require.cache write never touches, so a require.cache swap silently has
// no effect here: rateLimit.js would still end up importing the real
// lib/db.js (and therefore a real, connectionless-but-live pg.Pool) rather
// than the fake. What DOES work, and is used below: dynamic-import lib/db.js
// FIRST (exactly once -- Node's ESM registry caches by resolved URL, so
// this is the SAME module object lib/rateLimit.js will subsequently import),
// then monkey-patch `.query` directly on that shared pool object BEFORE
// dynamically importing lib/rateLimit.js. Because both imports resolve to
// the identical cached module namespace, rateLimit.js's internal `pool` is
// the exact same object reference whose `.query` was just replaced.
const assert = require('assert');

(async () => {
  const dbModule = await import('../lib/db.js');
  const fakePoolState = { queries: [], responses: [] };
  dbModule.default.query = async (sql, params) => {
    fakePoolState.queries.push({ sql, params });
    const next = fakePoolState.responses.shift();
    return next ?? { rows: [{ count: 1 }] };
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
