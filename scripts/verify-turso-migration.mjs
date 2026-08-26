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

// Parse DATE columns as strings to match Turso's TEXT format
pg.types.setTypeParser(1082, (val) => val);

async function main() {
  const client = new pg.Client({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  let ok = true;

  // ===== mf_nav_history verification =====
  const pgNavCount = await client.query(`SELECT COUNT(*) AS n FROM mf_nav_history`);
  const tNavStats = await navStats();
  const db1 = await navDb();

  const pgNavRows = Number(pgNavCount.rows[0].n);

  console.log(`[verify] mf_nav_history row count — Postgres: ${pgNavRows.toLocaleString()} rows | Turso: ${tNavStats.totalRows.toLocaleString()} rows`);
  if (pgNavRows !== tNavStats.totalRows) {
    console.error('[verify] MISMATCH: mf_nav_history row count differs');
    ok = false;
  }

  // Per-date-bucketed sum comparison for mf_nav_history
  const pgNavByDate = await client.query(
    `SELECT nav_date, SUM(nav) AS sum_nav FROM mf_nav_history GROUP BY nav_date ORDER BY nav_date`
  );
  const { rows: tursoNavByDate } = await db1.execute(
    `SELECT nav_date, SUM(nav) AS sum_nav FROM mf_nav_history GROUP BY nav_date ORDER BY nav_date`
  );

  const pgNavMap = new Map(pgNavByDate.rows.map(row => [row.nav_date, Number(row.sum_nav)]));
  const tNavMap = new Map(tursoNavByDate.map(row => [row.nav_date, Number(row.sum_nav)]));

  let navDateMismatches = [];
  for (const [date, pgSum] of pgNavMap) {
    const tSum = tNavMap.get(date);
    if (tSum === undefined) {
      navDateMismatches.push(`${date} (missing in Turso)`);
    } else if (Math.abs(pgSum - tSum) > 0.01) {
      navDateMismatches.push(`${date} (PG: ${pgSum.toFixed(2)}, Turso: ${tSum.toFixed(2)})`);
    }
  }
  for (const date of tNavMap.keys()) {
    if (!pgNavMap.has(date)) {
      navDateMismatches.push(`${date} (missing in Postgres)`);
    }
  }

  if (navDateMismatches.length > 0) {
    const display = navDateMismatches.length > 10
      ? navDateMismatches.slice(0, 10).join(', ') + ` ... and ${navDateMismatches.length - 10} more`
      : navDateMismatches.join(', ');
    console.error(`[verify] MISMATCH: mf_nav_history date-bucketed sums differ: ${display}`);
    ok = false;
  } else {
    console.log(`[verify] mf_nav_history — ${pgNavMap.size} distinct dates checked, all sums match`);
  }

  // ===== stock_eod verification =====
  const pgEodCount = await client.query(`SELECT COUNT(*) AS n FROM stock_eod`);
  const db2 = await eodDb();
  const { rows: tursoEodCount } = await db2.execute(`SELECT COUNT(*) AS n FROM stock_eod`);

  const pgEodRows = Number(pgEodCount.rows[0].n);
  const tEodRows = Number(tursoEodCount[0].n);

  console.log(`[verify] stock_eod row count — Postgres: ${pgEodRows.toLocaleString()} rows | Turso: ${tEodRows.toLocaleString()} rows`);
  if (pgEodRows !== tEodRows) {
    console.error('[verify] MISMATCH: stock_eod row count differs');
    ok = false;
  }

  // Per-date-bucketed sum comparison for stock_eod
  const pgEodByDate = await client.query(
    `SELECT trade_date, SUM(close) AS sum_close FROM stock_eod GROUP BY trade_date ORDER BY trade_date`
  );
  const { rows: tursoEodByDate } = await db2.execute(
    `SELECT trade_date, SUM(close) AS sum_close FROM stock_eod GROUP BY trade_date ORDER BY trade_date`
  );

  const pgEodMap = new Map(pgEodByDate.rows.map(row => [row.trade_date, Number(row.sum_close)]));
  const tEodMap = new Map(tursoEodByDate.map(row => [row.trade_date, Number(row.sum_close)]));

  let eodDateMismatches = [];
  for (const [date, pgSum] of pgEodMap) {
    const tSum = tEodMap.get(date);
    if (tSum === undefined) {
      eodDateMismatches.push(`${date} (missing in Turso)`);
    } else if (Math.abs(pgSum - tSum) > 0.01) {
      eodDateMismatches.push(`${date} (PG: ${pgSum.toFixed(2)}, Turso: ${tSum.toFixed(2)})`);
    }
  }
  for (const date of tEodMap.keys()) {
    if (!pgEodMap.has(date)) {
      eodDateMismatches.push(`${date} (missing in Postgres)`);
    }
  }

  if (eodDateMismatches.length > 0) {
    const display = eodDateMismatches.length > 10
      ? eodDateMismatches.slice(0, 10).join(', ') + ` ... and ${eodDateMismatches.length - 10} more`
      : eodDateMismatches.join(', ');
    console.error(`[verify] MISMATCH: stock_eod date-bucketed sums differ: ${display}`);
    ok = false;
  } else {
    console.log(`[verify] stock_eod — ${pgEodMap.size} distinct dates checked, all sums match`);
  }

  await client.end();

  if (!ok) {
    console.error('\n[verify] FAILED — do not proceed with cutover until these match.');
    process.exit(1);
  }
  console.log('\n[verify] PASSED — Postgres and Turso agree on both tables.');
}

main().catch((err) => { console.error('[verify] FATAL:', err); process.exit(1); });
