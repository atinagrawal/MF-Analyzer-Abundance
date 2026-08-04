// tests/growthProjection.test.js
const assert = require('assert');
const { ASSUMED_CAGR, blendedRate, buildProjectionTable } = require('../lib/growthProjection');

console.log('=== Running Growth Projection Unit Tests ===\n');

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

test('ASSUMED_CAGR has Equity, Debt, Gold as decimal fractions under 1', () => {
  assert.strictEqual(typeof ASSUMED_CAGR.EQUITY, 'number');
  assert.strictEqual(typeof ASSUMED_CAGR.DEBT, 'number');
  assert.strictEqual(typeof ASSUMED_CAGR.GOLD, 'number');
  assert.ok(ASSUMED_CAGR.EQUITY > 0 && ASSUMED_CAGR.EQUITY < 1);
  assert.ok(ASSUMED_CAGR.DEBT > 0 && ASSUMED_CAGR.DEBT < 1);
  assert.ok(ASSUMED_CAGR.GOLD > 0 && ASSUMED_CAGR.GOLD < 1);
});

test('blendedRate: 100% equity portfolio returns the equity rate exactly', () => {
  const rate = blendedRate([{ name: 'Equity', pct: 100 }]);
  assert.strictEqual(rate, ASSUMED_CAGR.EQUITY);
});

test('blendedRate: Cash buckets into the Debt rate, Other buckets into the Gold rate', () => {
  const rate = blendedRate([
    { name: 'Equity', pct: 50 },
    { name: 'Cash', pct: 25 },
    { name: 'Other', pct: 25 },
  ]);
  const expected = 0.5 * ASSUMED_CAGR.EQUITY + 0.25 * ASSUMED_CAGR.DEBT + 0.25 * ASSUMED_CAGR.GOLD;
  assert.ok(Math.abs(rate - expected) < 1e-9);
});

test('blendedRate: weights that do not sum to 100 still normalize correctly', () => {
  // e.g. still-loading portfolio where allocations sum to 60
  const rate = blendedRate([
    { name: 'Equity', pct: 30 },
    { name: 'Debt', pct: 30 },
  ]);
  const expected = 0.5 * ASSUMED_CAGR.EQUITY + 0.5 * ASSUMED_CAGR.DEBT;
  assert.ok(Math.abs(rate - expected) < 1e-9);
});

test('blendedRate: empty allocation returns 0 without dividing by zero', () => {
  assert.strictEqual(blendedRate([]), 0);
});

test('buildProjectionTable: lumpsum keeps Total Invested constant across all rows', () => {
  const rows = buildProjectionTable({ proposalType: 'lumpsum', totalAmount: 100000, blendedRate: 0.1 });
  assert.strictEqual(rows.length, 6);
  assert.deepStrictEqual(rows.map((r) => r.year), [3, 5, 8, 10, 15, 20]);
  for (const r of rows) assert.strictEqual(r.totalInvested, 100000);
  // Year 10 @ 10% CAGR on 100000 lumpsum: 100000 * 1.1^10 ≈ 259374.25
  const year10 = rows.find((r) => r.year === 10);
  assert.ok(Math.abs(year10.projectedValue - 259374.25) < 1);
});

test('buildProjectionTable: SIP grows Total Invested linearly with months elapsed', () => {
  const rows = buildProjectionTable({ proposalType: 'sip', totalAmount: 10000, sipFrequency: 'monthly', blendedRate: 0.12 });
  const year5 = rows.find((r) => r.year === 5);
  assert.strictEqual(year5.totalInvested, 10000 * 5 * 12);
  // SIP future value must exceed total invested once a positive rate compounds for years
  assert.ok(year5.projectedValue > year5.totalInvested);
});

test('buildProjectionTable: zero rate makes projected value equal total invested (lumpsum)', () => {
  const rows = buildProjectionTable({ proposalType: 'lumpsum', totalAmount: 50000, blendedRate: 0 });
  for (const r of rows) assert.strictEqual(r.projectedValue, 50000);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
