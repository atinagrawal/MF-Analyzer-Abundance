# SIF Screener Nightly Returns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the SIF section of the MF Screener real derived returns/risk metrics, a Columns selector, sortable columns, and return-based leader cards — matching the MF section — via a new nightly precompute pipeline, instead of computing returns live on every page load.

**Architecture:** A new standalone script `scripts/build-sif-screener.mjs` (self-contained, no imports from `app/`, matching `scripts/build-screener.mjs`'s own convention) fetches all ~31 SIF schemes and their NAV history directly from AMFI, derives returns/risk via adapted copies of the already-proven `app/screener/compareEngine.js` formulas, and writes to a new `sif_screener` Postgres table. A new `/api/sif-screener` route does a fast `SELECT`. The main SIF table in `app/screener/page.js` switches its data source to this new route and gains MF's exact Columns selector and sort behavior; leader cards rank by the longest return period at least 2 SIFs in that category actually have.

**Tech Stack:** Next.js 16 App Router, plain `pg` client, GitHub Actions (existing `screener.yml` workflow), no new dependencies.

## Global Constraints

- No cross-imports between `scripts/*.mjs` and `app/`/`lib/` — the `@/` path alias only resolves inside Next.js's own bundler; standalone scripts reimplement whatever pure logic they need. (Established convention, confirmed in `scripts/build-screener.mjs`.)
- IDCW/payout/reinvest/bonus/segregated plan variants are excluded via `/(idcw|payout|re-?invest|bonus|segregated)\b/i` tested against each scheme's `nav_name` — this is the SAME regex `scripts/build-screener.mjs` already applies to MF names, and the same one the client-side interim fix (commit `3d44813`) used.
- Return periods split sub-year (absolute % change) vs 1-year-or-more (CAGR) — matches `deriveReturnsFromSeries` exactly, including `ret_inception`'s own sub-year/1y+ split and its `ret_inception_annualized` method-tracking field.
- SIF NAV history fetches must try a wide 5-year window first, falling back to a 400-day window if AMFI rejects it (confirmed empirically: AMFI's `sif-nav-history` endpoint returns an error for a full 5-year-back request but accepts up to ~4.5 years) — matches `fetchNavSeries`'s existing resilience pattern exactly.
- `sif_screener` table schema matches `mf_screener`'s column set exactly (renamed `code`→`scheme_id`, `name`→`nav_name`, `amc`→`sif_name`; no `structure` column), plus one new column, `ret_inception_annualized BOOLEAN`, not present in `mf_screener`.
- Write pattern: `CREATE TABLE IF NOT EXISTS` + `DELETE` + chunked bulk `INSERT`, matching `mf_screener`'s exact pattern (not a safer upsert) — an intentional match to MF's own accepted trade-off, not a new risk.
- `/api/sif-nav` and `/api/sif-history` are NOT touched — they keep serving their other existing consumers (fund-detail drawer sparkline, comparison feature's on-demand fetch) unchanged.
- Leader-card ranking picks the longest period, from `['ret_3y','ret_1y','ret_6m','ret_3m','ret_1m']` in that order, where **at least 2** of that category's SIFs have data — computed independently per category.

---

### Task 1: SIF NAV parsing + return/risk derivation (pure functions)

**Files:**
- Create: `scripts/build-sif-screener.mjs` (this task only adds the top-of-file constants and pure functions below — no `main()`/network/DB code yet, that's Task 2)
- Test: `.superpowers/verify/build-sif-screener-math.mjs`

**Interfaces:**
- Consumes: nothing from other tasks (self-contained pure functions).
- Produces: `parseSifHistoryResponse(json)`, `deriveSifReturns(series, asOfMs)`, `deriveSifRisk(series)` — all exported for Task 2 to import (same file, plain `export function`).

- [ ] **Step 1: Create the file with parsing + derivation functions**

```js
/**
 * build-sif-screener.mjs — nightly SIF screener dataset builder.
 *
 * Runs on GitHub Actions, same job as build-screener.mjs (MF). SIF has no
 * bulk NAV-history endpoint like MF's DownloadNAVHistoryReport_Po.aspx, so
 * this fetches each scheme's history individually (only ~31 schemes today,
 * so this is fast) directly from AMFI's undocumented SIF APIs — the same
 * ones app/api/sif-nav/route.js and app/api/sif-history/route.js proxy for
 * the browser, called here directly since this script isn't a browser.
 *
 * Deliberately does NOT import from app/screener/compareEngine.js (or any
 * app/ code) — this codebase's standalone build scripts are self-contained
 * (see build-screener.mjs's own header comment), since the app's `@/` path
 * alias only resolves inside Next.js's bundler, not plain `node script.mjs`.
 * The return/risk math below is an adapted copy of
 * deriveReturnsFromSeries/deriveRiskFromSeries, not the same code — keep
 * them in sync by hand if either changes.
 *
 * Unlike MF, SIF has no pre-AMFI-era funds needing manual inception-date
 * overrides (every SIF was launched entirely within AMFI's current SIF
 * framework) — so there's no equivalent of mf_inception/mfapi.in lookups
 * here; age_years and inception both come directly from each scheme's own
 * first real NAV record.
 *
 * Env:
 *   POSTGRES_URL (optional) -> upsert into sif_screener
 */
import pg from 'pg';

const DAY_MS = 86400000;
const YEAR_MS = 365 * DAY_MS;
const AMFI_BASE = 'https://www.amfiindia.com/api';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; MFCalc/2.0)' };

// ── NAV history parsing ─────────────────────────────────────────────────────
// Raw AMFI sif-nav-history response shape (same one app/api/sif-history's
// route.js flattens for the browser): { data: { nav_groups: [{
// historical_records: [{ date: "YYYY-MM-DD", nav: "10.1234" }] }] } }, or
// { message: "..." } when there's nothing to display for the range.
export function parseSifHistoryResponse(json) {
  if (json?.message) return [];
  const records = json?.data?.nav_groups?.[0]?.historical_records ?? [];
  return records
    .map((r) => {
      const [y, m, d] = String(r.date).split('-').map(Number);
      return { t: Date.UTC(y, m - 1, d), nav: parseFloat(r.nav) };
    })
    .filter((r) => r.nav > 0 && isFinite(r.t))
    .sort((a, b) => a.t - b.t);
}

// ── Return derivation (adapted from compareEngine.js's deriveReturnsFromSeries) ──
const PERIOD_DAYS = {
  ret_1m: 30, ret_3m: 91, ret_6m: 182,
  ret_1y: 365, ret_3y: 365 * 3, ret_5y: 365 * 5, ret_7y: 365 * 7, ret_10y: 365 * 10,
};

export function deriveSifReturns(series, asOfMs) {
  const out = {};
  // last point with t <= asOfMs
  let latest = null;
  for (const p of series) { if (p.t <= asOfMs) latest = p; else break; }
  if (!latest) return out;
  const first = series[0];

  for (const [key, days] of Object.entries(PERIOD_DAYS)) {
    const targetT = asOfMs - days * DAY_MS;
    if (targetT < first.t) { out[key] = null; continue; }
    // first point with t >= targetT
    let past = null;
    for (const p of series) { if (p.t >= targetT) { past = p; break; } }
    if (!past || past.nav <= 0) { out[key] = null; continue; }
    const years = days / 365;
    out[key] = years <= 1
      ? +(((latest.nav - past.nav) / past.nav) * 100).toFixed(2)
      : +((Math.pow(latest.nav / past.nav, 1 / years) - 1) * 100).toFixed(2);
  }
  const inceptionYears = (latest.t - first.t) / YEAR_MS;
  out.ret_inception = first.nav > 0
    ? (inceptionYears <= 1
        ? +(((latest.nav - first.nav) / first.nav) * 100).toFixed(2)
        : +((Math.pow(latest.nav / first.nav, 1 / inceptionYears) - 1) * 100).toFixed(2))
    : null;
  out.ret_inception_annualized = first.nav > 0 ? inceptionYears > 1 : null;
  out.age_years = +((asOfMs - first.t) / YEAR_MS).toFixed(1);
  out.inception_date = new Date(first.t).toISOString().slice(0, 10);
  return out;
}

// ── Risk derivation (adapted from compareEngine.js's deriveRiskFromSeries) ──
export function deriveSifRisk(series) {
  if (!series || series.length < 2) return { vol: null, max_dd: null, ret_per_risk: null };

  const byMonth = new Map();
  for (const p of series) {
    const d = new Date(p.t);
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    byMonth.set(key, p);
  }
  const monthly = [...byMonth.values()].sort((a, b) => a.t - b.t);

  let vol = null;
  if (monthly.length >= 3) {
    const rets = [];
    for (let i = 1; i < monthly.length; i++) rets.push((monthly[i].nav - monthly[i - 1].nav) / monthly[i - 1].nav);
    const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
    const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length;
    vol = +(Math.sqrt(variance) * Math.sqrt(12) * 100).toFixed(2);
  }

  let peak = series[0].nav, maxDd = 0;
  for (const p of series) {
    if (p.nav > peak) peak = p.nav;
    const dd = ((p.nav - peak) / peak) * 100;
    if (dd < maxDd) maxDd = dd;
  }
  const max_dd = +maxDd.toFixed(2);

  const inception = deriveSifReturns(series, series[series.length - 1].t).ret_inception;
  const ret_per_risk = (inception != null && vol) ? +(inception / vol).toFixed(2) : null;

  return { vol, max_dd, ret_per_risk };
}
```

- [ ] **Step 2: Write the standalone verify script**

Create `.superpowers/verify/build-sif-screener-math.mjs`:

```js
import { parseSifHistoryResponse, deriveSifReturns, deriveSifRisk } from '../../scripts/build-sif-screener.mjs';

function assertEqual(actual, expected, label) {
  if (actual !== expected) { console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exitCode = 1; }
  else console.log(`PASS: ${label}`);
}
function assertClose(actual, expected, label, tol = 0.5) {
  if (actual == null || Math.abs(actual - expected) > tol) { console.error(`FAIL: ${label} — expected ~${expected}, got ${actual}`); process.exitCode = 1; }
  else console.log(`PASS: ${label}`);
}

// 1. parseSifHistoryResponse — flattens nav_groups, sorts ascending, parses YYYY-MM-DD
{
  const json = { data: { nav_groups: [{ historical_records: [
    { date: '2026-02-10', nav: '10.05' },
    { date: '2026-02-05', nav: '10.00' },
  ] }] } };
  const series = parseSifHistoryResponse(json);
  assertEqual(series.length, 2, 'parseSifHistoryResponse returns both records');
  assertEqual(series[0].t < series[1].t, true, 'parseSifHistoryResponse sorts ascending by date');
  assertEqual(series[0].nav, 10.00, 'parseSifHistoryResponse parses nav as a number');
}

// 2. parseSifHistoryResponse — "no records" message shape returns empty array
{
  const series = parseSifHistoryResponse({ message: 'No records to display' });
  assertEqual(series.length, 0, 'parseSifHistoryResponse handles the "no records" message shape');
}

// 3. deriveSifReturns — ~49-day-old fund: ret_inception is absolute change,
// not annualized (reproduces the exact production numbers from Altiva SIF)
{
  const asOf = Date.UTC(2026, 6, 29);
  const firstT = Date.UTC(2026, 5, 10);
  const series = [{ t: firstT, nav: 10.0000 }, { t: asOf, nav: 10.7542 }];
  const r = deriveSifReturns(series, asOf);
  assertClose(r.ret_inception, 7.54, 'ret_inception for a ~49-day-old fund is absolute change (~+7.5%)', 0.1);
  assertEqual(r.ret_inception_annualized, false, 'ret_inception_annualized is false for a sub-year fund');
}

// 4. deriveSifReturns — 3-year-old fund: ret_inception is CAGR-annualized
{
  const asOf = Date.UTC(2026, 0, 1);
  const firstT = Date.UTC(2023, 0, 1);
  const series = [{ t: firstT, nav: 100 }, { t: asOf, nav: 100 * Math.pow(1.10, 3) }];
  const r = deriveSifReturns(series, asOf);
  assertClose(r.ret_inception, 10, 'ret_inception for a 3-year-old fund is CAGR-annualized (~10%/yr)', 0.5);
  assertEqual(r.ret_inception_annualized, true, 'ret_inception_annualized is true for a 1yr+ fund');
}

// 5. deriveSifReturns — sub-year period (ret_6m) is absolute change, matching
// compareEngine.js's deriveReturnsFromSeries convention
{
  const asOf = Date.UTC(2025, 0, 1);
  const series = [];
  for (let m = 12; m >= 0; m--) {
    const d = new Date(asOf); d.setUTCMonth(d.getUTCMonth() - m);
    const growth = Math.pow(1.10, (12 - m) / 6);
    series.push({ t: d.getTime(), nav: 100 * growth });
  }
  const r = deriveSifReturns(series, asOf);
  assertClose(r.ret_6m, 10, 'ret_6m is absolute change (~10%), not annualized', 2);
}

// 6. deriveSifRisk — flat series has ~0 volatility and 0 drawdown
{
  const series = [];
  for (let m = 0; m < 12; m++) series.push({ t: Date.UTC(2024, m, 1), nav: 100 });
  const r = deriveSifRisk(series);
  assertClose(r.vol, 0, 'flat series volatility ~0', 0.5);
  assertEqual(r.max_dd, 0, 'flat series max drawdown is 0');
}

console.log('build-sif-screener math scenarios checked.');
```

Run: `node .superpowers/verify/build-sif-screener-math.mjs`
Expected: every line `PASS:`, exit code 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/build-sif-screener.mjs
git commit -m "feat(sif-screener): add SIF NAV parsing and return/risk derivation functions"
```

(`.superpowers/` is git-ignored — do not add the verify script.)

---

### Task 2: Build script data pipeline (fetch, orchestrate, write to Postgres)

**Files:**
- Modify: `scripts/build-sif-screener.mjs` (append `main()` and its helpers, after Task 1's functions)

**Interfaces:**
- Consumes: `parseSifHistoryResponse`, `deriveSifReturns`, `deriveSifRisk` (Task 1, same file).
- Produces: a runnable script (`node scripts/build-sif-screener.mjs`) that creates/populates the `sif_screener` table when `POSTGRES_URL` is set. Consumed by Task 3 (the workflow step) and Task 4 (the new API route reads this table).

- [ ] **Step 1: Append the scheme-list fetcher, IDCW filter, and NAV-history fetcher with fallback**

Append to `scripts/build-sif-screener.mjs`:

```js
// ── 1. Scheme list (mirrors app/api/sif-nav/route.js's fetchFromAMFI) ──────
async function fetchSchemeList() {
  const res = await fetch(`${AMFI_BASE}/sif-latest-nav`, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`AMFI SIF endpoint returned ${res.status}`);
  const data = await res.json();

  const schemes = [];
  for (const typeGroup of data.data ?? []) {
    for (const cat of typeGroup.categories ?? []) {
      for (const grp of cat.groups ?? []) {
        for (const s of grp.schemes ?? []) {
          if (/direct/i.test(s.NavName)) continue;
          schemes.push({
            sif_name: s.SIFName, scheme_id: s.Sd_Id, nav_name: s.NavName,
            category: s.category, nav: parseFloat(s.NetAssetValue), nav_date: s.Date,
          });
        }
      }
    }
  }
  return schemes;
}

// Same exclusion MF's build script already applies to its own scheme names
// (scripts/build-screener.mjs) -- IDCW/payout/reinvest/bonus/segregated
// plan variants are just a different distribution option on the same
// underlying scheme, not a distinct fund.
function excludeIdcw(schemes) {
  return schemes.filter((s) => !/(idcw|payout|re-?invest|bonus|segregated)\b/i.test(s.nav_name));
}

// ── 2. NAV history, wide-window-first with narrow fallback ─────────────────
// Same resilience pattern as compareEngine.js's fetchNavSeries: AMFI's
// sif-nav-history endpoint rejects a full 5-year-back request outright but
// accepts up to ~4.5 years -- try wide first (picks up a SIF's growing real
// history automatically as it ages), fall back to a safely-within-range
// window if AMFI rejects the wide one.
async function fetchSifHistory(schemeId, daysBack, toStr) {
  const fromStr = new Date(Date.now() - daysBack * DAY_MS).toISOString().slice(0, 10);
  const url = `${AMFI_BASE}/sif-nav-history?query_type=historical_period&from_date=${fromStr}&to_date=${toStr}&sd_id=${schemeId}`;
  const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return null;
  const json = await res.json();
  const series = parseSifHistoryResponse(json);
  return series.length >= 2 ? series : null;
}
async function fetchSifHistoryWithFallback(schemeId) {
  const toStr = new Date().toISOString().slice(0, 10);
  try {
    return (await fetchSifHistory(schemeId, 5 * 365, toStr)) || (await fetchSifHistory(schemeId, 400, toStr));
  } catch {
    try { return await fetchSifHistory(schemeId, 400, toStr); } catch { return null; }
  }
}

// Bounded concurrency -- same helper style as build-screener.mjs, keeps this
// polite to AMFI's endpoint even though the scheme count is small.
async function runConcurrent(items, fn, limit = 8) {
  const out = new Array(items.length);
  let idx = 0;
  async function worker() { while (idx < items.length) { const i = idx++; out[i] = await fn(items[i], i); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}
```

- [ ] **Step 2: Append `main()` — orchestration and Postgres write**

```js
async function main() {
  console.log('[sif-screener] fetching scheme list…');
  const all = await fetchSchemeList();
  const schemes = excludeIdcw(all);
  console.log(`[sif-screener] ${schemes.length} schemes after excluding IDCW/payout/reinvest/bonus/segregated (${all.length} total)`);

  console.log(`[sif-screener] fetching NAV history for ${schemes.length} schemes…`);
  let done = 0;
  const results = await runConcurrent(schemes, async (s) => {
    const series = await fetchSifHistoryWithFallback(s.scheme_id);
    process.stdout.write(`\r[sif-screener] history: ${++done}/${schemes.length}   `);
    return { scheme: s, series };
  }, 8);
  process.stdout.write('\n');

  const asOfMs = Date.now();
  const rows = results.map(({ scheme: s, series }) => {
    // Per-scheme isolation: a fetch/derivation failure for one scheme only
    // nulls that scheme's return/risk columns, never blocks the others.
    const returns = series ? deriveSifReturns(series, asOfMs) : {};
    const risk = series ? deriveSifRisk(series) : { vol: null, max_dd: null, ret_per_risk: null };
    return {
      scheme_id: s.scheme_id, nav_name: s.nav_name, sif_name: s.sif_name, category: s.category,
      nav: +s.nav.toFixed(4), nav_date: s.nav_date,
      ret_1m: returns.ret_1m ?? null, ret_3m: returns.ret_3m ?? null, ret_6m: returns.ret_6m ?? null,
      ret_1y: returns.ret_1y ?? null, ret_3y: returns.ret_3y ?? null, ret_5y: returns.ret_5y ?? null,
      ret_7y: returns.ret_7y ?? null, ret_10y: returns.ret_10y ?? null,
      vol: risk.vol, max_dd: risk.max_dd, ret_per_risk: risk.ret_per_risk,
      age_years: returns.age_years ?? null, inception_date: returns.inception_date ?? null,
      ret_inception: returns.ret_inception ?? null,
      ret_inception_annualized: returns.ret_inception_annualized ?? null,
      asof: new Date(asOfMs).toISOString().slice(0, 10),
    };
  });

  if (!process.env.POSTGRES_URL) {
    console.log(`[sif-screener] POSTGRES_URL not set, skipping DB write (${rows.length} rows computed)`);
    return;
  }

  const c = new pg.Client({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  await c.query(`CREATE TABLE IF NOT EXISTS sif_screener (
    scheme_id TEXT PRIMARY KEY, nav_name TEXT NOT NULL, sif_name TEXT, category TEXT,
    nav NUMERIC, nav_date TEXT,
    ret_1m NUMERIC, ret_3m NUMERIC, ret_6m NUMERIC,
    ret_1y NUMERIC, ret_3y NUMERIC, ret_5y NUMERIC, ret_7y NUMERIC, ret_10y NUMERIC,
    vol NUMERIC, max_dd NUMERIC, ret_per_risk NUMERIC, age_years NUMERIC,
    inception_date TEXT, ret_inception NUMERIC, ret_inception_annualized BOOLEAN,
    asof TEXT
  )`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_sif_screener_category ON sif_screener (category)`);

  const COLS = ['scheme_id','nav_name','sif_name','category','nav','nav_date','ret_1m','ret_3m','ret_6m','ret_1y','ret_3y','ret_5y','ret_7y','ret_10y','vol','max_dd','ret_per_risk','age_years','inception_date','ret_inception','ret_inception_annualized','asof'];
  const N = COLS.length;
  await c.query('BEGIN');
  await c.query('DELETE FROM sif_screener');
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400);
    const vals = [], ph = [];
    chunk.forEach((r, j) => {
      ph.push('(' + COLS.map((_, k) => `$${j * N + k + 1}`).join(',') + ')');
      COLS.forEach((col) => vals.push(r[col] ?? null));
    });
    await c.query(`INSERT INTO sif_screener (${COLS.join(',')}) VALUES ${ph.join(',')}`, vals);
  }
  await c.query('COMMIT');
  await c.end();
  console.log(`[sif-screener] upserted ${rows.length} rows into Postgres`);
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Manual dry-run against real scheme IDs (no DB write)**

Run (without `POSTGRES_URL` set, so it only computes and logs, per Step 2's early-return):

```bash
node scripts/build-sif-screener.mjs
```

Expected: logs fetching progress for the real ~31 schemes, ends with `[sif-screener] POSTGRES_URL not set, skipping DB write (N rows computed)` where N is close to 31. Check the console output doesn't show every scheme failing (a handful of nulls for very young schemes on some periods is expected and fine; ALL schemes returning completely empty rows would indicate a parsing bug — investigate before proceeding).

- [ ] **Step 4: Commit**

```bash
git add scripts/build-sif-screener.mjs
git commit -m "feat(sif-screener): add data pipeline orchestration and Postgres write"
```

---

### Task 3: Wire the new script into the existing scheduled workflow

**Files:**
- Modify: `.github/workflows/screener.yml`

**Interfaces:**
- Consumes: `scripts/build-sif-screener.mjs` (Task 2).
- Produces: nothing consumed by later tasks (the workflow just needs to run before Task 4's route can serve real data in production).

- [ ] **Step 1: Add a step after the existing MF build step**

Find the existing `- name: Build + upsert screener dataset` step in `.github/workflows/screener.yml`, and add a new step immediately after it (before the "Fetch + upsert monthly stress test data" step):

```yaml
      - name: Build + upsert SIF screener dataset
        env:
          POSTGRES_URL: ${{ secrets.POSTGRES_URL }}
        run: node scripts/build-sif-screener.mjs
```

The full `steps:` list should read, in order: checkout, setup-node, install deps, "Build + upsert screener dataset" (MF), "Build + upsert SIF screener dataset" (new), "Fetch + upsert monthly stress test data", the two upload-artifact steps. Same job, same `30 2 * * *` schedule, same `concurrency` group — no changes needed to those.

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/screener.yml
git commit -m "ci(sif-screener): run the new build script in the existing nightly screener workflow"
```

---

### Task 4: `/api/sif-screener` route

**Files:**
- Create: `app/api/sif-screener/route.js`

**Interfaces:**
- Consumes: the `sif_screener` table (Task 2).
- Produces: `GET /api/sif-screener` → `{ asof, count, schemes: [...] }`. Consumed by Task 5 (main SIF table's new data source).

- [ ] **Step 1: Create the route, mirroring `/api/screener`'s exact pattern**

```js
// app/api/sif-screener/route.js — fast read of the precomputed SIF dataset.
// The heavy compute runs nightly on GitHub Actions (scripts/build-sif-screener.mjs);
// this route just SELECTs, mirroring app/api/screener/route.js's exact pattern.

import pool from '@/lib/db';

export const revalidate = 21600;

const COLS = 'scheme_id,nav_name,sif_name,category,nav,nav_date,ret_1m,ret_3m,ret_6m,ret_1y,ret_3y,ret_5y,ret_7y,ret_10y,vol,max_dd,ret_per_risk,age_years,inception_date,ret_inception,ret_inception_annualized,asof';

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM sif_screener ORDER BY nav_name ASC`
    );
    const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));
    const schemes = rows.map((r) => ({
      scheme_id: r.scheme_id, nav_name: r.nav_name, sif_name: r.sif_name, category: r.category,
      nav: num(r.nav), nav_date: r.nav_date,
      ret_1m: num(r.ret_1m), ret_3m: num(r.ret_3m), ret_6m: num(r.ret_6m),
      ret_1y: num(r.ret_1y), ret_3y: num(r.ret_3y), ret_5y: num(r.ret_5y),
      ret_7y: num(r.ret_7y), ret_10y: num(r.ret_10y),
      vol: num(r.vol), max_dd: num(r.max_dd), ret_per_risk: num(r.ret_per_risk),
      age_years: num(r.age_years), inception_date: r.inception_date || null,
      ret_inception: num(r.ret_inception), ret_inception_annualized: r.ret_inception_annualized,
      asof: r.asof,
    }));
    const asof = schemes.length ? schemes[0].asof : null;
    return new Response(JSON.stringify({ asof, count: schemes.length, schemes }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400',
      },
    });
  } catch (e) {
    return Response.json(
      { error: 'sif screener data unavailable', detail: String(e.message || e), schemes: [] },
      { status: 503 }
    );
  }
}
```

- [ ] **Step 2: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add app/api/sif-screener/route.js
git commit -m "feat(sif-screener): add /api/sif-screener fast-read route"
```

---

### Task 5: Switch the main SIF table's data source

**Files:**
- Modify: `app/screener/page.js`

**Interfaces:**
- Consumes: `/api/sif-screener` (Task 4).
- Produces: `sifSchemes` now carries the new return/risk fields (`ret_1m` etc.) for Tasks 6-7 to render.

- [ ] **Step 1: Replace the SIF data-fetch effect**

Find (around line 227-236):

```js
  useEffect(() => {
    if (isSIF && !sifData && !sifLoading) {
      setSifLoading(true);
      fetch('/api/sif-nav')
        .then((r) => r.json())
        .then((d) => { if (d.error) setErr(d.error); else setSifData(d); })
        .catch(() => setErr('Could not load SIF data.'))
        .finally(() => setSifLoading(false));
    }
  }, [isSIF, sifData, sifLoading]);
```

Replace with:

```js
  useEffect(() => {
    if (isSIF && !sifData && !sifLoading) {
      setSifLoading(true);
      fetch('/api/sif-screener')
        .then((r) => r.json())
        .then((d) => { if (d.error) setErr(d.error); else setSifData(d); })
        .catch(() => setErr('Could not load SIF data.'))
        .finally(() => setSifLoading(false));
    }
  }, [isSIF, sifData, sifLoading]);
```

- [ ] **Step 2: Replace `sifSchemes` — the new route's response is already keyed `schemes`, and already excludes IDCW at build time, so the client-side filter is no longer needed**

Find (around line 241-251):

```js
  /* ---- SIF derived state ---- */
  // Same exclusion MFs already get server-side (scripts/build-screener.mjs)
  // -- IDCW/payout/reinvest/bonus/segregated plan variants are just a
  // different distribution option on the same underlying scheme, not a
  // distinct fund; showing both clutters the list with near-duplicates.
  // SIF data is live-fetched (no build pipeline), so this filter runs
  // client-side instead.
  const sifSchemes = useMemo(
    () => (sifData?.schemes || []).filter((s) => !/(idcw|payout|re-?invest|bonus|segregated)\b/i.test(s.nav_name)),
    [sifData]
  );
```

Replace with:

```js
  /* ---- SIF derived state ---- */
  // IDCW/payout/reinvest/bonus/segregated variants are already excluded
  // server-side by scripts/build-sif-screener.mjs (same regex MF's own
  // build script applies) -- no client-side filtering needed.
  const sifSchemes = sifData?.schemes || [];
```

- [ ] **Step 3: Update the eyebrow copy to match MF's phrasing**

Find (around line 340):

```js
          <div className="page-eyebrow"><span className="live-dot" /><span className="page-eyebrow-text">{isSIF ? 'Live · from AMFI SIF NAV API' : 'Live · rebuilt daily from AMFI NAVs'}</span></div>
```

Replace with:

```js
          <div className="page-eyebrow"><span className="live-dot" /><span className="page-eyebrow-text">Live · rebuilt daily from AMFI NAVs</span></div>
```

(Both branches now say the same thing, so the ternary collapses to a single string.)

- [ ] **Step 4: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add app/screener/page.js
git commit -m "feat(sif-screener): switch main SIF table to the nightly-precomputed /api/sif-screener source"
```

---

### Task 6: SIF Columns selector + return/risk columns in the table

**Files:**
- Modify: `app/screener/page.js`

**Interfaces:**
- Consumes: `METRICS`, `DEFAULT_COLS`, `fmtCell`, `cellCls`, `cols`, `toggleCol` (all already exist, MF-only today).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Show the Columns bar for SIF too**

Find (around line 386-392):

```js
        {!isSIF && (
          <div className="scr-colbar">
            <span className="scr-colbar-l">Columns:</span>
            {METRICS.map((m) => (
              <button key={m.key} className={`scr-colchip ${cols.includes(m.key) ? 'on' : ''}`} onClick={() => toggleCol(m.key)}>{m.label}</button>
            ))}
          </div>
        )}
```

Replace with:

```js
        <div className="scr-colbar">
          <span className="scr-colbar-l">Columns:</span>
          {METRICS.map((m) => (
            <button key={m.key} className={`scr-colchip ${cols.includes(m.key) ? 'on' : ''}`} onClick={() => toggleCol(m.key)}>{m.label}</button>
          ))}
        </div>
```

(`cols`/`toggleCol` are shared page-level state, already used by the MF table — both tables now read the same selection, which is fine since a user picking columns while looking at one table would reasonably expect the same columns when they switch to the other.)

- [ ] **Step 2: Add the same NAV column definition SIF already renders manually into `METRICS`-driven rendering**

The SIF table currently renders NAV as its own hardcoded column (`<td><b>₹{s.nav.toFixed(4)}</b></td>`), separate from the `visibleCols`/`METRICS` mechanism MF uses. Find the SIF table header (around line 460-467):

```js
                <thead>
                  <tr>
                    <th style={{ width: 32, textAlign: 'center', color: 'var(--muted)', fontSize: '.65rem' }} title="Add to compare (max 3)">⚖</th>
                    <th className="scr-name-h">Fund</th>
                    <th className={`scr-sortable ${sifSort.key === 'category' ? 'active' : ''}`} style={{textAlign:'left'}} onClick={() => setSifSortKey('category')}>Strategy{sifSort.key === 'category' ? <span className="scr-arrow">{sifSort.dir < 0 ? '▾' : '▴'}</span> : ''}</th>
                    <th className={`scr-sortable ${sifSort.key === 'sif_name' ? 'active' : ''}`} style={{textAlign:'left'}} onClick={() => setSifSortKey('sif_name')}>Fund House{sifSort.key === 'sif_name' ? <span className="scr-arrow">{sifSort.dir < 0 ? '▾' : '▴'}</span> : ''}</th>
                    <th className={`scr-sortable ${sifSort.key === 'nav' ? 'active' : ''}`} onClick={() => setSifSortKey('nav')}>NAV{sifSort.key === 'nav' ? <span className="scr-arrow">{sifSort.dir < 0 ? '▾' : '▴'}</span> : ''}</th>
                    <th>NAV Date</th>
                  </tr>
                </thead>
```

Replace with (drops the hardcoded NAV/NAV Date columns in favor of `visibleCols`, matching MF's table exactly — NAV is already in `METRICS` and `DEFAULT_COLS`, so it still shows by default):

```js
                <thead>
                  <tr>
                    <th style={{ width: 32, textAlign: 'center', color: 'var(--muted)', fontSize: '.65rem' }} title="Add to compare (max 3)">⚖</th>
                    <th className="scr-name-h">Fund</th>
                    <th className={`scr-sortable ${sifSort.key === 'category' ? 'active' : ''}`} style={{textAlign:'left'}} onClick={() => setSifSortKey('category')}>Strategy{sifSort.key === 'category' ? <span className="scr-arrow">{sifSort.dir < 0 ? '▾' : '▴'}</span> : ''}</th>
                    <th className={`scr-sortable ${sifSort.key === 'sif_name' ? 'active' : ''}`} style={{textAlign:'left'}} onClick={() => setSifSortKey('sif_name')}>Fund House{sifSort.key === 'sif_name' ? <span className="scr-arrow">{sifSort.dir < 0 ? '▾' : '▴'}</span> : ''}</th>
                    {visibleCols.map((m) => (
                      <th key={m.key} className={`scr-sortable ${sifSort.key === m.key ? 'active' : ''}`} onClick={() => setSifSortKey(m.key)}>
                        {m.label}{sifSort.key === m.key ? <span className="scr-arrow">{sifSort.dir < 0 ? '▾' : '▴'}</span> : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
```

- [ ] **Step 3: Replace the SIF row's hardcoded NAV/NAV Date cells with `visibleCols`-driven cells**

Find (around line 499-504):

```js
                        <td style={{textAlign:'left'}}>
                          <span className={`scr-sif-badge scr-sif-badge-${fam.toLowerCase()}`}>{sifStratShort(s.category)}</span>
                        </td>
                        <td style={{textAlign:'left',color:'var(--text2)',fontSize:'12px',fontWeight:600}}>{s.sif_name}</td>
                        <td><b>₹{s.nav.toFixed(4)}</b></td>
                        <td className="scr-muted" style={{fontSize:'11px'}}>{s.nav_date}</td>
                      </tr>
```

Replace with:

```js
                        <td style={{textAlign:'left'}}>
                          <span className={`scr-sif-badge scr-sif-badge-${fam.toLowerCase()}`}>{sifStratShort(s.category)}</span>
                        </td>
                        <td style={{textAlign:'left',color:'var(--text2)',fontSize:'12px',fontWeight:600}}>{s.sif_name}</td>
                        {visibleCols.map((m) => (
                          <td key={m.key} className={cellCls(m, s[m.key])}>{m.kind === 'ratio' ? <b>{fmtCell(m, s[m.key])}</b> : fmtCell(m, s[m.key])}</td>
                        ))}
                      </tr>
```

(`s.nav_date` is dropped as its own column — it's still visible via the "as of {nav_date}" line already shown in `.scr-meta` above the table, matching how MF's table doesn't show a per-row date column either.)

- [ ] **Step 4: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add app/screener/page.js
git commit -m "feat(sif-screener): add Columns selector and sortable return/risk columns to the SIF table"
```

---

### Task 7: Leader cards — rank by longest available period with ≥2 comparable SIFs per category

**Files:**
- Modify: `app/screener/page.js`

**Interfaces:**
- Consumes: `sifSchemes` (now carrying real return fields, from Task 5).
- Produces: nothing new consumed by later tasks (final content task before verification).

- [ ] **Step 1: Add the period-fallback list and per-category picker**

Find the `sifStratShort`/`sifFamily` helpers near the top of the file (around line 31-32) and add after them:

```js
// Longest-duration-first list of periods leader cards will try per category
// -- same list and "needs >=2 comparable funds" rule already used by the
// comparison feature's category peer-rank (app/screener/compareEngine.js's
// RANK_PERIOD_FALLBACK/pickCommonRankPeriod), applied here per-category
// instead of per-comparison-set: a category with older funds might rank by
// 1Y while an all-brand-new category ranks by 1M, shifting automatically
// as SIFs age with no future code changes needed.
const LEADER_PERIOD_FALLBACK = [
  { key: 'ret_3y', label: '3Y' },
  { key: 'ret_1y', label: '1Y' },
  { key: 'ret_6m', label: '6M' },
  { key: 'ret_3m', label: '3M' },
  { key: 'ret_1m', label: '1M' },
];
function pickCategoryLeaderPeriod(categorySchemes) {
  for (const period of LEADER_PERIOD_FALLBACK) {
    if (categorySchemes.filter((s) => s[period.key] != null).length >= 2) return period;
  }
  return null;
}
```

- [ ] **Step 2: Replace `sifLeaders` to rank by the picked period instead of raw NAV**

Find (around line 273-280):

```js
  const sifLeaders = useMemo(() => {
    const uniq = [...new Set(sifSchemes.map((s) => s.category))];
    return uniq.map((c) => ({
      label: sifStratShort(c),
      cat: c,
      top: sifSchemes.filter((s) => s.category === c).sort((a, b) => b.nav - a.nav).slice(0, 3),
    })).filter((c) => c.top.length > 0);
  }, [sifSchemes]);
```

Replace with:

```js
  const sifLeaders = useMemo(() => {
    const uniq = [...new Set(sifSchemes.map((s) => s.category))];
    return uniq.map((c) => {
      const inCat = sifSchemes.filter((s) => s.category === c);
      const period = pickCategoryLeaderPeriod(inCat);
      const top = period
        ? [...inCat].filter((s) => s[period.key] != null).sort((a, b) => b[period.key] - a[period.key]).slice(0, 3)
        : [...inCat].sort((a, b) => b.nav - a.nav).slice(0, 3); // no period has >=2 yet -- fall back to NAV, same as today
      return { label: sifStratShort(c), cat: c, top, period };
    }).filter((c) => c.top.length > 0);
  }, [sifSchemes]);
```

- [ ] **Step 3: Update the leader card rendering to show the return (when available) instead of always showing NAV**

Find (around line 411-417):

```js
                  {c.top.map((s, i) => (
                    <button className="scr-lead-row" key={s.scheme_id} onClick={() => setSifSel(s)}>
                      <span className="scr-lead-rank">{i + 1}</span>
                      <span className="scr-lead-name">{s.sif_name}</span>
                      <span className="scr-lead-ret scr-muted">₹{s.nav.toFixed(2)}</span>
                    </button>
                  ))}
```

Replace with:

```js
                  {c.top.map((s, i) => (
                    <button className="scr-lead-row" key={s.scheme_id} onClick={() => setSifSel(s)}>
                      <span className="scr-lead-rank">{i + 1}</span>
                      <span className="scr-lead-name">{s.sif_name}</span>
                      {c.period ? (
                        <span className="scr-lead-ret scr-pos">{s[c.period.key] > 0 ? '+' : ''}{s[c.period.key].toFixed(1)}% ({c.period.label})</span>
                      ) : (
                        <span className="scr-lead-ret scr-muted">₹{s.nav.toFixed(2)}</span>
                      )}
                    </button>
                  ))}
```

- [ ] **Step 4: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add app/screener/page.js
git commit -m "feat(sif-screener): rank leader cards by longest available return period per category"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Re-run the standalone verify script**

```bash
node .superpowers/verify/build-sif-screener-math.mjs
```
Expected: all `PASS:`, no `FAIL:`.

- [ ] **Step 2: Full project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Manual walkthrough**

Once deployed (after the next scheduled `screener.yml` run has populated `sif_screener`, or after a manual `workflow_dispatch` run):
- Confirm the SIF eyebrow says "Live · rebuilt daily from AMFI NAVs".
- Confirm the SIF table shows a "Columns:" bar and that toggling columns works the same as on the MF table.
- Confirm SIF table columns are sortable (click a return column header, confirm sort order changes).
- Confirm SIF leader cards show a "+X.X% (period)" figure where at least 2 SIFs in that category have data for some period, and still show NAV for categories where no period yet qualifies.
- Confirm no IDCW-named schemes appear anywhere in the SIF table or leader cards.
- Confirm the comparison feature (clicking a SIF checkbox, opening the comparison modal) still works unaffected — it uses `/api/sif-nav`/`/api/sif-history` independently, untouched by this work.

---

## Self-Review Notes

- **Spec coverage**: all 7 numbered sections of the design doc map to tasks — Task 1-2 (nightly build script), Task 3 (workflow), Task 4 (API route), Task 5 (data source switch + eyebrow copy), Task 6 (Columns selector + sortable columns), Task 7 (leader cards). Error handling (per-scheme isolation, no special retry) is folded into Task 2's `main()` (each row computed independently, never throws). Testing (Task 1's verify script, Task 2's dry-run, Task 8's build+walkthrough) covers section 7 of the spec.
- **Type consistency checked**: `ret_inception_annualized` is a `BOOLEAN` column throughout (Task 2's schema, Task 4's route just passes it through without `num()` coercion since it's not numeric) — confirmed consistent.
- **Placeholder scan**: no TBD/TODO — every step has complete, runnable code.
