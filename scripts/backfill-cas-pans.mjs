/**
 * scripts/backfill-cas-pans.mjs
 *
 * One-time backfill for cas_portfolios.pans on rows saved before that
 * column existed (added alongside the PAN investor-naming feature — see
 * app/api/cas/pan-name/route.js). Those older rows have pans = '{}', so
 * their PANs can't be renamed/looked-up until backfilled or re-uploaded.
 *
 * Reads each row's saved blob from Vercel Blob, extracts PANs from
 * folios[].PAN, and updates the row. Safe to re-run — only touches rows
 * where pans is still empty.
 *
 * Usage:
 *   node scripts/backfill-cas-pans.mjs
 * Env: POSTGRES_URL, BLOB_READ_WRITE_TOKEN (both required).
 */

import pg from 'pg';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

async function main() {
  const pgUrl = process.env.POSTGRES_URL;
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  if (!pgUrl || !blobToken) {
    console.error('Both POSTGRES_URL and BLOB_READ_WRITE_TOKEN are required.');
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
      const res = await fetch(`https://blob.vercel-storage.com/${row.blob_key}`, {
        headers: { Authorization: `Bearer ${blobToken}` },
      });
      if (!res.ok) throw new Error(`blob fetch ${res.status}`);
      const data = await res.json();
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
