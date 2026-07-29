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
      const toStr = to.toISOString().slice(0, 10);
      // AMFI's SIF history endpoint rejects overly-wide date ranges outright
      // (HTTP 400) rather than gracefully truncating to what actually exists
      // — confirmed empirically: a 5-year-back request fails, while ~4.5
      // years back succeeds. Try the wide window first (5 years — the
      // longest period WEALTH_STOPS ever requests — so a SIF's growing real
      // history keeps getting picked up automatically as it ages, with no
      // code change needed later), and fall back to a narrower, safely
      // within-range window if AMFI rejects the wide request. This must
      // never leave a SIF with zero NAV data just because the wide window
      // overshot AMFI's (undocumented) range limit.
      const fetchWindow = async (daysBack) => {
        try {
          const fromStr = new Date(to.getTime() - daysBack * DAY_MS).toISOString().slice(0, 10);
          const res = await fetch(`/api/sif-history?sd_id=${encodeURIComponent(fund.navFetchKey)}&from=${fromStr}&to=${toStr}`);
          if (!res.ok) return null;
          const json = await res.json();
          const series = normalizeSifSeries(json);
          return series.length >= 2 ? series : null;
        } catch {
          // A thrown error (network drop, malformed JSON) on the wide
          // attempt must not skip the narrow fallback below — only a
          // clean null return does that.
          return null;
        }
      };
      return (await fetchWindow(5 * 365)) || (await fetchWindow(400));
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

// SIFs have a SEBI-mandated ₹10L minimum investment ticket size — there's
// no way to actually invest ₹1L lumpsum in one, so the lumpsum simulation
// uses ₹10L for SIF funds instead of the MF default of ₹1L.
export const SIF_LUMPSUM_PRINCIPAL = 1000000;
export const MF_LUMPSUM_PRINCIPAL = 100000;

// Computes both lumpsum and SIP wealth figures for every stop (1Y/3Y/5Y).
// `fund` needs `ret_1y`/`ret_3y`/`ret_5y` (for lumpsum); `navSeries` (for
// SIP) may be null independently of those fields — each stop's `lumpsum`
// key is null when its required input is missing. `sip` is always null
// for SIF funds: SIFs are a lumpsum-minimum-ticket-size product (see
// SIF_LUMPSUM_PRINCIPAL above), not an open-ended SIP vehicle like an MF,
// so a "₹10,000/mo SIP" figure would describe an investment path that
// doesn't actually exist for a SIF — never compute or display one.
export function computeWealthSimulation(fund, navSeries, asOfMs = Date.now()) {
  const isSif = fund.type === 'sif';
  const principal = isSif ? SIF_LUMPSUM_PRINCIPAL : MF_LUMPSUM_PRINCIPAL;
  return WEALTH_STOPS.map(({ key, label, years }) => {
    const cagrField = `ret_${key}`;
    const lumpsum = lumpsumWealth(fund[cagrField], years, principal);
    const sip = isSif ? null : sipWealth(navSeries, asOfMs, years);
    return { label, years, lumpsum, sip };
  });
}

// ── Fund normalization ─────────────────────────────────────────────────────
// Maps either an MF or SIF raw fund object (as passed into compareList —
// see Task 6) into one common shape the comparison modal renders uniformly.
// SIF entries start with null return/risk fields; applyDerivedStats below
// fills them in once that fund's NAV history has resolved (see
// fetchNavSeries in Task 1) — until then the modal shows "—" for those
// cells, identically to how it already handles any fund missing a period.
export function normalizeFund(entry) {
  if (entry.type === 'mf') {
    return {
      id: 'mf-' + entry.code,
      type: 'mf',
      name: entry.name,
      house: entry.amc,
      category: entry.category,
      navFetchKey: entry.code,
      ret_1m: entry.ret_1m ?? null, ret_3m: entry.ret_3m ?? null, ret_6m: entry.ret_6m ?? null,
      ret_1y: entry.ret_1y ?? null, ret_3y: entry.ret_3y ?? null, ret_5y: entry.ret_5y ?? null,
      ret_7y: entry.ret_7y ?? null, ret_10y: entry.ret_10y ?? null, ret_inception: entry.ret_inception ?? null,
      vol: entry.vol ?? null, max_dd: entry.max_dd ?? null, ret_per_risk: entry.ret_per_risk ?? null,
    };
  }
  return {
    id: 'sif-' + entry.scheme_id,
    type: 'sif',
    name: entry.nav_name,
    house: entry.sif_name,
    category: entry.category,
    navFetchKey: entry.scheme_id,
    ret_1m: null, ret_3m: null, ret_6m: null, ret_1y: null, ret_3y: null,
    ret_5y: null, ret_7y: null, ret_10y: null, ret_inception: null,
    vol: null, max_dd: null, ret_per_risk: null,
  };
}

// ── SIF-derived stats (returns, vol, max drawdown, ret/risk) ───────────────
// MF funds already carry these precomputed server-side; SIFs don't yet
// (too new for a scheduled build pipeline), so this derives the same shape
// from a fetched NAV series so both types render through the same table
// rendering code.

const YEAR_MS_2 = 365 * 86400000;
const PERIOD_DAYS = {
  ret_1m: 30, ret_3m: 91, ret_6m: 182,
  ret_1y: 365, ret_3y: 365 * 3, ret_5y: 365 * 5, ret_7y: 365 * 7, ret_10y: 365 * 10,
};

export function deriveReturnsFromSeries(series, asOfMs) {
  const out = {};
  const latest = seriesAsOf(series, asOfMs);
  if (!latest) return out;
  const first = series[0];

  for (const [key, days] of Object.entries(PERIOD_DAYS)) {
    const targetT = asOfMs - days * 86400000;
    if (targetT < first.t) { out[key] = null; continue; }
    const past = seriesForward(series, targetT);
    if (!past || past.nav <= 0) { out[key] = null; continue; }
    const years = days / 365;
    out[key] = years <= 1
      ? +(((latest.nav - past.nav) / past.nav) * 100).toFixed(2) // sub-year: absolute change, matches MF's 'abs' kind for 1M/3M/6M
      : +((Math.pow(latest.nav / past.nav, 1 / years) - 1) * 100).toFixed(2); // 1Y+: CAGR
  }
  // Same sub-year/1Y+ split as every other period above: annualizing a
  // fund's total return over just a few weeks of real life produces a
  // wildly inflated headline number (a modest real gain compounded as if
  // it ran for a full year) — this was a real bug, not a design choice:
  // ret_inception was the one period here that skipped the split and
  // always annualized, regardless of the fund's actual age.
  const inceptionYears = (latest.t - first.t) / YEAR_MS_2;
  out.ret_inception = first.nav > 0
    ? (inceptionYears <= 1
        ? +(((latest.nav - first.nav) / first.nav) * 100).toFixed(2)
        : +((Math.pow(latest.nav / first.nav, 1 / inceptionYears) - 1) * 100).toFixed(2))
    : null;
  return out;
}

// Annualized volatility (stdev of monthly returns x sqrt(12)) and max
// drawdown (largest peak-to-trough %), both from the same series resampled
// to one point per calendar month (last observation of each month).
export function deriveRiskFromSeries(series) {
  if (!series || series.length < 2) return { vol: null, max_dd: null, ret_per_risk: null };

  const byMonth = new Map();
  for (const p of series) {
    const d = new Date(p.t);
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    byMonth.set(key, p); // later points overwrite earlier ones within the same month -> last wins
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

  // Ret/Risk uses since-inception CAGR over annualized volatility — a
  // Sharpe-like "return per unit of volatility" figure. This is a disclosed,
  // reasonable stand-in for SIFs specifically (MF's own precomputed
  // ret_per_risk is built by a separate server-side pipeline this feature
  // has no visibility into) — not a claim the two formulas are identical.
  const inception = deriveReturnsFromSeries(series, series[series.length - 1].t).ret_inception;
  const ret_per_risk = (inception != null && vol) ? +(inception / vol).toFixed(2) : null;

  return { vol, max_dd, ret_per_risk };
}

// Merges derived stats onto a normalized SIF fund once its NAV series has
// resolved. No-op for MF funds (their fields are already populated from
// normalizeFund above).
export function applyDerivedStats(normalized, series, asOfMs = Date.now()) {
  if (normalized.type !== 'sif' || !series) return normalized;
  return { ...normalized, ...deriveReturnsFromSeries(series, asOfMs), ...deriveRiskFromSeries(series) };
}

// ── Category peer-rank (MF only) ────────────────────────────────────────────
// Ranks one MF fund within its own category by a chosen return period,
// using the already-loaded `allMfFunds` array (the screener's own `funds`
// state) — a pure client-side computation, no new fetch.
//
// SIF peer-rank is explicitly OUT OF SCOPE for this plan: it would require
// fetching + deriving returns for every OTHER SIF in the same category
// (not just the funds being compared), which is materially more fetching
// than this feature otherwise needs, for a ranking that isn't very
// meaningful yet given how few SIFs exist per category today. Returns null
// for SIF funds — rendered as "—", identically to any other unavailable stat.
export function categoryPeerRank(normalizedFund, allMfFunds, periodKey = 'ret_3y') {
  if (normalizedFund.type !== 'mf') return null;
  const peers = allMfFunds.filter((f) => f.category === normalizedFund.category && f[periodKey] != null);
  if (peers.length < 2) return null;
  const sorted = [...peers].sort((a, b) => b[periodKey] - a[periodKey]);
  const rank = sorted.findIndex((f) => f.code === normalizedFund.navFetchKey) + 1;
  return rank > 0 ? { rank, of: sorted.length } : null;
}

// Longest-duration-first list of periods peer-rank will try. 3Y is the
// preferred default; if any MF fund actually being compared lacks it, this
// falls back to the next-shorter period that EVERY compared MF fund has,
// so the peer-rank row shows one consistent period across all of them
// instead of "#3 of 47 (3Y)" for one fund and "—" for another.
const RANK_PERIOD_FALLBACK = [
  { key: 'ret_3y', label: '3Y' },
  { key: 'ret_1y', label: '1Y' },
  { key: 'ret_6m', label: '6M' },
  { key: 'ret_3m', label: '3M' },
  { key: 'ret_1m', label: '1M' },
];

// Picks the longest period common to every MF fund in the comparison set
// (SIFs are excluded — peer-rank is MF-only). Returns null if there are no
// MF funds being compared, or none of the fallback periods is available
// for all of them — callers should hide the whole peer-rank row in that case.
export function pickCommonRankPeriod(normalizedFunds) {
  const mfFunds = normalizedFunds.filter((f) => f.type === 'mf');
  if (!mfFunds.length) return null;
  for (const period of RANK_PERIOD_FALLBACK) {
    if (mfFunds.every((f) => f[period.key] != null)) return period;
  }
  return null;
}

// ── Weighted verdict scoring ────────────────────────────────────────────────
// Same weighting philosophy as PMS comparison: longer, more established
// return horizons count more; each fund's score only averages over the
// periods/metrics it actually has data for, so a newer fund (a young SIF,
// or an MF missing 10Y) isn't penalized for not existing that long.

const PERIOD_WEIGHTS = {
  ret_1m: 0.5, ret_3m: 0.75, ret_6m: 1, ret_1y: 1.5,
  ret_3y: 2.5, ret_5y: 3, ret_7y: 3.5, ret_10y: 4, ret_inception: 2,
};
const RISK_WEIGHT = 2; // ret_per_risk contributes like a mid-length return period

// Assigns each participant a weighted share of `weight`, tie-aware: funds
// tied on the same value get the SAME share (the average of the rank
// positions their tied group spans), not whichever share their array
// position happens to land on — `.sort()` is stable, so without this,
// identical values would silently score differently by input order alone.
function assignRankShares(participants, weight, totals, weightSums) {
  const ranked = [...participants].sort((a, b) => b.v - a.v);
  const m = ranked.length;
  let idx = 0;
  while (idx < m) {
    let end = idx;
    while (end < m && ranked[end].v === ranked[idx].v) end++;
    let shareSum = 0;
    for (let k = idx; k < end; k++) shareSum += (m - k) / m;
    const avgShare = shareSum / (end - idx);
    for (let k = idx; k < end; k++) {
      totals[ranked[k].i] += weight * avgShare;
      weightSums[ranked[k].i] += weight;
    }
    idx = end;
  }
}

export function computeVerdictScores(normalizedFunds) {
  const n = normalizedFunds.length;
  const totals = Array(n).fill(0);
  const weightSums = Array(n).fill(0);

  for (const key of Object.keys(PERIOD_WEIGHTS)) {
    const weight = PERIOD_WEIGHTS[key];
    const participants = normalizedFunds
      .map((f, i) => ({ i, v: f[key] }))
      .filter((p) => p.v != null);
    if (participants.length < 2) continue;
    assignRankShares(participants, weight, totals, weightSums);
  }

  const riskParticipants = normalizedFunds
    .map((f, i) => ({ i, v: f.ret_per_risk }))
    .filter((p) => p.v != null);
  if (riskParticipants.length >= 2) {
    assignRankShares(riskParticipants, RISK_WEIGHT, totals, weightSums);
  }

  return totals.map((t, i) => (weightSums[i] > 0 ? t / weightSums[i] : 0));
}

// Detects a genuine tie among the top-scoring funds (within a small
// floating-point tolerance, not exact `===`, to avoid false negatives from
// harmless floating-point noise) instead of silently picking whichever
// tied fund happens to be first in `normalizedFunds` — array order can
// change across sessions (adding/re-adding a fund appends it to the end),
// so an exact tie must never depend on input order.
export function overallWinner(normalizedFunds, scores) {
  if (!scores.length) return null;
  const maxScore = Math.max(...scores);
  const EPSILON = 1e-9;
  const tiedIndices = scores.map((s, i) => ({ s, i })).filter(({ s }) => Math.abs(s - maxScore) < EPSILON).map(({ i }) => i);
  if (tiedIndices.length > 1) {
    return { idx: null, tie: true, tiedIndices, score: maxScore, funds: tiedIndices.map((i) => normalizedFunds[i]) };
  }
  const idx = tiedIndices[0];
  return { idx, tie: false, score: maxScore, fund: normalizedFunds[idx] };
}

// Raw "best in N metrics" count for the per-fund header badge.
export function winCounts(normalizedFunds) {
  const n = normalizedFunds.length;
  const counts = Array(n).fill(0);
  const keys = [...Object.keys(PERIOD_WEIGHTS), 'ret_per_risk'];
  for (const key of keys) {
    const vals = normalizedFunds.map((f) => f[key]);
    const valid = vals.filter((v) => v != null);
    if (valid.length < 2) continue;
    const best = Math.max(...valid);
    vals.forEach((v, i) => { if (v === best) counts[i]++; });
  }
  return counts;
}
