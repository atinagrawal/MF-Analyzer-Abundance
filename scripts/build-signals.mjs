/**
 * scripts/build-signals.mjs — per-stock signal precomputation for the liquid universe.
 *
 * For each trading day that has a market_breadth snapshot but no stock_signals rows,
 * this script computes individual signal flags for every stock in the same liquid
 * universe (top-1100 by 60-session avg turnover) used by build-breadth.mjs.
 *
 * Signals per stock:
 *   - above_20/50/100/150/200: close > N-day SMA
 *   - dma20/50/100/150/200: the SMA value itself
 *   - golden_cross / death_cross: 50x200 cross within last 25 sessions
 *   - bull_stacked / bear_stacked: price > (or <) all 5 MAs in strict order
 *   - new_high_52w / new_low_52w: intraday high/low equals 252-session extremes
 *   - pct_from_52h / pct_from_52l: % distance from 52-week high and low
 *   - adv_dec: 1=advancing, -1=declining, 0=unchanged vs prev_close
 *
 * Usage:
 *   node scripts/build-signals.mjs              # self-heal: fill missing dates
 *   node scripts/build-signals.mjs --date=YYYY-MM-DD
 *   node scripts/build-signals.mjs --all        # recompute every date (slow backfill)
 * Env: POSTGRES_URL (required).
 */

import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

// Parse DATE columns as plain strings to avoid node-postgres timezone shift
// (without this, midnight-local dates shift to the previous day's UTC string).
pg.types.setTypeParser(1082, (val) => val);

const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}`)); return a ? (a.includes("=") ? a.split("=")[1] : true) : null; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const DMAS = [20, 50, 100, 150, 200];
const WIN52 = 252;
const LIQUID_N = 1100;
const TURN_WINDOW = 60;

async function ensureTable(c) {
  await c.query(`CREATE TABLE IF NOT EXISTS stock_signals (
    snap_date    DATE    NOT NULL,
    isin         TEXT    NOT NULL,
    symbol       TEXT,
    name         TEXT,
    close        NUMERIC,
    above_20     BOOLEAN,
    above_50     BOOLEAN,
    above_100    BOOLEAN,
    above_150    BOOLEAN,
    above_200    BOOLEAN,
    dma20        NUMERIC,
    dma50        NUMERIC,
    dma100       NUMERIC,
    dma150       NUMERIC,
    dma200       NUMERIC,
    golden_cross BOOLEAN,
    death_cross  BOOLEAN,
    bull_stacked BOOLEAN,
    bear_stacked BOOLEAN,
    new_high_52w BOOLEAN,
    new_low_52w  BOOLEAN,
    pct_from_52h NUMERIC,
    pct_from_52l NUMERIC,
    adv_dec      SMALLINT,
    PRIMARY KEY (snap_date, isin)
  )`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_stock_signals_date ON stock_signals (snap_date)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_stock_signals_isin ON stock_signals (isin, snap_date)`);
}

const smaBack = (c, n, back) => { const end = c.length - back, start = end - n; return start < 0 ? null : mean(c.slice(start, end)); };

function computeStockSignals(byIsin, D) {
  // select liquid universe: same logic as build-breadth.mjs
  const cand = [];
  for (const [isin, ser] of byIsin) {
    const last = ser[ser.length - 1];
    if (!last || last.t !== D) continue;
    const k = Math.min(TURN_WINDOW, ser.length);
    let s = 0; for (let i = ser.length - k; i < ser.length; i++) s += ser[i].tov || 0;
    cand.push({ isin, ser, last, tov: s / k });
  }
  cand.sort((a, b) => b.tov - a.tov);
  const uni = cand.slice(0, LIQUID_N);

  const out = [];
  for (const { isin, ser, last } of uni) {
    const closes = ser.map((r) => r.close);
    const smas = {};
    for (const n of DMAS) smas[n] = smaBack(closes, n, 0);

    // 52-week extremes
    let h52 = null, l52 = null, pct_from_52h = null, pct_from_52l = null;
    let new_high_52w = false, new_low_52w = false;
    if (ser.length >= 200) {
      const w = ser.slice(-WIN52);
      h52 = Math.max(...w.map((r) => r.high ?? r.close));
      l52 = Math.min(...w.map((r) => r.low ?? r.close));
      if (h52 > 0) pct_from_52h = +((last.close - h52) / h52 * 100).toFixed(2);
      if (l52 > 0) pct_from_52l = +((last.close - l52) / l52 * 100).toFixed(2);
      new_high_52w = (last.high ?? last.close) >= h52;
      new_low_52w  = (last.low  ?? last.close) <= l52;
    }

    // golden / death cross: 50x200 within last 25 sessions
    const s50n = smas[50], s200n = smas[200];
    const s50p = smaBack(closes, 50, 25), s200p = smaBack(closes, 200, 25);
    let golden_cross = false, death_cross = false;
    if (s50n != null && s200n != null && s50p != null && s200p != null) {
      if (s50n > s200n && s50p <= s200p) golden_cross = true;
      else if (s50n < s200n && s50p >= s200p) death_cross = true;
    }

    // stacked alignment
    const p = last.close;
    let bull_stacked = false, bear_stacked = false;
    if (smas[20] != null && smas[200] != null) {
      if (p > smas[20] && smas[20] > smas[50] && smas[50] > smas[100] && smas[100] > smas[150] && smas[150] > smas[200]) bull_stacked = true;
      else if (p < smas[20] && smas[20] < smas[50] && smas[50] < smas[100] && smas[100] < smas[150] && smas[150] < smas[200]) bear_stacked = true;
    }

    // adv/dec
    let adv_dec = null;
    if (last.prev != null) adv_dec = last.close > last.prev ? 1 : last.close < last.prev ? -1 : 0;

    out.push({
      isin, symbol: last.sym, name: last.nm, close: last.close,
      above_20: smas[20] != null ? p > smas[20] : null,
      above_50: smas[50] != null ? p > smas[50] : null,
      above_100: smas[100] != null ? p > smas[100] : null,
      above_150: smas[150] != null ? p > smas[150] : null,
      above_200: smas[200] != null ? p > smas[200] : null,
      dma20: smas[20] != null ? +smas[20].toFixed(2) : null,
      dma50: smas[50] != null ? +smas[50].toFixed(2) : null,
      dma100: smas[100] != null ? +smas[100].toFixed(2) : null,
      dma150: smas[150] != null ? +smas[150].toFixed(2) : null,
      dma200: smas[200] != null ? +smas[200].toFixed(2) : null,
      golden_cross, death_cross, bull_stacked, bear_stacked,
      new_high_52w, new_low_52w, pct_from_52h, pct_from_52l, adv_dec,
    });
  }
  return out;
}

async function loadWindow(c, endDate, days = 400) {
  const { rows } = await c.query(
    `SELECT isin, symbol, name, trade_date, close, high, low, prev_close, turnover
       FROM stock_eod
      WHERE trade_date > ($1::date - $2::int) AND trade_date <= $1::date
      ORDER BY isin, trade_date`,
    [endDate, days]
  );
  const byIsin = new Map();
  for (const r of rows) {
    const t = r.trade_date;
    if (!byIsin.has(r.isin)) byIsin.set(r.isin, []);
    byIsin.get(r.isin).push({
      t,
      sym: r.symbol, nm: r.name,
      close: +r.close,
      high: r.high == null ? null : +r.high,
      low: r.low == null ? null : +r.low,
      prev: r.prev_close == null ? null : +r.prev_close,
      tov: r.turnover == null ? 0 : +r.turnover,
    });
  }
  return byIsin;
}

async function upsertSignals(c, D, stocks) {
  const CHUNK = 200;
  for (let i = 0; i < stocks.length; i += CHUNK) {
    const slice = stocks.slice(i, i + CHUNK);
    const vals = [];
    const ph = slice.map((r, j) => {
      const b = j * 24;
      vals.push(
        D, r.isin, r.symbol, r.name, r.close,
        r.above_20, r.above_50, r.above_100, r.above_150, r.above_200,
        r.dma20, r.dma50, r.dma100, r.dma150, r.dma200,
        r.golden_cross, r.death_cross, r.bull_stacked, r.bear_stacked,
        r.new_high_52w, r.new_low_52w, r.pct_from_52h, r.pct_from_52l, r.adv_dec
      );
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18},$${b+19},$${b+20},$${b+21},$${b+22},$${b+23},$${b+24})`;
    }).join(",");
    await c.query(
      `INSERT INTO stock_signals
         (snap_date,isin,symbol,name,close,above_20,above_50,above_100,above_150,above_200,
          dma20,dma50,dma100,dma150,dma200,golden_cross,death_cross,bull_stacked,bear_stacked,
          new_high_52w,new_low_52w,pct_from_52h,pct_from_52l,adv_dec)
       VALUES ${ph}
       ON CONFLICT (snap_date,isin) DO UPDATE SET
         symbol=EXCLUDED.symbol, name=EXCLUDED.name, close=EXCLUDED.close,
         above_20=EXCLUDED.above_20, above_50=EXCLUDED.above_50, above_100=EXCLUDED.above_100,
         above_150=EXCLUDED.above_150, above_200=EXCLUDED.above_200,
         dma20=EXCLUDED.dma20, dma50=EXCLUDED.dma50, dma100=EXCLUDED.dma100,
         dma150=EXCLUDED.dma150, dma200=EXCLUDED.dma200,
         golden_cross=EXCLUDED.golden_cross, death_cross=EXCLUDED.death_cross,
         bull_stacked=EXCLUDED.bull_stacked, bear_stacked=EXCLUDED.bear_stacked,
         new_high_52w=EXCLUDED.new_high_52w, new_low_52w=EXCLUDED.new_low_52w,
         pct_from_52h=EXCLUDED.pct_from_52h, pct_from_52l=EXCLUDED.pct_from_52l,
         adv_dec=EXCLUDED.adv_dec`,
      vals
    );
  }
}

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) { console.error("POSTGRES_URL required"); process.exit(1); }
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 4 });
  const c = await pool.connect();
  await ensureTable(c);

  let dates = [];
  const oneDate = arg("date");

  if (oneDate) {
    dates = [oneDate];
  } else if (arg("all")) {
    // recompute for every date that has a market_breadth snapshot
    const { rows } = await c.query(`SELECT snap_date FROM market_breadth ORDER BY snap_date`);
    dates = rows.map((r) => r.snap_date);
  } else {
    // self-heal: find breadth snapshot dates that have no stock_signals rows
    const { rows: br } = await c.query(`SELECT snap_date FROM market_breadth ORDER BY snap_date`);
    const { rows: sr } = await c.query(`SELECT DISTINCT snap_date FROM stock_signals`);
    const have = new Set(sr.map((r) => r.snap_date));
    dates = br.map((r) => r.snap_date).filter((d) => !have.has(d));
    if (!dates.length) {
      const latest = br.length ? br[br.length - 1].snap_date : "–";
      console.log(`[signals] up to date — latest breadth date ${latest} already has stock_signals`);
    }
  }

  for (const D of dates) {
    const byIsin = await loadWindow(c, D);
    const stocks = computeStockSignals(byIsin, D);
    await upsertSignals(c, D, stocks);
    const gc = stocks.filter((s) => s.golden_cross).length;
    const dc = stocks.filter((s) => s.death_cross).length;
    const bull = stocks.filter((s) => s.bull_stacked).length;
    const a200 = stocks.filter((s) => s.above_200).length;
    console.log(`[signals] ${D}: ${stocks.length} stocks | >200DMA ${a200} | GC ${gc} DC ${dc} bull ${bull}`);
  }

  c.release(); await pool.end();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
