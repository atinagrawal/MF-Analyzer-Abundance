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
  const { median, quartilesForPeriod, buildQuartileReport, refineCategory } = await import('../lib/quartileRanking.js');

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

  // ── refineCategory ───────────────────────────────────────────────────
  test('refineCategory splits a Gold ETF FoF out of the generic Domestic FoF bucket', () => {
    assert.strictEqual(refineCategory('Other Scheme - FoF Domestic', 'ICICI Prudential Gold ETF FOF'), 'Gold FoF');
  });

  test('refineCategory splits a Silver ETF FoF out of the generic Domestic FoF bucket', () => {
    assert.strictEqual(refineCategory('Other Scheme - FoF Domestic', 'HDFC Silver ETF Fund of Fund'), 'Silver FoF');
  });

  test('refineCategory detects a combined Gold & Silver FoF', () => {
    assert.strictEqual(refineCategory('Other Scheme - FoF Domestic', 'Motilal Oswal Gold and Silver Passive Fund of Funds'), 'Gold & Silver FoF');
    assert.strictEqual(refineCategory('Other Scheme - FoF Domestic', 'HDFC GOLD SILVER PASSIVE FOF'), 'Gold & Silver FoF');
  });

  test('refineCategory detects Multi-Asset FoFs across hyphen/space spelling variants', () => {
    assert.strictEqual(refineCategory('Other Scheme - FoF Domestic', 'ICICI Prudential Multi-Asset Active FOF'), 'Multi Asset FoF');
    assert.strictEqual(refineCategory('Other Scheme - FoF Domestic', 'HSBC Multi Asset Active FOF'), 'Multi Asset FoF');
    assert.strictEqual(refineCategory('Other Scheme - FoF Domestic', 'Nippon India Multi - Asset Omni FoF'), 'Multi Asset FoF');
  });

  test('refineCategory normalizes AMFI\'s two differently-spelled Domestic FoF category strings to the same bucket before refining', () => {
    const a = refineCategory('Other Scheme - FoF Domestic', 'Quantum Gold ETF FOF');
    const b = refineCategory('Fund of Funds Scheme (Domestic) - Fund of Funds Scheme (Domestic)', 'Quantum Gold ETF FOF');
    assert.strictEqual(a, b);
    assert.strictEqual(a, 'Gold FoF');
  });

  test('refineCategory excludes gold-MINING equity funds from the Gold FoF bucket', () => {
    assert.strictEqual(refineCategory('Other Scheme - FoF Overseas', 'DSP World Gold Mining Overseas Equity Omni FoF'), 'Other Scheme - FoF Overseas');
  });

  test('refineCategory leaves a real, already-correct category untouched even if the name contains "gold"', () => {
    // Guards against a false positive: a fund isn't FoF-shaped just because
    // its name has "gold" in it -- refinement only applies within the FoF
    // categories themselves.
    assert.strictEqual(refineCategory('Equity Scheme - Large Cap Fund', 'HDFC Gold Coast Opportunities Fund'), 'Equity Scheme - Large Cap Fund');
  });

  test('refineCategory leaves other FoF sub-types (out of scope for this pass) under the normalized generic label', () => {
    assert.strictEqual(refineCategory('Other Scheme - FoF Domestic', 'HDFC Income Plus Arbitrage Active FOF'), 'Other Scheme - FoF Domestic');
  });

  test('refineCategory with no category at all (unmatched holding) still detects gold/silver/multi-asset by name alone', () => {
    assert.strictEqual(refineCategory(null, 'ICICI Prudential Multi-Asset Active FOF - Growth'), 'Multi Asset FoF');
  });

  test('refineCategory returns null when there is no category and the name matches nothing recognizable', () => {
    assert.strictEqual(refineCategory(null, 'Some Unrelated Scheme'), null);
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

  // ── buildQuartileReport × refineCategory integration ────────────────
  const FOF_SCREENER = [
    { code: 'GOLD1', category: 'Other Scheme - FoF Domestic', name: 'ICICI Prudential Gold ETF FOF', ret_1y: 20, ret_3y: 18, ret_5y: 15 },
    { code: 'GOLD2', category: 'Fund of Funds Scheme (Domestic) - Fund of Funds Scheme (Domestic)', name: 'Quantum Gold ETF FOF', ret_1y: 22, ret_3y: 19, ret_5y: 16 },
    { code: 'MA1', category: 'Other Scheme - FoF Domestic', name: 'HSBC Multi Asset Active FOF', ret_1y: 10, ret_3y: 12, ret_5y: 11 },
    { code: 'MA2', category: 'Other Scheme - FoF Domestic', name: 'HDFC Multi-Asset Active FOF', ret_1y: 11, ret_3y: 13, ret_5y: 12 },
    { code: 'ARB1', category: 'Other Scheme - FoF Domestic', name: 'HDFC Income Plus Arbitrage Active FOF', ret_1y: 7, ret_3y: 8, ret_5y: 7 },
  ];

  test('buildQuartileReport groups a Gold FoF from BOTH differently-spelled AMFI category strings into one real peer set', () => {
    const holdings = [{ name: 'ICICI Prudential Gold ETF FOF', amfiCode: 'GOLD1', value: 100000 }];
    const report = buildQuartileReport(holdings, FOF_SCREENER);
    const goldCat = report.categories.find(c => c.category === 'Gold FoF');
    assert.ok(goldCat, 'expected a Gold FoF category to exist');
    // Peer universe (used for the category median and quartile ranking)
    // includes GOLD2 too, even though it isn't held -- proves the
    // differently-spelled alias was normalized before refining.
    assert.strictEqual(goldCat.categoryMedian.ret_1y, 21); // median of [20, 22]
  });

  test('buildQuartileReport keeps Multi-Asset FoFs and arbitrage FoFs in separate real categories, not lumped together', () => {
    const holdings = [
      { name: 'HSBC Multi Asset Active FOF', amfiCode: 'MA1', value: 50000 },
      { name: 'HDFC Income Plus Arbitrage Active FOF', amfiCode: 'ARB1', value: 30000 },
    ];
    const report = buildQuartileReport(holdings, FOF_SCREENER);
    const maCat = report.categories.find(c => c.category === 'Multi Asset FoF');
    const arbCat = report.categories.find(c => c.category === 'Other Scheme - FoF Domestic');
    assert.ok(maCat, 'expected a Multi Asset FoF category');
    assert.ok(arbCat, 'expected the arbitrage FoF to stay under the generic label');
    // The Multi Asset FoF's peer set is just MA1/MA2 -- not diluted by the
    // arbitrage fund's very different return profile.
    assert.strictEqual(maCat.categoryMedian.ret_1y, 10.5); // median of [10, 11], not all 5 funds
  });

  test('buildQuartileReport groups an unmatched Direct-plan holding by name into a real category (not Unranked), with no quartile of its own', () => {
    // Models the exact real-world case that surfaced this: a client holds
    // the Direct plan of a fund whose Regular-plan code IS in mf_screener
    // under a different amfiCode -- the join fails, but the name still
    // says what it is.
    const holdings = [
      { name: 'ICICI Prudential Multi-Asset Active FOF - Growth', amfiCode: 'DIRECT-CODE-NOT-IN-SCREENER', value: 75000 },
    ];
    const report = buildQuartileReport(holdings, FOF_SCREENER);
    assert.strictEqual(report.unranked.length, 0);
    const maCat = report.categories.find(c => c.category === 'Multi Asset FoF');
    assert.ok(maCat, 'expected the unmatched holding to still land under Multi Asset FoF');
    assert.strictEqual(maCat.funds[0].quartiles.ret_1y, null); // no data for this exact scheme
    assert.strictEqual(maCat.funds[0].quartiles.ret_3y, null);
    assert.strictEqual(maCat.funds[0].quartiles.ret_5y, null);
    // But the category median still reflects the real MA1/MA2 peers, so
    // the report isn't a total blank for this holding.
    assert.strictEqual(maCat.categoryMedian.ret_1y, 10.5);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
})();
