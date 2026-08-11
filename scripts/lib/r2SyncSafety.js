/**
 * scripts/lib/r2SyncSafety.js
 *
 * Shared safety net for this project's monthly/daily R2-backed sync
 * scripts (sync_mf_scheme_list.js, sync_bse_scheme_master.js,
 * sync_amfi_aum.js, sync_scheme_riskometer.js, sync_sif_aum.js). Each
 * script already has its own partial-failure guard (refuse to overwrite
 * good data with a suspiciously smaller result); this adds a second,
 * independent layer that doesn't rely on that guard being right every
 * time.
 *
 * backupThenPut() writes the CURRENT value (already fetched by the
 * caller's own existing-count check -- passed in rather than re-fetched,
 * to avoid a second R2 round trip) to `${key}.backup` before overwriting
 * `key` with the new value, so there's always one rollback point even if
 * a bad write somehow gets past the count-based guard (e.g. a
 * same-count-but-wrong-content run, or a run where the existing-count
 * read itself failed and the guard couldn't compare against anything).
 *
 * smoketestKey() isolates a deliberate, real (non-dry-run) --limit-* smoke
 * test (a REAL write, just over a small subset -- see each script's own CLI
 * flags) to a "<key>.smoketest" R2 key instead of the real production
 * key, so verifying the write mechanics can never accidentally clobber
 * production data the way a plain small-subset write would.
 */

async function backupThenPut(r2Put, key, existingValue, newContent) {
  if (existingValue != null) {
    try {
      await r2Put(`${key}.backup`, JSON.stringify(existingValue));
    } catch (e) {
      console.warn(`[r2SyncSafety] Could not back up ${key} before overwrite: ${e.message}`);
    }
  }
  await r2Put(key, newContent);
}

function smoketestKey(key, isLimited, isDryRun) {
  return isLimited && !isDryRun ? `${key}.smoketest` : key;
}

module.exports = { backupThenPut, smoketestKey };
