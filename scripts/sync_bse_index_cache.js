/**
 * scripts/sync_bse_index_cache.js
 *
 * Scheduled (GitHub Actions) pre-warming for every live route that depends
 * on BSE's index API: pages/api/nifty-tri.js (Rolling Returns + the fund
 * and SIF detail pages' benchmark-overlay charts) and
 * app/api/bse-index/route.js (PMS compare modal's alpha lookup).
 *
 * WHY THIS EXISTS: api.bseindia.com now returns 403 to requests from
 * Vercel's production IPs (confirmed live, 2026-10 -- the identical
 * request with identical headers succeeds from a non-cloud machine). Both
 * routes above used to call lib/bseIndex.js's fetch functions live,
 * on-demand, which is exactly what now fails. This script runs the SAME
 * fetch functions from a GitHub Actions runner (not blocked -- the same
 * reasoning scripts/ingest-eod.mjs already relies on for BSE bhavcopy)
 * and writes the results to the exact R2 keys those routes read, so a
 * live request never needs to reach BSE itself under normal operation.
 *
 * Writes:
 *   - bse-index-cache/_symbol-list.json  { list, ts }
 *       Same shape/key lib/bseIndex.js's getCachedBseSymbolList() reads.
 *   - bse-tri-cache/{slug}.json  { index, data: [{date, value}], ts }  (one per index)
 *       Same shape/key pages/api/nifty-tri.js's blob cache AND
 *       app/api/bse-index/route.js's readSharedSeries() both read.
 *
 * Every BSE index is synced (not just the handful named in BENCH_OPTIONS-
 * style lists scattered across the app) -- cheap per the existing "BSE
 * returns full history in one request" finding (lib/bseIndex.js), and
 * means any future addition to those lists is already warm without this
 * script needing to know about it.
 *
 * Usage:
 *   node scripts/sync_bse_index_cache.js             # sync every index
 *   node scripts/sync_bse_index_cache.js --dry-run    # fetch + log, no R2 writes
 *   node scripts/sync_bse_index_cache.js --limit=5    # first N indices only, for a quick smoke test
 *
 * Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 * (required to persist; without them, dry-run-equivalent since r2Put would
 * throw -- pass --dry-run explicitly to skip even attempting writes).
 */

const DRY_RUN = process.argv.includes('--dry-run');
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;

const SYMBOL_LIST_KEY = 'bse-index-cache/_symbol-list.json';
const SERIES_PRE = 'bse-tri-cache/';

// Small gap between each index's request -- BSE's WAF is already blocking
// Vercel's IPs outright; a burst of 149 back-to-back requests from a
// fresh runner IP is the kind of pattern that gets an IP flagged in the
// first place. Not load-bearing for correctness, just good citizenship.
const REQUEST_GAP_MS = 250;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  console.log('=== Syncing BSE index cache (symbol list + per-index daily series) ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active -- no R2 writes]');

  const { r2Put } = await import('../lib/r2.js');
  const { fetchBseSymbolList, fetchBseDailySeries, slugify, fmtBseDisplayDate } = await import('../lib/bseIndex.js');

  console.log('Fetching BSE index symbol list...');
  const list = await fetchBseSymbolList();
  if (!list.length) throw new Error('BSE symbol list came back empty -- aborting rather than caching nothing.');
  console.log(`Got ${list.length} indices.`);

  if (!DRY_RUN) {
    await r2Put(SYMBOL_LIST_KEY, JSON.stringify({ list, ts: Date.now() }));
    console.log(`Wrote symbol list to R2 (${SYMBOL_LIST_KEY}).`);
  }

  const targets = LIMIT ? list.slice(0, LIMIT) : list;
  let ok = 0;
  let failed = 0;
  const failures = [];

  for (const entry of targets) {
    const symbol = entry.Indx_cd;
    const name = (entry.shortalias || '').trim();
    if (!symbol || !name) continue;

    try {
      const rows = await fetchBseDailySeries(symbol); // no range = full history since inception
      const data = rows.map((r) => ({ date: fmtBseDisplayDate(r.date), value: r.close }));
      if (!data.length) throw new Error('0 rows returned');

      if (!DRY_RUN) {
        await r2Put(`${SERIES_PRE}${slugify(name)}.json`, JSON.stringify({ index: name, data, ts: Date.now() }));
      }
      ok++;
      console.log(`  ✓ ${name} (${symbol}): ${data.length} rows`);
    } catch (err) {
      failed++;
      failures.push({ name, symbol, error: err.message });
      console.warn(`  ✗ ${name} (${symbol}): ${err.message}`);
    }
    await sleep(REQUEST_GAP_MS);
  }

  console.log(`\nDone. ${ok} indices synced, ${failed} failed.`);
  if (failures.length) {
    console.log('Failures:', JSON.stringify(failures, null, 2));
  }

  // A handful of failures (a delisted/renamed index, a transient hiccup on
  // one request) is normal and shouldn't fail the whole workflow run --
  // every OTHER index's cache still got refreshed. Only fail the job
  // outright if close to nothing succeeded, which signals something
  // structural (e.g. BSE blocking the runner's IP too) worth surfacing as
  // a red workflow run rather than a silent near-total miss.
  if (ok === 0 || failed > targets.length * 0.5) {
    throw new Error(`Too many failures (${failed}/${targets.length}) -- treating this run as broken rather than silently caching a near-empty result.`);
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('[sync_bse_index_cache] Fatal error:', err.message);
    process.exit(1);
  });
}

module.exports = { run };
