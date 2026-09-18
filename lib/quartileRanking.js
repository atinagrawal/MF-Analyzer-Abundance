/**
 * lib/quartileRanking.js
 *
 * Page-agnostic quartile-ranking calculation for the Portfolio Review
 * report -- joins CAS holdings to the mf_screener dataset (see
 * app/api/screener/route.js) by amfiCode and ranks each fund's 1Yr/3Yr/5Yr
 * point-to-point CAGR against every other fund in its own SEBI
 * sub-category. Deliberately has no React/page dependency, matching
 * lib/distributorResolution.js's style, so app/cas-tracker/page.js's
 * PortfolioReviewPlanner drawer is the only caller that needs wiring. See
 * docs/superpowers/specs/2026-09-18-portfolio-review-quartile-planner-design.md.
 *
 * v1 uses point-to-point CAGR, not true rolling-window median returns (the
 * methodology NJ Wealth's own "Scheme Analysis" report uses) -- that would
 * need a new NAV-history-windowing data engine. See the spec's Decision 1.
 */

// Returns the median of a list of numbers, or null for an empty list.
export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Buckets `categoryFunds` (mf_screener rows already filtered to one
// category) into quartiles for one return period key. Quartile 1 = top
// 25% of returns in the category, 4 = bottom 25%. Funds with a null value
// for this period are excluded entirely from the ranking (and from the
// returned map) -- a caller checking `map.get(code)` gets `undefined` for
// an unranked fund/period, which renders as "-".
export function quartilesForPeriod(categoryFunds, period) {
  const ranked = categoryFunds
    .filter(f => f[period] != null)
    .sort((a, b) => b[period] - a[period]);
  const n = ranked.length;
  const result = new Map();
  ranked.forEach((fund, i) => {
    const quartile = Math.min(4, Math.floor((i / n) * 4) + 1);
    result.set(fund.code, quartile);
  });
  return result;
}

const PERIODS = ['ret_1y', 'ret_3y', 'ret_5y'];

// Builds the full report: groups `holdings` (each at least
// { amfiCode, name, value }) by their mf_screener category, using
// `screenerFunds` (the full array app/api/screener/route.js returns, each
// row shaped { code, category, ret_1y, ret_3y, ret_5y, ... }) both as the
// join target and as each category's full peer universe for ranking (the
// peer universe is every fund in the category, not just the ones held --
// see the categoryMedian test).
export function buildQuartileReport(holdings, screenerFunds) {
  const byCode = new Map(screenerFunds.map(f => [f.code, f]));
  const byCategory = new Map(); // category -> mf_screener rows (peer universe)
  screenerFunds.forEach(f => {
    if (!f.category) return;
    if (!byCategory.has(f.category)) byCategory.set(f.category, []);
    byCategory.get(f.category).push(f);
  });

  const holdingsByCategory = new Map(); // category -> holdings
  const unranked = [];
  holdings.forEach(h => {
    const screenerRow = h.amfiCode ? byCode.get(h.amfiCode) : null;
    if (!screenerRow || !screenerRow.category) { unranked.push(h); return; }
    const category = screenerRow.category;
    if (!holdingsByCategory.has(category)) holdingsByCategory.set(category, []);
    holdingsByCategory.get(category).push(h);
  });

  const categories = [...holdingsByCategory.entries()].map(([category, categoryHoldings]) => {
    const peers = byCategory.get(category) || [];
    const quartileMaps = Object.fromEntries(PERIODS.map(p => [p, quartilesForPeriod(peers, p)]));
    const categoryMedian = Object.fromEntries(
      PERIODS.map(p => [p, median(peers.map(f => f[p]).filter(v => v != null))])
    );
    const funds = categoryHoldings.map(h => ({
      ...h,
      quartiles: Object.fromEntries(PERIODS.map(p => [p, quartileMaps[p].get(h.amfiCode) ?? null])),
    }));
    return { category, categoryMedian, funds };
  }).sort((a, b) => a.category.localeCompare(b.category));

  return { categories, unranked };
}
