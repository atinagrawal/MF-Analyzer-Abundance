/**
 * scripts/migrate-lifecycle-tracking.mjs
 *
 * One-time migration: applies the two schema additions from scripts/schema.sql
 * that back user engagement tracking (last_active_at column, lifecycle_emails_sent
 * table). Both statements are idempotent (IF NOT EXISTS), so safe to re-run.
 *
 * Usage:
 *   node scripts/migrate-lifecycle-tracking.mjs
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

  console.log('[migrate] adding users.last_active_at...');
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ`);

  console.log('[migrate] creating lifecycle_emails_sent...');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS lifecycle_emails_sent (
      id         TEXT        NOT NULL DEFAULT gen_random_uuid()::text PRIMARY KEY,
      user_id    TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email_type TEXT        NOT NULL,
      sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, email_type)
    )
  `);

  console.log('[migrate] done.');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
