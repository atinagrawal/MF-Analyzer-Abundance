/**
 * lib/portfolioAnalysis.js
 *
 * Pure functions for combining multiple funds' holdings into portfolio-level
 * asset/sector/security exposure, pairwise fund overlap, and M-Cap allocation.
 * No I/O -- callers fetch each fund's holdings and the AMFI M-Cap lookup
 * separately and pass them in here.
 */

function normalizeName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\b(ltd|limited)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

// weightagePct can be negative -- a short futures position (e.g. a
// long-short SIF strategy) or a negative cash-equivalent line like "Net
// Payables". Only used by computeOverlap and computeMCapAllocation below,
// where a short/negative position is intentionally treated as "0% held"
// (you don't "overlap" on a position you're short, and a short equity
// future has no sensible market-cap bucket to fall into). combineExposure
// and fullSecurityExposure below do NOT use this -- they need the fund's
// TRUE net weight per asset class/security, so clamping there silently
// dropped short positions' negative contribution while keeping every
// positive one, which is exactly what made Asset Allocation sum to well
// over 100% instead of ~100% (verified live, 2026-08: a real long-short
// SIF's Asset Allocation totaled 112.19% instead of 99.99%, because its
// -11.08% "Net Payables" cash entry and -1.12% short equity future both
// got floored to 0 instead of netting against the fund's long positions).
function clampWeight(w) {
  return Math.max(0, w || 0);
}

// Generic cash-equivalent bucket name PREFIXES that don't represent a real,
// comparable security -- one fund's "Repo"/"Net Current Assets" (short-term
// liquidity management) isn't the same "position" as another fund's.
// Verified live (2026-08-04) against real holdings data: every OTHER asset
// class -- specific bonds, REITs, gold/other ETFs held as a fund-of-funds
// position -- carries a real, comparable name; only cash consistently uses
// generic bucket names. Anything with a real name is treated as comparable
// for exposure/overlap purposes, regardless of its asset class.
// Prefix match (not exact) because real disclosures often suffix these with
// a maturity date/tenor, e.g. "TREPS 02-Apr-2026 DEPO 10" or "Reverse Repo
// 01-May-2026" -- an exact-match Set would let those slip through as if
// they were named securities.
const GENERIC_CASH_PREFIXES = [
  'net current assets', 'net receivables', 'net receivables/payables',
  'cash & cash equivalents', 'cash and cash equivalents', 'reverse repo',
  'treps', 'cblo', 'repo', 'cash',
];

function isComparableHolding(h) {
  const name = (h.securityName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return Boolean(name) && !GENERIC_CASH_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function topNPlusOther(rows, n) {
  if (rows.length <= n) return rows;
  const top = rows.slice(0, n);
  const otherPct = rows.slice(n).reduce((s, r) => s + r.pct, 0);
  return [...top, { name: 'Other', pct: Math.round(otherPct * 100) / 100 }];
}

function assetClassLabel(assetClass) {
  if (assetClass === 'EQUITY') return 'Equity';
  if (assetClass === 'DEBT') return 'Debt';
  if (assetClass === 'CASH') return 'Cash';
  return 'Other';
}

// funds: [{ amfiCode, holdings: [{securityName, assetClass, sector, weightagePct}] }]
// allocations: { [amfiCode]: percentOfPortfolio } (expected to sum to ~100)
function combineExposure(funds, allocations) {
  const asset = new Map();
  const sector = new Map();
  const security = new Map(); // normalizedName -> { name, pct }
  let genericCashTotal = 0; // portfolio-level weight of unnamed cash-equivalent holdings

  for (const fund of funds) {
    const fundWeight = (allocations[fund.amfiCode] || 0) / 100;
    for (const h of fund.holdings) {
      // Unclamped -- a short/negative weight must reduce its asset class's
      // and security's TRUE net total, not vanish. See clampWeight's
      // comment above for why this function doesn't use it.
      const portfolioPct = (h.weightagePct || 0) * fundWeight;
      const assetKey = assetClassLabel(h.assetClass);
      asset.set(assetKey, (asset.get(assetKey) || 0) + portfolioPct);

      if (h.assetClass === 'EQUITY') {
        const sectorKey = h.sector || 'Unknown';
        sector.set(sectorKey, (sector.get(sectorKey) || 0) + portfolioPct);
      }

      if (isComparableHolding(h)) {
        const nameKey = normalizeName(h.securityName);
        const existing = security.get(nameKey) || { name: h.securityName, pct: 0 };
        existing.pct += portfolioPct;
        security.set(nameKey, existing);
      } else {
        genericCashTotal += portfolioPct;
      }
    }
  }

  const round2 = (n) => Math.round(n * 100) / 100;
  const sortedAsset = [...asset.entries()]
    .map(([name, pct]) => ({ name, pct: round2(pct) }))
    .sort((a, b) => b.pct - a.pct);
  const sortedSector = [...sector.entries()]
    .map(([name, pct]) => ({ name, pct: round2(pct) }))
    .sort((a, b) => b.pct - a.pct);
  const sortedSecurity = [...security.values()]
    .map((r) => ({ name: r.name, pct: round2(r.pct) }))
    .sort((a, b) => b.pct - a.pct);

  // Top 10 named securities (equity stocks, specific bonds, REITs, gold/other
  // ETFs) + "Other", plus a separate summary row for the portfolio's unnamed
  // cash-equivalent weight (Repo, Net Current Assets, etc.) -- those aren't
  // comparable positions across funds, so they stay out of the named list.
  const stockExposure = topNPlusOther(sortedSecurity, 10);
  stockExposure.push({ name: 'Cash & Other Unnamed', pct: round2(genericCashTotal) });

  return {
    assetAllocation: sortedAsset,
    sectorExposure: topNPlusOther(sortedSector, 10),
    stockExposure,
  };
}

// Pairwise overlap across every named, comparable holding (equity stocks,
// specific bonds, REITs, gold/other ETFs held as a fund-of-funds position)
// -- generic cash-equivalent holdings (Repo, Net Current Assets, etc.) are
// excluded since they aren't genuinely comparable positions across funds.
// For each such holding held by both funds, sums min(weightInA, weightInB).
// Returns an N x N grid (diagonal = 100).
function computeOverlap(funds) {
  const holdingMaps = funds.map((fund) => {
    const m = new Map();
    for (const h of fund.holdings) {
      if (!isComparableHolding(h)) continue;
      const key = normalizeName(h.securityName);
      m.set(key, (m.get(key) || 0) + clampWeight(h.weightagePct));
    }
    return m;
  });

  const n = funds.length;
  const grid = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) { grid[i][j] = 100; continue; }
      let overlap = 0;
      for (const [key, wA] of holdingMaps[i]) {
        const wB = holdingMaps[j].get(key);
        if (wB) overlap += Math.min(wA, wB);
      }
      grid[i][j] = Math.round(overlap * 100) / 100;
    }
  }
  return grid;
}

// Detects a derivative (typically futures) position from its security
// name -- the vendor payload marks these several different ways depending
// on fund/strategy type, confirmed live (2026-08) against real fund data:
//   - an explicit "Futures" suffix        e.g. "Suzlon Energy Ltd Futures"
//   - a "$$" suffix                       e.g. "MAX Healthcare Institute Ltd $$"
//   - a trailing expiry-date token,
//     with or without "**"                e.g. "Central Depository Services
//                                          (India) Limited Dec24**",
//                                          "Adani Enterprises Ltd. 30-JUN-26"
// Every example found pairs 1:1 with a plain-named cash-equity holding of
// the same company at an offsetting weight (e.g. "Suzlon Energy Ltd"
// +0.01% vs "Suzlon Energy Ltd Futures" -0.01%) -- a classic arbitrage/
// hedge structure. Scoped to assetClass EQUITY only: a DEBT holding's own
// maturity date (a T-bill, CD, or bond) is a normal, expected part of its
// name, e.g. "INDIAN OVERSEAS BANK CD 26FEB27" -- not a derivative marker.
const DERIVATIVE_NAME_RE = /(\bfutures\b|\$\$\s*$|\b\d{0,2}[-\s]?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[-\s]?\d{2,4}\*{0,2}\s*$)/i;

function isDerivativeHolding(h) {
  return h.assetClass === 'EQUITY' && DERIVATIVE_NAME_RE.test(h.securityName || '');
}

// mCapIndex: Map<normalizedName, 'Large Cap' | 'Mid Cap' | 'Small Cap'>
// Denominator for large/mid/small/unclassified is total CASH-EQUITY weight
// only (debt/cash/derivatives excluded), matching the reference proposal's
// convention for this section -- so those four keep summing to 100% among
// themselves, unaffected by how much derivative exposure a fund carries.
// `derivatives` is a separate, additional figure: net (unclamped) % of the
// fund's total NAV, not of totalEquity -- a short derivative should reduce
// it, not vanish, and it isn't a "did we classify this stock correctly"
// question the way unclassified is, so it doesn't belong in that bucket.
function computeMCapAllocation(fund, mCapIndex) {
  let large = 0, mid = 0, small = 0, unclassified = 0, derivatives = 0, totalEquity = 0;
  for (const h of fund.holdings) {
    if (h.assetClass !== 'EQUITY') continue;
    if (isDerivativeHolding(h)) {
      derivatives += (h.weightagePct || 0);
      continue;
    }
    const w = clampWeight(h.weightagePct);
    totalEquity += w;
    const cat = mCapIndex.get(normalizeName(h.securityName));
    if (cat === 'Large Cap') large += w;
    else if (cat === 'Mid Cap') mid += w;
    else if (cat === 'Small Cap') small += w;
    else unclassified += w;
  }
  const round2 = (n) => Math.round(n * 100) / 100;
  if (totalEquity === 0) return { large: 0, mid: 0, small: 0, unclassified: 0, derivatives: round2(derivatives) };
  const pct = (v) => Math.round((v / totalEquity) * 10000) / 100;
  return { large: pct(large), mid: pct(mid), small: pct(small), unclassified: pct(unclassified), derivatives: round2(derivatives) };
}

module.exports = { normalizeName, combineExposure, computeOverlap, computeMCapAllocation, topNPlusOther, isComparableHolding, isDerivativeHolding };
