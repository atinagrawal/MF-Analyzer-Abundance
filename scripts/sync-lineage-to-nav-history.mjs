/**
 * scripts/sync-lineage-to-nav-history.mjs
 *
 * Rebase and backfill predecessor NAV records for all merged schemes defined
 * in data/scheme-lineage.json into the Postgres `mf_nav_history` table.
 *
 * For each surviving scheme code (e.g. 140225 - Edelweiss Mid Cap):
 * 1. Fetches current history and predecessor history (e.g. 107301 - JPMorgan).
 * 2. Uses `stitchSeries()` from lib/schemeLineage.js to rebase the predecessor NAVs
 *    onto the surviving scheme's NAV scale (preserving exact returns).
 * 3. Inserts all rebased pre-merger records into `mf_nav_history` under the surviving `code`.
 *
 * Run with: node --env-file=.env.local scripts/sync-lineage-to-nav-history.mjs
 */

import pg from 'pg';
import LINEAGE from '../data/scheme-lineage.json' with { type: 'json' };
import { stitchSeries } from '../lib/schemeLineage.js';

const POSTGRES_URL = process.env.POSTGRES_URL || process.env.DATABASE_URL;

if (!POSTGRES_URL) {
  console.error('[lineage-sync] Error: POSTGRES_URL or DATABASE_URL environment variable is required.');
  process.exit(1);
}

function parseDateToYMD(dStr) {
  // Handles DD-MM-YYYY or YYYY-MM-DD
  if (dStr.includes('-')) {
    const parts = dStr.split('-');
    if (parts[0].length === 4) {
      return dStr; // YYYY-MM-DD
    }
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

async function insertRows(client, rows) {
  if (!rows.length) return 0;
  const BATCH_SIZE = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const values = [];
    const placeholders = chunk.map((r, j) => {
      values.push(r.code, r.nav_date, r.nav.toFixed(4));
      return `($${j * 3 + 1}, $${j * 3 + 2}, $${j * 3 + 3})`;
    });

    await client.query(
      `INSERT INTO mf_nav_history (code, nav_date, nav)
       VALUES ${placeholders.join(',')}
       ON CONFLICT (code, nav_date) DO UPDATE SET nav = EXCLUDED.nav`,
      values
    );
    inserted += chunk.length;
  }
  return inserted;
}

async function main() {
  console.log('[lineage-sync] Connecting to Postgres database...');
  const client = new pg.Client({
    connectionString: POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('[lineage-sync] Connected. Ensuring mf_nav_history table exists...');

  await client.query(`
    CREATE TABLE IF NOT EXISTS mf_nav_history (
      code     TEXT    NOT NULL,
      nav_date DATE    NOT NULL,
      nav      NUMERIC(14, 4) NOT NULL,
      PRIMARY KEY (code, nav_date)
    );
    CREATE INDEX IF NOT EXISTS idx_mf_nav_history_code_date ON mf_nav_history (code, nav_date DESC);
  `);

  const entries = Object.entries(LINEAGE);
  console.log(`[lineage-sync] Processing ${entries.length} lineage entries...`);

  let totalStitchedRows = 0;
  let successCount = 0;

  for (const [code, { pred, from }] of entries) {
    try {
      console.log(`\n[lineage-sync] Processing scheme ${code} <- ${pred} (${from})...`);

      // 1. Fetch current fund's history (check DB first, fallback to mfapi)
      let curRaw = null;
      const dbCur = await client.query(
        "SELECT to_char(nav_date, 'DD-MM-YYYY') as date, nav::text FROM mf_nav_history WHERE code = $1 ORDER BY nav_date ASC",
        [String(code)]
      );
      if (dbCur.rows.length > 50) {
        curRaw = dbCur.rows;
      } else {
        curRaw = await fetchFromMfapi(code);
      }

      if (!curRaw || !curRaw.length) {
        console.warn(`⚠️ Could not fetch current history for ${code}`);
        continue;
      }

      // 2. Fetch predecessor fund's history
      let predRaw = null;
      const dbPred = await client.query(
        "SELECT to_char(nav_date, 'DD-MM-YYYY') as date, nav::text FROM mf_nav_history WHERE code = $1 ORDER BY nav_date ASC",
        [String(pred)]
      );
      if (dbPred.rows.length > 50) {
        predRaw = dbPred.rows;
      } else {
        predRaw = await fetchFromMfapi(pred);
      }

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

      // 3. Extract the full stitched series to insert under the current scheme code
      const allCurRows = stitched.series.map(p => ({
        code: String(code),
        nav_date: new Date(p.t).toISOString().slice(0, 10),
        nav: p.nav,
      }));

      console.log(`[lineage-sync] Stitched full continuous series of ${allCurRows.length} records for scheme ${code}.`);

      // Also ensure the raw predecessor rows are preserved under pred code
      const rawPredRows = predNorm.map(p => ({
        code: String(pred),
        nav_date: new Date(p.t).toISOString().slice(0, 10),
        nav: p.nav,
      }));

      // Insert full stitched series for surviving code
      const insertedCur = await insertRows(client, allCurRows);
      // Insert raw predecessor rows for predecessor code
      const insertedPred = await insertRows(client, rawPredRows);

      totalStitchedRows += insertedCur;
      successCount++;
      console.log(`✅ Upserted ${insertedCur} rows for ${code} and ${insertedPred} rows for ${pred}. Oldest: ${allCurRows[0]?.nav_date}`);

    } catch (err) {
      console.error(`❌ Error syncing lineage for ${code}:`, err.message);
    }
  }

  console.log(`\n========================================`);
  console.log(`[lineage-sync] Finished! Successfully synced ${successCount}/${entries.length} lineage funds.`);
  console.log(`[lineage-sync] Total pre-merger records added to mf_nav_history: ${totalStitchedRows}`);
  console.log(`========================================\n`);

  await client.end();
  process.exit(0);
}

main().catch(err => {
  console.error('[lineage-sync] Fatal error:', err);
  process.exit(1);
});
