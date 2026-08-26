/**
 * scripts/ingest-eod.mjs — daily EOD price ingestion for the Market Breadth dashboard.
 *
 * Source: BSE UDiFF "BhavCopy" — one CSV per trading day with full OHLC for every
 * listed equity. NSE is NOT usable from a server (Akamai blocks cloud IPs), but BSE
 * is open, covers the same large/liquid universe, and serves historical dates too —
 * which is what lets us backfill the ~250 trading days needed for 200-DMA / 52-week.
 *
 * Writes into Turso `stock_eod` table (via lib/stockEodStore.js, in the `stock-eod`
 * database), one row per stock per day, keyed by (trade_date, isin). Idempotent:
 * re-running a date just upserts.
 *
 * Usage:
 *   node scripts/ingest-eod.mjs                       # latest available trading day
 *   node scripts/ingest-eod.mjs --date=2026-06-09     # one specific day
 *   node scripts/ingest-eod.mjs --from=2025-06-01 --to=2026-06-09   # backfill a range
 * Env: TURSO_STOCK_EOD_URL, TURSO_STOCK_EOD_TOKEN (required to persist; without them, dry-run prints a summary).
 */

import { upsertDay, pruneOlderThan } from "../lib/stockEodStore.js";
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
