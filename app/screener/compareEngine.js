// app/screener/compareEngine.js
//
// Pure, framework-free logic for the MF/SIF fund comparison feature.
// No React here — every function takes plain data in, returns plain data
// out, so it's directly testable with a standalone Node script (this repo
// has no test runner). See docs/superpowers/specs/2026-07-29-mf-sif-comparison-design.md.
//
// Deliberately does NOT reuse app/backtest/page.js's private xirr/sipDates
// implementation — that engine stays untouched to avoid any regression risk
// to the existing backtest page. This file has its own, smaller, comparison-
// scoped equivalents, sharing only lib/xirr.js's xirr() solver.

import { xirr } from '@/lib/xirr';

const DAY_MS = 86400000;

// ── NAV series parsing ──────────────────────────────────────────────────────

function parseDMY(s) {
  const [d, m, y] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}
function parseYMD(s) {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

// MF: /api/mf?code=X -> { data: [{ date: "DD-MM-YYYY", nav }] }, newest-first.
export function normalizeMfSeries(apiData) {
  const rows = apiData?.data || [];
  return rows
    .map((r) => ({ t: parseDMY(r.date), nav: +r.nav }))
    .filter((r) => r.nav > 0 && isFinite(r.t))
    .sort((a, b) => a.t - b.t);
}

// SIF: /api/sif-history?sd_id=X&from=YYYY-MM-DD&to=YYYY-MM-DD -> { records: [{ date: "YYYY-MM-DD", nav }] }, oldest-first.
export function normalizeSifSeries(apiData) {
  const rows = apiData?.records || [];
  return rows
    .map((r) => ({ t: parseYMD(r.date), nav: +r.nav }))
    .filter((r) => r.nav > 0 && isFinite(r.t))
    .sort((a, b) => a.t - b.t);
}

// Fetches and normalizes one fund's real NAV history. `fund` needs `.type`
// ('mf'|'sif') and `.navFetchKey` (MF's scheme code, or SIF's scheme_id).
// Returns null (never throws) on any failure or too-short a series — callers
// must treat null as "this fund's chart/SIP data isn't available", not as
// an error to propagate.
export async function fetchNavSeries(fund) {
  try {
    if (fund.type === 'mf') {
      const res = await fetch(`/api/mf?code=${encodeURIComponent(fund.navFetchKey)}`);
      if (!res.ok) return null;
      const json = await res.json();
      const series = normalizeMfSeries(json);
      return series.length >= 2 ? series : null;
    }
    if (fund.type === 'sif') {
      const to = new Date();
      const from = new Date(to.getTime() - 5 * 365 * DAY_MS); // 5 years — the longest period WEALTH_STOPS ever requests; harmless to ask for more than a young SIF actually has
      const toStr = to.toISOString().slice(0, 10);
      const fromStr = from.toISOString().slice(0, 10);
      const res = await fetch(`/api/sif-history?sd_id=${encodeURIComponent(fund.navFetchKey)}&from=${fromStr}&to=${toStr}`);
      if (!res.ok) return null;
      const json = await res.json();
      const series = normalizeSifSeries(json);
      return series.length >= 2 ? series : null;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Binary-search helpers over a sorted { t, nav } series ─────────────────

// First point with t >= target, or null if target is after the last point.
export function seriesForward(series, target) {
  let lo = 0, hi = series.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t >= target) { ans = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return ans < 0 ? null : series[ans];
}
// Last point with t <= target, or null if target is before the first point.
export function seriesAsOf(series, target) {
  let lo = 0, hi = series.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid].t <= target) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans < 0 ? null : series[ans];
}

// ── Wealth Simulation ──────────────────────────────────────────────────────

export const WEALTH_STOPS = [
  { key: '1y', label: '1Y', years: 1 },
  { key: '3y', label: '3Y', years: 3 },
  { key: '5y', label: '5Y', years: 5 },
];

// Lumpsum: formula-based from an already-computed annualized CAGR — a
// lumpsum's outcome genuinely IS its CAGR compounded, no sequencing effect,
// so a formula is correct here (unlike SIP below).
export function lumpsumWealth(annualCagrPct, years, principal = 100000) {
  if (annualCagrPct == null) return null;
  const val = principal * Math.pow(1 + annualCagrPct / 100, years);
  return { value: val, gain: val - principal };
}

// SIP: REAL, computed from an actual NAV series — never a CAGR-based
// approximation, since SIP returns are sequence-dependent (rupee-cost
// averaging) and a formula would misrepresent them. Generates one monthly
// purchase (on the same day-of-month as `end`, clamped to each month's real
// length) from `years` before `end` through `end`, buys units at the NAV on
// or after each purchase date (skips a month if the series has no data yet
// that far back — never fabricates a purchase), and returns the final value
// plus the money-weighted XIRR for the resulting cash flows.
export function sipWealth(series, end, years, monthly = 10000) {
  if (!series || series.length < 2) return null;
  const startDate = new Date(end);
  startDate.setUTCFullYear(startDate.getUTCFullYear() - years);
  const startMs = Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate());

  const day = new Date(end).getUTCDate();
  const dates = [];
  let cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), 1));
  for (let guard = 0; guard < years * 13; guard++) {
    const y = cursor.getUTCFullYear(), m = cursor.getUTCMonth();
    const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const t = Date.UTC(y, m, Math.min(day, daysInMonth));
    if (t > startMs && t <= end) dates.push(t);
    if (t > end) break;
    cursor = new Date(Date.UTC(y, m + 1, 1));
  }
  if (!dates.length) return null;

  let units = 0, invested = 0;
  const flows = [];
  for (const t of dates) {
    if (t < series[0].t) continue; // fund didn't exist yet this far back — skip, don't fabricate
    const px = seriesForward(series, t);
    if (!px) continue;
    units += monthly / px.nav;
    invested += monthly;
    flows.push({ t: px.t, amt: -monthly });
  }
  if (!flows.length) return null;

  const finalPx = seriesAsOf(series, end);
  if (!finalPx) return null;
  const value = units * finalPx.nav;

  const xirrRate = xirr([...flows, { t: end, amt: value }].sort((a, b) => a.t - b.t));
  return { value, gain: value - invested, invested, xirr: xirrRate };
}

// Computes both lumpsum and SIP wealth figures for every stop (1Y/3Y/5Y).
// `fund` needs `ret_1y`/`ret_3y`/`ret_5y` (for lumpsum); `navSeries` (for
// SIP) may be null independently of those fields — each stop's `lumpsum`/
// `sip` keys are simply null when their required input is missing.
export function computeWealthSimulation(fund, navSeries, asOfMs = Date.now()) {
  return WEALTH_STOPS.map(({ key, label, years }) => {
    const cagrField = `ret_${key}`;
    const lumpsum = lumpsumWealth(fund[cagrField], years);
    const sip = sipWealth(navSeries, asOfMs, years);
    return { label, years, lumpsum, sip };
  });
}
