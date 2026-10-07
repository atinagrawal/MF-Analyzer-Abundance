/**
 * lib/sifReturnMath.js
 *
 * Computes a SIF scheme's returns as of an arbitrary past date, given its
 * full NAV history -- adapted copy of scripts/build-sif-screener.mjs's
 * deriveSifReturns(series, asOfMs), which computes the exact same thing
 * for "today" every night to populate sif_screener. That script
 * deliberately stays self-contained (its own header comment: standalone
 * build scripts in this codebase don't import from lib/, so plain `node
 * script.mjs` never needs the `@/` bundler alias) -- so this is a
 * documented duplicate for the live app's own use, not a shared import.
 * Keep the two in sync by hand if either changes; they were identical as
 * of 2026-10.
 *
 * Used by lib/sifReports.js's getSifCategoryPerformanceAsOf() to answer
 * "what did this category's performance look like as of a past calendar
 * month-end" directly from sif_nav_history (persisted by
 * build-sif-screener.mjs since the same 2026-10 change), without
 * re-fetching anything from AMFI.
 */

const DAY_MS = 86400000;
const YEAR_MS = 365 * DAY_MS;

const PERIOD_DAYS = {
  ret_1m: 30, ret_3m: 91, ret_6m: 182,
  ret_1y: 365, ret_3y: 365 * 3, ret_5y: 365 * 5, ret_7y: 365 * 7, ret_10y: 365 * 10,
};

/**
 * @param {{t: number, nav: number}[]} series - sorted ascending by t (ms epoch)
 * @param {number} asOfMs
 */
export function deriveSifReturns(series, asOfMs) {
  const out = {};
  let latest = null;
  for (const p of series) { if (p.t <= asOfMs) latest = p; else break; }
  if (!latest) return out;
  const first = series[0];

  for (const [key, days] of Object.entries(PERIOD_DAYS)) {
    const targetT = asOfMs - days * DAY_MS;
    if (targetT < first.t) { out[key] = null; continue; }
    let past = null;
    for (const p of series) { if (p.t >= targetT) { past = p; break; } }
    if (!past || past.nav <= 0) { out[key] = null; continue; }
    const years = days / 365;
    out[key] = years <= 1
      ? +(((latest.nav - past.nav) / past.nav) * 100).toFixed(2)
      : +((Math.pow(latest.nav / past.nav, 1 / years) - 1) * 100).toFixed(2);
  }
  const inceptionYears = (latest.t - first.t) / YEAR_MS;
  out.ret_inception = first.nav > 0
    ? (inceptionYears <= 1
        ? +(((latest.nav - first.nav) / first.nav) * 100).toFixed(2)
        : +((Math.pow(latest.nav / first.nav, 1 / inceptionYears) - 1) * 100).toFixed(2))
    : null;
  out.age_years = +((asOfMs - first.t) / YEAR_MS).toFixed(1);
  return out;
}

/** Adapted copy of scripts/build-sif-screener.mjs's deriveSifRisk -- see
 * this file's header comment for why it's a duplicate, not a shared import. */
export function deriveSifRisk(series) {
  if (!series || series.length < 2) return { vol: null };

  const byMonth = new Map();
  for (const p of series) {
    const d = new Date(p.t);
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    byMonth.set(key, p);
  }
  const monthly = [...byMonth.values()].sort((a, b) => a.t - b.t);

  let vol = null;
  if (monthly.length >= 3) {
    const rets = [];
    for (let i = 1; i < monthly.length; i++) rets.push((monthly[i].nav - monthly[i - 1].nav) / monthly[i - 1].nav);
    const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
    const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length;
    vol = +(Math.sqrt(variance) * Math.sqrt(12) * 100).toFixed(2);
  }
  return { vol };
}
