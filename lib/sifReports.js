/**
 * lib/sifReports.js
 *
 * Shared data layer for the shareable SIF (Specialized Investment Fund)
 * report pages (app/sifs/reports/*) and their downloadable branded images
 * (app/api/og-sif-aum, app/api/og-sif-performance) -- both read from here
 * so the page a visitor sees and the image they download always agree on
 * the same numbers.
 *
 * Modeled on SIF360.com's own published report types (confirmed live,
 * 2026-10): an AMC-wise AUM leaderboard, and category-wise performance
 * comparison tables.
 *
 * AUM figures are AMFI's quarterly "Average AUM for the Month" disclosure
 * (see scripts/sync_sif_aum.js), not a point-in-time snapshot -- flagged
 * explicitly here because it's the one thing this report CANNOT match
 * SIF360 on, by construction, not by bug: during a period of rapid SIF
 * asset growth (confirmed happening right now), a monthly average will
 * always read lower than a same-day actual figure. AMFI does not publish
 * a point-in-time AUM feed for SIFs the way it does for mutual funds (no
 * units-outstanding data to compute one independently either), so every
 * figure here is labeled "Average AUM for the Month" rather than "AUM as
 * of <date>" to be honest about what it actually measures. A monthly
 * history of the industry grand total (sif-aum-history.json, appended by
 * sync_sif_aum.js each time the figure changes) lets the AUM leaderboard
 * show a period-over-period delta despite that.
 *
 * Remaining known gap vs. SIF360: no portfolio-composition detail
 * (gross/net equity, # stocks, use of shorts). Checked live (2026-10)
 * whether stock_fund_holdings already covers this per the holdings
 * engine built earlier this project -- it doesn't: holder_type is only
 * ever 'MF' (9,866 rows) or 'PMS' (758 rows), no SIF rows at all. Needs
 * genuinely new data sourcing (factsheet-level extraction per SIF house,
 * similar to the PMS factsheet pipeline in lib/pmsFactsheetsCache.js),
 * not a quick wire-up of something that already exists.
 */

import pool from './db.js';
import { r2Get } from './r2.js';

export function slugify(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));

/**
 * AUM Leaderboard: AMFI's own pre-aggregated per-SIF totals, read
 * directly from sif-aum.json's `sifTotals`/`grandTotalCr` (see
 * scripts/sync_sif_aum.js's 2026-10 update) -- no cross-referencing or
 * name-guessing needed, since AMFI already resolves the SIF-brand-level
 * total and name itself (as "<Brand> SIF Total" / "Grand Total" rows). An
 * earlier version of this function derived per-SIF totals by summing
 * sif-aum.json's per-scheme records after resolving each one's brand name
 * via a cross-reference into sif_screener; because sif_screener only
 * keeps one representative plan-variant per scheme, most plan-variants
 * had no match and fell back to a guessed name ("first word + SIF"),
 * which for brands like WSIF didn't reconstruct the real name and
 * silently double-counted that SIF's AUM under two different display
 * names. Reading AMFI's own Total rows sidesteps that class of bug
 * entirely.
 */
export async function getSifAumLeaderboard() {
  const [aumData, history] = await Promise.all([
    r2Get('sif-aum.json'),
    r2Get('sif-aum-history.json').catch(() => null),
  ]);
  if (!aumData?.sifTotals?.length || aumData.grandTotalCr == null) return null;

  const totalAumCr = aumData.grandTotalCr;
  const rows = aumData.sifTotals.map((r) => ({
    sifName: r.sifName,
    aumCr: r.aumCr,
    sharePct: totalAumCr ? (r.aumCr / totalAumCr) * 100 : 0,
  }));
  const top5AumCr = rows.slice(0, 5).reduce((s, r) => s + r.aumCr, 0);

  // Period-over-period delta from the recorded history (see
  // scripts/sync_sif_aum.js) -- entries are appended only when the grand
  // total actually changes, so "previous" is the last genuinely different
  // reading, not necessarily exactly one calendar month back (AMFI's own
  // disclosure only updates quarterly).
  let momDeltaCr = null;
  let momDeltaPct = null;
  let previousAsOf = null;
  if (Array.isArray(history) && history.length >= 2) {
    const sorted = [...history].sort((a, b) => new Date(a.capturedAt) - new Date(b.capturedAt));
    const latest = sorted[sorted.length - 1];
    const previous = sorted[sorted.length - 2];
    if (latest?.asOf === aumData.asOf && previous?.grandTotalCr != null) {
      momDeltaCr = Math.round((latest.grandTotalCr - previous.grandTotalCr) * 100) / 100;
      momDeltaPct = previous.grandTotalCr ? (momDeltaCr / previous.grandTotalCr) * 100 : null;
      previousAsOf = previous.asOf;
    }
  }

  return {
    asOf: aumData.asOf,
    totalAumCr,
    sifCount: rows.length,
    categoryCount: null, // not meaningful at this level any more -- AMFI's Total rows don't carry a category breakdown
    top5ShareCr: top5AumCr,
    top5SharePct: totalAumCr ? (top5AumCr / totalAumCr) * 100 : 0,
    momDeltaCr,
    momDeltaPct,
    previousAsOf,
    rows,
  };
}

/**
 * AMFI's own SEBI-mandated categories, discovered live from whatever is
 * actually in sif_screener right now rather than a fixed list -- a new
 * category shows up here the moment even one scheme in it exists, no
 * code change needed. Cached in-process for a few minutes since this
 * backs every performance-report page/image request.
 */
let categoriesCache = null; // { ts, list }
const CATEGORIES_TTL_MS = 5 * 60 * 1000;

export async function listSifCategories() {
  if (categoriesCache && Date.now() - categoriesCache.ts < CATEGORIES_TTL_MS) {
    return categoriesCache.list;
  }
  const { rows } = await pool.query(
    'SELECT DISTINCT category FROM sif_screener WHERE category IS NOT NULL ORDER BY category ASC'
  );
  const list = rows.map((r) => {
    // "Equity Oriented Investment Strategies - Equity Long-Short Fund"
    // -> "Equity Long-Short" -- the part after the last " - ", trailing
    // " Fund" dropped. Verified against every category seen live (2026-10).
    const label = r.category.split(' - ').pop().replace(/\s+Fund$/i, '').trim();
    return { category: r.category, label, slug: slugify(label) };
  });
  categoriesCache = { ts: Date.now(), list };
  return list;
}

/**
 * Category performance table: every live scheme in one AMFI category,
 * ranked by 1Y return, with returns/volatility across periods -- the same
 * shape as sif_screener already serves app/sifs/SifScreener.jsx, just
 * pre-filtered to one category and ranked for the report view.
 */
export async function getSifCategoryPerformance(categorySlug) {
  const categories = await listSifCategories();
  const match = categories.find((c) => c.slug === categorySlug);
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
