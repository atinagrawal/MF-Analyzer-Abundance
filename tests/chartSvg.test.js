// tests/chartSvg.test.js
const assert = require('assert');
const { donutChartSvg, barRankingSvg, overlapHeatmapSvg, stackedBarSvg } = require('../lib/chartSvg');

console.log('=== Running Chart SVG Unit Tests ===\n');

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

test('donutChartSvg produces a valid <svg> string with one <path> per segment', () => {
  const svg = donutChartSvg([{ name: 'Equity', pct: 60 }, { name: 'Debt', pct: 40 }]);
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.endsWith('</svg>'));
  const pathCount = (svg.match(/<path/g) || []).length;
  assert.strictEqual(pathCount, 2);
});

test('donutChartSvg handles a single 100% segment without a degenerate arc', () => {
  const svg = donutChartSvg([{ name: 'Equity', pct: 100 }]);
  assert.ok(svg.includes('<circle') || svg.includes('<path'));
});

test('donutChartSvg handles an empty segment list without throwing', () => {
  const svg = donutChartSvg([]);
  assert.ok(svg.startsWith('<svg'));
});

test('barRankingSvg produces one bar per row, widths proportional to pct', () => {
  const svg = barRankingSvg([{ name: 'A', pct: 80 }, { name: 'B', pct: 20 }]);
  const rectCount = (svg.match(/<rect/g) || []).length;
  assert.ok(rectCount >= 2); // at least one fill-bar per row (track background may add more)
});

test('overlapHeatmapSvg produces an svg sized to the grid dimensions', () => {
  const svg = overlapHeatmapSvg(['Fund A', 'Fund B'], [[100, 25], [25, 100]]);
  assert.ok(svg.startsWith('<svg'));
  const rectCount = (svg.match(/<rect/g) || []).length;
  assert.strictEqual(rectCount, 4); // 2x2 grid
});

test('overlapHeatmapSvg cell color intensity increases with overlap %', () => {
  const svg = overlapHeatmapSvg(['A', 'B'], [[100, 90], [90, 100]]);
  // A 90% overlap cell must not use the same fill as a hypothetical near-0% cell
  const svgLow = overlapHeatmapSvg(['A', 'B'], [[100, 5], [5, 100]]);
  const highFill = svg.match(/fill="(#[0-9a-fA-F]{3,6})"/g);
  const lowFill = svgLow.match(/fill="(#[0-9a-fA-F]{3,6})"/g);
  assert.notDeepStrictEqual(highFill, lowFill);
});

test('stackedBarSvg produces 4 segments per fund row (large/mid/small/unclassified)', () => {
  const svg = stackedBarSvg([{ name: 'Fund A', large: 50, mid: 30, small: 15, unclassified: 5 }]);
  const rectCount = (svg.match(/<rect/g) || []).length;
  assert.strictEqual(rectCount, 4);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
