import pg from "pg";

async function main() {
  const c = new pg.Client({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });
  await c.connect();

  // Total DB coverage
  const total = await c.query(`
    SELECT COUNT(*) as rows, COUNT(DISTINCT code) as funds,
           MIN(nav_date)::date as min_d, MAX(nav_date)::date as max_d
    FROM mf_nav_history
  `);
  const t = total.rows[0];
  const minD = t.min_d.toISOString().split("T")[0];
  const maxD = t.max_d.toISOString().split("T")[0];
  console.log(`DB State: ${parseInt(t.rows).toLocaleString()} rows | ${t.funds} funds | ${minD} -> ${maxD}`);
  console.log("");

  // Breakdown by latest NAV date
  const breakdown = await c.query(`
    SELECT latest_date, COUNT(*) as fund_count
    FROM (
      SELECT code, MAX(nav_date)::date as latest_date
      FROM mf_nav_history
      GROUP BY code
    ) sub
    GROUP BY latest_date
    ORDER BY latest_date DESC
    LIMIT 10
  `);
  console.log("Funds by latest NAV date:");
  for (const r of breakdown.rows) {
    const d = r.latest_date.toISOString().split("T")[0];
    console.log(`  ${d}: ${r.fund_count} funds`);
  }

  // Any funds stuck before Aug 18?
  const stale = await c.query(`
    SELECT s.code, s.name, MAX(h.nav_date)::date as latest
    FROM mf_nav_history h JOIN mf_screener s ON s.code = h.code
    GROUP BY s.code, s.name
    HAVING MAX(h.nav_date) < '2026-08-18'
    ORDER BY latest, s.code::int
  `);
  console.log(`\nFunds stuck before Aug 18: ${stale.rowCount}`);
  stale.rows.forEach(r => {
    const d = r.latest.toISOString().split("T")[0];
    console.log(`  - ${r.code} ${r.name} -> latest: ${d}`);
  });

  // Cross-check: funds in screener NOT in history at all?
  const missing = await c.query(`
    SELECT s.code, s.name FROM mf_screener s
    WHERE NOT EXISTS (SELECT 1 FROM mf_nav_history h WHERE h.code = s.code)
  `);
  console.log(`\nFunds in screener with NO history at all: ${missing.rowCount}`);
  missing.rows.forEach(r => console.log(`  - ${r.code} ${r.name}`));

  await c.end();
  console.log("\n✅ Audit complete.");
}

main().catch(e => { console.error(e.message); process.exit(1); });
