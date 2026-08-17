/**
 * scripts/migrate-rate-limit.mjs
 *
 * One-time migration: creates the rate_limit_counters table (schema also
 * documented in scripts/schema.sql). Idempotent (IF NOT EXISTS), safe to re-run.
 *
 * Usage:
 *   node scripts/migrate-rate-limit.mjs
 * Env: POSTGRES_URL (required).
 */

import pg from 'pg';

async function main() {
  const pgUrl = process.env.POSTGRES_URL;
  if (!pgUrl) {
    console.error('POSTGRES_URL is required.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });

  console.log('[migrate] creating rate_limit_counters...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS rate_limit_counters (
      subject_key  TEXT        NOT NULL,
      route_key    TEXT        NOT NULL,
      window_secs  INT         NOT NULL,
      window_start TIMESTAMPTZ NOT NULL,
      count        INT         NOT NULL DEFAULT 1,
      PRIMARY KEY (subject_key, route_key, window_secs, window_start)
    )
  `);

  console.log('[migrate] done.');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
