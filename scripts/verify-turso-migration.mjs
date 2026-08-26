// scripts/verify-turso-migration.mjs
/**
 * Compares row counts and a value checksum between Postgres and Turso for
 * both migrated tables. Run after Tasks 3 and 4's backfills, before cutting
 * over any read/write call site. Exits non-zero on any mismatch.
 *
 * Usage: node scripts/verify-turso-migration.mjs
 */

import pg from 'pg';
import { getGlobalStats as navStats, getDb as navDb } from '../lib/navHistoryStore.js';
import { getDb as eodDb } from '../lib/stockEodStore.js';

async function main() {
  const client = new pg.Client({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let ok = true;

  const pgNav = await client.query(`SELECT COUNT(*) AS n, SUM(nav) AS sum_nav FROM mf_nav_history`);
  const tNavStats = await navStats();
  const db1 = await navDb();
  const { rows: sumRows } = await db1.execute(`SELECT SUM(nav) AS sum_nav FROM mf_nav_history`);

  const pgNavRows = Number(pgNav.rows[0].n);
  const pgNavSum = Number(pgNav.rows[0].sum_nav);
  const tNavSum = Number(sumRows[0].sum_nav);

  console.log(`[verify] mf_nav_history — Postgres: ${pgNavRows.toLocaleString()} rows, sum(nav)=${pgNavSum.toFixed(2)} | Turso: ${tNavStats.totalRows.toLocaleString()} rows, sum(nav)=${tNavSum.toFixed(2)}`);
  if (pgNavRows !== tNavStats.totalRows) { console.error('[verify] MISMATCH: mf_nav_history row count differs'); ok = false; }
  if (Math.abs(pgNavSum - tNavSum) > 0.01) { console.error('[verify] MISMATCH: mf_nav_history sum(nav) differs'); ok = false; }

  const pgEod = await client.query(`SELECT COUNT(*) AS n, SUM(close) AS sum_close FROM stock_eod`);
  const db2 = await eodDb();
  const { rows: eodRows } = await db2.execute(`SELECT COUNT(*) AS n, SUM(close) AS sum_close FROM stock_eod`);

  const pgEodRows = Number(pgEod.rows[0].n);
  const pgEodSum = Number(pgEod.rows[0].sum_close);
  const tEodRows = Number(eodRows[0].n);
  const tEodSum = Number(eodRows[0].sum_close);

  console.log(`[verify] stock_eod — Postgres: ${pgEodRows.toLocaleString()} rows, sum(close)=${pgEodSum.toFixed(2)} | Turso: ${tEodRows.toLocaleString()} rows, sum(close)=${tEodSum.toFixed(2)}`);
  if (pgEodRows !== tEodRows) { console.error('[verify] MISMATCH: stock_eod row count differs'); ok = false; }
  if (Math.abs(pgEodSum - tEodSum) > 0.01) { console.error('[verify] MISMATCH: stock_eod sum(close) differs'); ok = false; }

  await client.end();

  if (!ok) {
    console.error('\n[verify] FAILED — do not proceed with cutover until these match.');
    process.exit(1);
  }
  console.log('\n[verify] PASSED — Postgres and Turso agree on both tables.');
}

main().catch((err) => { console.error('[verify] FATAL:', err); process.exit(1); });
