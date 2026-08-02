# Portfolio Creator (Core Analysis Page) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Portfolio Creator page — a premium tool where a user selects 1+ mutual funds (from CAS Tracker holdings and/or manual search) and sees combined asset/sector/stock exposure, pairwise fund overlap, scheme details, M-Cap allocation, and benchmark comparison.

**Architecture:** A new pure computation library (`lib/portfolioAnalysis.js`) does all combining/overlap/M-Cap math from already-fetched per-fund holdings — no I/O, fully unit-testable. A new API route (`app/api/portfolio-creator/holdings/route.js`) resolves a fund by AMFI code to the external scheme-detail data source and returns its holdings, using the same in-memory → Vercel Blob → live-fetch cache pattern already used by `pages/api/nifty-tri.js`. A new client page (`app/portfolio-creator/`) wires the picker, the analysis library, and the holdings API together into the 8 spec sections. A separate follow-up plan covers PDF proposal export — this plan produces the complete, testable on-screen tool on its own.

**Tech Stack:** Next.js 16 App Router, plain React state (no new client-side dependencies), CommonJS `lib/`/`scripts/` files (matching `lib/exitLoadParser.js`/`scripts/sync_groww_exit_loads.js` convention), Node `assert`-based tests (matching `tests/exitLoadParser.test.js`), `xlsx` (already a dependency) for the AMFI sync script.

## Global Constraints

- **No user-facing text, PDF content, footnote, or "source: X" label may ever name the external scheme-detail data source.** Internal code/comments may reference it plainly (this plan does, for engineering clarity) — the restriction is scoped to anything a user would see. The AMFI data source (Section 7) IS namable — it's a legitimate, citable regulatory publication, unlike the other source.
- `weightagePct` from the external API can be negative (short futures positions). Every aggregation in `lib/portfolioAnalysis.js` clamps negative weights to 0 before summing — never let a negative value flow into a `min()` overlap sum or a percentage total.
- No inception/launch date anywhere in the Scheme Details section (verified inaccurate for pre-2013 funds — see spec).
- Portfolio Overlap (Section 5) requires 2+ funds; all other sections work with exactly 1 fund.
- The whole page sits behind the existing Pro-plan gate (`session.user.plan === 'pro'`), reusing `lib/checkoutClient.js`'s `startCheckout({ plan, session, onSuccess, onDismiss })` and the site's existing `.brd-gate*` CSS classes already defined globally in `app/globals.css` — do not create new gate styling.

---

### Task 1: Pure portfolio-analysis library

**Files:**
- Create: `lib/portfolioAnalysis.js`
- Test: `tests/portfolioAnalysis.test.js`

**Interfaces:**
- Produces: `normalizeName(name: string): string`, `combineExposure(funds: Array<{amfiCode, holdings: Array<{securityName, assetClass, sector, weightagePct}>}>, allocations: {[amfiCode]: number}): {assetAllocation, sectorExposure, stockExposure}`, `computeOverlap(funds): number[][]`, `computeMCapAllocation(fund, mCapIndex: Map<string,string>): {large, mid, small, unclassified}`. All consumed by Task 5/6's rendering and by Task 3's route (indirectly, via the shapes it must produce).

- [ ] **Step 1: Write the failing tests**

```js
// tests/portfolioAnalysis.test.js
//
// Unit tests for lib/portfolioAnalysis.js's pure combining/overlap/M-Cap math.
// Run with: node tests/portfolioAnalysis.test.js

const assert = require('assert');
const { normalizeName, combineExposure, computeOverlap, computeMCapAllocation } = require('../lib/portfolioAnalysis');

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

test('combineExposure clamps negative (short) weightage to 0', () => {
  const funds = [
    { amfiCode: 'A', holdings: [
      { securityName: 'Nifty Futures', assetClass: 'EQUITY', sector: 'Derivatives', weightagePct: -15 },
      { securityName: 'HDFC Bank Ltd', assetClass: 'EQUITY', sector: 'Banks', weightagePct: 90 },
    ] },
  ];
  const result = combineExposure(funds, { A: 100 });
  const equity = result.assetAllocation.find((r) => r.name === 'Equity').pct;
  assert.strictEqual(Math.round(equity * 100) / 100, 90); // the -15 contributes 0, not -15
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

test('computeOverlap excludes debt/cash from the overlap sum', () => {
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
  assert.strictEqual(grid[0][1], 40); // only the equity holding counts, not the matching 60% debt holding
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
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node tests/portfolioAnalysis.test.js`
Expected: `Cannot find module '../lib/portfolioAnalysis'` (or similar) — the module doesn't exist yet.

- [ ] **Step 3: Implement `lib/portfolioAnalysis.js`**

```js
/**
 * lib/portfolioAnalysis.js
 *
 * Pure functions for combining multiple funds' holdings into portfolio-level
 * asset/sector/stock exposure, pairwise fund overlap, and M-Cap allocation.
 * No I/O -- callers fetch each fund's holdings and the AMFI M-Cap lookup
 * separately and pass them in here.
 */

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\b(ltd|limited)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// weightagePct can be negative (short futures positions) -- a short hedge
// isn't a "holding" in the sense every section in this module measures.
function clampWeight(w) {
  return Math.max(0, w || 0);
}

function topNPlusOther(rows, n) {
  if (rows.length <= n) return rows;
  const top = rows.slice(0, n);
  const otherPct = rows.slice(n).reduce((s, r) => s + r.pct, 0);
  return [...top, { name: 'Other', pct: Math.round(otherPct * 100) / 100 }];
}

function assetClassLabel(assetClass) {
  if (assetClass === 'EQUITY') return 'Equity';
  if (assetClass === 'DEBT') return 'Debt';
  if (assetClass === 'CASH') return 'Cash';
  return 'Other';
}

// funds: [{ amfiCode, holdings: [{securityName, assetClass, sector, weightagePct}] }]
// allocations: { [amfiCode]: percentOfPortfolio } (expected to sum to ~100)
function combineExposure(funds, allocations) {
  const asset = new Map();
  const sector = new Map();
  const stock = new Map(); // normalizedName -> { name, pct }

  for (const fund of funds) {
    const fundWeight = (allocations[fund.amfiCode] || 0) / 100;
    for (const h of fund.holdings) {
      const portfolioPct = clampWeight(h.weightagePct) * fundWeight;
      const assetKey = assetClassLabel(h.assetClass);
      asset.set(assetKey, (asset.get(assetKey) || 0) + portfolioPct);

      if (h.assetClass === 'EQUITY') {
        const sectorKey = h.sector || 'Unknown';
        sector.set(sectorKey, (sector.get(sectorKey) || 0) + portfolioPct);

        const nameKey = normalizeName(h.securityName);
        const existing = stock.get(nameKey) || { name: h.securityName, pct: 0 };
        existing.pct += portfolioPct;
        stock.set(nameKey, existing);
      }
    }
  }

  const round2 = (n) => Math.round(n * 100) / 100;
  const sortedAsset = [...asset.entries()]
    .map(([name, pct]) => ({ name, pct: round2(pct) }))
    .sort((a, b) => b.pct - a.pct);
  const sortedSector = [...sector.entries()]
    .map(([name, pct]) => ({ name, pct: round2(pct) }))
    .sort((a, b) => b.pct - a.pct);
  const sortedStock = [...stock.values()]
    .map((r) => ({ name: r.name, pct: round2(r.pct) }))
    .sort((a, b) => b.pct - a.pct);

  return {
    assetAllocation: sortedAsset,
    sectorExposure: topNPlusOther(sortedSector, 10),
    stockExposure: topNPlusOther(sortedStock, 10),
  };
}

// Equity-only pairwise overlap: for each stock held by both funds, sum
// min(weightInA, weightInB). Returns an N x N grid (diagonal = 100).
function computeOverlap(funds) {
  const equityMaps = funds.map((fund) => {
    const m = new Map();
    for (const h of fund.holdings) {
      if (h.assetClass !== 'EQUITY') continue;
      const key = normalizeName(h.securityName);
      m.set(key, (m.get(key) || 0) + clampWeight(h.weightagePct));
    }
    return m;
  });

  const n = funds.length;
  const grid = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) { grid[i][j] = 100; continue; }
      let overlap = 0;
      for (const [key, wA] of equityMaps[i]) {
        const wB = equityMaps[j].get(key);
        if (wB) overlap += Math.min(wA, wB);
      }
      grid[i][j] = Math.round(overlap * 100) / 100;
    }
  }
  return grid;
}

// mCapIndex: Map<normalizedName, 'Large Cap' | 'Mid Cap' | 'Small Cap'>
// Denominator is total EQUITY weight only (debt/cash excluded), matching
// the reference proposal's convention for this section.
function computeMCapAllocation(fund, mCapIndex) {
  let large = 0, mid = 0, small = 0, unclassified = 0, totalEquity = 0;
  for (const h of fund.holdings) {
    if (h.assetClass !== 'EQUITY') continue;
    const w = clampWeight(h.weightagePct);
    totalEquity += w;
    const cat = mCapIndex.get(normalizeName(h.securityName));
    if (cat === 'Large Cap') large += w;
    else if (cat === 'Mid Cap') mid += w;
    else if (cat === 'Small Cap') small += w;
    else unclassified += w;
  }
  if (totalEquity === 0) return { large: 0, mid: 0, small: 0, unclassified: 0 };
  const pct = (v) => Math.round((v / totalEquity) * 10000) / 100;
  return { large: pct(large), mid: pct(mid), small: pct(small), unclassified: pct(unclassified) };
}

module.exports = { normalizeName, combineExposure, computeOverlap, computeMCapAllocation, topNPlusOther };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node tests/portfolioAnalysis.test.js`
Expected: `6 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add lib/portfolioAnalysis.js tests/portfolioAnalysis.test.js
git commit -m "feat(portfolio-creator): add pure combine/overlap/M-Cap analysis library"
```

---

### Task 2: AMFI M-Cap categorization sync script

**Files:**
- Create: `scripts/sync-amfi-categorization.mjs`
- Create (generated by running the script, not hand-written): `public/data/amfi-cap-categorization.json`

**Interfaces:**
- Consumes: `normalizeName` from `lib/portfolioAnalysis.js` (Task 1).
- Produces: `public/data/amfi-cap-categorization.json`, shape `{ generatedAt: string, categories: {[normalizedName]: 'Large Cap'|'Mid Cap'|'Small Cap'} }` — Task 6's client code fetches this directly as a static asset (`fetch('/data/amfi-cap-categorization.json')`), no API route needed.

- [ ] **Step 1: Write the script**

```js
// scripts/sync-amfi-categorization.mjs
//
// Downloads AMFI's official semi-annual large/mid/small-cap stock
// categorization and writes a normalized-name -> category lookup to
// public/data/amfi-cap-categorization.json, used by the Portfolio Creator's
// M-Cap Allocation section (Section 7 of the design spec).
//
// AMFI republishes this twice a year (30 Jun / 31 Dec) at
// https://www.amfiindia.com/otherdata/categorisation-of-stocks -- run this
// script manually after each refresh. No cron needed given the frequency.
//
// Usage: node scripts/sync-amfi-categorization.mjs

import * as XLSX from 'xlsx';
import { writeFileSync, mkdirSync } from 'fs';
import { normalizeName } from '../lib/portfolioAnalysis.js';

const PAGE_URL = 'https://www.amfiindia.com/otherdata/categorisation-of-stocks';
const OUT_PATH = 'public/data/amfi-cap-categorization.json';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

async function findLatestXlsxUrl() {
  const res = await fetch(PAGE_URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`Failed to fetch ${PAGE_URL}: HTTP ${res.status}`);
  const html = await res.text();
  const matches = [...html.matchAll(/href="([^"]*AverageMarketCapitalization[^"]*\.xlsx)"/gi)];
  if (!matches.length) throw new Error('No AverageMarketCapitalization*.xlsx links found on the page');
  // The page lists newest-first; the first match is the current period.
  return matches[0][1];
}

async function run() {
  console.log(`Fetching AMFI categorization page: ${PAGE_URL}`);
  const xlsxUrl = await findLatestXlsxUrl();
  console.log(`Found latest xlsx: ${xlsxUrl}`);

  const xlsxRes = await fetch(xlsxUrl, { headers: HEADERS });
  if (!xlsxRes.ok) throw new Error(`Failed to download ${xlsxUrl}: HTTP ${xlsxRes.status}`);
  const buf = Buffer.from(await xlsxRes.arrayBuffer());

  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

  // Row 0 is the title, row 1 is the header. Data starts at row 2.
  // Columns (verified live): [Sr No, Company name, ISIN, BSE Symbol,
  // BSE avg cap, NSE Symbol, NSE avg cap, MSEI Symbol, MSEI avg cap,
  // Average of All Exchanges, Categorization]
  const categories = {};
  let matched = 0;
  for (const row of rows.slice(2)) {
    const companyName = row[1];
    const category = row[10];
    if (!companyName || !category) continue;
    if (!/^(Large|Mid|Small) Cap$/.test(category.trim())) continue;
    categories[normalizeName(companyName)] = category.trim();
    matched++;
  }

  if (matched < 1000) {
    throw new Error(`Only matched ${matched} rows -- expected 5000+. AMFI's column layout may have changed; check row[1]/row[10] against a fresh download.`);
  }

  mkdirSync('public/data', { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), categories }, null, 2));
  console.log(`Wrote ${matched} categorized stocks to ${OUT_PATH}`);
}

run().catch((err) => {
  console.error('sync-amfi-categorization failed:', err.message);
  process.exit(1);
});
```

- [ ] **Step 2: Run it and verify the output**

Run: `node scripts/sync-amfi-categorization.mjs`
Expected: `Wrote 5000+ categorized stocks to public/data/amfi-cap-categorization.json` (exact count varies by AMFI's current publication — the script errors out below 1000 as a sanity floor, not an exact match).

Then spot-check the output:
```bash
node -e "const d = require('./public/data/amfi-cap-categorization.json'); console.log(Object.keys(d.categories).length); console.log(d.categories['hdfc bank'], d.categories['reliance industries']);"
```
Expected: a count in the thousands, and both `hdfc bank`/`reliance industries` printing `Large Cap`.

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-amfi-categorization.mjs public/data/amfi-cap-categorization.json
git commit -m "feat(portfolio-creator): add AMFI M-Cap categorization sync script"
```

---

### Task 3: Holdings-fetching API route

**Files:**
- Create: `app/api/portfolio-creator/holdings/route.js`

**Interfaces:**
- Produces: `GET /api/portfolio-creator/holdings?amfiCode=X&schemeName=Y` → `200 { schemeName, aum, expenseRatio, risk, category, subCategory, holdings: [{securityName, assetClass, sector, marketValueCr, weightagePct, stockSlug}], source }` or `404 { error }` when no match is found. `holdings[]`'s shape is exactly what Task 1's `combineExposure`/`computeOverlap`/`computeMCapAllocation` consume (`securityName`, `assetClass`, `sector`, `weightagePct`).

- [ ] **Step 1: Implement the route**

```js
/**
 * app/api/portfolio-creator/holdings/route.js
 *
 * GET /api/portfolio-creator/holdings?amfiCode=118955&schemeName=HDFC%20Flexi%20Cap%20Fund
 *
 * Resolves a fund (by AMFI code + name) against an external scheme-detail
 * data source and returns its holdings plus scheme-level fields (AUM,
 * expense ratio, risk, category). Cached in-memory -> Vercel Blob -> live
 * fetch, same 3-layer pattern as pages/api/nifty-tri.js. Holdings change at
 * most monthly, so a 7-day TTL is generous without going stale.
 */

const CACHE_PREFIX = 'portfolio-creator-holdings/';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

const memCache = new Map(); // amfiCode -> { data, ts }
const inflight = new Map();

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://groww.in/mutual-funds',
};

function isFresh(ts) {
  return ts && Date.now() - ts < TTL_MS;
}

// Strips Direct/Regular/Growth/plan noise so the search term matches
// however the fund's canonical name is indexed. Kept as an independent
// copy from scripts/sync_groww_exit_loads.js's deriveSearchTerm -- that
// script is a standalone CLI tool, not an importable app module, and this
// route needs zero coupling to it.
function cleanSearchTerm(schemeName) {
  return (schemeName || '')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(Direct|Regular)\b/gi, '')
    .replace(/\bPlan\b/gi, '')
    .replace(/\b(Growth|IDCW|Dividend)\b/gi, '')
    .replace(/\b(Payout|Reinvestment|Reinvest|Bonus|Option|Quarterly|Monthly|Weekly|Daily|Annual)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveSearchId(amfiCode, schemeName) {
  const term = cleanSearchTerm(schemeName);
  const url = `https://groww.in/v1/api/search/v1/entity?app=false&entity_type=scheme&q=${encodeURIComponent(term)}&page=0&size=5`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) return null;
  const json = await res.json();
  const candidates = json?.data?.content || [];
  const match = candidates.find((c) => String(c.scheme_code) === String(amfiCode));
  return match ? match.search_id : null;
}

// Holdings arrive as positional arrays:
// [scheme_code, as_of_date, security_name, asset_class, sector,
//  instrument_type, null, market_value_cr, weightage_pct, null, null, stock_slug]
function normalizeHoldings(rawHoldings) {
  if (!Array.isArray(rawHoldings)) return [];
  return rawHoldings.map((h) => ({
    securityName: h[2] || '',
    assetClass: h[3] || 'OTHER',
    sector: h[4] || 'Unknown',
    marketValueCr: parseFloat(h[7]) || 0,
    weightagePct: parseFloat(h[8]) || 0,
    stockSlug: h[11] || null,
  }));
}

async function blobGet(amfiCode) {
  if (!BLOB_TOKEN) return null;
  try {
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: `${CACHE_PREFIX}${amfiCode}.json`, token: BLOB_TOKEN, limit: 1 });
    if (!blobs.length) return null;
    const res = await fetch(blobs[0].downloadUrl || blobs[0].url, {
      headers: { Authorization: `Bearer ${BLOB_TOKEN}`, 'Cache-Control': 'no-store' },
    });
    if (!res.ok) return null;
    const payload = await res.json();
    if (!isFresh(payload.ts)) return null;
    return payload.data;
  } catch {
    return null;
  }
}

async function blobPut(amfiCode, data) {
  if (!BLOB_TOKEN) return;
  try {
    const { put } = await import('@vercel/blob');
    await put(`${CACHE_PREFIX}${amfiCode}.json`, JSON.stringify({ data, ts: Date.now() }), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      token: BLOB_TOKEN,
    });
  } catch (e) {
    console.error('[portfolio-creator/holdings] Blob write failed:', e.message);
  }
}

async function fetchFresh(amfiCode, schemeName) {
  const searchId = await resolveSearchId(amfiCode, schemeName);
  if (!searchId) return null;

  const detailRes = await fetch(`https://groww.in/v1/api/data/mf/web/v1/scheme/search/${searchId}`, { headers: FETCH_HEADERS });
  if (!detailRes.ok) return null;
  const detail = await detailRes.json();
  if (!detail || !Array.isArray(detail.holdings)) return null;

  return {
    schemeName: detail.scheme_name || schemeName,
    aum: detail.aum ?? null,
    expenseRatio: detail.expense_ratio ?? null,
    risk: detail.risk ?? null,
    category: detail.category ?? null,
    subCategory: detail.sub_category ?? null,
    holdings: normalizeHoldings(detail.holdings),
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const amfiCode = searchParams.get('amfiCode');
  const schemeName = searchParams.get('schemeName');

  if (!amfiCode || !schemeName) {
    return Response.json({ error: 'amfiCode and schemeName are required' }, { status: 400 });
  }

  const mem = memCache.get(amfiCode);
  if (isFresh(mem?.ts)) {
    return Response.json({ ...mem.data, source: 'memory' });
  }

  const blobData = await blobGet(amfiCode);
  if (blobData) {
    memCache.set(amfiCode, { data: blobData, ts: Date.now() });
    return Response.json({ ...blobData, source: 'blob' });
  }

  if (inflight.has(amfiCode)) {
    const data = await inflight.get(amfiCode);
    if (!data) return Response.json({ error: 'No holdings data found for this fund' }, { status: 404 });
    return Response.json({ ...data, source: 'dedup' });
  }

  const fetchPromise = fetchFresh(amfiCode, schemeName)
    .then((data) => {
      if (data) {
        memCache.set(amfiCode, { data, ts: Date.now() });
        blobPut(amfiCode, data); // fire-and-forget
      }
      return data;
    })
    .finally(() => inflight.delete(amfiCode));
  inflight.set(amfiCode, fetchPromise);

  const data = await fetchPromise;
  if (!data) return Response.json({ error: 'No holdings data found for this fund' }, { status: 404 });
  return Response.json({ ...data, source: 'live' });
}
```

- [ ] **Step 2: Manual verification**

Run the dev server (`npm run dev`) and fetch a known fund:
```bash
curl "http://localhost:3000/api/portfolio-creator/holdings?amfiCode=118955&schemeName=HDFC%20Flexi%20Cap%20Fund"
```
Expected: `200`, `source: "live"` on first call, `holdings` is a non-empty array of objects with `securityName`/`assetClass`/`sector`/`weightagePct`, `aum` and `expenseRatio` are numbers. Repeat the same request — expect `source: "memory"` the second time.

- [ ] **Step 3: Commit**

```bash
git add app/api/portfolio-creator/holdings/route.js
git commit -m "feat(portfolio-creator): add cached holdings-fetching API route"
```

---

### Task 4: Page shell, premium gate, and fund picker

**Files:**
- Create: `app/portfolio-creator/layout.js`
- Create: `app/portfolio-creator/page.jsx`
- Create: `app/portfolio-creator/PortfolioCreatorClient.jsx`
- Create: `app/portfolio-creator/portfolio-creator.css`

**Interfaces:**
- Consumes: `lib/checkoutClient.js`'s `startCheckout({ plan, session, onSuccess, onDismiss })`; `/api/cas/list` → `{ portfolios: [{blob_key, ...}] }`; `/api/cas/load?key=` → `{ folios: [{PAN, folio, schemes: [{amfi, scheme, isin, close}]}] }`; `/api/mf?q=` → `[{schemeCode, schemeName}]` (schemeCode is the AMFI code).
- Produces: `PortfolioCreatorClient`'s `selectedFunds` state, shape `[{amfiCode, schemeName, allocationPct}]`, and a `holdingsByFund` map (`amfiCode -> holdings API response`) — both consumed by Tasks 5 and 6's rendering additions to this same file.

- [ ] **Step 1: Create the layout**

```js
// app/portfolio-creator/layout.js
export const metadata = {
  title: 'Portfolio Creator — Multi-Fund Overlap & Exposure Analysis | Abundance Financial Services',
  description: 'Select your mutual funds and see combined sector/stock exposure, fund overlap, M-Cap allocation, and benchmark comparison in one view. A Pro feature for clients of Abundance Financial Services (ARN-251838).',
  robots: { index: false, follow: false }, // personalized tool behind a paywall -- not a crawlable landing page
};

export default function PortfolioCreatorLayout({ children }) {
  return children;
}
```

- [ ] **Step 2: Create the page entry point**

```jsx
// app/portfolio-creator/page.jsx
import PortfolioCreatorClient from './PortfolioCreatorClient';
import './portfolio-creator.css';

export default function PortfolioCreatorPage() {
  return <PortfolioCreatorClient />;
}
```

- [ ] **Step 3: Create the client component (shell, auth gate, and fund picker)**

```jsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { startCheckout } from '@/lib/checkoutClient';

export default function PortfolioCreatorClient() {
  const { data: session, status } = useSession();
  const isAuthed = status === 'authenticated';
  const isPro = session?.user?.plan === 'pro';

  return (
    <>
      <Navbar />
      <main className="pfc-page">
        <h1 className="pfc-title">Portfolio Creator</h1>
        <p className="pfc-subtitle">Combine funds to see overlap, exposure, and benchmark comparison in one view.</p>

        {status !== 'loading' && !isAuthed && <PfcSignInGate />}
        {status !== 'loading' && isAuthed && !isPro && <PfcProGate session={session} />}
        {isAuthed && isPro && <PortfolioCreatorTool />}
      </main>
      <Footer />
    </>
  );
}

function PfcSignInGate() {
  return (
    <div className="brd-gate">
      <div className="brd-gate-lock">🔒</div>
      <h2 className="brd-gate-title">Sign in to use Portfolio Creator</h2>
      <p className="brd-gate-desc">
        Select multiple mutual funds and see combined sector/stock exposure, fund overlap,
        M-Cap allocation, and benchmark comparison — everything a real investment proposal covers.
      </p>
      <div className="brd-gate-actions">
        <button className="brd-gate-btn" onClick={() => signIn()}>Sign in to continue →</button>
      </div>
    </div>
  );
}

function PfcProGate({ session }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleUpgrade() {
    setLoading(true);
    setError('');
    try {
      await startCheckout({
        plan: 'annual',
        session,
        onSuccess() { window.location.reload(); },
        onDismiss() { setLoading(false); },
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="brd-gate">
      <div className="brd-gate-lock">⭐</div>
      <h2 className="brd-gate-title">Portfolio Creator is a Pro feature</h2>
      <p className="brd-gate-desc">
        Select multiple mutual funds and see combined sector/stock exposure, fund overlap
        detection, M-Cap allocation, and benchmark comparison — everything a real investment
        proposal covers, in one view.
      </p>
      <div className="brd-gate-pricing">
        <span className="brd-gate-amount">₹499</span>
        <span className="brd-gate-period">/yr + 18% GST</span>
        <span className="brd-gate-total">· Total ₹588.82</span>
      </div>
      <div className="brd-gate-actions">
        <button className="brd-gate-btn brd-gate-btn-pro" onClick={handleUpgrade} disabled={loading}>
          {loading ? 'Opening checkout…' : 'Upgrade to Pro →'}
        </button>
        <a className="brd-gate-faq" href="/pricing">See all Pro features · Lifetime plan available</a>
      </div>
      {error && <p className="brd-gate-error">{error}</p>}
    </div>
  );
}

function PortfolioCreatorTool() {
  const [selectedFunds, setSelectedFunds] = useState([]); // [{amfiCode, schemeName, allocationPct}]
  const [casFunds, setCasFunds] = useState([]);            // [{amfiCode, schemeName}] deduped from CAS
  const [casLoading, setCasLoading] = useState(true);
  const [holdingsByFund, setHoldingsByFund] = useState({}); // amfiCode -> holdings API response
  const [holdingsError, setHoldingsError] = useState({});   // amfiCode -> error message

  // Load the user's CAS-derived fund list once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const listRes = await fetch('/api/cas/list').then((r) => r.json());
        const portfolios = listRes.portfolios || [];
        const seen = new Map(); // amfiCode -> schemeName
        for (const p of portfolios) {
          const data = await fetch(`/api/cas/load?key=${encodeURIComponent(p.blob_key)}`).then((r) => r.json());
          for (const folio of data.folios || []) {
            for (const scheme of folio.schemes || []) {
              if (scheme.amfi && parseFloat(scheme.close) > 0.001) {
                seen.set(scheme.amfi, scheme.scheme);
              }
            }
          }
        }
        if (!cancelled) setCasFunds([...seen.entries()].map(([amfiCode, schemeName]) => ({ amfiCode, schemeName })));
      } catch {
        if (!cancelled) setCasFunds([]);
      } finally {
        if (!cancelled) setCasLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const addFund = useCallback((amfiCode, schemeName) => {
    setSelectedFunds((prev) => {
      if (prev.some((f) => f.amfiCode === amfiCode)) return prev;
      const next = [...prev, { amfiCode, schemeName, allocationPct: 0 }];
      const equalPct = Math.round((100 / next.length) * 100) / 100;
      return next.map((f) => ({ ...f, allocationPct: equalPct }));
    });
  }, []);

  const removeFund = useCallback((amfiCode) => {
    setSelectedFunds((prev) => {
      const next = prev.filter((f) => f.amfiCode !== amfiCode);
      if (next.length === 0) return next;
      const equalPct = Math.round((100 / next.length) * 100) / 100;
      return next.map((f) => ({ ...f, allocationPct: equalPct }));
    });
  }, []);

  const setAllocation = useCallback((amfiCode, pct) => {
    setSelectedFunds((prev) => prev.map((f) => (f.amfiCode === amfiCode ? { ...f, allocationPct: pct } : f)));
  }, []);

  // Fetch holdings for any selected fund not yet loaded.
  useEffect(() => {
    selectedFunds.forEach(({ amfiCode, schemeName }) => {
      if (holdingsByFund[amfiCode] || holdingsError[amfiCode]) return;
      fetch(`/api/portfolio-creator/holdings?amfiCode=${encodeURIComponent(amfiCode)}&schemeName=${encodeURIComponent(schemeName)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setHoldingsError((prev) => ({ ...prev, [amfiCode]: data.error }));
          } else {
            setHoldingsByFund((prev) => ({ ...prev, [amfiCode]: data }));
          }
        })
        .catch(() => setHoldingsError((prev) => ({ ...prev, [amfiCode]: 'Failed to load holdings' })));
    });
  }, [selectedFunds, holdingsByFund, holdingsError]);

  return (
    <div className="pfc-tool">
      <FundPicker
        selectedFunds={selectedFunds}
        casFunds={casFunds}
        casLoading={casLoading}
        onAdd={addFund}
        onRemove={removeFund}
        onAllocationChange={setAllocation}
      />
      {/* Sections 2-8 render here once funds are selected -- added in Tasks 5 and 6 */}
    </div>
  );
}

function FundPicker({ selectedFunds, casFunds, casLoading, onAdd, onRemove, onAllocationChange }) {
  const [tab, setTab] = useState('cas');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (tab !== 'search') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.trim().length < 3) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await fetch(`/api/mf?q=${encodeURIComponent(query.trim())}`).then((r) => r.json());
        const regular = (Array.isArray(data) ? data : []).filter((s) => !/\bdirect\b/i.test(s.schemeName));
        setResults(regular.slice(0, 40));
      } catch {
        setResults([]);
      }
      setSearching(false);
    }, 280);
    return () => timerRef.current && clearTimeout(timerRef.current);
  }, [query, tab]);

  const selectedCodes = new Set(selectedFunds.map((f) => f.amfiCode));
  const totalAllocation = selectedFunds.reduce((s, f) => s + (f.allocationPct || 0), 0);

  return (
    <section className="pfc-picker">
      <div className="pfc-picker-tabs">
        <button className={tab === 'cas' ? 'on' : ''} onClick={() => setTab('cas')}>From your CAS holdings</button>
        <button className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}>Search any fund</button>
      </div>

      {tab === 'cas' && (
        <div className="pfc-picker-list">
          {casLoading && <div className="pfc-hint">Loading your CAS holdings…</div>}
          {!casLoading && casFunds.length === 0 && <div className="pfc-hint">No CAS statement found. Upload one on the CAS Tracker page, or search for a fund manually.</div>}
          {casFunds.map((f) => (
            <button
              key={f.amfiCode}
              className="pfc-picker-item"
              disabled={selectedCodes.has(f.amfiCode)}
              onClick={() => onAdd(f.amfiCode, f.schemeName)}
            >
              {f.schemeName}
              <span className="pfc-add">{selectedCodes.has(f.amfiCode) ? 'Added' : 'Add'}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'search' && (
        <div className="pfc-picker-list">
          <input
            className="pfc-search-input"
            placeholder="Type at least 3 letters, e.g. 'parag parikh flexi'…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching && <div className="pfc-hint">Searching…</div>}
          {!searching && query.trim().length >= 3 && results.length === 0 && <div className="pfc-hint">No funds matched. Try a simpler keyword.</div>}
          {results.map((s) => (
            <button
              key={s.schemeCode}
              className="pfc-picker-item"
              disabled={selectedCodes.has(s.schemeCode)}
              onClick={() => onAdd(s.schemeCode, s.schemeName)}
            >
              {s.schemeName}
              <span className="pfc-add">{selectedCodes.has(s.schemeCode) ? 'Added' : 'Add'}</span>
            </button>
          ))}
        </div>
      )}

      {selectedFunds.length > 0 && (
        <div className="pfc-selected">
          <h3>Selected funds ({selectedFunds.length})</h3>
          {selectedFunds.map((f) => (
            <div className="pfc-selected-row" key={f.amfiCode}>
              <span className="pfc-selected-name">{f.schemeName}</span>
              <input
                type="number"
                className="pfc-alloc-input"
                min="0"
                max="100"
                step="0.1"
                value={f.allocationPct}
                onChange={(e) => onAllocationChange(f.amfiCode, parseFloat(e.target.value) || 0)}
              />
              <span className="pfc-alloc-pct">%</span>
              <button className="pfc-remove" onClick={() => onRemove(f.amfiCode)}>Remove</button>
            </div>
          ))}
          <div className={`pfc-alloc-total ${Math.abs(totalAllocation - 100) > 0.5 ? 'pfc-alloc-warn' : ''}`}>
            Total allocation: {Math.round(totalAllocation * 100) / 100}% {Math.abs(totalAllocation - 100) > 0.5 && '(should sum to 100%)'}
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Create the CSS file**

```css
/* app/portfolio-creator/portfolio-creator.css */

.pfc-page { max-width: 1100px; margin: 0 auto; padding: 32px 20px 64px; }
.pfc-title { font: 700 32px Raleway, sans-serif; color: var(--g1); margin-bottom: 6px; }
.pfc-subtitle { font: 400 15px Raleway, sans-serif; color: var(--muted); margin-bottom: 28px; }

.pfc-picker { background: var(--surface, #fff); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 24px; }
.pfc-picker-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.pfc-picker-tabs button { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border); background: transparent; cursor: pointer; font: 500 13px Raleway, sans-serif; }
.pfc-picker-tabs button.on { background: var(--g2); color: #fff; border-color: var(--g2); }

.pfc-picker-list { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; }
.pfc-picker-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); background: transparent; cursor: pointer; text-align: left; font: 500 13px Raleway, sans-serif; }
.pfc-picker-item:disabled { opacity: 0.55; cursor: default; }
.pfc-add { font: 600 11px JetBrains Mono, monospace; color: var(--g2); }
.pfc-search-input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 10px; font: 400 14px Raleway, sans-serif; }
.pfc-hint { font: 400 13px Raleway, sans-serif; color: var(--muted); padding: 12px 0; }

.pfc-selected { margin-top: 20px; border-top: 1px solid var(--border); padding-top: 16px; }
.pfc-selected h3 { font: 600 14px Raleway, sans-serif; margin-bottom: 10px; }
.pfc-selected-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.pfc-selected-name { flex: 1; font: 500 13px Raleway, sans-serif; }
.pfc-alloc-input { width: 64px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--border); font: 500 13px JetBrains Mono, monospace; text-align: right; }
.pfc-alloc-pct { font: 500 13px Raleway, sans-serif; color: var(--muted); }
.pfc-remove { border: none; background: transparent; color: var(--neg); cursor: pointer; font: 500 12px Raleway, sans-serif; }
.pfc-alloc-total { margin-top: 10px; font: 600 12px JetBrains Mono, monospace; color: var(--muted); }
.pfc-alloc-warn { color: var(--warn); }
```

- [ ] **Step 5: Add the nav link**

Find the tools row in `components/Navbar.jsx` (`NAV_TOOLS` array, matching the pattern used for `market-breadth`/`screener`/`cas-tracker` entries) and add a `Portfolio Creator` entry pointing at `/portfolio-creator`, following the exact object shape of its neighboring entries.

- [ ] **Step 6: Build and manually verify**

Run: `npm run build`
Expected: build succeeds.

Manual check (browser automation isn't available in this environment) — note for the user: visit `/portfolio-creator` signed out (see sign-in gate), signed in on the free plan (see Pro gate with working checkout), and signed in on Pro (see the picker). Add a fund from CAS and one from search, confirm allocation % defaults to 50/50 and is editable, confirm removing a fund re-splits evenly.

- [ ] **Step 7: Commit**

```bash
git add app/portfolio-creator/ components/Navbar.jsx
git commit -m "feat(portfolio-creator): add page shell, premium gate, and fund picker"
```

---

### Task 5: Combined exposure sections + Scheme Details table

**Files:**
- Modify: `app/portfolio-creator/PortfolioCreatorClient.jsx`
- Modify: `app/portfolio-creator/portfolio-creator.css`

**Interfaces:**
- Consumes: `combineExposure` from `lib/portfolioAnalysis.js` (Task 1); `selectedFunds`/`holdingsByFund` state from Task 4.

- [ ] **Step 1: Add the combined-exposure and scheme-details rendering**

In `PortfolioCreatorClient.jsx`, import the analysis library and add rendering after the `<FundPicker />` call inside `PortfolioCreatorTool`:

```jsx
import { combineExposure } from '@/lib/portfolioAnalysis';
```

Replace the placeholder comment `{/* Sections 2-8 render here once funds are selected -- added in Tasks 5 and 6 */}` with:

```jsx
{selectedFunds.length > 0 && (() => {
  const readyFunds = selectedFunds
    .filter((f) => holdingsByFund[f.amfiCode])
    .map((f) => ({ amfiCode: f.amfiCode, holdings: holdingsByFund[f.amfiCode].holdings }));
  const allocations = Object.fromEntries(selectedFunds.map((f) => [f.amfiCode, f.allocationPct]));
  const pendingCount = selectedFunds.length - readyFunds.length;

  if (readyFunds.length === 0) {
    return <div className="pfc-hint">Loading holdings…</div>;
  }

  const { assetAllocation, sectorExposure, stockExposure } = combineExposure(readyFunds, allocations);

  return (
    <>
      {pendingCount > 0 && <div className="pfc-hint">Loading holdings for {pendingCount} more fund(s)…</div>}

      <ExposureTable title="Asset Allocation" rows={assetAllocation} />
      <ExposureTable title="Sector Exposure" rows={sectorExposure} />
      <ExposureTable title="Stock Exposure" rows={stockExposure} />

      <SchemeDetailsTable selectedFunds={selectedFunds} holdingsByFund={holdingsByFund} />
    </>
  );
})()}
```

Add the two new components in the same file:

```jsx
function ExposureTable({ title, rows }) {
  return (
    <section className="pfc-section">
      <h2 className="pfc-section-title">{title}</h2>
      <table className="pfc-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="pfc-table-pct">{r.pct.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SchemeDetailsTable({ selectedFunds, holdingsByFund }) {
  return (
    <section className="pfc-section">
      <h2 className="pfc-section-title">Scheme Details</h2>
      <table className="pfc-table pfc-table-wide">
        <thead>
          <tr>
            <th>Fund</th>
            <th>Category</th>
            <th>AUM (₹ Cr)</th>
            <th>Expense Ratio</th>
            <th>Risk</th>
            <th>Equity Holdings</th>
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
                <td className="pfc-table-pct">{d.aum != null ? d.aum.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}</td>
                <td className="pfc-table-pct">{d.expenseRatio != null ? `${d.expenseRatio}%` : '—'}</td>
                <td>{d.risk || '—'}</td>
                <td className="pfc-table-pct">{equityCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 2: Add CSS for the new sections**

Append to `app/portfolio-creator/portfolio-creator.css`:

```css
.pfc-section { background: var(--surface, #fff); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
.pfc-section-title { font: 600 16px Raleway, sans-serif; color: var(--g1); margin-bottom: 12px; }
.pfc-table { width: 100%; border-collapse: collapse; font: 500 13px Raleway, sans-serif; }
.pfc-table td, .pfc-table th { padding: 8px 6px; border-bottom: 1px solid var(--border); text-align: left; }
.pfc-table-pct { font: 500 13px JetBrains Mono, monospace; text-align: right !important; }
.pfc-table-wide th { font: 600 11px Raleway, sans-serif; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }
```

- [ ] **Step 3: Build and manually verify**

Run: `npm run build`
Expected: build succeeds.

Manual check: with 2 CAS funds added, confirm Asset/Sector/Stock Exposure tables render with percentages roughly summing to 100% within each table, and the Scheme Details table shows AUM/expense ratio/risk/equity count for both funds.

- [ ] **Step 4: Commit**

```bash
git add app/portfolio-creator/PortfolioCreatorClient.jsx app/portfolio-creator/portfolio-creator.css
git commit -m "feat(portfolio-creator): add combined exposure tables and scheme details"
```

---

### Task 6: Portfolio Overlap grid + M-Cap Allocation

**Files:**
- Modify: `app/portfolio-creator/PortfolioCreatorClient.jsx`
- Modify: `app/portfolio-creator/portfolio-creator.css`

**Interfaces:**
- Consumes: `computeOverlap`, `computeMCapAllocation` from `lib/portfolioAnalysis.js` (Task 1); `public/data/amfi-cap-categorization.json` (Task 2).

- [ ] **Step 1: Load the AMFI M-Cap index once**

Add to `PortfolioCreatorTool`'s state/effects:

```jsx
const [mCapIndex, setMCapIndex] = useState(null); // Map<normalizedName, category>

useEffect(() => {
  fetch('/data/amfi-cap-categorization.json')
    .then((r) => r.json())
    .then((d) => setMCapIndex(new Map(Object.entries(d.categories))))
    .catch(() => setMCapIndex(new Map()));
}, []);
```

- [ ] **Step 2: Add Overlap and M-Cap rendering**

Import the two new functions:

```jsx
import { combineExposure, computeOverlap, computeMCapAllocation } from '@/lib/portfolioAnalysis';
```

Inside the same `readyFunds.length === 0 ? ... : (...)` block from Task 5, after `<SchemeDetailsTable ... />`, add:

```jsx
{readyFunds.length >= 2 && (
  <OverlapGrid funds={readyFunds} selectedFunds={selectedFunds} />
)}
{readyFunds.length === 1 && (
  <div className="pfc-hint">Add another fund to see overlap analysis.</div>
)}

{mCapIndex && <MCapTable selectedFunds={selectedFunds} readyFunds={readyFunds} mCapIndex={mCapIndex} />}
```

Add the two new components:

```jsx
function OverlapGrid({ funds, selectedFunds }) {
  const grid = computeOverlap(funds);
  const names = funds.map((f) => selectedFunds.find((s) => s.amfiCode === f.amfiCode)?.schemeName || f.amfiCode);

  return (
    <section className="pfc-section">
      <h2 className="pfc-section-title">Portfolio Overlap (Equity Stocks Only)</h2>
      <div className="pfc-overlap-wrap">
        <table className="pfc-table pfc-overlap-table">
          <thead>
            <tr>
              <th></th>
              {names.map((n, i) => <th key={i}>{n}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, i) => (
              <tr key={i}>
                <th>{names[i]}</th>
                {row.map((v, j) => (
                  <td key={j} className={`pfc-table-pct ${i === j ? 'pfc-overlap-diag' : ''}`}>{v.toFixed(1)}%</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MCapTable({ selectedFunds, readyFunds, mCapIndex }) {
  const rows = readyFunds.map((f) => {
    const name = selectedFunds.find((s) => s.amfiCode === f.amfiCode)?.schemeName || f.amfiCode;
    return { name, ...computeMCapAllocation(f, mCapIndex) };
  });

  return (
    <section className="pfc-section">
      <h2 className="pfc-section-title">Scheme M-Cap Allocation</h2>
      <table className="pfc-table pfc-table-wide">
        <thead>
          <tr>
            <th>Fund</th>
            <th>Large Cap</th>
            <th>Mid Cap</th>
            <th>Small Cap</th>
            <th>Unclassified</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="pfc-table-pct">{r.large.toFixed(1)}%</td>
              <td className="pfc-table-pct">{r.mid.toFixed(1)}%</td>
              <td className="pfc-table-pct">{r.small.toFixed(1)}%</td>
              <td className="pfc-table-pct">{r.unclassified.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 3: Add CSS for the overlap grid**

Append to `app/portfolio-creator/portfolio-creator.css`:

```css
.pfc-overlap-wrap { overflow-x: auto; }
.pfc-overlap-table th, .pfc-overlap-table td { min-width: 90px; text-align: center; }
.pfc-overlap-diag { background: var(--surface2, #edf6ed); font-weight: 700; }
```

- [ ] **Step 4: Build and manually verify**

Run: `npm run build`
Expected: build succeeds.

Manual check: with 1 fund selected, confirm the "add another fund" hint shows instead of an overlap grid. Add a 2nd fund, confirm the overlap grid renders with the diagonal showing 100.0% and off-diagonal cells showing a plausible overlap percentage. Confirm the M-Cap table renders Large/Mid/Small/Unclassified percentages summing to ~100% per fund.

- [ ] **Step 5: Commit**

```bash
git add app/portfolio-creator/PortfolioCreatorClient.jsx app/portfolio-creator/portfolio-creator.css
git commit -m "feat(portfolio-creator): add overlap grid and M-Cap allocation table"
```

---

### Task 7: Benchmark performance section

**Files:**
- Modify: `app/portfolio-creator/PortfolioCreatorClient.jsx`

**Interfaces:**
- Consumes: `/api/nifty-tri?index=<name>` (existing route) → `{ index, data: [{date, value}] }`.

- [ ] **Step 1: Add best-effort benchmark comparison**

The external holdings response doesn't reliably carry a usable benchmark name (this session verified `index_return1y/3y/5y` are always null), so this section instead reads each fund's declared `benchmark_name` if present in the holdings API response — extend `app/api/portfolio-creator/holdings/route.js`'s returned shape (Task 3) to also pass through `benchmarkName: detail.benchmark_name ?? null` in the object built by `fetchFresh`.

In `PortfolioCreatorClient.jsx`, add a component that, for each fund with a `benchmarkName`, fetches `/api/nifty-tri?index=<benchmarkName>` and shows a simple side-by-side return comparison using the last and first data points:

```jsx
function BenchmarkSection({ selectedFunds, holdingsByFund }) {
  const [benchData, setBenchData] = useState({}); // amfiCode -> {index, data} | null

  useEffect(() => {
    selectedFunds.forEach((f) => {
      const d = holdingsByFund[f.amfiCode];
      if (!d?.benchmarkName || benchData[f.amfiCode] !== undefined) return;
      fetch(`/api/nifty-tri?index=${encodeURIComponent(d.benchmarkName)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => setBenchData((prev) => ({ ...prev, [f.amfiCode]: res })))
        .catch(() => setBenchData((prev) => ({ ...prev, [f.amfiCode]: null })));
    });
  }, [selectedFunds, holdingsByFund, benchData]);

  const rows = selectedFunds
    .map((f) => {
      const d = holdingsByFund[f.amfiCode];
      const bench = benchData[f.amfiCode];
      if (!d?.benchmarkName || !bench?.data?.length) return null;
      const first = bench.data[0].value;
      const last = bench.data[bench.data.length - 1].value;
      const benchReturn = ((last - first) / first) * 100;
      return { name: f.schemeName, benchmarkName: bench.index, benchReturn };
    })
    .filter(Boolean);

  if (rows.length === 0) return null;

  return (
    <section className="pfc-section">
      <h2 className="pfc-section-title">Fund vs. Benchmark</h2>
      <p className="pfc-hint">Benchmark series is a best-effort price-index match — see the fund's own factsheet for its official benchmark return.</p>
      <table className="pfc-table pfc-table-wide">
        <thead>
          <tr><th>Fund</th><th>Benchmark</th><th>Benchmark return (full history)</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td>{r.benchmarkName}</td>
              <td className="pfc-table-pct">{r.benchReturn.toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

Render it after `<MCapTable ... />`:

```jsx
<BenchmarkSection selectedFunds={selectedFunds} holdingsByFund={holdingsByFund} />
```

- [ ] **Step 2: Build and manually verify**

Run: `npm run build`
Expected: build succeeds.

Manual check: for a fund whose `benchmark_name` resolves to a real BSE index name, confirm the Benchmark section renders a return figure; for one that doesn't match, confirm it's simply omitted from the table (no crash, no blank row).

- [ ] **Step 3: Commit**

```bash
git add app/portfolio-creator/PortfolioCreatorClient.jsx app/api/portfolio-creator/holdings/route.js
git commit -m "feat(portfolio-creator): add best-effort fund vs benchmark comparison"
```

---

## Not in this plan

PDF proposal export (branded PDF generation, Vercel Blob storage, `portfolio_proposals` table, "My Proposals" list) is a separate follow-up plan, built on top of this one's `combineExposure`/`computeOverlap`/`computeMCapAllocation` outputs. Backtest-page overlap reuse is deferred further still (see spec).
