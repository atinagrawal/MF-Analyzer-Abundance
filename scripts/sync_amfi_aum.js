/**
 * scripts/sync_amfi_aum.js
 *
 * Syncs quarterly Average AUM (per scheme plan-variant -- Direct/Regular x
 * Growth/IDCW all resolved separately, which is what makes it usable where
 * the Groww-sourced `aum` field on /api/proposal-studio/holdings isn't:
 * that field is Direct-plan-only and silently wrong for a Regular-plan
 * holding) plus scheme launch date, from AMFI's own (undocumented)
 * scheme-details API:
 *   1. GET /api/populate-mf                                     -> AMC list
 *   2. GET /api/populate-scheme?MF_ID=X                         -> scheme list per AMC
 *   3. GET /api/scheme-data?strMFId=X&strSDId=Y&strOption=NAV    -> plan variants + ISIN
 *   4. GET /api/scheme-data?strMFId=X&strSDId=Y&strOption=AUM    -> plan variants + AUM (Lakhs)
 *   5. GET /api/scheme-details?MF_ID=X&scheme_id=Y               -> Launch_Date (scheme-level, one call per scheme_id, not per plan-variant)
 * NAV and AUM responses are joined by their shared `Scheme_NAV_Name`, then
 * each ISIN is resolved to this app's AMFI scheme code via NAVAll.txt (the
 * same join key/parsing approach scripts/sync_groww_exit_loads.js already
 * uses) since AMFI's internal `strSDId` is not the AMFI scheme code used
 * everywhere else in this app.
 *
 * A scheme_id whose NAV call returns no rows is matured/inactive and is
 * skipped entirely -- populate-scheme lists every scheme an AMC has EVER
 * registered, including decades of matured FMPs/close-ended funds, so this
 * check saves an AUM call (and output noise) for the majority of dead rows.
 *
 * Usage:
 *   node scripts/sync_amfi_aum.js [--dry-run] [--limit-amcs=N]
 *
 * --limit-amcs=N processes only the first N AMCs -- for a fast smoke test
 * before committing to the full multi-thousand-scheme run. A real (non
 * --dry-run) --limit-amcs run writes to "amfi-aum.json.smoketest" instead
 * of the production key -- its result is real but partial by design, so it
 * must never land where the app reads it. Every real production write also
 * backs up the previous value to "amfi-aum.json.backup" first.
 */

const fs = require('fs');
const path = require('path');
const { backupThenPut, smoketestKey } = require('./lib/r2SyncSafety');

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_AMCS_ARG = process.argv.find((a) => a.startsWith('--limit-amcs='));
const LIMIT_AMCS = LIMIT_AMCS_ARG ? parseInt(LIMIT_AMCS_ARG.split('=')[1], 10) : 0;
const R2_KEY = smoketestKey('amfi-aum.json', LIMIT_AMCS > 0, DRY_RUN);

const AMFI_BASE = 'https://www.amfiindia.com/api';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://www.amfiindia.com/otherdata/scheme-details',
};
const PACING_MS = 200;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { status: res.status, data: null };
    const data = await res.json();
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

// Retries on 429/5xx/network errors with exponential backoff (1s, 2s, 4s).
// Any other non-ok status is treated as "no data" immediately -- this API
// returns a clean 200 + [] for schemes with no data, never a 404.
async function fetchJsonWithRetry(url, maxRetries = 3) {
  let attempt = 0;
  while (true) {
    const result = await fetchJson(url);
    const retryable = result.status === 429 || result.status >= 500 || result.status === 0;
    if (!retryable || attempt >= maxRetries) return result;
    const backoffMs = 1000 * Math.pow(2, attempt);
    console.warn(`  [retry] status=${result.status || result.error} from ${url} -- backing off ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
    await sleep(backoffMs);
    attempt++;
  }
}

// Same NAVAll.txt parsing approach as scripts/sync_groww_exit_loads.js:
// non-scheme lines name the AMC for every scheme row that follows, until
// the next such line. Fetched live (matching app/api/scheme-master-facts's
// AMFI_NAV_URL) rather than reading the untracked local NAVAll.txt copy
// sync_groww_exit_loads.js relies on -- that file doesn't exist on a fresh
// GitHub Actions checkout, and this script is meant to run there on a
// schedule, not just ad hoc on one developer's machine. Falls back to the
// local file only if the live fetch fails, for offline dev convenience.
async function loadNavAllIsinToCode() {
  const isinToCode = new Map();
  let text = null;
  try {
    const res = await fetch('https://www.amfiindia.com/spages/NAVAll.txt', { signal: AbortSignal.timeout(20000) });
    if (res.ok) text = await res.text();
  } catch (e) {
    console.warn(`[AMFI AUM Sync] Live NAVAll.txt fetch failed: ${e.message}`);
  }
  if (!text) {
    const navAllPath = path.join(process.cwd(), 'NAVAll.txt');
    if (fs.existsSync(navAllPath)) {
      console.warn('[AMFI AUM Sync] Falling back to local NAVAll.txt copy.');
      text = fs.readFileSync(navAllPath, 'utf8');
    }
  }
  if (!text) {
    console.warn('[AMFI AUM Sync] No NAVAll.txt available (live or local) -- ISIN-to-AMFI-code resolution will be empty.');
    return isinToCode;
  }
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '').trim();
    if (!line || line.startsWith('Scheme Code;') || !line.includes(';')) continue;
    const parts = line.split(';');
    if (parts.length < 6) continue;
    const code = parts[0].trim();
    const isin1 = parts[1].trim();
    const isin2 = parts[2].trim();
    if (!code || isNaN(code)) continue;
    if (isin1 && isin1.startsWith('INF')) isinToCode.set(isin1, code);
    if (isin2 && isin2.startsWith('INF')) isinToCode.set(isin2, code);
  }
  console.log(`[AMFI AUM Sync] Loaded ${isinToCode.size} ISIN-to-AMFI-code mappings from NAVAll.txt.`);
  return isinToCode;
}

async function run() {
  console.log('=== Syncing AMFI Scheme-Level AUM ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active]');

  const { r2Put, r2Get } = await import('../lib/r2.js');
  const isinToCode = await loadNavAllIsinToCode();

  const amcRes = await fetchJsonWithRetry(`${AMFI_BASE}/populate-mf`);
  if (!Array.isArray(amcRes.data) || amcRes.data.length === 0) {
    console.error('[AMFI AUM Sync] Could not fetch AMC list -- aborting, leaving existing R2 copy untouched.');
    process.exit(1);
  }
  await sleep(PACING_MS);

  let amcs = amcRes.data;
  if (LIMIT_AMCS > 0) {
    console.log(`Limiting sync run to first ${LIMIT_AMCS} AMCs.`);
    amcs = amcs.slice(0, LIMIT_AMCS);
  }
  console.log(`Found ${amcRes.data.length} AMCs (processing ${amcs.length}).`);

  const result = {};
  let schemesSeen = 0;
  let variantsMatured = 0;
  let variantsUnresolved = 0;
  let variantsWritten = 0;

  for (let a = 0; a < amcs.length; a++) {
    const amc = amcs[a];
    console.log(`[AMC ${a + 1}/${amcs.length}] ${amc.mfName} (mfId=${amc.mfId})`);

    const schemeRes = await fetchJsonWithRetry(`${AMFI_BASE}/populate-scheme?MF_ID=${amc.mfId}`);
    await sleep(PACING_MS);
    const schemes = Array.isArray(schemeRes.data) ? schemeRes.data : [];

    for (let s = 0; s < schemes.length; s++) {
      const scheme = schemes[s];
      schemesSeen++;

      const navRes = await fetchJsonWithRetry(
        `${AMFI_BASE}/scheme-data?strMFId=${amc.mfId}&strSDId=${scheme.scheme_id}&strOption=NAV`,
      );
      await sleep(PACING_MS);
      const navRows = Array.isArray(navRes.data) ? navRes.data : [];
      if (navRows.length === 0) {
        variantsMatured++;
        continue; // matured/inactive scheme -- skip the AUM call entirely
      }

      const aumRes = await fetchJsonWithRetry(
        `${AMFI_BASE}/scheme-data?strMFId=${amc.mfId}&strSDId=${scheme.scheme_id}&strOption=AUM`,
      );
      await sleep(PACING_MS);
      const aumRows = Array.isArray(aumRes.data) ? aumRes.data : [];
      const aumByName = new Map(aumRows.map((r) => [r.Scheme_NAV_Name, r]));

      // Launch_Date is a scheme-level fact (one date for the scheme_id,
      // shared by every plan-variant under it) -- fetched once here rather
      // than per plan-variant.
      const detailsRes = await fetchJsonWithRetry(
        `${AMFI_BASE}/scheme-details?MF_ID=${amc.mfId}&scheme_id=${scheme.scheme_id}`,
      );
      await sleep(PACING_MS);
      const rawLaunchDate = detailsRes.data?.data?.[0]?.Launch_Date;
      const launchDate = rawLaunchDate ? rawLaunchDate.split('T')[0] : null;

      // Collect every plan-variant under this ONE scheme_id first, so their
      // AUM can be summed into a single fund-level total below. "AUM"
      // everywhere this data is shown (fund detail page, drawers, Proposal
      // Studio, screener) means the fund's total size -- the conventional,
      // fact-sheet meaning -- not one Direct/Regular x Growth/IDCW variant's
      // slice (confirmed a real bug in production, Aug 2026).
      const schemeVariants = [];
      for (const navRow of navRows) {
        const isin = navRow.ISIN_Div_Payout_ISIN_Growth;
        if (!isin || !isin.startsWith('INF')) continue;
        const aumRow = aumByName.get(navRow.Scheme_NAV_Name);
        if (!aumRow || aumRow.Average_AUM_For_The_Quarter == null) continue;

        const amfiCode = isinToCode.get(isin);
        if (!amfiCode) {
          variantsUnresolved++;
          continue; // ISIN not in NAVAll.txt's currently-active set -- can't key by AMFI code
        }

        schemeVariants.push({
          amfiCode,
          isin,
          schemeName: navRow.Scheme_NAV_Name,
          asOf: aumRow.As_At_The_End_Of || null,
          aumLakhs: aumRow.Average_AUM_For_The_Quarter,
        });
      }

      const totalAumCr = schemeVariants.length
        ? Math.round((schemeVariants.reduce((sum, v) => sum + v.aumLakhs, 0) / 100) * 100) / 100
        : null;
      for (const v of schemeVariants) {
        result[v.amfiCode] = {
          amfiCode: v.amfiCode,
          isin: v.isin,
          schemeName: v.schemeName,
          aumCr: totalAumCr,
          asOf: v.asOf,
          launchDate,
        };
        variantsWritten++;
      }
    }

    console.log(`  ...running totals: ${variantsWritten} written, ${variantsMatured} matured/skipped, ${variantsUnresolved} unresolved ISINs`);
  }

  console.log(`\n=== Sync Results ===`);
  console.log(`AMCs processed: ${amcs.length}`);
  console.log(`Schemes checked: ${schemesSeen}`);
  console.log(`Matured/inactive (no NAV data, skipped): ${variantsMatured}`);
  console.log(`Plan variants with AUM written: ${variantsWritten}`);
  console.log(`Plan variants with unresolved ISIN (not in NAVAll.txt): ${variantsUnresolved}`);

  let existing = null;
  let existingCount = 0;
  try {
    existing = await r2Get(R2_KEY);
    existingCount = Object.keys(existing || {}).length;
  } catch (e) {
    console.warn(`[AMFI AUM Sync] Could not read existing R2 copy to compare record counts: ${e.message}`);
  }

  if (variantsWritten === 0) {
    console.error('[AMFI AUM Sync] Error: No AUM records could be resolved!');
    if (existingCount > 0) {
      console.log('[AMFI AUM Sync] Preserving existing R2 copy.');
      return;
    }
    process.exit(1);
  }

  // Partial-failure guard: if AMFI's API degraded mid-run (most AMCs fail
  // but a few succeed), variantsWritten would still be > 0 but drastically
  // smaller than the existing cache. Refuse to overwrite good data with a
  // truncated result -- this script runs unattended on a monthly GitHub
  // Actions schedule with no human review. Only applies to a genuine full,
  // unrestricted, non-dry-run sync -- a deliberately scoped --limit-amcs=N
  // smoke test (per this script's own header comment) or a --dry-run
  // legitimately writes far fewer records than the full dataset, which
  // isn't a failure signal.
  if (!DRY_RUN && LIMIT_AMCS === 0 && existingCount > 0 && variantsWritten < existingCount * 0.5) {
    console.error(`[AMFI AUM Sync] Error: New record count (${variantsWritten}) is less than 50% of existing R2 copy's record count (${existingCount}) -- likely a partial AMFI API failure.`);
    console.log('[AMFI AUM Sync] Preserving existing R2 copy.');
    process.exit(1);
  }

  if (!DRY_RUN) {
    await backupThenPut(r2Put, R2_KEY, existing, JSON.stringify(result));
    console.log(`[AMFI AUM Sync] Successfully wrote ${variantsWritten} records to R2 (${R2_KEY})`);
  }
}

run().catch((e) => {
  console.error('[AMFI AUM Sync] Fatal error:', e);
  process.exit(1);
});
