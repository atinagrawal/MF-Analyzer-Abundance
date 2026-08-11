/**
 * scripts/sync_scheme_riskometer.js
 *
 * Syncs AMFI's own OFFICIAL per-scheme Riskometer rating (`riskometerScheme`)
 * from AMFI's (undocumented) Fund Performance gateway API:
 *   1. POST /gateway/pollingsebi/api/amfi/fundperformancefilters -> current reportDate
 *   2. POST /gateway/pollingsebi/api/amfi/fundperformance         -> per (category,
 *      subCategory) list of schemes, each carrying riskometerScheme
 *
 * This closes a real gap: neither this app's holdings data source (Groww)
 * nor AMFI's own scheme-details API (used by sync_amfi_aum.js) expose a
 * per-scheme risk rating -- until now, /api/proposal-studio/holdings could
 * only infer risk via the fund's BENCHMARK's own riskometer (lib/riskometer.js's
 * matchBenchmarkRisk), which only covers funds whose benchmark is one of the
 * ~141 indices NSE tracks. This is the real, scheme-level, SEBI-mandated
 * rating instead of an inferred proxy.
 *
 * The API has no scheme code/ISIN field -- only a plain-text scheme FAMILY
 * name (e.g. "HDFC Flexi Cap Fund", no Direct/Regular/Growth/Plan suffix,
 * shared by every plan-variant). Matching against this app's own
 * Direct/Regular/Growth/IDCW-suffixed scheme names therefore happens via
 * normalizeSchemeFamilyName -- an independent copy of
 * app/api/proposal-studio/holdings/route.js's cleanSearchTerm word list (that
 * route's own comment explains why it doesn't import a shared copy across
 * the script/ESM-module boundary; the same reasoning applies here).
 *
 * Scope: Open Ended schemes only (maturityType=1). Close-Ended schemes
 * (FMPs etc., maturityType=2) are out of scope -- they're rarely proposed
 * and would double the combo count for very little practical benefit.
 *
 * Usage:
 *   node scripts/sync_scheme_riskometer.js [--dry-run] [--limit-combos=N]
 *
 * --limit-combos=N processes only the first N (category, subCategory) combos
 * -- for a fast smoke test before committing to the full ~40-combo run. A
 * real (non --dry-run) --limit-combos run writes to
 * "amfi-scheme-risk.json.smoketest" instead of the production key -- its
 * result is real but partial by design, so it must never land where the app
 * reads it. Every real production write also backs up the previous value to
 * "amfi-scheme-risk.json.backup" first.
 */

const { backupThenPut, smoketestKey } = require('./lib/r2SyncSafety');

const DRY_RUN = process.argv.includes('--dry-run');
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit-combos='));
const LIMIT_COMBOS = LIMIT_ARG ? parseInt(LIMIT_ARG.split('=')[1], 10) : 0;
const R2_KEY = smoketestKey('amfi-scheme-risk.json', LIMIT_COMBOS > 0, DRY_RUN);

const BASE = 'https://www.amfiindia.com/gateway/pollingsebi/api/amfi';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Content-Type': 'application/json',
  'Referer': 'https://www.amfiindia.com/polling/amfi/fund-performance',
  'Origin': 'https://www.amfiindia.com',
};
const PACING_MS = 400;

// Full taxonomy per AMFI's fund-performance gateway (category -> its
// subcategory IDs). Equity=1, Debt=2, Hybrid=3, Solution Oriented=4, Other=5.
const TAXONOMY = [
  { category: 1, label: 'Equity', subCategories: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { category: 2, label: 'Debt', subCategories: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29] },
  { category: 3, label: 'Hybrid', subCategories: [30, 31, 32, 33, 34, 35, 40] },
  { category: 4, label: 'Solution Oriented', subCategories: [36, 37] },
  { category: 5, label: 'Other', subCategories: [38, 39] },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, body) {
  try {
    const res = await fetch(url, { method: 'POST', headers: HEADERS, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    if (!res.ok) return { status: res.status, data: null };
    const data = await res.json();
    return { status: res.status, data };
  } catch (err) {
    return { status: 0, error: err.message };
  }
}

async function fetchJsonWithRetry(url, body, maxRetries = 3) {
  let attempt = 0;
  while (true) {
    const result = await fetchJson(url, body);
    const retryable = result.status === 429 || result.status >= 500 || result.status === 0;
    if (!retryable || attempt >= maxRetries) return result;
    const backoffMs = 1000 * Math.pow(2, attempt);
    console.warn(`  [retry] status=${result.status || result.error} -- backing off ${backoffMs}ms (attempt ${attempt + 1}/${maxRetries})`);
    await sleep(backoffMs);
    attempt++;
  }
}

// Independent copy of app/api/proposal-studio/holdings/route.js's
// cleanSearchTerm word list -- see file header comment for why this isn't
// shared across the script/ESM-module boundary. Additionally lowercases and
// strips remaining punctuation, since this normalizer's output is used
// directly as a JSON object key (cleanSearchTerm's callers do their own
// .toLowerCase() at the comparison site instead).
// AMFI's gateway returns "Low to Moderate" (lowercase "to"), but this app's
// existing riskometer casing convention -- components/RiskGauge.jsx's
// RISK_CONFIG and the NSE benchmark-riskometer PDF parser in
// lib/riskometer.js -- uses "Low To Moderate" (capital T). Canonicalizing
// here, at the data source, means every downstream consumer (RiskGauge's
// color lookup, RISK_SCORE_BY_LABEL's needle-position lookup in
// ProposalStudioClient.jsx, the PDF export) can match on the one casing
// without each needing its own case-insensitive fallback.
const CANONICAL_RISK_LABELS = {
  'low': 'Low',
  'low to moderate': 'Low To Moderate',
  'moderate': 'Moderate',
  'moderately high': 'Moderately High',
  'high': 'High',
  'very high': 'Very High',
};
function canonicalizeRiskLabel(label) {
  return CANONICAL_RISK_LABELS[String(label || '').toLowerCase().trim()] || label;
}

function normalizeSchemeFamilyName(name) {
  return String(name || '')
    .replace(/\(.*?\)/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/\b(Direct|Regular)\b/gi, ' ')
    .replace(/\bPlan\b/gi, ' ')
    .replace(/\bOption\b/gi, ' ')
    .replace(/\b(Growth|IDCW|Dividend)\b/gi, ' ')
    .replace(/\b(Payout|Reinvestment|Reinvest|Bonus|Quarterly|Monthly|Weekly|Daily|Annual)\b/gi, ' ')
    .replace(/\bFund\b/gi, ' ')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

async function run() {
  console.log('=== Syncing AMFI Scheme-Level Riskometer ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active]');

  const { r2Put, r2Get } = await import('../lib/r2.js');

  const filtersRes = await fetchJsonWithRetry(`${BASE}/fundperformancefilters`, {});
  const reportDate = filtersRes.data?.data?.reportDate;
  if (!reportDate) {
    console.error('[Scheme Riskometer Sync] Could not fetch reportDate -- aborting, leaving existing R2 copy untouched.');
    process.exit(1);
  }
  console.log(`Report date: ${reportDate}`);
  await sleep(PACING_MS);

  let combos = [];
  for (const cat of TAXONOMY) {
    for (const subCategory of cat.subCategories) {
      combos.push({ category: cat.category, categoryLabel: cat.label, subCategory });
    }
  }
  if (LIMIT_COMBOS > 0) {
    console.log(`Limiting sync run to first ${LIMIT_COMBOS} combos.`);
    combos = combos.slice(0, LIMIT_COMBOS);
  }
  console.log(`Processing ${combos.length} category/subCategory combos.`);

  const risk = {}; // normalizedSchemeFamilyName -> riskometerScheme label
  let schemesSeen = 0;
  let collisions = 0;

  for (let i = 0; i < combos.length; i++) {
    const { category, categoryLabel, subCategory } = combos[i];
    const res = await fetchJsonWithRetry(`${BASE}/fundperformance`, {
      maturityType: 1, category, subCategory, mfid: 0, reportDate,
    });
    await sleep(PACING_MS);

    const rows = Array.isArray(res.data?.data) ? res.data.data : [];
    console.log(`[${i + 1}/${combos.length}] ${categoryLabel} / subCategory=${subCategory}: ${rows.length} schemes`);

    for (const row of rows) {
      schemesSeen++;
      if (!row.schemeName || !row.riskometerScheme) continue;
      const key = normalizeSchemeFamilyName(row.schemeName);
      if (!key) continue;
      const label = canonicalizeRiskLabel(row.riskometerScheme);
      if (risk[key] && risk[key] !== label) {
        collisions++;
        continue; // keep the first value seen -- collisions should be rare/nonexistent
      }
      risk[key] = label;
    }
  }

  const written = Object.keys(risk).length;
  console.log(`\n=== Sync Results ===`);
  console.log(`Combos processed: ${combos.length}`);
  console.log(`Scheme rows seen: ${schemesSeen}`);
  console.log(`Unique scheme families written: ${written}`);
  console.log(`Normalization collisions (kept first value): ${collisions}`);

  let existing = null;
  let existingCount = 0;
  try {
    existing = await r2Get(R2_KEY);
    existingCount = Object.keys(existing?.risk || {}).length;
  } catch (e) {
    console.warn(`[Scheme Riskometer Sync] Could not read existing R2 copy to compare record counts: ${e.message}`);
  }

  if (written === 0) {
    console.error('[Scheme Riskometer Sync] Error: No risk records could be resolved!');
    if (existingCount > 0) {
      console.log('[Scheme Riskometer Sync] Preserving existing R2 copy.');
      return;
    }
    process.exit(1);
  }

  // Partial-failure guard, same reasoning as sync_amfi_aum.js: this runs
  // unattended on a monthly schedule, so refuse to overwrite good data with
  // a run that's suspiciously smaller than what's already there. Only
  // applies to a genuine full, unrestricted, non-dry-run sync.
  if (!DRY_RUN && LIMIT_COMBOS === 0 && existingCount > 0 && written < existingCount * 0.5) {
    console.error(`[Scheme Riskometer Sync] Error: New record count (${written}) is less than 50% of existing R2 copy's record count (${existingCount}) -- likely a partial AMFI API failure.`);
    console.log('[Scheme Riskometer Sync] Preserving existing R2 copy.');
    process.exit(1);
  }

  if (!DRY_RUN) {
    const output = { asOf: reportDate, generatedAt: new Date().toISOString(), count: written, risk };
    await backupThenPut(r2Put, R2_KEY, existing, JSON.stringify(output));
    console.log(`[Scheme Riskometer Sync] Successfully wrote ${written} records to R2 (${R2_KEY})`);
  }
}

run().catch((e) => {
  console.error('[Scheme Riskometer Sync] Fatal error:', e);
  process.exit(1);
});
