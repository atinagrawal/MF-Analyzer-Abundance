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
