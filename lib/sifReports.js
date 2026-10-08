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
 * always read lower than a same-day actual figure. Checked live (2026-10)
 * whether this app's own mutual fund AUM data (scripts/sync_amfi_aum.js)
 * uses something better -- it doesn't; that script's own header says
 * "Average AUM" too. AMFI's regulatory disclosure for the whole industry
 * (SIFs and mutual funds alike) is average AUM, not a daily actual
 * figure -- no public feed anywhere gives a same-day number, for either.
 * Every AUM figure here is labeled "Average AUM for the Month" rather
 * than "AUM as of <date>" to be honest about what it actually measures. A
 * monthly history of the industry grand total (sif-aum-history.json,
 * appended by sync_sif_aum.js each time the figure changes) lets the AUM
 * leaderboard show a period-over-period delta despite that.
 *
 * Performance data (returns/volatility), unlike AUM, CAN be shown as of
 * any specific past calendar month, not just "till date" -- NAV history
 * is persisted in full (sif_nav_history, see build-sif-screener.mjs's
 * 2026-10 update), so getSifCategoryPerformanceAsOf() below recomputes
 * returns from that stored history rather than needing a separately
 * maintained snapshot archive.
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
// Every return period this report can show, oldest-data-required first --
// shared by the "available periods" check below and by anything that
// needs to know the full period set in order.
export const RETURN_PERIODS = [
  { key: 'ret1m', label: '1M', dbCol: 'ret_1m' },
  { key: 'ret3m', label: '3M', dbCol: 'ret_3m' },
  { key: 'ret6m', label: '6M', dbCol: 'ret_6m' },
  { key: 'ret1y', label: '1Y', dbCol: 'ret_1y' },
  { key: 'ret3y', label: '3Y (Ann.)', dbCol: 'ret_3y' },
  { key: 'ret5y', label: '5Y (Ann.)', dbCol: 'ret_5y' },
  { key: 'ret7y', label: '7Y (Ann.)', dbCol: 'ret_7y' },
  { key: 'ret10y', label: '10Y (Ann.)', dbCol: 'ret_10y' },
];

/**
 * A period column is shown only once real data exists for it -- same
 * principle as app/screener/ScreenerClient.jsx's pickDefaultSifReturnCols,
 * applied here as "any scheme has it" rather than that function's
 * majority-of-schemes threshold, since a report page has room to show
 * every period that's genuinely populated rather than capping at a fixed
 * count for column-width reasons. A brand-new category (every SIF under
 * 3 years old, today) naturally shows only 1M/3M/6M/1Y until real 3Y+
 * data exists -- no fixed list to maintain as that happens.
 */
export function availableReturnPeriods(schemes) {
  return RETURN_PERIODS.filter((p) => schemes.some((s) => s[p.key] != null));
}

export async function getSifCategoryPerformance(categorySlug) {
  const categories = await listSifCategories();
  const match = categories.find((c) => c.slug === categorySlug);
  if (!match) return null;

  const { rows } = await pool.query(
    `SELECT scheme_id, nav_name, sif_name, nav, nav_date, ret_1m, ret_3m, ret_6m, ret_1y, ret_3y, ret_5y, ret_7y, ret_10y, vol, inception_date, ret_inception
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
      ret5y: num(r.ret_5y),
      ret7y: num(r.ret_7y),
      ret10y: num(r.ret_10y),
      vol: num(r.vol),
      inceptionDate: r.inception_date,
      retInception: num(r.ret_inception),
    })),
  };
}

/**
 * Calendar month-ends a category performance report can be viewed as of
 * -- every distinct (year, month) with at least one NAV point in
 * sif_nav_history, newest first, excluding the current in-progress month
 * (a "calendar month" report means a COMPLETE month, matching SIF360's
 * own "as of 30 September" style -- the current month isn't done yet).
 */
export async function listAvailableReportMonths() {
  const { rows } = await pool.query(`
    SELECT DISTINCT date_trunc('month', date)::date AS month_start
    FROM sif_nav_history
    WHERE date < date_trunc('month', CURRENT_DATE)
    ORDER BY month_start DESC
  `);
  return rows.map((r) => {
    const d = new Date(r.month_start);
    const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return { value, label };
  });
}

/**
 * Same shape as getSifCategoryPerformance(), but every scheme's
 * return/volatility is recomputed from sif_nav_history as of the LAST
 * available NAV on or before the given calendar month's end -- not read
 * from sif_screener, which only ever holds "as of today" figures.
 * @param {string} categorySlug
 * @param {string} yearMonth - "YYYY-MM"
 */
export async function getSifCategoryPerformanceAsOf(categorySlug, yearMonth) {
  const categories = await listSifCategories();
  const match = categories.find((c) => c.slug === categorySlug);
  if (!match || !/^\d{4}-\d{2}$/.test(yearMonth || '')) return null;

  const { deriveSifReturns, deriveSifRisk } = await import('./sifReturnMath.js');

  const [year, month] = yearMonth.split('-').map(Number);
  // Last instant of the given month, UTC -- matches sif_nav_history's
  // dates (stored as plain DATE, written from UTC-derived NAV timestamps
  // by build-sif-screener.mjs).
  const asOfMs = Date.UTC(year, month, 0, 23, 59, 59, 999);

  const schemesRes = await pool.query(
    'SELECT scheme_id, nav_name, sif_name FROM sif_screener WHERE category = $1',
    [match.category]
  );
  if (!schemesRes.rows.length) {
    return { category: match.category, label: match.label, slug: match.slug, asOf: null, schemes: [] };
  }

  const schemeIds = schemesRes.rows.map((r) => r.scheme_id);
  const historyRes = await pool.query(
    `SELECT scheme_id, date, nav FROM sif_nav_history WHERE scheme_id = ANY($1) AND date <= $2 ORDER BY scheme_id, date ASC`,
    [schemeIds, new Date(asOfMs).toISOString().slice(0, 10)]
  );

  const seriesByScheme = new Map(); // scheme_id -> [{t, nav}]
  for (const row of historyRes.rows) {
    const t = new Date(row.date).getTime();
    const list = seriesByScheme.get(row.scheme_id) || [];
    list.push({ t, nav: Number(row.nav) });
    seriesByScheme.set(row.scheme_id, list);
  }

  let latestAsOf = null;
  const schemes = schemesRes.rows.map((r) => {
    const series = seriesByScheme.get(r.scheme_id) || [];
    if (!series.length) {
      return { schemeId: r.scheme_id, name: r.sif_name, fullName: r.nav_name, nav: null, vol: null, inceptionDate: null, retInception: null };
    }
    const latest = series[series.length - 1];
    if (!latestAsOf || latest.t > latestAsOf) latestAsOf = latest.t;
    const returns = deriveSifReturns(series, asOfMs);
    const { vol } = deriveSifRisk(series);
    return {
      schemeId: r.scheme_id,
      name: r.sif_name,
      fullName: r.nav_name,
      nav: latest.nav,
      ret1m: returns.ret_1m ?? null,
      ret3m: returns.ret_3m ?? null,
      ret6m: returns.ret_6m ?? null,
      ret1y: returns.ret_1y ?? null,
      ret3y: returns.ret_3y ?? null,
      ret5y: returns.ret_5y ?? null,
      ret7y: returns.ret_7y ?? null,
      ret10y: returns.ret_10y ?? null,
      vol,
      inceptionDate: new Date(series[0].t).toISOString().slice(0, 10),
      retInception: returns.ret_inception ?? null,
    };
  });

  return {
    category: match.category,
    label: match.label,
    slug: match.slug,
    asOf: latestAsOf ? new Date(latestAsOf).toISOString().slice(0, 10) : null,
    schemes,
  };
}

/**
 * Month-by-month returns grid for a category -- SIF360's own "Monthly
 * Returns Heatmap" format (confirmed live, 2026-10: "Last 7 months",
 * color-coded by sign/magnitude, grouped by category). Each cell is that
 * SINGLE calendar month's standalone return (month-end NAV vs. the prior
 * month-end NAV), not a cumulative trailing return -- different from
 * every other number this report shows, so schemes/months here use their
 * own `returns` map keyed by month value rather than the ret1m/ret3m/...
 * shape getSifCategoryPerformance() and getSifCategoryPerformanceAsOf()
 * share.
 *
 * Only complete calendar months (matching listAvailableReportMonths()'s
 * same exclusion of the in-progress current month) -- a partial month's
 * "return" would be a different, incomparable kind of number sitting in
 * the same grid as 11 real month-end-to-month-end figures.
 */
export async function getSifMonthlyReturnsHeatmap(categorySlug, monthsBack = 7) {
  const categories = await listSifCategories();
  const match = categories.find((c) => c.slug === categorySlug);
  if (!match) return null;

  const schemesRes = await pool.query(
    'SELECT scheme_id, nav_name, sif_name FROM sif_screener WHERE category = $1',
    [match.category]
  );
  if (!schemesRes.rows.length) {
    return { category: match.category, label: match.label, slug: match.slug, months: [], schemes: [] };
  }
  const schemeIds = schemesRes.rows.map((r) => r.scheme_id);

  const { rows } = await pool.query(
    `
    WITH monthly_last AS (
      SELECT scheme_id, date_trunc('month', date)::date AS month, nav,
             ROW_NUMBER() OVER (PARTITION BY scheme_id, date_trunc('month', date) ORDER BY date DESC) AS rn
      FROM sif_nav_history
      WHERE scheme_id = ANY($1) AND date < date_trunc('month', CURRENT_DATE)
    )
    SELECT scheme_id, month, nav,
           LAG(nav) OVER (PARTITION BY scheme_id ORDER BY month) AS prev_nav
    FROM monthly_last WHERE rn = 1
    ORDER BY scheme_id, month ASC
    `,
    [schemeIds]
  );

  // Last N complete months across the whole category (not per-scheme --
  // every scheme shares the same column set so the grid lines up; a
  // scheme without data for an early column just shows "—" there).
  const allMonths = [...new Set(rows.map((r) => r.month.toISOString().slice(0, 7)))].sort();
  const monthValues = allMonths.slice(-monthsBack);
  const months = monthValues.map((v) => ({
    value: v,
    label: new Date(`${v}-01`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }),
  }));

  const returnsByScheme = new Map(); // scheme_id -> { "YYYY-MM": pct }
  for (const r of rows) {
    const monthVal = r.month.toISOString().slice(0, 7);
    if (!monthValues.includes(monthVal) || r.prev_nav == null) continue;
    const pct = +(((Number(r.nav) - Number(r.prev_nav)) / Number(r.prev_nav)) * 100).toFixed(2);
    const map = returnsByScheme.get(r.scheme_id) || {};
    map[monthVal] = pct;
    returnsByScheme.set(r.scheme_id, map);
  }

  const schemes = schemesRes.rows
    .map((s) => ({ schemeId: s.scheme_id, name: s.sif_name, fullName: s.nav_name, returns: returnsByScheme.get(s.scheme_id) || {} }))
    .filter((s) => Object.keys(s.returns).length > 0) // schemes with zero data in this window add nothing to the grid
    .sort((a, b) => (b.returns[monthValues[monthValues.length - 1]] ?? -Infinity) - (a.returns[monthValues[monthValues.length - 1]] ?? -Infinity));

  return { category: match.category, label: match.label, slug: match.slug, months, schemes };
}
