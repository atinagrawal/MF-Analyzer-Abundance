// tests/portfolioAnalysis.test.js
//
// Unit tests for lib/portfolioAnalysis.js's pure combining/overlap/M-Cap math.
// Run with: node tests/portfolioAnalysis.test.js

const assert = require('assert');
const { normalizeName, combineExposure, computeOverlap, computeMCapAllocation, isComparableHolding, isDerivativeHolding } = require('../lib/portfolioAnalysis');

console.log('=== Running Portfolio Analysis Unit Tests ===\n');

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

test('normalizeName strips Ltd/Limited/punctuation and lowercases', () => {
  assert.strictEqual(normalizeName('HDFC Bank Ltd.'), 'hdfc bank');
  assert.strictEqual(normalizeName('Reliance Industries Limited'), 'reliance industries');
  assert.strictEqual(normalizeName('  Tata   Steel  '), 'tata steel');
});

test('combineExposure sums asset allocation across two equal-weighted funds', () => {
  const funds = [
    { amfiCode: 'A', holdings: [
      { securityName: 'HDFC Bank Ltd', assetClass: 'EQUITY', sector: 'Banks', weightagePct: 80 },
      { securityName: 'Cash', assetClass: 'CASH', sector: null, weightagePct: 20 },
    ] },
    { amfiCode: 'B', holdings: [
      { securityName: 'ICICI Bank Ltd', assetClass: 'EQUITY', sector: 'Banks', weightagePct: 100 },
    ] },
  ];
  const allocations = { A: 50, B: 50 };
  const result = combineExposure(funds, allocations);
  const equity = result.assetAllocation.find((r) => r.name === 'Equity').pct;
  const cash = result.assetAllocation.find((r) => r.name === 'Cash').pct;
  assert.strictEqual(Math.round(equity * 100) / 100, 90); // 80*0.5 + 100*0.5
  assert.strictEqual(Math.round(cash * 100) / 100, 10);   // 20*0.5
});

test('combineExposure nets a negative (short) weightage into its true total instead of clamping to 0', () => {
  // A short futures position (or a negative cash-equivalent line like "Net
  // Payables") must reduce its asset class's total -- flooring it to 0
  // instead double-counts every positive holding without the offsetting
  // short, which is exactly what made a real long-short SIF's Asset
  // Allocation sum to 112% instead of ~100% (verified live, 2026-08).
  const funds = [
    { amfiCode: 'A', holdings: [
      { securityName: 'Nifty Futures 30-JUN-26', assetClass: 'EQUITY', sector: 'Derivatives', weightagePct: -15 },
      { securityName: 'HDFC Bank Ltd', assetClass: 'EQUITY', sector: 'Banks', weightagePct: 90 },
    ] },
  ];
  const result = combineExposure(funds, { A: 100 });
  const equity = result.assetAllocation.find((r) => r.name === 'Equity').pct;
  assert.strictEqual(Math.round(equity * 100) / 100, 75); // 90 + (-15), not 90 (clamped)
});

test('isComparableHolding treats generic cash-equivalent names as non-comparable, everything else as comparable', () => {
  assert.strictEqual(isComparableHolding({ securityName: 'Net Current Assets' }), false);
  assert.strictEqual(isComparableHolding({ securityName: 'TREPS' }), false);
  assert.strictEqual(isComparableHolding({ securityName: 'Reverse Repo' }), false);
  assert.strictEqual(isComparableHolding({ securityName: '' }), false);
  assert.strictEqual(isComparableHolding({ securityName: 'Govt Bond X', assetClass: 'DEBT' }), true);
  assert.strictEqual(isComparableHolding({ securityName: 'REIT Fund Y', assetClass: 'REALEST' }), true);
  assert.strictEqual(isComparableHolding({ securityName: 'Gold ETF Z', assetClass: 'MF' }), true);
});

test('isComparableHolding matches generic cash names even when suffixed with a maturity date/tenor', () => {
  // Real disclosures often suffix these with a date, e.g. "TREPS 02-Apr-2026 DEPO 10"
  // -- an exact-match check would let these slip through as if they were named securities.
  assert.strictEqual(isComparableHolding({ securityName: 'TREPS 02-Apr-2026 DEPO 10' }), false);
  assert.strictEqual(isComparableHolding({ securityName: 'Reverse Repo 01-May-2026' }), false);
  assert.strictEqual(isComparableHolding({ securityName: 'Net  Current   Assets' }), false); // extra whitespace
  // But a real security whose name merely starts with similar letters must still count.
  assert.strictEqual(isComparableHolding({ securityName: 'Repco Home Finance Ltd' }), true);
});

test('combineExposure includes named debt/REIT holdings in stockExposure and appends a Cash & Other Unnamed row for generic cash only', () => {
  const funds = [
    { amfiCode: 'A', holdings: [
      { securityName: 'HDFC Bank Ltd', assetClass: 'EQUITY', sector: 'Banks', weightagePct: 70 },
      { securityName: 'Govt Bond X', assetClass: 'DEBT', sector: 'Sovereign', weightagePct: 20 },
      { securityName: 'Cash', assetClass: 'CASH', sector: null, weightagePct: 10 },
    ] },
    { amfiCode: 'B', holdings: [
      { securityName: 'REIT Fund Y', assetClass: 'REALEST', sector: null, weightagePct: 100 },
    ] },
  ];
  const allocations = { A: 60, B: 40 };
  const result = combineExposure(funds, allocations);

  // Named DEBT/REALEST holdings show up individually, not lumped into a generic bucket.
  const bondRow = result.stockExposure.find((r) => r.name === 'Govt Bond X');
  const reitRow = result.stockExposure.find((r) => r.name === 'REIT Fund Y');
  assert.ok(bondRow, 'Govt Bond X should appear as a named holding');
  assert.ok(reitRow, 'REIT Fund Y should appear as a named holding');
  assert.strictEqual(bondRow.pct, 12);  // 20 * 0.6
  assert.strictEqual(reitRow.pct, 40);  // 100 * 0.4

  // Only the generic-named "Cash" holding lands in the summary row.
  const cashRow = result.stockExposure.find((r) => r.name === 'Cash & Other Unnamed');
  assert.ok(cashRow, 'Cash & Other Unnamed row should be present in stockExposure');
  assert.strictEqual(cashRow.pct, 6); // 10 * 0.6
  // The last row of stockExposure should be this summary row (appended after top10+Other)
  assert.strictEqual(result.stockExposure[result.stockExposure.length - 1].name, 'Cash & Other Unnamed');
});

test('computeOverlap: identical single holding across two funds gives full overlap', () => {
  const funds = [
    { amfiCode: 'A', holdings: [{ securityName: 'HDFC Bank Ltd', assetClass: 'EQUITY', sector: 'Banks', weightagePct: 40 }] },
    { amfiCode: 'B', holdings: [{ securityName: 'HDFC Bank Limited', assetClass: 'EQUITY', sector: 'Banks', weightagePct: 25 }] },
  ];
  const grid = computeOverlap(funds);
  assert.strictEqual(grid[0][0], 100);
  assert.strictEqual(grid[1][1], 100);
  assert.strictEqual(grid[0][1], 25); // min(40, 25), matched despite Ltd/Limited naming difference
  assert.strictEqual(grid[1][0], 25);
});

test('computeOverlap includes named debt holdings in the overlap sum', () => {
  const funds = [
    { amfiCode: 'A', holdings: [
      { securityName: 'Govt Bond X', assetClass: 'DEBT', sector: 'Sovereign', weightagePct: 60 },
      { securityName: 'HDFC Bank Ltd', assetClass: 'EQUITY', sector: 'Banks', weightagePct: 40 },
    ] },
    { amfiCode: 'B', holdings: [
      { securityName: 'Govt Bond X', assetClass: 'DEBT', sector: 'Sovereign', weightagePct: 60 },
      { securityName: 'HDFC Bank Ltd', assetClass: 'EQUITY', sector: 'Banks', weightagePct: 40 },
    ] },
  ];
  const grid = computeOverlap(funds);
  assert.strictEqual(grid[0][1], 100); // both the named debt holding and the equity holding count: 60 + 40
});

test('computeOverlap still excludes generic cash-equivalent holdings even when both funds share the same generic name', () => {
  const funds = [
    { amfiCode: 'A', holdings: [
      { securityName: 'Net Current Assets', assetClass: 'CASH', sector: null, weightagePct: 50 },
      { securityName: 'HDFC Bank Ltd', assetClass: 'EQUITY', sector: 'Banks', weightagePct: 50 },
    ] },
    { amfiCode: 'B', holdings: [
      { securityName: 'Net Current Assets', assetClass: 'CASH', sector: null, weightagePct: 50 },
      { securityName: 'HDFC Bank Ltd', assetClass: 'EQUITY', sector: 'Banks', weightagePct: 50 },
    ] },
  ];
  const grid = computeOverlap(funds);
  assert.strictEqual(grid[0][1], 50); // only the equity holding counts, not the matching generic cash bucket
});

test('computeMCapAllocation buckets by the provided M-Cap index and reports Unclassified', () => {
  const fund = { amfiCode: 'A', holdings: [
    { securityName: 'HDFC Bank Ltd', assetClass: 'EQUITY', sector: 'Banks', weightagePct: 50 },
    { securityName: 'Some Tiny Co', assetClass: 'EQUITY', sector: 'Other', weightagePct: 30 },
    { securityName: 'Govt Bond', assetClass: 'DEBT', sector: 'Sovereign', weightagePct: 20 },
  ] };
  const mCapIndex = new Map([['hdfc bank', 'Large Cap']]);
  const result = computeMCapAllocation(fund, mCapIndex);
  assert.strictEqual(result.large, 62.5);  // 50 / (50+30) equity-only denominator
  assert.strictEqual(result.unclassified, 37.5);
  assert.strictEqual(result.mid, 0);
  assert.strictEqual(result.small, 0);
  assert.strictEqual(result.derivatives, 0);
});

test('isDerivativeHolding recognizes every real naming convention found live (Futures suffix, $$ suffix, trailing expiry-date token)', () => {
  assert.strictEqual(isDerivativeHolding({ assetClass: 'EQUITY', securityName: 'Suzlon Energy Ltd Futures' }), true);
  assert.strictEqual(isDerivativeHolding({ assetClass: 'EQUITY', securityName: 'MAX Healthcare Institute Ltd $$' }), true);
  assert.strictEqual(isDerivativeHolding({ assetClass: 'EQUITY', securityName: 'Central Depository Services (India) Limited Dec24**' }), true);
  assert.strictEqual(isDerivativeHolding({ assetClass: 'EQUITY', securityName: 'Adani Enterprises Ltd. 30-JUN-26' }), true);
  assert.strictEqual(isDerivativeHolding({ assetClass: 'EQUITY', securityName: 'Kfin Technologies Limited Jul25' }), true);
  // Plain cash-equity holdings must never match
  assert.strictEqual(isDerivativeHolding({ assetClass: 'EQUITY', securityName: 'Suzlon Energy Ltd' }), false);
  assert.strictEqual(isDerivativeHolding({ assetClass: 'EQUITY', securityName: 'HDFC Bank Ltd' }), false);
  // A DEBT instrument's own maturity date is normal, not a derivative marker
  assert.strictEqual(isDerivativeHolding({ assetClass: 'DEBT', securityName: 'INDIAN OVERSEAS BANK CD 26FEB27' }), false);
});

test('computeMCapAllocation reports net (unclamped) derivative exposure separately, excluded from the Large/Mid/Small/Others 100%', () => {
  const fund = { amfiCode: 'A', holdings: [
    { securityName: 'HDFC Bank Ltd', assetClass: 'EQUITY', sector: 'Banks', weightagePct: 50 },
    { securityName: 'ICICI Bank Ltd', assetClass: 'EQUITY', sector: 'Banks', weightagePct: 50 },
    { securityName: 'Suzlon Energy Ltd Futures', assetClass: 'EQUITY', sector: 'Derivatives', weightagePct: -8 },
    { securityName: 'Adani Enterprises Ltd. 30-JUN-26', assetClass: 'EQUITY', sector: 'Derivatives', weightagePct: 5 },
  ] };
  const mCapIndex = new Map([['hdfc bank', 'Large Cap'], ['icici bank', 'Large Cap']]);
  const result = computeMCapAllocation(fund, mCapIndex);
  assert.strictEqual(result.large, 100);       // 50+50 over an equity-only denominator that excludes both derivative rows
  assert.strictEqual(result.derivatives, -3);  // -8 + 5, net, as a % of total fund assets -- not divided by totalEquity
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
