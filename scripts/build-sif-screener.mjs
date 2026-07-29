/**
 * build-sif-screener.mjs — nightly SIF screener dataset builder.
 *
 * Runs on GitHub Actions, same job as build-screener.mjs (MF). SIF has no
 * bulk NAV-history endpoint like MF's DownloadNAVHistoryReport_Po.aspx, so
 * this fetches each scheme's history individually (only ~31 schemes today,
 * so this is fast) directly from AMFI's undocumented SIF APIs — the same
 * ones app/api/sif-nav/route.js and app/api/sif-history/route.js proxy for
 * the browser, called here directly since this script isn't a browser.
 *
 * Deliberately does NOT import from app/screener/compareEngine.js (or any
 * app/ code) — this codebase's standalone build scripts are self-contained
 * (see build-screener.mjs's own header comment), since the app's `@/` path
 * alias only resolves inside Next.js's bundler, not plain `node script.mjs`.
 * The return/risk math below is an adapted copy of
 * deriveReturnsFromSeries/deriveRiskFromSeries, not the same code — keep
 * them in sync by hand if either changes.
 *
 * Unlike MF, SIF has no pre-AMFI-era funds needing manual inception-date
 * overrides (every SIF was launched entirely within AMFI's current SIF
 * framework) — so there's no equivalent of mf_inception/mfapi.in lookups
 * here; age_years and inception both come directly from each scheme's own
 * first real NAV record.
 *
 * Env:
 *   POSTGRES_URL (optional) -> upsert into sif_screener
 */
import pg from 'pg';

const DAY_MS = 86400000;
const YEAR_MS = 365 * DAY_MS;
const AMFI_BASE = 'https://www.amfiindia.com/api';
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; MFCalc/2.0)' };

// ── NAV history parsing ─────────────────────────────────────────────────────
// Raw AMFI sif-nav-history response shape (same one app/api/sif-history's
// route.js flattens for the browser): { data: { nav_groups: [{
// historical_records: [{ date: "YYYY-MM-DD", nav: "10.1234" }] }] } }, or
// { message: "..." } when there's nothing to display for the range.
export function parseSifHistoryResponse(json) {
  if (json?.message) return [];
  const records = json?.data?.nav_groups?.[0]?.historical_records ?? [];
  return records
    .map((r) => {
      const [y, m, d] = String(r.date).split('-').map(Number);
      return { t: Date.UTC(y, m - 1, d), nav: parseFloat(r.nav) };
    })
    .filter((r) => r.nav > 0 && isFinite(r.t))
    .sort((a, b) => a.t - b.t);
}

// ── Return derivation (adapted from compareEngine.js's deriveReturnsFromSeries) ──
const PERIOD_DAYS = {
  ret_1m: 30, ret_3m: 91, ret_6m: 182,
  ret_1y: 365, ret_3y: 365 * 3, ret_5y: 365 * 5, ret_7y: 365 * 7, ret_10y: 365 * 10,
};

export function deriveSifReturns(series, asOfMs) {
  const out = {};
  // last point with t <= asOfMs
  let latest = null;
  for (const p of series) { if (p.t <= asOfMs) latest = p; else break; }
  if (!latest) return out;
  const first = series[0];

  for (const [key, days] of Object.entries(PERIOD_DAYS)) {
    const targetT = asOfMs - days * DAY_MS;
    if (targetT < first.t) { out[key] = null; continue; }
    // first point with t >= targetT
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
  out.ret_inception_annualized = first.nav > 0 ? inceptionYears > 1 : null;
  out.age_years = +((asOfMs - first.t) / YEAR_MS).toFixed(1);
  out.inception_date = new Date(first.t).toISOString().slice(0, 10);
  return out;
}

// ── Risk derivation (adapted from compareEngine.js's deriveRiskFromSeries) ──
export function deriveSifRisk(series) {
  if (!series || series.length < 2) return { vol: null, max_dd: null, ret_per_risk: null };

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

  let peak = series[0].nav, maxDd = 0;
  for (const p of series) {
    if (p.nav > peak) peak = p.nav;
    const dd = ((p.nav - peak) / peak) * 100;
    if (dd < maxDd) maxDd = dd;
  }
  const max_dd = +maxDd.toFixed(2);

  const inception = deriveSifReturns(series, series[series.length - 1].t).ret_inception;
  const ret_per_risk = (inception != null && vol) ? +(inception / vol).toFixed(2) : null;

  return { vol, max_dd, ret_per_risk };
}
