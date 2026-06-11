/**
 * scripts/build-breadth.mjs — computes one Market Breadth snapshot per trading day
 * from the accumulated stock_eod table, and upserts into `market_breadth`.
 *
 * For the latest trading day D (or --date=YYYY-MM-DD) it computes, across the equity
 * universe that traded on D:
 *   - % of stocks whose close is above their 20/50/100/150/200-day SMA
 *   - advancing / declining / unchanged (close vs prev_close)
 *   - new 52-week highs / lows (252-trading-day window, on intraday high/low)
 *   - regime % = share above the 200-DMA
 * Day-over-day deltas are derived in the API from consecutive snapshots, so we only
 * store raw counts here.
 *
 * Usage: node scripts/build-breadth.mjs [--date=YYYY-MM-DD] [--all]
 *   --all recomputes a snapshot for every distinct trade_date that has >= 200 days of
 *         prior history (used once after a backfill to populate the time-travel series).
 * Env: POSTGRES_URL (required).
 */

import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}`)); return a ? (a.includes("=") ? a.split("=")[1] : true) : null; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const DMAS = [20, 50, 100, 150, 200];
const WIN52 = 252;

async function ensureTable(c) {
  await c.query(`CREATE TABLE IF NOT EXISTS market_breadth (
    snap_date DATE PRIMARY KEY,
    universe  INT,
    a20 INT, t20 INT, a50 INT, t50 INT, a100 INT, t100 INT, a150 INT, t150 INT, a200 INT, t200 INT,
    advancing INT, declining INT, unchanged INT,
    new_high INT, new_low INT,
    regime_pct NUMERIC,
    asof TIMESTAMPTZ DEFAULT now()
  )`);
}

function computeSnapshot(byIsin, D) {
  // byIsin: Map isin -> [{t, close, high, low, prev}] ascending, ending at/around D
  const acc = { universe: 0, advancing: 0, declining: 0, unchanged: 0, new_high: 0, new_low: 0 };
  for (const n of DMAS) { acc["a" + n] = 0; acc["t" + n] = 0; }
  for (const ser of byIsin.values()) {
    const last = ser[ser.length - 1];
    if (!last || last.t !== D) continue;           // only stocks that traded on D
    acc.universe++;
    const closes = ser.map((r) => r.close);
    for (const n of DMAS) {
      if (closes.length >= n) {
        acc["t" + n]++;
        if (last.close > mean(closes.slice(-n))) acc["a" + n]++;
      }
    }
    // advance / decline
    if (last.prev != null) {
      if (last.close > last.prev) acc.advancing++;
      else if (last.close < last.prev) acc.declining++;
      else acc.unchanged++;
    }
    // 52-week high / low on intraday extremes (need a real window)
    if (ser.length >= 200) {
      const w = ser.slice(-WIN52);
      const hi = Math.max(...w.map((r) => r.high ?? r.close));
      const lo = Math.min(...w.map((r) => r.low ?? r.close));
      if ((last.high ?? last.close) >= hi) acc.new_high++;
      if ((last.low ?? last.close) <= lo) acc.new_low++;
    }
  }
  acc.regime_pct = acc.t200 ? +(100 * acc.a200 / acc.t200).toFixed(1) : null;
  return acc;
}

async function loadWindow(c, endDate, days = 400) {
  const { rows } = await c.query(
    `SELECT isin, trade_date, close, high, low, prev_close
       FROM stock_eod
      WHERE trade_date > ($1::date - $2::int) AND trade_date <= $1::date
      ORDER BY isin, trade_date`,
    [endDate, days]
  );
  const byIsin = new Map();
  for (const r of rows) {
    const t = r.trade_date.toISOString().slice(0, 10);
    if (!byIsin.has(r.isin)) byIsin.set(r.isin, []);
    byIsin.get(r.isin).push({ t, close: +r.close, high: r.high == null ? null : +r.high, low: r.low == null ? null : +r.low, prev: r.prev_close == null ? null : +r.prev_close });
  }
  return byIsin;
}

async function upsert(c, D, s) {
  await c.query(
    `INSERT INTO market_breadth (snap_date,universe,a20,t20,a50,t50,a100,t100,a150,t150,a200,t200,advancing,declining,unchanged,new_high,new_low,regime_pct,asof)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now())
     ON CONFLICT (snap_date) DO UPDATE SET universe=EXCLUDED.universe,
       a20=EXCLUDED.a20,t20=EXCLUDED.t20,a50=EXCLUDED.a50,t50=EXCLUDED.t50,a100=EXCLUDED.a100,t100=EXCLUDED.t100,
       a150=EXCLUDED.a150,t150=EXCLUDED.t150,a200=EXCLUDED.a200,t200=EXCLUDED.t200,
       advancing=EXCLUDED.advancing,declining=EXCLUDED.declining,unchanged=EXCLUDED.unchanged,
       new_high=EXCLUDED.new_high,new_low=EXCLUDED.new_low,regime_pct=EXCLUDED.regime_pct,asof=now()`,
    [D, s.universe, s.a20, s.t20, s.a50, s.t50, s.a100, s.t100, s.a150, s.t150, s.a200, s.t200,
     s.advancing, s.declining, s.unchanged, s.new_high, s.new_low, s.regime_pct]
  );
}

async function runAll(c) {
  // load the whole table once, then compute every date in memory (fast backfill)
  const { rows } = await c.query(`SELECT isin, trade_date, close, high, low, prev_close FROM stock_eod ORDER BY isin, trade_date`);
  const full = new Map(); const dateSet = new Set();
  for (const r of rows) {
    const t = r.trade_date.toISOString().slice(0, 10); dateSet.add(t);
    if (!full.has(r.isin)) full.set(r.isin, []);
    full.get(r.isin).push({ t, close: +r.close, high: r.high == null ? null : +r.high, low: r.low == null ? null : +r.low, prev: r.prev_close == null ? null : +r.prev_close });
  }
  const dates = [...dateSet].sort();
  const targets = dates.slice(199); // need >=200 prior days
  // per-isin ascending date arrays for binary-search truncation
  const idxOf = (arr, D) => { let lo = 0, hi = arr.length - 1, ans = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m].t <= D) { ans = m; lo = m + 1; } else hi = m - 1; } return ans; };
  for (const D of targets) {
    const trunc = new Map();
    for (const [isin, ser] of full) {
      const k = idxOf(ser, D);
      if (k < 0 || ser[k].t !== D) continue;            // traded exactly on D
      trunc.set(isin, ser.slice(Math.max(0, k - WIN52 + 1), k + 1));
    }
    const s = computeSnapshot(trunc, D);
    await upsert(c, D, s);
    console.log(`[breadth] ${D}: universe ${s.universe} >200DMA ${s.regime_pct}% adv ${s.advancing} dec ${s.declining}`);
  }
}

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) { console.error("POSTGRES_URL required"); process.exit(1); }
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 4 });
  const c = await pool.connect();
  await ensureTable(c);

  if (arg("all")) {
    await runAll(c);
  } else {
    const d = arg("date");
    const { rows } = d ? { rows: [{ trade_date: new Date(d) }] } : await c.query(`SELECT max(trade_date) trade_date FROM stock_eod`);
    const D = rows[0].trade_date.toISOString().slice(0, 10);
    const byIsin = await loadWindow(c, D);
    const s = computeSnapshot(byIsin, D);
    await upsert(c, D, s);
    console.log(`[breadth] ${D}: universe ${s.universe} | >200DMA ${s.a200}/${s.t200} (${s.regime_pct}%) | >50DMA ${s.a50}/${s.t50} | adv ${s.advancing} dec ${s.declining} | 52wH ${s.new_high} 52wL ${s.new_low}`);
  }
  c.release(); await pool.end();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}

export { computeSnapshot };
