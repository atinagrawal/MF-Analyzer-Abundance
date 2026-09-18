# Portfolio Review / Quartile Ranking Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Portfolio Review" report to CAS Tracker that groups a client's/family's mutual fund holdings by SEBI sub-category and ranks each one into a 1Yr/3Yr/5Yr performance quartile (1-4) against every other fund in that category, styled after NJ Wealth's "Scheme Analysis" report pages, with Abundance's own ARN-251838 holdings excluded by default.

**Architecture:** A new pure calculation module (`lib/quartileRanking.js`) joins the currently-viewed CAS holdings to the existing `mf_screener` dataset (fetched client-side from the already-live `/api/screener` route) by `amfiCode`, groups by category, and ranks each fund within its category by point-to-point CAGR. A new drawer component (`components/PortfolioReviewPlanner.jsx`) renders the result and is wired into `app/cas-tracker/page.js` behind a new "📊 Portfolio Review" button, following the exact drawer/print/name-resolution pattern the existing `PortfolioRedemptionPlanner` already establishes in that file.

**Tech Stack:** Next.js App Router, React (client components), plain Node `assert`-based tests (`node tests/x.test.js`, no framework) — this repo has no React/DOM testing library, so component-level verification is manual (`next build` + a live smoke test), matching how every other CAS Tracker drawer (`RedemptionPlanner.jsx`, `TransactionHistoryDrawer.jsx`, `HoldingDetailDrawer.jsx`) shipped.

**Spec:** `docs/superpowers/specs/2026-09-18-portfolio-review-quartile-planner-design.md`

## Global Constraints

- v1 computes quartiles from `mf_screener`'s point-to-point CAGR columns (`ret_1y`, `ret_3y`, `ret_5y`), **not** true rolling-window medians — label columns as "1 Yr"/"3 Yr"/"5 Yr" return, never "rolling."
- 1Yr, 3Yr, and 5Yr quartiles are computed and shown **independently** (three separate columns) — a fund missing one period shows "-" for that column only, never a blended fallback number.
- ARN exclusion defaults to **on** (Abundance's own ARN-251838 holdings excluded), with a checkbox to include them. Hardcode the bare digits `'251838'` as "Abundance's own ARN" — there is no per-advisor-account ARN concept anywhere in this single-advisor app.
- Feature lives in CAS Tracker (`app/cas-tracker/page.js`) only for v1 — do not add it to `/portfolio`.
- No new DB table or API route in this plan (the `family_name` column/route it depends on already shipped in commit `12764ff`).
- Follow the established drawer visual convention exactly: inline `style={{...}}` objects using this app's CSS custom properties (`var(--g1)`, `var(--muted)`, `var(--border)`, etc.), not a new CSS file — see `components/RedemptionPlanner.jsx` and the inline `PortfolioRedemptionPlanner` in `app/cas-tracker/page.js` for the pattern every new drawer in this file family follows.
- Automated tests, where they exist, follow this repo's plain convention: `const assert = require('assert')`, a local `test(name, fn)` helper, run via `node tests/<file>.test.js`, exit code 1 on any failure. No test framework, no mocking library.

---

### Task 1: `lib/quartileRanking.js` — quartile calculation

**Files:**
- Create: `lib/quartileRanking.js`
- Test: `tests/quartileRanking.test.js`

**Interfaces:**
- Consumes: nothing from other tasks — pure functions over plain data (an `mf_screener` row shape: `{ code, category, ret_1y, ret_3y, ret_5y, ... }` per `scripts/screener-schema.sql`/`app/api/screener/route.js`; a holding shape: `{ name, amfiCode, value, ... }` per `app/cas-tracker/page.js`'s `buildAllHoldings()`).
- Produces (used by Task 2):
  - `median(values: number[]): number | null`
  - `quartilesForPeriod(categoryFunds: ScreenerRow[], period: 'ret_1y'|'ret_3y'|'ret_5y'): Map<string, 1|2|3|4>` — keyed by `code`, only funds with a non-null value for `period` are present.
  - `buildQuartileReport(holdings: Holding[], screenerFunds: ScreenerRow[]): { categories: Array<{ category: string, categoryMedian: { ret_1y: number|null, ret_3y: number|null, ret_5y: number|null }, funds: Array<Holding & { quartiles: { ret_1y: number|null, ret_3y: number|null, ret_5y: number|null } }> }>, unranked: Holding[] }` — `categories` sorted alphabetically by category name; a holding lands in `unranked` when its `amfiCode` is falsy or has no match in `screenerFunds`, or the matched row has no `category`.

- [ ] **Step 1: Write the failing tests**

Create `tests/quartileRanking.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node tests/quartileRanking.test.js`
Expected: an import error (`lib/quartileRanking.js` doesn't exist yet) — the whole file fails before any `test()` runs.

- [ ] **Step 3: Write the implementation**

Create `lib/quartileRanking.js`:

```js
/**
 * lib/quartileRanking.js
 *
 * Page-agnostic quartile-ranking calculation for the Portfolio Review
 * report -- joins CAS holdings to the mf_screener dataset (see
 * app/api/screener/route.js) by amfiCode and ranks each fund's 1Yr/3Yr/5Yr
 * point-to-point CAGR against every other fund in its own SEBI
 * sub-category. Deliberately has no React/page dependency, matching
 * lib/distributorResolution.js's style, so app/cas-tracker/page.js's
 * PortfolioReviewPlanner drawer is the only caller that needs wiring. See
 * docs/superpowers/specs/2026-09-18-portfolio-review-quartile-planner-design.md.
 *
 * v1 uses point-to-point CAGR, not true rolling-window median returns (the
 * methodology NJ Wealth's own "Scheme Analysis" report uses) -- that would
 * need a new NAV-history-windowing data engine. See the spec's Decision 1.
 */

// Returns the median of a list of numbers, or null for an empty list.
export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Buckets `categoryFunds` (mf_screener rows already filtered to one
// category) into quartiles for one return period key. Quartile 1 = top
// 25% of returns in the category, 4 = bottom 25%. Funds with a null value
// for this period are excluded entirely from the ranking (and from the
// returned map) -- a caller checking `map.get(code)` gets `undefined` for
// an unranked fund/period, which renders as "-".
export function quartilesForPeriod(categoryFunds, period) {
  const ranked = categoryFunds
    .filter(f => f[period] != null)
    .sort((a, b) => b[period] - a[period]);
  const n = ranked.length;
  const result = new Map();
  ranked.forEach((fund, i) => {
    const quartile = Math.min(4, Math.floor((i / n) * 4) + 1);
    result.set(fund.code, quartile);
  });
  return result;
}

const PERIODS = ['ret_1y', 'ret_3y', 'ret_5y'];

// Builds the full report: groups `holdings` (each at least
// { amfiCode, name, value }) by their mf_screener category, using
// `screenerFunds` (the full array app/api/screener/route.js returns, each
// row shaped { code, category, ret_1y, ret_3y, ret_5y, ... }) both as the
// join target and as each category's full peer universe for ranking (the
// peer universe is every fund in the category, not just the ones held --
// see the categoryMedian test).
export function buildQuartileReport(holdings, screenerFunds) {
  const byCode = new Map(screenerFunds.map(f => [f.code, f]));
  const byCategory = new Map(); // category -> mf_screener rows (peer universe)
  screenerFunds.forEach(f => {
    if (!f.category) return;
    if (!byCategory.has(f.category)) byCategory.set(f.category, []);
    byCategory.get(f.category).push(f);
  });

  const holdingsByCategory = new Map(); // category -> holdings
  const unranked = [];
  holdings.forEach(h => {
    const screenerRow = h.amfiCode ? byCode.get(h.amfiCode) : null;
    if (!screenerRow || !screenerRow.category) { unranked.push(h); return; }
    const category = screenerRow.category;
    if (!holdingsByCategory.has(category)) holdingsByCategory.set(category, []);
    holdingsByCategory.get(category).push(h);
  });

  const categories = [...holdingsByCategory.entries()].map(([category, categoryHoldings]) => {
    const peers = byCategory.get(category) || [];
    const quartileMaps = Object.fromEntries(PERIODS.map(p => [p, quartilesForPeriod(peers, p)]));
    const categoryMedian = Object.fromEntries(
      PERIODS.map(p => [p, median(peers.map(f => f[p]).filter(v => v != null))])
    );
    const funds = categoryHoldings.map(h => ({
      ...h,
      quartiles: Object.fromEntries(PERIODS.map(p => [p, quartileMaps[p].get(h.amfiCode) ?? null])),
    }));
    return { category, categoryMedian, funds };
  }).sort((a, b) => a.category.localeCompare(b.category));

  return { categories, unranked };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node tests/quartileRanking.test.js`
Expected: `11 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add lib/quartileRanking.js tests/quartileRanking.test.js
git commit -m "feat(quartile-ranking): add category-peer quartile calculation

Pure calculation module for the Portfolio Review report -- joins CAS
holdings to mf_screener by amfiCode, groups by SEBI sub-category, ranks
each fund's 1Yr/3Yr/5Yr point-to-point CAGR against its category peers.
No React/page dependency; app/cas-tracker/page.js's PortfolioReviewPlanner
(next task) is the first consumer."
```

---

### Task 2: `components/PortfolioReviewPlanner.jsx` + wiring into CAS Tracker

**Files:**
- Create: `components/PortfolioReviewPlanner.jsx`
- Modify: `app/cas-tracker/page.js` (add import, one new state variable, one new button, one new drawer render block)
- Test: none (manual verification only — this repo has no React/DOM testing library; every existing CAS Tracker drawer shipped the same way, verified by `next build` + a live walkthrough. See Step 4.)

**Interfaces:**
- Consumes: `median`, `quartilesForPeriod` (not called directly by the component, only via `buildQuartileReport`), `buildQuartileReport` from `lib/quartileRanking.js` (Task 1); `resolveHoldingArn(pan, folio, advisorStr, overrides)` from `lib/distributorResolution.js` (existing, returns bare ARN digits e.g. `'251838'`); `currentInfo.holdings`, `activePan`, `currentInfo.investorName`, `familyName`, `arnOverrides` from `app/cas-tracker/page.js`'s existing component state (all already used identically by the neighboring `PortfolioRedemptionPlanner` at `app/cas-tracker/page.js:3293-3303`).
- Produces: default export `PortfolioReviewPlanner({ holdings, activePan, investorName, familyName, arnOverrides, onClose })` — a self-contained drawer, no return value consumed by anything else.

- [ ] **Step 1: Create the component**

Create `components/PortfolioReviewPlanner.jsx`:

```jsx
'use client';

// components/PortfolioReviewPlanner.jsx
//
// Portfolio Review / Quartile Ranking drawer -- groups the currently-
// viewed holdings by SEBI sub-category and ranks each into a performance
// quartile (1-4) against every fund in that category, styled after NJ
// Wealth's "Scheme Analysis" report pages. Abundance's own ARN-251838
// holdings are excluded by default (checkbox to include them). See
// docs/superpowers/specs/2026-09-18-portfolio-review-quartile-planner-design.md.
//
// `holdings` shape required per entry: { name, amfiCode, value, folio,
// advisor, __ownerPan?, __ownerName? } -- exactly what
// app/cas-tracker/page.js's currentInfo.holdings already is (single-PAN
// view or mergeFamilyView's pooled family view). `activePan` is the
// resolveHoldingArn fallback for a holding with no __ownerPan (i.e. not
// in pooled family view) -- same fallback app/cas-tracker/page.js:2734
// already uses for the per-card distributor badge.

import { useState, useEffect, useMemo } from 'react';
import { resolveHoldingArn } from '@/lib/distributorResolution';
import { buildQuartileReport } from '@/lib/quartileRanking';

const ABUNDANCE_ARN = '251838';
const PERIODS = ['ret_1y', 'ret_3y', 'ret_5y'];
const PERIOD_LABELS = { ret_1y: '1 Yr', ret_3y: '3 Yr', ret_5y: '5 Yr' };

export default function PortfolioReviewPlanner({ holdings, activePan, investorName, familyName, arnOverrides = {}, onClose }) {
  const [screenerFunds, setScreenerFunds] = useState(null); // null = still loading
  const [screenerError, setScreenerError] = useState('');
  const [includeOwnArn, setIncludeOwnArn] = useState(false); // "Include funds sold by Abundance" -- off by default

  useEffect(() => {
    let cancelled = false;
    fetch('/api/screener')
      .then(r => r.json())
      .then(d => { if (!cancelled) setScreenerFunds(d.funds || []); })
      .catch(() => { if (!cancelled) setScreenerError('Peer fund data unavailable — try again shortly.'); });
    return () => { cancelled = true; };
  }, []);

  const fmt = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');

  // Each holding's own ARN, resolved once so both the filter and the
  // excluded-count footer agree on the identical value. Mirrors the exact
  // fallback app/cas-tracker/page.js:2734 uses for the per-card badge.
  const holdingsWithArn = useMemo(() => holdings.map(h => ({
    ...h,
    __resolvedArn: resolveHoldingArn(h.__ownerPan || activePan, h.folio, h.advisor, arnOverrides),
  })), [holdings, activePan, arnOverrides]);

  const ownArnHoldings   = holdingsWithArn.filter(h => h.__resolvedArn === ABUNDANCE_ARN);
  const includedHoldings = includeOwnArn ? holdingsWithArn : holdingsWithArn.filter(h => h.__resolvedArn !== ABUNDANCE_ARN);

  const report = useMemo(() => {
    if (!screenerFunds) return null;
    return buildQuartileReport(includedHoldings, screenerFunds);
  }, [includedHoldings, screenerFunds]);

  // Same single-vs-multi-owner rule as PortfolioRedemptionPlanner's own
  // displayName (app/cas-tracker/page.js) -- real name when every included
  // holding belongs to one family member, the Family Name otherwise.
  const owners = [...new Set(includedHoldings.map(h => h.__ownerName).filter(Boolean))];
  const displayName = owners.length === 1 ? owners[0] : (familyName || investorName);

  const quartileColor = (q) =>
    q === 1 ? 'var(--g1)' : q === 2 ? '#f9a825' : q === 3 ? '#e65100' : q === 4 ? 'var(--neg)' : 'var(--muted)';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}
      onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(2px)' }} />

      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 'min(760px, 100vw)',
        height: '100dvh', overflowY: 'auto',
        background: 'var(--surface)',
        boxShadow: '-8px 0 40px rgba(0,0,0,.15)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 28px 16px', borderBottom: '1.5px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '.6rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
                Portfolio Review Report
              </div>
              <div style={{ fontSize: '.9rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-.3px' }}>
                {displayName}
              </div>
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginTop: 3 }}>
                Quartile ranking vs. category peers · 1Yr / 3Yr / 5Yr return (CAGR)
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              <button
                className="no-print"
                onClick={() => window.print()}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 13px', borderRadius: 8,
                  border: '1.5px solid var(--border2)',
                  background: '#fff', color: 'var(--g2)',
                  fontFamily: 'Raleway, sans-serif', fontSize: '.72rem',
                  fontWeight: 700, cursor: 'pointer', letterSpacing: '.3px',
                }}
              >
                🖨 Print
              </button>
              <button onClick={onClose} className="no-print" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--muted)', padding: '4px 8px', marginTop: -4 }}>✕</button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 28px', flex: 1 }}>
          <label className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: '.72rem', fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeOwnArn} onChange={e => setIncludeOwnArn(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--g1)', cursor: 'pointer' }} />
            Include funds sold by Abundance (ARN-{ABUNDANCE_ARN})
          </label>

          {!includeOwnArn && ownArnHoldings.length > 0 && (
            <div style={{ marginBottom: 16, padding: '8px 12px', background: 'var(--s2)', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '.68rem', color: 'var(--muted)' }}>
              {ownArnHoldings.length} fund{ownArnHoldings.length > 1 ? 's' : ''}, {fmt(ownArnHoldings.reduce((s, h) => s + (h.value || 0), 0))} excluded — sold under Abundance's own ARN.
            </div>
          )}

          {screenerError && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--neg-bg)', border: '1.5px solid #ffcdd2', borderRadius: 10, fontSize: '.7rem', color: 'var(--neg)' }}>
              {screenerError}
            </div>
          )}

          {!report && !screenerError && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: '.78rem' }}>
              Loading peer fund data…
            </div>
          )}

          {report && report.categories.length === 0 && report.unranked.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: '.78rem' }}>
              No holdings to review{!includeOwnArn ? " (all holdings are sold under Abundance's own ARN — check the box above to include them)" : ''}.
            </div>
          )}

          {report && report.categories.map(cat => (
            <div key={cat.category} style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, paddingBottom: 6, borderBottom: '1.5px solid var(--border)', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--text)' }}>{cat.category}</span>
                <span style={{ fontSize: '.6rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                  Category median: {PERIODS.map(p => `${PERIOD_LABELS[p]} ${cat.categoryMedian[p] != null ? cat.categoryMedian[p].toFixed(2) + '%' : '-'}`).join(' · ')}
                </span>
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 10, border: '1.5px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.65rem', minWidth: 480 }}>
                  <thead>
                    <tr style={{ background: 'var(--s2)' }}>
                      {['Scheme', 'Value', ...PERIODS.map(p => `${PERIOD_LABELS[p]} Qtile`)].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Scheme' ? 'left' : 'right', fontWeight: 800, color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '.55rem', letterSpacing: '.5px', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cat.funds.map((fund, i) => (
                      <tr key={fund.amfiCode || fund.name} style={{ borderBottom: i < cat.funds.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '8px 10px' }}>
                          {fund.name}
                          {fund.__ownerName && (
                            <div style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700 }}>{fund.__ownerName}</div>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(fund.value)}</td>
                        {PERIODS.map(p => (
                          <td key={p} style={{ padding: '8px 10px', textAlign: 'right' }}>
                            {fund.quartiles[p] != null ? (
                              <span style={{ fontSize: '.6rem', fontWeight: 800, padding: '2px 8px', borderRadius: 6, color: '#fff', background: quartileColor(fund.quartiles[p]) }}>
                                Q{fund.quartiles[p]}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>-</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {report && report.unranked.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--text)', marginBottom: 8, paddingBottom: 6, borderBottom: '1.5px solid var(--border)' }}>
                Unranked
              </div>
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 8 }}>
                Not in the peer fund universe (Direct plan, SIF, or a scheme not currently tracked) — value still counted, no quartile available.
              </div>
              {report.unranked.map(fund => (
                <div key={fund.amfiCode || fund.name} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '.65rem', borderBottom: '1px solid var(--border)' }}>
                  <span>{fund.name}{fund.__ownerName ? ` · ${fund.__ownerName}` : ''}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmt(fund.value)}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: '.6rem', color: 'var(--muted)', lineHeight: 1.6, padding: '12px 14px', background: 'var(--s2)', borderRadius: 10, border: '1.5px solid var(--border)', marginTop: 20 }}>
            Quartile rank compares each fund's own 1Yr/3Yr/5Yr point-to-point return (CAGR) against every other AMFI-registered fund in its own SEBI sub-category, using the most recently published NAV data. Quartile 1 = top 25% of the category, Quartile 4 = bottom 25%. This is not a rolling-return statistic and not investment advice — past performance does not guarantee future results. Mutual fund investments are subject to market risks; read all scheme-related documents carefully. | ARN-{ABUNDANCE_ARN} | Abundance Financial Services
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire the import and state into `app/cas-tracker/page.js`**

Add the import next to the existing `RedemptionPlanner` import (`app/cas-tracker/page.js:16`):

```js
import RedemptionPlanner from '@/components/RedemptionPlanner';
import PortfolioReviewPlanner from '@/components/PortfolioReviewPlanner';
```

Add new state next to `planPortfolio`'s declaration (`app/cas-tracker/page.js:1283`):

```js
  const [planPortfolio,  setPlanPortfolio]  = useState(false); // portfolio-level redemption planner
  const [showPortfolioReview, setShowPortfolioReview] = useState(false); // quartile-ranking review report
```

- [ ] **Step 3: Add the button and the drawer render block**

Add a new button immediately after the existing "📊 Redemption Planner" button's closing `</button>` (`app/cas-tracker/page.js`, the button ending around line 2586 — search for the `📊 Redemption Planner` text to find it). Unlike that button, this one is **not** `disabled={isFamilyView}` — a quartile report across pooled family holdings is meaningful (each row still shows its own owner):

```jsx
                <button
                  onClick={() => setShowPortfolioReview(true)}
                  style={{
                    padding: '8px 16px', borderRadius: 9,
                    border: '1.5px solid var(--g2)',
                    background: 'var(--g-xlight)', cursor: 'pointer',
                    fontSize: '.72rem', fontWeight: 800,
                    color: 'var(--g1)', fontFamily: 'Raleway, sans-serif',
                    letterSpacing: '-.2px', whiteSpace: 'nowrap',
                    transition: 'all .15s',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background='var(--g1)'; e.currentTarget.style.color='#fff'; }}
                  onMouseLeave={e => { e.currentTarget.style.background='var(--g-xlight)'; e.currentTarget.style.color='var(--g1)'; }}
                >
                  📊 Portfolio Review
                </button>
```

Add the drawer render block as a sibling of the existing `{planPortfolio && (<PortfolioRedemptionPlanner .../>)}` block (`app/cas-tracker/page.js:3293-3303`):

```jsx
      {showPortfolioReview && (
        <PortfolioReviewPlanner
          holdings={currentInfo.holdings || []}
          activePan={activePan}
          investorName={currentInfo.investorName}
          familyName={familyName}
          arnOverrides={arnOverrides}
          onClose={() => setShowPortfolioReview(false)}
        />
      )}
```

- [ ] **Step 4: Verify**

Run: `npx next build`
Expected: build completes with no type/syntax errors (this is the primary automated verification for this task — see the Test: line above for why there's no unit test file).

Then self-review the diff against this checklist before moving on:
- `PortfolioReviewPlanner` is only ever rendered when `showPortfolioReview` is true, and `onClose` always sets it back to `false` — no way to get stuck.
- The new button is *not* wrapped in the `disabled={isFamilyView}` / dimmed-opacity styling the neighboring Redemption Planner button uses — confirm visually in the build output or a screenshot that it always looks clickable.
- `holdings`, `activePan`, `familyName`, `arnOverrides` are the exact same identifiers already in scope at the `PortfolioRedemptionPlanner` render block a few lines below — no typos introduced.

If a signed-in test account with an uploaded CAS (or the `run` skill / a Chrome automation tool) is available in your environment, do a live smoke test on `/cas-tracker`: click "📊 Portfolio Review", confirm the drawer opens, shows category-grouped quartile tables, the ARN checkbox toggles the excluded-funds footer, and 🖨 Print opens a sane print layout. This step is optional in an environment without test CAS data — the `next build` pass plus the self-review checklist above is the required bar for this task.

- [ ] **Step 5: Commit**

```bash
git add components/PortfolioReviewPlanner.jsx app/cas-tracker/page.js
git commit -m "feat(cas-tracker): add Portfolio Review quartile-ranking report

New drawer, styled after NJ Wealth's Scheme Analysis report pages: groups
the currently-viewed holdings by SEBI sub-category and ranks each into a
1Yr/3Yr/5Yr quartile against its category peers (via lib/quartileRanking.js
+ the existing /api/screener dataset). Abundance's own ARN-251838 holdings
are excluded by default, with a checkbox to include them. Available in
both single-PAN and pooled family view; not disabled in family view
(unlike the Redemption Planner button) since a quartile report across
pooled holdings is still meaningful -- each row keeps its own owner tag."
```

---

## Self-Review

**Spec coverage:** `lib/quartileRanking.js` (Task 1) implements the spec's calculation section verbatim, including the per-period independence and category-median-over-full-peer-universe requirements. `PortfolioReviewPlanner.jsx` + wiring (Task 2) implements the drawer, ARN checkbox/exclusion footer, unranked bucket, disclaimer, print button, and single-vs-multi-owner header name — every numbered item in the spec's "Architecture" section has a corresponding piece of code above. Decisions 1-4 from the spec are each reflected in the Global Constraints and in the code (period labels say "Return" not "Rolling Return"; three independent columns; `ABUNDANCE_ARN = '251838'` hardcoded, default-excluded; CAS Tracker only, no `/portfolio` change).

**Placeholder scan:** no TBD/TODO; every code block is complete, runnable code, not a description of code.

**Type consistency:** `quartilesForPeriod`'s `Map<code, quartile>` return type is used identically in `buildQuartileReport` (`.get(h.amfiCode) ?? null`) and never referenced elsewhere. `buildQuartileReport`'s return shape (`{ categories, unranked }`) matches exactly between Task 1's tests, Task 1's implementation, and Task 2's component (`report.categories`, `report.unranked`, `cat.categoryMedian`, `cat.funds`, `fund.quartiles`). `PortfolioReviewPlanner`'s prop names (`holdings`, `activePan`, `investorName`, `familyName`, `arnOverrides`, `onClose`) match exactly what Task 2 Step 3 passes from `app/cas-tracker/page.js`.
