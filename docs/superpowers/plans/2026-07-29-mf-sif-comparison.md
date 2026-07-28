# MF/SIF Fund Comparison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mixable MF+SIF fund comparison feature to the MF Screener (`app/screener/page.js`), modeled on the existing PMS comparison feature, with richer sections (risk metrics, real SIP wealth simulation, category peer-rank, an interactive drag-select chart) than PMS has.

**Architecture:** A pure-logic module (`app/screener/compareEngine.js`) handles NAV fetching/parsing, wealth simulation math, MF/SIF normalization, and verdict scoring — no React, fully testable via standalone Node scripts. A new self-contained chart component (`app/screener/CompareGrowthChart.jsx`) handles the interactive hover/drag-select visualization. `app/screener/MFCompare.jsx` holds the `MFCompareBar` and `MFCompareModal` React components, consuming both of the above. `app/screener/page.js` gets minimal additions: shared `compareList` state, checkbox columns on both tables, and rendering the bar/modal.

**Tech Stack:** Same file conventions as the rest of the repo — plain React (`useState`/`useMemo`/`useRef`), inline/CSS-file styling with existing `var(--...)` design tokens, no new dependencies. Reuses `lib/xirr.js`'s shared `xirr()` solver.

## Global Constraints

- No AUM section — this app has no AUM data source for MF or SIF (unlike PMS's APMI data).
- SIP wealth simulation must use REAL historical NAV data via `xirr()` (never a CAGR-based formula approximation) — SIP returns are sequence-dependent.
- Do not modify `app/backtest/page.js` — its `xirr`/`sipDates`/`fwd`/`asof` logic stays untouched; this feature writes its own comparison-scoped equivalents (`lib/xirr.js`'s shared `xirr()` plus fresh SIP-date generation in `compareEngine.js`).
- SIF entries start with `null` return/risk fields and get them filled in once that fund's NAV history resolves — a still-loading or failed SIF fetch renders as "—" for that fund only, never blocks other funds or breaks the modal (same resilience pattern as PMS's per-fund `.catch(() => null)`).
- Category peer-rank is computed for **MF funds only** in this plan — see Task 2 for why SIF peer-rank is out of scope (a documented, deliberate v1 limitation, not an oversight).
- Max 3 funds in a comparison, mixed MF+SIF, `compareList` persists across the MF/SIF tab switch.
- Chart interaction (hover crosshair, click-drag range select with live start/end date pills, on-chart + below-chart summary persisting until tapped elsewhere, `touch-action: pan-y` for mobile) was prototyped and approved live during brainstorming — Task 4 implements exactly that behavior.

---

### Task 1: `compareEngine.js` — NAV fetching and wealth simulation

**Files:**
- Create: `app/screener/compareEngine.js`

**Interfaces:**
- Consumes: `xirr` from `@/lib/xirr` (already exists, exported).
- Produces: `normalizeMfSeries(apiData)`, `normalizeSifSeries(apiData)`, `fetchNavSeries(fund)` (where `fund` has `.type` and `.navFetchKey`), `seriesForward(series, targetMs)`, `seriesAsOf(series, targetMs)`, `lumpsumWealth(annualCagrPct, years, principal?)`, `sipWealth(series, endMs, years, monthly?)`, `computeWealthSimulation(fund, navSeries, asOfMs?)`. All consumed by Tasks 2, 9, and 10.

- [ ] **Step 1: Create the file with NAV parsing/fetching and the wealth-simulation functions**

```js
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
const YEAR_MS = 365 * DAY_MS;

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
      const from = new Date(to.getTime() - 365 * DAY_MS);
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
    if (t >= startMs && t <= end) dates.push(t);
    if (t > end) break;
    cursor = new Date(Date.UTC(y, m + 1, 1));
  }
  if (!dates.length) return null;

  let units = 0, invested = 0;
  const flows = [];
  for (const t of dates) {
    const px = seriesForward(series, t);
    if (!px) continue; // fund didn't exist yet this far back — skip, don't fabricate
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
    const sip = navSeries ? sipWealth(navSeries, asOfMs, years) : null;
    return { label, years, lumpsum, sip };
  });
}
```

- [ ] **Step 2: Verify with a standalone script**

Create `.superpowers/verify/compare-engine-wealth.mjs`:

```js
// (paste normalizeMfSeries, normalizeSifSeries, seriesForward, seriesAsOf,
// lumpsumWealth, sipWealth verbatim from Step 1 — but replace the
// `import { xirr } from '@/lib/xirr';` line with the xirr function's actual
// body copied from lib/xirr.js, since this script runs standalone with
// plain Node and can't resolve the '@/...' alias.)

function assertClose(actual, expected, label, tol = 0.5) {
  if (actual == null || Math.abs(actual - expected) > tol) {
    console.error(`FAIL: ${label} — expected ~${expected}, got ${actual}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${label}`);
  }
}

// 1. Lumpsum: ₹1L at 12% CAGR for 3 years -> 100000 * 1.12^3
{
  const r = lumpsumWealth(12, 3);
  assertClose(r.value, 100000 * Math.pow(1.12, 3), 'lumpsum 12% x 3y value', 1);
}

// 2. Lumpsum: null CAGR -> null result
{
  const r = lumpsumWealth(null, 3);
  if (r !== null) { console.error('FAIL: lumpsum with null CAGR should be null'); process.exitCode = 1; }
  else console.log('PASS: lumpsum with null CAGR is null');
}

// 3. SIP: a flat-NAV series (no growth) for 1 year of ₹10k/month should
// return ~invested amount (no gain, no loss) — a strong sanity check that
// unit accounting is correct even before checking against real growth.
{
  const end = Date.UTC(2025, 0, 15);
  const series = [];
  for (let m = -14; m <= 0; m++) {
    const d = new Date(end); d.setUTCMonth(d.getUTCMonth() + m);
    series.push({ t: d.getTime(), nav: 100 }); // flat NAV
  }
  const r = sipWealth(series, end, 1, 10000);
  assertClose(r.invested, 120000, 'SIP 1y flat-NAV invested total', 1);
  assertClose(r.value, 120000, 'SIP 1y flat-NAV final value (no growth)', 1);
  assertClose(r.xirr * 100, 0, 'SIP 1y flat-NAV XIRR ~0%', 1);
}

// 4. SIP: series too short for the requested period -> some months skipped,
// but still returns a result from however many purchases DID have data
// (never fabricates a purchase before the series starts).
{
  const end = Date.UTC(2025, 0, 15);
  const series = [
    { t: Date.UTC(2024, 9, 1), nav: 100 },  // fund only exists from Oct 2024
    { t: Date.UTC(2024, 11, 1), nav: 105 },
    { t: end, nav: 110 },
  ];
  const r = sipWealth(series, end, 1, 10000); // asks for 1 year, but fund is only ~3.5mo old
  if (r == null) { console.error('FAIL: SIP with partial history should still return a result'); process.exitCode = 1; }
  else console.log('PASS: SIP with partial history returns a result from available months, invested=' + r.invested);
}

console.log('Wealth simulation scenarios checked.');
```

Run: `node .superpowers/verify/compare-engine-wealth.mjs`
Expected: every line `PASS:`, exit code 0.

- [ ] **Step 3: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add app/screener/compareEngine.js
git commit -m "feat(screener): add NAV fetching and wealth-simulation engine for comparison"
```

---

### Task 2: `compareEngine.js` — fund normalization, SIF-derived stats, category peer-rank

**Files:**
- Modify: `app/screener/compareEngine.js` (append)

**Interfaces:**
- Consumes: `seriesAsOf`, `seriesForward` from Task 1.
- Produces: `normalizeFund(entry)`, `deriveReturnsFromSeries(series, asOfMs)`, `deriveRiskFromSeries(series)`, `applyDerivedStats(normalized, series, asOfMs?)`, `categoryPeerRank(normalizedFund, allMfFunds)`. Consumed by Tasks 6-8.

- [ ] **Step 1: Append the normalization, derived-stats, and peer-rank functions**

```js
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
  out.ret_inception = first.nav > 0
    ? +((Math.pow(latest.nav / first.nav, 1 / Math.max((latest.t - first.t) / YEAR_MS_2, 1 / 365)) - 1) * 100).toFixed(2)
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
// Ranks one MF fund within its own category by 3Y return, using the
// already-loaded `allMfFunds` array (the screener's own `funds` state) — a
// pure client-side computation, no new fetch.
//
// SIF peer-rank is explicitly OUT OF SCOPE for this plan: it would require
// fetching + deriving 3Y returns for every OTHER SIF in the same category
// (not just the funds being compared), which is materially more fetching
// than this feature otherwise needs, for a ranking that isn't very
// meaningful yet given how few SIFs exist per category today. Returns null
// for SIF funds — rendered as "—", identically to any other unavailable stat.
export function categoryPeerRank(normalizedFund, allMfFunds) {
  if (normalizedFund.type !== 'mf') return null;
  const peers = allMfFunds.filter((f) => f.category === normalizedFund.category && f.ret_3y != null);
  if (peers.length < 2) return null;
  const sorted = [...peers].sort((a, b) => b.ret_3y - a.ret_3y);
  const rank = sorted.findIndex((f) => f.code === normalizedFund.navFetchKey) + 1;
  return rank > 0 ? { rank, of: sorted.length } : null;
}
```

- [ ] **Step 2: Verify with a standalone script**

Create `.superpowers/verify/compare-engine-normalize.mjs`:

```js
// (paste seriesForward, seriesAsOf from Task 1, and normalizeFund,
// deriveReturnsFromSeries, deriveRiskFromSeries, categoryPeerRank verbatim
// from Step 1 above)

function assertEqual(actual, expected, label) {
  if (actual !== expected) { console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`); process.exitCode = 1; }
  else console.log(`PASS: ${label}`);
}
function assertClose(actual, expected, label, tol = 0.5) {
  if (actual == null || Math.abs(actual - expected) > tol) { console.error(`FAIL: ${label} — expected ~${expected}, got ${actual}`); process.exitCode = 1; }
  else console.log(`PASS: ${label}`);
}

// 1. normalizeFund — MF path
{
  const mf = { type: 'mf', code: 'ABC', name: 'Test Fund', amc: 'Test AMC', category: 'Equity Scheme - Flexi Cap Fund', ret_1y: 12.5, ret_3y: 15, vol: 18, max_dd: -20, ret_per_risk: 0.8 };
  const n = normalizeFund(mf);
  assertEqual(n.id, 'mf-ABC', 'normalizeFund MF id');
  assertEqual(n.navFetchKey, 'ABC', 'normalizeFund MF navFetchKey');
  assertEqual(n.ret_1y, 12.5, 'normalizeFund MF ret_1y passthrough');
}

// 2. normalizeFund — SIF path, all return/risk fields start null
{
  const sif = { type: 'sif', scheme_id: 'SIF-1', nav_name: 'Test SIF', sif_name: 'Test House', category: 'Equity Long-Short' };
  const n = normalizeFund(sif);
  assertEqual(n.id, 'sif-SIF-1', 'normalizeFund SIF id');
  assertEqual(n.ret_1y, null, 'normalizeFund SIF ret_1y starts null');
  assertEqual(n.vol, null, 'normalizeFund SIF vol starts null');
}

// 3. deriveReturnsFromSeries — a fund up 10% over the last 6 months, up
// (1.10^2 - 1) ~= 21% annualized over 1 year (constant monthly growth)
{
  const asOf = Date.UTC(2025, 0, 1);
  const series = [];
  for (let m = 12; m >= 0; m--) {
    const d = new Date(asOf); d.setUTCMonth(d.getUTCMonth() - m);
    const growth = Math.pow(1.10, (12 - m) / 6); // doubles the 10%-per-6mo pattern
    series.push({ t: d.getTime(), nav: 100 * growth });
  }
  const r = deriveReturnsFromSeries(series, asOf);
  assertClose(r.ret_6m, 10, 'derived ret_6m ~10% (sub-year = absolute change)', 1);
  if (r.ret_1y == null) { console.error('FAIL: ret_1y should be computable with 1y of history'); process.exitCode = 1; }
  else console.log('PASS: ret_1y computed:', r.ret_1y);
}

// 4. deriveRiskFromSeries — flat series has ~0 volatility and 0 drawdown
{
  const series = [];
  for (let m = 0; m < 12; m++) series.push({ t: Date.UTC(2024, m, 1), nav: 100 });
  const r = deriveRiskFromSeries(series);
  assertClose(r.vol, 0, 'flat series volatility ~0', 0.5);
  assertEqual(r.max_dd, 0, 'flat series max drawdown is 0');
}

// 5. categoryPeerRank — MF fund ranked correctly among 3 peers
{
  const target = { type: 'mf', navFetchKey: 'B', category: 'Cat1' };
  const allMf = [
    { code: 'A', category: 'Cat1', ret_3y: 20 },
    { code: 'B', category: 'Cat1', ret_3y: 15 },
    { code: 'C', category: 'Cat1', ret_3y: 10 },
    { code: 'D', category: 'OtherCat', ret_3y: 99 }, // different category, must not count
  ];
  const rank = categoryPeerRank(target, allMf);
  assertEqual(rank.rank, 2, 'categoryPeerRank MF fund B ranks #2 of 3 (D excluded, different category)');
  assertEqual(rank.of, 3, 'categoryPeerRank pool size excludes other categories');
}

// 6. categoryPeerRank — SIF always returns null (out of scope, documented)
{
  const target = { type: 'sif', navFetchKey: 'X', category: 'Anything' };
  const rank = categoryPeerRank(target, []);
  if (rank !== null) { console.error('FAIL: SIF peer-rank should be null'); process.exitCode = 1; }
  else console.log('PASS: SIF peer-rank is null (out of scope for v1)');
}

console.log('Normalization/derived-stats/peer-rank scenarios checked.');
```

Run: `node .superpowers/verify/compare-engine-normalize.mjs`
Expected: every line `PASS:`, exit code 0.

- [ ] **Step 3: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add app/screener/compareEngine.js
git commit -m "feat(screener): add fund normalization, SIF-derived stats, and category peer-rank"
```

---

### Task 3: `compareEngine.js` — weighted verdict scoring

**Files:**
- Modify: `app/screener/compareEngine.js` (append)

**Interfaces:**
- Consumes: nothing new (operates on already-normalized fund objects from Task 2).
- Produces: `computeVerdictScores(normalizedFunds)`, `overallWinner(normalizedFunds, scores)`, `winCounts(normalizedFunds)`. Consumed by Task 11.

- [ ] **Step 1: Append the verdict-scoring functions**

```js
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
    const ranked = [...participants].sort((a, b) => b.v - a.v);
    const m = ranked.length;
    ranked.forEach((p, rankIdx) => {
      const share = (m - rankIdx) / m; // 1st place = full weight, last place = weight/m
      totals[p.i] += weight * share;
      weightSums[p.i] += weight;
    });
  }

  const riskParticipants = normalizedFunds
    .map((f, i) => ({ i, v: f.ret_per_risk }))
    .filter((p) => p.v != null);
  if (riskParticipants.length >= 2) {
    const ranked = [...riskParticipants].sort((a, b) => b.v - a.v);
    const m = ranked.length;
    ranked.forEach((p, rankIdx) => {
      const share = (m - rankIdx) / m;
      totals[p.i] += RISK_WEIGHT * share;
      weightSums[p.i] += RISK_WEIGHT;
    });
  }

  return totals.map((t, i) => (weightSums[i] > 0 ? t / weightSums[i] : 0));
}

export function overallWinner(normalizedFunds, scores) {
  if (!scores.length) return null;
  const maxScore = Math.max(...scores);
  const idx = scores.indexOf(maxScore);
  return { idx, score: maxScore, fund: normalizedFunds[idx] };
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
```

- [ ] **Step 2: Verify with a standalone script**

Create `.superpowers/verify/compare-engine-verdict.mjs`:

```js
// (paste computeVerdictScores, overallWinner, winCounts verbatim from Step 1)

function assertEqual(actual, expected, label) {
  if (actual !== expected) { console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`); process.exitCode = 1; }
  else console.log(`PASS: ${label}`);
}

// Fund A wins every period outright -> should be the overall winner with
// the max possible score (1.0, since it's rank-1-of-2 = full share on every
// weighted period it participates in).
const funds = [
  { ret_1y: 20, ret_3y: 18, ret_5y: null, ret_per_risk: 1.2 }, // Fund A: wins everything it has data for
  { ret_1y: 10, ret_3y: 12, ret_5y: 15, ret_per_risk: 0.8 },   // Fund B: has 5Y data A lacks, but loses where both compete
];

const scores = computeVerdictScores(funds);
const winner = overallWinner(funds, scores);
assertEqual(winner.idx, 0, 'Fund A (wins every shared period) is the overall winner');

const counts = winCounts(funds);
assertEqual(counts[0], 3, 'Fund A wins 3 metrics (ret_1y, ret_3y, ret_per_risk)');
assertEqual(counts[1], 0, 'Fund B wins 0 metrics (only has an uncontested 5Y, not counted as a "win" over anyone)');

console.log('Verdict scoring scenarios checked.');
```

Run: `node .superpowers/verify/compare-engine-verdict.mjs`
Expected: every line `PASS:`, exit code 0.

- [ ] **Step 3: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add app/screener/compareEngine.js
git commit -m "feat(screener): add weighted verdict scoring for comparison"
```

---

### Task 4: `CompareGrowthChart.jsx` — interactive chart component

**Files:**
- Create: `app/screener/CompareGrowthChart.jsx`

**Interfaces:**
- Consumes: nothing from earlier tasks (a self-contained, presentation-only component).
- Produces: `<CompareGrowthChart series={[{ name, color, data: [{t, v}] }]} />` (default export). Consumed by Task 10.

- [ ] **Step 1: Create the component**

```jsx
'use client';
// app/screener/CompareGrowthChart.jsx
//
// Interactive multi-line growth chart for the fund comparison modal.
// Hover shows a crosshair + tooltip; click-and-drag selects a date range,
// showing live start/end date labels while dragging, and — once released —
// each series' % change over that exact window, both in a floating on-chart
// panel and a panel below the chart. The shaded selection and both summary
// panels persist until the user taps/clicks elsewhere on the chart. Touch-
// friendly: touch-action:pan-y lets normal vertical page scroll work while
// a horizontal drag is captured here for range selection.
//
// This exact interaction was prototyped and approved live during
// brainstorming — see docs/superpowers/specs/2026-07-29-mf-sif-comparison-design.md.
import { useRef, useState, useMemo } from 'react';

const W = 760, H = 260, PAD_L = 44, PAD_R = 12, PAD_T = 10, PAD_B = 26;

function fmtDate(t) {
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateShort(t) {
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function fmtVal(v) {
  return '₹' + Math.round(v).toLocaleString('en-IN');
}
function pctChange(a, b) {
  return (((b - a) / a) * 100).toFixed(1);
}

/**
 * @param {Array<{ name: string, color: string, data: Array<{t:number, v:number}> }>} series
 *   All series must share the same length/x-axis (the caller aligns them —
 *   see Task 10 for how the modal builds this array).
 */
export default function CompareGrowthChart({ series }) {
  const svgRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  const [dragState, setDragState] = useState(null); // { startIdx, curIdx } while actively dragging
  const [selection, setSelection] = useState(null); // { lo, hi } once a range is committed
  const dragRef = useRef({ dragging: false, startIdx: null, moved: false });

  const n = series[0]?.data.length || 0;
  const { vMin, vMax } = useMemo(() => {
    const all = series.flatMap((s) => s.data.map((p) => p.v));
    return { vMin: Math.min(...all), vMax: Math.max(...all) };
  }, [series]);

  if (n < 2) return null;

  const iw = W - PAD_L - PAD_R, ih = H - PAD_T - PAD_B;
  const X = (i) => PAD_L + (i / (n - 1)) * iw;
  const Y = (v) => PAD_T + (1 - (v - vMin) / (vMax - vMin || 1)) * ih;
  const pathFor = (s) => s.data.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');

  function clientXFromEvent(e) {
    if (e.touches && e.touches.length) return e.touches[0].clientX;
    if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientX;
    return e.clientX;
  }
  function idxFromEvent(e) {
    const r = svgRef.current.getBoundingClientRect();
    const cx = ((clientXFromEvent(e) - r.left) / r.width) * W;
    const i = Math.round(((cx - PAD_L) / iw) * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
  }

  function onDown(e) {
    dragRef.current = { dragging: true, startIdx: idxFromEvent(e), moved: false };
  }
  function onMove(e) {
    const d = dragRef.current;
    if (!d.dragging) {
      if (!selection) setHoverIdx(idxFromEvent(e));
      return;
    }
    const i = idxFromEvent(e);
    if (i !== d.startIdx) d.moved = true;
    if (d.moved) {
      if (e.cancelable) e.preventDefault();
      setHoverIdx(null);
      setDragState({ startIdx: d.startIdx, curIdx: i });
    }
  }
  function onUp(e) {
    const d = dragRef.current;
    if (d.dragging) {
      const endIdx = idxFromEvent(e);
      if (d.moved && Math.abs(endIdx - d.startIdx) > 2) {
        setSelection({ lo: Math.min(d.startIdx, endIdx), hi: Math.max(d.startIdx, endIdx) });
      } else if (!d.moved) {
        setSelection(null);
      }
    }
    dragRef.current = { dragging: false, startIdx: null, moved: false };
    setDragState(null);
  }
  function onLeave() {
    if (!dragRef.current.dragging) setHoverIdx(null);
  }

  const rangeRows = selection
    ? series.map((s) => {
        const pct = pctChange(s.data[selection.lo].v, s.data[selection.hi].v);
        return { name: s.name, color: s.color, pct, pos: +pct >= 0 };
      })
    : null;

  return (
    <div className="cmp-chart-wrap">
      <div className="cmp-chart-legend">
        {series.map((s) => (
          <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          className="cmp-chart-svg"
          viewBox={`0 0 ${W} ${H}`}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onLeave}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        >
          {[0, 1, 2, 3, 4].map((g) => {
            const v = vMin + (vMax - vMin) * (g / 4);
            return (
              <g key={g}>
                <line x1={PAD_L} y1={Y(v)} x2={W - PAD_R} y2={Y(v)} stroke="var(--border)" strokeWidth="0.6" />
                <text x={2} y={Y(v) + 3} fontSize="8" fill="var(--muted)" fontFamily="monospace">{(v / 1000).toFixed(0)}k</text>
              </g>
            );
          })}
          {series.map((s) => <path key={s.name} d={pathFor(s)} fill="none" stroke={s.color} strokeWidth="2" />)}

          {(selection || dragState) && (() => {
            const lo = selection ? selection.lo : Math.min(dragState.startIdx, dragState.curIdx);
            const hi = selection ? selection.hi : Math.max(dragState.startIdx, dragState.curIdx);
            return <rect x={X(lo)} y={PAD_T} width={Math.max(1, X(hi) - X(lo))} height={ih}
              fill="var(--g1)" opacity="0.1" stroke="var(--g1)" strokeWidth="1" strokeDasharray="4 3" />;
          })()}

          {selection && series.map((s) => (
            <circle key={s.name} cx={X(selection.hi)} cy={Y(s.data[selection.hi].v)} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
          ))}

          {hoverIdx != null && !dragState && !selection && (
            <g>
              <line x1={X(hoverIdx)} y1={PAD_T} x2={X(hoverIdx)} y2={H - PAD_B} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" />
              {series.map((s) => <circle key={s.name} cx={X(hoverIdx)} cy={Y(s.data[hoverIdx].v)} r="3.5" fill={s.color} />)}
            </g>
          )}
        </svg>

        {hoverIdx != null && !dragState && !selection && (
          <div className="cmp-tip" style={{ left: X(hoverIdx) / W > 0.6 ? `calc(${(X(hoverIdx) / W) * 100}% - 190px)` : `calc(${(X(hoverIdx) / W) * 100}% + 14px)` }}>
            <div style={{ marginBottom: 4, opacity: 0.7 }}>{fmtDate(series[0].data[hoverIdx].t)}</div>
            {series.map((s) => (
              <div key={s.name} className="cmp-tip-row"><span>{s.name}</span><b style={{ color: s.color }}>{fmtVal(s.data[hoverIdx].v)}</b></div>
            ))}
          </div>
        )}

        {dragState && (
          <>
            <div className="cmp-drag-date start" style={{ left: `${(X(dragState.startIdx) / W) * 100}%` }}>
              {fmtDateShort(series[0].data[dragState.startIdx].t)}
            </div>
            <div className="cmp-drag-date end" style={{
              left: `${(X(dragState.curIdx) / W) * 100}%`,
              top: Math.abs(X(dragState.curIdx) - X(dragState.startIdx)) < 70 ? 18 : -2,
            }}>
              {fmtDateShort(series[0].data[dragState.curIdx].t)}
            </div>
          </>
        )}

        {selection && rangeRows && (
          <div className="cmp-onchart-summary show" style={{ left: `${((X(selection.lo) + X(selection.hi)) / 2 / W) * 100}%`, transform: 'translateX(-50%)' }}>
            <div style={{ marginBottom: 3, opacity: 0.6, fontSize: 9 }}>{fmtDate(series[0].data[selection.lo].t)} → {fmtDate(series[0].data[selection.hi].t)}</div>
            {rangeRows.map((r) => (
              <div key={r.name} className="cmp-onchart-row"><span>{r.name}</span><b style={{ color: r.color }}>{r.pos ? '+' : ''}{r.pct}%</b></div>
            ))}
          </div>
        )}
      </div>
      <div className="cmp-hint">Drag left→right to select a range · tap anywhere to clear</div>
      {selection && rangeRows && (
        <div className="cmp-range-summary show">
          <div className="cmp-range-summary-h">
            <span>{fmtDate(series[0].data[selection.lo].t)} → {fmtDate(series[0].data[selection.hi].t)}</span>
            <span className="cmp-range-clear" onClick={() => setSelection(null)}>✕ Clear</span>
          </div>
          {rangeRows.map((r) => (
            <div key={r.name} className="cmp-range-row"><span>{r.name}</span><span style={{ color: r.pos ? 'var(--g1)' : 'var(--neg)' }}>{r.pos ? '+' : ''}{r.pct}%</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Run the project build**

Run: `npm run build`
Expected: build completes with no errors (the component isn't rendered anywhere yet — this just confirms it compiles cleanly; Task 10 wires it in).

- [ ] **Step 3: Commit**

```bash
git add app/screener/CompareGrowthChart.jsx
git commit -m "feat(screener): add interactive growth chart component (hover + drag-select range)"
```

---

### Task 5: `mf-compare.css` — comparison styles

**Files:**
- Create: `app/screener/mf-compare.css`

**Interfaces:**
- Produces: CSS classes consumed by Tasks 6-11 (`.cmp-bar*`, `.cmp-chip*`, `.cmp-modal*`, `.cmp-grid`, `.cmp-cell`, `.cmp-section-head`, `.cmp-strat-*`, `.cmp-ret*`, `.cmp-win-badge`, `.cmp-wealth-*`, `.cmp-verdict*`, `.cmp-remove-btn`, `.cmp-disclaimer`, `.cmp-peer-rank`, plus the chart classes from Task 4: `.cmp-chart-wrap`, `.cmp-chart-legend`, `.cmp-chart-svg`, `.cmp-tip*`, `.cmp-onchart-summary*`, `.cmp-drag-date*`, `.cmp-range-summary*`, `.cmp-hint`).

- [ ] **Step 1: Create the file**

This is adapted from `app/pms-screener/pms-compare.css` (same bar/modal/grid/verdict structure, proven and already responsive) with AUM-specific and APMI-quartile-specific rules removed, and the new chart classes (from the approved prototype) added.

```css
/* ══════════════════════════════════════════════════════════
   mf-compare.css — MF/SIF Side-by-side Comparison Module
   Part of the Abundance MF Screener
   Adapted from app/pms-screener/pms-compare.css
   ══════════════════════════════════════════════════════════ */

/* ── Checkbox on each row ──────────────────────────────── */
.cmp-chk {
  width: 16px;
  height: 16px;
  accent-color: var(--g2);
  cursor: pointer;
  flex-shrink: 0;
}

/* ── Floating Compare Bar ──────────────────────────────── */
.cmp-bar {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%) translateY(100px);
  background: var(--g1);
  border: 1.5px solid var(--g3);
  border-radius: 50px;
  padding: 10px 22px;
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 12px 40px rgba(27, 94, 32, 0.5);
  z-index: 10000;
  opacity: 0;
  transition: transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s;
  pointer-events: none;
  white-space: nowrap;
}
.cmp-bar.visible {
  transform: translateX(-50%) translateY(0);
  opacity: 1;
  pointer-events: auto;
}
.cmp-bar-chips { display: flex; gap: 8px; align-items: center; }
.cmp-chip {
  display: flex; align-items: center; gap: 6px;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.25);
  border-radius: 20px; padding: 4px 10px;
  font-size: .68rem; font-weight: 700; color: white;
  font-family: 'Raleway', sans-serif;
  max-width: 160px; overflow: hidden; text-overflow: ellipsis;
}
.cmp-chip-type {
  font-size: .55rem; font-weight: 800; opacity: 0.7; text-transform: uppercase;
}
.cmp-chip-x { cursor: pointer; opacity: 0.7; font-size: .8rem; line-height: 1; transition: opacity 0.15s; flex-shrink: 0; }
.cmp-chip-x:hover { opacity: 1; }
.cmp-bar-label {
  font-size: .65rem; color: rgba(255,255,255,0.6);
  font-family: 'JetBrains Mono', monospace;
  border-left: 1px solid rgba(255,255,255,0.2); padding-left: 14px;
}
.cmp-go-btn {
  background: white; color: var(--g1); border: none; border-radius: 30px;
  padding: 7px 20px; font-size: .75rem; font-weight: 800;
  font-family: 'Raleway', sans-serif; cursor: pointer; transition: box-shadow 0.2s;
}
.cmp-go-btn:hover { box-shadow: 0 4px 16px rgba(255,255,255,0.3); }
.cmp-clear-btn {
  background: transparent; border: 1px solid rgba(255,255,255,0.3); border-radius: 30px;
  padding: 6px 14px; font-size: .7rem; color: rgba(255,255,255,0.7);
  cursor: pointer; font-family: 'Raleway', sans-serif; transition: 0.15s;
}
.cmp-clear-btn:hover { border-color: rgba(255,255,255,0.6); color: white; }

/* ── Comparison Modal Overlay ──────────────────────────── */
.cmp-overlay {
  position: fixed; inset: 0; background: rgba(6, 14, 6, 0.85); backdrop-filter: blur(6px);
  z-index: 10000; opacity: 0; pointer-events: none; transition: opacity 0.3s;
}
.cmp-overlay.open { opacity: 1; pointer-events: auto; }

/* ── Comparison Modal ──────────────────────────────────── */
.cmp-modal {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  z-index: 10001; pointer-events: none; opacity: 0; transition: opacity 0.3s;
}
.cmp-modal.open { opacity: 1; pointer-events: auto; }
.cmp-modal-inner {
  background: var(--surface); border: 1.5px solid var(--border2); border-radius: 18px;
  max-width: 1100px; width: calc(100vw - 40px); max-height: calc(100vh - 60px);
  overflow-y: auto; box-shadow: 0 30px 80px rgba(0,0,0,0.6);
  animation: cmpSlideIn 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes cmpSlideIn {
  from { transform: scale(0.92) translateY(30px); opacity: 0; }
  to   { transform: scale(1) translateY(0); opacity: 1; }
}
.cmp-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 28px 16px; border-bottom: 1px solid var(--border);
  position: sticky; top: 0; background: var(--surface); z-index: 5;
}
.cmp-modal-title { font-size: 1rem; font-weight: 800; color: var(--g1); font-family: 'Raleway', sans-serif; }
.cmp-modal-sub { font-size: .68rem; color: var(--muted); font-family: 'JetBrains Mono', monospace; margin-top: 2px; }
.cmp-modal-close {
  background: var(--s2); border: 1.5px solid var(--border); border-radius: 50%;
  width: 34px; height: 34px; font-size: 1.2rem; cursor: pointer; color: var(--muted);
  display: flex; align-items: center; justify-content: center; transition: 0.15s;
}
.cmp-modal-close:hover { border-color: var(--g3); color: var(--g1); background: var(--g-xlight); }

/* Column grid: sticky name col + N data cols */
.cmp-grid { display: grid; grid-template-columns: 200px repeat(var(--cols), 1fr); padding: 0; }
.cmp-row { display: contents; }
.cmp-cell {
  padding: 13px 18px; border-bottom: 1px solid var(--border);
  font-family: 'Raleway', sans-serif; font-size: .8rem; color: var(--text);
}
.cmp-cell:first-child {
  background: var(--s2); font-weight: 700; color: var(--muted); font-size: .7rem;
  letter-spacing: 0.5px; position: sticky; left: 0; border-right: 1px solid var(--border); z-index: 2;
}
.cmp-section-head {
  background: var(--g1); color: white; font-size: .62rem; font-weight: 800;
  letter-spacing: 1.4px; text-transform: uppercase; padding: 8px 18px; font-family: 'JetBrains Mono', monospace;
}
.cmp-strat-header { padding: 20px 18px; border-bottom: 2px solid var(--g3); }
.cmp-strat-name { font-weight: 800; font-size: .92rem; color: var(--g1); line-height: 1.3; margin-bottom: 4px; }
.cmp-strat-mgr { font-size: .65rem; color: var(--muted); font-family: 'JetBrains Mono', monospace; text-transform: uppercase; }
.cmp-type-badge {
  display: inline-block; font-size: .55rem; font-weight: 800; text-transform: uppercase;
  padding: 2px 7px; border-radius: 5px; margin-top: 6px; font-family: 'JetBrains Mono', monospace;
}
.cmp-type-badge.mf { background: var(--g-xlight); color: var(--g1); }
.cmp-type-badge.sif { background: rgba(21, 101, 192, .1); color: #1565c0; }

.cmp-ret {
  display: inline-flex; align-items: center; font-family: 'JetBrains Mono', monospace;
  font-weight: 700; font-size: .82rem;
}
.cmp-ret.pos { color: var(--g2); }
.cmp-ret.neg { color: var(--neg); }
.cmp-ret.neu { color: var(--muted); }
.cmp-ret-best {
  background: var(--g-xlight); border-radius: 5px; padding: 2px 7px;
  border: 1.5px solid var(--g3); color: var(--g1) !important;
}

/* Category peer-rank */
.cmp-peer-rank { font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: .78rem; color: var(--text); }
.cmp-peer-rank-of { color: var(--muted); font-weight: 500; font-size: .68rem; }

.cmp-win-badge {
  display: inline-block; background: var(--g2); color: white; font-size: .52rem; font-weight: 800;
  padding: 2px 6px; border-radius: 8px; margin-left: 6px; font-family: 'JetBrains Mono', monospace;
}

/* Wealth sim — Growth Journey Strip (1Y -> 3Y -> 5Y), used twice (lumpsum row + SIP row) */
.cmp-wealth-strip { display: flex; align-items: stretch; gap: 4px; }
.cmp-wealth-stop { flex: 1; min-width: 0; text-align: center; padding: 8px 4px; background: var(--s2); border-radius: 7px; border: 1.5px solid transparent; }
.cmp-wealth-stop-best { border-color: var(--g3); background: var(--g-xlight); }
.cmp-wealth-stop-period { font-size: .58rem; font-weight: 800; color: var(--muted); text-transform: uppercase; letter-spacing: .3px; }
.cmp-wealth-stop-val { font-size: .78rem; font-weight: 800; font-family: 'JetBrains Mono', monospace; margin: 3px 0 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cmp-wealth-stop-gain { font-size: .6rem; font-weight: 700; font-family: 'JetBrains Mono', monospace; }
.cmp-wealth-arrow { display: flex; align-items: center; color: var(--g3); font-size: .8rem; flex-shrink: 0; }
.cmp-wealth-subhead { font-size: .58rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .3px; margin-bottom: 6px; }

@media (max-width: 480px) {
  .cmp-wealth-strip { flex-direction: column; gap: 5px; }
  .cmp-wealth-arrow { display: none; }
  .cmp-wealth-stop { display: flex; align-items: center; justify-content: space-between; text-align: left; padding: 6px 9px; }
  .cmp-wealth-stop-period { width: 28px; flex-shrink: 0; }
  .cmp-wealth-stop-val { margin: 0; flex: 1; text-align: left; padding-left: 8px; }
  .cmp-wealth-stop-gain { flex-shrink: 0; }
}

/* Verdict banner */
.cmp-verdict {
  margin: 20px 28px 28px; background: var(--g-xlight); border: 1.5px solid var(--g3);
  border-radius: 12px; padding: 16px 20px; display: flex; align-items: flex-start; gap: 14px;
}
.cmp-verdict-icon { font-size: 1.6rem; }
.cmp-verdict-title { font-weight: 800; font-size: .88rem; color: var(--g1); margin-bottom: 4px; }
.cmp-verdict-body { font-size: .75rem; color: var(--text); line-height: 1.6; }
.cmp-verdict-body strong { color: var(--g1); }

.cmp-remove-btn {
  margin-top: 8px; background: transparent; border: 1px solid var(--border); border-radius: 6px;
  padding: 3px 10px; font-size: .6rem; color: var(--muted); cursor: pointer; transition: 0.15s;
  font-family: 'Raleway', sans-serif;
}
.cmp-remove-btn:hover { border-color: var(--neg); color: var(--neg); }

.cmp-disclaimer { padding: 16px 28px 24px; font-size: .65rem; color: var(--muted); line-height: 1.6; border-top: 1px solid var(--border); }

/* ── Interactive growth chart (Task 4's CompareGrowthChart) ─────────────── */
.cmp-chart-wrap { position: relative; padding: 20px 28px; }
.cmp-chart-legend { display: flex; gap: 16px; margin-bottom: 10px; font-size: 12px; font-weight: 700; flex-wrap: wrap; font-family: 'Raleway', sans-serif; color: var(--text); }
.cmp-chart-legend span { display: flex; align-items: center; gap: 6px; }
.cmp-chart-legend i { width: 10px; height: 10px; border-radius: 2px; display: inline-block; }
.cmp-chart-svg { width: 100%; height: auto; cursor: crosshair; user-select: none; touch-action: pan-y; display: block; }
.cmp-tip {
  position: absolute; top: 10px; background: #1e293b; color: #fff; padding: 8px 12px; border-radius: 8px;
  font-size: 11px; pointer-events: none; white-space: nowrap; font-family: 'JetBrains Mono', monospace; z-index: 5;
}
.cmp-tip-row { display: flex; justify-content: space-between; gap: 12px; }
.cmp-onchart-summary {
  position: absolute; top: 4px; background: var(--surface); border: 1.5px solid var(--g3); border-radius: 10px;
  padding: 8px 12px; font-size: 11px; box-shadow: 0 4px 14px rgba(0,0,0,.12); pointer-events: none;
  z-index: 6; display: none; font-family: 'JetBrains Mono', monospace; white-space: nowrap;
}
.cmp-onchart-summary.show { display: block; }
.cmp-onchart-row { display: flex; justify-content: space-between; gap: 12px; padding: 1px 0; }
.cmp-drag-date {
  position: absolute; background: var(--g1); color: #fff; padding: 3px 8px; border-radius: 20px; font-size: 10px;
  font-weight: 700; pointer-events: none; white-space: nowrap; font-family: 'JetBrains Mono', monospace;
  z-index: 7; transform: translateX(-50%);
}
.cmp-drag-date.end { background: #e65100; }
.cmp-range-summary { margin: 12px 28px 0; padding: 12px 14px; background: var(--g-xlight); border: 1.5px solid var(--g3); border-radius: 10px; font-size: 12px; display: none; }
.cmp-range-summary.show { display: block; }
.cmp-range-summary-h { font-weight: 800; color: var(--g1); margin-bottom: 8px; font-family: 'JetBrains Mono', monospace; text-transform: uppercase; font-size: 10px; letter-spacing: .5px; display: flex; justify-content: space-between; align-items: center; }
.cmp-range-clear { font-weight: 700; color: var(--muted); cursor: pointer; text-transform: none; letter-spacing: 0; font-size: 10px; }
.cmp-range-row { display: flex; justify-content: space-between; padding: 3px 0; font-weight: 700; }
.cmp-hint { font-size: 10px; color: var(--muted); margin-top: 6px; text-align: center; }

/* ── Responsive ────────────────────────────────────────── */
@media (max-width: 700px) {
  .cmp-bar {
    width: calc(100% - 24px); border-radius: 12px; padding: 8px 12px; bottom: 12px; gap: 8px;
    left: 50%; transform: translateX(-50%) translateY(100px); justify-content: space-between;
  }
  .cmp-bar.visible { transform: translateX(-50%) translateY(0); }
  .cmp-bar-chips { overflow-x: auto; max-width: 55%; white-space: nowrap; padding-bottom: 2px; }
  .cmp-chip { max-width: 80px; font-size: .6rem; flex-shrink: 0; }
  .cmp-bar-label { display: none; }
  .cmp-go-btn { padding: 6px 12px; font-size: 0.7rem; }
  .cmp-clear-btn { padding: 5px 10px; font-size: 0.65rem; }

  .cmp-modal-inner { border-radius: 12px; width: calc(100vw - 16px); max-height: calc(100vh - 24px); }
  .cmp-modal-header { padding: 16px 20px 12px; }
  .cmp-cell { padding: 10px 12px; }
  .cmp-grid { grid-template-columns: 120px repeat(var(--cols), minmax(130px, 1fr)); overflow-x: auto; display: grid; }
  .cmp-cell:first-child { box-shadow: 2px 0 8px rgba(0,0,0,0.1); }
  .cmp-verdict { margin: 16px 20px 20px; padding: 12px 14px; flex-direction: column; gap: 8px; }
  .cmp-verdict-icon { font-size: 1.3rem; }
  .cmp-disclaimer { padding: 12px 20px 20px; }
  .cmp-chart-wrap { padding: 12px 16px; }
  .cmp-tip, .cmp-onchart-summary { font-size: 10px; padding: 6px 9px; }
  .cmp-drag-date { font-size: 9px; padding: 2px 6px; }
  .cmp-range-summary { margin: 10px 16px 0; }
}
```

- [ ] **Step 2: Run the project build**

Run: `npm run build`
Expected: build completes with no errors (unused CSS file at this point — no component imports it yet; Task 6 does).

- [ ] **Step 3: Commit**

```bash
git add app/screener/mf-compare.css
git commit -m "feat(screener): add comparison styles (adapted from pms-compare.css)"
```

---

### Task 6: Selection wiring — `compareList` state, checkbox columns, `MFCompareBar`

**Files:**
- Create: `app/screener/MFCompare.jsx` (only the `MFCompareBar` export for this task — `MFCompareModal` is added in Task 7)
- Modify: `app/screener/page.js` (add `compareList` state, `toggleCompare`, checkbox columns on both tables, import + render `MFCompareBar`)

**Interfaces:**
- Consumes: `mf-compare.css` (Task 5).
- Produces: `<MFCompareBar selected={compareList} onRemove={fn} onClear={fn} onCompare={fn} />` (named export from `MFCompare.jsx`). The `compareList` state, `toggleCompare(fund, type)`, `isComparing(id)`, `removeFromCompare(id)`, `clearCompare()` functions in `page.js` are consumed by Task 7 (which adds `MFCompareModal` and wires `onCompare` to open it).

- [ ] **Step 1: Create `MFCompareBar` in a new file**

```jsx
'use client';
// app/screener/MFCompare.jsx
//
// MF/SIF fund comparison — floating selection bar + (added in Task 7) the
// full comparison modal. Modeled directly on app/pms-screener/PMSCompare.jsx's
// PMSCompareBar, extended with a small per-chip type badge (MF/SIF) since
// this feature mixes both.
import './mf-compare.css';

const MAX_COMPARE = 3;

export function MFCompareBar({ selected, onRemove, onClear, onCompare }) {
  const vis = selected.length > 0;
  return (
    <div className={`cmp-bar${vis ? ' visible' : ''}`} role="region" aria-label="Fund Compare basket">
      <div className="cmp-bar-chips">
        {selected.map((f) => (
          <span key={f.id} className="cmp-chip">
            <span className="cmp-chip-type">{f.type}</span>
            {f.name.length > 18 ? f.name.slice(0, 18) + '…' : f.name}
            <span className="cmp-chip-x" role="button" onClick={() => onRemove(f.id)} aria-label={`Remove ${f.name} from compare`}>×</span>
          </span>
        ))}
        {selected.length < MAX_COMPARE && (
          <span className="cmp-chip" style={{ opacity: 0.4, fontStyle: 'italic' }}>
            + {MAX_COMPARE - selected.length} more
          </span>
        )}
      </div>
      <span className="cmp-bar-label">{selected.length}/{MAX_COMPARE} selected</span>
      <button className="cmp-go-btn" onClick={onCompare} disabled={selected.length < 2} style={{ opacity: selected.length < 2 ? 0.5 : 1 }}>
        ⚖ Compare Now
      </button>
      <button className="cmp-clear-btn" onClick={onClear}>Clear</button>
    </div>
  );
}
```

- [ ] **Step 2: Add `compareList` state and helpers to `ScreenerPage`**

Find the `cols`/`useEffect` block near the top of `ScreenerPage` (added in an earlier feature — the "default columns on wide screens" effect) and add the comparison state right after it:

```js
  // ── Compare helpers ────────────────────────────────────────────────────
  // compareList holds up to 3 entries, each { type: 'mf'|'sif', ...rawFund },
  // and persists across the MF/SIF tab switch (it's not reset by `group`).
  const MAX_COMPARE = 3;
  const [compareList, setCompareList] = useState([]);
  const [showCompare, setShowCompare] = useState(false);

  // Every entry stores its own `.id` up front (same 'mf-'+code / 'sif-'+
  // scheme_id format normalizeFund uses later) so nothing downstream needs
  // to recompute the id pattern — MFCompareBar's chip removal, in
  // particular, just reads `f.id` directly (see Task 7).
  const toggleCompare = useCallback((fund, type) => {
    const id = type === 'mf' ? 'mf-' + fund.code : 'sif-' + fund.scheme_id;
    setCompareList((prev) => {
      const already = prev.find((f) => f.id === id);
      if (already) return prev.filter((f) => f.id !== id);
      if (prev.length >= MAX_COMPARE) return prev;
      return [...prev, { id, type, ...fund }];
    });
  }, []);
  const isComparing = useCallback((type, key) => {
    const id = type === 'mf' ? 'mf-' + key : 'sif-' + key;
    return compareList.some((f) => f.id === id);
  }, [compareList]);
  const removeFromCompare = useCallback((id) => {
    setCompareList((prev) => prev.filter((f) => f.id !== id));
  }, []);
  const clearCompare = useCallback(() => setCompareList([]), []);
```

- [ ] **Step 3: Add the import**

At the top of `app/screener/page.js`, add:

```js
import { MFCompareBar } from './MFCompare';
```

- [ ] **Step 4: Add a checkbox column to the SIF table**

Find the SIF table's header row (`<th className="scr-name-h">Fund</th>` inside the SIF `<thead>`) and add a checkbox column before it:

```jsx
                  <tr>
                    <th style={{ width: 32, textAlign: 'center', color: 'var(--muted)', fontSize: '.65rem' }} title="Add to compare (max 3)">⚖</th>
                    <th className="scr-name-h">Fund</th>
```

Find the SIF row rendering (`<tr key={s.scheme_id} className="scr-row" onClick={() => setSifSel(s)}>`) and add a checkbox cell right after the opening `<tr>`, before the existing `<td className="scr-name">`:

```jsx
                      <tr key={s.scheme_id} className={`scr-row${isComparing('sif', s.scheme_id) ? ' row-comparing' : ''}`} onClick={() => setSifSel(s)}>
                        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', paddingLeft: 8, paddingRight: 4 }}>
                          <input
                            type="checkbox"
                            className="cmp-chk"
                            checked={isComparing('sif', s.scheme_id)}
                            onChange={() => toggleCompare(s, 'sif')}
                            disabled={!isComparing('sif', s.scheme_id) && compareList.length >= MAX_COMPARE}
                            title={isComparing('sif', s.scheme_id) ? 'Remove from compare' : compareList.length >= MAX_COMPARE ? 'Max 3 selected' : 'Add to compare'}
                            aria-label={`Compare ${s.nav_name}`}
                          />
                        </td>
                        <td className="scr-name">
```

- [ ] **Step 5: Add a checkbox column to the MF table**

Find the MF table's header row (`<th className="scr-name-h">Fund</th>` inside the MF `<thead>`, the second occurrence in the file) and add the same checkbox column:

```jsx
                  <tr>
                    <th style={{ width: 32, textAlign: 'center', color: 'var(--muted)', fontSize: '.65rem' }} title="Add to compare (max 3)">⚖</th>
                    <th className="scr-name-h">Fund</th>
```

Find the MF row rendering (`<tr key={f.code} className="scr-row" onClick={() => setSel(f)}>`) and add the matching checkbox cell:

```jsx
                      <tr key={f.code} className={`scr-row${isComparing('mf', f.code) ? ' row-comparing' : ''}`} onClick={() => setSel(f)}>
                        <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'center', paddingLeft: 8, paddingRight: 4 }}>
                          <input
                            type="checkbox"
                            className="cmp-chk"
                            checked={isComparing('mf', f.code)}
                            onChange={() => toggleCompare(f, 'mf')}
                            disabled={!isComparing('mf', f.code) && compareList.length >= MAX_COMPARE}
                            title={isComparing('mf', f.code) ? 'Remove from compare' : compareList.length >= MAX_COMPARE ? 'Max 3 selected' : 'Add to compare'}
                            aria-label={`Compare ${f.name}`}
                          />
                        </td>
                        <td className="scr-name">
```

- [ ] **Step 6: Add a `.row-comparing` style**

In the page's embedded `<style>` block (search for `.scr-row:hover`), add:

```css
.scr-row.row-comparing { background: var(--g-xlight); }
```

- [ ] **Step 7: Render `MFCompareBar`**

Near the end of `ScreenerPage`'s returned JSX (find where `<Footer />` is, and add just before it, inside the same top-level fragment):

```jsx
      <MFCompareBar
        selected={compareList}
        onRemove={removeFromCompare}
        onClear={clearCompare}
        onCompare={() => setShowCompare(true)}
      />
```

- [ ] **Step 8: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 9: Commit**

```bash
git add app/screener/MFCompare.jsx app/screener/page.js
git commit -m "feat(screener): add compare selection (checkbox columns, floating bar) for MF+SIF"
```

---

### Task 7: `MFCompareModal` — header row, open/close, section scaffold

**Files:**
- Modify: `app/screener/MFCompare.jsx` (add `MFCompareModal` export)
- Modify: `app/screener/page.js` (render the modal when `showCompare` is true)

**Interfaces:**
- Consumes: `normalizeFund` (Task 2), `winCounts` (Task 3).
- Produces: `<MFCompareModal funds={compareList} allMfFunds={funds} onClose={fn} onRemove={fn} />`. Later tasks (8-11) add sections into this modal's `.cmp-grid` — this task establishes the header row and the empty grid shell.

- [ ] **Step 1: Add `MFCompareModal` to `MFCompare.jsx`**

```jsx
import { useMemo } from 'react';
import ProviderAvatar from '@/components/ProviderAvatar';
import { getMFLogo, getSIFLogo } from '@/lib/providerLogos';
import { normalizeFund, winCounts } from './compareEngine';

/**
 * @param {Array} props.funds        - compareList entries, each { type: 'mf'|'sif', ...rawFund }
 * @param {Array} props.allMfFunds   - the screener's full `funds` array, for category peer-rank (Task 8)
 * @param {Function} props.onClose
 * @param {Function} props.onRemove
 */
export function MFCompareModal({ funds, allMfFunds, onClose, onRemove }) {
  const normalized = useMemo(() => funds.map(normalizeFund), [funds]);
  const n = normalized.length;
  const counts = useMemo(() => winCounts(normalized), [normalized]);

  if (!funds.length) return null;

  return (
    <>
      <div className="cmp-overlay open" onClick={onClose} />
      <div className="cmp-modal open" role="dialog" aria-modal="true" aria-label="Fund Comparison">
        <div className="cmp-modal-inner" style={{ '--cols': n }}>

          <div className="cmp-modal-header">
            <div>
              <div className="cmp-modal-title">⚖ Fund Comparison</div>
              <div className="cmp-modal-sub">Abundance Financial Services · ARN-251838</div>
            </div>
            <button className="cmp-modal-close" onClick={onClose} aria-label="Close comparison">×</button>
          </div>

          <div className="cmp-grid" style={{ '--cols': n }}>
            <div className="cmp-cell cmp-strat-header">
              <div style={{ fontWeight: 700, fontSize: '.72rem', color: 'var(--muted)', paddingTop: 6 }}>FUND</div>
            </div>
            {normalized.map((f, i) => (
              <div key={f.id} className="cmp-cell cmp-strat-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 6 }}>
                  <ProviderAvatar
                    name={f.house}
                    logoPath={f.type === 'mf' ? getMFLogo(f.house) : getSIFLogo(f.house)}
                    size={34}
                    radius={8}
                  />
                  <div>
                    <div className="cmp-strat-name">{f.name}</div>
                    <div className="cmp-strat-mgr">{f.house}</div>
                  </div>
                </div>
                <span className={`cmp-type-badge ${f.type}`}>{f.type === 'mf' ? 'Mutual Fund' : 'SIF'}</span>
                {counts[i] > 0 && (
                  <span className="cmp-win-badge">🏆 Best in {counts[i]} metric{counts[i] > 1 ? 's' : ''}</span>
                )}
                <button className="cmp-remove-btn" onClick={() => onRemove(f.id)}>✕ Remove</button>
              </div>
            ))}
          </div>

          <div className="cmp-disclaimer">
            <strong>Important Disclosure:</strong> This comparison is for informational and educational purposes only and does not constitute investment advice.
            Data sourced from AMFI (mutual funds) and SEBI-regulated SIF disclosures. Past performance is not indicative of future returns.
            Abundance Financial Services. Atin Kumar Agrawal · ARN-251838 · AMFI Registered Mutual Fund &amp; SIF Distributor.
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Render the modal in `page.js`**

Add the import:

```js
import { MFCompareBar, MFCompareModal } from './MFCompare';
```

(Replace the Task 6 import line `import { MFCompareBar } from './MFCompare';` with this combined one.)

Right after the `<MFCompareBar ... />` render added in Task 6, add:

```jsx
      {showCompare && (
        <MFCompareModal
          funds={compareList}
          allMfFunds={funds}
          onClose={() => setShowCompare(false)}
          onRemove={removeFromCompare}
        />
      )}
```

- [ ] **Step 3: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add app/screener/MFCompare.jsx app/screener/page.js
git commit -m "feat(screener): add MFCompareModal header row and open/close wiring"
```

---

### Task 8: Returns, Risk metrics, and Category peer-rank sections

**Files:**
- Modify: `app/screener/MFCompare.jsx`

**Interfaces:**
- Consumes: `applyDerivedStats`, `fetchNavSeries`, `categoryPeerRank` (Tasks 1-2).
- Produces: nothing new consumed by later tasks (this task's sections are terminal within the modal, aside from all sections sharing the same `normalized`/`derived` state this task introduces, which Tasks 9-11 also read).

- [ ] **Step 1: Add SIF-derivation state and fetch effect to `MFCompareModal`**

Add this near the top of `MFCompareModal`, right after the existing `normalized`/`counts` `useMemo`s:

```jsx
  // SIF funds start with null return/risk fields (normalizeFund) — fetch
  // each SIF's real NAV history once on mount and derive its stats. MF
  // funds are already fully populated, so this only ever touches SIF
  // entries. Each fetch is independent; a failure leaves that one fund's
  // fields null (rendered as "—"), never blocks the others.
  const [derived, setDerived] = useState(normalized);
  useEffect(() => {
    setDerived(normalized);
    let cancelled = false;
    Promise.all(normalized.map(async (f) => {
      if (f.type !== 'sif') return f;
      const series = await fetchNavSeries(f);
      return applyDerivedStats(f, series);
    })).then((results) => {
      if (!cancelled) setDerived(results);
    });
    return () => { cancelled = true; };
  }, [normalized]);
```

Then find the Task 7 line `const counts = useMemo(() => winCounts(normalized), [normalized]);` and change it to depend on `derived` instead of `normalized` — otherwise the "Best in N metrics" header badge would stay frozen at SIF funds' pre-fetch (null) values even after their real stats load:

```jsx
  const counts = useMemo(() => winCounts(derived), [derived]);
```

Add the required imports at the top of the file:

```js
import { useState, useEffect, useMemo } from 'react';
import { normalizeFund, winCounts, applyDerivedStats, fetchNavSeries, categoryPeerRank } from './compareEngine';
```

(This replaces the Task 7 import line `import { useMemo } from 'react';` and the Task 7 `compareEngine` import line — combine into the two lines above.)

- [ ] **Step 2: Add the Returns, Risk, and Peer-rank sections to the grid**

The rest of this task's code uses `derived` (not `normalized`) for every section, since `derived` is the version with SIF stats filled in once available.

Add this constant near the top of the file (module scope, outside the component):

```js
const PERIODS = [
  { label: '1 Month', key: 'ret_1m' },
  { label: '3 Months', key: 'ret_3m' },
  { label: '6 Months', key: 'ret_6m' },
  { label: '1 Year', key: 'ret_1y' },
  { label: '3 Years', key: 'ret_3y' },
  { label: '5 Years', key: 'ret_5y' },
  { label: '7 Years', key: 'ret_7y' },
  { label: '10 Years', key: 'ret_10y' },
  { label: 'Inception', key: 'ret_inception' },
];
const RISK_METRICS = [
  { label: 'Volatility', key: 'vol', lowerIsBetter: true, suffix: '%' },
  { label: 'Max Drawdown', key: 'max_dd', lowerIsBetter: true, suffix: '%' }, // less negative = better; see bestIndexFor
  { label: 'Return/Risk', key: 'ret_per_risk', lowerIsBetter: false, suffix: '' },
];

function fmtRet(v) {
  if (v == null) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}
function rc(v) {
  if (v == null) return 'neu';
  return v > 0 ? 'pos' : v < 0 ? 'neg' : 'neu';
}
function bestIndexFor(vals, lowerIsBetter) {
  const valid = vals.map((v, i) => ({ v, i })).filter((p) => p.v != null);
  if (valid.length < 2) return -1;
  const best = lowerIsBetter ? Math.min(...valid.map((p) => p.v)) : Math.max(...valid.map((p) => p.v));
  const match = valid.find((p) => p.v === best);
  return match ? match.i : -1;
}
```

Add the sections inside `.cmp-grid`, right after the header row's closing (after the `{normalized.map(...)}` block from Task 7, before `</div>{/* /cmp-grid */}`):

```jsx
            {/* Returns */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              📊 Returns Across All Time Horizons
            </div>
            {PERIODS.map(({ label, key }) => {
              const vals = derived.map((f) => f[key]);
              if (vals.every((v) => v == null)) return null;
              const bestIdx = bestIndexFor(vals, false);
              return (
                <div key={key} className="cmp-row">
                  <div className="cmp-cell" style={{ fontWeight: 700 }}>{label}</div>
                  {derived.map((f, i) => (
                    <div key={f.id} className={`cmp-cell${bestIdx === i ? ' cmp-ret-best' : ''}`}>
                      <span className={`cmp-ret ${rc(f[key])}`}>{fmtRet(f[key])}</span>
                      {bestIdx === i && n > 1 && <span style={{ fontSize: '.55rem', marginLeft: 4, color: 'var(--g3)' }}>↑ best</span>}
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Risk metrics */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              📉 Risk Metrics
            </div>
            {RISK_METRICS.map(({ label, key, lowerIsBetter, suffix }) => {
              const vals = derived.map((f) => f[key]);
              if (vals.every((v) => v == null)) return null;
              const bestIdx = bestIndexFor(vals, lowerIsBetter);
              return (
                <div key={key} className="cmp-row">
                  <div className="cmp-cell" style={{ fontWeight: 700 }}>{label}</div>
                  {derived.map((f, i) => (
                    <div key={f.id} className={`cmp-cell${bestIdx === i ? ' cmp-ret-best' : ''}`}>
                      <span className={`cmp-ret ${key === 'max_dd' ? 'neg' : 'neu'}`}>
                        {f[key] == null ? '—' : (key === 'ret_per_risk' ? f[key].toFixed(2) : f[key].toFixed(1) + suffix)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Category peer-rank (MF only — see categoryPeerRank's doc comment) */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              🏅 Category Peer-Rank
            </div>
            <div className="cmp-row">
              <div className="cmp-cell" style={{ fontWeight: 700 }}>Rank by 3Y Return</div>
              {derived.map((f) => {
                const rank = categoryPeerRank(f, allMfFunds);
                return (
                  <div key={f.id} className="cmp-cell">
                    {rank ? (
                      <span className="cmp-peer-rank">#{rank.rank} <span className="cmp-peer-rank-of">of {rank.of}</span></span>
                    ) : (
                      <span className="cmp-ret neu" title={f.type === 'sif' ? 'Not enough SIF peer data yet' : 'Not enough data for this category'}>—</span>
                    )}
                  </div>
                );
              })}
            </div>
```

- [ ] **Step 3: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add app/screener/MFCompare.jsx
git commit -m "feat(screener): wire Returns, Risk metrics, and Category peer-rank into comparison modal"
```

---

### Task 9: Wealth Simulation section

**Files:**
- Modify: `app/screener/MFCompare.jsx`

**Interfaces:**
- Consumes: `computeWealthSimulation` (Task 1), `derived`/NAV-series-fetch pattern (Task 8).
- Produces: `navSeriesByFund` state (a `{ [fundId]: series }` map), consumed by Task 10's chart (avoids re-fetching NAV history the chart also needs).

- [ ] **Step 1: Add a shared NAV-series fetch (used by both Wealth Simulation and the chart)**

Add this state and effect right after the `derived`/SIF-derivation effect from Task 8:

```jsx
  // Real NAV history per selected fund — used by both the Wealth Simulation
  // (SIP calculation) and the interactive chart (Task 10). Fetched once per
  // fund here so neither section re-fetches the same data independently.
  const [navSeriesByFund, setNavSeriesByFund] = useState({});
  useEffect(() => {
    let cancelled = false;
    Promise.all(normalized.map(async (f) => ({ id: f.id, series: await fetchNavSeries(f) }))).then((results) => {
      if (cancelled) return;
      const map = {};
      results.forEach((r) => { map[r.id] = r.series; });
      setNavSeriesByFund(map);
    });
    return () => { cancelled = true; };
  }, [normalized]);
```

- [ ] **Step 2: Add the Wealth Simulation section**

Add the import:

```js
import { normalizeFund, winCounts, applyDerivedStats, fetchNavSeries, categoryPeerRank, computeWealthSimulation } from './compareEngine';
```

(Replaces Task 8's `compareEngine` import line.)

Add this section to the grid, right after the Category Peer-Rank section from Task 8 (before `</div>{/* /cmp-grid */}`):

```jsx
            {/* Wealth Simulation */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              💰 Wealth Simulation
            </div>
            {(() => {
              const sims = derived.map((f) => computeWealthSimulation(f, navSeriesByFund[f.id]));
              const stopsOf = sims[0] || [];
              return (
                <>
                  <div className="cmp-row">
                    <div className="cmp-cell" style={{ fontWeight: 700 }}>
                      <div className="cmp-wealth-subhead">₹1,00,000 Lumpsum</div>
                    </div>
                    {derived.map((f, i) => (
                      <div key={f.id} className="cmp-cell">
                        <div className="cmp-wealth-strip">
                          {sims[i].map(({ label, lumpsum }, idx) => (
                            <div key={label} style={{ display: 'contents' }}>
                              <div className="cmp-wealth-stop">
                                <div className="cmp-wealth-stop-period">{label}</div>
                                <div className="cmp-wealth-stop-val" style={{ color: lumpsum && lumpsum.gain >= 0 ? 'var(--g2)' : 'var(--neg)' }}>
                                  {lumpsum ? '₹' + Math.round(lumpsum.value).toLocaleString('en-IN') : '—'}
                                </div>
                                <div className="cmp-wealth-stop-gain" style={{ color: lumpsum && lumpsum.gain >= 0 ? 'var(--g3)' : 'var(--neg)' }}>
                                  {lumpsum ? (lumpsum.gain >= 0 ? '+' : '') + '₹' + Math.abs(Math.round(lumpsum.gain)).toLocaleString('en-IN') : ''}
                                </div>
                              </div>
                              {idx < sims[i].length - 1 && <div className="cmp-wealth-arrow">→</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="cmp-row">
                    <div className="cmp-cell" style={{ fontWeight: 700 }}>
                      <div className="cmp-wealth-subhead">₹10,000/mo SIP (Real)</div>
                    </div>
                    {derived.map((f, i) => (
                      <div key={f.id} className="cmp-cell">
                        <div className="cmp-wealth-strip">
                          {sims[i].map(({ label, sip }, idx) => (
                            <div key={label} style={{ display: 'contents' }}>
                              <div className="cmp-wealth-stop">
                                <div className="cmp-wealth-stop-period">{label}</div>
                                <div className="cmp-wealth-stop-val" style={{ color: sip && sip.gain >= 0 ? 'var(--g2)' : 'var(--neg)' }}>
                                  {sip ? '₹' + Math.round(sip.value).toLocaleString('en-IN') : '—'}
                                </div>
                                <div className="cmp-wealth-stop-gain" style={{ color: sip && sip.gain >= 0 ? 'var(--g3)' : 'var(--neg)' }}>
                                  {sip ? `XIRR ${(sip.xirr * 100).toFixed(1)}%` : ''}
                                </div>
                              </div>
                              {idx < sims[i].length - 1 && <div className="cmp-wealth-arrow">→</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              );
            })()}
```

- [ ] **Step 3: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 4: Commit**

```bash
git add app/screener/MFCompare.jsx
git commit -m "feat(screener): wire Wealth Simulation (lumpsum + real SIP) into comparison modal"
```

---

### Task 10: Interactive chart section

**Files:**
- Modify: `app/screener/MFCompare.jsx`

**Interfaces:**
- Consumes: `<CompareGrowthChart />` (Task 4), `navSeriesByFund` (Task 9).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Add the chart section**

Add the import at the top of the file:

```js
import CompareGrowthChart from './CompareGrowthChart';
```

Add this section right after the modal header (`</div>{/* closes .cmp-modal-header */}`) and before the `.cmp-grid` div, so the chart sits above the data table:

```jsx
          {(() => {
            // Align every fund's series to the same start date — the LATEST
            // "first available NAV" among the selected funds (i.e. governed
            // by whichever fund has the shortest real history), so every
            // plotted line has genuine data across the full visible range.
            // Each series is then re-based to start at the same ₹1,00,000,
            // so the lines show comparable growth, not raw NAV levels.
            const seriesList = derived
              .map((f) => ({ f, raw: navSeriesByFund[f.id] }))
              .filter((x) => x.raw && x.raw.length >= 2);
            if (seriesList.length < 2) return null;

            const commonStartT = Math.max(...seriesList.map((x) => x.raw[0].t));
            const colors = ['#1b5e20', '#e65100', '#1565c0'];
            const chartSeries = seriesList.map(({ f, raw }, i) => {
              const trimmed = raw.filter((p) => p.t >= commonStartT);
              if (trimmed.length < 2) return null;
              const baseNav = trimmed[0].nav;
              return {
                name: f.name.length > 24 ? f.name.slice(0, 24) + '…' : f.name,
                color: colors[i % colors.length],
                data: trimmed.map((p) => ({ t: p.t, v: (p.nav / baseNav) * 100000 })),
              };
            }).filter(Boolean);

            if (chartSeries.length < 2) return null;
            return <CompareGrowthChart series={chartSeries} />;
          })()}
```

- [ ] **Step 2: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add app/screener/MFCompare.jsx
git commit -m "feat(screener): wire interactive growth chart into comparison modal"
```

---

### Task 11: Verdict banner

**Files:**
- Modify: `app/screener/MFCompare.jsx`

**Interfaces:**
- Consumes: `computeVerdictScores`, `overallWinner` (Task 3).
- Produces: nothing new consumed by later tasks (final section).

- [ ] **Step 1: Add the verdict banner**

Add the import:

```js
import { normalizeFund, winCounts, applyDerivedStats, fetchNavSeries, categoryPeerRank, computeWealthSimulation, computeVerdictScores, overallWinner } from './compareEngine';
```

(Replaces Task 9's `compareEngine` import line.)

Add this right after the closing `</div>{/* /cmp-grid */}` and before `<div className="cmp-disclaimer">`:

```jsx
          {n > 1 && (() => {
            const scores = computeVerdictScores(derived);
            const winner = overallWinner(derived, scores);
            if (!winner) return null;
            return (
              <div className="cmp-verdict">
                <div className="cmp-verdict-icon">🏆</div>
                <div>
                  <div className="cmp-verdict-title">Overall Leader: {winner.fund.name}</div>
                  <div className="cmp-verdict-body">
                    <strong>{winner.fund.name}</strong> by <strong>{winner.fund.house}</strong> ranks highest across the
                    metrics compared — weighted toward long-term consistency (5Y/7Y/10Y and Return/Risk count most,
                    1M/3M count least), averaged only over the periods each fund actually has data for so a newer
                    fund isn't penalized for not existing that long.
                  </div>
                </div>
              </div>
            );
          })()}
```

- [ ] **Step 2: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add app/screener/MFCompare.jsx
git commit -m "feat(screener): wire weighted verdict banner into comparison modal"
```

---

### Task 12: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Re-run every standalone script from Tasks 1-3**

```bash
node .superpowers/verify/compare-engine-wealth.mjs
node .superpowers/verify/compare-engine-normalize.mjs
node .superpowers/verify/compare-engine-verdict.mjs
```
Expected: all `PASS:`, no `FAIL:`, in all three.

- [ ] **Step 2: Full project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Manual walkthrough**

On the live/dev screener page:
- Select 2-3 funds mixing MF and SIF (via the checkbox column on both tables), confirm the floating bar shows correct chips/type badges and "Compare Now" enables at 2+.
- Open the comparison modal — confirm the header row, Returns/Risk/Peer-rank sections, Wealth Simulation (both lumpsum and real SIP rows), the interactive chart, and the verdict banner all render sensibly.
- Confirm a SIF with only a few months of history shows "—" for long periods (not an error), and that its Returns/Risk cells eventually populate once its NAV-history fetch resolves.
- Test the chart: hover for the crosshair+tooltip, drag to select a range (confirm live start/end date pills follow the drag, the shaded selection + both summary panels persist after release, and tapping elsewhere clears it).
- Resize to a mobile width (or test on a real phone) — confirm the chart's touch drag works without breaking page scroll, and the modal/grid remain usable.
- Confirm removing a fund from compare (via chip `×` or the modal's "Remove" button) updates the modal/bar correctly, and "Clear" empties the whole selection.
