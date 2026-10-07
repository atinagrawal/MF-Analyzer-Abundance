/**
 * lib/sifReports.js
 *
 * Shared data layer for the shareable SIF (Specialized Investment Fund)
 * report pages (app/sifs/reports/*) and their downloadable branded images
 * (pages/api/og-sif-aum.js, pages/api/og-sif-performance.js) -- both read
 * from here so the page a visitor sees and the image they download always
 * agree on the same numbers.
 *
 * Modeled on SIF360.com's own published report types (confirmed live,
 * 2026-10): an AMC-wise AUM leaderboard, and category-wise performance
 * comparison tables. Two gaps vs. SIF360, by design for this phase:
 *  - AMFI's SIF Average AUM disclosure is quarterly, not monthly, so no
 *    month-on-month AUM delta is shown (see scripts/sync_sif_aum.js).
 *  - No portfolio-composition detail (gross/net equity, # stocks, use of
 *    shorts) -- that needs factsheet-level extraction we don't do for SIFs
 *    yet, similar to the PMS factsheet pipeline (lib/pmsFactsheetsCache.js).
 */

import pool from './db';
import { r2Get } from './r2';

export function slugify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));

/**
 * AUM Leaderboard: one row per SIF brand (e.g. "Altiva SIF"), summed
 * across every distinct strategy group it runs (a SIF commonly runs
 * several -- e.g. Altiva has separate Hybrid Long-Short, Equity
 * Long-Short and Equity Ex-Top100 funds, each with its own
 * AMFI-disclosed total) and rolling up every Direct/Regular x
 * Growth/IDCW plan-variant within each group. sif-aum.json (R2, synced
 * quarterly by scripts/sync_sif_aum.js from AMFI's own pre-aggregated
 * per-group total) is keyed by scheme_id ("SIF-XX"); joined here against
 * sif_screener's sif_name column (the clean brand name) to know which
 * scheme_ids belong to the same SIF.
 *
 * Two-step aggregation, not a direct per-scheme_id sum: AMFI pre-aggregates
 * AUM at the (SIF, category) group level and every plan-variant sharing
 * that group repeats the SAME total (see sync_sif_aum.js's comment) --
 * summing every scheme_id directly would double/triple-count a group once
 * per plan-variant. So: dedupe to one figure per (SIF, category) group
 * first, THEN sum a SIF's distinct groups for its grand total.
 */
export async function getSifAumLeaderboard() {
  const [aumData, schemesRes] = await Promise.all([
    r2Get('sif-aum.json'),
    pool.query('SELECT scheme_id, sif_name FROM sif_screener'),
  ]);
  if (!aumData || !Object.keys(aumData).length) return null;

  const sifNameByCode = new Map(schemesRes.rows.map((r) => [r.scheme_id, r.sif_name]));

  // sif_screener has at least one brand stored inconsistently across its
  // own rows (e.g. "INFINITY SIF" vs "Infinity SIF" for the same SIF, by
  // live data), so grouping is case-insensitive; the first form seen
  // becomes the display name.
  const canonicalName = new Map(); // lowercase -> first-seen display form
  const groupTotals = new Map(); // "lowercase-name::category" -> { nameLower, category, aumCr, asOf }

  for (const code of Object.keys(aumData)) {
    const rec = aumData[code];
    if (rec.aumCr == null) continue;
    // sif_screener may not yet know a brand-new SIF's clean name if it
    // launched between syncs -- fall back to the raw scheme name's first
    // word rather than dropping the AUM entirely.
    const rawName = (sifNameByCode.get(code) || `${(rec.schemeName || '').split(' ')[0]} SIF`).trim();
    const nameLower = rawName.toLowerCase();
    if (!canonicalName.has(nameLower)) canonicalName.set(nameLower, rawName);
    const groupKey = `${nameLower}::${rec.category}`;
    if (!groupTotals.has(groupKey)) {
      groupTotals.set(groupKey, { nameLower, category: rec.category, aumCr: rec.aumCr, asOf: rec.asOf });
    }
  }

  const bySif = new Map(); // lowercase -> { sifName, aumCr, asOf, categories: Set }
  for (const g of groupTotals.values()) {
    const existing = bySif.get(g.nameLower);
    if (!existing) {
      bySif.set(g.nameLower, { sifName: canonicalName.get(g.nameLower), aumCr: g.aumCr, asOf: g.asOf, categories: new Set([g.category]) });
    } else {
      existing.aumCr += g.aumCr;
      existing.categories.add(g.category);
    }
  }

  const rows = [...bySif.values()]
    .map((r) => ({ sifName: r.sifName, aumCr: r.aumCr, asOf: r.asOf, categoryCount: r.categories.size }))
    .sort((a, b) => b.aumCr - a.aumCr);
  const totalAumCr = rows.reduce((s, r) => s + r.aumCr, 0);
  const top5AumCr = rows.slice(0, 5).reduce((s, r) => s + r.aumCr, 0);
  const categoryCount = new Set([...groupTotals.values()].map((g) => g.category)).size;

  return {
    asOf: rows[0]?.asOf || null,
    totalAumCr,
    sifCount: rows.length,
    categoryCount,
    top5ShareCr: top5AumCr,
    top5SharePct: totalAumCr ? (top5AumCr / totalAumCr) * 100 : 0,
    rows: rows.map((r) => ({ ...r, sharePct: totalAumCr ? (r.aumCr / totalAumCr) * 100 : 0 })),
  };
}

// AMFI's own SEBI-mandated category descriptions (confirmed live from
// sif_screener, 2026-10) -> a short display label + its URL slug. Kept as
// a fixed list (rather than discovered via DISTINCT category) so a known
// category's URL never changes shape just because it temporarily has zero
// live schemes.
const CATEGORIES = [
  { category: 'Hybrid Investment Strategies - Hybrid Long-Short Fund', label: 'Hybrid Long-Short' },
  { category: 'Hybrid Investment Strategies - Active Asset Allocator Long-Short Fund', label: 'Active Asset Allocator Long-Short' },
  { category: 'Equity Oriented Investment Strategies - Equity Long-Short Fund', label: 'Equity Long-Short' },
  { category: 'Equity Oriented Investment Strategies - Equity Ex-Top 100 Long-Short Fund', label: 'Equity Ex-Top 100 Long-Short' },
  { category: 'Equity Oriented Investment Strategies - Sector Rotation Long-Short Fund', label: 'Sector Rotation Long-Short' },
];

export function listSifCategories() {
  return CATEGORIES.map((c) => ({ ...c, slug: slugify(c.label) }));
}

/**
 * Category performance table: every live scheme in one AMFI category,
 * ranked by 1Y return, with returns/volatility across periods -- the same
 * shape as sif_screener already serves app/sifs/SifScreener.jsx, just
 * pre-filtered to one category and ranked for the report view.
 */
export async function getSifCategoryPerformance(categorySlug) {
  const match = listSifCategories().find((c) => c.slug === categorySlug);
  if (!match) return null;

  const { rows } = await pool.query(
    `SELECT scheme_id, nav_name, sif_name, nav, nav_date, ret_1m, ret_3m, ret_6m, ret_1y, ret_3y, vol, inception_date, ret_inception
     FROM sif_screener WHERE category = $1 ORDER BY ret_1y DESC NULLS LAST, ret_6m DESC NULLS LAST`,
    [match.category]
  );

  return {
    category: match.category,
    label: match.label,
    slug: match.slug,
    asOf: rows[0]?.nav_date || null,
    schemes: rows.map((r) => ({
      schemeId: r.scheme_id,
      name: r.sif_name,
      fullName: r.nav_name,
      nav: num(r.nav),
      ret1m: num(r.ret_1m),
      ret3m: num(r.ret_3m),
      ret6m: num(r.ret_6m),
      ret1y: num(r.ret_1y),
      ret3y: num(r.ret_3y),
      vol: num(r.vol),
      inceptionDate: r.inception_date,
      retInception: num(r.ret_inception),
    })),
  };
}
