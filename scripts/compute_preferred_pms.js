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

module.exports = { isPreferred, tallyMostHeldStock, tallyTopSector, findBestAlpha, findBestSharpe, resolveIaid, loadLatestLeaderboard };

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
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
