// tests/resolveSchemeLineage.test.js
//
// Unit tests for scripts/resolve_scheme_lineage.js's pure AMFI-historical-
// report parsing logic. The script's live-network resolution flow (mfapi.in
// search, AMFI historical downloads) can't be unit-tested without live
// credentials/network -- this covers only the parsing, which is pure.
// Run with: node tests/resolveSchemeLineage.test.js

const assert = require('assert');
const { parseAmfiHistoricalReport, findMatchingRecords, toAmfiDate } = require('../scripts/resolve_scheme_lineage');

console.log('=== Running Resolve Scheme Lineage Unit Tests ===\n');

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

test('parseAmfiHistoricalReport extracts valid rows and skips header/section/garbage lines', () => {
  const text = [
    'Scheme Code;Scheme Name;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Repurchase Price;Sale Price;Date',
    '',
    'Open Ended Schemes ( Money Market )',
    '129220;L&T Emerging Businesses Fund - Direct Plan - Growth;INF917K01QA1;;51.226;;;01-Nov-2022',
    '129223;L&T Emerging Businesses Fund - Regular Plan - Growth;INF917K01QC7;;47.446;;;01-Nov-2022',
    'garbage;not;a;real;row',
  ].join('\n');
  const records = parseAmfiHistoricalReport(text);
  assert.strictEqual(records.length, 2);
  assert.strictEqual(records[0].code, '129220');
  assert.strictEqual(records[0].nav, 51.226);
  assert.strictEqual(records[0].isinGrowth, 'INF917K01QA1');
  assert.strictEqual(records[1].code, '129223');
  assert.strictEqual(records[1].date, '01-Nov-2022');
});

test('parseAmfiHistoricalReport skips rows with a non-positive or non-numeric NAV', () => {
  const text = [
    '129220;Some Fund - Growth;ISIN1;;0;;;01-Nov-2022',
    '129221;Some Fund - Growth;ISIN2;;-5;;;01-Nov-2022',
    '129222;Some Fund - Growth;ISIN3;;N/A;;;01-Nov-2022',
    '129223;Some Fund - Growth;ISIN4;;10.5;;;01-Nov-2022',
  ].join('\n');
  const records = parseAmfiHistoricalReport(text);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].code, '129223');
});

test('findMatchingRecords matches case-insensitively by substring', () => {
  const records = [
    { code: '1', name: 'L&T Emerging Businesses Fund - Direct Plan - Growth' },
    { code: '2', name: 'l&t emerging businesses fund - regular plan - growth' },
    { code: '3', name: 'HSBC Small Cap Fund - Regular Growth' },
  ];
  const matches = findMatchingRecords(records, 'L&T Emerging Businesses Fund');
  assert.strictEqual(matches.length, 2);
});

test('findMatchingRecords returns an empty array when nothing matches', () => {
  const records = [{ code: '1', name: 'HSBC Small Cap Fund - Regular Growth' }];
  assert.deepStrictEqual(findMatchingRecords(records, 'Nonexistent Fund'), []);
});

test('toAmfiDate builds a full-month window from "YYYY-MM"', () => {
  assert.deepStrictEqual(toAmfiDate('2022-11'), { from: '01-Nov-2022', to: '28-Nov-2022' });
});

test('toAmfiDate falls back to January for a year-only date', () => {
  assert.deepStrictEqual(toAmfiDate('2011'), { from: '01-Jan-2011', to: '28-Jan-2011' });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
