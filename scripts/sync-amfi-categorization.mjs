// scripts/sync-amfi-categorization.mjs
//
// Downloads AMFI's official semi-annual large/mid/small-cap stock
// categorization and writes a normalized-name -> category lookup to
// public/data/amfi-cap-categorization.json, used by the Portfolio Creator's
// M-Cap Allocation section (Section 7 of the design spec).
//
// AMFI republishes this twice a year (30 Jun / 31 Dec) at
// https://www.amfiindia.com/otherdata/categorisation-of-stocks -- run this
// script manually after each refresh. No cron needed given the frequency.
//
// Usage: node scripts/sync-amfi-categorization.mjs

import * as XLSX from 'xlsx';
import { writeFileSync, mkdirSync } from 'fs';
import { normalizeName } from '../lib/portfolioAnalysis.js';

const PAGE_URL = 'https://www.amfiindia.com/otherdata/categorisation-of-stocks';
const OUT_PATH = 'public/data/amfi-cap-categorization.json';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

async function findLatestXlsxUrl() {
  const res = await fetch(PAGE_URL, { headers: HEADERS });
  if (!res.ok) throw new Error(`Failed to fetch ${PAGE_URL}: HTTP ${res.status}`);
  const html = await res.text();
  const matches = [...html.matchAll(/href="([^"]*AverageMarketCapitalization[^"]*\.xlsx)"/gi)];
  if (!matches.length) throw new Error('No AverageMarketCapitalization*.xlsx links found on the page');
  // The page lists newest-first; the first match is the current period.
  return matches[0][1];
}

async function run() {
  console.log(`Fetching AMFI categorization page: ${PAGE_URL}`);
  const xlsxUrl = await findLatestXlsxUrl();
  console.log(`Found latest xlsx: ${xlsxUrl}`);

  const xlsxRes = await fetch(xlsxUrl, { headers: HEADERS });
  if (!xlsxRes.ok) throw new Error(`Failed to download ${xlsxUrl}: HTTP ${xlsxRes.status}`);
  const buf = Buffer.from(await xlsxRes.arrayBuffer());

  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });

  // Row 0 is the title, row 1 is the header. Data starts at row 2.
  // Columns (verified live): [Sr No, Company name, ISIN, BSE Symbol,
  // BSE avg cap, NSE Symbol, NSE avg cap, MSEI Symbol, MSEI avg cap,
  // Average of All Exchanges, Categorization]
  const categories = {};
  let matched = 0;
  for (const row of rows.slice(2)) {
    const companyName = row[1];
    const category = row[10];
    if (!companyName || !category) continue;
    if (!/^(Large|Mid|Small) Cap$/.test(category.trim())) continue;
    categories[normalizeName(companyName)] = category.trim();
    matched++;
  }

  if (matched < 1000) {
    throw new Error(`Only matched ${matched} rows -- expected 5000+. AMFI's column layout may have changed; check row[1]/row[10] against a fresh download.`);
  }

  mkdirSync('public/data', { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), categories }, null, 2));
  console.log(`Wrote ${matched} categorized stocks to ${OUT_PATH}`);
}

run().catch((err) => {
  console.error('sync-amfi-categorization failed:', err.message);
  process.exit(1);
});
