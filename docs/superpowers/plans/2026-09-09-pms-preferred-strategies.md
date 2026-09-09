# PMS Preferred Strategies Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/pms-preferred`, a free, SEO-indexable page showcasing PMS strategies that are Top Quartile vs APMI peers, plus cross-strategy insights (most-held stock, top sector, best alpha, best Sharpe) computed from data already extracted this session — with a Pro-gated sortable table of the same set.

**Architecture:** A monthly script (`scripts/compute_preferred_pms.js`, run right after the existing factsheet sync) resolves each factsheet-extracted strategy to its APMI IAID, applies a Top-Quartile eligibility rule, computes the aggregates, and writes one precomputed R2 document. The page reads that single document server-side (real HTML for crawlers, no client-fetch needed for the free content) and renders a Pro-gated table via a small client component.

**Tech Stack:** Next.js App Router (server + client components), R2 (Cloudflare) for all storage, cheerio for HTML parsing, no new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-09-pms-preferred-strategies-design.md`

## Global Constraints

- Work directly on `main`, no feature branches. Commit automatically once each task is verified — never push without being asked. Never add a Claude/AI signature to any commit.
- No test framework anywhere in this repo. Verify scripts via a live run against real R2 data; verify the page via `npm run build` + a manual browser check. The one thing that gets an isolated offline self-test is pure, no-network logic (`isPreferred()` and the 4 aggregate-tally functions) — mirror `scripts/sync_pms_factsheets.js`'s own `--self-test` CLI-flag convention exactly.
- **Critical constraint discovered during planning, not in the spec:** `lib/pmsDetailsCache.js`, `lib/pmsPeriodHistoryCache.js`, `lib/pmsQuartileCache.js`, and `lib/apmiProviderMap.js` all contain internal `@/lib/...` aliased imports. That alias (`"@/*": ["./*"]` in `jsconfig.json`) is resolved only by Next.js's own bundler — plain `node script.js` has no mechanism to resolve it (verified: no `imports` field in `package.json`, no loader flags, no `@` symlink in `node_modules`). Importing any of those four files from a standalone script throws `ERR_MODULE_NOT_FOUND` at load time, even for a single named export. Only `lib/r2.js` and `lib/pmsScrapers.js` are alias-free (verified via `grep "^import"` on both) and safely importable via a relative dynamic `import()`, the same mechanism `scripts/sync_pms_factsheets.js` already uses for `lib/r2.js`. Task 2 below reimplements the thin R2-caching wrappers those four files provide, built only on `lib/r2.js` + `lib/pmsScrapers.js` + `cheerio`, reusing the exact same R2 cache key namespaces so the new script's cache reads/writes stay shared with the live app's own caches (a strategy visited via `/pms/[id]` is often already warm; anything the script fetches is warm for the next live visitor too).
- `strategyName` inside `getPmsDetailsCached()`'s (and its standalone reimplementation's) return value confusingly holds APMI's broad category ("Equity", "Debt", …), not the product's identity — that's `iaName`/`productName`. Never rename this field; it's relied on elsewhere in the app exactly as-is.
- The 35 tracked strategies are all Equity category — only `pms-cache/pms-equity-*.json` needs scanning for IAID resolution.

---

### Task 1: Pure eligibility + aggregate logic in `scripts/compute_preferred_pms.js`

**Files:**
- Create: `scripts/compute_preferred_pms.js`

**Interfaces:**
- Produces: `isPreferred(quartileRows)` → `boolean`. `tallyMostHeldStock(strategies)` → `{name, count, strategies}|null`. `tallyTopSector(strategies)` → `{sector, totalWeightPct, strategies}|null`. `findBestAlpha(strategies)` → `{strategyName, providerName, alphaPct}|null`. `findBestSharpe(strategies)` → `{strategyName, providerName, sharpeRatio}|null`. Each `strategies` input element here is shaped `{ providerName, strategyName, extracted, performance }` (the shape Task 4's orchestration will build; `performance` is `{ia:{year1},benchmark:{year1}}|null`, `extracted` is the same shape already in `pms-factsheets.json`).
- Consumes: nothing from other tasks — this is the pure-logic foundation everything else builds on.

- [ ] **Step 1: Write the file with `isPreferred()` and the self-test scaffold**

```js
/**
 * scripts/compute_preferred_pms.js
 *
 * Computes the curated "Abundance Preferred" PMS strategy list: strategies
 * from scripts/sync_pms_factsheets.js's extracted set that are Top Quartile
 * vs APMI peers, plus cross-strategy insights only possible because this
 * app holds all of them together (most-held stock, top aggregate sector,
 * best alpha, best Sharpe). See docs/superpowers/specs/2026-09-09-pms-preferred-strategies-design.md.
 *
 * Run as an added step in .github/workflows/pms-factsheets-sync.yml right
 * after scripts/sync_pms_factsheets.js, so it always sees that run's fresh
 * pms-factsheets.json. Also runnable manually:
 *   node --env-file=.env.local scripts/compute_preferred_pms.js [--dry-run]
 *   node scripts/compute_preferred_pms.js --self-test
 */

const DRY_RUN = process.argv.includes('--dry-run');
const R2_KEY = 'pms-preferred-strategies.json';

// ── Step 4 of the spec: Top-Quartile eligibility rule ───────────────────────
// quartileRows: [{ period, label, peers, iaTwrr, benchmark, quartile }], the
// exact shape scripts/lib/apmiStandalone.js's getPmsQuartileStandalone()
// (Task 2) returns -- label values "1 Year".."10 Years", quartile is the
// exact string "Top Quartile" or null (no real peer data for that period
// yet). 3-Year is authoritative when the strategy has real data for it,
// even if every other period happens to be Top Quartile; a strategy too
// young for 3-Year data falls back to majority-of-available-periods.
function isPreferred(quartileRows) {
  const rows = quartileRows || [];
  const threeYear = rows.find((r) => r.label === '3 Years');
  if (threeYear && threeYear.quartile != null) {
    return threeYear.quartile === 'Top Quartile';
  }
  const withData = rows.filter((r) => r.quartile != null);
  if (withData.length === 0) return false; // nothing to judge on -- excluded, never guessed
  const topCount = withData.filter((r) => r.quartile === 'Top Quartile').length;
  return topCount >= Math.ceil(withData.length / 2);
}

module.exports = { isPreferred };

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  }
}

function selfTest() {
  const assert = require('assert');
  assert.strictEqual(
    isPreferred([
      { label: '1 Year', quartile: 'Top Quartile' },
      { label: '3 Years', quartile: 'Top Quartile' },
      { label: '5 Years', quartile: null },
    ]),
    true,
    '3-Year real data, Top Quartile -> passes'
  );
  assert.strictEqual(
    isPreferred([
      { label: '1 Year', quartile: 'Top Quartile' },
      { label: '2 Years', quartile: 'Top Quartile' },
      { label: '3 Years', quartile: 'Second Quartile' },
      { label: '5 Years', quartile: 'Top Quartile' },
    ]),
    false,
    '3-Year real data but NOT Top Quartile -> fails even though every other period is'
  );
  assert.strictEqual(
    isPreferred([
      { label: '1 Year', quartile: 'Top Quartile' },
      { label: '2 Years', quartile: 'Top Quartile' },
      { label: '3 Years', quartile: null },
    ]),
    true,
    'No 3-Year data, Top Quartile in 2 of 2 available -> passes (majority)'
  );
  assert.strictEqual(
    isPreferred([
      { label: '1 Year', quartile: 'Second Quartile' },
      { label: '2 Years', quartile: 'Top Quartile' },
      { label: '3 Years', quartile: null },
    ]),
    false,
    'No 3-Year data, Top Quartile in only 1 of 2 available -> fails (not majority)'
  );
  assert.strictEqual(
    isPreferred([
      { label: '1 Year', quartile: null },
      { label: '3 Years', quartile: null },
    ]),
    false,
    'Zero periods with real data -> fails, never guessed'
  );
  console.log('[compute_preferred_pms] Self-test: isPreferred ALL PASSED');
}
```

- [ ] **Step 2: Run it to verify the self-test passes**

Run: `node scripts/compute_preferred_pms.js --self-test`
Expected: `[compute_preferred_pms] Self-test: isPreferred ALL PASSED`

- [ ] **Step 3: Add the 4 aggregate-tally functions and their self-test cases**

Add above `module.exports`:

```js
// ── Step 5 of the spec: cross-strategy aggregates, over the qualifying
// set only. Each `strategies` element: { providerName, strategyName,
// extracted, performance }. A strategy missing the field a given
// aggregate needs is skipped for THAT aggregate only -- never treated as
// zero, never disqualifies it from the other 3 aggregates or from the
// main list.

function tallyMostHeldStock(strategies) {
  const counts = new Map(); // name -> { count, strategies: Set }
  for (const s of strategies) {
    const holdings = s.extracted?.topHoldings;
    if (!Array.isArray(holdings)) continue;
    const seenInThisStrategy = new Set();
    for (const h of holdings) {
      if (!h?.name || seenInThisStrategy.has(h.name)) continue;
      seenInThisStrategy.add(h.name);
      const entry = counts.get(h.name) || { count: 0, strategies: new Set() };
      entry.count += 1;
      entry.strategies.add(s.strategyName);
      counts.set(h.name, entry);
    }
  }
  if (counts.size === 0) return null;
  const sorted = [...counts.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  const [name, { count, strategies: strategySet }] = sorted[0];
  return { name, count, strategies: [...strategySet] };
}

function tallyTopSector(strategies) {
  const totals = new Map(); // sector -> { total, strategies: Set }
  for (const s of strategies) {
    const sectors = s.extracted?.sectorAllocation;
    if (!Array.isArray(sectors)) continue;
    for (const row of sectors) {
      if (!row?.sector || row.weightPct == null) continue;
      const entry = totals.get(row.sector) || { total: 0, strategies: new Set() };
      entry.total += row.weightPct;
      entry.strategies.add(s.strategyName);
      totals.set(row.sector, entry);
    }
  }
  if (totals.size === 0) return null;
  const sorted = [...totals.entries()].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]));
  const [sector, { total, strategies: strategySet }] = sorted[0];
  return { sector, totalWeightPct: Math.round(total * 100) / 100, strategies: [...strategySet] };
}

function findBestAlpha(strategies) {
  let best = null;
  for (const s of strategies) {
    const iaYear1 = s.performance?.ia?.year1;
    const bmYear1 = s.performance?.benchmark?.year1;
    if (iaYear1 == null || bmYear1 == null) continue;
    const alphaPct = iaYear1 - bmYear1;
    if (!best || alphaPct > best.alphaPct) {
      best = { strategyName: s.strategyName, providerName: s.providerName, alphaPct: Math.round(alphaPct * 100) / 100 };
    }
  }
  return best;
}

function findBestSharpe(strategies) {
  let best = null;
  for (const s of strategies) {
    const sharpe = s.extracted?.portfolioAttributes?.sharpeRatio?.strategy;
    if (sharpe == null) continue;
    if (!best || sharpe > best.sharpeRatio) {
      best = { strategyName: s.strategyName, providerName: s.providerName, sharpeRatio: sharpe };
    }
  }
  return best;
}
```

Update `module.exports` to:

```js
module.exports = { isPreferred, tallyMostHeldStock, tallyTopSector, findBestAlpha, findBestSharpe };
```

Add to `selfTest()`, before the closing `console.log`:

```js
  const fixtureStrategies = [
    {
      providerName: 'Provider A', strategyName: 'Strategy A',
      extracted: {
        topHoldings: [{ name: 'Reliance Industries Ltd', weightPct: 8 }, { name: 'HDFC Bank Ltd', weightPct: 6 }],
        sectorAllocation: [{ sector: 'Financials', weightPct: 30 }, { sector: 'Energy', weightPct: 10 }],
        portfolioAttributes: { sharpeRatio: { strategy: 0.9, benchmark: 0.5 } },
      },
      performance: { ia: { year1: 20 }, benchmark: { year1: 10 } },
    },
    {
      providerName: 'Provider B', strategyName: 'Strategy B',
      extracted: {
        topHoldings: [{ name: 'Reliance Industries Ltd', weightPct: 5 }],
        sectorAllocation: [{ sector: 'Financials', weightPct: 25 }],
        portfolioAttributes: { sharpeRatio: null }, // deliberately missing -- must not break the tally
      },
      performance: null, // deliberately missing -- must not break the tally
    },
  ];
  const mostHeld = tallyMostHeldStock(fixtureStrategies);
  assert.strictEqual(mostHeld.name, 'Reliance Industries Ltd');
  assert.strictEqual(mostHeld.count, 2);
  const topSector = tallyTopSector(fixtureStrategies);
  assert.strictEqual(topSector.sector, 'Financials');
  assert.strictEqual(topSector.totalWeightPct, 55);
  const bestAlpha = findBestAlpha(fixtureStrategies);
  assert.strictEqual(bestAlpha.strategyName, 'Strategy A'); // Strategy B skipped, no performance data
  assert.strictEqual(bestAlpha.alphaPct, 10);
  const bestSharpe = findBestSharpe(fixtureStrategies);
  assert.strictEqual(bestSharpe.strategyName, 'Strategy A'); // Strategy B skipped, sharpeRatio null
  assert.strictEqual(bestSharpe.sharpeRatio, 0.9);
```

Change the final `console.log` line to: `console.log('[compute_preferred_pms] Self-test: ALL PASSED');`

- [ ] **Step 4: Run the self-test again to verify everything passes**

Run: `node scripts/compute_preferred_pms.js --self-test`
Expected: `[compute_preferred_pms] Self-test: ALL PASSED`

- [ ] **Step 5: Commit**

```bash
git add scripts/compute_preferred_pms.js
git commit -m "feat(pms-preferred): pure eligibility rule and aggregate-tally functions"
```

---

### Task 2: Standalone APMI access helpers (`scripts/lib/apmiStandalone.js`)

**Why this task exists:** see the Global Constraints section above — `lib/pmsDetailsCache.js`, `lib/pmsPeriodHistoryCache.js`, `lib/pmsQuartileCache.js`, and `lib/apmiProviderMap.js` cannot be imported from a plain Node script. This file reimplements just enough of their logic, built only on `lib/r2.js` + `lib/pmsScrapers.js` (both alias-free) + `cheerio`, reusing the exact same R2 cache key namespaces those four files already use.

**Files:**
- Create: `scripts/lib/apmiStandalone.js`

**Interfaces:**
- Produces: `getPmsDetailsStandalone(iaid, {r2Get, r2Put, fetchPmsDetails})` → `Promise<object|null>` (same shape `getPmsDetailsCached` returns: `{providerName, strategyName, iaName, ...}`). `getLatestMonthSnapshotStandalone(iaid, {r2Get, fetchPmsMonthSnapshot})` → `Promise<{asOnMonth, ia, benchmark}|null>`. `getPmsQuartileStandalone(iaid, providerName, strategy, year, month, {r2Get, r2Put})` → `Promise<Array<{period,label,peers,iaTwrr,benchmark,quartile}>|null>`.
- Consumes: nothing from other tasks. `r2Get`/`r2Put` (from a dynamic `import('../../lib/r2.js')` the caller performs) and `fetchPmsDetails`/`fetchPmsMonthSnapshot` (from a dynamic `import('../../lib/pmsScrapers.js')` the caller performs) are passed in as parameters, not imported internally — keeps this file pure CommonJS with zero ESM interop of its own.

- [ ] **Step 1: Write the file**

```js
/**
 * scripts/lib/apmiStandalone.js
 *
 * Standalone (no Next.js `@/` path alias needed) equivalents of
 * lib/pmsDetailsCache.js, lib/pmsPeriodHistoryCache.js,
 * lib/pmsQuartileCache.js, and lib/apmiProviderMap.js -- see
 * scripts/compute_preferred_pms.js's Global Constraints comment for why
 * those four files can't be imported from a plain Node script.
 *
 * Reuses the EXACT SAME R2 cache key namespaces those four files write to
 * (pms-details-cache/, pms-period-history-cache/, pms-quartile-cache/,
 * pms-provider-map/) so this script's reads/writes stay shared with the
 * live app's own runtime caches -- a strategy already visited via
 * /pms/[id] is often already warm here, and anything this script fetches
 * warms the cache for the next live visitor too.
 *
 * r2Get/r2Put and fetchPmsDetails/fetchPmsMonthSnapshot are passed in by
 * the caller (which already dynamically imported lib/r2.js and
 * lib/pmsScrapers.js -- both alias-free, safe to import directly) rather
 * than imported here, so this file stays plain CommonJS.
 */

const cheerio = require('cheerio');

const DETAILS_TTL_MS = 90 * 24 * 60 * 60 * 1000;  // matches lib/pmsDetailsCache.js
const PROVIDER_MAP_TTL_MS = 90 * 24 * 60 * 60 * 1000; // matches lib/apmiProviderMap.js
const QUARTILE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // matches lib/pmsQuartileCache.js

// ── PMS details (fees, AUM, iaName, providerName, strategyName-as-category) ─
async function getPmsDetailsStandalone(iaid, { r2Get, r2Put, fetchPmsDetails }) {
  const key = `pms-details-cache/${iaid}.json`;
  try {
    const cached = await r2Get(key);
    if (cached?.ts && Date.now() - cached.ts < DETAILS_TTL_MS) return cached.data;
  } catch (err) {
    console.warn(`[apmiStandalone] R2 read failed for ${key}: ${err.message}`);
  }
  const data = await fetchPmsDetails(iaid);
  if (data) {
    try {
      await r2Put(key, JSON.stringify({ data, ts: Date.now() }));
    } catch (err) {
      console.warn(`[apmiStandalone] R2 write failed for ${key}: ${err.message}`);
    }
  }
  return data;
}

// ── Latest month's IA-vs-benchmark snapshot (for the "best alpha" insight
// and for identifying which year/month to ask the quartile endpoint about).
// Deliberately does NOT do lib/pmsPeriodHistoryCache.js's full ~40-month
// backfill -- only one snapshot is needed here, and writing a partial
// series into that cache key would corrupt it for the live app (which
// expects the FULL history back to EARLIEST_YEAR/EARLIEST_MONTH). Reads
// that same cache key opportunistically (usually a hit, zero live APMI
// traffic); only live-fetches (without persisting to that key) when cold.
async function getLatestMonthSnapshotStandalone(iaid, { r2Get, fetchPmsMonthSnapshot }) {
  try {
    const cached = await r2Get(`pms-period-history-cache/${iaid}.json`);
    if (cached?.data?.length > 0) return cached.data[cached.data.length - 1];
  } catch (err) {
    console.warn(`[apmiStandalone] R2 read failed for period-history/${iaid}: ${err.message}`);
  }
  const now = new Date();
  for (let back = 0; back < 4; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    try {
      const snap = await fetchPmsMonthSnapshot(iaid, d.getFullYear(), d.getMonth() + 1);
      if (snap) return snap;
    } catch (err) {
      // No data published for this month yet -- keep walking back.
    }
  }
  return null;
}

// ── Provider display name -> APMI's numeric pmsProvider ID ─────────────────
function normalizeProviderName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseProviderMap(html) {
  const selectMatch = html.match(/<select[^>]*id="pmsProvideNames"[\s\S]*?<\/select>/i);
  if (!selectMatch) throw new Error('pmsProvideNames select not found in APMI response');
  const optionRe = /<option\s+value="(\d+)"[^>]*>([^<]*)<\/option>/g;
  const map = {};
  let m;
  while ((m = optionRe.exec(selectMatch[0]))) {
    const id = Number(m[1]);
    const name = m[2].trim();
    if (id && name) map[normalizeProviderName(name)] = id;
  }
  return map;
}

async function getApmiProviderIdStandalone(providerName, { r2Get, r2Put }) {
  const key = 'pms-provider-map/map.json';
  let map = null;
  try {
    const cached = await r2Get(key);
    if (cached?.ts && Date.now() - cached.ts < PROVIDER_MAP_TTL_MS) map = cached.map;
  } catch (err) {
    console.warn(`[apmiStandalone] R2 read failed for provider map: ${err.message}`);
  }
  if (!map) {
    const res = await fetch('https://www.apmiindia.org/apmi/WSIAConsolidateReport.htm?action=showReportMenu', {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.apmiindia.org/' },
    });
    if (!res.ok) throw new Error(`APMI provider map responded ${res.status}`);
    map = parseProviderMap(await res.text());
    try {
      await r2Put(key, JSON.stringify({ map, ts: Date.now() }));
    } catch (err) {
      console.warn(`[apmiStandalone] R2 write failed for provider map: ${err.message}`);
    }
  }
  return map[normalizeProviderName(providerName)] ?? null;
}

// ── Quartile table for one IAID/strategy-category/year/month ───────────────
function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function parseQuartileTable(html) {
  // Bare <tbody> fragment -- must wrap in <table> or cheerio silently
  // drops the <tr>/<td> elements (HTML5 "foster parenting"). Same fix as
  // lib/pmsQuartileCache.js's own parseQuartileTable.
  const $ = cheerio.load(`<table>${html}</table>`);
  const rows = [];
  $('tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 8) return;
    const periodText = $(tds[0]).text().replace(/\s+/g, ' ').trim();
    const num = parseInt(periodText, 10);
    if (!num) return;
    const asNum = (i) => {
      const t = $(tds[i]).text().trim();
      return t === 'NA' || t === '' ? null : parseFloat(t);
    };
    const quartileText = $(tds[4]).text().trim();
    rows.push({
      period: `${num}Y`,
      label: periodText,
      peers: asNum(1),
      iaTwrr: asNum(2),
      benchmark: asNum(3),
      quartile: quartileText === 'NA' || quartileText === '' ? null : quartileText,
    });
  });
  return rows;
}

async function getPmsQuartileStandalone(iaid, providerName, strategy, year, month, { r2Get, r2Put }) {
  const providerId = await getApmiProviderIdStandalone(providerName, { r2Get, r2Put });
  if (!providerId) return null;

  const key = `pms-quartile-cache/${iaid}-${strategy.toLowerCase().replace(/\s+/g, '-')}-${year}-${String(month).padStart(2, '0')}.json`;
  try {
    const cached = await r2Get(key);
    if (cached?.ts && Date.now() - cached.ts < QUARTILE_TTL_MS) return cached.data;
  } catch (err) {
    console.warn(`[apmiStandalone] R2 read failed for ${key}: ${err.message}`);
  }

  const asOnDate = `${year}-${month}-${lastDayOfMonth(year, month)}`;
  const params = new URLSearchParams();
  params.append('strategy', strategy);
  params.append('pmsProvider', String(providerId));
  params.append('iaName', String(iaid));
  params.append('fromMonth', String(month).padStart(2, '0'));
  params.append('fromYears', String(year));
  params.append('asOnDate', asOnDate);

  const res = await fetch('https://www.apmiindia.org/apmi/WSIAConsolidateReport.htm?action=getWebsiteConsolidateReport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.apmiindia.org/' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`APMI quartile responded ${res.status}`);
  const data = parseQuartileTable(await res.text());
  try {
    await r2Put(key, JSON.stringify({ data, ts: Date.now() }));
  } catch (err) {
    console.warn(`[apmiStandalone] R2 write failed for ${key}: ${err.message}`);
  }
  return data;
}

module.exports = {
  getPmsDetailsStandalone,
  getLatestMonthSnapshotStandalone,
  getApmiProviderIdStandalone,
  getPmsQuartileStandalone,
  parseProviderMap,
  parseQuartileTable,
};
```

- [ ] **Step 2: Verify live against a real, known-good IAID**

Sundaram's SISOP strategy (IAID 324, providerName "Sundaram Alternate Assets Limited", category "Equity") was verified live earlier this session. Run:

```bash
node --env-file=.env.local -e "
(async () => {
  const { r2Get, r2Put } = await import('./lib/r2.js');
  const { fetchPmsDetails, fetchPmsMonthSnapshot } = await import('./lib/pmsScrapers.js');
  const { getPmsDetailsStandalone, getLatestMonthSnapshotStandalone, getPmsQuartileStandalone } = require('./scripts/lib/apmiStandalone.js');

  const details = await getPmsDetailsStandalone(324, { r2Get, r2Put, fetchPmsDetails });
  console.log('details.iaName:', details?.iaName, '| providerName:', details?.providerName, '| strategyName (category):', details?.strategyName);

  const snap = await getLatestMonthSnapshotStandalone(324, { r2Get, fetchPmsMonthSnapshot });
  console.log('latest snapshot asOnMonth:', snap?.asOnMonth, '| ia.year1:', snap?.ia?.year1, '| benchmark.year1:', snap?.benchmark?.year1);

  if (snap) {
    const [abbr, yearStr] = snap.asOnMonth.split('-');
    const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const year = parseInt(yearStr, 10);
    const month = MONTH_ABBR.indexOf(abbr) + 1;
    const quartile = await getPmsQuartileStandalone(324, details.providerName, details.strategyName || 'Equity', year, month, { r2Get, r2Put });
    console.log('quartile rows:', JSON.stringify(quartile, null, 2));
  }
})();
"
```

Expected: `details.iaName` reads something containing "SISOP", `providerName` contains "Sundaram", a real `asOnMonth` and non-null `year1` figures print, and `quartile rows` prints an array of `{period,label,peers,iaTwrr,benchmark,quartile}` objects with at least the "1 Year" row populated (a strategy this established should have real data for most periods).

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/apmiStandalone.js
git commit -m "feat(pms-preferred): standalone APMI access helpers for scripts (no @/ alias needed)"
```

---

### Task 3: IAID resolution — `scripts/compute_preferred_pms.js`

**Files:**
- Modify: `scripts/compute_preferred_pms.js` (append to the file built in Task 1)

**Interfaces:**
- Consumes: `PROVIDERS` (from `require('./sync_pms_factsheets.js').PROVIDERS`, shape `[{key, displayName, matchFragments, fetch}]`, already exported by the existing file).
- Produces: `resolveIaid(candidate, leaderboardRows)` → `number|null`, where `candidate` is `{providerKey, strategyName}` and `leaderboardRows` is the array read from `pms-cache/pms-equity-{YYYY}-{MM}.json` (`[{id, portfolioManager, strategyName, apmiLink, ...}]`). Also produces `loadLatestLeaderboard(r2Get)` → `Promise<Array|null>`, the month-walk-back reader.

- [ ] **Step 1: Add the significantWords/STOPWORDS matcher, self-contained (not imported from `lib/pmsFactsheetsCache.js` — see the spec's explicit "keep the two files decoupled" reasoning)**

Add above `module.exports` in `scripts/compute_preferred_pms.js`:

```js
// ── Step 2 of the spec: resolve each factsheet-extracted candidate to its
// real APMI IAID. Same significantWords-overlap scoring as
// lib/pmsFactsheetsCache.js's getFactsheetDataForStrategy(), run in the
// REVERSE direction (given a factsheet's own strategyName as the
// candidate, score it against each leaderboard row's strategyName as the
// target) -- reimplemented here rather than imported, matching this
// session's own precedent of keeping matching helpers self-contained per
// file rather than shared across files.
const STOPWORDS = new Set([
  'pvt', 'ltd', 'llp', 'limited', 'private', 'asset', 'assets', 'management', 'advisors', 'advisor',
  'managers', 'manager', 'investment', 'investments', 'services', 'financial', 'capital',
  'strategy', 'strategies', 'portfolio', 'portfolios', 'fund', 'funds', 'pms', 'scheme', 'approach',
  'the', 'and', 'of',
]);

function significantWords(str) {
  return (str || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// Resolves ONE candidate ({ providerKey, strategyName }) to an IAID number,
// or null if no leaderboard row scores above 0 (never guessed).
// `matchFragments` comes from sync_pms_factsheets.js's PROVIDERS entry for
// this candidate's providerKey.
function resolveIaid(candidate, leaderboardRows, matchFragments) {
  const providerRows = leaderboardRows.filter((row) => {
    const name = (row.portfolioManager || '').toLowerCase();
    return matchFragments.some((f) => name.includes(f.toLowerCase()));
  });

  const candidateWords = significantWords(candidate.strategyName);
  if (candidateWords.length === 0 || providerRows.length === 0) return null;

  let best = null;
  let bestScore = 0;
  for (const row of providerRows) {
    const targetWords = new Set(significantWords(row.strategyName));
    const matched = candidateWords.filter((w) => targetWords.has(w)).length;
    const score = matched / candidateWords.length;
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  if (!best || bestScore === 0) return null;

  try {
    const url = new URL(best.apmiLink);
    const iaid = url.searchParams.get('IAID');
    return iaid ? Number(iaid) : null;
  } catch {
    return null;
  }
}

// Loads the freshest available pms-cache/pms-equity-{YYYY}-{MM}.json,
// walking backward up to 3 months if the current month's key doesn't
// exist yet (the leaderboard scrape and the factsheet sync don't
// necessarily refresh on identical days).
async function loadLatestLeaderboard(r2Get) {
  const now = new Date();
  for (let back = 0; back <= 3; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const key = `pms-cache/pms-equity-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.json`;
    try {
      const payload = await r2Get(key);
      const rows = payload?.data;
      if (Array.isArray(rows) && rows.length > 0) {
        console.log(`[compute_preferred_pms] Using leaderboard cache: ${key} (${rows.length} rows)`);
        return rows;
      }
    } catch (err) {
      console.warn(`[compute_preferred_pms] R2 read failed for ${key}: ${err.message}`);
    }
  }
  return null;
}
```

Update `module.exports` to also include `resolveIaid` and `loadLatestLeaderboard`:

```js
module.exports = { isPreferred, tallyMostHeldStock, tallyTopSector, findBestAlpha, findBestSharpe, resolveIaid, loadLatestLeaderboard };
```

- [ ] **Step 2: Verify live against real R2 data**

```bash
node --env-file=.env.local -e "
(async () => {
  const { r2Get } = await import('./lib/r2.js');
  const { PROVIDERS } = require('./scripts/sync_pms_factsheets.js');
  const { resolveIaid, loadLatestLeaderboard } = require('./scripts/compute_preferred_pms.js');

  const leaderboard = await loadLatestLeaderboard(r2Get);
  console.log('leaderboard rows:', leaderboard?.length);

  const sundaram = PROVIDERS.find((p) => p.key === 'sundaram');
  const iaid = resolveIaid({ providerKey: 'sundaram', strategyName: 'SISOP' }, leaderboard, sundaram.matchFragments);
  console.log('SISOP resolved IAID (expect 324):', iaid);

  const green = PROVIDERS.find((p) => p.key === 'greenlantern');
  const iaid2 = resolveIaid({ providerKey: 'greenlantern', strategyName: 'GLC Growth Fund' }, leaderboard, green.matchFragments);
  console.log('GLC Growth Fund resolved IAID (expect 317):', iaid2);
})();
"
```

Expected: `SISOP resolved IAID (expect 324): 324` and `GLC Growth Fund resolved IAID (expect 317): 317` — both were directly verified live earlier this session (see the session's provider-addition work), so these are real known-good values to check against, not assumptions.

- [ ] **Step 3: Commit**

```bash
git add scripts/compute_preferred_pms.js
git commit -m "feat(pms-preferred): IAID resolution via leaderboard scan + fuzzy match"
```

---

### Task 4: Full orchestration — write the real R2 document

**Files:**
- Modify: `scripts/compute_preferred_pms.js` (append `run()` and the CLI entrypoint)

**Interfaces:**
- Consumes: everything from Tasks 1–3 (already in this same file), plus `PROVIDERS` from `require('./sync_pms_factsheets.js')`, plus `getPmsDetailsStandalone`/`getLatestMonthSnapshotStandalone`/`getPmsQuartileStandalone` from `require('./lib/apmiStandalone.js')` (Task 2), plus `backupThenPut` from `require('./lib/r2SyncSafety')` (already exists in the repo).
- Produces: writes R2 key `pms-preferred-strategies.json` in the exact shape from the spec's Step 6.

- [ ] **Step 1: Add `run()` and the CLI entrypoint**

Add near the top of `scripts/compute_preferred_pms.js` (after the existing `DRY_RUN`/`R2_KEY` constants):

```js
const { backupThenPut } = require('./lib/r2SyncSafety');
const { PROVIDERS } = require('./sync_pms_factsheets.js');
const { getPmsDetailsStandalone, getLatestMonthSnapshotStandalone, getPmsQuartileStandalone } = require('./lib/apmiStandalone.js');
```

Add before `module.exports` (after the Task 1–3 functions):

```js
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function parseAsOnMonth(asOnMonth) {
  const [abbr, yearStr] = asOnMonth.split('-');
  return { year: parseInt(yearStr, 10), month: MONTH_ABBR.indexOf(abbr) + 1 };
}

async function run() {
  console.log('=== Computing PMS Preferred Strategies ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active]');

  const { r2Get, r2Put } = await import('../lib/r2.js');
  const { fetchPmsDetails, fetchPmsMonthSnapshot } = await import('../lib/pmsScrapers.js');
  const deps = { r2Get, r2Put, fetchPmsDetails, fetchPmsMonthSnapshot };

  // Step 1 -- load candidates from pms-factsheets.json.
  const factsheets = await r2Get('pms-factsheets.json');
  if (!factsheets?.providers) {
    console.error('[compute_preferred_pms] pms-factsheets.json missing or empty -- aborting.');
    process.exit(1);
  }
  const candidates = [];
  for (const [providerKey, info] of Object.entries(factsheets.providers)) {
    for (const doc of info.documents || []) {
      if (doc.docType === 'factsheet' && doc.extracted) {
        candidates.push({ providerKey, providerDisplayName: info.displayName, strategyName: doc.strategyName, extracted: doc.extracted });
      }
    }
  }
  console.log(`[compute_preferred_pms] ${candidates.length} candidates with extracted data.`);

  // Step 2 -- resolve IAIDs.
  const leaderboard = await loadLatestLeaderboard(r2Get);
  if (!leaderboard) {
    console.error('[compute_preferred_pms] No leaderboard cache found in the last 4 months -- aborting.');
    process.exit(1);
  }
  const resolved = [];
  for (const c of candidates) {
    const provider = PROVIDERS.find((p) => p.key === c.providerKey);
    if (!provider) continue;
    const iaid = resolveIaid({ providerKey: c.providerKey, strategyName: c.strategyName }, leaderboard, provider.matchFragments);
    if (!iaid) {
      console.warn(`[compute_preferred_pms] Could not resolve IAID for ${c.providerDisplayName} / ${c.strategyName} -- excluded.`);
      continue;
    }
    resolved.push({ ...c, iaid });
  }
  console.log(`[compute_preferred_pms] ${resolved.length} of ${candidates.length} candidates resolved to an IAID.`);

  // Step 3 -- pull quartile eligibility (and the latest performance
  // snapshot, reused later for the "best alpha" insight).
  const qualifying = [];
  for (const c of resolved) {
    let details, snapshot, quartile;
    try {
      details = await getPmsDetailsStandalone(c.iaid, deps);
      if (!details) throw new Error('no details returned');
      snapshot = await getLatestMonthSnapshotStandalone(c.iaid, deps);
      if (snapshot) {
        const { year, month } = parseAsOnMonth(snapshot.asOnMonth);
        quartile = await getPmsQuartileStandalone(c.iaid, details.providerName, details.strategyName || 'Equity', year, month, deps);
      }
    } catch (err) {
      console.warn(`[compute_preferred_pms] Failed to pull quartile data for IAID ${c.iaid} (${c.strategyName}): ${err.message}`);
      continue;
    }
    if (!quartile || !isPreferred(quartile)) continue;

    const threeYear = quartile.find((r) => r.label === '3 Years' && r.quartile != null);
    const qualifyingRow = threeYear || [...quartile].reverse().find((r) => r.quartile === 'Top Quartile');

    qualifying.push({
      iaid: c.iaid,
      providerKey: c.providerKey,
      providerName: details.providerName,
      strategyName: c.strategyName,
      category: details.strategyName || 'Equity',
      aumCr: details.aumCr ?? null,
      qualifyingPeriod: qualifyingRow?.label ?? null,
      quartile: qualifyingRow?.quartile ?? null,
      extracted: c.extracted,
      performance: snapshot ? { ia: snapshot.ia, benchmark: snapshot.benchmark } : null,
    });
    console.log(`[compute_preferred_pms] Qualifies: ${c.providerDisplayName} / ${c.strategyName} (${qualifyingRow?.label}, ${qualifyingRow?.quartile})`);
  }
  console.log(`[compute_preferred_pms] ${qualifying.length} strategies qualify.`);

  // Step 5 -- cross-strategy aggregates, over the qualifying set only.
  const insights = {
    mostHeldStock: tallyMostHeldStock(qualifying),
    topSector: tallyTopSector(qualifying),
    bestAlpha: findBestAlpha(qualifying),
    bestSharpe: findBestSharpe(qualifying),
  };

  // Step 6 -- write the result.
  const result = {
    computedAt: new Date().toISOString(),
    criteria: {
      quartilePeriodPrimary: '3 Years',
      fallbackRule: 'Top Quartile in at least half of periods with real peer data, when 3-Year data isn\'t available yet',
    },
    strategies: qualifying.map(({ providerKey, iaid, providerName, strategyName, category, aumCr, qualifyingPeriod, quartile, extracted }) => ({
      iaid, providerKey, providerName, strategyName, category, aumCr, qualifyingPeriod, quartile, extracted,
    })),
    insights,
  };

  if (!DRY_RUN) {
    const existing = await r2Get(R2_KEY).catch(() => null);
    await backupThenPut(r2Put, R2_KEY, existing, JSON.stringify(result));
    console.log(`[compute_preferred_pms] Successfully wrote to R2 (${R2_KEY}).`);
  } else {
    console.log('[compute_preferred_pms] Dry run -- not writing to R2. Result:', JSON.stringify(result, null, 2).slice(0, 2000));
  }
}
```

At the very bottom of the file, replace the existing `if (require.main === module) { ... }` block with:

```js
if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    run().catch((err) => {
      console.error('[compute_preferred_pms] Fatal error:', err);
      process.exit(1);
    });
  }
}
```

- [ ] **Step 2: Run it live for real (NOT dry-run — the spec calls for a real write, verified against real output)**

Run: `node --env-file=.env.local scripts/compute_preferred_pms.js`

Expected: logs showing candidate count, resolved count, each qualifying strategy with its period/quartile, final qualifying count, and `Successfully wrote to R2 (pms-preferred-strategies.json).` A qualifying count of 0 is a *plausible* real outcome (not necessarily a bug) — if that happens, read the warning/skip logs to distinguish "genuinely nobody qualifies this month" from "IAID resolution or quartile fetching broke," per the spec's Error Handling section.

- [ ] **Step 3: Read back the real written document to confirm the shape**

```bash
node --env-file=.env.local -e "
(async () => {
  const { r2Get } = await import('./lib/r2.js');
  const doc = await r2Get('pms-preferred-strategies.json');
  console.log('computedAt:', doc.computedAt);
  console.log('strategies count:', doc.strategies.length);
  console.log('insights:', JSON.stringify(doc.insights, null, 2));
  console.log('first strategy:', JSON.stringify(doc.strategies[0], null, 2));
})();
"
```

Expected: real, sensible values throughout — no `undefined`, no `null` where the spec's shape calls for a value, `strategies[0].extracted` matches the same shape already familiar from `pms-factsheets.json`.

- [ ] **Step 4: Commit**

```bash
git add scripts/compute_preferred_pms.js
git commit -m "feat(pms-preferred): full orchestration -- writes pms-preferred-strategies.json"
```

---

### Task 5: Read-side cache — `lib/pmsPreferredCache.js`

**Files:**
- Create: `lib/pmsPreferredCache.js`

**Interfaces:**
- Produces: `getPreferredStrategies()` → `Promise<{computedAt, criteria, strategies, insights}|null>` — `null` only when the R2 document has genuinely never been written (see Task 4).

- [ ] **Step 1: Write the file**

```js
/**
 * lib/pmsPreferredCache.js
 *
 * Read side for scripts/compute_preferred_pms.js's R2 document -- see
 * docs/superpowers/specs/2026-09-09-pms-preferred-strategies-design.md.
 * Same createR2JsonCache pattern as lib/pmsFactsheetsCache.js and
 * lib/nfoData.js. 24h TTL: the underlying doc only changes once a month
 * via the script, but a short TTL means a manual re-run during testing is
 * picked up promptly rather than waiting out a long cache.
 */

import { createR2JsonCache } from './r2JsonCache.js';

const getPmsPreferredCached = createR2JsonCache('pms-preferred-strategies.json', 24 * 60 * 60 * 1000);

/**
 * @returns {Promise<{computedAt: string, criteria: object, strategies: Array<object>, insights: object}|null>}
 *   null only when the script has genuinely never run / written successfully
 *   -- callers must render a "coming soon" state for that case, never a 404.
 */
export async function getPreferredStrategies() {
  return getPmsPreferredCached();
}
```

- [ ] **Step 2: Verify it reads back the real document Task 4 wrote**

```bash
node --env-file=.env.local -e "
(async () => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  const { getPreferredStrategies } = await import('./lib/pmsPreferredCache.js');
  const doc = await getPreferredStrategies();
  console.log('strategies count:', doc?.strategies?.length);
})();
"
```

Expected: the same count Task 4's Step 3 showed.

- [ ] **Step 3: Commit**

```bash
git add lib/pmsPreferredCache.js
git commit -m "feat(pms-preferred): read-side cache for the precomputed strategy list"
```

---

### Task 6: Sitemap entry — `lib/metadata.js`

**Files:**
- Modify: `lib/metadata.js` (`PAGE_META` object, around the existing `'pms-screener'` entry)

**Interfaces:**
- Produces: `PAGE_META['pms-preferred']`, picked up automatically by `app/sitemap.js`'s existing `getSitemapEntries()` — no other file needs to change for the sitemap itself.

- [ ] **Step 1: Add the entry**

In `lib/metadata.js`, inside the `PAGE_META` object, add (near the `'pms-screener'` entry, same structure):

```js
  'pms-preferred': {
    title: 'Abundance Preferred PMS Strategies — Top Quartile Portfolios | Abundance',
    description: 'PMS strategies that are Top Quartile vs APMI peers, with real extracted holdings, sector allocation and fundamentals. Curated by disclosed, factual criteria -- not investment advice. By Abundance Financial Services, APRN04279.',
    keywords: 'best PMS India, top quartile PMS, PMS strategies comparison, APMI top rated PMS, portfolio management services India, PMS holdings sector allocation, Abundance Financial Services PMS',
    path: '/pms-preferred',
    ogImage: '/og-pms-screener.png',
    changefreq: 'monthly',
    priority: 0.85,
  },
```

Note: this entry's `title`/`description` are for the sitemap and as a fallback only — the actual `<title>`/`<meta description>` tags come from `app/pms-preferred/page.jsx`'s own `generateMetadata()` (Task 7), which builds them from the real, current qualifying-strategy count (more accurate than this static text). `changefreq: 'monthly'` matches the script's real update cadence.

- [ ] **Step 2: Verify the sitemap picks it up**

Run: `npm run build` then start the server and check, or simpler — verify the function directly:

```bash
node -e "
process.env.NEXT_PUBLIC_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || '';
" 2>/dev/null
grep -A2 "'pms-preferred'" lib/metadata.js
```

Expected: the entry is present with `path: '/pms-preferred'`. (Full sitemap rendering is verified end-to-end in Task 7's build check, once the page itself exists — `getSitemapEntries()` only reads `PAGE_META`, it doesn't require the route to exist yet.)

- [ ] **Step 3: Commit**

```bash
git add lib/metadata.js
git commit -m "feat(pms-preferred): add sitemap entry for /pms-preferred"
```

---

### Task 7: The page — `app/pms-preferred/page.jsx`, `PmsPreferredTable.jsx`, `pms-preferred.css`, `app/api/pms-preferred/route.js`

**Files:**
- Create: `app/api/pms-preferred/route.js`
- Create: `app/pms-preferred/page.jsx`
- Create: `app/pms-preferred/PmsPreferredTable.jsx`
- Create: `app/pms-preferred/pms-preferred.css`

**Interfaces:**
- Consumes: `getPreferredStrategies()` (Task 5), `getPMSLogo` (from `@/lib/providerLogos`, existing), `auth` (from `@/auth`, existing), `getUserPlan` (from `@/lib/plan`, existing).
- Produces: the live `/pms-preferred` route; `GET /api/pms-preferred` returning `{ isPro: boolean }`.

**Design note (deliberate deviation from how `/pms/[id]`'s client component works, in service of the spec's explicit SEO requirement):** `/pms/[id]`'s `PMSDetailClient.jsx` fetches ALL its data client-side via `useEffect`, because that page's Pro/free split starts from the very first byte (the API route itself returns a smaller payload to non-Pro callers). Here, the free content (grid + insights) is identical for every visitor regardless of plan — there's nothing to gate in it — so `page.jsx` is an **async Server Component** that fetches `getPreferredStrategies()` and renders the free grid/insights directly as real server-rendered HTML (crawlable with zero client JS), and only the genuinely-Pro-gated interactive table is a separate client component that checks `isPro` via the new tiny API route.

- [ ] **Step 1: The isPro API route**

```js
/**
 * app/api/pms-preferred/route.js
 *
 * GET /api/pms-preferred
 * Tells the client whether to render the Pro-gated sortable table on
 * /pms-preferred. The free grid/insights content is identical for every
 * visitor and is rendered server-side in app/pms-preferred/page.jsx
 * directly -- this route exists ONLY for the Pro/free boolean, same
 * composite isPro check as app/api/pms-detail/[id]/route.js.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserPlan } from '@/lib/plan';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  const isPro = Boolean(
    session?.user?.role === 'admin' ||
    session?.user?.plan === 'pro' ||
    session?.user?.plan === 'pro_lifetime' ||
    session?.user?.plan === 'lifetime' ||
    session?.user?.isPro ||
    (session?.user?.id && (await getUserPlan(session.user.id)) === 'pro')
  );
  return NextResponse.json({ isPro });
}
```

- [ ] **Step 2: The page (server component, free content)**

```jsx
/**
 * app/pms-preferred/page.jsx
 *
 * See app/pms-preferred/PmsPreferredTable.jsx's header comment for why
 * this page is a server component rendering the free content directly
 * (SEO requirement -- see docs/superpowers/specs/2026-09-09-pms-preferred-strategies-design.md).
 */

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getPreferredStrategies } from '@/lib/pmsPreferredCache';
import { getPMSLogo } from '@/lib/providerLogos';
import PmsPreferredTable from './PmsPreferredTable';
import './pms-preferred.css';

export const dynamic = 'force-dynamic';

const SITE = 'https://mfcalc.getabundance.in';
const PAGE_URL = `${SITE}/pms-preferred`;

export async function generateMetadata() {
  const doc = await getPreferredStrategies().catch(() => null);
  const count = doc?.strategies?.length ?? 0;
  const title = `${count} Abundance Preferred PMS Strategies — Top Quartile Portfolios | Abundance`;
  const description = count > 0
    ? `${count} PMS strategies currently Top Quartile vs APMI peers, with real extracted holdings, sector allocation and fundamentals vs benchmark. Curated by disclosed, factual criteria -- not investment advice. By Abundance Financial Services, APRN04279.`
    : `PMS strategies that are Top Quartile vs APMI peers, with real extracted holdings, sector allocation and fundamentals. By Abundance Financial Services, APRN04279.`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'ItemList',
        name: 'Abundance Preferred PMS Strategies',
        description,
        url: PAGE_URL,
        numberOfItems: count,
        itemListElement: (doc?.strategies || []).map((s, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          name: `${s.strategyName} by ${s.providerName}`,
          url: `${SITE}/pms/${s.iaid}`,
        })),
      },
    ],
  };

  return {
    title,
    description,
    alternates: { canonical: PAGE_URL },
    openGraph: { title, description, type: 'website', url: PAGE_URL },
    twitter: { card: 'summary_large_image', title, description },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
    other: { 'script:ld+json': JSON.stringify(jsonLd) },
  };
}

export default async function PmsPreferredPage() {
  const doc = await getPreferredStrategies().catch(() => null);
  const strategies = doc?.strategies || [];
  const insights = doc?.insights || null;

  return (
    <>
      <Navbar />
      <main className="pmspref-main">
        <h1 className="pmspref-title">Abundance Preferred PMS Strategies</h1>
        <p className="pmspref-intro">
          Strategies here are Top Quartile against their APMI peer group over 3 years
          (or, for strategies too new to have 3 years of peer data yet, Top Quartile
          in at least half of the periods they do have real data for). This is a
          disclosed, factual, automatically-recomputed rule, not a personal
          recommendation.
        </p>

        {!doc && (
          <p className="pmspref-empty">This list is being computed — check back soon.</p>
        )}

        {doc && strategies.length === 0 && (
          <p className="pmspref-empty">No strategies currently meet this bar. Check back next month.</p>
        )}

        {insights && strategies.length > 0 && (
          <section className="pmspref-insights">
            <h2 className="pmspref-section-title">This Month's Insights</h2>
            <div className="pmspref-insights-grid">
              {insights.mostHeldStock && (
                <div className="pmspref-insight-card">
                  <div className="pmspref-insight-label">Most-Held Stock</div>
                  <div className="pmspref-insight-value">{insights.mostHeldStock.name}</div>
                  <div className="pmspref-insight-sub">Held by {insights.mostHeldStock.count} of {strategies.length} preferred strategies</div>
                </div>
              )}
              {insights.topSector && (
                <div className="pmspref-insight-card">
                  <div className="pmspref-insight-label">Top Aggregate Sector Conviction</div>
                  <div className="pmspref-insight-value">{insights.topSector.sector}</div>
                  <div className="pmspref-insight-sub">{insights.topSector.totalWeightPct}% combined weight across {insights.topSector.strategies.length} strategies</div>
                </div>
              )}
              {insights.bestAlpha && (
                <div className="pmspref-insight-card">
                  <div className="pmspref-insight-label">Best 1-Year Alpha</div>
                  <div className="pmspref-insight-value">+{insights.bestAlpha.alphaPct}pp</div>
                  <div className="pmspref-insight-sub">{insights.bestAlpha.strategyName} ({insights.bestAlpha.providerName})</div>
                </div>
              )}
              {insights.bestSharpe && (
                <div className="pmspref-insight-card">
                  <div className="pmspref-insight-label">Best Sharpe Ratio</div>
                  <div className="pmspref-insight-value">{insights.bestSharpe.sharpeRatio}</div>
                  <div className="pmspref-insight-sub">{insights.bestSharpe.strategyName} ({insights.bestSharpe.providerName})</div>
                </div>
              )}
            </div>
          </section>
        )}

        {strategies.length > 0 && (
          <section className="pmspref-grid-section">
            <h2 className="pmspref-section-title">{strategies.length} Preferred Strategies</h2>
            <div className="pmspref-grid">
              {strategies.map((s) => (
                <a key={s.iaid} href={`/pms/${s.iaid}`} className="pmspref-card">
                  <div className="pmspref-card-head">
                    {getPMSLogo(s.providerName) && (
                      <img src={getPMSLogo(s.providerName)} alt="" className="pmspref-card-logo" />
                    )}
                    <span className="pmspref-card-category">{s.category}</span>
                  </div>
                  <div className="pmspref-card-name">{s.strategyName}</div>
                  <div className="pmspref-card-provider">{s.providerName}</div>
                  <div className="pmspref-card-stats">
                    {s.aumCr != null && <span>AUM ₹{s.aumCr} Cr</span>}
                    {s.qualifyingPeriod && <span className="pmspref-card-badge">{s.qualifyingPeriod} {s.quartile}</span>}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

        {strategies.length > 0 && <PmsPreferredTable strategies={strategies} />}

        <div className="pmspref-disclosure">
          Data sourced from APMI India (Association of Portfolio Managers in India).
          Min PMS investment ₹50L per SEBI. Past performance is not indicative of future results.
          This is not investment advice. Abundance Financial Services — Atin Kumar Agrawal · ARN-251838 · APRN04279 · APMI Registered PMS Distributor.
        </div>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 3: The Pro-gated client table**

```jsx
'use client';
/**
 * app/pms-preferred/PmsPreferredTable.jsx
 *
 * The ONLY client-rendered piece of /pms-preferred -- everything else on
 * the page (the free grid + insights) is server-rendered directly in
 * page.jsx for SEO (crawlers see real HTML with zero client JS needed).
 * This component exists purely to gate the sortable/filterable table
 * behind Pro: it checks /api/pms-preferred for isPro on mount and renders
 * nothing at all for non-Pro visitors (including crawlers, which never
 * run this effect) -- deliberately NOT server-rendered, since it's the
 * one piece of this page that's genuinely tier-gated.
 */

import { useState, useEffect, useMemo } from 'react';

const SORT_COLUMNS = [
  { key: 'strategyName', label: 'Strategy' },
  { key: 'providerName', label: 'Provider' },
  { key: 'category', label: 'Category' },
  { key: 'aumCr', label: 'AUM (₹ Cr)' },
  { key: 'qualifyingPeriod', label: 'Quartile Period' },
];

export default function PmsPreferredTable({ strategies }) {
  const [isPro, setIsPro] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sortKey, setSortKey] = useState('aumCr');
  const [sortDir, setSortDir] = useState('desc');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/pms-preferred')
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setIsPro(Boolean(data?.isPro)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const categories = useMemo(() => [...new Set(strategies.map((s) => s.category))].sort(), [strategies]);

  const rows = useMemo(() => {
    let filtered = categoryFilter ? strategies.filter((s) => s.category === categoryFilter) : strategies;
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [strategies, categoryFilter, sortKey, sortDir]);

  if (!loaded) return null; // avoid a flash of the upsell before we know

  if (!isPro) {
    return (
      <section className="pmspref-table-section pmspref-table-locked">
        <h2 className="pmspref-section-title">Sortable & Filterable Table</h2>
        <p className="pmspref-locked-msg">
          Sort and filter the full preferred list by AUM, category and quartile period with{' '}
          <a href="/pricing">Abundance Pro</a>.
        </p>
      </section>
    );
  }

  return (
    <section className="pmspref-table-section">
      <h2 className="pmspref-section-title">Sortable & Filterable Table</h2>
      <div className="pmspref-table-controls">
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="pmspref-table-wrap">
        <table className="pmspref-table">
          <thead>
            <tr>
              {SORT_COLUMNS.map((col) => (
                <th key={col.key} onClick={() => {
                  if (sortKey === col.key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                  else { setSortKey(col.key); setSortDir('desc'); }
                }}>
                  {col.label}{sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.iaid}>
                <td><a href={`/pms/${s.iaid}`}>{s.strategyName}</a></td>
                <td>{s.providerName}</td>
                <td>{s.category}</td>
                <td>{s.aumCr != null ? `₹${s.aumCr} Cr` : '—'}</td>
                <td>{s.qualifyingPeriod ? `${s.qualifyingPeriod} · ${s.quartile}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Styles**

```css
/* app/pms-preferred/pms-preferred.css */
.pmspref-main { max-width: 1100px; margin: 0 auto; padding: 32px 20px 60px; }
.pmspref-title { font-size: 1.9rem; font-weight: 800; color: var(--text); margin-bottom: 8px; }
.pmspref-intro { color: var(--muted); font-size: .92rem; line-height: 1.6; max-width: 760px; margin-bottom: 28px; }
.pmspref-empty { color: var(--muted); font-size: .95rem; padding: 24px 0; }
.pmspref-section-title { font-size: 1.2rem; font-weight: 700; color: var(--text); margin: 32px 0 14px; }

.pmspref-insights-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
.pmspref-insight-card { background: var(--g-light); border: 1px solid var(--border); border-radius: 10px; padding: 16px; }
.pmspref-insight-label { font-size: .68rem; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); margin-bottom: 6px; }
.pmspref-insight-value { font-size: 1.15rem; font-weight: 800; color: var(--g1); margin-bottom: 4px; }
.pmspref-insight-sub { font-size: .76rem; color: var(--muted); }

.pmspref-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 14px; }
.pmspref-card { display: block; border: 1px solid var(--border); border-radius: 10px; padding: 16px; text-decoration: none; color: inherit; transition: border-color .15s; }
.pmspref-card:hover { border-color: var(--g1); }
.pmspref-card-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.pmspref-card-logo { height: 22px; width: auto; object-fit: contain; }
.pmspref-card-category { font-size: .68rem; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; }
.pmspref-card-name { font-size: 1.02rem; font-weight: 700; color: var(--text); }
.pmspref-card-provider { font-size: .8rem; color: var(--muted); margin-bottom: 10px; }
.pmspref-card-stats { display: flex; flex-wrap: wrap; gap: 8px; font-size: .74rem; color: var(--muted); }
.pmspref-card-badge { background: var(--g-light); border: 1px solid var(--border); border-radius: 4px; padding: 2px 7px; font-weight: 600; color: var(--g1); }

.pmspref-table-locked { background: var(--g-light); border: 1px dashed var(--border); border-radius: 10px; padding: 20px; }
.pmspref-locked-msg { color: var(--muted); font-size: .9rem; }
.pmspref-locked-msg a { color: var(--g1); font-weight: 600; }
.pmspref-table-controls { margin-bottom: 12px; }
.pmspref-table-wrap { overflow-x: auto; }
.pmspref-table { width: 100%; border-collapse: collapse; font-size: .84rem; }
.pmspref-table th { text-align: left; padding: 8px 10px; border-bottom: 2px solid var(--border); cursor: pointer; white-space: nowrap; color: var(--muted); font-weight: 600; }
.pmspref-table td { padding: 8px 10px; border-bottom: 1px solid var(--border); }
.pmspref-table a { color: var(--g1); text-decoration: none; font-weight: 600; }

.pmspref-disclosure { margin-top: 40px; padding-top: 16px; border-top: 1px solid var(--border); font-size: .72rem; color: var(--muted); line-height: 1.6; }
```

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: build succeeds, `/pms-preferred` appears in the route list, no type/import errors.

- [ ] **Step 6: Manual browser check**

Visit `/pms-preferred` locally (`npm run dev`, or against the deployed preview). Confirm: the intro/criteria/disclaimer render; if `pms-preferred-strategies.json` has real data, the insights + grid render with real strategy cards linking to `/pms/[id]`; the table section shows the Pro-upsell message when logged out, and (if you have a Pro/admin session) the real sortable table when logged in.

- [ ] **Step 7: Commit**

```bash
git add app/api/pms-preferred/route.js app/pms-preferred/page.jsx app/pms-preferred/PmsPreferredTable.jsx app/pms-preferred/pms-preferred.css
git commit -m "feat(pms-preferred): the /pms-preferred page -- free showcase + Pro-gated table"
```

---

### Task 8: Wire into the scheduled workflow

**Files:**
- Modify: `.github/workflows/pms-factsheets-sync.yml`

**Interfaces:**
- Consumes: nothing new — same 5 secrets already in the job's `env` block (4 R2 + `GEMINI_API_KEY`, the latter unused by this new step but harmless to have present).

- [ ] **Step 1: Add the second step**

In `.github/workflows/pms-factsheets-sync.yml`, after the existing `- name: Run PMS Factsheets Sync` step, add:

```yaml
      - name: Compute PMS Preferred Strategies
        env:
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
        run: node scripts/compute_preferred_pms.js
```

- [ ] **Step 2: Verify the workflow YAML is well-formed**

Run: `node -e "const yaml = require('fs').readFileSync('.github/workflows/pms-factsheets-sync.yml', 'utf8'); console.log(yaml.includes('Compute PMS Preferred Strategies') ? 'step present' : 'MISSING');"`
Expected: `step present`

(This workflow won't actually run again until the next scheduled 10th-of-the-month trigger, or a manual `workflow_dispatch` — Task 4's live run already proved the script itself works correctly against real R2 data with real credentials, so this step is a low-risk wiring change.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pms-factsheets-sync.yml
git commit -m "feat(pms-preferred): run compute_preferred_pms.js after the monthly factsheet sync"
```
