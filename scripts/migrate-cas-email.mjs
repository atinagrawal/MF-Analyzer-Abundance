/**
 * scripts/migrate-cas-email.mjs
 *
 * One-time migration: adds cas_portfolios.cas_email -- the investor email
 * casparser already extracts from CAMS/KFintech CAS PDFs (InvestorInfo.email,
 * confirmed by reading casparser's own source) but this app never captured.
 * Nullable, no backfill: only uploads saved after this ships get a value --
 * see docs/superpowers/specs/2026-10-14-admin-client-outreach-design.md.
 *
 * Usage:
 *   node scripts/migrate-cas-email.mjs
 * Env: POSTGRES_URL (required; auto-loaded from .env.local if not already set).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.POSTGRES_URL) {
  const envPath = path.resolve(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      if (line.startsWith('POSTGRES_URL=')) {
        process.env.POSTGRES_URL = line.slice('POSTGRES_URL='.length).trim().replace(/^["']|["']$/g, '');
        break;
      }
    }
  }
}

async function main() {
  const pgUrl = process.env.POSTGRES_URL;
  if (!pgUrl) {
    console.error('POSTGRES_URL is required.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });

  console.log('[migrate] adding cas_portfolios.cas_email...');
  await pool.query(`ALTER TABLE cas_portfolios ADD COLUMN IF NOT EXISTS cas_email TEXT`);

  console.log('[migrate] done.');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
