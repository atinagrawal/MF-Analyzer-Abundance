/**
 * scripts/sync_mf_scheme_list.js
 *
 * Pre-fetches AMFI's full live scheme list (NAVAll.txt) and writes a lean
 * { schemeCode: schemeName } JSON index to Cloudflare R2 (lib/r2.js), used
 * by pages/api/mf.js's search path so the common case doesn't need a live
 * AMFI fetch. Only code+name are kept -- search doesn't need NAV/ISIN/date,
 * which change daily and are fetched fresh elsewhere (pages/api/mf.js's own
 * latest-NAV/history paths) when actually needed.
 *
 * Previously committed this file to git as data/mf-scheme-list.json, which
 * both bloated repo history with a ~1MB diff on every real change and
 * forced a full production redeploy just to refresh a lookup table. Moved
 * to R2 so a sync updates live data without either cost -- readers pick up
 * the new list within their own in-memory cache TTL, not on the next deploy.
 *
 * Scheduled DAILY (unlike this project's other AMFI syncs, which are
 * monthly) since new scheme launches/renames can happen any day.
 *
 * Usage:
 *   node scripts/sync_mf_scheme_list.js [--dry-run]
 *
 * Requires the same R2_* env vars as lib/r2.js (R2_ACCOUNT_ID,
 * R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME).
 *
 * Every real production write backs up the previous value to
 * "mf-scheme-list.json.backup" first, so a bad write that somehow gets past
 * the partial-failure guard below still has a rollback point.
 */

const { backupThenPut } = require('./lib/r2SyncSafety');

const DRY_RUN = process.argv.includes('--dry-run');
const AMFI_URL = 'https://portal.amfiindia.com/spages/NAVAll.txt';
const R2_KEY = 'mf-scheme-list.json';

async function run() {
  console.log('=== Syncing MF Scheme List (for search) ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active]');

  const { r2Put, r2Get } = await import('../lib/r2.js');

  const res = await fetch(AMFI_URL, { headers: { Accept: 'text/plain' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    console.error(`[MF Scheme List Sync] AMFI NAVAll.txt returned HTTP ${res.status} -- aborting, leaving existing R2 copy untouched.`);
    process.exit(1);
  }
  const text = await res.text();

  const schemes = {};
  let written = 0;
  for (const line of text.split('\n')) {
    const parts = line.trim().split(';');
    // AMFI added dedicated Plan/Option columns (confirmed Aug 2026) --
    // pages/api/mf.js's search filters (hide Direct/IDCW variants) need
    // these directly now that the scheme name no longer embeds them as text.
    if (parts.length < 6) continue;
    const code = parts[0].trim();
    if (!/^\d{5,6}$/.test(code)) continue;
    const name = parts[3].trim();
    if (!name) continue;
    schemes[code] = { name, plan: (parts[4] || '').trim(), option: (parts[5] || '').trim() };
    written++;
  }

  console.log(`Scheme codes written: ${written}`);

  let existing = null;
  let existingCount = 0;
  try {
    existing = await r2Get(R2_KEY);
    existingCount = Object.keys(existing?.schemes || {}).length;
  } catch (e) {
    console.warn(`[MF Scheme List Sync] Could not read existing R2 copy to compare record counts: ${e.message}`);
  }

  if (written === 0) {
    console.error('[MF Scheme List Sync] Error: No scheme codes resolved!');
    if (existingCount > 0) {
      console.log('[MF Scheme List Sync] Preserving existing R2 copy.');
      return;
    }
    process.exit(1);
  }

  // Partial-failure guard, same reasoning as this project's other sync
  // scripts: runs unattended on a schedule, so refuse to overwrite good
  // data with a suspiciously smaller result.
  if (!DRY_RUN && existingCount > 0 && written < existingCount * 0.5) {
    console.error(`[MF Scheme List Sync] Error: New record count (${written}) is less than 50% of existing R2 copy's record count (${existingCount}) -- likely a partial AMFI API failure.`);
    console.log('[MF Scheme List Sync] Preserving existing R2 copy.');
    process.exit(1);
  }

  if (!DRY_RUN) {
    const output = { generatedAt: new Date().toISOString(), count: written, schemes };
    await backupThenPut(r2Put, R2_KEY, existing, JSON.stringify(output));
    console.log(`[MF Scheme List Sync] Successfully wrote ${written} scheme names to R2 (${R2_KEY})`);
  }
}

run().catch((e) => {
  console.error('[MF Scheme List Sync] Fatal error:', e);
  process.exit(1);
});
