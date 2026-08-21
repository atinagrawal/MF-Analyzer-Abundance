/**
 * scripts/bootstrap-nav-history.mjs
 *
 * One-time seed script for the mf_nav_history table.
 * Fetches full NAV history for all active funds in mf_screener from api.mfapi.in
 * and performs batched, idempotent upserts into PostgreSQL.
 *
 * Safe to re-run or resume if interrupted: checks existing populated funds.
 *
 * Usage:
 *   POSTGRES_URL="postgresql://..." node scripts/bootstrap-nav-history.mjs
 * Optional flags / env:
 *   FORCE=1  (re-fetch and update all funds even if already in DB)
 *   LIMIT=10 (fetch only first N funds for testing)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error('[bootstrap] FATAL: POSTGRES_URL environment variable is required.');
  process.exit(1);
}

const FORCE = process.env.FORCE === '1' || process.argv.includes('--force');
const LIMIT = process.env.LIMIT ? parseInt(process.env.LIMIT, 10) : null;
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '8', 10);
const BATCH_SIZE = 500;

// Date conversion: mfapi DD-MM-YYYY -> Postgres YYYY-MM-DD
function mfapiToISO(s) {
  if (!s) return null;
  const parts = s.split('-');
  if (parts.length !== 3) return null;
  const [dd, mm, yy] = parts;
  return `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
}

async function runConcurrent(items, fn, limit = 8) {
  const out = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function fetchMfapiHistory(code, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15000),
      });

      if (res.status === 404) {
        return { ok: false, notFound: true, error: '404 Not Found' };
      }

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json && json.status === 'SUCCESS' && Array.isArray(json.data)) {
        return { ok: true, data: json.data, name: json.meta?.scheme_name || null };
      }
      throw new Error(json?.message || 'Invalid mfapi response shape');
    } catch (err) {
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)));
      } else {
        return { ok: false, error: err.message || String(err) };
      }
    }
  }
  return { ok: false, error: 'Unknown fetch error' };
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
  console.log('[bootstrap] Starting MF NAV history bootstrap...');
  const client = new pg.Client({
    connectionString: POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('[bootstrap] Connected to Postgres.');

  // 1. Ensure table & indexes exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS mf_nav_history (
      code     TEXT    NOT NULL,
      nav_date DATE    NOT NULL,
      nav      NUMERIC(14, 4) NOT NULL,
      PRIMARY KEY (code, nav_date)
    );
  `);

  console.log('[bootstrap] Verified mf_nav_history table schema and index.');

  // 2. Fetch active funds list
  let activeCodes = [];
  try {
    const res = await client.query('SELECT DISTINCT code FROM mf_screener ORDER BY code ASC');
    activeCodes = res.rows.map((r) => String(r.code).trim()).filter(Boolean);
    console.log(`[bootstrap] Found ${activeCodes.length} active funds in mf_screener table.`);
  } catch (err) {
    console.warn(`[bootstrap] Could not read mf_screener table (${err.message}). Trying data/screener.json fallback...`);
    const fallbackPath = path.join(__dirname, '..', 'data', 'screener.json');
    if (fs.existsSync(fallbackPath)) {
      const data = JSON.parse(fs.readFileSync(fallbackPath, 'utf8'));
      activeCodes = (data.funds || []).map((f) => String(f.code).trim()).filter(Boolean);
      console.log(`[bootstrap] Loaded ${activeCodes.length} funds from data/screener.json.`);
    }
  }

  if (activeCodes.length === 0) {
    console.error('[bootstrap] No fund codes found to bootstrap. Aborting.');
    await client.end();
    process.exit(1);
  }

  if (LIMIT && LIMIT > 0) {
    activeCodes = activeCodes.slice(0, LIMIT);
    console.log(`[bootstrap] Limiting to first ${LIMIT} funds as requested.`);
  }

  // 3. Check already populated funds if not FORCE
  let codesToProcess = activeCodes;
  if (!FORCE) {
    const existingRes = await client.query(`
      SELECT code, COUNT(*) AS count
      FROM mf_nav_history
      GROUP BY code
      HAVING COUNT(*) > 10
    `);
    const populatedSet = new Set(existingRes.rows.map((r) => String(r.code).trim()));
    codesToProcess = activeCodes.filter((c) => !populatedSet.has(c));
    console.log(`[bootstrap] ${populatedSet.size} funds already populated in DB. ${codesToProcess.length} remaining to fetch.`);
  }

  if (codesToProcess.length === 0) {
    console.log('[bootstrap] All funds already populated in mf_nav_history. Nothing to do. (Use FORCE=1 to re-seed).');
    await client.end();
    return;
  }

  // 4. Fetch & insert concurrently
  console.log(`[bootstrap] Fetching history for ${codesToProcess.length} funds (concurrency: ${CONCURRENCY})...`);

  let completedCount = 0;
  let totalRowsInserted = 0;
  let successCount = 0;
  const failedFunds = [];

  const startTime = Date.now();

  await runConcurrent(
    codesToProcess,
    async (code) => {
      const result = await fetchMfapiHistory(code);
      completedCount++;

      if (!result.ok || !result.data || result.data.length === 0) {
        failedFunds.push({ code, reason: result.error || 'Empty data' });
        process.stdout.write(
          `\r[bootstrap] Progress: ${completedCount}/${codesToProcess.length} | Success: ${successCount} | Failed: ${failedFunds.length} | Total Rows: ${totalRowsInserted}`
        );
        return;
      }

      // Parse records
      const parsedRows = [];
      for (const item of result.data) {
        const iso = mfapiToISO(item.date);
        const navNum = parseFloat(item.nav);
        if (iso && isFinite(navNum) && navNum > 0) {
          parsedRows.push({
            code,
            nav_date: iso,
            nav: +navNum.toFixed(4),
          });
        }
      }

      if (parsedRows.length > 0) {
        try {
          const inserted = await batchInsertHistory(client, parsedRows);
          totalRowsInserted += inserted;
          successCount++;
        } catch (dbErr) {
          failedFunds.push({ code, reason: `DB error: ${dbErr.message}` });
        }
      } else {
        failedFunds.push({ code, reason: 'No valid numeric NAV rows' });
      }

      process.stdout.write(
        `\r[bootstrap] Progress: ${completedCount}/${codesToProcess.length} | Success: ${successCount} | Failed: ${failedFunds.length} | Total Rows: ${totalRowsInserted}`
      );
    },
    CONCURRENCY
  );

  console.log('\n');
  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('====================================================');
  console.log(`[bootstrap] Finished in ${elapsedSec}s`);
  console.log(`[bootstrap] Funds processed:  ${codesToProcess.length}`);
  console.log(`[bootstrap] Succeeded:        ${successCount}`);
  console.log(`[bootstrap] Failed / Skipped: ${failedFunds.length}`);
  console.log(`[bootstrap] Total rows added: ${totalRowsInserted.toLocaleString()}`);
  console.log('====================================================');

  if (failedFunds.length > 0) {
    console.warn('[bootstrap] Failed fund summary:');
    for (const f of failedFunds.slice(0, 20)) {
      console.warn(`  - Code ${f.code}: ${f.reason}`);
    }
    if (failedFunds.length > 20) {
      console.warn(`  ... and ${failedFunds.length - 20} more.`);
    }
  }

  await client.end();
  console.log('[bootstrap] Postgres connection closed. Done.');
}

main().catch((err) => {
  console.error('[bootstrap] Unhandled exception:', err);
  process.exit(1);
});
