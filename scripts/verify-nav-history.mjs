/**
 * scripts/verify-nav-history.mjs
 *
 * Verification and health-check script for the `mf_nav_history` table.
 * Analyzes coverage, freshness, gaps, and spot-checks popular funds.
 *
 * Usage:
 *   POSTGRES_URL="postgresql://..." node scripts/verify-nav-history.mjs
 */

import pg from 'pg';

const POSTGRES_URL = process.env.POSTGRES_URL;
if (!POSTGRES_URL) {
  console.error('[verify] FATAL: POSTGRES_URL environment variable is required.');
  process.exit(1);
}

const SAMPLE_CODES = [
  { code: '100033', name: 'HDFC Top 100 Fund' },
  { code: '119028', name: 'Axis Bluechip Fund' },
  { code: '120503', name: 'Mirae Asset Large Cap Fund' },
  { code: '102528', name: 'ICICI Prudential MidCap Fund' },
  { code: '101072', name: 'Quant Multi Asset Allocation Fund' },
];

async function main() {
  console.log('====================================================');
  console.log('       MF NAV History Table Verification Report     ');
  console.log('====================================================\n');

  const client = new pg.Client({
    connectionString: POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  // 1. Check if table exists
  const tableCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = 'mf_nav_history'
    ) AS exists;
  `);

  if (!tableCheck.rows[0]?.exists) {
    console.error('❌ Table `mf_nav_history` DOES NOT EXIST in database.');
    await client.end();
    process.exit(1);
  }

  // 2. Summary counts
  const totalRowsRes = await client.query('SELECT COUNT(*) AS count FROM mf_nav_history');
  const totalRows = parseInt(totalRowsRes.rows[0]?.count || '0', 10);

  const totalFundsRes = await client.query('SELECT COUNT(DISTINCT code) AS count FROM mf_nav_history');
  const totalHistoryFunds = parseInt(totalFundsRes.rows[0]?.count || '0', 10);

  let screenerCount = 0;
  try {
    const scrRes = await client.query('SELECT COUNT(DISTINCT code) AS count FROM mf_screener');
    screenerCount = parseInt(scrRes.rows[0]?.count || '0', 10);
  } catch (_) {}

  const dateRangeRes = await client.query(`
    SELECT 
      MIN(nav_date)::text AS min_date,
      MAX(nav_date)::text AS max_date
    FROM mf_nav_history
  `);
  const minDate = dateRangeRes.rows[0]?.min_date || 'N/A';
  const maxDate = dateRangeRes.rows[0]?.max_date || 'N/A';

  console.log(`📊 [Total Rows]:           ${totalRows.toLocaleString()}`);
  console.log(`🏛️ [Funds in History]:     ${totalHistoryFunds}`);
  console.log(`📋 [Funds in Screener]:    ${screenerCount > 0 ? screenerCount : 'N/A'}`);
  console.log(`📅 [Date Coverage Range]:  ${minDate}  →  ${maxDate}\n`);

  if (totalRows === 0) {
    console.warn('⚠️ WARNING: `mf_nav_history` table is currently empty.');
    console.warn('   Run `node scripts/bootstrap-nav-history.mjs` to seed the table.\n');
    await client.end();
    return;
  }

  // 3. Missing funds check (funds in screener with 0 records in history)
  if (screenerCount > 0) {
    const missingRes = await client.query(`
      SELECT s.code, s.name 
      FROM mf_screener s
      LEFT JOIN (SELECT DISTINCT code FROM mf_nav_history) h ON s.code = h.code
      WHERE h.code IS NULL
      LIMIT 20;
    `);
    const missingCountRes = await client.query(`
      SELECT COUNT(*) AS count
      FROM mf_screener s
      LEFT JOIN (SELECT DISTINCT code FROM mf_nav_history) h ON s.code = h.code
      WHERE h.code IS NULL;
    `);
    const missingCount = parseInt(missingCountRes.rows[0]?.count || '0', 10);

    if (missingCount === 0) {
      console.log('✅ [Coverage]: 100% of screener funds are covered in history table.');
    } else {
      console.warn(`⚠️ [Coverage]: ${missingCount} screener funds are missing from history table.`);
      for (const m of missingRes.rows) {
        console.warn(`    - ${m.code}: ${m.name}`);
      }
      if (missingCount > 20) {
        console.warn(`    ... and ${missingCount - 20} more.`);
      }
    }
  }

  // 4. Stale funds check (funds whose max date is older than 5 days)
  const staleRes = await client.query(`
    SELECT code, MAX(nav_date)::text AS latest
    FROM mf_nav_history
    GROUP BY code
    HAVING MAX(nav_date) < CURRENT_DATE - INTERVAL '5 days'
    ORDER BY latest ASC
    LIMIT 15;
  `);
  const staleCountRes = await client.query(`
    SELECT COUNT(*) AS count FROM (
      SELECT code
      FROM mf_nav_history
      GROUP BY code
      HAVING MAX(nav_date) < CURRENT_DATE - INTERVAL '5 days'
    ) t;
  `);
  const staleCount = parseInt(staleCountRes.rows[0]?.count || '0', 10);

  if (staleCount === 0) {
    console.log('✅ [Freshness]: All active funds have up-to-date NAVs.');
  } else {
    console.log(`ℹ️ [Freshness]: ${staleCount} funds have latest NAV > 5 days old (may be matured/merged schemes).`);
    for (const s of staleRes.rows) {
      console.log(`    - Code ${s.code}: latest NAV date was ${s.latest}`);
    }
  }

  // 5. Sparse funds check (< 30 data points)
  const sparseRes = await client.query(`
    SELECT code, COUNT(*) AS points, MIN(nav_date)::text AS min_d, MAX(nav_date)::text AS max_d
    FROM mf_nav_history
    GROUP BY code
    HAVING COUNT(*) < 30
    LIMIT 10;
  `);
  const sparseCountRes = await client.query(`
    SELECT COUNT(*) AS count FROM (
      SELECT code FROM mf_nav_history GROUP BY code HAVING COUNT(*) < 30
    ) t;
  `);
  const sparseCount = parseInt(sparseCountRes.rows[0]?.count || '0', 10);

  if (sparseCount === 0) {
    console.log('✅ [Data Density]: All funds have >= 30 history points.');
  } else {
    console.log(`ℹ️ [Data Density]: ${sparseCount} funds have < 30 points (newly launched NFOs/funds).`);
  }

  // 6. Spot check sample funds
  console.log('\n🔍 [Spot Check Sample Funds]:');
  console.log('----------------------------------------------------');
  for (const item of SAMPLE_CODES) {
    const sampleRes = await client.query(`
      SELECT 
        COUNT(*) AS count,
        MIN(nav_date)::text AS min_date,
        MAX(nav_date)::text AS max_date,
        (SELECT nav FROM mf_nav_history WHERE code = $1 ORDER BY nav_date DESC LIMIT 1) AS latest_nav,
        (SELECT nav FROM mf_nav_history WHERE code = $1 ORDER BY nav_date ASC LIMIT 1) AS oldest_nav
      FROM mf_nav_history
      WHERE code = $1;
    `, [item.code]);

    const row = sampleRes.rows[0];
    const count = parseInt(row?.count || '0', 10);

    if (count > 0) {
      console.log(`✅ [${item.code}] ${item.name}:`);
      console.log(`    Points: ${count.toLocaleString()} | Range: ${row.min_date} (₹${row.oldest_nav}) → ${row.max_date} (₹${row.latest_nav})`);
    } else {
      console.log(`⚠️ [${item.code}] ${item.name}: No records found in DB.`);
    }
  }

  console.log('----------------------------------------------------');
  console.log('\n[verify] Verification check completed successfully.');

  await client.end();
}

main().catch((err) => {
  console.error('[verify] Verification failed with error:', err);
  process.exit(1);
});
