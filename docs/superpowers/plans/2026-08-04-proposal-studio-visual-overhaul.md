# Proposal Studio Visual Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Proposal Studio's live tool and PDF export up to a professional-report standard: client details capture, real SVG charts (donut/bars/heatmap/stacked bars) shared between the live page and the PDF, a fund-specific growth projection built on AMFI's own regulator-sanctioned assumed-return figures, Risk-o-meter gauges (own rating + benchmark fallback), AUM/launch date, and a PDF that never strands a heading from its content across a page break.

**Architecture:** New pure-function modules (`lib/growthProjection.js`, `lib/chartSvg.js`, `lib/riskometer.js`) carry all math and SVG-string generation, unit-tested independently of any rendering context. Both the live React page and the PDF's `window.open()`+`document.write()` export consume the *same* SVG-string builders — the live page wraps them in `dangerouslySetInnerHTML`, the PDF interpolates them directly into its HTML template literal. No chart library, no new runtime dependency.

**Tech Stack:** Next.js 16 App Router (`'use client'` for the live page), plain React state, inline SVG, existing `data/amfi-aum.json` (built earlier this session), existing NSE riskometer PDF-parsing infrastructure (extracted from `pages/api/index-dashboard.js`).

## Global Constraints

- Never name the underlying holdings-data vendor (internally "Groww" in code comments) in any user-facing text — UI copy, PDF content, disclaimers, JSON-LD, page metadata.
- All new charts are inline SVG strings, no chart library, no CDN dependency.
- Reuse existing infrastructure over inventing new: `RiskGauge`'s visual design (currently in `app/indices/page.js`), the NSE-riskometer PDF-fetch/parse logic (currently in `pages/api/index-dashboard.js`), `combineExposure`/`computeOverlap`/`computeMCapAllocation` in `lib/portfolioAnalysis.js` (unchanged), the branded-print-window pattern from `app/backtest/page.js`'s `doExport()`.
- AMFI Circular 109 assumed-return figures are stored as named constants with source/date in a comment (they're reviewed annually by AMFI).
- Color palette: `--g1: #1b5e20` (dark green), `--g2: #2e7d32` (mid green), `--g3: #43a047` (light green), `--neg: #b71c1c` (red), `--warn: #e65100` (amber) — from `app/globals.css`. Chart colors should draw from this palette plus its natural extensions (`#8bc34a`, `#ffb74d`, `#66bb6a`) already used elsewhere in this codebase's OG images and gate pages.
- Test convention: no framework, plain `node tests/X.test.js` with a local `test(name, fn)` helper using `assert` — matches `tests/portfolioAnalysis.test.js` and `tests/exitLoadParser.test.js` exactly.

---

### Task 1: Growth Projection engine

**Files:**
- Create: `lib/growthProjection.js`
- Test: `tests/growthProjection.test.js`

**Interfaces:**
- Produces: `ASSUMED_CAGR` (object `{EQUITY, DEBT, GOLD}`, decimal fractions), `blendedRate(assetAllocation)` → number (decimal fraction), `buildProjectionTable({ proposalType, totalAmount, sipFrequency, blendedRate })` → `Array<{ year, totalInvested, projectedValue }>` for years `[3, 5, 8, 10, 15, 20]`.
- Consumes: `assetAllocation` shaped like `combineExposure()`'s output — `Array<{ name: 'Equity'|'Debt'|'Cash'|'Other', pct: number }>` (0-100 scale, not already-fractional).

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/growthProjection.test.js`
Expected: FAIL with "Cannot find module '../lib/growthProjection'"

- [ ] **Step 3: Write the implementation**

```js
// lib/growthProjection.js
/**
 * lib/growthProjection.js
 *
 * Fund-agnostic, regulator-sanctioned growth projection for Proposal
 * Studio's Growth Projection section (live page and PDF export both call
 * these same functions). Deliberately NOT based on real historical NAV
 * data per fund -- per AMFI Best Practices Guidelines Circular
 * No. 109/2023-24 ("Usage of illustrations for depicting future returns"),
 * illustrative return figures must use AMFI's own fixed, annually-reviewed
 * CAGR table, not fund-specific backtested numbers.
 *
 * Source: AMFI Circular 109-A/2024-25 for Equity/Debt (verified via the
 * user's own reference proposal, citing this circular directly: Equity
 * 12.62%, Debt 6.61%). Circular 109/2023-24 (read directly, 01-Nov-2023)
 * for Gold -- 9.34%, no more recent figure independently verified.
 * AMFI reviews these annually (per the circular's own clause 11) --
 * refresh from the latest circular each year.
 */

const ASSUMED_CAGR = {
  EQUITY: 0.1262, // Nifty/Sensex, mean of 10-yr rolling returns -- AMFI Circular 109-A/2024-25
  DEBT: 0.0661,   // 10-yr G-Sec, mean of 10-yr rolling returns -- AMFI Circular 109-A/2024-25
  GOLD: 0.0934,   // Domestic gold, mean of 10-yr rolling returns -- AMFI Circular 109/2023-24
};

const PROJECTION_YEARS = [3, 5, 8, 10, 15, 20];

// assetAllocation: [{ name: 'Equity'|'Debt'|'Cash'|'Other', pct }] on a 0-100
// scale (as combineExposure() produces it -- not necessarily summing to
// exactly 100 while funds are still loading, so this normalizes by the
// actual sum rather than assuming 100).
function bucketRate(name) {
  if (name === 'Equity') return ASSUMED_CAGR.EQUITY;
  if (name === 'Debt') return ASSUMED_CAGR.DEBT;
  if (name === 'Cash') return ASSUMED_CAGR.DEBT; // same short-duration debt-market family
  return ASSUMED_CAGR.GOLD; // 'Other' (REITs, gold ETFs, unclassified) -- gold is the best single proxy
}

function blendedRate(assetAllocation) {
  const total = assetAllocation.reduce((s, r) => s + (r.pct || 0), 0);
  if (total <= 0) return 0;
  return assetAllocation.reduce((s, r) => s + (r.pct || 0) * bucketRate(r.name), 0) / total;
}

// Lumpsum: standard compound growth. Total Invested is constant.
function projectLumpsum(totalAmount, rate, years) {
  return totalAmount * Math.pow(1 + rate, years);
}

// SIP: standard SIP future-value formula, monthly compounding, payment at
// the start of each month (matching how this app's other SIP calculators
// treat a monthly instalment). totalAmount here is the MONTHLY amount.
function projectSip(monthlyAmount, rate, years) {
  const n = years * 12;
  const r = rate / 12;
  if (r === 0) return monthlyAmount * n;
  return monthlyAmount * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}

function buildProjectionTable({ proposalType, totalAmount, sipFrequency, blendedRate: rate }) {
  return PROJECTION_YEARS.map((year) => {
    if (proposalType === 'sip') {
      // Daily SIPs are approximated as ~30.44 instalments/month worth of
      // the same total monthly outlay for this table's purposes -- the
      // live SIP amount field is itself monthly-equivalent regardless of
      // sipFrequency, matching how Total SIP Amount is already labelled
      // and summed elsewhere in this tool.
      void sipFrequency; // reserved for a future daily-specific compounding refinement
      return {
        year,
        totalInvested: totalAmount * 12 * year,
        projectedValue: Math.round(projectSip(totalAmount, rate, year)),
      };
    }
    return {
      year,
      totalInvested: totalAmount,
      projectedValue: Math.round(projectLumpsum(totalAmount, rate, year)),
    };
  });
}

module.exports = { ASSUMED_CAGR, PROJECTION_YEARS, blendedRate, projectLumpsum, projectSip, buildProjectionTable };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/growthProjection.test.js`
Expected: `8 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add lib/growthProjection.js tests/growthProjection.test.js
git commit -m "feat(proposal-studio): add AMFI-circular-based growth projection engine"
```

---

### Task 2: Shared SVG chart builders

**Files:**
- Create: `lib/chartSvg.js`
- Test: `tests/chartSvg.test.js`

**Interfaces:**
- Produces: `donutChartSvg(segments)`, `barRankingSvg(rows)`, `overlapHeatmapSvg(names, grid)`, `stackedBarSvg(rows)` -- each takes plain data and returns a complete `<svg ...>...</svg>` markup **string** (not JSX). Both the live page (via `dangerouslySetInnerHTML`) and the PDF exporter (direct template-literal interpolation) call these unchanged.
- Consumes: `segments: Array<{name, pct, color?}>` (donut); `rows: Array<{name, pct}>` (bar ranking); `names: string[]`, `grid: number[][]` (heatmap, matches `computeOverlap()`'s output shape); `rows: Array<{name, large, mid, small, unclassified}>` (stacked bar, matches `computeMCapAllocation()`'s per-fund shape).

- [ ] **Step 1: Write the failing tests**

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/chartSvg.test.js`
Expected: FAIL with "Cannot find module '../lib/chartSvg'"

- [ ] **Step 3: Write the implementation**

```js
// lib/chartSvg.js
/**
 * lib/chartSvg.js
 *
 * Pure functions returning complete inline-SVG markup strings for Proposal
 * Studio's charts. No chart library, no CDN dependency, no React --
 * consumed identically by the live page (wrapped in
 * dangerouslySetInnerHTML, since this is entirely our own generated
 * content, never user-controlled) and the PDF exporter (interpolated
 * directly into its HTML template literal). Keeping this rendering-context
 * agnostic is what lets both places share one implementation.
 */

const PALETTE = ['#2e7d32', '#66bb6a', '#8bc34a', '#ffb74d', '#43a047', '#a5d6a7', '#c62828', '#5e8a5e'];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Polar-to-cartesian helper for donut arc endpoints.
function polarPoint(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutChartSvg(segments, { size = 160, strokeWidth = 26 } = {}) {
  const total = segments.reduce((s, r) => s + (r.pct || 0), 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;

  if (total <= 0 || segments.length === 0) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e0e0e0" stroke-width="${strokeWidth}" /></svg>`;
  }

  // A single 100% segment can't be drawn as an SVG arc (start === end path
  // degenerates) -- draw a full ring via two semicircle arcs instead.
  if (segments.length === 1 && Math.abs(segments[0].pct - total) < 1e-9) {
    const color = segments[0].color || PALETTE[0];
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" />
    </svg>`;
  }

  let angle = 0;
  const arcs = segments.map((seg, i) => {
    const pct = (seg.pct || 0) / total;
    const startAngle = angle;
    const endAngle = angle + pct * 360;
    angle = endAngle;
    const start = polarPoint(cx, cy, r, startAngle);
    const end = polarPoint(cx, cy, r, endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    const color = seg.color || PALETTE[i % PALETTE.length];
    return `<path d="M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="butt" />`;
  });

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arcs.join('')}</svg>`;
}

function barRankingSvg(rows, { width = 320, barHeight = 16, gap = 8, labelWidth = 130 } = {}) {
  const maxPct = Math.max(1, ...rows.map((r) => r.pct || 0));
  const trackWidth = width - labelWidth;
  const height = rows.length * (barHeight + gap);
  const bars = rows.map((row, i) => {
    const y = i * (barHeight + gap);
    const w = Math.max(2, (trackWidth * (row.pct || 0)) / maxPct);
    const color = PALETTE[i % PALETTE.length];
    return `
      <text x="0" y="${y + barHeight - 3}" font-size="11" fill="#444">${esc(row.name)}</text>
      <rect x="${labelWidth}" y="${y}" width="${trackWidth}" height="${barHeight}" rx="3" fill="#eef3ee" />
      <rect x="${labelWidth}" y="${y}" width="${w.toFixed(1)}" height="${barHeight}" rx="3" fill="${color}" />
      <text x="${width}" y="${y + barHeight - 3}" font-size="11" fill="#333" text-anchor="end">${row.pct.toFixed(1)}%</text>`;
  });
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">${bars.join('')}</svg>`;
}

// Overlap % (0-100) -> a green-to-red intensity scale: low overlap reads as
// pale/neutral, high overlap reads as increasingly alarming, matching the
// mental model "high overlap = bad diversification".
function heatColor(pct) {
  if (pct >= 80) return '#b71c1c';
  if (pct >= 60) return '#e65100';
  if (pct >= 40) return '#f57f17';
  if (pct >= 20) return '#aed581';
  return '#e8f5e9';
}

function overlapHeatmapSvg(names, grid, { cell = 70, labelWidth = 140 } = {}) {
  const n = names.length;
  const width = labelWidth + n * cell;
  const height = labelWidth * 0 + (n + 1) * cell; // header row + n data rows, same cell height as width for square cells
  const headerH = cell;
  const rows = [];

  // Column headers (rotated would be nicer for long names, but kept
  // horizontal here for reliable cross-browser print rendering).
  names.forEach((name, j) => {
    rows.push(`<text x="${labelWidth + j * cell + cell / 2}" y="${headerH / 2}" font-size="9" fill="#444" text-anchor="middle">${esc(name.length > 14 ? name.slice(0, 13) + '…' : name)}</text>`);
  });

  grid.forEach((row, i) => {
    rows.push(`<text x="4" y="${headerH + i * cell + cell / 2 + 4}" font-size="10" fill="#333">${esc(names[i].length > 20 ? names[i].slice(0, 19) + '…' : names[i])}</text>`);
    row.forEach((v, j) => {
      const x = labelWidth + j * cell;
      const y = headerH + i * cell;
      const color = i === j ? '#c8e6c9' : heatColor(v);
      rows.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${color}" stroke="#fff" stroke-width="2" />`);
      rows.push(`<text x="${x + cell / 2}" y="${y + cell / 2 + 4}" font-size="12" font-weight="${i === j ? 700 : 500}" fill="#1b1b1b" text-anchor="middle">${v.toFixed(1)}%</text>`);
    });
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">${rows.join('')}</svg>`;
}

function stackedBarSvg(rows, { width = 360, barHeight = 22, gap = 10, labelWidth = 140 } = {}) {
  const trackWidth = width - labelWidth;
  const height = rows.length * (barHeight + gap);
  const colors = { large: '#1b5e20', mid: '#43a047', small: '#a5d6a7', unclassified: '#bdbdbd' };
  const bars = rows.map((row, i) => {
    const y = i * (barHeight + gap);
    let x = labelWidth;
    const segs = ['large', 'mid', 'small', 'unclassified'].map((key) => {
      const w = (trackWidth * (row[key] || 0)) / 100;
      const rect = `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${barHeight}" fill="${colors[key]}" />`;
      x += w;
      return rect;
    });
    return `<text x="0" y="${y + barHeight / 2 + 4}" font-size="11" fill="#444">${esc(row.name.length > 22 ? row.name.slice(0, 21) + '…' : row.name)}</text>${segs.join('')}`;
  });
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">${bars.join('')}</svg>`;
}

module.exports = { donutChartSvg, barRankingSvg, overlapHeatmapSvg, stackedBarSvg, PALETTE };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/chartSvg.test.js`
Expected: `7 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add lib/chartSvg.js tests/chartSvg.test.js
git commit -m "feat(proposal-studio): add shared inline-SVG chart builders"
```

---

### Task 3: Extract shared Riskometer module

**Files:**
- Create: `lib/riskometer.js`
- Modify: `pages/api/index-dashboard.js` (replace inline `fetchPdfText`/`getRiskometerUrl`/`parseRiskometer`/`fetchRiskometer` with imports from `lib/riskometer.js`; the dashboard-PDF-specific `fetchPdfText` call sites for the main index dashboard, not the riskometer, keep using the same imported `fetchPdfText`)
- Test: `tests/riskometer.test.js`

**Interfaces:**
- Produces: `fetchPdfText(url)` → `Promise<{status, text}>`; `fetchRiskometer()` → `Promise<{[lowercaseIndexName]: {score, label}}>`, cached in-memory for 12 hours (module-level, matching `index-dashboard.js`'s existing cache duration for the same underlying monthly PDF); `matchBenchmarkRisk(benchmarkName, riskMap)` → `{score, label} | null`.
- Consumes: nothing external -- `benchmarkName` is a free-text string like `"NIFTY 50 TRI"` or `"Nifty 50 - TRI"`; `riskMap` is `fetchRiskometer()`'s return shape.

**Before writing code:** read `pages/api/index-dashboard.js`'s current `fetchPdfText`, `getRiskometerUrl`, `parseRiskometer`, `fetchRiskometer` functions in full (they exist today at roughly lines 107-252) — this task moves them verbatim into the new file, it does not rewrite their logic.

- [ ] **Step 1: Write the failing test for the NEW function only**

`fetchPdfText`/`fetchRiskometer` hit a live external PDF and are integration-tested by the existing `/indices` page working correctly (not re-tested here — moving code verbatim doesn't need new coverage). Only `matchBenchmarkRisk` is new logic:

```js
// tests/riskometer.test.js
const assert = require('assert');
const { matchBenchmarkRisk } = require('../lib/riskometer');

console.log('=== Running Riskometer Unit Tests ===\n');

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

const SAMPLE_MAP = {
  'nifty 50': { score: 5.33, label: 'Very High' },
  'nifty smallcap 250': { score: 6.12, label: 'Very High' },
  '10 year gsec': { score: 2.1, label: 'Moderate' },
};

test('matchBenchmarkRisk strips a trailing TRI/TR suffix', () => {
  assert.deepStrictEqual(matchBenchmarkRisk('NIFTY 50 TRI', SAMPLE_MAP), SAMPLE_MAP['nifty 50']);
  assert.deepStrictEqual(matchBenchmarkRisk('Nifty 50 TR', SAMPLE_MAP), SAMPLE_MAP['nifty 50']);
});

test('matchBenchmarkRisk is case-insensitive and tolerates punctuation/hyphen variants', () => {
  assert.deepStrictEqual(matchBenchmarkRisk('Nifty-50 (TRI)', SAMPLE_MAP), SAMPLE_MAP['nifty 50']);
});

test('matchBenchmarkRisk matches multi-word benchmark names', () => {
  assert.deepStrictEqual(matchBenchmarkRisk('Nifty Smallcap 250 TRI', SAMPLE_MAP), SAMPLE_MAP['nifty smallcap 250']);
});

test('matchBenchmarkRisk returns null for an unmatched benchmark, never a wrong guess', () => {
  assert.strictEqual(matchBenchmarkRisk('Some Unknown Custom Index', SAMPLE_MAP), null);
});

test('matchBenchmarkRisk returns null for empty/missing input', () => {
  assert.strictEqual(matchBenchmarkRisk('', SAMPLE_MAP), null);
  assert.strictEqual(matchBenchmarkRisk(null, SAMPLE_MAP), null);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/riskometer.test.js`
Expected: FAIL with "Cannot find module '../lib/riskometer'"

- [ ] **Step 3: Write the implementation**

Move `fetchPdfText`, `getRiskometerUrl`, `parseRiskometer`, `fetchRiskometer` out of `pages/api/index-dashboard.js` verbatim (same logic, same regex, same fallback-to-previous-month behavior) into this new file, add a 12-hour in-memory cache around `fetchRiskometer()` (matching the header comment's stated cache duration for this monthly-refreshed data — `index-dashboard.js`'s own route-level cache doesn't help a *different* route like Proposal Studio's holdings endpoint, so the cache needs to live here, at the shared-module level), and add `matchBenchmarkRisk`:

```js
// lib/riskometer.js
/**
 * lib/riskometer.js
 *
 * NSE's monthly "Benchmark Riskometer" PDF fetch/parse, extracted from
 * pages/api/index-dashboard.js so Proposal Studio's holdings route can
 * reuse the exact same data for its Risk-o-meter benchmark fallback,
 * without duplicating the PDF-parsing logic or doing a second live PDF
 * fetch+parse on every request (12h in-memory cache, matching this data's
 * actual publish cadence -- it only changes monthly).
 */

import https from 'https';

const MONTH_NAMES_UNUSED = null; // (placeholder removed below if unused)

function getRiskometerUrl(year, month) {
  const mm = String(month).padStart(2, '0');
  return `https://niftyindices.com/Benchmark_Riskometer/NSE_Indices_Riskometer_${year}-${mm}.pdf`;
}

async function fetchPdfText(url) {
  const buffer = await new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' } }, (res) => {
      const isPdf = res.headers['content-type']?.includes('pdf') || res.headers['content-type']?.includes('octet-stream');
      if (res.statusCode !== 200 || !isPdf) {
        res.resume();
        return resolve({ status: res.statusCode !== 200 ? res.statusCode : 404, text: null });
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }));
    }).on('error', reject).setTimeout(25000, function () { this.destroy(new Error('PDF fetch timeout')); });
  });

  if (!buffer.buffer) return { status: buffer.status, text: null };

  try {
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer.buffer, { max: 0 });
    return { status: 200, text: data.text };
  } catch (err) {
    console.error(`[fetchPdfText] Error parsing PDF from ${url}:`, err.message);
    return { status: 404, text: null };
  }
}

function parseRiskometer(text) {
  const result = {};
  const LABELS = 'Very High|Moderately High|Moderately Low|High|Low To Moderate|Moderate|Low';
  const rowRe = new RegExp(`^\\d+\\s*([A-Z].+?)([1-9]\\.\\d{2})(${LABELS})`);
  for (const line of text.split('\n').map((l) => l.trim()).filter(Boolean)) {
    const m = rowRe.exec(line);
    if (m) {
      result[m[1].trim().toLowerCase()] = { score: parseFloat(m[2]), label: m[3] };
    }
  }
  return result;
}

let riskometerCache = null; // { data, fetchedAt }
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

async function fetchRiskometer() {
  if (riskometerCache && Date.now() - riskometerCache.fetchedAt < CACHE_TTL_MS) {
    return riskometerCache.data;
  }
  const now = new Date();
  const attempts = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    attempts.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }
  for (const { year, month } of attempts) {
    const url = getRiskometerUrl(year, month);
    try {
      const { status, text } = await fetchPdfText(url);
      if (status === 200 && text) {
        const data = parseRiskometer(text);
        riskometerCache = { data, fetchedAt: Date.now() };
        return data;
      }
    } catch (e) { /* try next month */ }
  }
  return {}; // graceful fallback -- riskometer is optional everywhere it's used
}

// Normalizes a free-text fund benchmark name (e.g. "NIFTY 50 TRI",
// "Nifty-50 (TRI)") down to the bare index name riskMap is keyed by
// (e.g. "nifty 50"): lowercase, strip a trailing Total-Return-Index
// suffix, strip punctuation.
function normalizeBenchmarkName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\btri\b|\btr\b|\btotal return( index)?\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function matchBenchmarkRisk(benchmarkName, riskMap) {
  if (!benchmarkName || !riskMap) return null;
  const key = normalizeBenchmarkName(benchmarkName);
  if (!key) return null;
  if (riskMap[key]) return riskMap[key];
  // Fallback: some riskMap keys carry their own punctuation variance
  // (already lowercased by parseRiskometer) -- try a normalized-key match.
  const found = Object.keys(riskMap).find((k) => normalizeBenchmarkName(k) === key);
  return found ? riskMap[found] : null;
}

export { fetchPdfText, getRiskometerUrl, parseRiskometer, fetchRiskometer, matchBenchmarkRisk, normalizeBenchmarkName };
```

Remove the placeholder `MONTH_NAMES_UNUSED` line above before committing — it's a reminder to double check nothing else in the moved block referenced module-scope names from `index-dashboard.js` (like `MONTH_NAMES`, `MONTH_FULL`) that need to travel with it. Re-read the actual current file before moving code to confirm `fetchPdfText`/`getRiskometerUrl`/`parseRiskometer`/`fetchRiskometer` don't reference anything else module-scoped in `index-dashboard.js` (they shouldn't, based on the code already read during planning, but confirm at implementation time since the file may have shifted).

Then modify `pages/api/index-dashboard.js`: delete its own copies of these four functions, add `import { fetchPdfText, fetchRiskometer } from '../../lib/riskometer';` at the top (adjust relative path — this is a `pages/api/*.js` file, so `../../lib/riskometer`), and verify every other call site in that file that used the deleted functions (there are `fetchPdfText` calls at multiple line numbers for the main dashboard PDF, not just the riskometer) now resolves via the import.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/riskometer.test.js`
Expected: `5 passed, 0 failed`

- [ ] **Step 5: Verify `/indices` page still works after the extraction**

Start the dev server, curl `/api/index-dashboard`, confirm the response still includes `riskScore`/`riskLabel` fields on indices exactly as before (no behavior change, pure extraction):

Run: `curl -s http://localhost:3000/api/index-dashboard | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); console.log(d.indices.find(i=>i.riskScore))"`
Expected: prints an index object with non-null `riskScore`/`riskLabel` fields.

- [ ] **Step 6: Commit**

```bash
git add lib/riskometer.js pages/api/index-dashboard.js tests/riskometer.test.js
git commit -m "refactor(riskometer): extract shared riskometer module, add benchmark-name matcher"
```

---

### Task 4: Wire AUM, launch date, and Risk-o-meter into the holdings route

**Files:**
- Modify: `app/api/proposal-studio/holdings/route.js`
- Create: `data/amfi-aum.json` (already produced by `scripts/sync_amfi_aum.js`, run earlier this session — confirm it exists before starting this task; if not, run `node scripts/sync_amfi_aum.js` first)

**Interfaces:**
- Consumes: `lib/riskometer.js`'s `fetchRiskometer`, `matchBenchmarkRisk` (Task 3); `data/amfi-aum.json`'s per-amfiCode shape `{isin, schemeName, aumCr, asOf, launchDate}`.
- Produces: the route's existing JSON response gains four new fields: `aumCr: number|null`, `aumAsOf: string|null`, `launchDate: string|null`, `riskSource: 'own'|'benchmark'|null` (alongside the existing `risk` field, now populated via benchmark fallback when the fund's own rating is null).

- [ ] **Step 1: Read the current route in full**

Read `app/api/proposal-studio/holdings/route.js` end to end before editing — confirm the exact shape of the object returned from `fetchFresh()` (the `risk`/`benchmarkName` fields already exist there, per this session's earlier work) and where the final response is constructed, so this task's edit lands in the right place without duplicating logic.

- [ ] **Step 2: Add the AUM/launch-date lookup**

At the top of the file, import the AUM data file (Next.js can `import` a `.json` file directly, resolved at build time — matches how `app/api/scheme-master-facts/route.js` already imports `data/isin-scheme-master.json`):

```js
import amfiAum from '@/data/amfi-aum.json';
```

Where the response object is built (after resolving `amfiCode`), add:

```js
const aumRecord = amfiAum[amfiCode] || null;
```

and include in the returned JSON: `aumCr: aumRecord?.aumCr ?? null`, `aumAsOf: aumRecord?.asOf ?? null`, `launchDate: aumRecord?.launchDate ?? null`.

- [ ] **Step 3: Add the Risk-o-meter benchmark fallback**

Import at the top: `import { fetchRiskometer, matchBenchmarkRisk } from '@/lib/riskometer';`

Where `detail.risk` is currently assigned to the response (this session's earlier work already fetches `benchmarkName: detail.benchmark_name`), add fallback logic:

```js
let risk = detail.risk ?? null;
let riskSource = risk ? 'own' : null;
if (!risk && detail.benchmark_name) {
  const riskMap = await fetchRiskometer();
  const benchmarkRisk = matchBenchmarkRisk(detail.benchmark_name, riskMap);
  if (benchmarkRisk) {
    risk = benchmarkRisk.label;
    riskSource = 'benchmark';
  }
}
```

Include `risk` (now potentially benchmark-derived) and the new `riskSource` field in the response object, replacing the existing bare `risk: detail.risk ?? null,` line.

- [ ] **Step 4: Manual verification (no automated test for this route -- matches existing convention; this route has no test file today)**

Start the dev server, then:

Run: `curl -s "http://localhost:3000/api/proposal-studio/holdings?amfiCode=<a real AMFI code from data/amfi-aum.json>&schemeName=<its schemeName>" | node -e "console.log(JSON.parse(require('fs').readFileSync(0,'utf8')))" | grep -E "aumCr|launchDate|riskSource"`
Expected: non-null `aumCr` and `launchDate` for a fund present in `data/amfi-aum.json`; `riskSource` is `"own"` for a fund whose scheme-detail source already provides a risk rating, or `"benchmark"` for one that doesn't but has a matchable `benchmark_name`.

- [ ] **Step 5: Commit**

```bash
git add app/api/proposal-studio/holdings/route.js
git commit -m "feat(proposal-studio): wire AUM, launch date, and benchmark risk fallback into holdings route"
```

---

### Task 5: Client Details card

**Files:**
- Modify: `app/proposal-studio/ProposalStudioClient.jsx`
- Modify: `app/proposal-studio/proposal-studio.css`

**Interfaces:**
- Produces: new state in `ProposalStudioTool` -- `clientName`, `clientEmail`, `clientPhone` (all strings) -- passed down to both the results-rendering block (for the Export button, Task 10) and a new `ClientDetailsCard` component.

- [ ] **Step 1: Add state and prefill in `ProposalStudioTool`**

In `ProposalStudioTool` (`app/proposal-studio/ProposalStudioClient.jsx`), alongside the existing `useState` declarations, add:

```js
const { data: session } = useSession();
const [clientName, setClientName] = useState('');
const [clientEmail, setClientEmail] = useState('');
const [clientPhone, setClientPhone] = useState('');
const [clientFieldsTouched, setClientFieldsTouched] = useState(false);

useEffect(() => {
  if (clientFieldsTouched) return;
  if (session?.user?.name) setClientName(session.user.name);
  if (session?.user?.email) setClientEmail(session.user.email);
}, [session, clientFieldsTouched]);
```

`useSession` is already imported at the top of this file (`import { useSession, signIn } from 'next-auth/react';`) for the outer gate components — reuse the same import, don't re-import.

`clientFieldsTouched` mirrors the `amountTouched` pattern already used for manual-fund amounts elsewhere in this file: prefill only until the user edits, never overwrite an in-progress edit.

- [ ] **Step 2: Add the `ClientDetailsCard` component**

```jsx
function ClientDetailsCard({ clientName, setClientName, clientEmail, setClientEmail, clientPhone, setClientPhone, onTouched }) {
  const handleChange = (setter) => (e) => { onTouched(); setter(e.target.value); };
  return (
    <section className="pfc-client-details">
      <h3>Client Details</h3>
      <div className="pfc-client-fields">
        <input className="pfc-client-input" placeholder="Client name" value={clientName} onChange={handleChange(setClientName)} />
        <input className="pfc-client-input" type="email" placeholder="Client email" value={clientEmail} onChange={handleChange(setClientEmail)} />
        <input className="pfc-client-input" type="tel" placeholder="Client phone" value={clientPhone} onChange={handleChange(setClientPhone)} />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Render it above `FundPicker`**

In `ProposalStudioTool`'s return block, immediately before `<FundPicker ... />`:

```jsx
<ClientDetailsCard
  clientName={clientName} setClientName={setClientName}
  clientEmail={clientEmail} setClientEmail={setClientEmail}
  clientPhone={clientPhone} setClientPhone={setClientPhone}
  onTouched={() => setClientFieldsTouched(true)}
/>
```

- [ ] **Step 4: Add CSS**

In `app/proposal-studio/proposal-studio.css`:

```css
.pfc-client-details { background: var(--surface, #fff); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 24px; box-shadow: 0 2px 10px rgba(0,0,0,0.04); }
.pfc-client-details h3 { font: 600 14px Raleway, sans-serif; margin-bottom: 10px; color: var(--g1); }
.pfc-client-fields { display: flex; gap: 10px; flex-wrap: wrap; }
.pfc-client-input { flex: 1 1 200px; padding: 9px 12px; border-radius: 8px; border: 1px solid var(--border); font: 400 14px Raleway, sans-serif; transition: border-color 0.15s; }
.pfc-client-input:focus { outline: none; border-color: var(--g3); }

@media (max-width: 700px) {
  .pfc-client-fields { flex-direction: column; }
  .pfc-client-input { flex: 1 1 auto; }
}
```

- [ ] **Step 5: Manual verification**

Start the dev server, sign in, open Proposal Studio: confirm the Client Details card appears above the fund picker with name/email prefilled from the session and phone blank; type in any field and confirm prefill doesn't overwrite it on a subsequent render (e.g. after adding a fund, which triggers other state updates).

- [ ] **Step 6: Commit**

```bash
git add app/proposal-studio/ProposalStudioClient.jsx app/proposal-studio/proposal-studio.css
git commit -m "feat(proposal-studio): add always-visible Client Details card"
```

---

### Task 6: Charts in the live page's existing sections

**Files:**
- Modify: `app/proposal-studio/ProposalStudioClient.jsx`
- Modify: `app/proposal-studio/proposal-studio.css`

**Interfaces:**
- Consumes: `lib/chartSvg.js`'s `donutChartSvg`, `barRankingSvg`, `overlapHeatmapSvg`, `stackedBarSvg` (Task 2).

- [ ] **Step 1: Import the chart builders**

At the top of `ProposalStudioClient.jsx`:

```js
import { donutChartSvg, barRankingSvg, overlapHeatmapSvg, stackedBarSvg } from '@/lib/chartSvg';
```

- [ ] **Step 2: Add a small inline-SVG wrapper**

Add once, near the other small helper components in this file:

```jsx
function InlineSvg({ svg, className }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}
```

This is safe here specifically because `svg` is always our own generated string from `lib/chartSvg.js` (never user-controlled raw HTML/markup) — the same trust boundary already relied on elsewhere in this file for scheme logos.

- [ ] **Step 3: Wire the donut chart into `ExposureTable` for Asset Allocation**

`ExposureTable` is currently reused for Asset Allocation, Sector Exposure, and Security Exposure with the same table-only rendering. Add an optional `chart` prop so only Asset Allocation renders a donut, keeping the other two sections on bar rankings (Step 4):

```jsx
function ExposureTable({ title, rows, fullRows, chart }) {
  const [showAll, setShowAll] = useState(false);
  const displayRows = showAll && fullRows ? fullRows : rows;
  return (
    <CollapsibleSection title={title}>
      {chart === 'donut' && <InlineSvg className="pfc-chart" svg={donutChartSvg(rows)} />}
      {chart === 'bars' && <InlineSvg className="pfc-chart" svg={barRankingSvg(rows.slice(0, 10))} />}
      <div className="pfc-table-wrap">
        <table className="pfc-table">
          <tbody>
            {displayRows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="pfc-table-pct">{r.pct.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fullRows && (
        <button className="pfc-show-all" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show top 10 only' : `Show all ${fullRows.length} holdings`}
        </button>
      )}
    </CollapsibleSection>
  );
}
```

- [ ] **Step 4: Pass the `chart` prop at each call site**

In the results-rendering block:

```jsx
<ExposureTable title="Asset Allocation" rows={assetAllocation} chart="donut" />
<ExposureTable title="Sector Exposure" rows={sectorExposure} chart="bars" />
<ExposureTable title="Security Exposure" rows={stockExposure} fullRows={fullSecurityExposure(readyFunds, allocations)} chart="bars" />
```

- [ ] **Step 5: Wire the heatmap into `OverlapGrid`**

Add the heatmap above the existing table (keep the table too — the heatmap is the at-a-glance view, the table gives exact figures):

```jsx
function OverlapGrid({ funds, selectedFunds }) {
  const grid = computeOverlap(funds);
  const names = funds.map((f) => selectedFunds.find((s) => s.amfiCode === f.amfiCode)?.schemeName || f.amfiCode);

  return (
    <CollapsibleSection title="Portfolio Overlap (Named Holdings)">
      <InlineSvg className="pfc-chart pfc-chart-scroll" svg={overlapHeatmapSvg(names, grid)} />
      <div className="pfc-table-wrap">
        <table className="pfc-table pfc-overlap-table">
          {/* ...unchanged existing table markup... */}
        </table>
      </div>
    </CollapsibleSection>
  );
}
```

- [ ] **Step 6: Wire the stacked bar into `MCapTable`**

Same pattern — add above the existing table, keep the table:

```jsx
<InlineSvg className="pfc-chart pfc-chart-scroll" svg={stackedBarSvg(rows)} />
```

placed immediately after `<CollapsibleSection title="Scheme M-Cap Allocation">` and before the `<div className="pfc-table-wrap">`. `rows` here is the same array `MCapTable` already builds for its table (`{name, allocationPct, large, mid, small, unclassified}` — matches `stackedBarSvg`'s expected shape directly, no transform needed).

- [ ] **Step 7: Add CSS**

```css
.pfc-chart { margin-bottom: 16px; }
.pfc-chart-scroll { overflow-x: auto; }
.pfc-chart svg { max-width: 100%; height: auto; }
```

- [ ] **Step 8: Manual verification**

Start the dev server, add 2+ funds in Proposal Studio, confirm: Asset Allocation shows a donut, Sector/Security Exposure show bar rankings, Portfolio Overlap shows a heatmap grid above its table, M-Cap Allocation shows a stacked bar per fund. Resize the browser to a narrow width and confirm charts scale down (`max-width: 100%`) without horizontal page overflow.

- [ ] **Step 9: Commit**

```bash
git add app/proposal-studio/ProposalStudioClient.jsx app/proposal-studio/proposal-studio.css
git commit -m "feat(proposal-studio): add charts to Asset Allocation, Sector/Security Exposure, Overlap, and M-Cap sections"
```

---

### Task 7: Scheme Details — AUM, Inception Date, Risk-o-meter gauge

**Files:**
- Create: `components/RiskGauge.jsx` (extracted from `app/indices/page.js`)
- Modify: `app/indices/page.js` (import from the new shared location instead of its own inline copy)
- Modify: `app/proposal-studio/ProposalStudioClient.jsx`
- Modify: `app/proposal-studio/proposal-studio.css`

**Interfaces:**
- Produces: `<RiskGauge label={string} score={number} />` (unchanged props/behavior from its current inline version in `app/indices/page.js`).
- Consumes: the holdings route's new `aumCr`, `aumAsOf`, `launchDate`, `risk`, `riskSource` fields (Task 4).

- [ ] **Step 1: Extract `RiskGauge` verbatim**

Read `app/indices/page.js`'s current `RISK_CONFIG` object and `RiskGauge` function (both defined together, roughly lines 39-130 per this session's earlier reading) in full before moving. Create `components/RiskGauge.jsx` containing that exact code (component + its `RISK_CONFIG` constant), changing only the export:

```jsx
// components/RiskGauge.jsx
'use client';

/* ── Riskometer SVG gauge ──────────────────────────────────────────────────
 * Renders the same semicircular meter as NSE's official riskometer image.
 * Score range: 1 (Low) – 7 (Very High) mapped to 0°–180° arc.
 * Colours match the NSE palette exactly.
 * No images, no extra requests — pure inline SVG.
 * Shared between app/indices/page.js and Proposal Studio's Scheme Details.
 */
const RISK_CONFIG = {
  'Low':              { color: '#1b5e20', bg: '#e8f5e9', short: 'Low'      },
  'Low To Moderate':  { color: '#388e3c', bg: '#f1f8e9', short: 'Low–Mod'  },
  'Moderate':         { color: '#f57f17', bg: '#fffde7', short: 'Moderate' },
  'Moderately High':  { color: '#e65100', bg: '#fff3e0', short: 'Mod–High' },
  'High':             { color: '#c62828', bg: '#ffebee', short: 'High'     },
  'Very High':        { color: '#b71c1c', bg: '#ffebee', short: 'Very High'},
};

export default function RiskGauge({ label, score }) {
  if (!label || label === '—') {
    return <span className="risk-gauge-empty">—</span>;
  }

  const cfg = RISK_CONFIG[label] || { color: '#9e9e9e', bg: '#f5f5f5', short: label };
  // If score is unavailable (shouldn't happen after regex fix, but guard anyway)
  if (typeof score !== 'number') {
    return <span className="risk-gauge-empty" style={{ color: cfg.color }}>{cfg.short}</span>;
  }
  const actualScore = score;

  // Map score 1–7 → angle 0°–180° on a semicircle
  // 0° = left end (low risk), 180° = right end (very high risk)
  const pct = Math.min(1, Math.max(0, (actualScore - 1) / 6));
  const angleDeg = pct * 180;

  // Needle tip position on arc (r=26, cx=34, cy=34)
  const cx = 34, cy = 36, r = 26;
  const nx = cx + r * Math.cos((angleDeg - 180) * Math.PI / 180);
  const ny = cy + r * Math.sin((angleDeg - 180) * Math.PI / 180);

  // 6 arc segments (Low → Very High), each 30°
  const SEG_COLORS = ['#1b5e20','#388e3c','#f9a825','#f57f17','#e65100','#b71c1c'];
  const arcSegs = SEG_COLORS.map((c, i) => {
    const startAngle = (i * 30 - 180) * Math.PI / 180;
    const endAngle   = ((i + 1) * 30 - 180) * Math.PI / 180;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    return { x1, y1, x2, y2, color: c };
  });

  const scoreDisplay = typeof score === 'number' ? score.toFixed(2) : '';

  return (
    <div
      className="risk-gauge"
      title={`${label}${scoreDisplay ? ' · Score: ' + scoreDisplay : ''}`}
      style={{ '--gauge-color': cfg.color, '--gauge-bg': cfg.bg }}
    >
      <svg
        width="68" height="40"
        viewBox="0 0 68 40"
        aria-hidden="true"
        className="risk-gauge-svg"
      >
        {/* Arc segments */}
        {arcSegs.map((seg, i) => (
          <line
            key={i}
            x1={seg.x1} y1={seg.y1}
            x2={seg.x2} y2={seg.y2}
            stroke={seg.color}
            strokeWidth="8"
            strokeLinecap="butt"
          />
        ))}
        {/* White track behind for separation */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1"
        />
        {/* Needle */}
        <line
          x1={cx} y1={cy}
          x2={nx} y2={ny}
          stroke="#1a1a1a"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Needle pivot */}
        <circle cx={cx} cy={cy} r="2.5" fill="#1a1a1a" />
      </svg>
      <span className="risk-gauge-label" style={{ color: cfg.color }}>
        {cfg.short}
      </span>
    </div>
  );
}

export { RISK_CONFIG };
```

The `.risk-gauge`/`.risk-gauge-svg`/`.risk-gauge-label`/`.risk-gauge-empty` CSS classes this component depends on already live in `app/globals.css` (site-wide, not page-scoped), so no CSS migration is needed — Proposal Studio already has them available.

- [ ] **Step 2: Update `app/indices/page.js` to import instead of define**

Replace its inline `RISK_CONFIG`/`RiskGauge` definitions with:

```js
import RiskGauge from '@/components/RiskGauge';
```

Remove the now-duplicate local `RISK_CONFIG` and `RiskGauge` function definitions from this file.

- [ ] **Step 3: Verify `/indices` renders identically**

Start the dev server, load `/indices`, confirm the Riskometer column still renders gauges exactly as before (pure extraction, zero behavior change expected).

- [ ] **Step 4: Add AUM/Inception Date/Risk-o-meter columns to `SchemeDetailsTable`**

```jsx
import RiskGauge from '@/components/RiskGauge';

// RISK_SCORE_BY_LABEL: RiskGauge needs a numeric score (1-7) to position
// the needle, but /api/proposal-studio/holdings only returns the label
// (from the underlying data source's own "risk" field, or the benchmark
// fallback's label) -- map label back to the same score scale RiskGauge
// already uses via RISK_CONFIG's ordering.
const RISK_SCORE_BY_LABEL = { 'Low': 1, 'Low To Moderate': 2, 'Moderate': 3, 'Moderately High': 4, 'High': 5, 'Very High': 6 };

function SchemeDetailsTable({ selectedFunds, holdingsByFund }) {
  return (
    <CollapsibleSection title="Scheme Details">
      <div className="pfc-table-wrap">
        <table className="pfc-table pfc-table-wide">
          <thead>
            <tr>
              <th>Fund</th>
              <th>Category</th>
              <th>Risk</th>
              <th className="pfc-table-pct">AUM (Cr)</th>
              <th>Inception</th>
              <th className="pfc-table-pct">Equity Holdings</th>
            </tr>
          </thead>
          <tbody>
            {selectedFunds.map((f) => {
              const d = holdingsByFund[f.amfiCode];
              if (!d) return null;
              const equityCount = d.holdings.filter((h) => h.assetClass === 'EQUITY').length;
              return (
                <tr key={f.amfiCode}>
                  <td>{f.schemeName}</td>
                  <td>{d.category}{d.subCategory ? ` · ${d.subCategory}` : ''}</td>
                  <td>
                    {d.risk ? <RiskGauge label={d.risk} score={RISK_SCORE_BY_LABEL[d.risk] || 3} /> : '—'}
                    {d.riskSource === 'benchmark' && <span className="pfc-risk-benchmark-note"> (benchmark)</span>}
                  </td>
                  <td className="pfc-table-pct">{d.aumCr != null ? d.aumCr.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}</td>
                  <td>{d.launchDate || '—'}</td>
                  <td className="pfc-table-pct">{equityCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}
```

- [ ] **Step 5: Add CSS**

```css
.pfc-risk-benchmark-note { font: 400 10px Raleway, sans-serif; color: var(--muted); }
```

- [ ] **Step 6: Manual verification**

Add funds in Proposal Studio, confirm Scheme Details shows a risk gauge (own rating, no "(benchmark)" note) for funds whose source provides a rating, a gauge with "(benchmark)" note for funds resolved via the fallback, and "—" only for funds with neither; confirm AUM and Inception Date populate for any fund present in `data/amfi-aum.json`.

- [ ] **Step 7: Commit**

```bash
git add components/RiskGauge.jsx app/indices/page.js app/proposal-studio/ProposalStudioClient.jsx app/proposal-studio/proposal-studio.css
git commit -m "feat(proposal-studio): add AUM, Inception Date, and Risk-o-meter gauge to Scheme Details"
```

---

### Task 8: Growth Projection section (live page)

**Files:**
- Modify: `app/proposal-studio/ProposalStudioClient.jsx`
- Modify: `app/proposal-studio/proposal-studio.css`

**Interfaces:**
- Consumes: `lib/growthProjection.js`'s `blendedRate`, `buildProjectionTable`, `ASSUMED_CAGR` (Task 1); `assetAllocation` (already computed in the results-rendering block); `proposalType`, `totalAmount`, `sipFrequency` (already component state/derived values).

- [ ] **Step 1: Import**

```js
import { blendedRate, buildProjectionTable, ASSUMED_CAGR } from '@/lib/growthProjection';
```

- [ ] **Step 2: Add the `GrowthProjectionTable` component**

```jsx
function GrowthProjectionTable({ proposalType, totalAmount, sipFrequency, assetAllocation }) {
  const rate = blendedRate(assetAllocation);
  const rows = buildProjectionTable({ proposalType, totalAmount, sipFrequency, blendedRate: rate });
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

  return (
    <CollapsibleSection title="Growth Projection">
      <p className="pfc-projection-note">
        Assumed return: <b>{(rate * 100).toFixed(2)}% p.a.</b>, blended from your portfolio's actual asset mix using AMFI's own fixed illustration rates
        (Equity {(ASSUMED_CAGR.EQUITY * 100).toFixed(2)}%, Debt {(ASSUMED_CAGR.DEBT * 100).toFixed(2)}%, Gold {(ASSUMED_CAGR.GOLD * 100).toFixed(2)}% — AMFI Best Practices Guidelines Circular No. 109).
      </p>
      <div className="pfc-table-wrap">
        <table className="pfc-table">
          <thead>
            <tr>
              <th>Year</th>
              <th className="pfc-table-pct">Total Invested</th>
              <th className="pfc-table-pct">Projected Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year}>
                <td>{r.year}</td>
                <td className="pfc-table-pct">{inr(r.totalInvested)}</td>
                <td className="pfc-table-pct">{inr(r.projectedValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pfc-projection-disclaimer">
        Past performance may or may not be sustained in future and is not a guarantee of any future returns. This is an illustration using AMFI's prescribed assumed rates, not a projection specific to the funds in this proposal.
      </p>
    </CollapsibleSection>
  );
}
```

- [ ] **Step 3: Render it in the results block**

Add after `{mCapIndex && <MCapTable ... />}`:

```jsx
<GrowthProjectionTable proposalType={proposalType} totalAmount={totalAmount} sipFrequency={sipFrequency} assetAllocation={assetAllocation} />
```

- [ ] **Step 4: Add CSS**

```css
.pfc-projection-note { font: 400 13px Raleway, sans-serif; color: var(--text2, #333); line-height: 1.6; margin-bottom: 14px; }
.pfc-projection-disclaimer { font: 400 12px Raleway, sans-serif; color: var(--muted); line-height: 1.6; margin-top: 12px; }
```

- [ ] **Step 5: Manual verification**

Add funds forming a known asset mix (e.g. a pure-equity fund), confirm the displayed blended rate matches the expected `ASSUMED_CAGR.EQUITY` value, and the table's Year 10 lumpsum figure matches `totalAmount * (1+rate)^10` by hand-calculation.

- [ ] **Step 6: Commit**

```bash
git add app/proposal-studio/ProposalStudioClient.jsx app/proposal-studio/proposal-studio.css
git commit -m "feat(proposal-studio): add Growth Projection section to the live page"
```

---

### Task 9: PDF cover page, running header, and page-break fix

**Files:**
- Modify: `app/proposal-studio/ProposalStudioClient.jsx` (the `exportProposalPDF` function and its HTML template)

**Interfaces:**
- Consumes: `clientName`, `clientEmail`, `clientPhone` (Task 5) -- add these three to `exportProposalPDF`'s parameter object and to the button's `onClick` call site.

- [ ] **Step 1: Add client details to the export call**

At the `exportProposalPDF({...})` call site (inside the `.pfc-actions` button's `onClick`), add `clientName, clientEmail, clientPhone` to the object being passed — these are already in scope in `ProposalStudioTool`'s render.

Add the same three to `exportProposalPDF`'s destructured parameter list.

- [ ] **Step 2: Add a cover page as the first thing in the document body**

Insert this immediately after `<body>` in the template literal, before the existing `<div class="ph">` header block:

```html
<div class="cover">
  <div class="cover-logo"><img src="/logo-og.png" onerror="this.style.display='none'"></div>
  <div class="cover-title">Investment Proposal</div>
  <div class="cover-blocks">
    <div class="cover-block">
      <div class="cover-label">Prepared For</div>
      <div class="cover-name">${esc(clientName || 'Client')}</div>
      ${clientEmail ? `<div class="cover-detail">${esc(clientEmail)}</div>` : ''}
      ${clientPhone ? `<div class="cover-detail">${esc(clientPhone)}</div>` : ''}
    </div>
    <div class="cover-block">
      <div class="cover-label">Prepared By</div>
      <div class="cover-name">Atin Kumar Agrawal</div>
      <div class="cover-detail">ARN-251838</div>
    </div>
  </div>
  <div class="cover-stats">${banner}</div>
  <div class="cover-date">${esc(dateStr)}</div>
</div>
<div class="page-break"></div>
```

`banner` here is the existing KPI-strip HTML this function already builds — reuse it inside the cover instead of its current placement.

- [ ] **Step 3: Add cover, running-header, and page-break-avoid CSS**

Add to the `<style>` block in the template literal:

```css
.cover { min-height: 700px; display: flex; flex-direction: column; justify-content: center; background: linear-gradient(135deg, #0a2e0a 0%, #1b5e20 50%, #2e7d32 100%); color: #fff; padding: 60px 50px; margin: -30px -36px 0; }
.cover-logo img { height: 48px; object-fit: contain; margin-bottom: 30px; }
.cover-title { font-size: 2.2rem; font-weight: 800; margin-bottom: 30px; }
.cover-blocks { display: flex; gap: 40px; margin-bottom: 30px; }
.cover-label { font-size: .6rem; letter-spacing: 1.5px; text-transform: uppercase; opacity: .65; margin-bottom: 4px; }
.cover-name { font-size: 1.1rem; font-weight: 700; }
.cover-detail { font-size: .8rem; opacity: .8; margin-top: 2px; }
.cover-stats { margin-bottom: 20px; }
.cover-date { opacity: .55; font-size: .75rem; }
.page-break { page-break-after: always; }
.running-header { display: none; }
@media print {
  .running-header { display: flex; align-items: center; gap: 8px; position: fixed; top: 0; left: 0; right: 0; padding: 8px 36px; background: #fff; border-bottom: 1px solid #e8f5e9; font-size: .6rem; color: #5e8a5e; font-weight: 700; z-index: 10; }
  .running-header img { height: 16px; }
  body { padding-top: 34px; }
}
.sec-block { page-break-inside: avoid; }
```

- [ ] **Step 4: Add the running header element**

Immediately after `<body>`, before the cover div:

```html
<div class="running-header"><img src="/logo-og.png" onerror="this.style.display='none'">Abundance Financial Services</div>
```

- [ ] **Step 5: Fix the orphaned-heading bug**

Wrap every `<div class="sec">...</div><table ...>...</table>` pair (Selected Funds, each exposure section, overlap, M-Cap) in a shared `<div class="sec-block">...</div>` wrapper, so the CSS `page-break-inside: avoid` rule from Step 3 keeps a heading glued to at least the start of its content. Apply this to every section built via `exposureSection(...)`, the `overlapHTML` block, and the `mcapHTML` block — wrap each one's existing `<div class="sec">` + `<table>` pair in `<div class="sec-block">...</div>` at the point each is constructed in the function.

- [ ] **Step 6: Manual verification**

Open Proposal Studio with 2+ funds selected, click Export/Print, and in the print preview (Ctrl+P style dialog, or actually save to PDF): confirm a full-bleed branded cover page appears first with client name/email/phone and advisor details, confirm the small logo+firm-name header repeats at the top of every subsequent page, and confirm "Portfolio Overlap (Named Holdings)" (the bug from the original report) never has its heading on a different page than its table.

- [ ] **Step 7: Commit**

```bash
git add app/proposal-studio/ProposalStudioClient.jsx
git commit -m "feat(proposal-studio): add branded PDF cover page, running header, and page-break fix"
```

---

### Task 10: Charts and Growth Projection in the PDF export

**Files:**
- Modify: `app/proposal-studio/ProposalStudioClient.jsx` (the `exportProposalPDF` function)

**Interfaces:**
- Consumes: `lib/chartSvg.js` (Task 2), `lib/growthProjection.js` (Task 1) — same functions the live page uses (Tasks 6, 8), imported once at the top of the file already.

- [ ] **Step 1: Add donut/bar charts to the exposure sections**

Modify `exposureSection(title, rows)` inside `exportProposalPDF` to accept a chart type and prepend the relevant SVG string before the table:

```js
const exposureSection = (title, rows, chartType) => rows.length === 0 ? '' : `
  <div class="sec-block">
    <div class="sec">${title}</div>
    ${chartType === 'donut' ? donutChartSvg(rows) : chartType === 'bars' ? barRankingSvg(rows.slice(0, 10)) : ''}
    <table class="ptable"><tbody>${pctRows(rows)}</tbody></table>
  </div>`;
```

Update call sites: `exposureSection('Asset Allocation', assetAllocation, 'donut')`, `exposureSection('Sector Exposure', sectorExposure, 'bars')`, `exposureSection('Security Exposure (Top Holdings)', stockExposure, 'bars')`.

- [ ] **Step 2: Add the heatmap to the overlap section**

Inside the `if (readyFunds.length >= 2) { ... }` block building `overlapHTML`, prepend the heatmap before the table, and wrap the whole thing in `sec-block` (per Task 9 Step 5):

```js
overlapHTML = `
  <div class="sec-block">
    <div class="sec">Portfolio Overlap (Named Holdings)</div>
    ${overlapHeatmapSvg(names, grid)}
    <table class="ptable">...</table>
  </div>`;
```

(keep the existing `<table>` markup inside unchanged, just add the heatmap call and the `sec-block` wrapper around the existing content).

- [ ] **Step 3: Add the stacked bar to the M-Cap section**

Same pattern in the `mcapHTML` block — add `stackedBarSvg(rows)` before the `<table>`, wrap in `sec-block`.

- [ ] **Step 4: Add the Growth Projection section**

After `mcapHTML` is built, add:

```js
const projectionRate = blendedRate(assetAllocation);
const projectionRows = buildProjectionTable({ proposalType, totalAmount, sipFrequency, blendedRate: projectionRate });
const projectionHTML = `
  <div class="sec-block">
    <div class="sec">Growth Projection</div>
    <p style="font-size:.62rem;color:#5e8a5e;margin-bottom:8px;line-height:1.5;">
      Assumed return: <b>${(projectionRate * 100).toFixed(2)}% p.a.</b>, blended from this portfolio's asset mix per AMFI Best Practices Guidelines Circular No. 109 (Equity ${(ASSUMED_CAGR.EQUITY * 100).toFixed(2)}%, Debt ${(ASSUMED_CAGR.DEBT * 100).toFixed(2)}%, Gold ${(ASSUMED_CAGR.GOLD * 100).toFixed(2)}%).
    </p>
    <table class="ptable"><thead><tr><th style="text-align:left">Year</th><th class="num">Total Invested</th><th class="num">Projected Value</th></tr></thead>
    <tbody>${projectionRows.map((r) => `<tr><td>${r.year}</td><td class="num">${inr(r.totalInvested)}</td><td class="num">${inr(r.projectedValue)}</td></tr>`).join('')}</tbody></table>
    <p style="font-size:.55rem;color:#5e8a5e;margin-top:6px;">Past performance may or may not be sustained in future and is not a guarantee of any future returns.</p>
  </div>`;
```

and add `${projectionHTML}` to the document body template, after `${mcapHTML}` and before the `<div class="meta">` line.

- [ ] **Step 5: Add AUM/Inception Date to the Selected Funds and Scheme Details PDF content**

The current `fundRows` builder only shows name/amount/%. Since Scheme Details isn't currently mirrored in the PDF at all (only Selected Funds, exposure sections, overlap, M-Cap are), add a Scheme Details table to the PDF matching the live page's new columns (Task 7) — pull the same `holdingsByFund` data already available in the enclosing render scope:

```js
const schemeDetailRows = selectedFunds.map((f) => {
  const d = holdingsByFund[f.amfiCode];
  if (!d) return '';
  const aum = d.aumCr != null ? d.aumCr.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—';
  return `<tr><td>${esc(f.schemeName)}</td><td>${esc(d.category || '—')}</td><td>${esc(d.risk || '—')}</td><td class="num">${aum}</td><td>${esc(d.launchDate || '—')}</td></tr>`;
}).join('');
const schemeDetailsHTML = `
  <div class="sec-block">
    <div class="sec">Scheme Details</div>
    <table class="ptable"><thead><tr><th style="text-align:left">Fund</th><th style="text-align:left">Category</th><th style="text-align:left">Risk</th><th class="num">AUM (Cr)</th><th style="text-align:left">Inception</th></tr></thead>
    <tbody>${schemeDetailRows}</tbody></table>
  </div>`;
```

Add `${schemeDetailsHTML}` to the template, positioned after the Selected Funds table and before `${exposureSection('Asset Allocation', ...)}`. `exportProposalPDF`'s parameter list needs `holdingsByFund` added — update both the function signature and its call site (the button's `onClick`) to pass it through, matching how `readyFunds`/`allocations` are already threaded.

- [ ] **Step 6: Manual verification**

Export a proposal with 2+ funds including at least one with a resolvable `aumCr`: confirm the PDF now shows a Scheme Details table, donut/bar/heatmap/stacked-bar charts render correctly inside the print window (not broken `<img>` icons — since these are inline `<svg>` strings, not external images, they should render immediately with no network dependency), and the Growth Projection table appears with figures matching the live page's own Growth Projection section for the same proposal.

- [ ] **Step 7: Commit**

```bash
git add app/proposal-studio/ProposalStudioClient.jsx
git commit -m "feat(proposal-studio): add charts, Scheme Details, and Growth Projection to PDF export"
```

---

## Post-implementation

- Re-run `node tests/growthProjection.test.js tests/chartSvg.test.js tests/riskometer.test.js tests/portfolioAnalysis.test.js` (all green) and `npm run build` (clean) before final review.
- Dispatch a final whole-branch code review per `superpowers:requesting-code-review`, covering: the "never name the data vendor" rule across every new user-facing string (cover page, Growth Projection disclaimer, Scheme Details); XSS-safety of every new interpolated value in `exportProposalPDF`'s template (the same `esc()` discipline already established this session); that `lib/riskometer.js`'s extraction didn't change `/indices`' behavior; that the PDF's page-break fix actually holds for a 3+ fund proposal (more content = more pagination edge cases than the 2-fund case manually checked per task).
