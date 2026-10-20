/**
 * scripts/migrate-cas-mobile.mjs
 *
 * One-time migration: adds cas_portfolios.cas_mobile -- the investor mobile
 * number casparser already extracts from CAMS/KFintech CAS PDFs
 * (InvestorInfo.mobile, confirmed by reading casparser's own source,
 * casparser/parsers/_investor.py) but this app never captured. Same
 * nullable, no-backfill approach as cas_email (see
 * scripts/migrate-cas-email.mjs and
 * docs/superpowers/specs/2026-10-14-admin-client-outreach-design.md) --
 * NSDL/CDSL CAS variants don't print mobile on the statement, so it comes
 * back empty for those, which is expected, not an extraction failure.
 *
 * Usage:
 *   node scripts/migrate-cas-mobile.mjs
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

  console.log('[migrate] adding cas_portfolios.cas_mobile...');
  await pool.query(`ALTER TABLE cas_portfolios ADD COLUMN IF NOT EXISTS cas_mobile TEXT`);

  console.log('[migrate] done.');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
