/**
 * scripts/migrate-arn-overrides.mjs
 *
 * One-time migration: creates the arn_overrides table (schema also
 * documented in scripts/schema.sql). Idempotent (IF NOT EXISTS), safe to re-run.
 *
 * Usage:
 *   node scripts/migrate-arn-overrides.mjs
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

  console.log('[migrate] creating arn_overrides...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS arn_overrides (
      pan         TEXT        NOT NULL,
      folio_no    TEXT        NOT NULL,
      real_arn    TEXT        NOT NULL,
      updated_by  TEXT        NOT NULL REFERENCES users(id),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (pan, folio_no)
    )
  `);

  console.log('[migrate] done.');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
