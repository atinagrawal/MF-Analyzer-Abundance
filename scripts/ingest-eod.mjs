/**
 * scripts/ingest-eod.mjs — daily EOD price ingestion for the Market Breadth dashboard.
 *
 * Source: BSE UDiFF "BhavCopy" — one CSV per trading day with full OHLC for every
 * listed equity. NSE is NOT usable from a server (Akamai blocks cloud IPs), but BSE
 * is open, covers the same large/liquid universe, and serves historical dates too —
 * which is what lets us backfill the ~250 trading days needed for 200-DMA / 52-week.
 *
 * Writes into Postgres table `stock_eod` (one row per stock per day), keyed by
 * (trade_date, isin). Idempotent: re-running a date just upserts.
 *
 * Usage:
 *   node scripts/ingest-eod.mjs                       # latest available trading day
 *   node scripts/ingest-eod.mjs --date=2026-06-09     # one specific day
 *   node scripts/ingest-eod.mjs --from=2025-06-01 --to=2026-06-09   # backfill a range
 * Env: POSTGRES_URL (required to persist; without it, dry-run prints a summary).
 */

import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const DAY = 864e5;
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const iso = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

function bhavUrl(d) {
  return `https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_${ymd(d)}_F_0000.CSV`;
}

async function fetchBhav(d) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(bhavUrl(d), {
        headers: { "User-Agent": UA, Referer: "https://www.bseindia.com/", Accept: "text/csv,*/*" },
        signal: AbortSignal.timeout(45000),
      });
      if (r.status === 404) return null;           // not a trading day
      if (r.ok) { const t = await r.text(); if (t && t.length > 2000) return t; }
    } catch (e) { /* retry */ }
    await new Promise((s) => setTimeout(s, 1500));
  }
  return null;
}

// BSE UDiFF column map (0-based): TradDt0, FinInstrmTp4 (STK=equity), ISIN6, TckrSymb7,
// SctySrs8, FinInstrmNm13, Opn14, Hgh15, Lw16, Cls17, PrvsClsg19, TtlTradgVol24, TtlTrfVal25
export function parseBhav(txt) {
  const out = [];
  const lines = txt.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    if (!line) continue;
    const p = line.split(",");
    if (p.length < 26) continue;
    if (p[4] !== "STK") continue;                  // equities only (drops index/ETF/debt rows)
    const isin = (p[6] || "").trim();
    const close = +p[17], prev = +p[19];
    if (!isin || !(close > 0)) continue;
    out.push({
      isin,
      symbol: (p[7] || "").trim(),
      name: (p[13] || "").trim(),
      series: (p[8] || "").trim(),
      open: +p[14] || null, high: +p[15] || null, low: +p[16] || null,
      close, prev_close: prev > 0 ? prev : null,
      volume: Math.round(+p[24] || 0), turnover: +p[25] || 0,
    });
  }
  return out;
}

async function ensureTable(c) {
  await c.query(`CREATE TABLE IF NOT EXISTS stock_eod (
    trade_date DATE NOT NULL,
    isin       TEXT NOT NULL,
    symbol     TEXT,
    name       TEXT,
    series     TEXT,
    open       NUMERIC, high NUMERIC, low NUMERIC,
    close      NUMERIC NOT NULL,
    prev_close NUMERIC,
    volume     BIGINT,
    turnover   NUMERIC,
    PRIMARY KEY (trade_date, isin)
  )`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_stock_eod_isin_date ON stock_eod (isin, trade_date)`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_stock_eod_date ON stock_eod (trade_date)`);
}

async function upsertDay(c, dateIso, rows) {
  // chunked multi-row upsert
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const vals = [];
    const ph = slice.map((r, j) => {
      const b = j * 12;
      vals.push(dateIso, r.isin, r.symbol, r.name, r.series, r.open, r.high, r.low, r.close, r.prev_close, r.volume, r.turnover);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12})`;
    }).join(",");
    await c.query(
      `INSERT INTO stock_eod (trade_date,isin,symbol,name,series,open,high,low,close,prev_close,volume,turnover)
       VALUES ${ph}
       ON CONFLICT (trade_date,isin) DO UPDATE SET
         symbol=EXCLUDED.symbol, name=EXCLUDED.name, series=EXCLUDED.series,
         open=EXCLUDED.open, high=EXCLUDED.high, low=EXCLUDED.low, close=EXCLUDED.close,
         prev_close=EXCLUDED.prev_close, volume=EXCLUDED.volume, turnover=EXCLUDED.turnover`,
      vals
    );
  }
}

function arg(name) { const a = process.argv.find((x) => x.startsWith(`--${name}=`)); return a ? a.split("=")[1] : null; }

// Main-board equity groups only (A = most liquid, B = other main board). This is the
// "~2,200 all equities" universe; it deliberately excludes T (trade-to-trade), Z
// (penalty), and SME/illiquid groups, which would add noise to breadth.
const EQUITY_GROUPS = new Set(["A", "B"]);
const RETENTION_DAYS = 450; // keep ~1.5y so 200-DMA / 52w always have headroom

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
    // latest: walk back from today to the most recent weekday with a file
    let d = new Date(); d.setUTCHours(0, 0, 0, 0);
    for (let k = 0; k < 6; k++) { const wd = d.getUTCDay(); if (wd !== 0 && wd !== 6) { dates.push(new Date(d)); break; } d = new Date(d - DAY); }
  }

  const url = process.env.POSTGRES_URL;
  const pool = url ? new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 4 }) : null;
  const c = pool ? await pool.connect() : null;
  if (c) await ensureTable(c);

  let okDays = 0, totalRows = 0;
  for (const d of dates) {
    const txt = await fetchBhav(d);
    if (!txt) { if (!from) console.log(`[eod] ${iso(d)}: no file (holiday/weekend)`); continue; }
    const rows = parseBhav(txt).filter((r) => EQUITY_GROUPS.has(r.series));
    const uniqueRows = [];
    const seen = new Set();
    for (const r of rows) {
      if (!seen.has(r.isin)) {
        seen.add(r.isin);
        uniqueRows.push(r);
      }
    }
    if (!uniqueRows.length) { console.log(`[eod] ${iso(d)}: 0 equity rows?!`); continue; }
    if (c) await upsertDay(c, iso(d), uniqueRows);
    okDays++; totalRows += uniqueRows.length;
    console.log(`[eod] ${iso(d)}: ${uniqueRows.length} equities${c ? " upserted" : " (dry-run)"}`);
  }
  if (c && okDays) {
    const { rowCount } = await c.query(`DELETE FROM stock_eod WHERE trade_date < (CURRENT_DATE - $1::int)`, [RETENTION_DAYS]);
    if (rowCount) console.log(`[eod] pruned ${rowCount} rows older than ${RETENTION_DAYS}d`);
  }
  console.log(`[eod] done — ${okDays} trading days, ${totalRows} rows total${c ? "" : " (no POSTGRES_URL → dry-run)"}`);
  if (c) c.release();
  if (pool) await pool.end();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
