/**
 * scripts/migrate-lead-contacted.mjs
 *
 * One-time migration: adds users.lead_contacted_at -- lets an admin or
 * distributor mark a CAS-uploading lead (see app/admin/LeadsTab.jsx and
 * app/api/admin/leads/route.js) as already followed up with, so the Leads
 * tab can distinguish fresh uploads from ones already worked. NULL means
 * not yet contacted; a timestamp records when it was marked.
 *
 * Usage:
 *   node scripts/migrate-lead-contacted.mjs
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

  console.log('[migrate] adding users.lead_contacted_at...');
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS lead_contacted_at TIMESTAMPTZ`);

  console.log('[migrate] done.');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
