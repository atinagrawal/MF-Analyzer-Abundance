/**
 * scripts/backfill-cas-pans.mjs
 *
 * One-time backfill for cas_portfolios.pans on rows saved before that
 * column existed (added alongside the PAN investor-naming feature — see
 * app/api/cas/pan-name/route.js). Those older rows have pans = '{}', so
 * their PANs can't be renamed/looked-up until backfilled or re-uploaded.
 *
 * Reads each row's saved payload from Cloudflare R2 (lib/r2.js) via its
 * blob_key -- every payload that used to live in Vercel Blob was already
 * copied into R2 under the same key by the (now-removed) one-time
 * migrate_blob_to_r2.js, and app/api/cas/load reads exclusively from R2
 * too, so there's no reason for this script to depend on Blob any more.
 * Extracts PANs from folios[].PAN and updates the row. Safe to re-run —
 * only touches rows where pans is still empty.
 *
 * Usage:
 *   node scripts/backfill-cas-pans.mjs
 * Env: POSTGRES_URL, plus lib/r2.js's R2_ACCOUNT_ID / R2_ACCESS_KEY_ID /
 *      R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME (all required).
 */

import pg from 'pg';
import { r2Get } from '../lib/r2.js';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

async function main() {
  const pgUrl = process.env.POSTGRES_URL;
  if (!pgUrl) {
    console.error('POSTGRES_URL is required.');
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: pgUrl, ssl: { rejectUnauthorized: false } });
  const { rows } = await pool.query(
    `SELECT id, blob_key FROM cas_portfolios WHERE pans = '{}'`
  );
  console.log(`[backfill] ${rows.length} row(s) with empty pans`);

  let ok = 0, failed = 0;
  for (const row of rows) {
    try {
      const data = await r2Get(row.blob_key);
      if (!data) throw new Error('not found in R2');
      const pans = [...new Set(
        (data.folios || [])
          .map(f => (f.PAN || '').toUpperCase().trim())
          .filter(p => PAN_REGEX.test(p))
      )];
      await pool.query(`UPDATE cas_portfolios SET pans = $1 WHERE id = $2`, [pans, row.id]);
      console.log(`[backfill] ${row.id}: ${pans.length} PAN(s)`);
      ok++;
    } catch (e) {
      console.log(`[backfill] ${row.id}: FAILED — ${e.message}`);
      failed++;
    }
  }

  console.log(`[backfill] done — ${ok} updated, ${failed} failed`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
