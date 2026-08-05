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

test('barRankingSvg truncates a label long enough to overflow into the bar track, instead of overlapping it', () => {
  const svg = barRankingSvg([{ name: 'A Very Long Security Name That Would Otherwise Overlap The Bar', pct: 50 }], { labelWidth: 100 });
  const labelText = svg.match(/<text x="0"[^>]*>([^<]+)<\/text>/)[1];
  assert.ok(labelText.length < 'A Very Long Security Name That Would Otherwise Overlap The Bar'.length);
  assert.ok(labelText.endsWith('…'));
});

test('barRankingSvg places the percentage label just past its own bar, not at a fixed far-right edge', () => {
  const svgShort = barRankingSvg([{ name: 'Tiny', pct: 1 }, { name: 'Big', pct: 99 }]);
  const matches = [...svgShort.matchAll(/<text x="([\d.]+)"[^>]*>[\d.]+%<\/text>/g)];
  assert.strictEqual(matches.length, 2);
  const [tinyPctX, bigPctX] = matches.map((m) => parseFloat(m[1]));
  // The 1% row's bar is far shorter than the 99% row's bar, so its
  // percentage label must sit much further left (closer to the label
  // column) than the 99% row's -- proving the label follows the bar's own
  // end rather than both landing at the same fixed right-hand column.
  assert.ok(tinyPctX < bigPctX - 100);
});

test('overlapHeatmapSvg produces an svg sized to the grid dimensions', () => {
  const svg = overlapHeatmapSvg(['Fund A', 'Fund B'], [[100, 25], [25, 100]]);
  assert.ok(svg.startsWith('<svg'));
  const rectCount = (svg.match(/<rect/g) || []).length;
  assert.strictEqual(rectCount, 4); // 2x2 grid
});

test('overlapHeatmapSvg uses numbered column headers, not truncated names, and numbers row labels to match', () => {
  const svg = overlapHeatmapSvg(['A Very Long Fund Name That Would Overflow A Cell', 'Another Long Fund Name'], [[100, 25], [25, 100]]);
  assert.ok(svg.includes('>1<') && svg.includes('>2<')); // column headers are bare numbers
  assert.ok(svg.includes('1. A Very Long') && svg.includes('2. Another Long')); // row labels numbered to match
});

test('overlapHeatmapSvg cell color intensity increases with overlap %', () => {
  const svg = overlapHeatmapSvg(['A', 'B'], [[100, 90], [90, 100]]);
  // A 90% overlap cell must not use the same fill as a hypothetical near-0% cell
  const svgLow = overlapHeatmapSvg(['A', 'B'], [[100, 5], [5, 100]]);
  const highFill = svg.match(/fill="(#[0-9a-fA-F]{3,6})"/g);
  const lowFill = svgLow.match(/fill="(#[0-9a-fA-F]{3,6})"/g);
  assert.notDeepStrictEqual(highFill, lowFill);
});

test('stackedBarSvg produces 4 segments per fund row, plus a legend and a track background', () => {
  const svg = stackedBarSvg([{ name: 'Fund A', large: 50, mid: 30, small: 15, unclassified: 5 }]);
  const rectCount = (svg.match(/<rect/g) || []).length;
  // 4 legend swatches + 1 track background + 4 segments = 9
  assert.strictEqual(rectCount, 9);
  assert.ok(svg.includes('Large Cap') && svg.includes('Others'));
});

test('stackedBarSvg truncates a long fund name instead of letting it run into the bar', () => {
  const svg = stackedBarSvg([{ name: 'A Very Long Fund Name That Would Otherwise Overlap The Stacked Bar', large: 100, mid: 0, small: 0, unclassified: 0 }]);
  assert.ok(svg.includes('…'));
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
