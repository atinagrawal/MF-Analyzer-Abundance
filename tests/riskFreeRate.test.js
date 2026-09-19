// tests/riskFreeRate.test.js
//
// Unit tests for lib/riskFreeRate.js's sharpeRatio (pure function).
// Run with: node tests/riskFreeRate.test.js

const assert = require('assert');

(async () => {
  const { sharpeRatio, RISK_FREE_RATE } = await import('../lib/riskFreeRate.js');

  console.log('=== Running riskFreeRate Unit Tests ===\n');

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

  test('RISK_FREE_RATE matches the rate already publicly disclosed on the homepage FAQ', () => {
    assert.strictEqual(RISK_FREE_RATE, 6.5);
  });

  test('sharpeRatio computes (return - risk-free) / volatility', () => {
    // HDFC Flexi Cap Fund's real production figures, verified against
    // Tickertape during this feature's design: ret_3y=14.55, vol=13 -> ~0.62
    assert.strictEqual(+sharpeRatio(14.55, 13).toFixed(2), 0.62);
  });

  test('sharpeRatio is negative when return is below the risk-free rate', () => {
    assert.ok(sharpeRatio(-0.76, 20) < 0);
  });

  test('sharpeRatio returns null when return is missing', () => {
    assert.strictEqual(sharpeRatio(null, 13), null);
  });

  test('sharpeRatio returns null when volatility is missing', () => {
    assert.strictEqual(sharpeRatio(14.55, null), null);
  });

  test('sharpeRatio returns null (not Infinity/NaN) when volatility is zero', () => {
    assert.strictEqual(sharpeRatio(14.55, 0), null);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
