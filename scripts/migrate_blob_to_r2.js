/**
 * scripts/migrate_blob_to_r2.js
 *
 * One-time migration: copies every existing CAS/proposal payload from
 * Vercel Blob into Cloudflare R2, under the SAME blob_key, so rows saved
 * before the R2 migration (lib/r2.js) stay loadable -- app/api/cas/load
 * and app/api/proposal-studio/load now read exclusively from R2, so a row
 * whose payload was never copied over will 404 on load.
 *
 * Requires ALL of:
 *   POSTGRES_URL          -- to enumerate blob_key values from cas_portfolios/proposals
 *   BLOB_READ_WRITE_TOKEN -- the OLD Vercel Blob token, to read the existing objects
 *   R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME
 *                          -- lib/r2.js's vars, to write the copies
 *
 * Run once, locally -- this is NOT part of the deployed app and is never
 * scheduled. Easiest way to get all the above into your shell:
 *   vercel env pull .env.local
 *   node --env-file=.env.local scripts/migrate_blob_to_r2.js [--dry-run]
 * (or export the vars manually, however you prefer)
 *
 * Safe to re-run: a key already present in R2 is skipped, not re-uploaded,
 * so an interrupted run can just be started again.
 *
 * If Vercel Blob's quota exhaustion blocks READS as well as writes, the
 * very first fetch below will fail with a clear HTTP error -- that means
 * the old payloads are unreachable until Blob access is restored (e.g. a
 * temporary plan upgrade just long enough to run this once), not that
 * anything is wrong with this script.
 */

const { Pool } = require('pg');

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
  console.log('=== Migrating Vercel Blob payloads to Cloudflare R2 ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active]');

  const required = ['POSTGRES_URL', 'BLOB_READ_WRITE_TOKEN', 'R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`Missing required env vars: ${missing.join(', ')}`);
    console.error('See this file\'s header comment for how to supply them.');
    process.exit(1);
  }

  const { r2Put, r2Get } = await import('../lib/r2.js');
  const { list } = await import('@vercel/blob');
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  const pool = new Pool({ connectionString: process.env.POSTGRES_URL, ssl: { rejectUnauthorized: false } });

  const casRows = await pool.query('SELECT id, blob_key FROM cas_portfolios ORDER BY uploaded_at');
  const proposalRows = await pool.query('SELECT id, blob_key FROM proposals ORDER BY created_at');
  const allRows = [
    ...casRows.rows.map((r) => ({ ...r, table: 'cas_portfolios' })),
    ...proposalRows.rows.map((r) => ({ ...r, table: 'proposals' })),
  ];

  console.log(`Found ${casRows.rows.length} CAS uploads and ${proposalRows.rows.length} saved proposals (${allRows.length} total).`);

  let migrated = 0, alreadyPresent = 0, missingInBlob = 0, failed = 0;

  for (const row of allRows) {
    try {
      const existing = await r2Get(row.blob_key);
      if (existing) {
        alreadyPresent++;
        continue;
      }

      const { blobs } = await list({ prefix: row.blob_key, limit: 1, token });
      if (!blobs.length) {
        console.warn(`[${row.table}:${row.id}] Not found in Vercel Blob (blob_key=${row.blob_key}) -- skipping.`);
        missingInBlob++;
        continue;
      }

      const res = await fetch(blobs[0].downloadUrl || blobs[0].url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Vercel Blob fetch failed: HTTP ${res.status}`);
      const content = await res.text();

      if (!DRY_RUN) {
        await r2Put(row.blob_key, content);
      }
      console.log(`[${row.table}:${row.id}] Migrated (blob_key=${row.blob_key}, ${content.length} bytes)`);
      migrated++;
    } catch (err) {
      console.error(`[${row.table}:${row.id}] Failed: ${err.message}`);
      failed++;
    }
  }

  console.log('\n=== Migration Results ===');
  console.log(`Migrated: ${migrated}`);
  console.log(`Already present in R2 (skipped): ${alreadyPresent}`);
  console.log(`Missing in Vercel Blob (skipped): ${missingInBlob}`);
  console.log(`Failed: ${failed}`);

  await pool.end();

  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error('[Blob->R2 Migration] Fatal error:', e);
  process.exit(1);
});
