/**
 * scripts/append-nav-history.mjs
 *
 * Daily incremental NAV history updater.
 * Fetches recent NAV records directly from official AMFI reports
 * (DownloadNAVHistoryReport_Po.aspx and NAVAll.txt) and appends them
 * to the `mf_nav_history` Postgres table.
 *
 * Designed to run daily as part of the GitHub Actions screener workflow.
 *
 * Usage:
 *   POSTGRES_URL="postgresql://..." node scripts/append-nav-history.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error('[append] FATAL: POSTGRES_URL environment variable is required.');
  process.exit(1);
}

const BATCH_SIZE = 500;
const LOOKBACK_CAP_DAYS = 14;

const MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const MNAME = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// AMFI date DD-MMM-YYYY -> epoch UTC ms
function parseAmfiDate(s) {
  if (!s) return null;
  const m = /(\d{2})-([A-Za-z]{3})-(\d{4})/.exec(s.trim());
  return m ? Date.UTC(+m[3], MON[m[2]], +m[1]) : null;
}

// epoch UTC ms -> AMFI DD-MMM-YYYY
function fmtAmfi(ms) {
  const d = new Date(ms);
  return `${String(d.getUTCDate()).padStart(2, '0')}-${MNAME[d.getUTCMonth()]}-${d.getUTCFullYear()}`;
}

// epoch UTC ms -> Postgres YYYY-MM-DD
function msToISO(ms) {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// AMFI header resolver by column name
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

async function batchInsertHistory(client, rows) {
  if (!rows || rows.length === 0) return 0;

  let insertedCount = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const values = [];
    const placeholders = chunk.map((r, j) => {
      values.push(r.code, r.nav_date, r.nav);
      return `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3})`;
    });

    await client.query(
      `INSERT INTO mf_nav_history (code, nav_date, nav)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (code, nav_date) DO UPDATE SET nav = EXCLUDED.nav`,
      values
    );
    insertedCount += chunk.length;
  }
  return insertedCount;
}

async function main() {
  console.log('[append] Starting daily MF NAV history append...');
  const client = new pg.Client({
    connectionString: POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('[append] Connected to Postgres.');

  // 1. Ensure table exists
  await client.query(`
    CREATE TABLE IF NOT EXISTS mf_nav_history (
      code     TEXT    NOT NULL,
      nav_date DATE    NOT NULL,
      nav      NUMERIC(14, 4) NOT NULL,
      PRIMARY KEY (code, nav_date)
    );
  `);

  // 2. Active funds in screener
  let activeCodes = new Set();
  try {
    const res = await client.query('SELECT DISTINCT code FROM mf_screener');
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

  // 3. Determine start date
  const latestRes = await client.query('SELECT MAX(nav_date)::text AS latest FROM mf_nav_history');
  const latestDateStr = latestRes.rows[0]?.latest;

  const nowMs = Date.now();
  const dayMs = 864e5;
  let startMs;

  if (latestDateStr) {
    const [y, m, d] = latestDateStr.split('-').map(Number);
    const latestMs = Date.UTC(y, m - 1, d);
    startMs = latestMs + dayMs;
    console.log(`[append] Latest recorded NAV date in DB is ${latestDateStr}.`);
  } else {
    // If table is completely empty, default to last 7 days
    startMs = nowMs - 7 * dayMs;
    console.log('[append] No existing NAV records found. Defaulting to 7 days lookback.');
  }

  // Cap lookback window to prevent huge requests
  const oldestAllowedMs = nowMs - LOOKBACK_CAP_DAYS * dayMs;
  if (startMs < oldestAllowedMs) {
    startMs = oldestAllowedMs;
    console.log(`[append] Capped lookback to ${LOOKBACK_CAP_DAYS} days (${fmtAmfi(startMs)}).`);
  }

  const endMs = nowMs;
  const rowsMap = new Map(); // key: `${code}_${isoDate}` -> row

  // 4. Fetch AMFI historical NAV report for window [startMs, endMs]
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
          rowsMap.set(key, { code, nav_date: iso, nav: +nav.toFixed(4) });
        }
        console.log(`[append] Parsed ${rowsMap.size} NAV records from AMFI history report.`);
      }
    } catch (err) {
      console.warn(`[append] Warning: Failed to fetch AMFI history report (${err.message}).`);
    }
  }

  // 5. Also check AMFI NAVAll.txt for latest intraday / night publication
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
          rowsMap.set(key, { code, nav_date: iso, nav: +nav.toFixed(4) });
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

  // 6. Upsert records into Postgres
  const allRows = Array.from(rowsMap.values());
  if (allRows.length === 0) {
    console.log('[append] No new NAV records found to append. Database is already up to date.');
  } else {
    console.log(`[append] Upserting ${allRows.length} NAV records into mf_nav_history...`);
    const inserted = await batchInsertHistory(client, allRows);
    console.log(`[append] Successfully upserted ${inserted} records.`);
  }

  // 7. Verify latest date in DB
  const newLatestRes = await client.query('SELECT MAX(nav_date)::text AS latest, COUNT(*) AS total FROM mf_nav_history');
  console.log(`[append] Done. DB state -> latest date: ${newLatestRes.rows[0]?.latest}, total rows: ${newLatestRes.rows[0]?.total}`);

  await client.end();
}

main().catch((err) => {
  console.error('[append] FATAL Error:', err);
  process.exit(1);
});
