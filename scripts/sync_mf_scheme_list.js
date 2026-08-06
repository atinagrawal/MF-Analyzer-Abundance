/**
 * scripts/sync_mf_scheme_list.js
 *
 * Pre-fetches AMFI's full live scheme list (NAVAll.txt) and writes a lean
 * { schemeCode: schemeName } JSON index used for MF search, so
 * pages/api/mf.js's search path never needs a live fetch for the common
 * case -- matching how data/amfi-aum.json, data/amfi-scheme-risk.json,
 * and data/sif-aum.json already work for their own data. Only code+name
 * are kept -- search doesn't need NAV/ISIN/date, which change daily and
 * are fetched fresh elsewhere (pages/api/mf.js's own latest-NAV/history
 * paths) when actually needed.
 *
 * Scheduled DAILY (unlike this project's other AMFI syncs, which are
 * monthly) since new scheme launches/renames can happen any day, and the
 * whole point is for search to be instant on the very first request after
 * a deploy, not just after the in-memory cache has already been warmed by
 * a live fetch.
 *
 * Usage:
 *   node scripts/sync_mf_scheme_list.js [--dry-run]
 */

const fs = require('fs');
const path = require('path');

const DRY_RUN = process.argv.includes('--dry-run');
const AMFI_URL = 'https://portal.amfiindia.com/spages/NAVAll.txt';

async function run() {
  console.log('=== Syncing MF Scheme List (for search) ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active]');

  const res = await fetch(AMFI_URL, { headers: { Accept: 'text/plain' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    console.error(`[MF Scheme List Sync] AMFI NAVAll.txt returned HTTP ${res.status} -- aborting, leaving existing data/mf-scheme-list.json untouched.`);
    process.exit(1);
  }
  const text = await res.text();

  const schemes = {};
  let written = 0;
  for (const line of text.split('\n')) {
    const parts = line.trim().split(';');
    if (parts.length < 6) continue;
    const code = parts[0].trim();
    if (!/^\d{5,6}$/.test(code)) continue;
    const name = parts[3].trim();
    if (!name) continue;
    schemes[code] = name;
    written++;
  }

  console.log(`Scheme codes written: ${written}`);

  const targetFile = path.join(process.cwd(), 'data', 'mf-scheme-list.json');
  let existingCount = 0;
  if (fs.existsSync(targetFile)) {
    try {
      existingCount = Object.keys(JSON.parse(fs.readFileSync(targetFile, 'utf8')).schemes || {}).length;
    } catch (e) {
      console.warn(`[MF Scheme List Sync] Could not parse existing data/mf-scheme-list.json to compare record counts: ${e.message}`);
    }
  }

  if (written === 0) {
    console.error('[MF Scheme List Sync] Error: No scheme codes resolved!');
    if (fs.existsSync(targetFile)) {
      console.log('[MF Scheme List Sync] Preserving existing data/mf-scheme-list.json cache.');
      return;
    }
    process.exit(1);
  }

  // Partial-failure guard, same reasoning as this project's other sync
  // scripts: runs unattended on a schedule and auto-commits, so refuse to
  // overwrite good data with a suspiciously smaller result.
  if (!DRY_RUN && existingCount > 0 && written < existingCount * 0.5) {
    console.error(`[MF Scheme List Sync] Error: New record count (${written}) is less than 50% of existing data/mf-scheme-list.json's record count (${existingCount}) -- likely a partial AMFI API failure.`);
    console.log('[MF Scheme List Sync] Preserving existing data/mf-scheme-list.json cache.');
    process.exit(1);
  }

  if (!DRY_RUN) {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    const output = { generatedAt: new Date().toISOString(), count: written, schemes };
    fs.writeFileSync(targetFile, JSON.stringify(output), 'utf8');
    console.log(`[MF Scheme List Sync] Successfully wrote ${written} scheme names to ${targetFile}`);
  }
}

run().catch((e) => {
  console.error('[MF Scheme List Sync] Fatal error:', e);
  process.exit(1);
});
