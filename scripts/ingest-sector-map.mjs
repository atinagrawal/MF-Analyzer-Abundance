/**
 * scripts/ingest-sector-map.mjs — fetches NSE sectoral-index constituent CSVs
 * from archives.nseindia.com and populates the sector_isin_map table.
 *
 * Each CSV lists the stocks in one Nifty sectoral index, including their ISIN.
 * ISINs are exchange-neutral, so BSE-listed stocks map directly.
 * A stock can belong to multiple sectors (e.g. HDFC Bank → Bank + Financial Services).
 *
 * Run weekly — sector compositions change only on quarterly rebalancing days.
 *
 * Usage:
 *   node scripts/ingest-sector-map.mjs           # refresh all sectors
 *   node scripts/ingest-sector-map.mjs --dry-run # print ISINs without writing
 * Env: POSTGRES_URL (required unless --dry-run).
 */

import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const arg = (n) => !!process.argv.find((x) => x === `--${n}` || x.startsWith(`--${n}=`));

const BASE = "https://archives.nseindia.com/content/indices/";
const UA   = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";

// Nifty sectoral index CSVs. File name and display sector label.
// Verified against NSE archives: https://archives.nseindia.com/content/indices/
const SECTORS = [
  { name: "Auto",                 file: "ind_niftyautolist.csv" },
  { name: "Bank",                 file: "ind_niftybanklist.csv" },
  { name: "Energy",               file: "ind_niftyenergylist.csv" },
  { name: "FMCG",                 file: "ind_niftyfmcglist.csv" },
  { name: "IT",                   file: "ind_niftyitlist.csv" },
  { name: "Metal",                file: "ind_niftymetallist.csv" },
  { name: "Pharma",               file: "ind_niftypharmalist.csv" },
  { name: "Realty",               file: "ind_niftyrealtylist.csv" },
  { name: "Media",                file: "ind_niftymedialist.csv" },
  { name: "PSU Bank",             file: "ind_niftypsubanklist.csv" },
  { name: "Financial Services",   file: "ind_niftyfinancelist.csv" },
  { name: "Healthcare",           file: "ind_niftyhealthcarelist.csv" },
  { name: "Consumer Durables",    file: "ind_niftyconsumerdurableslist.csv" },
  { name: "Oil & Gas",            file: "ind_niftyoilgaslist.csv" },
  { name: "Infrastructure",       file: "ind_niftyinfralist.csv" },
];

async function fetchCsv(file) {
  const url = BASE + file;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA, Referer: "https://www.nseindia.com/" },
        signal: AbortSignal.timeout(30000),
      });
      if (!r.ok) return null;
      return await r.text();
    } catch { /* retry */ }
    await new Promise((s) => setTimeout(s, 2000));
  }
  return null;
}

// NSE index CSV columns: Company Name, Industry, Symbol, Series, ISIN Code
function parseIsins(csv) {
  const isins = [];
  const lines = csv.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "").trim();
    if (!line) continue;
    const cols = line.split(",");
    if (cols.length < 5) continue;
    const isin = cols[4].trim();
    if (isin && isin.startsWith("IN") && isin.length === 12) isins.push(isin);
  }
  return isins;
}

async function ensureTable(c) {
  await c.query(`CREATE TABLE IF NOT EXISTS sector_isin_map (
    isin   TEXT NOT NULL,
    sector TEXT NOT NULL,
    PRIMARY KEY (isin, sector)
  )`);
  await c.query(`CREATE INDEX IF NOT EXISTS idx_sector_isin_map_sector ON sector_isin_map (sector)`);
}

async function main() {
  const dryRun = arg("dry-run");
  const url = process.env.POSTGRES_URL;
  if (!url && !dryRun) { console.error("POSTGRES_URL required"); process.exit(1); }
  const pool = url ? new pg.Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 4 }) : null;
  const c = pool ? await pool.connect() : null;
  if (c) await ensureTable(c);

  let totalMapped = 0;
  for (const { name, file } of SECTORS) {
    const csv = await fetchCsv(file);
    if (!csv) { console.warn(`[sector-map] SKIP ${name}: could not fetch ${file}`); continue; }
    const isins = parseIsins(csv);
    if (!isins.length) { console.warn(`[sector-map] SKIP ${name}: 0 ISINs parsed from ${file}`); continue; }

    if (dryRun) {
      console.log(`[sector-map] ${name}: ${isins.length} ISINs (dry-run)`);
      continue;
    }

    // replace this sector's rows atomically
    await c.query("BEGIN");
    await c.query("DELETE FROM sector_isin_map WHERE sector = $1", [name]);
    const CHUNK = 500;
    for (let i = 0; i < isins.length; i += CHUNK) {
      const slice = isins.slice(i, i + CHUNK);
      const vals = [];
      const ph = slice.map((isin, j) => { vals.push(isin, name); return `($${j*2+1},$${j*2+2})`; }).join(",");
      await c.query(`INSERT INTO sector_isin_map (isin, sector) VALUES ${ph} ON CONFLICT DO NOTHING`, vals);
    }
    await c.query("COMMIT");
    totalMapped += isins.length;
    console.log(`[sector-map] ${name}: ${isins.length} ISINs`);
  }

  if (!dryRun) console.log(`[sector-map] done — ${totalMapped} total sector-ISIN mappings written`);
  if (c) c.release();
  if (pool) await pool.end();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
