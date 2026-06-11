/**
 * scripts/build-sector-breadth.mjs — computes sector-level breadth snapshots.
 *
 * Uses sector_isin_map (populated by ingest-sector-map.mjs) to group stocks by sector,
 * then applies the same breadth metrics as build-breadth.mjs to each sector separately.
 * All stocks in the sector that traded on day D are included (no top-N filtering — the
 * index itself is already a curated universe of 15–50 liquid stocks per sector).
 *
 * Usage:
 *   node scripts/build-sector-breadth.mjs         # self-heal missing dates
 *   node scripts/build-sector-breadth.mjs --date=YYYY-MM-DD
 *   node scripts/build-sector-breadth.mjs --all   # recompute every eligible date
 * Env: POSTGRES_URL (required).
 */

import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

pg.types.setTypeParser(1082, (val) => val);

const arg = (n) => { const a = process.argv.find((x) => x.startsWith(`--${n}`)); return a ? (a.includes("=") ? a.split("=")[1] : true) : null; };
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const DMAS = [20, 50, 100, 150, 200];
const WIN52 = 252;

async function ensureTable(c) {
  await c.query(`CREATE TABLE IF NOT EXISTS sector_breadth (
    snap_date    DATE NOT NULL,
    sector       TEXT NOT NULL,
    universe     INT,
    a20 INT, t20 INT, a50 INT, t50 INT, a100 INT, t100 INT, a150 INT, t150 INT, a200 INT, t200 INT,
    advancing INT, declining INT, unchanged INT,
    new_high INT, new_low INT,
    regime_pct   NUMERIC,
    golden_cross INT, death_cross INT, bull_stacked INT, bear_stacked INT,
    asof TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (snap_date, sector)
  )`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_sector_breadth_date ON sector_breadth (snap_date)`);
}

const smaBack = (c, n, back) => { const end = c.length - back, start = end - n; return start < 0 ? null : mean(c.slice(start, end)); };

function computeSectorSnapshot(sectorSeries, D) {
  // sectorSeries: array of per-stock series [{t, close, high, low, prev, tov}], all in sector, ending at D
  const acc = { universe: 0, advancing: 0, declining: 0, unchanged: 0, new_high: 0, new_low: 0, golden_cross: 0, death_cross: 0, bull_stacked: 0, bear_stacked: 0 };
  for (const n of DMAS) { acc["a" + n] = 0; acc["t" + n] = 0; }

  for (const ser of sectorSeries) {
    const last = ser[ser.length - 1];
    if (!last || last.t !== D) continue;
    acc.universe++;

    const closes = ser.map((r) => r.close);
    const smas = {};
    for (const n of DMAS) {
      const m = smaBack(closes, n, 0);
      smas[n] = m;
      if (m != null) { acc["t" + n]++; if (last.close > m) acc["a" + n]++; }
    }

    if (last.prev != null) {
      if (last.close > last.prev) acc.advancing++;
      else if (last.close < last.prev) acc.declining++;
      else acc.unchanged++;
    }

    if (ser.length >= 200) {
      const w = ser.slice(-WIN52);
      if ((last.high ?? last.close) >= Math.max(...w.map((r) => r.high ?? r.close))) acc.new_high++;
      if ((last.low  ?? last.close) <= Math.min(...w.map((r) => r.low  ?? r.close))) acc.new_low++;
    }

    if (smas[20] != null && smas[200] != null) {
      const p = last.close;
      if (p > smas[20] && smas[20] > smas[50] && smas[50] > smas[100] && smas[100] > smas[150] && smas[150] > smas[200]) acc.bull_stacked++;
      else if (p < smas[20] && smas[20] < smas[50] && smas[50] < smas[100] && smas[100] < smas[150] && smas[150] < smas[200]) acc.bear_stacked++;
    }

    const s50n = smas[50], s200n = smas[200], s50p = smaBack(closes, 50, 25), s200p = smaBack(closes, 200, 25);
    if (s50n != null && s200n != null && s50p != null && s200p != null) {
      if (s50n > s200n && s50p <= s200p) acc.golden_cross++;
      else if (s50n < s200n && s50p >= s200p) acc.death_cross++;
    }
  }

  acc.regime_pct = acc.t200 ? +(100 * acc.a200 / acc.t200).toFixed(1) : null;
  return acc;
}

async function loadWindow(c, endDate, days = 400) {
  const { rows } = await c.query(
    `SELECT isin, trade_date, close, high, low, prev_close, turnover
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
      t, close: +r.close,
      high: r.high == null ? null : +r.high, low: r.low == null ? null : +r.low,
      prev: r.prev_close == null ? null : +r.prev_close,
      tov: r.turnover == null ? 0 : +r.turnover,
    });
  }
  return byIsin;
}

async function upsertSector(c, D, sector, s) {
  await c.query(
    `INSERT INTO sector_breadth
       (snap_date,sector,universe,a20,t20,a50,t50,a100,t100,a150,t150,a200,t200,
        advancing,declining,unchanged,new_high,new_low,regime_pct,
        golden_cross,death_cross,bull_stacked,bear_stacked,asof)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,now())
     ON CONFLICT (snap_date,sector) DO UPDATE SET
       universe=EXCLUDED.universe,
       a20=EXCLUDED.a20,t20=EXCLUDED.t20,a50=EXCLUDED.a50,t50=EXCLUDED.t50,
       a100=EXCLUDED.a100,t100=EXCLUDED.t100,a150=EXCLUDED.a150,t150=EXCLUDED.t150,
       a200=EXCLUDED.a200,t200=EXCLUDED.t200,
       advancing=EXCLUDED.advancing,declining=EXCLUDED.declining,unchanged=EXCLUDED.unchanged,
       new_high=EXCLUDED.new_high,new_low=EXCLUDED.new_low,regime_pct=EXCLUDED.regime_pct,
       golden_cross=EXCLUDED.golden_cross,death_cross=EXCLUDED.death_cross,
       bull_stacked=EXCLUDED.bull_stacked,bear_stacked=EXCLUDED.bear_stacked,asof=now()`,
    [D, sector, s.universe, s.a20, s.t20, s.a50, s.t50, s.a100, s.t100, s.a150, s.t150,
     s.a200, s.t200, s.advancing, s.declining, s.unchanged, s.new_high, s.new_low,
     s.regime_pct, s.golden_cross, s.death_cross, s.bull_stacked, s.bear_stacked]
  );
}

async function main() {
  const url = process.env.POSTGRES_URL;
  if (!url) { console.error("POSTGRES_URL required"); process.exit(1); }
  const pool = new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 4 });
  const c = await pool.connect();
  await ensureTable(c);

  // load sector → ISIN set mapping
  const { rows: mapRows } = await c.query(`SELECT isin, sector FROM sector_isin_map`);
  if (!mapRows.length) { console.error("[sector-breadth] sector_isin_map is empty — run ingest-sector-map.mjs first"); process.exit(1); }
  const sectorIsins = new Map(); // sector -> Set<isin>
  for (const { isin, sector } of mapRows) {
    if (!sectorIsins.has(sector)) sectorIsins.set(sector, new Set());
    sectorIsins.get(sector).add(isin);
  }
  const sectors = [...sectorIsins.keys()].sort();
  console.log(`[sector-breadth] ${sectors.length} sectors, ${mapRows.length} total ISIN mappings`);

  let dates = [];
  const oneDate = arg("date");

  if (oneDate) {
    dates = [oneDate];
  } else if (arg("all")) {
    const { rows } = await c.query(`SELECT snap_date FROM market_breadth ORDER BY snap_date`);
    dates = rows.map((r) => r.snap_date);
  } else {
    // self-heal: find market_breadth dates that don't have a full set of sector_breadth rows
    const { rows: br } = await c.query(`SELECT snap_date FROM market_breadth ORDER BY snap_date`);
    const { rows: sr } = await c.query(
      `SELECT snap_date, COUNT(*) AS cnt FROM sector_breadth GROUP BY snap_date`
    );
    const have = new Map(sr.map((r) => [r.snap_date, +r.cnt]));
    dates = br
      .map((r) => r.snap_date)
      .filter((d) => (have.get(d) ?? 0) < sectors.length);
    if (!dates.length) {
      const latest = br.length ? br[br.length - 1].snap_date : "–";
      console.log(`[sector-breadth] up to date — latest ${latest}`);
    }
  }

  for (const D of dates) {
    const byIsin = await loadWindow(c, D);
    for (const sector of sectors) {
      const isinSet = sectorIsins.get(sector);
      const sectorSeries = [];
      for (const [isin, ser] of byIsin) {
        if (isinSet.has(isin)) sectorSeries.push(ser);
      }
      if (!sectorSeries.length) continue;
      const s = computeSectorSnapshot(sectorSeries, D);
      if (s.universe === 0) continue;
      await upsertSector(c, D, sector, s);
    }
    console.log(`[sector-breadth] ${D}: computed ${sectors.length} sectors`);
  }

  c.release(); await pool.end();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
