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
  const { extractArnDigits, isArnBlocked, arnBlockedReason, normalizeArn } = await import('../lib/amfiDistributor.js');

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

  test('strips a leading zero -- AMFI stores ARNs without padding (ARN-0155 -> "155", confirmed live)', () => {
    assert.strictEqual(extractArnDigits('ARN-0155'), '155');
  });

  test('strips multiple leading zeros from a bare digit string (within the 4-7 digit window)', () => {
    assert.strictEqual(extractArnDigits('0025184'), '25184');
  });

  test('leaves an already-unpadded ARN unchanged', () => {
    assert.strictEqual(extractArnDigits('ARN-251838'), '251838');
  });

  // ── normalizeArn (direct admin entry, e.g. an arn_overrides correction --
  //    no 4-7 digit disambiguation window, since a human is asserting a
  //    specific known ARN rather than this being parsed out of free text) ──
  test('normalizeArn strips an "ARN-" prefix and leading zeros', () => {
    assert.strictEqual(normalizeArn('ARN-0155'), '155');
  });

  test('normalizeArn accepts a bare digit string shorter than 4 digits (NJ IndiaInvest\'s real ARN)', () => {
    assert.strictEqual(normalizeArn('155'), '155');
  });

  test('normalizeArn accepts a digit run longer than 7 digits', () => {
    assert.strictEqual(normalizeArn('12345678'), '12345678');
  });

  test('normalizeArn strips whitespace and non-digit separators', () => {
    assert.strictEqual(normalizeArn(' ARN 251838 '), '251838');
  });

  test('normalizeArn returns null for blank input', () => {
    assert.strictEqual(normalizeArn(''), null);
  });

  test('normalizeArn returns null for null/undefined input', () => {
    assert.strictEqual(normalizeArn(null), null);
    assert.strictEqual(normalizeArn(undefined), null);
  });

  test('normalizeArn returns null for text with no digits at all', () => {
    assert.strictEqual(normalizeArn('Direct'), null);
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
