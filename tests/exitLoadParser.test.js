/**
 * tests/exitLoadParser.test.js
 *
 * Unit tests verifying exitLoadParser against exact ground-truth exit load clauses.
 * Run with: node tests/exitLoadParser.test.js
 */

const assert = require('assert');
const { parseExitLoadText } = require('../lib/exitLoadParser');

console.log('=== Running Exit Load Parser Unit Tests ===\n');

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

// 1. Parag Parikh Flexi Cap (Cross-check against ground truth)
test('Parag Parikh Flexi Cap multi-tier and 10% free allowance', () => {
  const input = "For units above 10% of the investment, exit load of 2% if redeemed within 365 days and 1% if redeemed after 365 days but on or before 730 days.";
  const res = parseExitLoadText(input);
  assert.strictEqual(res.confidence, 'high');
  assert.strictEqual(res.freePercent, 10);
  assert.deepStrictEqual(res.tiers, [
    { days: 365, rate: 0.02 },
    { days: 730, rate: 0.01 }
  ]);
});

// 2. SBI Small Cap (Standard 1-year single tier)
test('SBI Small Cap Fund single tier', () => {
  const input = "Exit load of 1% if redeemed within 1 year";
  const res = parseExitLoadText(input);
  assert.strictEqual(res.confidence, 'high');
  assert.strictEqual(res.freePercent, 0);
  assert.deepStrictEqual(res.tiers, [
    { days: 365, rate: 0.01 }
  ]);
});

// 3. SBI Large Cap / Bluechip (Multi-tier short duration)
test('SBI Large Cap Fund multi-tier', () => {
  const input = "Exit load of 0.25% if redeemed within 30 days and 0.10% if redeemed after 30 days but on or before 90 days.";
  const res = parseExitLoadText(input);
  assert.strictEqual(res.confidence, 'high');
  assert.strictEqual(res.freePercent, 0);
  assert.deepStrictEqual(res.tiers, [
    { days: 30, rate: 0.0025 },
    { days: 90, rate: 0.0010 }
  ]);
});

// 4. Liquid Fund (7-day tiered schedule)
test('SBI Liquid Fund 7-day schedule', () => {
  const input = "Exit load of 0.0070% if redeemed within 1 day, 0.0065% if redeemed within 2 days, 0.0060% if redeemed within 3 days, 0.0055% if redeemed within 4 days, 0.0050% if redeemed within 5 days, 0.0045% if redeemed within 6 days.";
  const res = parseExitLoadText(input);
  assert.strictEqual(res.confidence, 'high');
  assert.strictEqual(res.tiers.length, 6);
  assert.strictEqual(res.tiers[0].days, 1);
  assert.strictEqual(res.tiers[0].rate, 0.00007);
});

// 5. ELSS / Index Fund (Nil exit load)
test('ELSS / Index Fund Nil exit load', () => {
  const input = "Nil";
  const res = parseExitLoadText(input);
  assert.strictEqual(res.confidence, 'high');
  assert.strictEqual(res.freePercent, 0);
  assert.deepStrictEqual(res.tiers, []);
});

// 6. Ambiguous / Complex Unparseable Clause (Low confidence fallback)
test('Ambiguous custom text clause fallback', () => {
  const input = "Subject to lock-in period specified under scheme information document. Consult AMC for details.";
  const res = parseExitLoadText(input);
  assert.strictEqual(res.confidence, 'low');
  assert.strictEqual(res.tiers, null);
});

console.log(`\nTest Results: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exit(1);
