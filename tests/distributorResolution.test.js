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
  const { resolveDistributors, resolveArns, formatDistributorName, overrideKey, resolveHoldingArn } = await import('../lib/distributorResolution.js');

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

  await test('formatDistributorName title-cases an ALL-CAPS AMFI name', async () => {
    assert.strictEqual(formatDistributorName('ATIN KUMAR AGRAWAL'), 'Atin Kumar Agrawal');
  });

  await test('formatDistributorName falls back to a placeholder for a missing/blank name', async () => {
    assert.strictEqual(formatDistributorName(''), 'Registered Distributor');
    assert.strictEqual(formatDistributorName('   '), 'Registered Distributor');
    assert.strictEqual(formatDistributorName(undefined), 'Registered Distributor');
  });

  await test('resolveHoldingArn falls back to extractArnDigits when no override exists', async () => {
    const arn = resolveHoldingArn('ABCDE1234F', '1234567/89', 'ARN-251838', {});
    assert.strictEqual(arn, '251838');
  });

  await test('resolveHoldingArn prefers an admin override over the raw CAS advisor string', async () => {
    const overrides = { [overrideKey('ABCDE1234F', '1234567/89')]: '251838' };
    const arn = resolveHoldingArn('ABCDE1234F', '1234567/89', 'ARN-0155 NJ INDIA INVEST PVT LTD', overrides);
    assert.strictEqual(arn, '251838');
  });

  await test('resolveHoldingArn only applies an override to the exact (pan, folio) it was set for', async () => {
    const overrides = { [overrideKey('ABCDE1234F', '1234567/89')]: '251838' };
    // Same PAN, different folio -- NJ's raw ARN should still resolve as normal.
    const arn = resolveHoldingArn('ABCDE1234F', '9999999/11', 'ARN-0155 NJ INDIA INVEST PVT LTD', overrides);
    assert.strictEqual(arn, '155');
  });

  // ── resolveArns -- takes ARNs that are ALREADY bare digits, no extraction.
  //    This is what app/cas-tracker/page.js's resolution effect calls
  //    directly (resolveHoldingArn's output -> resolveArns), specifically
  //    to avoid the double-extraction bug that used to make NJ IndiaInvest's
  //    "155" vanish when it was re-run through extractArnDigits a second
  //    time (155 is only 3 digits -- too short for extractArnDigits's 4-7
  //    digit free-text disambiguation window). ──
  await test('resolveArns resolves an already-bare short ARN like NJ IndiaInvest\'s "155" (the exact double-extraction regression)', async () => {
    await withMockFetch(
      () => ({ found: true, distributor: { arn: '155', name: 'NJ INDIA INVEST PVT LTD' } }),
      async (calls) => {
        // Simulates the real pipeline: extract once via resolveHoldingArn,
        // then hand the already-bare result straight to resolveArns.
        const arn = resolveHoldingArn('ABCDE1234F', '1234567/89', 'ARN-0155 NJ INDIA INVEST PVT LTD', {});
        const map = await resolveArns([arn]);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(calls[0], '/api/distributor?arn=155');
        assert.strictEqual(map['155'].name, 'NJ INDIA INVEST PVT LTD');
      }
    );
  });

  await test('resolveArns dedupes repeated ARNs into one network call each', async () => {
    await withMockFetch(
      () => ({ found: true, distributor: { arn: '251838', name: 'ATIN KUMAR AGRAWAL' } }),
      async (calls) => {
        const map = await resolveArns(['251838', '251838']);
        assert.strictEqual(calls.length, 1);
        assert.strictEqual(Object.keys(map).length, 1);
      }
    );
  });

  await test('resolveArns filters out falsy entries with zero network calls', async () => {
    await withMockFetch(
      () => ({ found: true, distributor: {} }),
      async (calls) => {
        const map = await resolveArns([null, undefined, '']);
        assert.strictEqual(calls.length, 0);
        assert.deepStrictEqual(map, {});
      }
    );
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
