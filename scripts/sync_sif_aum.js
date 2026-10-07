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
 * UPDATE (2026-10): the response ALSO includes, per SIF, a synthetic
 * summary row with SchemeCat_Desc "Total" and sifname "<Brand> SIF Total"
 * (schemes: [], totalAUM.AverageAum = AMFI's own pre-summed total across
 * every one of that SIF's category-groups), plus a single "Grand Total"
 * row for the whole industry. Confirmed live: "Altiva SIF Total"'s
 * AverageAum (946109.75) exactly equals the hand-summed total of Altiva's
 * 3 category groups. These rows are captured below as `sifTotals` /
 * `grandTotalCr` -- lib/sifReports.js's AUM leaderboard reads them
 * directly instead of re-deriving a per-SIF total itself. (An earlier
 * version of that leaderboard cross-referenced sif_screener to resolve
 * each scheme's SIF brand name, since only ONE representative plan-variant
 * per scheme lives there -- most plan-variants had no match, fell back to
 * a crude "first word + SIF" guess, and for brands where that guess didn't
 * reconstruct the real name character-for-character (WSIF -> "WSIF SIF",
 * wrong), the group's total silently got counted under two different
 * names -- a real double-counting bug, not just a display quirk. Reading
 * AMFI's own pre-aggregated Total rows sidesteps name resolution
 * entirely.)
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
 * Note this is a MONTHLY AVERAGE (AMFI's field is literally named
 * AverageAumForTheMonth / AverageAum), not a point-in-time snapshot -- see
 * lib/sifReports.js's header comment for why that matters and how it's
 * labeled to the user.
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

  // Quarterly data checked on a schedule that now runs several times a
  // month (5th/7th/10th/15th -- see .github/workflows/sif-aum-sync.yml) to
  // catch AMFI publishing early rather than always waiting for the last
  // run. Once an earlier run in the cycle already picked up the current
  // quarter, later runs that same month have nothing new to do -- skip
  // the live AMFI fetch entirely rather than hitting their API on every
  // scheduled run for a quarter we already have.
  const asOf = mostRecentQuarterEndLabel();
  try {
    const existingPeek = await r2Get(R2_KEY);
    const existingAsOf = existingPeek?.asOf ?? null;
    if (existingAsOf === asOf) {
      console.log(`[SIF AUM Sync] Already have ${asOf} data from an earlier run this cycle -- skipping live fetch.`);
      return;
    }
  } catch (e) {
    console.warn(`[SIF AUM Sync] Could not peek existing R2 copy to check for early-exit: ${e.message}`);
  }

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

  const schemes = {};
  const sifTotals = [];
  let grandTotalCr = null;
  let written = 0;

  for (const group of groups) {
    const rawName = (group.sifname || '').trim();
    const groupAumCr = group.totalAUM?.AverageAum != null
      ? Math.round((group.totalAUM.AverageAum / 100) * 100) / 100
      : null;

    // Three kinds of row in this response, distinguished by SchemeCat_Desc:
    // a per-(SIF, category) group (has real schemes[]), a per-SIF "<Brand>
    // SIF Total" summary row (schemes: [], AMFI's own pre-summed total
    // across that SIF's groups), and exactly one "Grand Total" row for the
    // whole industry.
    if (group.SchemeCat_Desc === 'Total') {
      if (rawName === 'Grand Total') {
        grandTotalCr = groupAumCr;
      } else if (rawName && groupAumCr != null) {
        // Display name: AMFI's own summary label minus the trailing
        // " Total" (e.g. "Altiva SIF Total" -> "Altiva SIF", "WSIF Total"
        // -> "WSIF") -- this IS the authoritative brand name, not a guess.
        sifTotals.push({ sifName: rawName.replace(/\s+Total$/i, ''), aumCr: groupAumCr });
      }
      continue;
    }

    // Each group is one SIF (group.sif_id/sifname), not a shared category --
    // group.totalAUM.AverageAum is AMFI's own pre-aggregated sum across every
    // plan-variant (Direct/Regular x Growth/IDCW) under it (verified live,
    // Aug 2026: matches summing the variants by hand). "AUM" everywhere this
    // data is shown means the fund's total size, not one variant's slice --
    // use the group total for every variant instead of each scheme's own
    // AverageAumForTheMonth.
    for (const scheme of (group.schemes || [])) {
      if (!scheme.AMFI_Code || groupAumCr == null) continue;
      schemes[scheme.AMFI_Code] = {
        amfiCode: scheme.AMFI_Code,
        schemeName: scheme.SchemeNAVName,
        aumCr: groupAumCr,
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

  sifTotals.sort((a, b) => b.aumCr - a.aumCr);

  console.log(`\n=== Sync Results ===`);
  console.log(`SIF/category groups seen: ${groups.length}`);
  console.log(`Scheme plan-variants written: ${written}`);
  console.log(`Per-SIF totals captured: ${sifTotals.length}`);
  console.log(`Grand total: ${grandTotalCr != null ? `₹${grandTotalCr} Cr` : 'MISSING'}`);
  console.log(`As-of quarter: ${asOf}`);

  let existing = null;
  let existingCount = 0;
  try {
    existing = await r2Get(R2_KEY);
    existingCount = Object.keys(existing?.schemes || existing || {}).length;
  } catch (e) {
    console.warn(`[SIF AUM Sync] Could not read existing R2 copy to compare record counts: ${e.message}`);
  }

  if (written === 0 || sifTotals.length === 0 || grandTotalCr == null) {
    console.error('[SIF AUM Sync] Error: Could not resolve scheme records, per-SIF totals, or the grand total!');
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

  const result = { asOf, grandTotalCr, sifTotals, schemes };

  if (!DRY_RUN) {
    await backupThenPut(r2Put, R2_KEY, existing, JSON.stringify(result));
    console.log(`[SIF AUM Sync] Successfully wrote ${written} scheme records + ${sifTotals.length} SIF totals to R2 (${R2_KEY})`);
    await recordHistory(r2Get, r2Put, asOf, grandTotalCr);
  }
}

/**
 * Appends one entry to the industry grand-total history
 * (sif-aum-history.json), used by lib/sifReports.js's AUM leaderboard to
 * show a period-over-period delta (AMFI's SIF AUM disclosure updates
 * quarterly, not monthly, so "period" here means "the last time this
 * figure actually changed", not a fixed calendar interval). Upserts by
 * `asOf` so re-running this script within the same quarter (the 5th,
 * 7th, 10th, 15th schedule -- see .github/workflows/sif-aum-sync.yml)
 * never creates duplicate entries for one quarter.
 */
async function recordHistory(r2Get, r2Put, asOf, grandTotalCr) {
  const HISTORY_KEY = 'sif-aum-history.json';
  let history = [];
  try {
    const existing = await r2Get(HISTORY_KEY);
    if (Array.isArray(existing)) history = existing;
  } catch (e) {
    console.warn(`[SIF AUM Sync] Could not read existing history, starting fresh: ${e.message}`);
  }

  const idx = history.findIndex((h) => h.asOf === asOf);
  const entry = { asOf, grandTotalCr, capturedAt: new Date().toISOString() };
  if (idx >= 0) {
    history[idx] = entry; // same quarter re-synced with a (possibly revised) figure
  } else {
    history.push(entry);
  }
  history.sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));

  try {
    await r2Put(HISTORY_KEY, JSON.stringify(history));
    console.log(`[SIF AUM Sync] Recorded history entry for ${asOf} (${history.length} total entries).`);
  } catch (e) {
    // Non-fatal: the main sif-aum.json write already succeeded above,
    // and this only affects the MoM-delta display, not current figures.
    console.warn(`[SIF AUM Sync] Failed to write history: ${e.message}`);
  }
}

run().catch((e) => {
  console.error('[SIF AUM Sync] Fatal error:', e);
  process.exit(1);
});
