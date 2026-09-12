/**
 * app/pms-preferred/pmsPreferredFormat.js
 *
 * Pure, DOM-free formatting/derivation helpers shared between the server
 * page (page.jsx) and the client-side interactive grid+drawer
 * (PmsPreferredInteractive.jsx). No 'use client' needed -- plain functions
 * import cleanly into either environment.
 */

export function fmtCr(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return `₹${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(v))} Cr`;
}

// Display-only rounding for ratios (Sharpe, Beta, P/E, alpha) -- some
// factsheets' own figures carry 3-4 decimal places (e.g. a raw "1.1419"),
// which reads as noise next to every other card's clean 2-decimal values.
// Never mutates the stored data, only what's shown.
export function fmtRatio(n) {
  if (n == null || !Number.isFinite(n)) return n;
  return Math.round(n * 100) / 100;
}

// Turns a factsheet's real sectorAllocation into a fixed "top 5 + Other"
// series that always sums to ~100% -- so a sector-DNA bar's width is
// always the whole portfolio, honestly, even when the factsheet itself
// only discloses partial sector coverage. `swatch` is a 0-4 palette index
// (darkest = biggest sector, a deliberate readability cue) or 'other'.
// Returns null when there's nothing real to show (never a fabricated bar).
export function buildSectorDna(sectorAllocation) {
  if (!Array.isArray(sectorAllocation) || sectorAllocation.length === 0) return null;
  const sorted = [...sectorAllocation]
    .filter((s) => s?.sector && Number.isFinite(s.weightPct) && s.weightPct > 0)
    .sort((a, b) => b.weightPct - a.weightPct);
  if (sorted.length === 0) return null;
  const top = sorted.slice(0, 5);
  const segments = top.map((s, i) => ({ sector: s.sector, weightPct: s.weightPct, swatch: i }));
  const shown = top.reduce((sum, s) => sum + s.weightPct, 0);
  const other = Math.round((100 - shown) * 10) / 10;
  if (other > 0.5) segments.push({ sector: 'Other', weightPct: other, swatch: 'other' });
  return segments;
}
