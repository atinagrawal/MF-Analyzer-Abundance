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
      best = { strategyName: s.strategyName, providerName: s.providerName, alphaPct: Math.round(alphaPct * 100) / 100 };
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
      best = { strategyName: s.strategyName, providerName: s.providerName, sharpeRatio: sharpe };
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

// Resolves ONE candidate ({ providerKey, strategyName }) to an IAID number,
// or null if no leaderboard row scores above 0 (never guessed).
// `matchFragments` comes from sync_pms_factsheets.js's PROVIDERS entry for
// this candidate's providerKey.
function resolveIaid(candidate, leaderboardRows, matchFragments) {
  const providerRows = leaderboardRows.filter((row) => {
    const name = (row.portfolioManager || '').toLowerCase();
    return matchFragments.some((f) => name.includes(f.toLowerCase()));
  });

  const candidateWords = significantWords(candidate.strategyName);
  if (candidateWords.length === 0 || providerRows.length === 0) return null;

  let best = null;
  let bestScore = 0;
  for (const row of providerRows) {
    const targetWords = new Set(significantWords(row.strategyName));
    const matched = candidateWords.filter((w) => targetWords.has(w)).length;
    const score = matched / candidateWords.length;
    if (score > bestScore) {
      bestScore = score;
      best = row;
    }
  }
  if (!best || bestScore === 0) return null;

  try {
    const url = new URL(best.apmiLink);
    const iaid = url.searchParams.get('IAID');
    return iaid ? Number(iaid) : null;
  } catch {
    return null;
  }
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
    const iaid = resolveIaid({ providerKey: c.providerKey, strategyName: c.strategyName }, leaderboard, provider.matchFragments);
    if (!iaid) {
      console.warn(`[compute_preferred_pms] Could not resolve IAID for ${c.providerDisplayName} / ${c.strategyName} -- excluded.`);
      continue;
    }
    resolved.push({ ...c, iaid });
  }
  console.log(`[compute_preferred_pms] ${resolved.length} of ${candidates.length} candidates resolved to an IAID.`);

  // Step 3 -- pull quartile eligibility (and the latest performance
  // snapshot, reused later for the "best alpha" insight).
  const qualifying = [];
  for (const c of resolved) {
    let details, snapshot, quartile;
    try {
      details = await getPmsDetailsStandalone(c.iaid, deps);
      if (!details) throw new Error('no details returned');
      snapshot = await getLatestMonthSnapshotStandalone(c.iaid, deps);
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
      aumCr: details.aumCr ?? null,
      qualifyingPeriod: qualifyingRow?.label ?? null,
      quartile: qualifyingRow?.quartile ?? null,
      extracted: c.extracted,
      performance: snapshot ? { ia: snapshot.ia, benchmark: snapshot.benchmark } : null,
    });
    console.log(`[compute_preferred_pms] Qualifies: ${c.providerDisplayName} / ${c.strategyName} (${qualifyingRow?.label}, ${qualifyingRow?.quartile})`);
  }
  console.log(`[compute_preferred_pms] ${qualifying.length} strategies qualify.`);

  // Step 5 -- cross-strategy aggregates, over the qualifying set only.
  const insights = {
    mostHeldStock: tallyMostHeldStock(qualifying),
    topSector: tallyTopSector(qualifying),
    bestAlpha: findBestAlpha(qualifying),
    bestSharpe: findBestSharpe(qualifying),
  };

  // Step 6 -- write the result.
  const result = {
    computedAt: new Date().toISOString(),
    criteria: {
      quartilePeriodPrimary: '3 Years',
      fallbackRule: 'Top Quartile in at least half of periods with real peer data, when 3-Year data isn\'t available yet',
    },
    strategies: qualifying.map(({ providerKey, iaid, providerName, strategyName, category, aumCr, qualifyingPeriod, quartile, extracted }) => ({
      iaid, providerKey, providerName, strategyName, category, aumCr, qualifyingPeriod, quartile, extracted,
    })),
    insights,
  };

  if (!DRY_RUN) {
    const existing = await r2Get(R2_KEY).catch(() => null);
    await backupThenPut(r2Put, R2_KEY, existing, JSON.stringify(result));
    console.log(`[compute_preferred_pms] Successfully wrote to R2 (${R2_KEY}).`);
  } else {
    console.log('[compute_preferred_pms] Dry run -- not writing to R2. Result:', JSON.stringify(result, null, 2).slice(0, 2000));
  }
}

module.exports = { isPreferred, tallyMostHeldStock, tallyTopSector, findBestAlpha, findBestSharpe, resolveIaid, loadLatestLeaderboard };

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
  console.log('[compute_preferred_pms] Self-test: ALL PASSED');
}
