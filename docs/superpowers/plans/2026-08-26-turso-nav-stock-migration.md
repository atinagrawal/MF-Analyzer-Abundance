# Turso Migration for NAV & Stock EOD History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the `mf_nav_history` and `stock_eod` tables off Prisma Postgres and onto two dedicated Turso (SQLite/libSQL) databases, with zero functional regression across every script and route that reads or writes them.

**Architecture:** Two thin store modules (`lib/navHistoryStore.js`, `lib/stockEodStore.js`) are the only files that talk to Turso directly; every consumer calls into them instead of running raw SQL. A one-time paginated backfill copies existing Postgres data across, a checksum script verifies the copy, then each of the ~13 call sites is cut over to the store modules one at a time.

**Tech Stack:** `@tursodatabase/serverless` (fetch-based client, `/compat` layer for a `pg`-like `execute(sql, args) -> {rows}` API), Node 24, existing `pg` (kept for every table that stays on Postgres).

**Spec:** `docs/superpowers/specs/2026-08-26-turso-nav-stock-migration-design.md`

## Global Constraints

- Client package: `@tursodatabase/serverless`, imported via its compat layer as `import { createClient } from '@tursodatabase/serverless/compat'`. Not `@libsql/client` (legacy).
- SQLite date columns are stored as `TEXT` in `YYYY-MM-DD` format — never a native DATE type. This matches the string-date convention several existing scripts already assume.
- SQLite `NUMERIC(14,4)` becomes `REAL`. Round to 4 decimal places on write for NAV values, matching existing `toFixed(4)` calls.
- Placeholder style is positional `?` with a flat args array — never `$1`-style.
- Upsert chunk sizes are picked to stay safely under SQLite's variable-count ceiling (as low as 999 on some builds): `mf_nav_history` upserts (3 params/row) chunk at 300 rows/query (900 params); `stock_eod` upserts (12 params/row) chunk at 80 rows/query (960 params). Do not reuse the larger Postgres-era chunk sizes (200/500 rows) — those would exceed the ceiling for `stock_eod`.
- `upsertRows`/`upsertDay` let failures throw — no silent catch-and-continue on writes, matching this repo's established stance.
- No test framework exists for these scripts. Verification is: run the script for real against the two already-provisioned Turso databases (`mf-nav-history`, `stock-eod` — both live, credentials already in `.env.local`, GitHub Actions secrets, and Vercel env vars) and read its own output; `npm run build` after any `app/` or `lib/` change; and the dedicated backfill/verify scripts in Tasks 3–5.
- Work directly on `main`. Commit after each task once its Run/Expected step passes. Stage only the files that task touches — never a broad `git add -A`. Never add a Claude/AI signature to any commit.

---

### Task 1: `@tursodatabase/serverless` dependency + `lib/navHistoryStore.js`

**Files:**
- Modify: `package.json` (add dependency via `npm install`)
- Create: `lib/navHistoryStore.js`

**Interfaces:**
- Produces (used by Tasks 3, 5, 10, 11, 13, 14, 15, 16, 17, 18, 19): `getLatestNav(code) -> {nav, navDate} | null`, `getOldestNav(code) -> {nav, navDate} | null`, `getNavAsOf(code, dateIso) -> {nav, navDate} | null`, `getSeriesForCode(code) -> [{navDate, nav}]`, `getSeriesForCodes(codes) -> [{code, navDate, nav}]`, `getGlobalStats() -> {totalRows, totalFunds, latestDate}`, `getDistinctCodes() -> string[]`, `upsertRows(rows: [{code, navDate, nav}]) -> number`, `getDb() -> Promise<client>` (raw escape hatch, table already ensured).

- [ ] **Step 1: Install the dependency**

Run: `npm install @tursodatabase/serverless`

Expected: `package.json`'s `dependencies` gains a `@tursodatabase/serverless` entry; `package-lock.json` updates.

- [ ] **Step 2: Create the store module**

```js
// lib/navHistoryStore.js
/**
 * Turso-backed store for the mf_nav_history table. This is the only file that
 * talks to the `mf-nav-history` Turso database directly.
 * See docs/superpowers/specs/2026-08-26-turso-nav-stock-migration-design.md.
 */

import { createClient } from '@tursodatabase/serverless/compat';

let _client = null;
function db() {
  if (!_client) {
    const url = process.env.TURSO_NAV_HISTORY_URL;
    const authToken = process.env.TURSO_NAV_HISTORY_TOKEN;
    if (!url || !authToken) throw new Error('TURSO_NAV_HISTORY_URL / TURSO_NAV_HISTORY_TOKEN required');
    _client = createClient({ url, authToken });
  }
  return _client;
}

let _ready = null;
function ensureTable() {
  if (_ready) return _ready;
  _ready = db()
    .execute(`
      CREATE TABLE IF NOT EXISTS mf_nav_history (
        code     TEXT NOT NULL,
        nav_date TEXT NOT NULL,
        nav      REAL NOT NULL,
        PRIMARY KEY (code, nav_date)
      )
    `)
    .then(() => db().execute(`CREATE INDEX IF NOT EXISTS idx_nav_history_code ON mf_nav_history (code, nav_date)`));
  return _ready;
}

export async function getLatestNav(code) {
  await ensureTable();
  const { rows } = await db().execute(
    `SELECT nav, nav_date FROM mf_nav_history WHERE code = ? ORDER BY nav_date DESC LIMIT 1`,
    [String(code)]
  );
  return rows.length ? { nav: parseFloat(rows[0].nav), navDate: rows[0].nav_date } : null;
}

export async function getOldestNav(code) {
  await ensureTable();
  const { rows } = await db().execute(
    `SELECT nav, nav_date FROM mf_nav_history WHERE code = ? ORDER BY nav_date ASC LIMIT 1`,
    [String(code)]
  );
  return rows.length ? { nav: parseFloat(rows[0].nav), navDate: rows[0].nav_date } : null;
}

export async function getNavAsOf(code, dateIso) {
  await ensureTable();
  const { rows } = await db().execute(
    `SELECT nav, nav_date FROM mf_nav_history WHERE code = ? AND nav_date <= ? ORDER BY nav_date DESC LIMIT 1`,
    [String(code), dateIso]
  );
  return rows.length ? { nav: parseFloat(rows[0].nav), navDate: rows[0].nav_date } : null;
}

export async function getSeriesForCode(code) {
  await ensureTable();
  const { rows } = await db().execute(
    `SELECT nav_date, nav FROM mf_nav_history WHERE code = ? ORDER BY nav_date ASC`,
    [String(code)]
  );
  return rows.map((r) => ({ navDate: r.nav_date, nav: parseFloat(r.nav) }));
}

export async function getSeriesForCodes(codes) {
  await ensureTable();
  if (!codes || !codes.length) return [];
  const CHUNK = 300;
  const out = [];
  for (let i = 0; i < codes.length; i += CHUNK) {
    const slice = codes.slice(i, i + CHUNK).map(String);
    const ph = slice.map(() => '?').join(',');
    const { rows } = await db().execute(
      `SELECT code, nav_date, nav FROM mf_nav_history WHERE code IN (${ph}) ORDER BY code, nav_date ASC`,
      slice
    );
    for (const r of rows) out.push({ code: r.code, navDate: r.nav_date, nav: parseFloat(r.nav) });
  }
  return out;
}

export async function getGlobalStats() {
  await ensureTable();
  const { rows } = await db().execute(
    `SELECT COUNT(*) AS total_rows, COUNT(DISTINCT code) AS total_funds, MAX(nav_date) AS latest_date FROM mf_nav_history`
  );
  const r = rows[0] || {};
  return {
    totalRows: Number(r.total_rows) || 0,
    totalFunds: Number(r.total_funds) || 0,
    latestDate: r.latest_date || null,
  };
}

export async function getDistinctCodes() {
  await ensureTable();
  const { rows } = await db().execute(`SELECT DISTINCT code FROM mf_nav_history`);
  return rows.map((r) => r.code);
}

export async function upsertRows(rows) {
  if (!rows || !rows.length) return 0;
  await ensureTable();
  const CHUNK = 300; // 3 params/row -> 900 params/chunk
  let count = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const vals = [];
    const ph = slice
      .map((r) => {
        vals.push(String(r.code), r.navDate, +Number(r.nav).toFixed(4));
        return '(?,?,?)';
      })
      .join(',');
    await db().execute(
      `INSERT INTO mf_nav_history (code, nav_date, nav) VALUES ${ph}
       ON CONFLICT (code, nav_date) DO UPDATE SET nav = excluded.nav`,
      vals
    );
    count += slice.length;
  }
  return count;
}

export async function getDb() {
  await ensureTable();
  return db();
}
```

- [ ] **Step 3: Verify against the live database**

Run:
```bash
node -e "
process.env.TURSO_NAV_HISTORY_URL = require('fs').readFileSync('.env.local','utf8').match(/TURSO_NAV_HISTORY_URL=\"([^\"]+)\"/)[1];
process.env.TURSO_NAV_HISTORY_TOKEN = require('fs').readFileSync('.env.local','utf8').match(/TURSO_NAV_HISTORY_TOKEN=\"([^\"]+)\"/)[1];
import('./lib/navHistoryStore.js').then(async (m) => {
  await m.upsertRows([{ code: '999999', navDate: '2020-01-01', nav: 10.1234 }, { code: '999999', navDate: '2020-01-02', nav: 10.5 }]);
  console.log('latest', await m.getLatestNav('999999'));
  console.log('oldest', await m.getOldestNav('999999'));
  console.log('asOf', await m.getNavAsOf('999999', '2020-01-01'));
  console.log('series', await m.getSeriesForCode('999999'));
  console.log('seriesForCodes', await m.getSeriesForCodes(['999999']));
  console.log('stats', await m.getGlobalStats());
  const db = await m.getDb();
  await db.execute('DELETE FROM mf_nav_history WHERE code = ?', ['999999']);
  console.log('cleanup done');
});
"
```
Expected: prints `latest {nav: 10.5, navDate: '2020-01-02'}`, `oldest {nav: 10.1234, navDate: '2020-01-01'}`, `asOf {nav: 10.1234, navDate: '2020-01-01'}`, a 2-row series, matching `seriesForCodes` output, stats with `totalRows >= 2`, and `cleanup done`. If any call throws or the shape doesn't match, fix `lib/navHistoryStore.js` before proceeding — this is the foundation every later task builds on.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json lib/navHistoryStore.js
git commit -m "feat(turso): add navHistoryStore module for mf_nav_history"
```

---

### Task 2: `lib/stockEodStore.js`

**Files:**
- Create: `lib/stockEodStore.js`

**Interfaces:**
- Consumes: none (independent of Task 1's module — separate Turso database).
- Produces (used by Tasks 4, 5, 6, 7, 8, 9, 12, 19): `upsertDay(dateIso, rows) -> number`, `pruneOlderThan(days) -> number`, `getWindow(endDateIso, days=400) -> [{isin, tradeDate, symbol, name, close, high, low, prevClose, turnover}]`, `getAll() -> same shape as getWindow`, `getDistinctTradeDates() -> string[]`, `getLatestTradeDate() -> string | null`, `getLatestForIsins(isins) -> [{isin, symbol, name, tradeDate, close, prevClose, open, high, low, volume, turnover}]`, `getDb() -> Promise<client>`.

- [ ] **Step 1: Create the store module**

```js
// lib/stockEodStore.js
/**
 * Turso-backed store for the stock_eod table. This is the only file that
 * talks to the `stock-eod` Turso database directly.
 * See docs/superpowers/specs/2026-08-26-turso-nav-stock-migration-design.md.
 *
 * getWindow's SELECT includes symbol/name even though two of its three
 * callers (build-breadth.mjs, build-sector-breadth.mjs) ignore them --
 * build-signals.mjs needs both to populate stock_signals.symbol/name, and
 * one shared function is simpler than two near-identical ones.
 */

import { createClient } from '@tursodatabase/serverless/compat';

let _client = null;
function db() {
  if (!_client) {
    const url = process.env.TURSO_STOCK_EOD_URL;
    const authToken = process.env.TURSO_STOCK_EOD_TOKEN;
    if (!url || !authToken) throw new Error('TURSO_STOCK_EOD_URL / TURSO_STOCK_EOD_TOKEN required');
    _client = createClient({ url, authToken });
  }
  return _client;
}

let _ready = null;
function ensureTable() {
  if (_ready) return _ready;
  _ready = db()
    .execute(`
      CREATE TABLE IF NOT EXISTS stock_eod (
        trade_date TEXT NOT NULL,
        isin       TEXT NOT NULL,
        symbol     TEXT,
        name       TEXT,
        series     TEXT,
        open       REAL,
        high       REAL,
        low        REAL,
        close      REAL NOT NULL,
        prev_close REAL,
        volume     INTEGER,
        turnover   REAL,
        PRIMARY KEY (trade_date, isin)
      )
    `)
    .then(() => db().execute(`CREATE INDEX IF NOT EXISTS idx_stock_eod_isin_date ON stock_eod (isin, trade_date)`))
    .then(() => db().execute(`CREATE INDEX IF NOT EXISTS idx_stock_eod_date ON stock_eod (trade_date)`));
  return _ready;
}

export async function upsertDay(dateIso, rows) {
  if (!rows || !rows.length) return 0;
  await ensureTable();
  const CHUNK = 80; // 12 params/row -> 960 params/chunk
  let count = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const vals = [];
    const ph = slice
      .map((r) => {
        vals.push(dateIso, r.isin, r.symbol, r.name, r.series, r.open, r.high, r.low, r.close, r.prev_close, r.volume, r.turnover);
        return '(?,?,?,?,?,?,?,?,?,?,?,?)';
      })
      .join(',');
    await db().execute(
      `INSERT INTO stock_eod (trade_date,isin,symbol,name,series,open,high,low,close,prev_close,volume,turnover)
       VALUES ${ph}
       ON CONFLICT (trade_date,isin) DO UPDATE SET
         symbol=excluded.symbol, name=excluded.name, series=excluded.series,
         open=excluded.open, high=excluded.high, low=excluded.low, close=excluded.close,
         prev_close=excluded.prev_close, volume=excluded.volume, turnover=excluded.turnover`,
      vals
    );
    count += slice.length;
  }
  return count;
}

export async function pruneOlderThan(days) {
  await ensureTable();
  const { rowsAffected } = await db().execute(
    `DELETE FROM stock_eod WHERE trade_date < date('now', '-' || ? || ' days')`,
    [String(days)]
  );
  return rowsAffected || 0;
}

export async function getWindow(endDateIso, days = 400) {
  await ensureTable();
  const { rows } = await db().execute(
    `SELECT trade_date, isin, symbol, name, close, high, low, prev_close, turnover
       FROM stock_eod
      WHERE trade_date > date(?, '-' || ? || ' days') AND trade_date <= ?
      ORDER BY isin, trade_date`,
    [endDateIso, String(days), endDateIso]
  );
  return rows.map((r) => ({
    isin: r.isin, tradeDate: r.trade_date, symbol: r.symbol, name: r.name,
    close: +r.close,
    high: r.high == null ? null : +r.high,
    low: r.low == null ? null : +r.low,
    prevClose: r.prev_close == null ? null : +r.prev_close,
    turnover: r.turnover == null ? null : +r.turnover,
  }));
}

export async function getAll() {
  await ensureTable();
  const PAGE = 50000;
  let offset = 0;
  const out = [];
  for (;;) {
    const { rows } = await db().execute(
      `SELECT trade_date, isin, symbol, name, close, high, low, prev_close, turnover
         FROM stock_eod ORDER BY isin, trade_date LIMIT ? OFFSET ?`,
      [String(PAGE), String(offset)]
    );
    for (const r of rows) {
      out.push({
        isin: r.isin, tradeDate: r.trade_date, symbol: r.symbol, name: r.name,
        close: +r.close,
        high: r.high == null ? null : +r.high,
        low: r.low == null ? null : +r.low,
        prevClose: r.prev_close == null ? null : +r.prev_close,
        turnover: r.turnover == null ? null : +r.turnover,
      });
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

export async function getDistinctTradeDates() {
  await ensureTable();
  const { rows } = await db().execute(`SELECT DISTINCT trade_date FROM stock_eod ORDER BY trade_date`);
  return rows.map((r) => r.trade_date);
}

export async function getLatestTradeDate() {
  await ensureTable();
  const { rows } = await db().execute(`SELECT MAX(trade_date) AS d FROM stock_eod`);
  return rows[0]?.d || null;
}

export async function getLatestForIsins(isins) {
  await ensureTable();
  if (!isins || !isins.length) return [];
  const latest = await getLatestTradeDate();
  if (!latest) return [];
  const CHUNK = 300;
  const out = [];
  for (let i = 0; i < isins.length; i += CHUNK) {
    const slice = isins.slice(i, i + CHUNK);
    const ph = slice.map(() => '?').join(',');
    const { rows } = await db().execute(
      `SELECT trade_date, isin, symbol, name, close, high, low, prev_close, open, volume, turnover
         FROM stock_eod WHERE trade_date = ? AND isin IN (${ph})`,
      [latest, ...slice]
    );
    for (const r of rows) {
      out.push({
        isin: r.isin, tradeDate: r.trade_date, symbol: r.symbol, name: r.name,
        close: +r.close,
        prevClose: r.prev_close == null ? null : +r.prev_close,
        open: r.open == null ? null : +r.open,
        high: r.high == null ? null : +r.high,
        low: r.low == null ? null : +r.low,
        volume: r.volume == null ? null : Number(r.volume),
        turnover: r.turnover == null ? null : +r.turnover,
      });
    }
  }
  return out;
}

export async function getDb() {
  await ensureTable();
  return db();
}
```

- [ ] **Step 2: Verify against the live database**

Run:
```bash
node -e "
const env = require('fs').readFileSync('.env.local','utf8');
process.env.TURSO_STOCK_EOD_URL = env.match(/TURSO_STOCK_EOD_URL=\"([^\"]+)\"/)[1];
process.env.TURSO_STOCK_EOD_TOKEN = env.match(/TURSO_STOCK_EOD_TOKEN=\"([^\"]+)\"/)[1];
import('./lib/stockEodStore.js').then(async (m) => {
  await m.upsertDay('2020-01-01', [{ isin: 'INE_TEST01', symbol: 'TEST', name: 'Test Co', series: 'A', open: 100, high: 105, low: 99, close: 104, prev_close: 101, volume: 1000, turnover: 104000 }]);
  console.log('latestTradeDate', await m.getLatestTradeDate());
  console.log('window', await m.getWindow('2020-01-01', 10));
  console.log('latestForIsins', await m.getLatestForIsins(['INE_TEST01']));
  console.log('distinctDates', await m.getDistinctTradeDates());
  const db = await m.getDb();
  await db.execute('DELETE FROM stock_eod WHERE isin = ?', ['INE_TEST01']);
  console.log('cleanup done');
});
"
```
Expected: `latestTradeDate` prints `2020-01-01`; `window` and `latestForIsins` each contain one row for `INE_TEST01` with `close: 104`; `distinctDates` includes `2020-01-01`; `cleanup done` prints last. Fix the module before proceeding if anything is wrong.

- [ ] **Step 3: Commit**

```bash
git add lib/stockEodStore.js
git commit -m "feat(turso): add stockEodStore module for stock_eod"
```

---

### Task 3: Backfill `mf_nav_history` into Turso

**Files:**
- Create: `scripts/migrate-nav-history-to-turso.mjs`

**Interfaces:**
- Consumes: `upsertRows` from Task 1's `lib/navHistoryStore.js`.
- Produces: a populated `mf-nav-history` Turso database, consumed by Task 5's verification.

- [ ] **Step 1: Create the backfill script**

```js
// scripts/migrate-nav-history-to-turso.mjs
/**
 * One-time backfill: copies every row from Postgres `mf_nav_history` into the
 * Turso `mf-nav-history` database, paginated by (code, nav_date) keyset so
 * neither side ever holds the full 3.94M rows in memory or in one response.
 *
 * Usage: node scripts/migrate-nav-history-to-turso.mjs
 * Env: POSTGRES_URL, TURSO_NAV_HISTORY_URL, TURSO_NAV_HISTORY_TOKEN
 */

import pg from 'pg';
import { upsertRows } from '../lib/navHistoryStore.js';

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error('[migrate-nav] FATAL: POSTGRES_URL is required.');
  process.exit(1);
}

pg.types.setTypeParser(1082, (val) => val); // DATE as plain string

const PAGE_SIZE = 20000;

async function main() {
  const client = new pg.Client({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let lastCode = '', lastDate = '0001-01-01';
  let totalCopied = 0;
  let page = 0;

  for (;;) {
    const { rows } = await client.query(
      `SELECT code, nav_date, nav FROM mf_nav_history
        WHERE (code, nav_date) > ($1, $2::date)
        ORDER BY code, nav_date
        LIMIT $3`,
      [lastCode, lastDate, PAGE_SIZE]
    );
    if (!rows.length) break;

    const batch = rows.map((r) => ({ code: r.code, navDate: r.nav_date, nav: parseFloat(r.nav) }));
    await upsertRows(batch);
    totalCopied += batch.length;
    page++;
    const last = rows[rows.length - 1];
    lastCode = last.code; lastDate = last.nav_date;
    console.log(`[migrate-nav] page ${page}: copied ${batch.length} rows (total ${totalCopied.toLocaleString()}), through ${lastCode}/${lastDate}`);

    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`[migrate-nav] done — ${totalCopied.toLocaleString()} rows copied.`);
  await client.end();
}

main().catch((err) => { console.error('[migrate-nav] FATAL:', err); process.exit(1); });
```

- [ ] **Step 2: Run the backfill**

Run: `node scripts/migrate-nav-history-to-turso.mjs`

Expected: a series of `[migrate-nav] page N: copied ...` lines advancing through codes/dates, ending with `[migrate-nav] done — ~3,940,000 rows copied.` (exact count may differ slightly from the 3.94M estimate in the spec — that's fine, it's from a point-in-time snapshot). This will take a while (millions of rows over HTTP); let it run to completion. If it errors partway through, it is safe to simply re-run — `upsertRows` is an upsert, so already-copied rows are just overwritten with the same values and the keyset naturally resumes near where it left off (a full re-run from the start is still correct if resuming precisely isn't convenient).

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-nav-history-to-turso.mjs
git commit -m "feat(turso): add one-time mf_nav_history backfill script"
```

---

### Task 4: Backfill `stock_eod` into Turso

**Files:**
- Create: `scripts/migrate-stock-eod-to-turso.mjs`

**Interfaces:**
- Consumes: `upsertDay` from Task 2's `lib/stockEodStore.js`.
- Produces: a populated `stock-eod` Turso database, consumed by Task 5's verification.

- [ ] **Step 1: Create the backfill script**

```js
// scripts/migrate-stock-eod-to-turso.mjs
/**
 * One-time backfill: copies every row from Postgres `stock_eod` into the
 * Turso `stock-eod` database, paginated by (trade_date, isin) keyset.
 *
 * Usage: node scripts/migrate-stock-eod-to-turso.mjs
 * Env: POSTGRES_URL, TURSO_STOCK_EOD_URL, TURSO_STOCK_EOD_TOKEN
 */

import pg from 'pg';
import { upsertDay } from '../lib/stockEodStore.js';

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error('[migrate-eod] FATAL: POSTGRES_URL is required.');
  process.exit(1);
}

pg.types.setTypeParser(1082, (val) => val); // DATE as plain string

const PAGE_SIZE = 20000;

async function main() {
  const client = new pg.Client({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let lastDate = '0001-01-01', lastIsin = '';
  let totalCopied = 0;
  let page = 0;

  for (;;) {
    const { rows } = await client.query(
      `SELECT trade_date, isin, symbol, name, series, open, high, low, close, prev_close, volume, turnover
         FROM stock_eod
        WHERE (trade_date, isin) > ($1::date, $2)
        ORDER BY trade_date, isin
        LIMIT $3`,
      [lastDate, lastIsin, PAGE_SIZE]
    );
    if (!rows.length) break;

    const byDate = new Map();
    for (const r of rows) {
      if (!byDate.has(r.trade_date)) byDate.set(r.trade_date, []);
      byDate.get(r.trade_date).push({
        isin: r.isin, symbol: r.symbol, name: r.name, series: r.series,
        open: r.open == null ? null : +r.open, high: r.high == null ? null : +r.high,
        low: r.low == null ? null : +r.low, close: +r.close,
        prev_close: r.prev_close == null ? null : +r.prev_close,
        volume: r.volume == null ? null : Number(r.volume),
        turnover: r.turnover == null ? null : +r.turnover,
      });
    }
    for (const [dateIso, dayRows] of byDate) {
      await upsertDay(dateIso, dayRows);
    }
    totalCopied += rows.length;
    page++;
    const last = rows[rows.length - 1];
    lastDate = last.trade_date; lastIsin = last.isin;
    console.log(`[migrate-eod] page ${page}: copied ${rows.length} rows (total ${totalCopied.toLocaleString()}), through ${lastDate}/${lastIsin}`);

    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`[migrate-eod] done — ${totalCopied.toLocaleString()} rows copied.`);
  await client.end();
}

main().catch((err) => { console.error('[migrate-eod] FATAL:', err); process.exit(1); });
```

- [ ] **Step 2: Run the backfill**

Run: `node scripts/migrate-stock-eod-to-turso.mjs`

Expected: `[migrate-eod] page N: ...` lines, ending with `[migrate-eod] done — ~570,000 rows copied.` (approximate, per the spec's snapshot). Safe to re-run on error, same reasoning as Task 3.

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-stock-eod-to-turso.mjs
git commit -m "feat(turso): add one-time stock_eod backfill script"
```

---

### Task 5: Verify the backfill

**Files:**
- Create: `scripts/verify-turso-migration.mjs`

**Interfaces:**
- Consumes: `getGlobalStats`, `getDb` from `lib/navHistoryStore.js`; `getDb` from `lib/stockEodStore.js`.
- Produces: a pass/fail gate — do not proceed to Task 6 until this passes.

- [ ] **Step 1: Create the verification script**

```js
// scripts/verify-turso-migration.mjs
/**
 * Compares row counts and a value checksum between Postgres and Turso for
 * both migrated tables. Run after Tasks 3 and 4's backfills, before cutting
 * over any read/write call site. Exits non-zero on any mismatch.
 *
 * Usage: node scripts/verify-turso-migration.mjs
 */

import pg from 'pg';
import { getGlobalStats as navStats, getDb as navDb } from '../lib/navHistoryStore.js';
import { getDb as eodDb } from '../lib/stockEodStore.js';

async function main() {
  const client = new pg.Client({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let ok = true;

  const pgNav = await client.query(`SELECT COUNT(*) AS n, SUM(nav) AS sum_nav FROM mf_nav_history`);
  const tNavStats = await navStats();
  const db1 = await navDb();
  const { rows: sumRows } = await db1.execute(`SELECT SUM(nav) AS sum_nav FROM mf_nav_history`);

  const pgNavRows = Number(pgNav.rows[0].n);
  const pgNavSum = Number(pgNav.rows[0].sum_nav);
  const tNavSum = Number(sumRows[0].sum_nav);

  console.log(`[verify] mf_nav_history — Postgres: ${pgNavRows.toLocaleString()} rows, sum(nav)=${pgNavSum.toFixed(2)} | Turso: ${tNavStats.totalRows.toLocaleString()} rows, sum(nav)=${tNavSum.toFixed(2)}`);
  if (pgNavRows !== tNavStats.totalRows) { console.error('[verify] MISMATCH: mf_nav_history row count differs'); ok = false; }
  if (Math.abs(pgNavSum - tNavSum) > 0.01) { console.error('[verify] MISMATCH: mf_nav_history sum(nav) differs'); ok = false; }

  const pgEod = await client.query(`SELECT COUNT(*) AS n, SUM(close) AS sum_close FROM stock_eod`);
  const db2 = await eodDb();
  const { rows: eodRows } = await db2.execute(`SELECT COUNT(*) AS n, SUM(close) AS sum_close FROM stock_eod`);

  const pgEodRows = Number(pgEod.rows[0].n);
  const pgEodSum = Number(pgEod.rows[0].sum_close);
  const tEodRows = Number(eodRows[0].n);
  const tEodSum = Number(eodRows[0].sum_close);

  console.log(`[verify] stock_eod — Postgres: ${pgEodRows.toLocaleString()} rows, sum(close)=${pgEodSum.toFixed(2)} | Turso: ${tEodRows.toLocaleString()} rows, sum(close)=${tEodSum.toFixed(2)}`);
  if (pgEodRows !== tEodRows) { console.error('[verify] MISMATCH: stock_eod row count differs'); ok = false; }
  if (Math.abs(pgEodSum - tEodSum) > 0.01) { console.error('[verify] MISMATCH: stock_eod sum(close) differs'); ok = false; }

  await client.end();

  if (!ok) {
    console.error('\n[verify] FAILED — do not proceed with cutover until these match.');
    process.exit(1);
  }
  console.log('\n[verify] PASSED — Postgres and Turso agree on both tables.');
}

main().catch((err) => { console.error('[verify] FATAL:', err); process.exit(1); });
```

- [ ] **Step 2: Run it**

Run: `node scripts/verify-turso-migration.mjs`

Expected: `[verify] PASSED — Postgres and Turso agree on both tables.` with exit code 0. If it fails, do not proceed — re-run the relevant backfill script from Task 3/4 (both are safe to re-run) and verify again.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-turso-migration.mjs
git commit -m "feat(turso): add Postgres/Turso migration verification script"
```

---

### Task 6: Cut over `scripts/ingest-eod.mjs` (+ `breadth.yml`)

**Files:**
- Modify: `scripts/ingest-eod.mjs`
- Modify: `.github/workflows/breadth.yml`

**Interfaces:**
- Consumes: `upsertDay`, `pruneOlderThan` from `lib/stockEodStore.js`.

`stock_eod` is the only table this script touches, so it drops `pg` entirely.

- [ ] **Step 1: Rewrite the script**

Replace the `import pg from "pg";` line, remove the `ensureTable(c)` function (lines 75–91) and the local `upsertDay(c, dateIso, rows)` function (lines 93–114) entirely, and replace `main()` with:

```js
import { upsertDay, pruneOlderThan } from "../lib/stockEodStore.js";
import path from "path";
import { fileURLToPath } from "url";
```

```js
async function main() {
  // resolve target dates
  let dates = [];
  const from = arg("from"), to = arg("to"), one = arg("date");
  if (from && to) {
    for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) {
      const d = new Date(t); const wd = d.getUTCDay();
      if (wd !== 0 && wd !== 6) dates.push(d);       // skip weekends (holidays handled by 404)
    }
  } else if (one) {
    dates = [new Date(Date.parse(one))];
  } else {
    // default: last 5 weekdays. Idempotent upserts, so this fills any gap and always
    // picks up the most recently published bhavcopy (today's may not be out yet).
    let d = new Date(); d.setUTCHours(0, 0, 0, 0);
    while (dates.length < 5) { const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) dates.push(new Date(d)); d = new Date(d - DAY); }
  }

  const live = Boolean(process.env.TURSO_STOCK_EOD_URL);

  let okDays = 0, totalRows = 0;
  for (const d of dates) {
    const txt = await fetchBhav(d);
    if (!txt) { if (!from) console.log(`[eod] ${iso(d)}: no file (holiday/weekend)`); continue; }
    const rows = parseBhav(txt).filter((r) => EQUITY_GROUPS.has(r.series));
    if (!rows.length) { console.log(`[eod] ${iso(d)}: 0 equity rows?!`); continue; }
    if (live) await upsertDay(iso(d), rows);
    okDays++; totalRows += rows.length;
    console.log(`[eod] ${iso(d)}: ${rows.length} equities${live ? " upserted" : " (dry-run)"}`);
  }
  if (live && okDays) {
    const pruned = await pruneOlderThan(RETENTION_DAYS);
    if (pruned) console.log(`[eod] pruned ${pruned} rows older than ${RETENTION_DAYS}d`);
  }
  console.log(`[eod] done — ${okDays} trading days, ${totalRows} rows total${live ? "" : " (no TURSO_STOCK_EOD_URL → dry-run)"}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

`parseBhav`, `bhavUrl`, `fetchBhav`, `arg`, `EQUITY_GROUPS`, `RETENTION_DAYS`, `iso`, `DAY` all stay exactly as they are.

- [ ] **Step 2: Update the workflow**

In `.github/workflows/breadth.yml`, change:
```yaml
      - run: npm install pg@8
      - name: Ingest EOD prices
        env:
          POSTGRES_URL: ${{ secrets.POSTGRES_URL }}
        run: |
```
to:
```yaml
      - run: npm install pg@8 @tursodatabase/serverless
      - name: Ingest EOD prices
        env:
          TURSO_STOCK_EOD_URL: ${{ secrets.TURSO_STOCK_EOD_URL }}
          TURSO_STOCK_EOD_TOKEN: ${{ secrets.TURSO_STOCK_EOD_TOKEN }}
        run: |
```
(the three later `run:` blocks, and their steps' `POSTGRES_URL` env, stay unchanged here — Tasks 7–9 touch those.)

- [ ] **Step 3: Verify**

Run: `node --env-file=.env.local scripts/ingest-eod.mjs --date=2020-01-06` (a known past trading Monday; using a historical date avoids double-writing today's real data during testing — this row will be naturally superseded by the next real nightly run).

Expected: `[eod] 2020-01-06: N equities upserted` followed by `[eod] done — 1 trading days, N rows total`. Then confirm the write landed:
```bash
node -e "
const env = require('fs').readFileSync('.env.local','utf8');
process.env.TURSO_STOCK_EOD_URL = env.match(/TURSO_STOCK_EOD_URL=\"([^\"]+)\"/)[1];
process.env.TURSO_STOCK_EOD_TOKEN = env.match(/TURSO_STOCK_EOD_TOKEN=\"([^\"]+)\"/)[1];
import('./lib/stockEodStore.js').then(async (m) => console.log((await m.getWindow('2020-01-06', 5)).length));
"
```
Expected: a positive row count.

- [ ] **Step 4: Commit**

```bash
git add scripts/ingest-eod.mjs .github/workflows/breadth.yml
git commit -m "feat(turso): cut over ingest-eod.mjs to stockEodStore"
```

---

### Task 7: Cut over `scripts/build-breadth.mjs` (+ `breadth.yml`)

**Files:**
- Modify: `scripts/build-breadth.mjs`
- Modify: `.github/workflows/breadth.yml`

**Interfaces:**
- Consumes: `getWindow`, `getAll`, `getDistinctTradeDates` from `lib/stockEodStore.js`.

`market_breadth` stays on Postgres (unchanged `ensureTable`/`upsert`/pg client); only the `stock_eod` reads move.

- [ ] **Step 1: Rewrite the script**

Add the import:
```js
import { getWindow, getAll, getDistinctTradeDates } from "../lib/stockEodStore.js";
```

Replace `loadWindow`:
```js
async function loadWindow(endDate, days = 400) {
  const rows = await getWindow(endDate, days);
  const byIsin = new Map();
  for (const r of rows) {
    if (!byIsin.has(r.isin)) byIsin.set(r.isin, []);
    byIsin.get(r.isin).push({ t: r.tradeDate, close: r.close, high: r.high, low: r.low, prev: r.prevClose, tov: r.turnover ?? 0 });
  }
  return byIsin;
}
```

In `runAll(c)`, replace the `const { rows } = await c.query(...)` block with:
```js
  const rows = await getAll();
  const full = new Map(); const dateSet = new Set();
  for (const r of rows) {
    dateSet.add(r.tradeDate);
    if (!full.has(r.isin)) full.set(r.isin, []);
    full.get(r.isin).push({ t: r.tradeDate, close: r.close, high: r.high, low: r.low, prev: r.prevClose, tov: r.turnover ?? 0 });
  }
```
(the rest of `runAll` — `dates`, `targets`, `idxOf`, the per-date loop calling `computeSnapshot`/`upsert(c, D, s)` — stays unchanged; `c` is still passed through since `upsert` still writes `market_breadth` to Postgres).

In `main()`: change `const s = computeSnapshot(await loadWindow(c, D), D);` (the `arg("date")` branch) to `await loadWindow(D)`. In the self-heal branch, replace:
```js
    const { rows: er } = await c.query(`SELECT DISTINCT trade_date FROM stock_eod ORDER BY trade_date`);
    const eodDates = er.map((r) => r.trade_date.toISOString().slice(0, 10));
```
with:
```js
    const eodDates = await getDistinctTradeDates();
```
and change `const s = computeSnapshot(await loadWindow(c, D), D);` inside that branch's `for (const D of missing)` loop to `await loadWindow(D)`.

- [ ] **Step 2: Update the workflow**

In `.github/workflows/breadth.yml`, add the two Turso vars to the "Compute breadth snapshot" step's env (keep `POSTGRES_URL` — `market_breadth` still needs it):
```yaml
      - name: Compute breadth snapshot
        env:
          POSTGRES_URL: ${{ secrets.POSTGRES_URL }}
          TURSO_STOCK_EOD_URL: ${{ secrets.TURSO_STOCK_EOD_URL }}
          TURSO_STOCK_EOD_TOKEN: ${{ secrets.TURSO_STOCK_EOD_TOKEN }}
        run: |
```

- [ ] **Step 3: Verify**

Run: `node --env-file=.env.local scripts/build-breadth.mjs` (self-heal mode — safe, only fills genuinely missing dates).

Expected: either `[breadth] up to date — ...` or `[breadth] YYYY-MM-DD: universe ... | >200DMA ...%` lines with no errors, and no `ReferenceError`/`TypeError`.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-breadth.mjs .github/workflows/breadth.yml
git commit -m "feat(turso): cut over build-breadth.mjs stock_eod reads to stockEodStore"
```

---

### Task 8: Cut over `scripts/build-signals.mjs` (+ `breadth.yml`)

**Files:**
- Modify: `scripts/build-signals.mjs`
- Modify: `.github/workflows/breadth.yml`

**Interfaces:**
- Consumes: `getWindow` from `lib/stockEodStore.js`.

`stock_signals` stays on Postgres (unchanged); only the `stock_eod` window read moves.

- [ ] **Step 1: Rewrite the script**

Add the import: `import { getWindow } from "../lib/stockEodStore.js";` (keep the existing `import pg from "pg";` and `pg.types.setTypeParser(1082, (val) => val);` — both still needed for `stock_signals`/`market_breadth`).

Replace `loadWindow`:
```js
async function loadWindow(endDate, days = 400) {
  const rows = await getWindow(endDate, days);
  const byIsin = new Map();
  for (const r of rows) {
    if (!byIsin.has(r.isin)) byIsin.set(r.isin, []);
    byIsin.get(r.isin).push({
      t: r.tradeDate, sym: r.symbol, nm: r.name,
      close: r.close, high: r.high, low: r.low, prev: r.prevClose, tov: r.turnover ?? 0,
    });
  }
  return byIsin;
}
```

In `main()`, change `const byIsin = await loadWindow(c, D);` to `await loadWindow(D)` (`c` stays in scope for the surrounding `stock_signals` upserts and `market_breadth` reads).

- [ ] **Step 2: Update the workflow**

In `.github/workflows/breadth.yml`, add the two Turso vars to the "Compute per-stock signals" step's env (keep `POSTGRES_URL`):
```yaml
      - name: Compute per-stock signals
        env:
          POSTGRES_URL: ${{ secrets.POSTGRES_URL }}
          TURSO_STOCK_EOD_URL: ${{ secrets.TURSO_STOCK_EOD_URL }}
          TURSO_STOCK_EOD_TOKEN: ${{ secrets.TURSO_STOCK_EOD_TOKEN }}
        run: |
```

- [ ] **Step 3: Verify**

Run: `node --env-file=.env.local scripts/build-signals.mjs`

Expected: either `[signals] up to date — ...` or `[signals] YYYY-MM-DD: N stocks | >200DMA ... | GC ... DC ... bull ...` with no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-signals.mjs .github/workflows/breadth.yml
git commit -m "feat(turso): cut over build-signals.mjs stock_eod reads to stockEodStore"
```

---

### Task 9: Cut over `scripts/build-sector-breadth.mjs` (+ `breadth.yml`)

**Files:**
- Modify: `scripts/build-sector-breadth.mjs`
- Modify: `.github/workflows/breadth.yml`

**Interfaces:**
- Consumes: `getWindow` from `lib/stockEodStore.js`.

`sector_breadth`, `sector_isin_map`, `market_breadth` stay on Postgres; only the `stock_eod` window read moves.

- [ ] **Step 1: Rewrite the script**

Add the import: `import { getWindow } from "../lib/stockEodStore.js";` (keep `import pg from "pg";` and the existing `pg.types.setTypeParser(1082, (val) => val);`).

Replace `loadWindow`:
```js
async function loadWindow(endDate, days = 400) {
  const rows = await getWindow(endDate, days);
  const byIsin = new Map();
  for (const r of rows) {
    if (!byIsin.has(r.isin)) byIsin.set(r.isin, []);
    byIsin.get(r.isin).push({ t: r.tradeDate, close: r.close, high: r.high, low: r.low, prev: r.prevClose, tov: r.turnover ?? 0 });
  }
  return byIsin;
}
```

In `main()`, change `const byIsin = await loadWindow(c, D);` to `await loadWindow(D)`.

- [ ] **Step 2: Update the workflow**

In `.github/workflows/breadth.yml`, add the two Turso vars to the "Compute sector breadth" step's env (keep `POSTGRES_URL`):
```yaml
      - name: Compute sector breadth
        env:
          POSTGRES_URL: ${{ secrets.POSTGRES_URL }}
          TURSO_STOCK_EOD_URL: ${{ secrets.TURSO_STOCK_EOD_URL }}
          TURSO_STOCK_EOD_TOKEN: ${{ secrets.TURSO_STOCK_EOD_TOKEN }}
        run: |
```

- [ ] **Step 3: Verify**

Run: `node --env-file=.env.local scripts/build-sector-breadth.mjs`

Expected: `[sector-breadth] N sectors, M total ISIN mappings` followed by either `[sector-breadth] up to date — ...` or `[sector-breadth] YYYY-MM-DD: computed N sectors` lines, no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-sector-breadth.mjs .github/workflows/breadth.yml
git commit -m "feat(turso): cut over build-sector-breadth.mjs stock_eod reads to stockEodStore"
```

---

### Task 10: Cut over `scripts/append-nav-history.mjs` (+ `screener.yml`)

**Files:**
- Modify: `scripts/append-nav-history.mjs`
- Modify: `.github/workflows/screener.yml`

**Interfaces:**
- Consumes: `getGlobalStats`, `upsertRows` from `lib/navHistoryStore.js`.

`mf_screener` (read-only, active-codes list) stays on Postgres — this script keeps a `pg.Client` for that one query.

- [ ] **Step 1: Rewrite the script**

```js
// scripts/append-nav-history.mjs
/**
 * scripts/append-nav-history.mjs
 *
 * Daily incremental NAV history updater.
 * Fetches recent NAV records directly from official AMFI reports
 * (DownloadNAVHistoryReport_Po.aspx and NAVAll.txt) and appends them
 * to the `mf_nav_history` Turso database (mf-nav-history).
 *
 * Designed to run daily as part of the GitHub Actions screener workflow.
 *
 * Usage:
 *   node scripts/append-nav-history.mjs
 * Env: POSTGRES_URL (for mf_screener), TURSO_NAV_HISTORY_URL, TURSO_NAV_HISTORY_TOKEN
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getGlobalStats, upsertRows } from '../lib/navHistoryStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error('[append] FATAL: POSTGRES_URL environment variable is required.');
  process.exit(1);
}

const LOOKBACK_CAP_DAYS = 14;

const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const MNAME = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseAmfiDate(s) {
  if (!s) return null;
  const m = /(\d{2})-([A-Za-z]{3})-(\d{4})/.exec(s.trim());
  return m ? Date.UTC(+m[3], MON[m[2]], +m[1]) : null;
}

function fmtAmfi(ms) {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')}-${MNAME[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

function msToISO(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function headerIndex(headerLine, required) {
  const cols = headerLine.split(';').map((c) => c.trim());
  const idx = {};
  for (const name of required) {
    let i = cols.findIndex((c) => c.toLowerCase() === name.toLowerCase());
    if (i < 0) i = cols.findIndex((c) => c.toLowerCase().includes(name.toLowerCase()));
    if (i < 0) throw new Error(`AMFI format change: column "${name}" not found in header: ${headerLine}`);
    idx[name] = i;
  }
  return idx;
}

async function fetchText(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, {
        headers: { Accept: 'text/plain' },
        signal: AbortSignal.timeout(45000),
      });
      if (r.ok) {
        const t = await r.text();
        if (t && t.length > 500) return t;
      }
    } catch (_) {
      /* retry */
    }
    await new Promise((s) => setTimeout(s, 1500));
  }
  throw new Error('Fetch failed after retries: ' + url);
}

async function main() {
  console.log('[append] Starting daily MF NAV history append...');

  // mf_screener stays on Postgres — used only for the active-codes filter
  const pgClient = new pg.Client({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await pgClient.connect();
  console.log('[append] Connected to Postgres (mf_screener).');

  let activeCodes = new Set();
  try {
    const res = await pgClient.query('SELECT DISTINCT code FROM mf_screener');
    for (const r of res.rows) {
      if (r.code) activeCodes.add(String(r.code).trim());
    }
    console.log(`[append] Loaded ${activeCodes.size} active funds from mf_screener.`);
  } catch (err) {
    console.warn(`[append] Warning: could not read mf_screener (${err.message}). Using fallback data/screener.json.`);
    const fallbackPath = path.join(__dirname, '..', 'data', 'screener.json');
    if (fs.existsSync(fallbackPath)) {
      const data = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
      for (const f of data.funds || []) {
        if (f.code) activeCodes.add(String(f.code).trim());
      }
      console.log(`[append] Loaded ${activeCodes.size} active funds from screener.json.`);
    }
  }

  // Determine start date from Turso's current latest date
  const stats = await getGlobalStats();
  const latestDateStr = stats.latestDate;

  const nowMs = Date.now();
  const dayMs = 864e5;
  let startMs;

  if (latestDateStr) {
    const [y, m, d] = latestDateStr.split('-').map(Number);
    const latestMs = Date.UTC(y, m - 1, d);
    startMs = latestMs + dayMs;
    console.log(`[append] Latest recorded NAV date in DB is ${latestDateStr}.`);
  } else {
    startMs = nowMs - 7 * dayMs;
    console.log('[append] No existing NAV records found. Defaulting to 7 days lookback.');
  }

  const oldestAllowedMs = nowMs - LOOKBACK_CAP_DAYS * dayMs;
  if (startMs < oldestAllowedMs) {
    startMs = oldestAllowedMs;
    console.log(`[append] Capped lookback to ${LOOKBACK_CAP_DAYS} days (${fmtAmfi(startMs)}).`);
  }

  const endMs = nowMs;
  const rowsMap = new Map(); // key: `${code}_${isoDate}` -> row

  if (startMs <= endMs) {
    const fromStr = fmtAmfi(startMs);
    const toStr = fmtAmfi(endMs);
    console.log(`[append] Fetching AMFI NAV history from ${fromStr} to ${toStr}...`);

    try {
      const url = `https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=${fromStr}&todt=${toStr}`;
      const txt = await fetchText(url);
      const lines = txt.split('\n');

      if (lines.length > 1 && lines[0].includes(';')) {
        const H = headerIndex(lines[0].replace(/\r$/, ''), ['Scheme Code', 'Net Asset Value', 'Date']);
        const maxIdx = Math.max(...Object.values(H));

        for (const raw of lines) {
          const line = raw.replace(/\r$/, '');
          if (!line || !line.includes(';')) continue;
          const p = line.split(';');
          if (p.length <= maxIdx) continue;

          const code = (p[H['Scheme Code']] || '').trim();
          if (activeCodes.size > 0 && !activeCodes.has(code)) continue;

          const nav = +p[H['Net Asset Value']];
          const dMs = parseAmfiDate(p[H.Date]);
          if (!isFinite(nav) || nav <= 0 || !dMs) continue;

          const iso = msToISO(dMs);
          const key = `${code}_${iso}`;
          rowsMap.set(key, { code, navDate: iso, nav: +nav.toFixed(4) });
        }
        console.log(`[append] Parsed ${rowsMap.size} NAV records from AMFI history report.`);
      }
    } catch (err) {
      console.warn(`[append] Warning: Failed to fetch AMFI history report (${err.message}).`);
    }
  }

  console.log('[append] Checking AMFI NAVAll.txt for latest snapshot...');
  try {
    const navAllTxt = await fetchText('https://portal.amfiindia.com/spages/NAVAll.txt');
    const lines = navAllTxt.split('\n');
    if (lines.length > 1 && lines[0].includes(';')) {
      const H = headerIndex(lines[0].replace(/\r$/, ''), ['Scheme Code', 'Net Asset Value', 'Date']);
      const maxIdx = Math.max(...Object.values(H));
      let navAllCount = 0;

      for (const raw of lines) {
        const line = raw.replace(/\r$/, '');
        if (!line || !line.includes(';')) continue;
        const p = line.split(';');
        if (p.length <= maxIdx) continue;

        const code = (p[H['Scheme Code']] || '').trim();
        if (activeCodes.size > 0 && !activeCodes.has(code)) continue;

        const nav = +p[H['Net Asset Value']];
        const dMs = parseAmfiDate(p[H.Date]);
        if (!isFinite(nav) || nav <= 0 || !dMs) continue;

        const iso = msToISO(dMs);
        const key = `${code}_${iso}`;
        if (!rowsMap.has(key)) {
          rowsMap.set(key, { code, navDate: iso, nav: +nav.toFixed(4) });
          navAllCount++;
        }
      }
      if (navAllCount > 0) {
        console.log(`[append] Added ${navAllCount} additional records from NAVAll.txt.`);
      }
    }
  } catch (err) {
    console.warn(`[append] Warning: Could not fetch NAVAll.txt (${err.message}).`);
  }

  const allRows = Array.from(rowsMap.values());
  if (allRows.length === 0) {
    console.log('[append] No new NAV records found to append. Database is already up to date.');
  } else {
    console.log(`[append] Upserting ${allRows.length} NAV records into mf_nav_history (Turso)...`);
    const inserted = await upsertRows(allRows);
    console.log(`[append] Successfully upserted ${inserted} records.`);
  }

  const newStats = await getGlobalStats();
  console.log(`[append] Done. DB state -> latest date: ${newStats.latestDate}, total rows: ${newStats.totalRows}`);

  await pgClient.end();
}

main().catch((err) => {
  console.error('[append] FATAL Error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Update the workflow**

In `.github/workflows/screener.yml`, change:
```yaml
      - run: npm install pg@8
```
to:
```yaml
      - run: npm install pg@8 @tursodatabase/serverless
```
and change the "Append daily NAV history" step's env:
```yaml
      - name: Append daily NAV history
        env:
          POSTGRES_URL: ${{ secrets.POSTGRES_URL }}
        run: node scripts/append-nav-history.mjs
```
to:
```yaml
      - name: Append daily NAV history
        env:
          POSTGRES_URL: ${{ secrets.POSTGRES_URL }}
          TURSO_NAV_HISTORY_URL: ${{ secrets.TURSO_NAV_HISTORY_URL }}
          TURSO_NAV_HISTORY_TOKEN: ${{ secrets.TURSO_NAV_HISTORY_TOKEN }}
        run: node scripts/append-nav-history.mjs
```

- [ ] **Step 3: Verify**

Run: `node --env-file=.env.local scripts/append-nav-history.mjs`

Expected: `[append] Loaded N active funds from mf_screener.`, `[append] Latest recorded NAV date in DB is ...`, and ends with `[append] Done. DB state -> latest date: ..., total rows: ...` where `total rows` is at or above the count Task 3's backfill produced.

- [ ] **Step 4: Commit**

```bash
git add scripts/append-nav-history.mjs .github/workflows/screener.yml
git commit -m "feat(turso): cut over append-nav-history.mjs to navHistoryStore"
```

---

### Task 11: Cut over `scripts/build-screener.mjs` lineage preload (+ `screener.yml`)

**Files:**
- Modify: `scripts/build-screener.mjs`
- Modify: `.github/workflows/screener.yml`

**Interfaces:**
- Consumes: `getSeriesForCodes` from `lib/navHistoryStore.js`.

Only the lineage-history preload block (around line 333–354) touches `mf_nav_history`; `mf_screener`/`mf_inception` stay on Postgres via the existing `c` client, untouched.

- [ ] **Step 1: Rewrite the lineage preload block**

Add near the top imports: `import { getSeriesForCodes } from "../lib/navHistoryStore.js";`

Replace:
```js
  // ---- 3b. lineage database history fallback ----
  const dbHistoryMap = {};
  if (c) {
    const lineageCodes = Object.keys(LINEAGE);
    if (lineageCodes.length > 0) {
      try {
        const histRes = await c.query(
          'SELECT code, nav_date, nav FROM mf_nav_history WHERE code = ANY($1) ORDER BY nav_date ASC',
          [lineageCodes]
        );
        for (const r of histRes.rows) {
          (dbHistoryMap[r.code] ||= []).push({
            t: new Date(r.nav_date).getTime(),
            nav: parseFloat(r.nav)
          });
        }
        console.log(`[screener] loaded lineage history for ${Object.keys(dbHistoryMap).length} merged funds`);
      } catch (err) {
        console.warn(`[screener] could not preload lineage nav history: ${err.message}`);
      }
    }
  }
```
with:
```js
  // ---- 3b. lineage database history fallback ----
  const dbHistoryMap = {};
  {
    const lineageCodes = Object.keys(LINEAGE);
    if (lineageCodes.length > 0) {
      try {
        const histRows = await getSeriesForCodes(lineageCodes);
        for (const r of histRows) {
          (dbHistoryMap[r.code] ||= []).push({ t: new Date(r.navDate).getTime(), nav: r.nav });
        }
        console.log(`[screener] loaded lineage history for ${Object.keys(dbHistoryMap).length} merged funds`);
      } catch (err) {
        console.warn(`[screener] could not preload lineage nav history: ${err.message}`);
      }
    }
  }
```

- [ ] **Step 2: Update the workflow**

In `.github/workflows/screener.yml`, add the two Turso vars to the "Build + upsert screener dataset" step's env (keep `POSTGRES_URL` and `MONTHS`):
```yaml
      - name: Build + upsert screener dataset
        env:
          POSTGRES_URL: ${{ secrets.POSTGRES_URL }}
          TURSO_NAV_HISTORY_URL: ${{ secrets.TURSO_NAV_HISTORY_URL }}
          TURSO_NAV_HISTORY_TOKEN: ${{ secrets.TURSO_NAV_HISTORY_TOKEN }}
          MONTHS: "60"
        run: node scripts/build-screener.mjs
```

- [ ] **Step 3: Verify**

Run: `node --env-file=.env.local scripts/build-screener.mjs`

Expected: among the log output, a line `[screener] loaded lineage history for N merged funds` where N is close to 86 (the current lineage entry count), and no `could not preload lineage nav history` warning. The script's overall run should complete as it did before (writing `data/screener.json` and upserting `mf_screener`/`mf_inception`).

- [ ] **Step 4: Commit**

```bash
git add scripts/build-screener.mjs .github/workflows/screener.yml
git commit -m "feat(turso): cut over build-screener.mjs lineage preload to navHistoryStore"
```

---

### Task 12: Cut over `app/api/sector-detail/route.js`

**Files:**
- Modify: `app/api/sector-detail/route.js`

**Interfaces:**
- Consumes: `getLatestForIsins` from `lib/stockEodStore.js`.

Splits the single Postgres JOIN (`stock_eod` + `sector_isin_map` + `stock_signals`) into a Postgres query for ISINs, a Turso query for EOD data, a Postgres query for signals, merged in JS. The function's external return shape (field names) is preserved exactly, so the rest of the file (the `GET` handler) needs no changes.

- [ ] **Step 1: Rewrite `fetchStocksFromDB`**

Add the import: `import { getLatestForIsins } from '@/lib/stockEodStore';` (alongside the existing `import pool from '@/lib/db';` and `import { r2Get, r2Put } from '@/lib/r2';`).

Replace the whole `fetchStocksFromDB` function with:
```js
async function fetchStocksFromDB(sectorName) {
  const c = await pool.connect();
  let isins;
  try {
    const { rows } = await c.query(`SELECT isin FROM sector_isin_map WHERE sector = $1`, [sectorName]);
    isins = rows.map((r) => r.isin);
  } finally {
    c.release();
  }
  if (!isins.length) return [];

  const eodRows = await getLatestForIsins(isins);
  if (!eodRows.length) return [];
  const tradeDate = eodRows[0].tradeDate;

  const c2 = await pool.connect();
  let signalsByIsin;
  try {
    const { rows } = await c2.query(
      `SELECT isin, CAST(pct_from_52h AS FLOAT) AS pct_from_52h, CAST(pct_from_52l AS FLOAT) AS pct_from_52l
         FROM stock_signals WHERE snap_date = $1 AND isin = ANY($2)`,
      [tradeDate, isins]
    );
    signalsByIsin = new Map(rows.map((r) => [r.isin, r]));
  } finally {
    c2.release();
  }

  return eodRows
    .map((se) => {
      const ss = signalsByIsin.get(se.isin);
      const change = se.prevClose > 0 ? se.close - se.prevClose : 0;
      const p_change = se.prevClose > 0 ? Math.round(((se.close - se.prevClose) / se.prevClose) * 100 * 100) / 100 : 0;
      return {
        isin: se.isin,
        symbol: se.symbol,
        company_name: se.name,
        trade_date: se.tradeDate,
        last_price: se.close,
        previous_close: se.prevClose,
        open: se.open,
        day_high: se.high,
        day_low: se.low,
        total_traded_volume: se.volume,
        total_traded_value: se.turnover,
        change,
        p_change,
        near_wkh: ss ? ss.pct_from_52h : null,
        near_wkl: ss ? ss.pct_from_52l : null,
      };
    })
    .sort((a, b) => b.p_change - a.p_change);
}
```

The `GET` handler below (which reads `stockRows[0]?.trade_date`, and maps `r.symbol`, `r.company_name`, `r.last_price`, `r.change`, `r.p_change`, `r.open`, `r.day_high`, `r.day_low`, `r.previous_close`, `r.near_wkh`, `r.near_wkl`, `r.total_traded_volume`, `r.total_traded_value`) needs **no changes** — every field name above matches what it already expects.

- [ ] **Step 2: Verify**

Run: `npm run build`

Expected: build succeeds with no errors.

Run: `npm run dev` in one terminal, then in another:
```bash
curl -s "http://localhost:3000/api/sector-detail?index=NIFTY%20AUTO" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log('source:',j.source,'stocks:',j.stocks?.length);console.log(j.stocks?.[0]);});"
```
Expected: `source: db`, `stocks:` a positive count, and the first stock object has non-null `lastPrice`/`pChange`/`companyName` fields. Stop the dev server after checking.

- [ ] **Step 3: Commit**

```bash
git add app/api/sector-detail/route.js
git commit -m "feat(turso): split sector-detail's stock_eod join across Postgres and Turso"
```

---

### Task 13: Cut over `lib/holdingsLookup.js`'s `computeReturnsFromNavHistory`

**Files:**
- Modify: `lib/holdingsLookup.js`

**Interfaces:**
- Consumes: `getLatestNav`, `getNavAsOf`, `getOldestNav` from `lib/navHistoryStore.js`.

This is the live fallback path (step 5 of 6 in `resolveFundReturns`); behavior is preserved exactly, only the storage calls change.

- [ ] **Step 1: Rewrite the function**

Add the import near the top: `import { getLatestNav, getNavAsOf, getOldestNav } from './navHistoryStore.js';`

Replace lines 250–321 (`computeReturnsFromNavHistory`) with:
```js
async function computeReturnsFromNavHistory(code) {
  if (!code || !/^\d+$/.test(String(code))) return null;
  try {
    const latest = await getLatestNav(code);
    if (!latest) return null;
    const latestNav = latest.nav;
    const latestDate = new Date(latest.navDate);

    async function getNavAroundDate(targetDate) {
      const targetStr = targetDate.toISOString().split('T')[0];
      const r = await getNavAsOf(code, targetStr);
      return r ? { nav: r.nav, date: new Date(r.navDate) } : null;
    }

    const oldest = await getOldestNav(code);
    const oldestNav = oldest ? oldest.nav : null;
    const oldestDate = oldest ? new Date(oldest.navDate) : null;

    const d1y = new Date(latestDate);
    d1y.setFullYear(d1y.getFullYear() - 1);
    const nav1y = await getNavAroundDate(d1y);

    const d3y = new Date(latestDate);
    d3y.setFullYear(d3y.getFullYear() - 3);
    const nav3y = await getNavAroundDate(d3y);

    const d5y = new Date(latestDate);
    d5y.setFullYear(d5y.getFullYear() - 5);
    const nav5y = await getNavAroundDate(d5y);

    function cagr(startNav, endNav, years) {
      if (!startNav || !endNav || startNav <= 0 || endNav <= 0 || years <= 0) return null;
      return (Math.pow(endNav / startNav, 1 / years) - 1) * 100;
    }

    const ret1y = nav1y && (latestDate - nav1y.date) / (365.25 * 86400000) >= 0.9 ? cagr(nav1y.nav, latestNav, 1) : null;
    const ret3y = nav3y && (latestDate - nav3y.date) / (365.25 * 86400000) >= 2.9 ? cagr(nav3y.nav, latestNav, 3) : null;
    const ret5y = nav5y && (latestDate - nav5y.date) / (365.25 * 86400000) >= 4.9 ? cagr(nav5y.nav, latestNav, 5) : null;

    let retInception = null;
    if (oldestNav && oldestDate) {
      const yearsInception = (latestDate - oldestDate) / (365.25 * 86400000);
      if (yearsInception >= 0.5) {
        retInception = cagr(oldestNav, latestNav, yearsInception);
      } else if (yearsInception > 0) {
        retInception = ((latestNav - oldestNav) / oldestNav) * 100;
      }
    }

    return {
      ret1y: ret1y != null ? Math.round(ret1y * 100) / 100 : null,
      ret3y: ret3y != null ? Math.round(ret3y * 100) / 100 : null,
      ret5y: ret5y != null ? Math.round(ret5y * 100) / 100 : null,
      retInception: retInception != null ? Math.round(retInception * 100) / 100 : null,
    };
  } catch (err) {
    console.warn('[holdingsLookup] computeReturnsFromNavHistory error:', err.message);
    return null;
  }
}
```

- [ ] **Step 2: Verify**

Run: `npm run build`

Expected: build succeeds. Then a direct call check:
```bash
node -e "
const env = require('fs').readFileSync('.env.local','utf8');
for (const k of ['TURSO_NAV_HISTORY_URL','TURSO_NAV_HISTORY_TOKEN','POSTGRES_URL','R2_ACCOUNT_ID','R2_ACCESS_KEY_ID','R2_SECRET_ACCESS_KEY','R2_BUCKET_NAME']) {
  const m = env.match(new RegExp(k + '=\"([^\"]+)\"'));
  if (m) process.env[k] = m[1];
}
import('./lib/holdingsLookup.js').then(async () => {
  const mod = await import('./lib/navHistoryStore.js');
  const r = await mod.getLatestNav('100033');
  console.log('sanity check latest NAV for 100033:', r);
});
"
```
Expected: prints a `{nav, navDate}` object (this is just confirming the store still resolves against a real known fund code after the file-level import wiring change — the fuller check that holdings lookups still work end-to-end is covered by the site's normal usage, since there's no isolated harness to invoke `computeReturnsFromNavHistory` directly without a full holdings-lookup request).

- [ ] **Step 3: Commit**

```bash
git add lib/holdingsLookup.js
git commit -m "feat(turso): cut over holdingsLookup's NAV-history fallback to navHistoryStore"
```

---

### Task 14: Cut over `scripts/bootstrap-nav-history.mjs` (+ `bootstrap-nav-history.yml`)

**Files:**
- Modify: `scripts/bootstrap-nav-history.mjs`
- Modify: `.github/workflows/bootstrap-nav-history.yml`

**Interfaces:**
- Consumes: `getDb`, `upsertRows` from `lib/navHistoryStore.js`.

Manual/diagnostic tier (workflow_dispatch only). `mf_screener` read stays on Postgres.

- [ ] **Step 1: Rewrite the script**

```js
// scripts/bootstrap-nav-history.mjs
/**
 * scripts/bootstrap-nav-history.mjs
 *
 * One-time seed script for the mf_nav_history table (now on Turso).
 * Fetches full NAV history for all active funds in mf_screener from api.mfapi.in
 * and performs batched, idempotent upserts.
 *
 * Safe to re-run or resume if interrupted: checks existing populated funds.
 *
 * Usage:
 *   POSTGRES_URL="postgresql://..." node scripts/bootstrap-nav-history.mjs
 * Optional flags / env:
 *   FORCE=1  (re-fetch and update all funds even if already in DB)
 *   LIMIT=10 (fetch only first N funds for testing)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { getDb, upsertRows } from '../lib/navHistoryStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error('[bootstrap] FATAL: POSTGRES_URL environment variable is required.');
  process.exit(1);
}

const FORCE = process.env.FORCE === '1' || process.argv.includes('--force');
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '8', 10);

function mfapiToISO(s) {
  if (!s) return null;
  const parts = s.split('-');
  if (parts.length !== 3) return null;
  const [dd, mm, yy] = parts;
  return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

async function runConcurrent(items, fn, limit = 8) {
  const out = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function fetchMfapiHistory(code, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 404) {
        return { ok: false, notFound: true, error: '404 Not Found' };
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json && json.status === 'SUCCESS' && Array.isArray(json.data)) {
        return { ok: true, data: json.data, name: json.meta?.scheme_name || null };
      }
      throw new Error(json?.message || 'Invalid mfapi response shape');
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      } else {
        return { ok: false, error: err.message || String(err) };
      }
    }
  }
  return { ok: false, error: 'Unknown fetch error' };
}

async function main() {
  console.log('[bootstrap] Starting MF NAV history bootstrap...');
  const client = new pg.Client({
    connectionString: POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('[bootstrap] Connected to Postgres.');

  let activeCodes = [];
  try {
    const res = await client.query('SELECT DISTINCT code FROM mf_screener ORDER BY code ASC');
    activeCodes = res.rows.map((r) => String(r.code).trim()).filter(Boolean);
    console.log(`[bootstrap] Found ${activeCodes.length} active funds in mf_screener table.`);
  } catch (err) {
    console.warn(`[bootstrap] Could not read mf_screener table (${err.message}). Trying data/screener.json fallback...`);
    const fallbackPath = path.join(__dirname, '..', 'data', 'screener.json');
    if (fs.existsSync(fallbackPath)) {
      const data = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
      activeCodes = (data.funds || []).map((f) => String(f.code).trim()).filter(Boolean);
      console.log(`[bootstrap] Loaded ${activeCodes.length} funds from data/screener.json.`);
    }
  }

  if (activeCodes.length === 0) {
    console.error('[bootstrap] No fund codes found to bootstrap. Aborting.');
    await client.end();
    process.exit(1);
  }

  if (LIMIT && LIMIT > 0) {
    activeCodes = activeCodes.slice(0, LIMIT);
    console.log(`[bootstrap] Limiting to first ${LIMIT} funds as requested.`);
  }

  let codesToProcess = activeCodes;
  if (!FORCE) {
    const db = await getDb();
    const { rows: existingRows } = await db.execute(`
      SELECT code, COUNT(*) AS cnt
      FROM mf_nav_history
      GROUP BY code
      HAVING COUNT(*) > 10
    `);
    const populatedSet = new Set(existingRows.map((r) => String(r.code).trim()));
    codesToProcess = activeCodes.filter((c) => !populatedSet.has(c));
    console.log(`[bootstrap] ${populatedSet.size} funds already populated in DB. ${codesToProcess.length} remaining to fetch.`);
  }

  if (codesToProcess.length === 0) {
    console.log('[bootstrap] All funds already populated in mf_nav_history. Nothing to do. (Use FORCE=1 to re-seed).');
    await client.end();
    return;
  }

  console.log(`[bootstrap] Fetching history for ${codesToProcess.length} funds (concurrency: ${CONCURRENCY})...`);

  let completedCount = 0;
  let totalRowsInserted = 0;
  let successCount = 0;
  const failedFunds = [];

  const startTime = Date.now();

  await runConcurrent(
    codesToProcess,
    async (code) => {
      const result = await fetchMfapiHistory(code);
      completedCount++;

      if (!result.ok || !result.data || result.data.length === 0) {
        failedFunds.push({ code, reason: result.error || 'Empty data' });
        process.stdout.write(
          `\r[bootstrap] Progress: ${completedCount}/${codesToProcess.length} | Success: ${successCount} | Failed: ${failedFunds.length} | Total Rows: ${totalRowsInserted}`
        );
        return;
      }

      const parsedRows = [];
      for (const item of result.data) {
        const iso = mfapiToISO(item.date);
        const navNum = parseFloat(item.nav);
        if (iso && isFinite(navNum) && navNum > 0) {
          parsedRows.push({ code, navDate: iso, nav: +navNum.toFixed(4) });
        }
      }

      if (parsedRows.length > 0) {
        try {
          const inserted = await upsertRows(parsedRows);
          totalRowsInserted += inserted;
          successCount++;
        } catch (dbErr) {
          failedFunds.push({ code, reason: `DB error: ${dbErr.message}` });
        }
      } else {
        failedFunds.push({ code, reason: 'No valid numeric NAV rows' });
      }

      process.stdout.write(
        `\r[bootstrap] Progress: ${completedCount}/${codesToProcess.length} | Success: ${successCount} | Failed: ${failedFunds.length} | Total Rows: ${totalRowsInserted}`
      );
    },
    CONCURRENCY
  );

  console.log('\n');
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('====================================================');
  console.log(`[bootstrap] Finished in ${elapsedSec}s`);
  console.log(`[bootstrap] Funds processed:  ${codesToProcess.length}`);
  console.log(`[bootstrap] Succeeded:        ${successCount}`);
  console.log(`[bootstrap] Failed / Skipped: ${failedFunds.length}`);
  console.log(`[bootstrap] Total rows added: ${totalRowsInserted.toLocaleString()}`);
  console.log('====================================================');

  if (failedFunds.length > 0) {
    console.warn('[bootstrap] Failed fund summary:');
    for (const f of failedFunds.slice(0, 20)) {
      console.warn(`  - Code ${f.code}: ${f.reason}`);
    }
    if (failedFunds.length > 20) {
      console.warn(`  ... and ${failedFunds.length - 20} more.`);
    }
  }

  await client.end();
  console.log('[bootstrap] Postgres connection closed. Done.');
}

main().catch((err) => {
  console.error('[bootstrap] Unhandled exception:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Update the workflow**

In `.github/workflows/bootstrap-nav-history.yml`, change:
```yaml
      - name: Install deps
        run: npm install pg@8
```
to:
```yaml
      - name: Install deps
        run: npm install pg@8 @tursodatabase/serverless
```
and add the two Turso vars to both remaining steps' env:
```yaml
      - name: Run bootstrap script
        env:
          POSTGRES_URL: ${{ secrets.POSTGRES_URL }}
          TURSO_NAV_HISTORY_URL: ${{ secrets.TURSO_NAV_HISTORY_URL }}
          TURSO_NAV_HISTORY_TOKEN: ${{ secrets.TURSO_NAV_HISTORY_TOKEN }}
          FORCE: ${{ inputs.force && '1' || '0' }}
          LIMIT: ${{ inputs.limit }}
        run: node scripts/bootstrap-nav-history.mjs

      - name: Run verification report
        env:
          POSTGRES_URL: ${{ secrets.POSTGRES_URL }}
          TURSO_NAV_HISTORY_URL: ${{ secrets.TURSO_NAV_HISTORY_URL }}
          TURSO_NAV_HISTORY_TOKEN: ${{ secrets.TURSO_NAV_HISTORY_TOKEN }}
        run: node scripts/verify-nav-history.mjs
```

- [ ] **Step 3: Verify**

Run: `LIMIT=3 node --env-file=.env.local scripts/bootstrap-nav-history.mjs`

Expected: `[bootstrap] Limiting to first 3 funds as requested.` followed by a progress line and a summary block ending `[bootstrap] Postgres connection closed. Done.` with `Failed / Skipped: 0` (or a small number, if those 3 sample codes happen to already be well-populated and get skipped by the FORCE=0 check — either outcome is fine, it just needs to run without throwing).

- [ ] **Step 4: Commit**

```bash
git add scripts/bootstrap-nav-history.mjs .github/workflows/bootstrap-nav-history.yml
git commit -m "feat(turso): cut over bootstrap-nav-history.mjs to navHistoryStore"
```

---

### Task 15: Cut over `scripts/verify-nav-history.mjs`

**Files:**
- Modify: `scripts/verify-nav-history.mjs`

**Interfaces:**
- Consumes: `getDb`, `getGlobalStats`, `getDistinctCodes` from `lib/navHistoryStore.js`.

Manual/diagnostic tier. Uses `getDb()` for the ad-hoc aggregate queries the store's named functions don't cover, per the spec's stated lower-rigor path for this script. `mf_screener` cross-check stays on Postgres.

- [ ] **Step 1: Rewrite the script**

```js
// scripts/verify-nav-history.mjs
/**
 * scripts/verify-nav-history.mjs
 *
 * Verification and health-check script for the `mf_nav_history` table (Turso).
 * Analyzes coverage, freshness, gaps, and spot-checks popular funds.
 *
 * Usage:
 *   node scripts/verify-nav-history.mjs
 * Env: TURSO_NAV_HISTORY_URL, TURSO_NAV_HISTORY_TOKEN, POSTGRES_URL (for the mf_screener cross-check)
 */

import pg from 'pg';
import { getDb, getGlobalStats, getDistinctCodes } from '../lib/navHistoryStore.js';

const SAMPLE_CODES = [
  { code: '100033', name: 'HDFC Top 100 Fund' },
  { code: '112277', name: 'Axis Large Cap Fund' },
  { code: '107578', name: 'Mirae Asset Large Cap Fund' },
  { code: '102528', name: 'ICICI Prudential MidCap Fund' },
  { code: '101072', name: 'Quant Multi Asset Allocation Fund' },
];

async function main() {
  console.log('====================================================');
  console.log('       MF NAV History Table Verification Report     ');
  console.log('====================================================\n');

  const db = await getDb();

  const stats = await getGlobalStats();
  const { rows: minRows } = await db.execute(`SELECT MIN(nav_date) AS min_date FROM mf_nav_history`);
  const minDate = minRows[0]?.min_date || 'N/A';
  const maxDate = stats.latestDate || 'N/A';

  let screenerCount = 0;
  const POSTGRES_URL = process.env.POSTGRES_URL;
  const pgClient = POSTGRES_URL ? new pg.Client({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } }) : null;
  if (pgClient) {
    await pgClient.connect();
    try {
      const scrRes = await pgClient.query('SELECT COUNT(DISTINCT code) AS count FROM mf_screener');
      screenerCount = parseInt(scrRes.rows[0]?.count || '0', 10);
    } catch (_) {}
  }

  console.log(`📊 [Total Rows]:           ${stats.totalRows.toLocaleString()}`);
  console.log(`🏛️ [Funds in History]:     ${stats.totalFunds}`);
  console.log(`📋 [Funds in Screener]:    ${screenerCount > 0 ? screenerCount : 'N/A'}`);
  console.log(`📅 [Date Coverage Range]:  ${minDate}  →  ${maxDate}\n`);

  if (stats.totalRows === 0) {
    console.warn('⚠️ WARNING: `mf_nav_history` table is currently empty.');
    console.warn('   Run `node scripts/bootstrap-nav-history.mjs` to seed the table.\n');
    if (pgClient) await pgClient.end();
    return;
  }

  if (pgClient && screenerCount > 0) {
    const { rows: screenerFunds } = await pgClient.query('SELECT code, name FROM mf_screener');
    const historyCodes = new Set(await getDistinctCodes());
    const missing = screenerFunds.filter((f) => !historyCodes.has(String(f.code)));

    if (missing.length === 0) {
      console.log('✅ [Coverage]: 100% of screener funds are covered in history table.');
    } else {
      console.warn(`⚠️ [Coverage]: ${missing.length} screener funds are missing from history table.`);
      for (const m of missing.slice(0, 20)) {
        console.warn(`    - ${m.code}: ${m.name}`);
      }
      if (missing.length > 20) {
        console.warn(`    ... and ${missing.length - 20} more.`);
      }
    }
  }

  const { rows: staleRows } = await db.execute(`
    SELECT code, MAX(nav_date) AS latest
    FROM mf_nav_history
    GROUP BY code
    HAVING MAX(nav_date) < date('now', '-5 days')
    ORDER BY latest ASC
    LIMIT 15
  `);
  const { rows: staleCountRows } = await db.execute(`
    SELECT COUNT(*) AS count FROM (
      SELECT code FROM mf_nav_history GROUP BY code HAVING MAX(nav_date) < date('now', '-5 days')
    )
  `);
  const staleCount = Number(staleCountRows[0]?.count || 0);

  if (staleCount === 0) {
    console.log('✅ [Freshness]: All active funds have up-to-date NAVs.');
  } else {
    console.log(`ℹ️ [Freshness]: ${staleCount} funds have latest NAV > 5 days old (may be matured/merged schemes).`);
    for (const s of staleRows) {
      console.log(`    - Code ${s.code}: latest NAV date was ${s.latest}`);
    }
  }

  const { rows: sparseCountRows } = await db.execute(`
    SELECT COUNT(*) AS count FROM (
      SELECT code FROM mf_nav_history GROUP BY code HAVING COUNT(*) < 30
    )
  `);
  const sparseCount = Number(sparseCountRows[0]?.count || 0);

  if (sparseCount === 0) {
    console.log('✅ [Data Density]: All funds have >= 30 history points.');
  } else {
    console.log(`ℹ️ [Data Density]: ${sparseCount} funds have < 30 points (newly launched NFOs/funds).`);
  }

  console.log('\n🔍 [Spot Check Sample Funds]:');
  console.log('----------------------------------------------------');
  for (const item of SAMPLE_CODES) {
    const { rows } = await db.execute(`
      SELECT
        COUNT(*) AS count,
        MIN(nav_date) AS min_date,
        MAX(nav_date) AS max_date,
        (SELECT nav FROM mf_nav_history WHERE code = ? ORDER BY nav_date DESC LIMIT 1) AS latest_nav,
        (SELECT nav FROM mf_nav_history WHERE code = ? ORDER BY nav_date ASC LIMIT 1) AS oldest_nav
      FROM mf_nav_history
      WHERE code = ?
    `, [item.code, item.code, item.code]);

    const row = rows[0];
    const count = Number(row?.count || 0);

    if (count > 0) {
      console.log(`✅ [${item.code}] ${item.name}:`);
      console.log(`    Points: ${count.toLocaleString()} | Range: ${row.min_date} (₹${row.oldest_nav}) → ${row.max_date} (₹${row.latest_nav})`);
    } else {
      console.log(`⚠️ [${item.code}] ${item.name}: No records found in DB.`);
    }
  }

  console.log('----------------------------------------------------');
  console.log('\n[verify] Verification check completed successfully.');

  if (pgClient) await pgClient.end();
}

main().catch((err) => {
  console.error('[verify] Verification failed with error:', err);
  process.exit(1);
});
```

(No workflow changes needed — Task 14 already added the Turso vars to this script's step in `bootstrap-nav-history.yml`.)

- [ ] **Step 2: Verify**

Run: `node --env-file=.env.local scripts/verify-nav-history.mjs`

Expected: the full report prints without throwing, ending with `[verify] Verification check completed successfully.`

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-nav-history.mjs
git commit -m "feat(turso): cut over verify-nav-history.mjs to navHistoryStore"
```

---

### Task 16: Cut over `scripts/sync-lineage-to-nav-history.mjs`

**Files:**
- Modify: `scripts/sync-lineage-to-nav-history.mjs`

**Interfaces:**
- Consumes: `getSeriesForCode`, `upsertRows` from `lib/navHistoryStore.js`.

This script touches only `mf_nav_history` (no other Postgres table) — it drops `pg` entirely.

- [ ] **Step 1: Rewrite the script**

```js
// scripts/sync-lineage-to-nav-history.mjs
/**
 * scripts/sync-lineage-to-nav-history.mjs
 *
 * Rebase and backfill predecessor NAV records for all merged schemes defined
 * in data/scheme-lineage.json into the Turso `mf_nav_history` database.
 *
 * For each surviving scheme code (e.g. 140225 - Edelweiss Mid Cap):
 * 1. Fetches current history and predecessor history (e.g. 107301 - JPMorgan).
 * 2. Uses `stitchSeries()` from lib/schemeLineage.js to rebase the predecessor NAVs
 *    onto the surviving scheme's NAV scale (preserving exact returns).
 * 3. Inserts all rebased pre-merger records into `mf_nav_history` under the surviving `code`.
 *
 * Run with: node --env-file=.env.local scripts/sync-lineage-to-nav-history.mjs
 */

import LINEAGE from '../data/scheme-lineage.json' with { type: 'json' };
import { stitchSeries } from '../lib/schemeLineage.js';
import { getSeriesForCode, upsertRows } from '../lib/navHistoryStore.js';

function parseDateToYMD(dStr) {
  if (dStr.includes('-')) {
    const parts = dStr.split('-');
    if (parts[0].length === 4) return dStr;
    const [dd, mm, yyyy] = parts;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }
  return dStr;
}

function norm(data) {
  return data.map(d => {
    const [dd, mm, yy] = d.date.split('-').map(Number);
    return {
      t: Date.UTC(yy, mm - 1, dd),
      nav: parseFloat(d.nav),
      dateStr: parseDateToYMD(d.date),
    };
  }).filter(p => !isNaN(p.nav) && p.nav > 0).sort((a, b) => a.t - b.t);
}

async function fetchFromMfapi(code) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://api.mfapi.in/mf/${code}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (data && Array.isArray(data.data) && data.data.length) {
        return data.data;
      }
    } catch (_) {
      await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
  return null;
}

async function dbHistoryAsMfapiShape(code) {
  const series = await getSeriesForCode(code);
  return series.map((r) => {
    const [y, m, d] = r.navDate.split('-');
    return { date: `${d}-${m}-${y}`, nav: String(r.nav) };
  });
}

async function main() {
  const entries = Object.entries(LINEAGE);
  console.log(`[lineage-sync] Processing ${entries.length} lineage entries...`);

  let totalStitchedRows = 0;
  let successCount = 0;

  for (const [code, { pred, from }] of entries) {
    try {
      console.log(`\n[lineage-sync] Processing scheme ${code} <- ${pred} (${from})...`);

      let curRaw = await dbHistoryAsMfapiShape(code);
      if (curRaw.length <= 50) curRaw = await fetchFromMfapi(code);

      if (!curRaw || !curRaw.length) {
        console.warn(`⚠️ Could not fetch current history for ${code}`);
        continue;
      }

      let predRaw = await dbHistoryAsMfapiShape(pred);
      if (predRaw.length <= 50) predRaw = await fetchFromMfapi(pred);

      if (!predRaw || !predRaw.length) {
        console.warn(`⚠️ Could not fetch predecessor history for ${pred}`);
        continue;
      }

      const curNorm = norm(curRaw);
      const predNorm = norm(predRaw);

      const stitched = stitchSeries(curNorm, predNorm);
      if (!stitched) {
        console.warn(`⚠️ Boundary check failed for ${code} <- ${pred}`);
        continue;
      }

      const allCurRows = stitched.series.map(p => ({
        code: String(code),
        navDate: new Date(p.t).toISOString().slice(0, 10),
        nav: p.nav,
      }));

      console.log(`[lineage-sync] Stitched full continuous series of ${allCurRows.length} records for scheme ${code}.`);

      const rawPredRows = predNorm.map(p => ({
        code: String(pred),
        navDate: new Date(p.t).toISOString().slice(0, 10),
        nav: p.nav,
      }));

      const insertedCur = await upsertRows(allCurRows);
      const insertedPred = await upsertRows(rawPredRows);

      totalStitchedRows += insertedCur;
      successCount++;
      console.log(`✅ Upserted ${insertedCur} rows for ${code} and ${insertedPred} rows for ${pred}. Oldest: ${allCurRows[0]?.navDate}`);

    } catch (err) {
      console.error(`❌ Error syncing lineage for ${code}:`, err.message);
    }
  }

  console.log(`\n========================================`);
  console.log(`[lineage-sync] Finished! Successfully synced ${successCount}/${entries.length} lineage funds.`);
  console.log(`[lineage-sync] Total pre-merger records added to mf_nav_history: ${totalStitchedRows}`);
  console.log(`========================================\n`);
}

main().catch(err => {
  console.error('[lineage-sync] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify**

Run: `node --env-file=.env.local scripts/sync-lineage-to-nav-history.mjs`

Expected: `[lineage-sync] Processing 86 lineage entries...` followed by per-scheme progress lines, ending with `[lineage-sync] Finished! Successfully synced N/86 lineage funds.` (N should be close to 86 — a handful of failures due to upstream API flakiness is normal and matches prior behavior).

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-lineage-to-nav-history.mjs
git commit -m "feat(turso): cut over sync-lineage-to-nav-history.mjs to navHistoryStore"
```

---

### Task 17: Cut over `scripts/recalc-merged-screener.mjs`

**Files:**
- Modify: `scripts/recalc-merged-screener.mjs`

**Interfaces:**
- Consumes: `getSeriesForCode` from `lib/navHistoryStore.js`.

`mf_screener` read+write stays on Postgres.

- [ ] **Step 1: Rewrite the script**

```js
// scripts/recalc-merged-screener.mjs
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { getSeriesForCode } from '../lib/navHistoryStore.js';

const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;

async function main() {
  const client = new pg.Client({
    connectionString: POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const lineagePath = path.join(process.cwd(), 'data', 'scheme-lineage.json');
  const LINEAGE = JSON.parse(fs.readFileSync(lineagePath, 'utf8'));

  const overridesPath = path.join(process.cwd(), 'data', 'mf-inception-overrides.json');
  const OVERRIDES = JSON.parse(fs.readFileSync(overridesPath, 'utf8'));

  const codes = Object.keys(LINEAGE);
  console.log(`Checking ${codes.length} lineage codes in mf_screener...`);

  const D = 864e5;
  const Y = 365.25 * D;

  for (const code of codes) {
    const scrRes = await client.query('SELECT * FROM mf_screener WHERE code = $1', [code]);
    if (!scrRes.rows.length) continue;
    const f = scrRes.rows[0];

    const histRows = await getSeriesForCode(code);
    if (!histRows.length) continue;

    let mfapiData = [];
    try {
      const res = await fetch(`https://api.mfapi.in/mf/${code}`);
      const json = await res.json();
      if (json && json.data) {
        mfapiData = json.data.map(d => {
          const [dd, mm, yy] = d.date.split('-').map(Number);
          return { t: Date.UTC(yy, mm - 1, dd), nav: parseFloat(d.nav), date: d.date };
        }).filter(p => !isNaN(p.nav) && p.nav > 0);
      }
    } catch (e) {}

    const dbData = histRows.map(r => ({
      t: new Date(r.navDate).getTime(),
      nav: r.nav,
      date: r.navDate,
    })).filter(r => !isNaN(r.nav) && r.nav > 0);

    const tMap = new Map();
    for (const p of dbData) tMap.set(p.t, p);
    for (const p of mfapiData) tMap.set(p.t, p);
    const series = Array.from(tMap.values()).sort((a, b) => a.t - b.t);

    if (!series.length) continue;

    const latest = series[series.length - 1];
    const now = latest.t;
    const currentNav = parseFloat(f.nav) || latest.nav;

    function getNavAtOrBefore(targetT) {
      for (let i = series.length - 1; i >= 0; i--) {
        if (series[i].t <= targetT) {
          if (targetT - series[i].t <= 14 * D) {
            return series[i].nav;
          }
          return null;
        }
      }
      return null;
    }

    const ANCHORS = [
      { key: "ret_1m", t: now - 30 * D, yrs: null },
      { key: "ret_3m", t: now - 91 * D, yrs: null },
      { key: "ret_6m", t: now - 182 * D, yrs: null },
      { key: "ret_1y", t: now - 1 * Y, yrs: 1 },
      { key: "ret_3y", t: now - 3 * Y, yrs: 3 },
      { key: "ret_5y", t: now - 5 * Y, yrs: 5 },
      { key: "ret_7y", t: now - 7 * Y, yrs: 7 },
      { key: "ret_10y", t: now - 10 * Y, yrs: 10 },
    ];

    const ret = {};
    const pc = (x) => (x == null ? null : +(x * 100).toFixed(2));

    for (const a of ANCHORS) {
      const then = getNavAtOrBefore(a.t);
      ret[a.key] = then ? pc(a.yrs ? Math.pow(currentNav / then, 1 / a.yrs) - 1 : currentNav / then - 1) : null;
    }

    const override = OVERRIDES[code];
    let incDate = override?.inception_date || (series.length ? new Date(series[0].t).toISOString().slice(0, 10) : null);
    let incNav = override?.inception_nav ?? (series.length ? series[0].nav : 10);
    const incTs = incDate ? new Date(incDate).getTime() : series[0].t;
    const incYears = (now - incTs) / Y;
    const retInception = incYears > 0.5 ? pc(Math.pow(currentNav / incNav, 1 / incYears) - 1) : null;
    const ageYears = +incYears.toFixed(1);

    console.log(`[recalc] Code ${code} (${f.name}):`);
    console.log(`  1Y: ${ret.ret_1y}%, 3Y: ${ret.ret_3y}%, 5Y: ${ret.ret_5y}%, 7Y: ${ret.ret_7y}%, 10Y: ${ret.ret_10y}%`);
    console.log(`  Inception: ${incDate} (${ageYears} yrs) -> ${retInception}% CAGR`);

    await client.query(
      `UPDATE mf_screener SET
        ret_1m = COALESCE($1, ret_1m),
        ret_3m = COALESCE($2, ret_3m),
        ret_6m = COALESCE($3, ret_6m),
        ret_1y = COALESCE($4, ret_1y),
        ret_3y = COALESCE($5, ret_3y),
        ret_5y = COALESCE($6, ret_5y),
        ret_7y = COALESCE($7, ret_7y),
        ret_10y = COALESCE($8, ret_10y),
        age_years = $9,
        inception_date = $10,
        ret_inception = COALESCE($11, ret_inception)
      WHERE code = $12`,
      [
        ret.ret_1m, ret.ret_3m, ret.ret_6m,
        ret.ret_1y, ret.ret_3y, ret.ret_5y, ret.ret_7y, ret.ret_10y,
        ageYears, incDate, retInception, code
      ]
    );
  }

  const allScr = await client.query('SELECT * FROM mf_screener ORDER BY ret_3y DESC NULLS LAST');
  const screenerPath = path.join(process.cwd(), 'data', 'screener.json');
  fs.writeFileSync(screenerPath, JSON.stringify(allScr.rows, null, 2), 'utf8');
  console.log(`Updated data/screener.json with ${allScr.rows.length} rows.`);

  await client.end();
}

main().catch(console.error);
```

- [ ] **Step 2: Verify**

Run: `node --env-file=.env.local scripts/recalc-merged-screener.mjs`

Expected: `Checking 86 lineage codes in mf_screener...` followed by `[recalc] Code ...` blocks for each matched code, ending with `Updated data/screener.json with N rows.` and no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/recalc-merged-screener.mjs
git commit -m "feat(turso): cut over recalc-merged-screener.mjs to navHistoryStore"
```

---

### Task 18: Cut over `scripts/audit-nav-coverage.mjs`

**Files:**
- Modify: `scripts/audit-nav-coverage.mjs`

**Interfaces:**
- Consumes: `getDb`, `getGlobalStats` from `lib/navHistoryStore.js`.

`mf_screener` stays on Postgres; both former JOINs split into two queries merged in JS.

- [ ] **Step 1: Rewrite the script**

```js
// scripts/audit-nav-coverage.mjs
import pg from "pg";
import { getDb, getGlobalStats } from "../lib/navHistoryStore.js";

async function main() {
  const c = new pg.Client({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();
  const db = await getDb();

  // Total DB coverage
  const stats = await getGlobalStats();
  const { rows: minRows } = await db.execute(`SELECT MIN(nav_date) AS min_date FROM mf_nav_history`);
  console.log(`DB State: ${stats.totalRows.toLocaleString()} rows | ${stats.totalFunds} funds | ${minRows[0]?.min_date} -> ${stats.latestDate}`);
  console.log("");

  // Breakdown by latest NAV date
  const { rows: breakdown } = await db.execute(`
    SELECT latest_date, COUNT(*) as fund_count
    FROM (
      SELECT code, MAX(nav_date) as latest_date
      FROM mf_nav_history
      GROUP BY code
    )
    GROUP BY latest_date
    ORDER BY latest_date DESC
    LIMIT 10
  `);
  console.log("Funds by latest NAV date:");
  for (const r of breakdown) {
    console.log(`  ${r.latest_date}: ${r.fund_count} funds`);
  }

  // Any funds stuck before Aug 18? -- get per-code latest dates from Turso, match names against Postgres
  const { rows: allLatest } = await db.execute(
    `SELECT code, MAX(nav_date) as latest FROM mf_nav_history GROUP BY code HAVING MAX(nav_date) < ?`,
    ['2026-08-18']
  );
  const staleCodes = allLatest.map((r) => r.code);
  let staleRows = [];
  if (staleCodes.length) {
    const ph = staleCodes.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await c.query(`SELECT code, name FROM mf_screener WHERE code IN (${ph})`, staleCodes);
    const nameByCode = new Map(rows.map((r) => [String(r.code), r.name]));
    staleRows = allLatest
      .filter((r) => nameByCode.has(r.code))
      .map((r) => ({ code: r.code, name: nameByCode.get(r.code), latest: r.latest }))
      .sort((a, b) => (a.latest < b.latest ? -1 : a.latest > b.latest ? 1 : (+a.code - +b.code)));
  }
  console.log(`\nFunds stuck before Aug 18: ${staleRows.length}`);
  staleRows.forEach(r => console.log(`  - ${r.code} ${r.name} -> latest: ${r.latest}`));

  // Cross-check: funds in screener NOT in history at all?
  const { rows: screenerFunds } = await c.query('SELECT code, name FROM mf_screener');
  const { rows: historyCodeRows } = await db.execute(`SELECT DISTINCT code FROM mf_nav_history`);
  const historyCodeSet = new Set(historyCodeRows.map((r) => r.code));
  const missing = screenerFunds.filter((f) => !historyCodeSet.has(String(f.code)));
  console.log(`\nFunds in screener with NO history at all: ${missing.length}`);
  missing.forEach(r => console.log(`  - ${r.code} ${r.name}`));

  await c.end();
  console.log("\n✅ Audit complete.");
}

main().catch(e => { console.error(e.message); process.exit(1); });
```

(The hardcoded `'2026-08-18'` cutoff is carried over unchanged from the original script — it's a one-off diagnostic threshold from this repo's earlier incident investigation, not a parameter this migration should touch.)

- [ ] **Step 2: Verify**

Run: `node --env-file=.env.local scripts/audit-nav-coverage.mjs`

Expected: `DB State: ... rows | ... funds | ... -> ...`, a "Funds by latest NAV date" breakdown, a "Funds stuck before Aug 18" count, a "Funds in screener with NO history at all" count, ending `✅ Audit complete.` with no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/audit-nav-coverage.mjs
git commit -m "feat(turso): cut over audit-nav-coverage.mjs to navHistoryStore"
```

---

### Task 19: Observe one full cycle, then reclaim Postgres space

**Files:**
- Create: `scripts/check-turso-cutover-health.mjs`

**Interfaces:**
- Consumes: `getGlobalStats` from `lib/navHistoryStore.js`, `getLatestTradeDate` from `lib/stockEodStore.js`.

This is the gated final step. It must not run until Tasks 6–18 have deployed and at least one real scheduled run of `screener.yml` (daily) and `breadth.yml` (weekdays) has completed against Turso.

- [ ] **Step 1: Create the health-check script**

```js
// scripts/check-turso-cutover-health.mjs
/**
 * Pre-flight check before reclaiming Postgres space (dropping mf_nav_history /
 * stock_eod). Confirms Turso's latest dates are current — i.e. at least one
 * full nightly cycle has run cleanly post-cutover — and prints the current
 * Postgres storage size for a before/after comparison.
 *
 * Usage: node scripts/check-turso-cutover-health.mjs
 */

import pg from 'pg';
import { getGlobalStats } from '../lib/navHistoryStore.js';
import { getLatestTradeDate } from '../lib/stockEodStore.js';

function daysAgo(dateStr) {
  if (!dateStr) return Infinity;
  return (Date.now() - new Date(dateStr).getTime()) / 86400000;
}

async function main() {
  const navStats = await getGlobalStats();
  const eodLatest = await getLatestTradeDate();

  console.log(`[health] mf_nav_history (Turso) — latest date: ${navStats.latestDate} (${daysAgo(navStats.latestDate).toFixed(1)}d ago), ${navStats.totalRows.toLocaleString()} rows`);
  console.log(`[health] stock_eod (Turso)      — latest date: ${eodLatest} (${daysAgo(eodLatest).toFixed(1)}d ago)`);

  const navFresh = daysAgo(navStats.latestDate) <= 2;
  const eodFresh = daysAgo(eodLatest) <= 4; // stock_eod only updates on weekdays

  if (!navFresh || !eodFresh) {
    console.warn('\n[health] NOT READY — one or both tables look stale. Do not reclaim Postgres space yet.');
    process.exitCode = 1;
  } else {
    console.log('\n[health] Both tables look current — safe to proceed with reclaiming Postgres space.');
  }

  const client = new pg.Client({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows } = await client.query(`SELECT pg_size_pretty(pg_database_size(current_database())) AS sz`);
  console.log(`[health] Current Postgres database size: ${rows[0].sz}`);
  await client.end();
}

main().catch((err) => { console.error('[health] FATAL:', err); process.exit(1); });
```

- [ ] **Step 2: Run it**

Run: `node --env-file=.env.local scripts/check-turso-cutover-health.mjs`

Expected: `[health] Both tables look current — safe to proceed with reclaiming Postgres space.` and exit code 0. If it prints `NOT READY`, stop here — wait for the next scheduled workflow runs and re-check later; do not proceed to Step 3.

- [ ] **Step 3: Commit the health-check script**

```bash
git add scripts/check-turso-cutover-health.mjs
git commit -m "feat(turso): add post-cutover health check before reclaiming Postgres space"
```

- [ ] **Step 4: Reclaim the space — requires live human confirmation, do not automate**

This step drops production tables and is irreversible. Whoever is executing this task (a subagent or the controlling session) must stop here, report Step 2's output to the user, and get an explicit go-ahead before running anything below. Do not run these statements as part of unattended task execution.

Once confirmed, run against Postgres:
```sql
DROP TABLE IF EXISTS mf_nav_history;
DROP TABLE IF EXISTS stock_eod;
```

Then confirm the space was freed:
```bash
node --env-file=.env.local scripts/check-turso-cutover-health.mjs
```
(This will now fail with a connection-level error on the `pg_database_size` query only if `POSTGRES_URL` itself is bad — that query doesn't depend on the two dropped tables, so it should still print a smaller database size than Task 19 Step 2 reported.)

---
