// tests/schemeLineage.test.js
//
// Unit tests for lib/schemeLineage.js's boundary-check rebase math and
// multi-hop chain walker.
// Run with: node tests/schemeLineage.test.js

const assert = require('assert');
const { stitchSeries, walkLineage } = require('../lib/schemeLineage');

console.log('=== Running Scheme Lineage Unit Tests ===\n');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${e.message}`);
    failed++;
  }
}

const DAY = 86400000;
function series(points) {
  // points: [[dayOffset, nav], ...]
  return points.map(([d, nav]) => ({ t: d * DAY, nav }));
}

async function main() {
  await test('stitchSeries splices a clean boundary, rescaling the predecessor to meet the current series', () => {
    const current = series([[100, 20], [101, 20.5]]);
    const pred = series([[95, 19.6], [99, 19.8]]);
    const result = stitchSeries(current, pred);
    assert.ok(result);
    assert.strictEqual(result.spliceDate, current[0].t);
    assert.strictEqual(result.from, pred[0].t);
    const k = 20 / 19.8;
    assert.ok(Math.abs(result.series[0].nav - 19.6 * k) < 1e-9);
    assert.strictEqual(result.series.length, pred.length + current.length);
  });

  await test('stitchSeries refuses a gap larger than 12 days', () => {
    const current = series([[100, 20]]);
    const pred = series([[80, 19]]); // 20-day gap
    assert.strictEqual(stitchSeries(current, pred), null);
  });

  await test('stitchSeries refuses a boundary ratio outside 0.85-1.2', () => {
    const current = series([[100, 20]]);
    const pred = series([[99, 10]]); // ratio 2.0
    assert.strictEqual(stitchSeries(current, pred), null);
  });

  await test('stitchSeries refuses when there is no room before the current series starts', () => {
    const current = series([[100, 20]]);
    const pred = series([[99, 19.8], [100, 20]]); // nothing strictly before cFirst.t
    assert.strictEqual(stitchSeries(current, pred), null);
  });

  await test('walkLineage splices a single hop when only one exists', async () => {
    const current = series([[100, 20]]);
    const predRaw = [{ t: 95, nav: 19.5 }, { t: 99, nav: 19.8 }];
    const lineage = { A: { pred: 'B', from: 'Predecessor B' } };
    const resolved = await walkLineage({
      series: current,
      code: 'A',
      lineage,
      fetchPredecessor: async (code) => (code === 'B' ? predRaw : null),
      normalize: (raw) => raw.map((r) => ({ t: r.t * DAY, nav: r.nav })),
    });
    assert.ok(resolved);
    assert.strictEqual(resolved.stitchInfo.hops.length, 1);
    assert.strictEqual(resolved.stitchInfo.fromName, 'Predecessor B');
    assert.strictEqual(resolved.stitchInfo.spliceDate, current[0].t);
  });

  await test('walkLineage chains through multiple hops, combining names and reaching the oldest date', async () => {
    const current = series([[200, 30]]);
    const bRaw = [{ t: 195, nav: 29.4 }, { t: 199, nav: 29.7 }];
    const cRaw = [{ t: 150, nav: 25 }, { t: 194, nav: 29.3 }];
    const lineage = {
      A: { pred: 'B', from: 'Fund B' },
      B: { pred: 'C', from: 'Fund C' },
    };
    const resolved = await walkLineage({
      series: current,
      code: 'A',
      lineage,
      fetchPredecessor: async (code) => {
        if (code === 'B') return bRaw;
        if (code === 'C') return cRaw;
        return null;
      },
      normalize: (raw) => raw.map((r) => ({ t: r.t * DAY, nav: r.nav })),
    });
    assert.ok(resolved);
    assert.strictEqual(resolved.stitchInfo.hops.length, 2);
    assert.strictEqual(resolved.stitchInfo.fromName, 'Fund B ← Fund C');
    assert.strictEqual(resolved.stitchInfo.from, cRaw[0].t * DAY);
  });

  await test('walkLineage stops at a hop that fails the boundary check, keeping the earlier hop', async () => {
    const current = series([[200, 30]]);
    const bRaw = [{ t: 195, nav: 29.4 }, { t: 199, nav: 29.7 }]; // hop 1: clean (1-day gap)
    const cRaw = [{ t: 50, nav: 10 }, { t: 194, nav: 10 }];  // hop 2: ratio = 29.7/10 = 2.97, outside 0.85-1.2, fails
    const lineage = {
      A: { pred: 'B', from: 'Fund B' },
      B: { pred: 'C', from: 'Fund C' },
    };
    const resolved = await walkLineage({
      series: current,
      code: 'A',
      lineage,
      fetchPredecessor: async (code) => {
        if (code === 'B') return bRaw;
        if (code === 'C') return cRaw;
        return null;
      },
      normalize: (raw) => raw.map((r) => ({ t: r.t * DAY, nav: r.nav })),
    });
    assert.ok(resolved);
    assert.strictEqual(resolved.stitchInfo.hops.length, 1);
    assert.strictEqual(resolved.stitchInfo.fromName, 'Fund B');
  });

  await test('walkLineage returns null when the fetch for the predecessor fails', async () => {
    const resolved = await walkLineage({
      series: series([[100, 20]]),
      code: 'A',
      lineage: { A: { pred: 'B', from: 'Fund B' } },
      fetchPredecessor: async () => { throw new Error('network error'); },
      normalize: (raw) => raw,
    });
    assert.strictEqual(resolved, null);
  });

  await test('walkLineage breaks on a cycle instead of looping forever', async () => {
    const current = series([[200, 30]]);
    const bRaw = [{ t: 195, nav: 29.4 }, { t: 199, nav: 29.7 }]; // A <- B: clean hop
    const aRawAsPred = [{ t: 190, nav: 29.1 }, { t: 194, nav: 29.3 }]; // B <- A: clean hop, but A was already visited
    const lineage = {
      A: { pred: 'B', from: 'Fund B' },
      B: { pred: 'A', from: 'Fund A (cycle)' },
    };
    const resolved = await walkLineage({
      series: current,
      code: 'A',
      lineage,
      fetchPredecessor: async (code) => {
        if (code === 'B') return bRaw;
        if (code === 'A') return aRawAsPred;
        return null;
      },
      normalize: (raw) => raw.map((r) => ({ t: r.t * DAY, nav: r.nav })),
    });
    assert.ok(resolved);
    assert.strictEqual(resolved.stitchInfo.hops.length, 1);
    assert.strictEqual(resolved.stitchInfo.fromName, 'Fund B');
  });

  await test('walkLineage returns null when the starting code has no lineage entry', async () => {
    const resolved = await walkLineage({
      series: series([[100, 20]]),
      code: 'Z',
      lineage: {},
      fetchPredecessor: async () => null,
      normalize: (raw) => raw,
    });
    assert.strictEqual(resolved, null);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
