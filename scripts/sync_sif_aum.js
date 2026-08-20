/**
 * scripts/sync_sif_aum.js
 *
 * Syncs quarterly Average AUM per SIF (Specialized Investment Fund) scheme
 * plan-variant (Direct/Regular x Growth/IDCW) from AMFI's own (undocumented)
 * SIF Average AUM API:
 *   GET /api/sif-average-aum-schemewise?strType=Categorywise&fyId=1&periodId=1&SIF_Id=0
 *
 * Discovered live (2026-08) via the dropdown-driven page
 * https://www.amfiindia.com/sif/average-aum by capturing its network request.
 * SIF_Id=0 returns EVERY SIF's every scheme plan-variant in a single call,
 * each one keyed directly by this app's own AMFI_Code format ("SIF-XXX",
 * matching what /api/sif-nav exposes as scheme_id and what
 * /api/proposal-studio/holdings already accepts as `amfiCode` for a SIF) --
 * no fuzzy name matching needed, unlike scripts/sync_scheme_riskometer.js's
 * mutual-fund equivalent (AMFI has no per-scheme SIF riskometer at all).
 *
 * Each response group is also keyed by SchemeCat_Desc (AMFI's own
 * SEBI-mandated category description, e.g. "Equity Oriented Investment
 * Strategies - Equity Ex-Top 100 Long-Short Fund") -- captured below as each
 * scheme's `category`, since the underlying holdings vendor has never
 * classified SIFs into its own category taxonomy at all (confirmed live,
 * 2026-08: null for real SIFs across multiple fund houses). See
 * app/api/proposal-studio/holdings/route.js's fetchFresh(), which falls back
 * to this field.
 *
 * fyId=1/periodId=1 is assumed to always mean "the most recently published
 * quarter" -- matches the page's dropdowns, which live-tested only offered
 * 2 FY options (newest first) and 1 period option for the current FY, the
 * same newest-first ordering every other AMFI dropdown-driven page
 * reverse-engineered for this project's sync scripts has used. Re-running
 * with the same fixed params is idempotent as more quarters get published.
 *
 * The response has no explicit as-of date field, so it's derived from the
 * run date via the same "most recently completed calendar quarter"
 * convention this app's MF AUM data already displays (e.g. "June-2026").
 *
 * Usage:
 *   node scripts/sync_sif_aum.js [--dry-run]
 *
 * Every real production write backs up the previous value to
 * "sif-aum.json.backup" first, so a bad write that somehow gets past the
 * partial-failure guard below still has a rollback point.
 */

const { backupThenPut } = require('./lib/r2SyncSafety');

const DRY_RUN = process.argv.includes('--dry-run');
const R2_KEY = 'sif-aum.json';

const URL = 'https://www.amfiindia.com/api/sif-average-aum-schemewise?strType=Categorywise&fyId=1&periodId=1&SIF_Id=0';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Referer': 'https://www.amfiindia.com/sif/average-aum',
};

function mostRecentQuarterEndLabel(now = new Date()) {
  const year = now.getFullYear();
  const quarterEnds = [
    { m: 2, d: 31, label: 'March' },
    { m: 5, d: 30, label: 'June' },
    { m: 8, d: 30, label: 'September' },
    { m: 11, d: 31, label: 'December' },
  ];
  let best = null;
  for (const q of quarterEnds) {
    if (new Date(year, q.m, q.d) <= now) best = { label: q.label, year };
  }
  if (!best) best = { label: 'December', year: year - 1 }; // Jan/Feb -- last quarter was Dec of the prior year
  return `${best.label}-${best.year}`;
}

async function run() {
  console.log('=== Syncing SIF Scheme-Level Average AUM ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active]');

  const { r2Put, r2Get } = await import('../lib/r2.js');

  const res = await fetch(URL, { headers: HEADERS, signal: AbortSignal.timeout(20000) });
  if (!res.ok) {
    console.error(`[SIF AUM Sync] AMFI API returned HTTP ${res.status} -- aborting, leaving existing R2 copy untouched.`);
    process.exit(1);
  }
  const json = await res.json();
  const groups = Array.isArray(json.data) ? json.data : [];
  if (groups.length === 0) {
    console.error('[SIF AUM Sync] Empty response -- aborting, leaving existing R2 copy untouched.');
    process.exit(1);
  }

  const asOf = mostRecentQuarterEndLabel();
  const result = {};
  let written = 0;

  for (const group of groups) {
    // Each group is one SIF (group.sif_id/sifname), not a shared category --
    // group.totalAUM.AverageAum is AMFI's own pre-aggregated sum across every
    // plan-variant (Direct/Regular x Growth/IDCW) under it (verified live,
    // Aug 2026: matches summing the variants by hand). "AUM" everywhere this
    // data is shown means the fund's total size, not one variant's slice --
    // use the group total for every variant instead of each scheme's own
    // AverageAumForTheMonth.
    const totalAumCr = group.totalAUM?.AverageAum != null
      ? Math.round((group.totalAUM.AverageAum / 100) * 100) / 100
      : null;
    for (const scheme of (group.schemes || [])) {
      if (!scheme.AMFI_Code || totalAumCr == null) continue;
      result[scheme.AMFI_Code] = {
        amfiCode: scheme.AMFI_Code,
        schemeName: scheme.SchemeNAVName,
        aumCr: totalAumCr,
        asOf,
        // The underlying holdings vendor has never classified SIFs into its
        // own category taxonomy (confirmed live, 2026-08: null for real
        // SIFs across multiple fund houses) -- AMFI's own SEBI-mandated
        // category description for this scheme's group is the only
        // reliable source, so it's captured here for
        // app/api/proposal-studio/holdings/route.js to fall back to.
        category: group.SchemeCat_Desc || null,
      };
      written++;
    }
  }

  console.log(`\n=== Sync Results ===`);
  console.log(`SIF/category groups seen: ${groups.length}`);
  console.log(`Scheme plan-variants written: ${written}`);
  console.log(`As-of quarter: ${asOf}`);

  let existing = null;
  let existingCount = 0;
  try {
    existing = await r2Get(R2_KEY);
    existingCount = Object.keys(existing || {}).length;
  } catch (e) {
    console.warn(`[SIF AUM Sync] Could not read existing R2 copy to compare record counts: ${e.message}`);
  }

  if (written === 0) {
    console.error('[SIF AUM Sync] Error: No AUM records could be resolved!');
    if (existingCount > 0) {
      console.log('[SIF AUM Sync] Preserving existing R2 copy.');
      return;
    }
    process.exit(1);
  }

  // Partial-failure guard, same reasoning as this project's other sync
  // scripts: this runs unattended on a schedule, so refuse to overwrite
  // good data with a suspiciously smaller result.
  if (!DRY_RUN && existingCount > 0 && written < existingCount * 0.5) {
    console.error(`[SIF AUM Sync] Error: New record count (${written}) is less than 50% of existing R2 copy's record count (${existingCount}) -- likely a partial AMFI API failure.`);
    console.log('[SIF AUM Sync] Preserving existing R2 copy.');
    process.exit(1);
  }

  if (!DRY_RUN) {
    await backupThenPut(r2Put, R2_KEY, existing, JSON.stringify(result));
    console.log(`[SIF AUM Sync] Successfully wrote ${written} records to R2 (${R2_KEY})`);
  }
}

run().catch((e) => {
  console.error('[SIF AUM Sync] Fatal error:', e);
  process.exit(1);
});
