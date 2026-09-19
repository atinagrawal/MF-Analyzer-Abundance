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
 *
 * mf_screener's universe is Regular plan + Growth option only (Direct and
 * income options are hidden -- see scripts/build-screener.mjs's own
 * comment), so a holding in its Direct plan has no amfiCode match at all --
 * its Direct-plan scheme code was never built into the dataset. Direct and
 * Regular plans of the same scheme hold identical underlying securities and
 * differ only in expense ratio (Direct typically returns slightly MORE,
 * having no distributor commission to pay), so buildQuartileReport falls
 * back to matching by normalized scheme name and ranks the Direct-plan
 * holding using its Regular-plan counterpart's real return data -- a
 * same-scheme proxy, not a different fund. Flagged via `matchedViaName` on
 * the returned fund row so the UI can disclose it rather than passing it
 * off as the exact scheme's own number.
 */
import { sharpeRatio } from './riskFreeRate.js';

// Strips Direct/Regular/Growth/IDCW/Plan/Option noise down to the bare
// scheme FAMILY name (e.g. "HDFC Flexi Cap Fund - Direct Plan - Growth" ->
// "hdfc flexi cap"). An independent copy of lib/riskometer.js's own
// normalizeSchemeFamilyName (itself already a documented independent copy
// of scripts/sync_scheme_riskometer.js's) -- not a shared import, because
// lib/riskometer.js pulls in `https` and a dynamic `pdf-parse` import for
// its PDF-fetching concern, and this module is consumed by a 'use client'
// component (PortfolioReviewPlanner.jsx): importing anything from
// riskometer.js here drags that whole Node-only module graph into the
// client bundle and breaks the build (confirmed -- "Module not found").
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

export const PERIODS = ['ret_1y', 'ret_3y', 'ret_5y'];

// AMFI's NAVAll.txt section headers spell the same conceptual "Domestic
// Fund of Funds" bucket two different ways across the data (different
// AMCs/build years) -- normalize to one canonical label before anything
// else groups by category.
const FOF_CATEGORY_ALIASES = {
  'Fund of Funds Scheme (Domestic) - Fund of Funds Scheme (Domestic)': 'Other Scheme - FoF Domestic',
};

// The (normalized) categories eligible for the name-based refinement
// below -- every other category is returned unchanged, so a fund that
// happens to have "gold" in its name but is a real, already-correctly-
// categorized Equity/Gold-ETF scheme is never touched.
const FOF_SHAPED_CATEGORIES = new Set([
  'Other Scheme - FoF Domestic',
  'Other Scheme - FoF Overseas',
  'Overseas Fund of Funds - Fund of Funds investing overseas',
]);

// Refines a fund's category for grouping/ranking purposes. AMFI dumps
// every kind of Fund-of-Funds -- Gold ETF FoFs, Silver ETF FoFs,
// Multi-Asset FoFs, arbitrage FoFs, thematic ETF-wrapper FoFs -- into one
// generic FoF-Domestic/Overseas category, which makes a quartile
// "comparison" meaningless (a Gold FoF isn't a peer of a Multi-Asset
// FoF). This splits out just the patterns explicitly asked for -- gold,
// silver, gold & silver, multi-asset -- into their own real peer buckets;
// every other FoF sub-type (arbitrage, thematic ETF wrappers, hybrid
// FoFs, ...) is left under the normalized generic label, out of scope
// for this pass.
//
// Pure name-based detection so it still works for a holding with NO
// screener match at all (`category` is null) -- e.g. a Direct-plan
// scheme, excluded from mf_screener's Regular+Growth-only universe (see
// the spec's "Out of scope for v1" note). Grouping it by name still lets
// it show a real category median from whatever real peers exist, even
// though it won't have a quartile number of its own.
export function refineCategory(category, name) {
  const normalized = category != null ? (FOF_CATEGORY_ALIASES[category] || category) : null;
  if (normalized != null && !FOF_SHAPED_CATEGORIES.has(normalized)) return normalized;

  const n = (name || '').toLowerCase();
  // Gold-MINING equity funds (e.g. "DSP World Gold Mining Overseas Equity
  // Omni FoF") hold gold-mining companies, not physical gold -- an
  // equity-like risk/return profile, not a precious-metals tracker. Never
  // lump them in with the passive Gold/Silver ETF FoFs below.
  const isGoldMining = /gold.*mining|mining.*gold/.test(n);
  if (!isGoldMining) {
    const hasGold = /\bgold\b/.test(n);
    const hasSilver = /\bsilver\b/.test(n);
    if (hasGold && hasSilver) return 'Gold & Silver FoF';
    if (hasGold) return 'Gold FoF';
    if (hasSilver) return 'Silver FoF';
  }
  if (/multi[\s-]*asset/.test(n)) return 'Multi Asset FoF';

  return normalized; // still FoF-shaped (or genuinely unknown) but not one of the refined patterns
}

// Builds the full report: groups `holdings` (each at least
// { amfiCode, name, value }) by their (refined) mf_screener category,
// using `screenerFunds` (the full array app/api/screener/route.js
// returns, each row shaped { code, category, ret_1y, ret_3y, ret_5y,
// ... }) both as the join target and as each category's full peer
// universe for ranking (the peer universe is every fund in the category,
// not just the ones held -- see the categoryMedian test). Both sides are
// refined through the same refineCategory() so a Gold FoF holding and its
// real Gold FoF peers always land in the same bucket.
export function buildQuartileReport(holdings, screenerFunds) {
  const byCode = new Map(screenerFunds.map(f => [f.code, f]));

  // Regular-plan proxy lookup for a Direct-plan holding with no code
  // match -- see this file's header comment. First scheme found under a
  // given normalized name wins; a genuine duplicate is not expected
  // within the Regular+Growth-only universe.
  const byNormalizedName = new Map();
  screenerFunds.forEach(f => {
    const key = normalizeSchemeFamilyName(f.name);
    if (key && !byNormalizedName.has(key)) byNormalizedName.set(key, f);
  });

  const byCategory = new Map(); // refined category -> mf_screener rows (peer universe)
  screenerFunds.forEach(f => {
    const category = refineCategory(f.category, f.name);
    if (!category) return;
    if (!byCategory.has(category)) byCategory.set(category, []);
    byCategory.get(category).push(f);
  });

  const holdingsByCategory = new Map(); // refined category -> { holding, effectiveCode, matchedViaName }[]
  const unranked = [];
  holdings.forEach(h => {
    let screenerRow = h.amfiCode ? byCode.get(h.amfiCode) : null;
    let matchedViaName = false;
    if (!screenerRow) {
      const nameMatch = byNormalizedName.get(normalizeSchemeFamilyName(h.name));
      if (nameMatch) { screenerRow = nameMatch; matchedViaName = true; }
    }
    const category = refineCategory(screenerRow ? screenerRow.category : null, h.name);
    if (!category) { unranked.push(h); return; }
    if (!holdingsByCategory.has(category)) holdingsByCategory.set(category, []);
    holdingsByCategory.get(category).push({ holding: h, screenerRow, matchedViaName });
  });

  const categories = [...holdingsByCategory.entries()].map(([category, entries]) => {
    const peers = byCategory.get(category) || [];
    const quartileMaps = Object.fromEntries(PERIODS.map(p => [p, quartilesForPeriod(peers, p)]));
    const categoryMedian = Object.fromEntries(
      PERIODS.map(p => [p, median(peers.map(f => f[p]).filter(v => v != null))])
    );
    const funds = entries.map(({ holding, screenerRow, matchedViaName }) => {
      const effectiveCode = screenerRow ? screenerRow.code : null;
      return {
        ...holding,
        matchedViaName, // true when this fund's own plan has no return data -- quartiles/ratios below are its Regular-plan counterpart's
        quartiles: Object.fromEntries(PERIODS.map(p => [p, effectiveCode ? (quartileMaps[p].get(effectiveCode) ?? null) : null])),
        // Real Std Dev / Sharpe Ratio, 3Yr -- see lib/riskFreeRate.js.
        // Raw reference numbers, not quartiled, from whichever screener
        // row matched (own code or the Regular-plan proxy above).
        vol3y: screenerRow ? (screenerRow.vol_3y ?? null) : null,
        sharpe3y: screenerRow ? sharpeRatio(screenerRow.ret_3y, screenerRow.vol_3y) : null,
      };
    });
    return { category, categoryMedian, funds };
  }).sort((a, b) => a.category.localeCompare(b.category));

  return { categories, unranked };
}
