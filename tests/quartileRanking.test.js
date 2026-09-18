// tests/quartileRanking.test.js
//
// Unit tests for lib/quartileRanking.js's median, quartilesForPeriod, and
// buildQuartileReport (pure functions, no fetch/DOM involved).
// lib/quartileRanking.js uses ES module import/export syntax, and this
// project's package.json has no "type": "module", so plain require()
// cannot load it under Node's CommonJS default -- use dynamic import()
// instead, same as tests/riskometer.test.js.
// Run with: node tests/quartileRanking.test.js

const assert = require('assert');

(async () => {
  const { median, quartilesForPeriod, buildQuartileReport } = await import('../lib/quartileRanking.js');

  console.log('=== Running quartileRanking Unit Tests ===\n');

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

  // ── median ────────────────────────────────────────────────────────────
  test('median of an odd-length list is the middle value', () => {
    assert.strictEqual(median([5, 1, 3]), 3);
  });

  test('median of an even-length list averages the two middle values', () => {
    assert.strictEqual(median([10, 20, 30, 40]), 25);
  });

  test('median of an empty list is null', () => {
    assert.strictEqual(median([]), null);
  });

  // ── quartilesForPeriod ───────────────────────────────────────────────
  const EIGHT = [
    { code: 'A', ret_3y: 80 }, { code: 'B', ret_3y: 70 }, { code: 'C', ret_3y: 60 }, { code: 'D', ret_3y: 50 },
    { code: 'E', ret_3y: 40 }, { code: 'F', ret_3y: 30 }, { code: 'G', ret_3y: 20 }, { code: 'H', ret_3y: 10 },
  ];

  test('quartilesForPeriod splits 8 ranked funds into 4 even quartiles, highest return = Q1', () => {
    const q = quartilesForPeriod(EIGHT, 'ret_3y');
    assert.strictEqual(q.get('A'), 1);
    assert.strictEqual(q.get('B'), 1);
    assert.strictEqual(q.get('C'), 2);
    assert.strictEqual(q.get('D'), 2);
    assert.strictEqual(q.get('E'), 3);
    assert.strictEqual(q.get('F'), 3);
    assert.strictEqual(q.get('G'), 4);
    assert.strictEqual(q.get('H'), 4);
  });

  test('quartilesForPeriod handles a count not divisible by 4 without exceeding quartile 4', () => {
    const five = [
      { code: 'A', ret_3y: 50 }, { code: 'B', ret_3y: 40 }, { code: 'C', ret_3y: 30 },
      { code: 'D', ret_3y: 20 }, { code: 'E', ret_3y: 10 },
    ];
    const q = quartilesForPeriod(five, 'ret_3y');
    assert.deepStrictEqual([...q.values()].sort(), [1, 1, 2, 3, 4]);
    assert.strictEqual(q.get('E'), 4); // worst performer never ranks above 4
  });

  test('quartilesForPeriod excludes funds with a null value for this period entirely', () => {
    const withGap = [
      { code: 'A', ret_5y: 50 }, { code: 'B', ret_5y: null }, { code: 'C', ret_5y: 10 },
    ];
    const q = quartilesForPeriod(withGap, 'ret_5y');
    assert.strictEqual(q.has('B'), false);
    assert.strictEqual(q.size, 2);
  });

  test('quartilesForPeriod returns an empty map for an empty category', () => {
    const q = quartilesForPeriod([], 'ret_3y');
    assert.strictEqual(q.size, 0);
  });

  // ── buildQuartileReport ──────────────────────────────────────────────
  const SCREENER = [
    { code: 'LC1', category: 'Large Cap Fund', ret_1y: 12, ret_3y: 20, ret_5y: 22 },
    { code: 'LC2', category: 'Large Cap Fund', ret_1y: 8,  ret_3y: 14, ret_5y: 16 },
    { code: 'SC1', category: 'Small Cap Fund', ret_1y: 5,  ret_3y: 25, ret_5y: null }, // too young for 5Yr
  ];

  test('buildQuartileReport groups by category and computes quartiles per period', () => {
    const holdings = [
      { name: 'My Large Cap Pick', amfiCode: 'LC1', value: 100000 },
      { name: 'My Small Cap Pick', amfiCode: 'SC1', value: 50000 },
    ];
    const report = buildQuartileReport(holdings, SCREENER);
    assert.strictEqual(report.categories.length, 2);
    assert.strictEqual(report.categories[0].category, 'Large Cap Fund'); // alphabetical
    const lc = report.categories[0].funds[0];
    assert.strictEqual(lc.quartiles.ret_1y, 1); // LC1 beats LC2
    assert.strictEqual(lc.quartiles.ret_3y, 1);
    const sc = report.categories[1].funds[0];
    assert.strictEqual(sc.quartiles.ret_5y, null); // SC1 has no ret_5y at all
    assert.strictEqual(report.unranked.length, 0);
  });

  test('buildQuartileReport computes a category median from the full peer universe, not just held funds', () => {
    const holdings = [{ name: 'My Large Cap Pick', amfiCode: 'LC1', value: 100000 }];
    const report = buildQuartileReport(holdings, SCREENER);
    // median of [12, 8] (both LC1 and LC2, even though only LC1 is held)
    assert.strictEqual(report.categories[0].categoryMedian.ret_1y, 10);
  });

  test('buildQuartileReport puts a holding with no amfiCode in unranked', () => {
    const holdings = [{ name: 'Manual Holding', amfiCode: null, value: 1000 }];
    const report = buildQuartileReport(holdings, SCREENER);
    assert.strictEqual(report.categories.length, 0);
    assert.strictEqual(report.unranked.length, 1);
    assert.strictEqual(report.unranked[0].name, 'Manual Holding');
  });

  test('buildQuartileReport puts a holding whose amfiCode has no screener match in unranked', () => {
    const holdings = [{ name: 'Delisted Fund', amfiCode: 'NOTFOUND', value: 1000 }];
    const report = buildQuartileReport(holdings, SCREENER);
    assert.strictEqual(report.unranked.length, 1);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
