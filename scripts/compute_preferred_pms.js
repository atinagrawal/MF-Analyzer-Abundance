/**
 * scripts/compute_preferred_pms.js
 *
 * Computes the curated "Abundance Preferred" PMS strategy list: strategies
 * from scripts/sync_pms_factsheets.js's extracted set that are Top Quartile
 * vs APMI peers, plus cross-strategy insights only possible because this
 * app holds all of them together (most-held stock, top aggregate sector,
 * best alpha, best Sharpe). See docs/superpowers/specs/2026-09-09-pms-preferred-strategies-design.md.
 *
 * Run as an added step in .github/workflows/pms-factsheets-sync.yml right
 * after scripts/sync_pms_factsheets.js, so it always sees that run's fresh
 * pms-factsheets.json. Also runnable manually:
 *   node --env-file=.env.local scripts/compute_preferred_pms.js [--dry-run]
 *   node scripts/compute_preferred_pms.js --self-test
 */

const DRY_RUN = process.argv.includes('--dry-run');
const R2_KEY = 'pms-preferred-strategies.json';

const { backupThenPut } = require('./lib/r2SyncSafety');
const { PROVIDERS } = require('./sync_pms_factsheets.js');
const { getPmsDetailsStandalone, getLatestMonthSnapshotStandalone, getPmsQuartileStandalone } = require('./lib/apmiStandalone.js');

// ── Step 4 of the spec: Top-Quartile eligibility rule ───────────────────────
// quartileRows: [{ period, label, peers, iaTwrr, benchmark, quartile }], the
// exact shape scripts/lib/apmiStandalone.js's getPmsQuartileStandalone()
// (Task 2) returns -- label values "1 Year".."10 Years", quartile is the
// exact string "Top Quartile" or null (no real peer data for that period
// yet). 3-Year is authoritative when the strategy has real data for it,
// even if every other period happens to be Top Quartile; a strategy too
// young for 3-Year data falls back to majority-of-available-periods.
function isPreferred(quartileRows) {
  const rows = quartileRows || [];
  const threeYear = rows.find((r) => r.label === '3 Years');
  if (threeYear && threeYear.quartile != null) {
    return threeYear.quartile === 'Top Quartile';
  }
  const withData = rows.filter((r) => r.quartile != null);
  if (withData.length === 0) return false; // nothing to judge on -- excluded, never guessed
  const topCount = withData.filter((r) => r.quartile === 'Top Quartile').length;
  return topCount > withData.length / 2;
}

// ── Step 5 of the spec: cross-strategy aggregates, over the qualifying
// set only. Each `strategies` element: { providerName, strategyName,
// extracted, performance }. A strategy missing the field a given
// aggregate needs is skipped for THAT aggregate only -- never treated as
// zero, never disqualifies it from the other 3 aggregates or from the
// main list.

function tallyMostHeldStock(strategies) {
  const counts = new Map(); // name -> { count, strategies: Set }
  for (const s of strategies) {
    const holdings = s.extracted?.topHoldings;
    if (!Array.isArray(holdings)) continue;
    const seenInThisStrategy = new Set();
    for (const h of holdings) {
      if (!h?.name || seenInThisStrategy.has(h.name)) continue;
      seenInThisStrategy.add(h.name);
      const entry = counts.get(h.name) || { count: 0, strategies: new Set() };
      entry.count += 1;
      entry.strategies.add(s.strategyName);
      counts.set(h.name, entry);
    }
  }
  if (counts.size === 0) return null;
  const sorted = [...counts.entries()].sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]));
  const [name, { count, strategies: strategySet }] = sorted[0];
  return { name, count, strategies: [...strategySet] };
}

function tallyTopSector(strategies) {
  const totals = new Map(); // sector -> { total, strategies: Set }
  for (const s of strategies) {
    const sectors = s.extracted?.sectorAllocation;
    if (!Array.isArray(sectors)) continue;
    for (const row of sectors) {
      if (!row?.sector || row.weightPct == null) continue;
      const entry = totals.get(row.sector) || { total: 0, strategies: new Set() };
      entry.total += row.weightPct;
      entry.strategies.add(s.strategyName);
      totals.set(row.sector, entry);
    }
  }
  if (totals.size === 0) return null;
  const sorted = [...totals.entries()].sort((a, b) => b[1].total - a[1].total || a[0].localeCompare(b[0]));
  const [sector, { total, strategies: strategySet }] = sorted[0];
  return { sector, totalWeightPct: Math.round(total * 100) / 100, strategies: [...strategySet] };
}

function findBestAlpha(strategies) {
  let best = null;
  for (const s of strategies) {
    const iaYear1 = s.performance?.ia?.year1;
    const bmYear1 = s.performance?.benchmark?.year1;
    if (iaYear1 == null || bmYear1 == null) continue;
    const alphaPct = iaYear1 - bmYear1;
    if (!best || alphaPct > best.alphaPct) {
      best = { iaid: s.iaid ?? null, strategyName: s.strategyName, providerName: s.providerName, alphaPct: Math.round(alphaPct * 100) / 100 };
    }
  }
  return best;
}

function findBestSharpe(strategies) {
  let best = null;
  for (const s of strategies) {
    const sharpe = s.extracted?.portfolioAttributes?.sharpeRatio?.strategy;
    if (sharpe == null) continue;
    if (!best || sharpe > best.sharpeRatio) {
      best = { iaid: s.iaid ?? null, strategyName: s.strategyName, providerName: s.providerName, sharpeRatio: sharpe };
    }
  }
  return best;
}

// ── Step 2 of the spec: resolve each factsheet-extracted candidate to its
// real APMI IAID. Same significantWords-overlap scoring as
// lib/pmsFactsheetsCache.js's getFactsheetDataForStrategy(), run in the
// REVERSE direction (given a factsheet's own strategyName as the
// candidate, score it against each leaderboard row's strategyName as the
// target) -- reimplemented here rather than imported, matching this
// session's own precedent of keeping matching helpers self-contained per
// file rather than shared across files.
const STOPWORDS = new Set([
  'pvt', 'ltd', 'llp', 'limited', 'private', 'asset', 'assets', 'management', 'advisors', 'advisor',
  'managers', 'manager', 'investment', 'investments', 'services', 'financial', 'capital',
  'strategy', 'strategies', 'portfolio', 'portfolios', 'fund', 'funds', 'pms', 'scheme', 'approach',
  'the', 'and', 'of',
]);

function significantWords(str) {
  return (str || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

// Whole-string normaliser for the exact-match fast path: lowercase, collapse
// every run of non-alphanumerics to one space, trim. "Abakkus All Cap (FPI)
// Approach" and "abakkus all cap fpi approach" normalise differently on
// purpose -- the parens carry the distinction between two real strategies.
function normalizeStrategyName(str) {
  return String(str || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function iaidFromRow(row) {
  try {
    const iaid = new URL(row.apmiLink).searchParams.get('IAID');
    return iaid ? Number(iaid) : null;
  } catch {
    return null;
  }
}

// Below this word-overlap score a match is too weak to trust -- return null
// and let the caller exclude the candidate rather than guess.
const MIN_RESOLVE_SCORE = 0.5;

// Post-resolution guard: does the APMI product name for a resolved IAID
// plausibly refer to the same strategy as the factsheet candidate? Lenient
// on purpose (word order, punctuation, a "Carnelian " provider prefix all
// fine) but rejects a gross mismatch like "Growth Leaders Shariah" vs
// "Growth Leaders". An empty apmiName is treated as "can't tell" -> passes.
function nameLooselyMatches(apmiName, candidateName) {
  if (!apmiName) return true;
  const a = normalizeStrategyName(apmiName);
  const b = normalizeStrategyName(candidateName);
  if (!a || !b) return true;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const aw = significantWords(apmiName);
  const bw = new Set(significantWords(candidateName));
  if (aw.length === 0) return true; // e.g. "SISOP" already handled by the equality check above
  const shared = aw.filter((w) => bw.has(w)).length;
  const smaller = Math.min(aw.length, bw.size) || 1;
  return shared >= 2 || shared / smaller >= 0.5;
}

// Resolves ONE candidate ({ providerKey, strategyName }) to an IAID number,
// or null when it can't be resolved with confidence (never guessed). Steps:
//   1. exact normalised-name match against a provider row wins outright;
//   2. else score each provider row by word overlap, dividing by
//      max(candidate words, target words) so a row whose name is a SUPERSET
//      of the candidate ("Growth Leaders Shariah Strategy" vs "Growth
//      Leaders Strategy") is penalised for its extra words instead of
//      scoring a perfect 1.0;
//   3. return null if the best score is below MIN_RESOLVE_SCORE, or if two
//      or more rows tie for the best score (ambiguous -- don't pick by
//      array order).
// `matchFragments` comes from sync_pms_factsheets.js's PROVIDERS entry for
// this candidate's providerKey. Pass an { onReason } callback to receive a
// one-line human explanation of how (or why not) the candidate resolved.
function resolveIaid(candidate, leaderboardRows, matchFragments, { onReason } = {}) {
  const say = (msg) => { if (typeof onReason === 'function') onReason(msg); };

  const providerRows = leaderboardRows.filter((row) => {
    const name = (row.portfolioManager || '').toLowerCase();
    return matchFragments.some((f) => name.includes(f.toLowerCase()));
  });
  if (providerRows.length === 0) {
    say(`no leaderboard rows for provider (matchFragments ${JSON.stringify(matchFragments)}) -- provider-level miss`);
    return null;
  }

  const wantNorm = normalizeStrategyName(candidate.strategyName);
  const exact = providerRows.find((row) => normalizeStrategyName(row.strategyName) === wantNorm);
  if (exact) {
    const iaid = iaidFromRow(exact);
    say(`exact name match -> "${exact.strategyName}" (IAID ${iaid})`);
    return iaid;
  }

  const candidateWords = significantWords(candidate.strategyName);
  if (candidateWords.length === 0) {
    say(`candidate reduces to zero significant words -- cannot score, excluded`);
    return null;
  }

  const scored = providerRows.map((row) => {
    const targetWords = significantWords(row.strategyName);
    const targetSet = new Set(targetWords);
    const matched = candidateWords.filter((w) => targetSet.has(w)).length;
    const score = matched / Math.max(candidateWords.length, targetWords.length || 1);
    return { row, score };
  });
  const bestScore = scored.reduce((m, s) => Math.max(m, s.score), 0);
  if (bestScore < MIN_RESOLVE_SCORE) {
    say(`best word-overlap score ${bestScore.toFixed(2)} < ${MIN_RESOLVE_SCORE} floor -- too weak, excluded`);
    return null;
  }
  const topRows = scored.filter((s) => s.score === bestScore);
  if (topRows.length > 1) {
    say(`${topRows.length} rows tie at score ${bestScore.toFixed(2)} (${topRows.map((s) => `"${s.row.strategyName}"`).join(', ')}) -- ambiguous, excluded`);
    return null;
  }

  const iaid = iaidFromRow(topRows[0].row);
  say(`word-overlap ${bestScore.toFixed(2)} -> "${topRows[0].row.strategyName}" (IAID ${iaid})`);
  return iaid;
}

// Loads the freshest available pms-cache/pms-equity-{YYYY}-{MM}.json,
// walking backward up to 3 months if the current month's key doesn't
// exist yet (the leaderboard scrape and the factsheet sync don't
// necessarily refresh on identical days).
async function loadLatestLeaderboard(r2Get) {
  const now = new Date();
  for (let back = 0; back <= 3; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const key = `pms-cache/pms-equity-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}.json`;
    try {
      const payload = await r2Get(key);
      const rows = payload?.data;
      if (Array.isArray(rows) && rows.length > 0) {
        console.log(`[compute_preferred_pms] Using leaderboard cache: ${key} (${rows.length} rows)`);
        return rows;
      }
    } catch (err) {
      console.warn(`[compute_preferred_pms] R2 read failed for ${key}: ${err.message}`);
    }
  }
  return null;
}

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function parseAsOnMonth(asOnMonth) {
  const [abbr, yearStr] = asOnMonth.split('-');
  return { year: parseInt(yearStr, 10), month: MONTH_ABBR.indexOf(abbr) + 1 };
}

// Recursively counts non-null primitive leaf values in an object/array tree --
// used to pick the richest `extracted` payload when the same IAID resolves
// from more than one factsheet document.
function countNonNullPrimitives(value) {
  if (value == null) return 0;
  if (Array.isArray(value)) return value.reduce((sum, v) => sum + countNonNullPrimitives(v), 0);
  if (typeof value === 'object') return Object.values(value).reduce((sum, v) => sum + countNonNullPrimitives(v), 0);
  return 1;
}

async function run() {
  console.log('=== Computing PMS Preferred Strategies ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active]');

  const { r2Get, r2Put } = await import('../lib/r2.js');
  const { fetchPmsDetails, fetchPmsMonthSnapshot } = await import('../lib/pmsScrapers.js');
  const deps = { r2Get, r2Put, fetchPmsDetails, fetchPmsMonthSnapshot };

  // Step 1 -- load candidates from pms-factsheets.json.
  const factsheets = await r2Get('pms-factsheets.json');
  if (!factsheets?.providers) {
    console.error('[compute_preferred_pms] pms-factsheets.json missing or empty -- aborting.');
    process.exit(1);
  }
  const candidates = [];
  for (const [providerKey, info] of Object.entries(factsheets.providers)) {
    for (const doc of info.documents || []) {
      if (doc.docType === 'factsheet' && doc.extracted) {
        candidates.push({ providerKey, providerDisplayName: info.displayName, strategyName: doc.strategyName, extracted: doc.extracted });
      }
    }
  }
  console.log(`[compute_preferred_pms] ${candidates.length} candidates with extracted data.`);

  // Step 2 -- resolve IAIDs.
  const leaderboard = await loadLatestLeaderboard(r2Get);
  if (!leaderboard) {
    console.error('[compute_preferred_pms] No leaderboard cache found in the last 4 months -- aborting.');
    process.exit(1);
  }
  const resolved = [];
  for (const c of candidates) {
    const provider = PROVIDERS.find((p) => p.key === c.providerKey);
    if (!provider) continue;
    let reason = '';
    const iaid = resolveIaid(
      { providerKey: c.providerKey, strategyName: c.strategyName },
      leaderboard,
      provider.matchFragments,
      { onReason: (m) => { reason = m; } },
    );
    // Audit line for every candidate -- a human scanning the workflow log can
    // spot a bad attribution ("All Cap Approach" -> "All Cap (FPI) Approach")
    // immediately.
    console.log(`[compute_preferred_pms] resolve: ${c.providerDisplayName} / "${c.strategyName}" -> ${reason}`);
    if (!iaid) {
      console.warn(`[compute_preferred_pms] Could not resolve IAID for ${c.providerDisplayName} / ${c.strategyName} -- excluded.`);
      continue;
    }
    resolved.push({ ...c, iaid });
  }
  console.log(`[compute_preferred_pms] ${resolved.length} of ${candidates.length} candidates resolved to an IAID.`);

  // Step 2b -- de-dup by IAID. The same strategy can resolve from more than
  // one factsheet document (e.g. a manager publishing both a performance
  // sheet and a portfolio sheet under one strategy name). Keep the entry
  // whose `extracted` payload carries the most populated leaf values; on a
  // tie keep the first encountered (stable -- mirrors the strictly-greater /
  // first-wins convention in resolveIaid and the tally functions). Dropping
  // the duplicate here also skips a redundant quartile fetch below.
  const byIaid = new Map();
  for (const c of resolved) {
    const existing = byIaid.get(c.iaid);
    if (!existing) {
      byIaid.set(c.iaid, c);
      continue;
    }
    if (countNonNullPrimitives(c.extracted) > countNonNullPrimitives(existing.extracted)) {
      byIaid.set(c.iaid, c);
    }
  }
  const deduped = [...byIaid.values()];
  for (const [iaid, kept] of byIaid) {
    const n = resolved.filter((c) => c.iaid === iaid).length;
    if (n > 1) {
      console.log(`[compute_preferred_pms] Deduped IAID ${iaid}: kept "${kept.strategyName}" (richer extracted), dropped ${n - 1} other(s).`);
    }
  }
  console.log(`[compute_preferred_pms] ${deduped.length} distinct strategies after IAID de-dup.`);

  // Step 3a -- pin ONE canonical as-on month for the whole run, so every
  // strategy's quartile table and performance snapshot are read for the
  // same reporting month rather than whichever month each strategy's
  // period-history cache tail happens to hold. Walk back from now; the
  // first month any deduped strategy has a live snapshot for is the
  // newest month APMI has published, and that's the run month.
  let runMonth = null;
  outer:
  for (let back = 0; back < 4; back++) {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - back, 1);
    for (const c of deduped) {
      try {
        const probe = await fetchPmsMonthSnapshot(c.iaid, d.getFullYear(), d.getMonth() + 1);
        if (probe) { runMonth = { year: d.getFullYear(), month: d.getMonth() + 1, label: probe.asOnMonth }; break outer; }
      } catch (err) {
        // this strategy has nothing for this month -- try the next strategy
      }
    }
  }
  if (runMonth) {
    console.log(`[compute_preferred_pms] Run as-on month: ${runMonth.label} (${runMonth.year}-${String(runMonth.month).padStart(2, '0')}).`);
  } else {
    console.warn('[compute_preferred_pms] Could not establish a run as-on month from any strategy -- each will use its own latest available.');
  }

  // Step 3b -- pull quartile eligibility (and the as-on-month performance
  // snapshot, reused later for the "best alpha" insight).
  const qualifying = [];
  for (const c of deduped) {
    let details, snapshot, quartile;
    try {
      details = await getPmsDetailsStandalone(c.iaid, deps);
      if (!details) throw new Error('no details returned');

      // Sanity check: the IAID we resolved must actually be this strategy.
      // details.iaName / productName hold APMI's product identity (NOT
      // details.strategyName, which is the broad category). If neither
      // loosely matches the factsheet's own strategy name, the resolution
      // was wrong -- exclude rather than publish a "Top Quartile" claim
      // against the wrong strategy.
      const apmiName = details.iaName || details.productName || '';
      if (!nameLooselyMatches(apmiName, c.strategyName)) {
        console.warn(`[compute_preferred_pms] IAID ${c.iaid} resolves to APMI name "${apmiName}" which does not match factsheet strategy "${c.strategyName}" -- excluding (likely mis-resolution).`);
        continue;
      }

      snapshot = await getLatestMonthSnapshotStandalone(c.iaid, deps, runMonth);
      if (snapshot) {
        const { year, month } = parseAsOnMonth(snapshot.asOnMonth);
        quartile = await getPmsQuartileStandalone(c.iaid, details.providerName, details.strategyName || 'Equity', year, month, deps);
      }
    } catch (err) {
      console.warn(`[compute_preferred_pms] Failed to pull quartile data for IAID ${c.iaid} (${c.strategyName}): ${err.message}`);
      continue;
    }
    if (!quartile || !isPreferred(quartile)) continue;

    const threeYear = quartile.find((r) => r.label === '3 Years' && r.quartile != null);
    const qualifyingRow = threeYear || [...quartile].reverse().find((r) => r.quartile === 'Top Quartile');

    qualifying.push({
      iaid: c.iaid,
      providerKey: c.providerKey,
      providerName: details.providerName,
      strategyName: c.strategyName,
      category: details.strategyName || 'Equity',
      // aumCr / qualifyingPeriod / quartile / asOnMonth / performance are
      // LIVE APMI data (the run's canonical month). The `extracted` block
      // (holdings, sector & market-cap allocation, portfolio ratios incl.
      // Sharpe) is from this strategy's most recent published FACTSHEET,
      // whose own as-of date -- surfaced here as `factsheetAsOf` -- often
      // lags the APMI month. Where a metric exists in both sources (AUM,
      // 1Y return) the APMI value is used; factsheet-only fields carry the
      // factsheetAsOf caveat.
      aumCr: details.aumCr ?? null,
      qualifyingPeriod: qualifyingRow?.label ?? null,
      quartile: qualifyingRow?.quartile ?? null,
      asOnMonth: snapshot?.asOnMonth ?? runMonth?.label ?? null,
      factsheetAsOf: c.extracted?.asOfDate ?? null,
      extracted: c.extracted,
      performance: snapshot ? { ia: snapshot.ia, benchmark: snapshot.benchmark } : null,
    });
    console.log(`[compute_preferred_pms] Qualifies: ${c.providerDisplayName} / ${c.strategyName} (${qualifyingRow?.label}, ${qualifyingRow?.quartile}, as on ${snapshot?.asOnMonth ?? 'n/a'})`);
  }
  console.log(`[compute_preferred_pms] ${qualifying.length} strategies qualify.`);

  // Step 5 -- cross-strategy aggregates, over the qualifying set only.
  const insights = {
    mostHeldStock: tallyMostHeldStock(qualifying),
    topSector: tallyTopSector(qualifying),
    bestAlpha: findBestAlpha(qualifying),
    bestSharpe: findBestSharpe(qualifying),
  };

  // Factsheet as-of dates span a range (each provider publishes on its own
  // schedule); expose the span so the page can disclose it honestly.
  const factsheetDates = qualifying.map((s) => s.factsheetAsOf).filter(Boolean).sort();

  // Step 6 -- write the result.
  const result = {
    computedAt: new Date().toISOString(),
    asOnMonth: runMonth?.label ?? null,
    factsheetAsOfRange: factsheetDates.length
      ? { earliest: factsheetDates[0], latest: factsheetDates[factsheetDates.length - 1] }
      : null,
    criteria: {
      quartilePeriodPrimary: '3 Years',
      fallbackRule: 'Top Quartile in at least half of periods with real peer data, when 3-Year data isn\'t available yet',
      dataSources: 'AUM, returns and quartile ranking are live APMI data as on the month shown. Holdings, sector & market-cap allocation and portfolio ratios are from each strategy\'s most recently published factsheet, whose date can lag the APMI month.',
    },
    strategies: qualifying.map(({ providerKey, iaid, providerName, strategyName, category, aumCr, qualifyingPeriod, quartile, asOnMonth, factsheetAsOf, extracted }) => ({
      iaid, providerKey, providerName, strategyName, category, aumCr, qualifyingPeriod, quartile, asOnMonth, factsheetAsOf, extracted,
    })),
    insights,
  };

  if (!DRY_RUN) {
    const existing = await r2Get(R2_KEY).catch(() => null);
    // Partial-failure guard (matches every sibling sync script in this repo,
    // e.g. sync_amfi_aum.js / sync_pms_factsheets.js): a transient APMI
    // outage would make every strategy fail the try/catch above, leaving
    // `qualifying` empty. Refuse to overwrite a good document with that --
    // exit non-zero so the workflow step goes red and is noticed, instead
    // of silently publishing a false "nobody qualifies" page for a month.
    const existingCount = Array.isArray(existing?.strategies) ? existing.strategies.length : 0;
    if (existingCount > 0 && qualifying.length < existingCount * 0.5) {
      console.error(
        `[compute_preferred_pms] REFUSING TO WRITE: only ${qualifying.length} strategies qualify now vs ${existingCount} in the existing document ` +
        `(under 50%). This usually means APMI was unreachable during the run, not that strategies genuinely dropped out. ` +
        `The existing document is left untouched. Re-run once APMI is healthy.`,
      );
      process.exit(1);
    }
    await backupThenPut(r2Put, R2_KEY, existing, JSON.stringify(result));
    console.log(`[compute_preferred_pms] Successfully wrote to R2 (${R2_KEY}).`);
  } else {
    console.log('[compute_preferred_pms] Dry run -- not writing to R2. Result:', JSON.stringify(result, null, 2).slice(0, 2000));
  }
}

module.exports = {
  isPreferred, tallyMostHeldStock, tallyTopSector, findBestAlpha, findBestSharpe,
  resolveIaid, loadLatestLeaderboard, nameLooselyMatches, parseAsOnMonth, countNonNullPrimitives,
};

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    run().catch((err) => {
      console.error('[compute_preferred_pms] Fatal error:', err);
      process.exit(1);
    });
  }
}

function selfTest() {
  const assert = require('assert');
  assert.strictEqual(
    isPreferred([
      { label: '1 Year', quartile: 'Top Quartile' },
      { label: '3 Years', quartile: 'Top Quartile' },
      { label: '5 Years', quartile: null },
    ]),
    true,
    '3-Year real data, Top Quartile -> passes'
  );
  assert.strictEqual(
    isPreferred([
      { label: '1 Year', quartile: 'Top Quartile' },
      { label: '2 Years', quartile: 'Top Quartile' },
      { label: '3 Years', quartile: 'Second Quartile' },
      { label: '5 Years', quartile: 'Top Quartile' },
    ]),
    false,
    '3-Year real data but NOT Top Quartile -> fails even though every other period is'
  );
  assert.strictEqual(
    isPreferred([
      { label: '1 Year', quartile: 'Top Quartile' },
      { label: '2 Years', quartile: 'Top Quartile' },
      { label: '3 Years', quartile: null },
    ]),
    true,
    'No 3-Year data, Top Quartile in 2 of 2 available -> passes (majority)'
  );
  assert.strictEqual(
    isPreferred([
      { label: '1 Year', quartile: 'Second Quartile' },
      { label: '2 Years', quartile: 'Top Quartile' },
      { label: '3 Years', quartile: null },
    ]),
    false,
    'No 3-Year data, Top Quartile in only 1 of 2 available -> fails (not majority)'
  );
  assert.strictEqual(
    isPreferred([
      { label: '1 Year', quartile: null },
      { label: '3 Years', quartile: null },
    ]),
    false,
    'Zero periods with real data -> fails, never guessed'
  );
  const fixtureStrategies = [
    {
      providerName: 'Provider A', strategyName: 'Strategy A',
      extracted: {
        topHoldings: [{ name: 'Reliance Industries Ltd', weightPct: 8 }, { name: 'HDFC Bank Ltd', weightPct: 6 }],
        sectorAllocation: [{ sector: 'Financials', weightPct: 30 }, { sector: 'Energy', weightPct: 10 }],
        portfolioAttributes: { sharpeRatio: { strategy: 0.9, benchmark: 0.5 } },
      },
      performance: { ia: { year1: 20 }, benchmark: { year1: 10 } },
    },
    {
      providerName: 'Provider B', strategyName: 'Strategy B',
      extracted: {
        topHoldings: [{ name: 'Reliance Industries Ltd', weightPct: 5 }],
        sectorAllocation: [{ sector: 'Financials', weightPct: 25 }],
        portfolioAttributes: { sharpeRatio: null }, // deliberately missing -- must not break the tally
      },
      performance: null, // deliberately missing -- must not break the tally
    },
  ];
  const mostHeld = tallyMostHeldStock(fixtureStrategies);
  assert.strictEqual(mostHeld.name, 'Reliance Industries Ltd');
  assert.strictEqual(mostHeld.count, 2);
  const topSector = tallyTopSector(fixtureStrategies);
  assert.strictEqual(topSector.sector, 'Financials');
  assert.strictEqual(topSector.totalWeightPct, 55);
  const bestAlpha = findBestAlpha(fixtureStrategies);
  assert.strictEqual(bestAlpha.strategyName, 'Strategy A'); // Strategy B skipped, no performance data
  assert.strictEqual(bestAlpha.alphaPct, 10);
  const bestSharpe = findBestSharpe(fixtureStrategies);
  assert.strictEqual(bestSharpe.strategyName, 'Strategy A'); // Strategy B skipped, sharpeRatio null
  assert.strictEqual(bestSharpe.sharpeRatio, 0.9);
  assert.strictEqual(bestAlpha.iaid, null, 'insight carries iaid field (null when fixture omits it)');
  assert.strictEqual(bestSharpe.iaid, null);

  // ── resolveIaid: the superset-match cases from the whole-branch review ──
  const row = (name, iaid) => ({
    strategyName: name,
    portfolioManager: 'Test Manager Pvt Ltd',
    apmiLink: `https://www.apmiindia.org/apmi/IaInsight.htm?IAID=${iaid}`,
  });
  const TEST_FRAGS = ['test manager'];

  // 1. Exact name wins even when a superset row (extra "(FPI)") sits first.
  const abakkusRows = [
    row('Abakkus All Cap (FPI) Approach', 2523),
    row('Abakkus All Cap Approach', 2510),
    row('Abakkus All Cap Approach 2', 2511),
    row('Abakkus All Cap (ESG) Approach', 2515),
  ];
  assert.strictEqual(
    resolveIaid({ strategyName: 'Abakkus All Cap Approach' }, abakkusRows, TEST_FRAGS),
    2510,
    'exact-name match beats a superset row that appears first'
  );

  // 2. ICICI Growth Leaders must not land on the Shariah variant.
  const iciciRows = [
    row('ICICI Prudential PMS Growth Leaders Shariah Strategy', 801),
    row('ICICI Prudential PMS Growth Leaders Strategy', 780),
  ];
  assert.strictEqual(
    resolveIaid({ strategyName: 'ICICI Prudential PMS Growth Leaders Strategy' }, iciciRows, TEST_FRAGS),
    780,
    'exact-name match beats the Shariah superset variant'
  );

  // 3. "ALCHEMY W.I.N STRATEGY" -> zero significant words, but the exact
  //    normalised name still matches its own row.
  const alchemyRows = [
    row('Alchemy Select Stock', 481),
    row('ALCHEMY W.I.N STRATEGY', 1505),
    row('Alchemy Smart Alpha 250', 1463),
  ];
  assert.strictEqual(
    resolveIaid({ strategyName: 'ALCHEMY W.I.N STRATEGY' }, alchemyRows, TEST_FRAGS),
    1505,
    'punctuation-only name still resolves via exact normalised match, not a guess'
  );

  // 4. No exact match + only a weak/ambiguous fuzzy match -> null, never guessed.
  assert.strictEqual(
    resolveIaid({ strategyName: 'Completely Unrelated Portfolio' }, alchemyRows, TEST_FRAGS),
    null,
    'weak fuzzy match below the floor -> null'
  );

  // 5. Two rows tying on the best fuzzy score -> null (ambiguous), not array order.
  //    Both targets share the candidate's two words and add one equal-count
  //    distinguishing word, so both score 2/3 and neither wins.
  const tieRows = [row('Alpha Growth Domestic', 11), row('Alpha Growth Global', 12)];
  assert.strictEqual(
    resolveIaid({ strategyName: 'Alpha Growth Portfolio' }, tieRows, TEST_FRAGS),
    null,
    'a fuzzy-score tie is ambiguous -> null'
  );

  // 6. Provider-level miss (no matching portfolioManager) -> null.
  assert.strictEqual(
    resolveIaid({ strategyName: 'Whatever' }, alchemyRows, ['nonexistent provider']),
    null,
    'no leaderboard rows for the provider -> null'
  );

  // 7. A legitimate provider-prefix fuzzy match still resolves.
  const carnelianRows = [row('Carnelian Shift Strategy', 1194), row('Carnelian Contra Portfolio Strategy', 1197)];
  assert.strictEqual(
    resolveIaid({ strategyName: 'Shift Strategy' }, carnelianRows, ['test manager']),
    1194,
    'candidate is a subset of one row and unrelated to the other -> resolves'
  );

  // ── nameLooselyMatches ──
  assert.strictEqual(nameLooselyMatches('SISOP', 'SISOP'), true);
  assert.strictEqual(nameLooselyMatches('Carnelian Shift Strategy', 'Shift Strategy'), true, 'provider prefix is fine');
  assert.strictEqual(nameLooselyMatches('', 'Anything'), true, 'missing APMI name -> cannot disprove -> passes');
  assert.strictEqual(nameLooselyMatches('Alchemy High Growth', 'Renaissance Midcap PMS'), false, 'unrelated names -> rejected');

  // ── parseAsOnMonth ──
  assert.deepStrictEqual(parseAsOnMonth('Aug-2026'), { year: 2026, month: 8 });
  assert.deepStrictEqual(parseAsOnMonth('Jan-2024'), { year: 2024, month: 1 });

  // ── countNonNullPrimitives ──
  assert.strictEqual(countNonNullPrimitives(null), 0);
  assert.strictEqual(countNonNullPrimitives({ a: 1, b: null, c: { d: 2, e: null }, f: [3, null, 4] }), 4);
  assert.strictEqual(countNonNullPrimitives({ a: null, b: { c: null } }), 0);

  console.log('[compute_preferred_pms] Self-test: ALL PASSED');
}
