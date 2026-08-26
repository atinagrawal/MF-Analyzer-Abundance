// scripts/migrate-nav-history-to-turso.mjs
/**
 * One-time backfill: copies every row from Postgres `mf_nav_history` into the
 * Turso `mf-nav-history` database, paginated by (code, nav_date) keyset so
 * neither side ever holds the full 3.94M rows in memory or in one response.
 *
 * Usage: node scripts/migrate-nav-history-to-turso.mjs
 * Env: POSTGRES_URL, TURSO_NAV_HISTORY_URL, TURSO_NAV_HISTORY_TOKEN
 */

import pg from 'pg';
import { upsertRows } from '../lib/navHistoryStore.js';

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error('[migrate-nav] FATAL: POSTGRES_URL is required.');
  process.exit(1);
}

pg.types.setTypeParser(1082, (val) => val); // DATE as plain string

const PAGE_SIZE = 20000;

async function main() {
  const client = new pg.Client({ connectionString: POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let lastCode = '', lastDate = '0001-01-01';
  let totalCopied = 0;
  let page = 0;

  for (;;) {
    const { rows } = await client.query(
      `SELECT code, nav_date, nav FROM mf_nav_history
        WHERE (code, nav_date) > ($1, $2::date)
        ORDER BY code, nav_date
        LIMIT $3`,
      [lastCode, lastDate, PAGE_SIZE]
    );
    if (!rows.length) break;

    const batch = rows.map((r) => ({ code: r.code, navDate: r.nav_date, nav: parseFloat(r.nav) }));
    await upsertRows(batch);
    totalCopied += batch.length;
    page++;
    const last = rows[rows.length - 1];
    lastCode = last.code; lastDate = last.nav_date;
    console.log(`[migrate-nav] page ${page}: copied ${batch.length} rows (total ${totalCopied.toLocaleString()}), through ${lastCode}/${lastDate}`);

    if (rows.length < PAGE_SIZE) break;
  }

  console.log(`[migrate-nav] done — ${totalCopied.toLocaleString()} rows copied.`);
  await client.end();
}

main().catch((err) => { console.error('[migrate-nav] FATAL:', err); process.exit(1); });
