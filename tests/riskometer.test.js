// tests/riskometer.test.js
//
// Unit tests for lib/riskometer.js's matchBenchmarkRisk (pure string matching).
// lib/riskometer.js uses ES module import/export syntax (to match
// pages/api/index-dashboard.js's own style), and this project's package.json
// has no "type": "module", so plain `require()` cannot load it under Node's
// CommonJS default -- use dynamic import() instead.
// Run with: node tests/riskometer.test.js

const assert = require('assert');

(async () => {
  const { matchBenchmarkRisk, matchOwnSchemeRisk, normalizeSchemeFamilyName } = await import('../lib/riskometer.js');

  console.log('=== Running Riskometer Unit Tests ===\n');

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

  const SAMPLE_MAP = {
    'nifty 50': { score: 5.33, label: 'Very High' },
    'nifty smallcap 250': { score: 6.12, label: 'Very High' },
    '10 year gsec': { score: 2.1, label: 'Moderate' },
  };

  test('matchBenchmarkRisk strips a trailing TRI/TR suffix', () => {
    assert.deepStrictEqual(matchBenchmarkRisk('NIFTY 50 TRI', SAMPLE_MAP), SAMPLE_MAP['nifty 50']);
    assert.deepStrictEqual(matchBenchmarkRisk('Nifty 50 TR', SAMPLE_MAP), SAMPLE_MAP['nifty 50']);
  });

  test('matchBenchmarkRisk is case-insensitive and tolerates punctuation/hyphen variants', () => {
    assert.deepStrictEqual(matchBenchmarkRisk('Nifty-50 (TRI)', SAMPLE_MAP), SAMPLE_MAP['nifty 50']);
  });

  test('matchBenchmarkRisk matches multi-word benchmark names', () => {
    assert.deepStrictEqual(matchBenchmarkRisk('Nifty Smallcap 250 TRI', SAMPLE_MAP), SAMPLE_MAP['nifty smallcap 250']);
  });

  test('matchBenchmarkRisk returns null for an unmatched benchmark, never a wrong guess', () => {
    assert.strictEqual(matchBenchmarkRisk('Some Unknown Custom Index', SAMPLE_MAP), null);
  });

  test('matchBenchmarkRisk returns null for empty/missing input', () => {
    assert.strictEqual(matchBenchmarkRisk('', SAMPLE_MAP), null);
    assert.strictEqual(matchBenchmarkRisk(null, SAMPLE_MAP), null);
  });

  const SCHEME_RISK_MAP = {
    'hdfc flexi cap': 'Very High',
    'hdfc liquid': 'Moderate',
  };

  test('normalizeSchemeFamilyName strips Direct/Regular/Plan/Growth/IDCW/Fund noise down to the bare family name', () => {
    assert.strictEqual(normalizeSchemeFamilyName('HDFC Flexi Cap Fund - Direct Plan - Growth'), 'hdfc flexi cap');
    assert.strictEqual(normalizeSchemeFamilyName('HDFC Flexi Cap Fund - Growth Plan'), 'hdfc flexi cap');
    assert.strictEqual(normalizeSchemeFamilyName('HDFC Flexi Cap Fund - IDCW Plan'), 'hdfc flexi cap');
  });

  test('matchOwnSchemeRisk matches regardless of plan/option suffix variant', () => {
    assert.strictEqual(matchOwnSchemeRisk('HDFC Flexi Cap Fund - Direct Plan - Growth', SCHEME_RISK_MAP), 'Very High');
    assert.strictEqual(matchOwnSchemeRisk('HDFC Liquid Fund - Regular Plan - Growth', SCHEME_RISK_MAP), 'Moderate');
  });

  test('matchOwnSchemeRisk returns null for an unmatched scheme, never a wrong guess', () => {
    assert.strictEqual(matchOwnSchemeRisk('Some Unknown New Fund - Direct Plan - Growth', SCHEME_RISK_MAP), null);
  });

  test('matchOwnSchemeRisk returns null for empty/missing input', () => {
    assert.strictEqual(matchOwnSchemeRisk('', SCHEME_RISK_MAP), null);
    assert.strictEqual(matchOwnSchemeRisk(null, SCHEME_RISK_MAP), null);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
