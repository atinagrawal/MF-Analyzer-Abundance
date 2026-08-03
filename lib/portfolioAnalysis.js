/**
 * lib/portfolioAnalysis.js
 *
 * Pure functions for combining multiple funds' holdings into portfolio-level
 * asset/sector/stock exposure, pairwise fund overlap, and M-Cap allocation.
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

// weightagePct can be negative (short futures positions) -- a short hedge
// isn't a "holding" in the sense every section in this module measures.
function clampWeight(w) {
  return Math.max(0, w || 0);
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
  const stock = new Map(); // normalizedName -> { name, pct }
  let nonEquityTotal = 0; // portfolio-level weight of all non-EQUITY holdings

  for (const fund of funds) {
    const fundWeight = (allocations[fund.amfiCode] || 0) / 100;
    for (const h of fund.holdings) {
      const portfolioPct = clampWeight(h.weightagePct) * fundWeight;
      const assetKey = assetClassLabel(h.assetClass);
      asset.set(assetKey, (asset.get(assetKey) || 0) + portfolioPct);

      if (h.assetClass === 'EQUITY') {
        const sectorKey = h.sector || 'Unknown';
        sector.set(sectorKey, (sector.get(sectorKey) || 0) + portfolioPct);

        const nameKey = normalizeName(h.securityName);
        const existing = stock.get(nameKey) || { name: h.securityName, pct: 0 };
        existing.pct += portfolioPct;
        stock.set(nameKey, existing);
      } else {
        nonEquityTotal += portfolioPct;
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
  const sortedStock = [...stock.values()]
    .map((r) => ({ name: r.name, pct: round2(r.pct) }))
    .sort((a, b) => b.pct - a.pct);

  // Top 10 equity names + "Other", plus a separate summary row for the
  // portfolio's total non-equity (debt/cash/other) weight -- matching the
  // reference proposal's exact Stock Exposure layout.
  const stockExposure = topNPlusOther(sortedStock, 10);
  stockExposure.push({ name: 'Debt & Other Securities', pct: round2(nonEquityTotal) });

  return {
    assetAllocation: sortedAsset,
    sectorExposure: topNPlusOther(sortedSector, 10),
    stockExposure,
  };
}

// Equity-only pairwise overlap: for each stock held by both funds, sum
// min(weightInA, weightInB). Returns an N x N grid (diagonal = 100).
function computeOverlap(funds) {
  const equityMaps = funds.map((fund) => {
    const m = new Map();
    for (const h of fund.holdings) {
      if (h.assetClass !== 'EQUITY') continue;
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
      for (const [key, wA] of equityMaps[i]) {
        const wB = equityMaps[j].get(key);
        if (wB) overlap += Math.min(wA, wB);
      }
      grid[i][j] = Math.round(overlap * 100) / 100;
    }
  }
  return grid;
}

// mCapIndex: Map<normalizedName, 'Large Cap' | 'Mid Cap' | 'Small Cap'>
// Denominator is total EQUITY weight only (debt/cash excluded), matching
// the reference proposal's convention for this section.
function computeMCapAllocation(fund, mCapIndex) {
  let large = 0, mid = 0, small = 0, unclassified = 0, totalEquity = 0;
  for (const h of fund.holdings) {
    if (h.assetClass !== 'EQUITY') continue;
    const w = clampWeight(h.weightagePct);
    totalEquity += w;
    const cat = mCapIndex.get(normalizeName(h.securityName));
    if (cat === 'Large Cap') large += w;
    else if (cat === 'Mid Cap') mid += w;
    else if (cat === 'Small Cap') small += w;
    else unclassified += w;
  }
  if (totalEquity === 0) return { large: 0, mid: 0, small: 0, unclassified: 0 };
  const pct = (v) => Math.round((v / totalEquity) * 10000) / 100;
  return { large: pct(large), mid: pct(mid), small: pct(small), unclassified: pct(unclassified) };
}

module.exports = { normalizeName, combineExposure, computeOverlap, computeMCapAllocation, topNPlusOther };
