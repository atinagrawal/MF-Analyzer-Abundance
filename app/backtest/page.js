"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

/* ============================================================
   Abundance · Portfolio Backtester  (per-fund strategies)
   Self-contained client page. Reuses global theme tokens.
   Page-specific styles scoped under `.bt-*`. Nothing else touched.

   Verified live data contracts:
   - MF search : /api/mf?q=text   -> [{schemeCode, schemeName}]
   - MF NAV    : /api/mf?code=NNN  -> {meta, data:[{date:"DD-MM-YYYY", nav}]}  newest-first
   - SIF list  : /api/sif-nav      -> {schemes:[{scheme_id, nav_name, category, nav, nav_date}]}
   - SIF NAV   : /api/sif-history?sd_id=SIF-34&from=YYYY-MM-DD&to=YYYY-MM-DD
                 -> {records:[{date:"YYYY-MM-DD", nav}]}  oldest-first
   ============================================================ */

/* ---------------- engine (validated core) ---------------- */
const DAY = 86400000;
const Y = 365 * DAY;
const pDMY = (s) => { const [d, m, y] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const pYMD = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const toYMD = (t) => new Date(t).toISOString().slice(0, 10);
const todayUTC = () => { const n = new Date(); return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()); };

function normSeries(raw, kind) {
  const arr = raw.map((r) => kind === "mf" ? { t: pDMY(r.date), nav: +r.nav } : { t: pYMD(r.date), nav: +r.nav });
  return arr.filter((r) => r.nav > 0 && isFinite(r.t)).sort((a, b) => a.t - b.t);
}
function fwd(s, t) { let lo = 0, hi = s.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (s[m].t >= t) { a = m; hi = m - 1; } else lo = m + 1; } return a < 0 ? null : s[a]; }
function asof(s, t) { let lo = 0, hi = s.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (s[m].t <= t) { a = m; lo = m + 1; } else hi = m - 1; } return a < 0 ? null : s[a]; }

function xirr(flows) {
  if (flows.length < 2) return null;
  const t0 = flows[0].t, yr = (f) => (f.t - t0) / Y;
  const npv = (r) => flows.reduce((s, f) => s + f.amt / Math.pow(1 + r, yr(f)), 0);
  const der = (r) => flows.reduce((s, f) => s - yr(f) * f.amt / Math.pow(1 + r, yr(f) + 1), 0);
  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const n = npv(r), d = der(r);
    if (Math.abs(n) < 1e-7) return r;
    if (!isFinite(d) || d === 0) break;
    let nr = r - n / d; if (!isFinite(nr)) break;
    if (nr <= -0.9999) nr = -0.99;
    if (Math.abs(nr - r) < 1e-9) return nr; r = nr;
  }
  let lo = -0.9999, hi = 10, fl = npv(lo); if (!isFinite(fl)) return null;
  for (let i = 0; i < 240; i++) { const mid = (lo + hi) / 2, fm = npv(mid); if (Math.abs(fm) < 1e-7) return mid; if (fl < 0 === fm < 0) { lo = mid; fl = fm; } else hi = mid; }
  return (lo + hi) / 2;
}
function sipDates(start, end, day) {
  const out = []; let cur = new Date(start); cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), 1)); let g = 0;
  while (g++ < 2400) { const y = cur.getUTCFullYear(), m = cur.getUTCMonth(); const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate(); const t = Date.UTC(y, m, Math.min(day, dim)); if (t >= start && t <= end) out.push(t); if (t > end) break; cur = new Date(Date.UTC(y, m + 1, 1)); }
  return out;
}
function monthlyGrid(start, end) {
  const out = []; let g = new Date(start); g = new Date(Date.UTC(g.getUTCFullYear(), g.getUTCMonth(), 1)); let i = 0;
  while (i++ < 1200) { const t = g.getTime(); if (t > end) break; if (t >= start) out.push(t); g = new Date(Date.UTC(g.getUTCFullYear(), g.getUTCMonth() + 1, 1)); }
  if (!out.length || out[out.length - 1] !== end) out.push(end);
  return out;
}

// per-fund plan: each holding carries its own mode/amounts/start
function planBuys(h, sipDay, defaultStart, end, stepUp = 0) {
  const incep = h.series[0].t;
  let want = (h.startMode === "custom" && h.customStart) ? pYMD(h.customStart) : defaultStart;
  let clamped = false;
  if (want < incep) { if (h.startMode === "custom") clamped = true; want = incep; }
  const f0 = fwd(h.series, want);
  if (!f0 || f0.t > end) return { effStart: f0 ? f0.t : want, incep, clamped, noInvest: true, buys: [] };
  const start = f0.t, buys = [];
  if (h.mode === "lumpsum" || h.mode === "combo") buys.push({ t: start, amt: +h.lumpsum || 0 });
  if (h.mode === "sip" || h.mode === "combo") {
    const base = +h.monthly || 0;
    sipDates(start, end, sipDay).forEach((t) => {
      // Annual step-up applies on each SIP anniversary (year 0 = base).
      const yr = Math.floor((t - start) / Y);
      buys.push({ t, amt: base * Math.pow(1 + stepUp, yr) });
    });
  }
  return { effStart: start, incep, clamped, noInvest: false, buys };
}

function runBacktest({ holdings, sipDay, defaultStart, end, benchmark, stepUp = 0 }) {
  const pf = {}, flows = [], agg = new Map();
  holdings.forEach((h) => {
    const plan = planBuys(h, sipDay, defaultStart, end, stepUp);
    const rec = { units: 0, invested: 0, buys: [], start: plan.effStart, clamped: plan.clamped, noInvest: plan.noInvest, mode: h.mode, monthly: +h.monthly || 0, lumpsum: +h.lumpsum || 0 };
    plan.buys.forEach((b) => {
      if (b.amt <= 0) return;
      const px = fwd(h.series, b.t); if (!px) return;
      const u = b.amt / px.nav;
      rec.units += u; rec.invested += b.amt; rec.buys.push({ t: px.t, units: u, amt: b.amt });
      flows.push({ t: px.t, amt: -b.amt });
      agg.set(px.t, (agg.get(px.t) || 0) + b.amt);
    });
    pf[h.key] = rec;
  });
  let finalVal = 0;
  holdings.forEach((h) => {
    const px = asof(h.series, end); const v = px ? pf[h.key].units * px.nav : 0;
    pf[h.key].value = v; pf[h.key].finalNav = px ? px.nav : null;
    const fl = pf[h.key].buys.map((b) => ({ t: b.t, amt: -b.amt }));
    pf[h.key].xirr = fl.length ? xirr([...fl, { t: end, amt: v }].sort((a, b) => a.t - b.t)) : null;
    finalVal += v;
  });
  const invested = holdings.reduce((s, h) => s + pf[h.key].invested, 0);

  const starts = holdings.map((h) => pf[h.key].start).filter((t) => isFinite(t));
  const gridStart = starts.length ? Math.min(...starts) : end;
  const curve = monthlyGrid(gridStart, end).map((g) => {
    let val = 0;
    holdings.forEach((h) => { const u = pf[h.key].buys.reduce((s, b) => (b.t <= g ? s + b.units : s), 0); const px = asof(h.series, g); if (px) val += u * px.nav; });
    const inv = flows.reduce((s, f) => (f.t <= g ? s - f.amt : s), 0);
    return { t: g, value: val, invested: inv };
  });

  const portXirr = flows.length ? xirr([...flows, { t: end, amt: finalVal }].sort((a, b) => a.t - b.t)) : null;

  let bench = null;
  if (benchmark) {
    let bu = 0, binv = 0; const bflows = [];
    [...agg.entries()].sort((a, b) => a[0] - b[0]).forEach(([t, amt]) => { const px = fwd(benchmark.series, t); if (px) { bu += amt / px.nav; binv += amt; bflows.push({ t: px.t, amt: -amt }); } });
    const bpx = asof(benchmark.series, end); const bval = bpx ? bu * bpx.nav : 0;
    bench = { invested: binv, value: bval, xirr: bflows.length ? xirr([...bflows, { t: end, amt: bval }].sort((a, b) => a.t - b.t)) : null, name: benchmark.name, partial: binv < invested - 1 };
  }
  return { invested, finalVal, gain: finalVal - invested, absRet: invested ? (finalVal - invested) / invested : 0, xirr: portXirr, perFund: pf, curve, bench, gridStart };
}

/* ---------------- formatting ---------------- */
const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
const inrShort = (n) => { const a = Math.abs(n); if (a >= 1e7) return "₹" + (n / 1e7).toFixed(2) + " Cr"; if (a >= 1e5) return "₹" + (n / 1e5).toFixed(2) + " L"; if (a >= 1e3) return "₹" + (n / 1e3).toFixed(1) + "k"; return "₹" + Math.round(n); };
const pct = (n) => (n == null || !isFinite(n) ? "—" : (n * 100).toFixed(2) + "%");
const fmtDate = (t) => new Date(t).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const fmtMon = (t) => new Date(t).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
const uid = () => Math.random().toString(36).slice(2, 9);
const strategyLabel = (h) => h.mode === "sip" ? `SIP ${inrShort(h.monthly)}/mo` : h.mode === "lumpsum" ? `Lumpsum ${inrShort(h.lumpsum)}` : `${inrShort(h.lumpsum)} + ${inrShort(h.monthly)}/mo`;
const PALETTE = ["#2e7d32", "#43a047", "#1b5e20", "#66bb6a", "#7cb342", "#9ccc65", "#558b2f", "#33691e"];

/* ---------------- chart SVG string (for PDF) ---------------- */
function chartSVG(curve, w = 680, h = 230) {
  const data = curve.filter((c) => isFinite(c.value)); if (data.length < 2) return "";
  const padT = 10, padB = 22, padX = 4;
  const xs = data.map((d) => d.t), minX = xs[0], maxX = xs[xs.length - 1];
  const maxV = Math.max(...data.map((d) => Math.max(d.value, d.invested)), 1);
  const X = (t) => padX + ((t - minX) / (maxX - minX || 1)) * (w - padX * 2);
  const Yc = (v) => padT + (1 - v / maxV) * (h - padT - padB);
  const line = (k) => data.map((d, i) => `${i ? "L" : "M"}${X(d.t).toFixed(1)},${Yc(d[k]).toFixed(1)}`).join(" ");
  const area = `${line("value")} L${X(maxX).toFixed(1)},${Yc(0).toFixed(1)} L${X(minX).toFixed(1)},${Yc(0).toFixed(1)} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" xmlns="http://www.w3.org/2000/svg">
<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#2e7d32" stop-opacity=".2"/><stop offset="100%" stop-color="#2e7d32" stop-opacity="0"/></linearGradient></defs>
<rect x="0" y="0" width="${w}" height="${h}" fill="#fbfdfb"/>
<path d="${area}" fill="url(#g)"/>
<path d="${line("invested")}" fill="none" stroke="#a8cfa8" stroke-width="1.4" stroke-dasharray="4 4"/>
<path d="${line("value")}" fill="none" stroke="#2e7d32" stroke-width="2.2"/></svg>`;
}

/* ---------------- resilient fetch (mfapi can return transient empties / host errors) ---------------- */
async function fetchJSON(url, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      const txt = await r.text();
      const s = txt.trim();
      if (s.startsWith("{") || s.startsWith("[")) return JSON.parse(s);
      lastErr = new Error("non-JSON response");
    } catch (e) { lastErr = e; }
    await new Promise((res) => setTimeout(res, 350 * (i + 1)));
  }
  throw lastErr || new Error("network error");
}

/* ---------------- predecessor lineage (verified 1:1 scheme transfers) ----------------
   Keyed by CURRENT scheme code -> same-plan predecessor code. A curated map ensures
   we never link unrelated funds; a runtime boundary check (below) then refuses any
   splice that isn't actually continuous, so even a wrong entry can't fabricate history.
   JPMorgan India AMC -> Edelweiss MF, schemes transferred 28-Nov-2016.            */
const LINEAGE = {
  140225: { pred: 107301, from: "JPMorgan India Mid and Small Cap Fund (Regular)" }, // Edelweiss Mid Cap Reg-Growth
  140228: { pred: 119869, from: "JPMorgan India Mid and Small Cap Fund (Direct)" },  // Edelweiss Mid Cap Dir-Growth
};

// Return-link a predecessor series onto a current one: scale the predecessor so its
// last NAV meets the current series' first NAV (preserving predecessor RETURNS, not
// absolute NAV). Only applied if the boundary is genuinely continuous.
function stitchSeries(current, pred) {
  if (!pred || pred.length < 2 || !current.length) return null;
  const cFirst = current[0], pLast = pred[pred.length - 1];
  const gapDays = (cFirst.t - pLast.t) / DAY;
  const ratio = cFirst.nav / pLast.nav;
  if (!(gapDays > 0 && gapDays <= 12 && ratio > 0.85 && ratio < 1.2)) return null; // not a clean transfer
  const k = cFirst.nav / pLast.nav;
  const head = pred.filter((p) => p.t < cFirst.t).map((p) => ({ t: p.t, nav: p.nav * k }));
  if (!head.length) return null;
  return { series: [...head, ...current], spliceDate: cFirst.t, from: pred[0].t };
}

/* ---------------- shareable portfolio state (URL ?p=) ---------------- */
function encodeState(s) {
  try {
    const json = JSON.stringify(s);
    const b64 = (typeof window !== "undefined" ? window.btoa : (x) => Buffer.from(x).toString("base64"))(unescape(encodeURIComponent(json)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch (e) { return ""; }
}
function decodeState(p) {
  try {
    const b64 = p.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape((typeof window !== "undefined" ? window.atob : (x) => Buffer.from(x, "base64").toString())(b64)));
    return JSON.parse(json);
  } catch (e) { return null; }
}

/* ---------------- risk analytics on a blended (allocation-weighted) price index ---------------- */
// Build a unit-value index (base 100) of the chosen basket, weighted by each fund's
// share of money invested. Independent of contribution timing — the honest basis for
// drawdown / volatility / best-worst, the way a factsheet would report them.
function blendedIndex(funds, winStart, winEnd) {
  const valid = funds.filter((f) => f.series && f.series.length > 1 && f.weight > 0);
  if (!valid.length) return [];
  const wsum = valid.reduce((s, f) => s + f.weight, 0) || 1;
  let start = Math.max(...valid.map((f) => f.series[0].t));
  let end = Math.min(...valid.map((f) => f.series[f.series.length - 1].t));
  if (winStart) start = Math.max(start, winStart);
  if (winEnd) end = Math.min(end, winEnd);
  if (!(start < end)) return [];
  const base = valid.map((f) => asof(f.series, start)?.nav || null);
  return monthlyGrid(start, end).map((g) => {
    let idx = 0, ok = false;
    valid.forEach((f, i) => { const px = asof(f.series, g); if (px && base[i]) { idx += (f.weight / wsum) * (px.nav / base[i]); ok = true; } });
    return { t: g, v: ok ? idx * 100 : null };
  }).filter((p) => p.v != null);
}
function riskMetrics(index) {
  if (!index || index.length < 3) return null;
  const v = index.map((p) => p.v), t = index.map((p) => p.t);
  const years = (t[t.length - 1] - t[0]) / Y;
  const cagr = years > 0 ? Math.pow(v[v.length - 1] / v[0], 1 / years) - 1 : null;
  // monthly returns -> annualised volatility
  const rets = [];
  for (let i = 1; i < v.length; i++) rets.push(v[i] / v[i - 1] - 1);
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1);
  const vol = Math.sqrt(variance) * Math.sqrt(12);
  // drawdown + underwater series
  let peak = v[0], peakT = t[0], maxDD = 0, ddTroughT = null, ddPeakT = null, ddPeakV = null, recoverT = null;
  const under = [];
  for (let i = 0; i < v.length; i++) {
    if (v[i] > peak) { peak = v[i]; peakT = t[i]; }
    const dd = v[i] / peak - 1;
    under.push({ t: t[i], dd });
    if (dd < maxDD) { maxDD = dd; ddTroughT = t[i]; ddPeakT = peakT; ddPeakV = peak; }
  }
  if (ddTroughT != null) { for (let i = 0; i < v.length; i++) { if (t[i] > ddTroughT && v[i] >= ddPeakV) { recoverT = t[i]; break; } } }
  // best / worst rolling 1Y (≈12 month-steps)
  let best1y = null, worst1y = null;
  if (v.length > 12) {
    for (let i = 12; i < v.length; i++) { const r = v[i] / v[i - 12] - 1; if (best1y == null || r > best1y) best1y = r; if (worst1y == null || r < worst1y) worst1y = r; }
  }
  return { cagr, vol, maxDD, ddPeakT, ddTroughT, recoverT, best1y, worst1y, retPerRisk: vol > 0 && cagr != null ? cagr / vol : null, under, start: t[0], end: t[t.length - 1] };
}

/* ===================================================================== */
export default function BacktestPage() {
  const [holdings, setHoldings] = useState([]);
  const [defaults, setDefaults] = useState({ mode: "sip", monthly: 10000, lumpsum: 100000 });
  const [sipDay, setSipDay] = useState(1);
  const [startMode, setStartMode] = useState("lookback"); // lookback | date
  const [lookback, setLookback] = useState("5"); // years | "max"
  const [startDate, setStartDate] = useState("");
  const [benchOn, setBenchOn] = useState(false);
  const [bench, setBench] = useState(null);
  const [stitch, setStitch] = useState(true);
  const [stepUpPct, setStepUpPct] = useState(0);

  const [sifList, setSifList] = useState([]);
  const [picker, setPicker] = useState(false);
  const [pickFor, setPickFor] = useState("holding");

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const cache = useRef({});

  useEffect(() => { fetch("/api/sif-nav").then((r) => r.json()).then((d) => setSifList(d.schemes || [])).catch(() => {}); }, []);

  // Restore a shared portfolio from the URL (?p=)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search).get("p");
    if (!p) return;
    const s = decodeState(p);
    if (!s || !Array.isArray(s.h)) return;
    setHoldings(s.h.map((x) => ({ key: uid(), kind: x.k, id: x.i, name: x.n, cat: x.c, mode: x.m || "sip", monthly: x.mo ?? 10000, lumpsum: x.l ?? 100000, startMode: x.sm || "default", customStart: x.cs || "" })));
    if (s.sd != null) setSipDay(s.sd);
    if (s.smo) setStartMode(s.smo);
    if (s.lb != null) setLookback(String(s.lb));
    if (s.sdt) setStartDate(s.sdt);
    if (s.su != null) setStepUpPct(s.su);
    if (s.st != null) setStitch(!!s.st);
    if (s.bo && s.b) { setBenchOn(true); setBench({ key: "bench", kind: s.b.k, id: s.b.i, name: s.b.n }); }
  }, []);

  const buildShareState = () => ({
    v: 1,
    h: holdings.map((h) => ({ k: h.kind, i: h.id, n: h.name, c: h.cat, m: h.mode, mo: h.monthly, l: h.lumpsum, sm: h.startMode, cs: h.customStart })),
    sd: sipDay, smo: startMode, lb: lookback, sdt: startDate, su: stepUpPct, st: stitch ? 1 : 0,
    bo: benchOn ? 1 : 0, b: bench ? { k: bench.kind, i: bench.id, n: bench.name } : null,
  });
  const shareUrl = () => (typeof window === "undefined" ? "" : `${window.location.origin}/backtest?p=${encodeState(buildShareState())}`);
  const flashToast = (m) => { setToast(m); setTimeout(() => setToast(""), 2400); };
  const onShare = async () => {
    const url = shareUrl();
    try { window.history.replaceState(null, "", `/backtest?p=${encodeState(buildShareState())}`); } catch (e) {}
    try { await navigator.clipboard.writeText(url); flashToast("Shareable link copied to clipboard"); }
    catch (e) { flashToast("Link ready in the address bar"); }
  };

  /* holdings ops */
  const addHolding = (item) => {
    if (pickFor === "bench") { setBench({ key: "bench", ...item }); setPicker(false); return; }
    // Duplicates are allowed on purpose — the same fund may be added again as a
    // separate tranche (different start date / extra lumpsum or SIP). We nudge
    // subtly in the UI rather than block it.
    setHoldings((p) => [...p, { key: uid(), mode: defaults.mode, monthly: defaults.monthly, lumpsum: defaults.lumpsum, startMode: "default", customStart: "", ...item }]);
    setPicker(false);
  };
  const patch = (key, kv) => setHoldings((p) => p.map((h) => (h.key === key ? { ...h, ...kv } : h)));
  const remove = (key) => setHoldings((p) => p.filter((h) => h.key !== key));
  const applyDefaultsToAll = () => setHoldings((p) => p.map((h) => ({ ...h, mode: defaults.mode, monthly: defaults.monthly, lumpsum: defaults.lumpsum })));
  const fundKey = (h) => h.kind + ":" + h.id;
  const dupCounts = holdings.reduce((m, h) => { const k = fundKey(h); m[k] = (m[k] || 0) + 1; return m; }, {});
  const hasDupes = Object.values(dupCounts).some((n) => n > 1);

  /* data */
  async function loadSeries(item) {
    const id = item.kind + ":" + (stitch ? "S:" : "") + item.id;
    if (cache.current[id]) return cache.current[id];
    let series = [], authName = item.name, stitchInfo = null;
    if (item.kind === "mf") {
      const d = await fetchJSON(`/api/mf?code=${item.id}`);
      if (!d?.data?.length) throw new Error(`No NAV history found for "${item.name}". This is usually a discontinued or merged scheme code — please search for the current fund.`);
      series = normSeries(d.data, "mf");
      // Trust the NAV endpoint's own metadata as the single source of truth for the name.
      if (d.meta?.scheme_name) authName = d.meta.scheme_name;
      // Freshness guard on the CURRENT scheme (AMFI keeps merged/closed codes frozen).
      const lastNow = series[series.length - 1].t;
      if ((todayUTC() - lastNow) / DAY > 30) throw new Error(`"${authName}" looks discontinued or merged — its NAV history ends ${fmtDate(lastNow)} and is no longer updated. Merged/closed scheme codes stay searchable in the AMFI list but freeze. Please pick the current scheme instead.`);
      // Pre-merger stitch: prepend the verified predecessor series, return-linked.
      if (stitch && LINEAGE[item.id]) {
        try {
          const pd = await fetchJSON(`/api/mf?code=${LINEAGE[item.id].pred}`);
          if (pd?.data?.length) {
            const st = stitchSeries(series, normSeries(pd.data, "mf"));
            if (st) { series = st.series; stitchInfo = { spliceDate: st.spliceDate, from: st.from, fromName: LINEAGE[item.id].from }; }
          }
        } catch (e) { /* predecessor is optional enrichment — ignore failures */ }
      }
    } else {
      const d = await fetchJSON(`/api/sif-history?sd_id=${encodeURIComponent(item.id)}&from=2024-01-01&to=${toYMD(todayUTC())}`);
      if (!d?.records?.length) throw new Error(`No NAV history for ${item.name}`);
      series = normSeries(d.records, "sif");
      const lastNow = series[series.length - 1].t;
      if ((todayUTC() - lastNow) / DAY > 30) throw new Error(`"${item.name}" has no recent NAV — its history ends ${fmtDate(lastNow)}.`);
    }
    if (series.length < 2) throw new Error(`Not enough NAV history for ${item.name}`);
    const obj = { series, inception: series[0].t, last: series[series.length - 1].t, name: authName, stitch: stitchInfo };
    cache.current[id] = obj; return obj;
  }

  async function run() {
    setErr(""); setResult(null);
    if (!holdings.length) { setErr("Add at least one fund or SIF to your portfolio."); return; }
    for (const h of holdings) {
      if ((h.mode === "sip" || h.mode === "combo") && (+h.monthly || 0) <= 0) { setErr(`Enter a monthly SIP amount for ${h.name}.`); return; }
      if ((h.mode === "lumpsum" || h.mode === "combo") && (+h.lumpsum || 0) <= 0) { setErr(`Enter a lumpsum amount for ${h.name}.`); return; }
    }
    setRunning(true);
    try {
      const all = [...holdings]; if (benchOn && bench) all.push(bench);
      const loaded = await Promise.all(all.map((h) => loadSeries(h).then((s) => ({ ...h, ...s }))));
      const port = loaded.slice(0, holdings.length);
      // self-correct each card's label to the authoritative scheme name tied to its NAV series
      setHoldings((prev) => prev.map((h) => { const m = port.find((p) => p.key === h.key); return m?.name && m.name !== h.name ? { ...h, name: m.name } : h; }));
      const bchk = benchOn && bench ? loaded[loaded.length - 1] : null;

      const end = todayUTC();
      let defaultStart;
      if (startMode === "date" && startDate) defaultStart = pYMD(startDate);
      else if (lookback === "max") defaultStart = 0;
      else defaultStart = end - parseInt(lookback, 10) * Y;

      const res = runBacktest({ holdings: port, sipDay, defaultStart, end, benchmark: bchk, stepUp: (stepUpPct || 0) / 100 });
      if (res.invested <= 0) throw new Error("No investments could be placed in the selected window. Check your start dates against each fund's launch date.");
      const stitched = port.filter((p) => p.stitch).map((p) => ({ name: p.name, ...p.stitch }));
      setResult({ ...res, end, port, bench: res.bench, years: (end - res.gridStart) / Y, generatedAt: Date.now(), stitched, splices: [...new Set(stitched.map((s) => s.spliceDate))] });
      try { window.history.replaceState(null, "", `/backtest?p=${encodeState(buildShareState())}`); } catch (e) {}
    } catch (e) { setErr(e.message || "Something went wrong."); }
    finally { setRunning(false); }
  }

  return (
    <>
      <div className="container">
        <Navbar activePage="backtest" />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />

        <div className="page-header">
          <div className="page-eyebrow"><span className="live-dot" /><span className="page-eyebrow-text">Backtest · Hypothetical illustration</span></div>
          <h1 className="page-title">Portfolio <span>Backtester</span></h1>
          <p className="page-subtitle">Give every fund its own strategy, amount and start date — then replay the whole basket through real historical NAVs.</p>
        </div>

        <div className="bt-body">
          {/* ---- builder ---- */}
          <section className="bt-card">
            <div className="bt-card-h"><span className="bt-step">1</span><h2>Build your portfolio</h2></div>

            {holdings.length === 0 && (
              <div className="bt-empty"><div className="bt-empty-ic">＋</div><p>No holdings yet. Add mutual funds or SIFs — each gets its own plan.</p></div>
            )}

            <div className="bt-holdings">
              {holdings.map((h, i) => {
                const total = dupCounts[fundKey(h)];
                const occ = holdings.slice(0, i).filter((x) => fundKey(x) === fundKey(h)).length + 1;
                return (
                <div className="bt-hold" key={h.key}>
                  <div className="bt-hold-top">
                    <span className="bt-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <div className="bt-hold-main">
                      <div className="bt-hold-name">{h.name}</div>
                      <div className="bt-hold-tag"><span className={`bt-kind bt-kind-${h.kind}`}>{h.kind === "mf" ? "Mutual Fund" : "SIF"}</span>{total > 1 && <span className="bt-tranche">tranche {occ} of {total}</span>}{h.cat && <span className="bt-cat">{h.cat}</span>}</div>
                    </div>
                    <button className="bt-x" onClick={() => remove(h.key)} aria-label="Remove">×</button>
                  </div>
                  <div className="bt-strat">
                    <div className="bt-mseg">
                      {[["sip", "SIP"], ["lumpsum", "Lumpsum"], ["combo", "Both"]].map(([v, l]) => (
                        <button key={v} className={h.mode === v ? "on" : ""} onClick={() => patch(h.key, { mode: v })}>{l}</button>
                      ))}
                    </div>
                    {(h.mode === "lumpsum" || h.mode === "combo") && (
                      <label className="bt-sfield"><span>Lumpsum</span><div className="bt-inp sm"><i>₹</i><input type="number" min="0" inputMode="numeric" value={h.lumpsum} onChange={(e) => patch(h.key, { lumpsum: Math.max(0, +e.target.value || 0) })} /></div></label>
                    )}
                    {(h.mode === "sip" || h.mode === "combo") && (
                      <label className="bt-sfield"><span>Monthly SIP</span><div className="bt-inp sm"><i>₹</i><input type="number" min="0" inputMode="numeric" value={h.monthly} onChange={(e) => patch(h.key, { monthly: Math.max(0, +e.target.value || 0) })} /></div></label>
                    )}
                    <label className="bt-sfield bt-startf">
                      <span>Start</span>
                      <div className="bt-startrow">
                        <button className={`bt-startbtn ${h.startMode === "default" ? "on" : ""}`} onClick={() => patch(h.key, { startMode: "default" })}>Portfolio start</button>
                        <button className={`bt-startbtn ${h.startMode === "custom" ? "on" : ""}`} onClick={() => patch(h.key, { startMode: "custom" })}>Custom</button>
                        {h.startMode === "custom" && (
                          <input className="bt-date" type="date" max={toYMD(todayUTC())} value={h.customStart} onChange={(e) => patch(h.key, { customStart: e.target.value })} />
                        )}
                      </div>
                    </label>
                  </div>
                </div>
                );
              })}
            </div>
            {hasDupes && <div className="bt-duptip">ⓘ Same fund added more than once — that's fine for staggered tranches (e.g. a later lumpsum or a second SIP). Totals combine across them.</div>}

            {/* defaults strip + add */}
            <div className="bt-defaults">
              <div className="bt-def-lbl">New holdings start as</div>
              <div className="bt-mseg sm">
                {[["sip", "SIP"], ["lumpsum", "Lumpsum"], ["combo", "Both"]].map(([v, l]) => (
                  <button key={v} className={defaults.mode === v ? "on" : ""} onClick={() => setDefaults((d) => ({ ...d, mode: v }))}>{l}</button>
                ))}
              </div>
              {(defaults.mode === "lumpsum" || defaults.mode === "combo") && (
                <div className="bt-inp sm"><i>₹</i><input type="number" min="0" value={defaults.lumpsum} onChange={(e) => setDefaults((d) => ({ ...d, lumpsum: Math.max(0, +e.target.value || 0) }))} /></div>
              )}
              {(defaults.mode === "sip" || defaults.mode === "combo") && (
                <div className="bt-inp sm"><i>₹</i><input type="number" min="0" value={defaults.monthly} onChange={(e) => setDefaults((d) => ({ ...d, monthly: Math.max(0, +e.target.value || 0) }))} /><span className="bt-permo">/mo</span></div>
              )}
              {holdings.length > 0 && <button className="bt-link" onClick={applyDefaultsToAll}>apply to all</button>}
            </div>
            <button className="bt-btn bt-btn-pri" onClick={() => { setPickFor("holding"); setPicker(true); }}>＋ Add fund / SIF</button>
          </section>

          {/* ---- plan settings ---- */}
          <section className="bt-card">
            <div className="bt-card-h"><span className="bt-step">2</span><h2>Plan settings</h2></div>
            <div className="bt-fields">
              <label className="bt-field">
                <span>Portfolio start <em>(default for all funds)</em></span>
                <div className="bt-startrow">
                  <button className={`bt-startbtn ${startMode === "lookback" ? "on" : ""}`} onClick={() => setStartMode("lookback")}>Look-back</button>
                  <button className={`bt-startbtn ${startMode === "date" ? "on" : ""}`} onClick={() => setStartMode("date")}>From date</button>
                </div>
                {startMode === "lookback" ? (
                  <div className="bt-inp"><select value={lookback} onChange={(e) => setLookback(e.target.value)}>
                    <option value="1">1 year</option><option value="3">3 years</option><option value="5">5 years</option><option value="7">7 years</option><option value="10">10 years</option><option value="max">Max (each fund's launch)</option>
                  </select></div>
                ) : (
                  <div className="bt-inp"><input type="date" max={toYMD(todayUTC())} value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
                )}
              </label>
              <label className="bt-field bt-field-sm">
                <span>SIP date</span>
                <div className="bt-inp"><select value={sipDay} onChange={(e) => setSipDay(+e.target.value)}>{[1, 5, 10, 15, 20, 25].map((d) => <option key={d} value={d}>{d}{d === 1 ? "st" : "th"} of month</option>)}</select></div>
              </label>
              <label className="bt-field bt-field-sm">
                <span>SIP step-up <em>(per year)</em></span>
                <div className="bt-inp"><select value={stepUpPct} onChange={(e) => setStepUpPct(+e.target.value)}>{[0, 5, 10, 15, 20].map((d) => <option key={d} value={d}>{d === 0 ? "None" : d + "% a year"}</option>)}</select></div>
              </label>
            </div>
            <label className="bt-check bt-stitch"><input type="checkbox" checked={stitch} onChange={(e) => setStitch(e.target.checked)} /><span>Include pre-merger history where available <em>(e.g. JPMorgan → Edelweiss, return-linked)</em></span></label>
            <div className="bt-bench">
              <label className="bt-check"><input type="checkbox" checked={benchOn} onChange={(e) => setBenchOn(e.target.checked)} /><span>Compare against a benchmark fund</span></label>
              {benchOn && (
                <div className="bt-bench-pick">
                  {bench ? (
                    <div className="bt-bench-sel"><span className="bt-dot" style={{ background: "#8d6e63" }} /><span className="bt-bench-name">{bench.name}</span><button className="bt-x sm" onClick={() => setBench(null)}>×</button></div>
                  ) : (
                    <button className="bt-btn bt-ghost sm" onClick={() => { setPickFor("bench"); setPicker(true); }}>Pick benchmark (e.g. a Nifty 50 index fund)</button>
                  )}
                  <p className="bt-bench-hint">The benchmark receives the exact same rupee cash-flows as your whole portfolio.</p>
                </div>
              )}
            </div>
            <button className="bt-run" onClick={run} disabled={running}>{running ? <span className="bt-spin" /> : "▸"} {running ? "Replaying NAV history…" : "Run backtest"}</button>
            {err && <div className="bt-err">{err}</div>}
          </section>
        </div>

        {result && <Results r={result} sipDay={sipDay} onShare={onShare} shareUrl={shareUrl} />}

        <FAQ />

        <div className="bt-disc">
          <strong>Important:</strong> This is a <b>hypothetical, back-tested illustration</b> built from historical NAVs for education only — it is <b>not investment advice</b> and not a recommendation of any scheme. <b>Past performance is not indicative of future results.</b> Mutual fund investments are subject to market risks; read all scheme-related documents carefully. SIFs are a newer, higher-risk category with limited live history, so their back-tests cover short periods only. Figures exclude exit loads, stamp duty, STT, expense-ratio changes and taxes, and execute each instalment at the next available trading-day NAV.
          <div className="bt-arn">Abundance Financial Services® · ARN-251838 · EUIN: E334718 · AMFI-Registered Mutual Fund &amp; SIF Distributor</div>
        </div>
      </div>

      <Footer activePage="backtest" />
      {picker && <Picker sifList={sifList} onPick={addHolding} onClose={() => setPicker(false)} mode={pickFor} />}
      {toast && <div className="bt-toast">{toast}</div>}
    </>
  );
}

/* ===================== RESULTS ===================== */
function Results({ r, sipDay, onShare, shareUrl }) {
  const gainPos = r.gain >= 0;
  const [detail, setDetail] = useState(null);
  const rows = r.port.map((h, i) => ({ ...h, ...r.perFund[h.key], color: PALETTE[i % PALETTE.length], share: r.finalVal ? (r.perFund[h.key].value / r.finalVal) * 100 : 0 })).sort((a, b) => b.value - a.value);
  const clampedAny = rows.filter((h) => h.clamped);
  const risk = useMemo(() => riskMetrics(blendedIndex(r.port.map((h) => ({ series: h.series, weight: r.perFund[h.key].invested })), r.gridStart, r.end)), [r]);

  const exportPDF = () => doExport(r, rows, sipDay);

  return (
    <section className="bt-card bt-res">
      <div className="bt-card-h">
        <span className="bt-step done">✓</span><h2>Results</h2>
        <span className="bt-period">{fmtDate(r.gridStart)} → {fmtDate(r.end)} · {r.years.toFixed(1)} yrs</span>
        <button className="bt-pdf bt-share" onClick={onShare}>⤴ Share</button>
        <button className="bt-pdf" onClick={exportPDF}>⤓ Export PDF</button>
      </div>

      {clampedAny.length > 0 && (
        <div className="bt-note">ⓘ {clampedAny.map((h) => h.name).join(", ")} {clampedAny.length > 1 ? "were" : "was"} requested to start before {clampedAny.length > 1 ? "their" : "its"} launch — started at inception instead.</div>
      )}

      {r.stitched?.length > 0 && (
        <div className="bt-note bt-note-ok">↩ Pre-merger history linked: {r.stitched.map((s) => s.name + " ← " + s.fromName + ", back to " + fmtDate(s.from)).join(" · ")}. Older NAVs are return-linked at the transfer date (dashed marker on the chart).</div>
      )}

      <div className="bt-kpis">
        <Kpi label="Invested"><CountUp value={r.invested} format={inr} /></Kpi>
        <Kpi label="Final value" accent><CountUp value={r.finalVal} format={inr} /></Kpi>
        <Kpi label="Gain" sign={gainPos ? "pos" : "neg"}><CountUp value={r.gain} format={(n) => (n >= 0 ? "+" : "−") + inr(Math.abs(n)).slice(1)} /></Kpi>
        <Kpi label="Absolute return" sign={r.absRet >= 0 ? "pos" : "neg"}><CountUp value={r.absRet * 100} format={(n) => (n >= 0 ? "+" : "") + n.toFixed(1) + "%"} /></Kpi>
        <Kpi label="XIRR (p.a.)" sign={r.xirr >= 0 ? "pos" : "neg"} hint="money-weighted annualised">{r.xirr == null ? "—" : <CountUp value={r.xirr * 100} format={(n) => n.toFixed(2) + "%"} />}</Kpi>
      </div>

      <Chart curve={r.curve} splices={r.splices} />

      {risk && <RiskPanel m={risk} />}

      {r.bench && (
        <div className="bt-compare">
          <div className="bt-cmp-row bt-cmp-head"><span>Strategy</span><span>Final value</span><span>XIRR</span></div>
          <div className="bt-cmp-row"><span><b>Your portfolio</b></span><span>{inr(r.finalVal)}</span><span className={r.xirr >= 0 ? "pos" : "neg"}>{pct(r.xirr)}</span></div>
          <div className="bt-cmp-row"><span>{r.bench.name} <em>(benchmark)</em></span><span>{inr(r.bench.value)}</span><span className={r.bench.xirr >= 0 ? "pos" : "neg"}>{pct(r.bench.xirr)}</span></div>
          <div className="bt-cmp-foot">{r.bench.partial ? "Benchmark history is shorter than the portfolio period, so this comparison is partial." : r.xirr >= r.bench.xirr ? `Your portfolio out-performed the benchmark by ${((r.xirr - r.bench.xirr) * 100).toFixed(2)} pts of XIRR.` : `The benchmark out-performed your portfolio by ${((r.bench.xirr - r.xirr) * 100).toFixed(2)} pts of XIRR.`}</div>
        </div>
      )}

      <div className="bt-table-wrap">
        <table className="bt-table">
          <thead><tr><th>Holding</th><th>Strategy</th><th>Start</th><th>Invested</th><th>Value</th><th>XIRR</th></tr></thead>
          <tbody>
            {rows.map((h) => (
              <tr key={h.key} className="bt-trow" onClick={() => setDetail(h)}>
                <td><button className="bt-fundlink" onClick={(e) => { e.stopPropagation(); setDetail(h); }}><span className="bt-dot sm" style={{ background: h.color }} />{h.name}<span className={`bt-kind bt-kind-${h.kind} mini`}>{h.kind === "mf" ? "MF" : "SIF"}</span><span className="bt-chev">›</span></button></td>
                <td className="bt-l">{strategyLabel(h)}</td>
                <td className="bt-l">{fmtMon(h.start)}</td>
                <td>{inrShort(h.invested)}</td>
                <td>{inrShort(h.value)}</td>
                <td className={h.xirr >= 0 ? "pos" : "neg"}>{pct(h.xirr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="bt-tap-hint">Tap any holding to see its own performance →</div>
      </div>

      <div className="bt-cta">
        <div className="bt-cta-txt">
          <div className="bt-cta-h">Turn this into a real plan</div>
          <p>Get this portfolio reviewed by Abundance — we’ll factor in your goals, risk and taxes. No obligation.</p>
        </div>
        <a className="bt-cta-btn" target="_blank" rel="noopener noreferrer"
          href={`https://wa.me/919808105923?text=${encodeURIComponent(
            `Hi Abundance, I built a portfolio backtest on MFCalc:\n` +
            `• ${r.port.length} holding(s), ${r.years.toFixed(1)} yrs\n` +
            `• Invested ${inr(r.invested)} → Value ${inr(r.finalVal)} (XIRR ${pct(r.xirr)})\n` +
            `I'd like a review. Here's the link:\n${shareUrl ? shareUrl() : ""}`
          )}`}>
          <span className="bt-wa">✆</span> Review on WhatsApp
        </a>
      </div>

      {detail && <FundDetail row={detail} end={r.end} onClose={() => setDetail(null)} />}
    </section>
  );
}

/* ===================== RISK / DRAWDOWN PANEL ===================== */
function RiskPanel({ m }) {
  const recov = m.recoverT ? `${Math.round((m.recoverT - m.ddTroughT) / DAY / 30.4)} mo to recover` : "not yet recovered";
  return (
    <div className="bt-risk">
      <div className="bt-risk-h">Risk &amp; drawdown <em>· allocation-weighted basket, month-end basis</em></div>
      <div className="bt-risk-kpis">
        <div className="bt-rk"><span>Max drawdown</span><b className="neg">{(m.maxDD * 100).toFixed(1)}%</b><i>{m.ddPeakT ? `${fmtMon(m.ddPeakT)} → ${fmtMon(m.ddTroughT)}` : ""}</i></div>
        <div className="bt-rk"><span>Volatility p.a.</span><b>{(m.vol * 100).toFixed(1)}%</b><i>annualised</i></div>
        <div className="bt-rk"><span>Best 1-yr</span><b className="pos">{m.best1y == null ? "—" : "+" + (m.best1y * 100).toFixed(1) + "%"}</b><i>rolling</i></div>
        <div className="bt-rk"><span>Worst 1-yr</span><b className={m.worst1y < 0 ? "neg" : "pos"}>{m.worst1y == null ? "—" : (m.worst1y >= 0 ? "+" : "") + (m.worst1y * 100).toFixed(1) + "%"}</b><i>rolling</i></div>
        <div className="bt-rk"><span>Return / risk</span><b>{m.retPerRisk == null ? "—" : m.retPerRisk.toFixed(2)}</b><i>CAGR ÷ vol</i></div>
      </div>
      <Underwater under={m.under} recovLabel={recov} />
    </div>
  );
}
function Underwater({ under, recovLabel }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = 96, padX = 6, padB = 4;
  const data = under.filter((d) => isFinite(d.dd)); if (data.length < 2) return null;
  const xs = data.map((d) => d.t), minX = xs[0], maxX = xs[xs.length - 1];
  const minDD = Math.min(...data.map((d) => d.dd), -0.0001);
  const X = (t) => padX + ((t - minX) / (maxX - minX || 1)) * (W - padX * 2);
  const Yc = (d) => (d / minDD) * (H - padB); // 0 at top, deepest at bottom
  const path = data.map((d, i) => `${i ? "L" : "M"}${X(d.t).toFixed(1)},${Yc(d.dd).toFixed(1)}`).join(" ");
  const area = `${path} L${X(maxX).toFixed(1)},0 L${X(minX).toFixed(1)},0 Z`;
  const locate = (e) => { const svg = e.currentTarget; const rect = svg.getBoundingClientRect(); const px = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)) * W; let best = data[0], bd = Infinity; for (const d of data) { const dd = Math.abs(X(d.t) - px); if (dd < bd) { bd = dd; best = d; } } setHover(best); };
  return (
    <div className="bt-uw">
      <div className="bt-uw-lbl"><span>Underwater (drawdown from peak)</span><span className="bt-uw-recov">{recovLabel}</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerMove={locate} onPointerDown={locate} onPointerLeave={() => setHover(null)}>
        <path d={area} fill="#ef535022" />
        <path d={path} fill="none" stroke="#b71c1c" strokeWidth="1.6" />
        {hover && (<g><line x1={X(hover.t)} x2={X(hover.t)} y1={0} y2={H} stroke="#ef9a9a" strokeWidth="1" strokeDasharray="3 3" /><circle cx={X(hover.t)} cy={Yc(hover.dd)} r="3.5" fill="#b71c1c" /></g>)}
      </svg>
      {hover && <div className="bt-uw-tip">{fmtMon(hover.t)} · <b className="neg">{(hover.dd * 100).toFixed(1)}%</b></div>}
    </div>
  );
}
function Kpi({ label, val, sign, accent, hint, children }) {
  return (<div className={`bt-kpi ${accent ? "accent" : ""}`}><div className="bt-kpi-l">{label}</div><div className={`bt-kpi-v ${sign || ""}`}>{children ?? val}</div>{hint && <div className="bt-kpi-h">{hint}</div>}</div>);
}

// Eased count-up for headline numbers (respects reduced-motion).
function CountUp({ value, format, duration = 950 }) {
  const [v, setV] = useState(value);
  const raf = useRef();
  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !isFinite(value)) { setV(value); return; }
    const start = performance.now(); const ease = (t) => 1 - Math.pow(1 - t, 3);
    const tick = (now) => { const p = Math.min(1, (now - start) / duration); setV(value * ease(p)); if (p < 1) raf.current = requestAnimationFrame(tick); };
    setV(0); raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);
  return <>{format(v)}</>;
}

/* ===================== CHART ===================== */
function Chart({ curve, splices = [], height = 260, gid = "p", valueLabel = "Portfolio value" }) {
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);
  const W = 720, H = height, padX = 8, padT = 16, padB = 26;
  const data = curve.filter((c) => isFinite(c.value)); if (data.length < 2) return null;
  const xs = data.map((d) => d.t), minX = xs[0], maxX = xs[xs.length - 1];
  const maxV = Math.max(...data.map((d) => Math.max(d.value, d.invested)), 1);
  const X = (t) => padX + ((t - minX) / (maxX - minX || 1)) * (W - padX * 2);
  const Yc = (v) => padT + (1 - v / maxV) * (H - padT - padB);
  const line = (k) => data.map((d, i) => `${i ? "L" : "M"}${X(d.t).toFixed(1)},${Yc(d[k]).toFixed(1)}`).join(" ");
  const area = `${line("value")} L${X(maxX).toFixed(1)},${Yc(0).toFixed(1)} L${X(minX).toFixed(1)},${Yc(0).toFixed(1)} Z`;
  const marks = (splices || []).filter((t) => t > minX && t < maxX);

  // Scrub: works for mouse AND touch (Pointer Events). touch-action:none lets a
  // finger trace the line instead of scrolling the page.
  const locate = (clientX) => {
    const svg = wrapRef.current?.querySelector("svg"); if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * W;
    let best = data[0], bd = Infinity;
    for (const d of data) { const dd = Math.abs(X(d.t) - px); if (dd < bd) { bd = dd; best = d; } }
    setHover(best);
  };
  const onMove = (e) => locate(e.clientX);

  let tip = null;
  if (hover) {
    const leftPct = Math.min(90, Math.max(10, (X(hover.t) / W) * 100));
    const topPct = Math.min(78, Math.max(4, (Yc(hover.value) / H) * 100));
    tip = { leftPct, topPct, gain: hover.value - hover.invested };
  }

  return (
    <div className="bt-chart" ref={wrapRef}>
      <div className="bt-legend"><span><i className="lg lg-v" /> {valueLabel}</span><span><i className="lg lg-i" /> Amount invested</span>{marks.length > 0 && <span><i className="lg lg-m" /> Scheme transfer</span>}</div>
      <div className="bt-plot">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none"
          onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} onPointerCancel={() => setHover(null)}>
          <defs><linearGradient id={`bt-fill-${gid}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2e7d32" stopOpacity="0.22" /><stop offset="100%" stopColor="#2e7d32" stopOpacity="0" /></linearGradient></defs>
          <path d={area} fill={`url(#bt-fill-${gid})`} className="bt-area" />
          {marks.map((t, i) => (<line key={i} x1={X(t)} x2={X(t)} y1={padT - 6} y2={H - padB} stroke="#b08968" strokeWidth="1.2" strokeDasharray="3 3" />))}
          <path d={line("invested")} fill="none" stroke="#a8cfa8" strokeWidth="1.6" strokeDasharray="4 4" />
          <path d={line("value")} pathLength="1" className="bt-vline" fill="none" stroke="#2e7d32" strokeWidth="2.4" strokeLinejoin="round" />
          {hover && (<g><line x1={X(hover.t)} x2={X(hover.t)} y1={padT} y2={H - padB} stroke="#7cb342" strokeWidth="1" strokeDasharray="3 3" /><circle cx={X(hover.t)} cy={Yc(hover.invested)} r="3.5" fill="#a8cfa8" /><circle cx={X(hover.t)} cy={Yc(hover.value)} r="5" fill="#1b5e20" stroke="#fff" strokeWidth="1.5" /></g>)}
        </svg>
        {hover && (
          <div className="bt-flytip" style={{ left: tip.leftPct + "%", top: tip.topPct + "%" }}>
            <b className="bt-flytip-d">{fmtDate(hover.t)}</b>
            <span><i className="lg lg-v" />{valueLabel.split(" ")[0]} <b>{inrShort(hover.value)}</b></span>
            <span><i className="lg lg-i" />Invested {inrShort(hover.invested)}</span>
            <span className={tip.gain >= 0 ? "pos" : "neg"}>{(tip.gain >= 0 ? "▲ +" : "▼ −") + inrShort(Math.abs(tip.gain)).slice(1)}</span>
          </div>
        )}
      </div>
      <div className="bt-axis"><span>{fmtMon(minX)}</span><span className="bt-axis-hint">drag / hover to trace</span><span>{fmtMon(maxX)}</span></div>
    </div>
  );
}

// Per-fund invested-vs-value curve (for the fund detail view), from its own buys + NAV series
function buildFundCurve(buys, series, start, end) {
  if (!series || !series.length) return [];
  return monthlyGrid(start, end).map((g) => {
    const units = buys.reduce((s, b) => (b.t <= g ? s + b.units : s), 0);
    const inv = buys.reduce((s, b) => (b.t <= g ? s + b.amt : s), 0);
    const px = asof(series, g);
    return { t: g, value: px ? units * px.nav : 0, invested: inv };
  });
}

// Responsive fund detail: right-side drawer on desktop, bottom sheet on mobile.
function FundDetail({ row, end, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const curve = useMemo(() => buildFundCurve(row.buys || [], row.series, row.start, end), [row, end]);
  const gain = row.value - row.invested;
  const gp = gain >= 0;
  const splices = row.stitch ? [row.stitch.spliceDate] : [];
  return (
    <div className="bt-drawer-wrap" onMouseDown={onClose}>
      <div className="bt-drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={`${row.name} detail`}>
        <div className="bt-drawer-h">
          <div className="bt-drawer-title">
            <span className="bt-dot" style={{ background: row.color }} />
            <div>
              <div className="bt-drawer-name">{row.name}</div>
              <div className="bt-hold-tag"><span className={`bt-kind bt-kind-${row.kind}`}>{row.kind === "mf" ? "Mutual Fund" : "SIF"}</span>{row.cat && <span className="bt-cat">{row.cat}</span>}</div>
            </div>
          </div>
          <button className="bt-x" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="bt-drawer-kpis">
          <div className="bt-dk"><span>Invested</span><b><CountUp value={row.invested} format={inr} /></b></div>
          <div className="bt-dk"><span>Value</span><b className="pos"><CountUp value={row.value} format={inr} /></b></div>
          <div className="bt-dk"><span>Gain</span><b className={gp ? "pos" : "neg"}>{(gp ? "+" : "−") + inr(Math.abs(gain)).slice(1)}</b></div>
          <div className="bt-dk"><span>XIRR p.a.</span><b className={row.xirr >= 0 ? "pos" : "neg"}>{pct(row.xirr)}</b></div>
        </div>

        {curve.length >= 2
          ? <Chart curve={curve} splices={splices} height={230} gid={"f" + (row.key || "")} valueLabel="Holding value" />
          : <div className="bt-hint">Not enough history to chart this holding over the selected window.</div>}

        <div className="bt-drawer-meta">
          <div><span>Strategy</span><b>{strategyLabel(row)}</b></div>
          <div><span>Started</span><b>{fmtDate(row.start)}</b></div>
          {row.inception != null && <div><span>Fund since</span><b>{fmtDate(row.inception)}{row.stitch ? " (linked)" : ""}</b></div>}
          <div><span>Units held</span><b>{(row.units || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 })}</b></div>
          {row.finalNav != null && <div><span>Latest NAV</span><b>₹{row.finalNav.toFixed(2)}</b></div>}
          <div><span>Share of portfolio</span><b>{row.share != null ? row.share.toFixed(0) + "%" : "—"}</b></div>
        </div>
        {row.stitch && <div className="bt-drawer-note">↩ History before {fmtDate(row.stitch.spliceDate)} is return-linked from {row.stitch.fromName}.</div>}
      </div>
    </div>
  );
}

/* ===================== PDF EXPORT (branded print window) ===================== */
function doExport(r, rows, sipDay) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const dateStr = new Date(r.generatedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  const kpi = (l, v) => `<div class="banner-cell"><div class="banner-lbl">${l}</div><div class="banner-val">${v}</div></div>`;
  const banner = [kpi("Invested", inr(r.invested)), kpi("Final Value", inr(r.finalVal)), kpi("Gain", (r.gain >= 0 ? "+" : "−") + inr(Math.abs(r.gain)).slice(1)), kpi("Abs Return", (r.absRet * 100).toFixed(1) + "%"), kpi("XIRR p.a.", pct(r.xirr))].join("");
  const rowsHTML = rows.map((h) => `<tr><td>${esc(h.name)} <span style="font-size:.55rem;color:#5e8a5e">[${h.kind === "mf" ? "MF" : "SIF"}]</span></td><td style="text-align:left">${esc(strategyLabel(h))}</td><td style="text-align:left">${fmtMon(h.start)}</td><td>${inrShort(h.invested)}</td><td>${inrShort(h.value)}</td><td class="${h.xirr >= 0 ? "pos" : "neg"}">${pct(h.xirr)}</td></tr>`).join("");
  const benchHTML = r.bench ? `<div class="sec">Benchmark Comparison</div><table class="risk-table"><thead><tr><th style="text-align:left">Strategy</th><th>Final Value</th><th>XIRR</th></tr></thead><tbody><tr><td style="text-align:left">Your portfolio</td><td>${inr(r.finalVal)}</td><td class="${r.xirr >= 0 ? "pos" : "neg"}">${pct(r.xirr)}</td></tr><tr><td style="text-align:left">${esc(r.bench.name)} (benchmark)</td><td>${inr(r.bench.value)}</td><td class="${r.bench.xirr >= 0 ? "pos" : "neg"}">${pct(r.bench.xirr)}</td></tr></tbody></table>` : "";
  const stitchHTML = r.stitched && r.stitched.length
    ? `<div class="meta" style="margin-top:8px">&#8617; Pre-merger history return-linked: ${r.stitched.map((s) => esc(s.name) + " &larr; " + esc(s.fromName) + " (from " + fmtDate(s.from) + ")").join("; ")}.</div>`
    : "";

  const win = window.open("", "_blank", "width=960,height=760");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Portfolio Backtest | Abundance Financial Services</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Raleway",sans-serif;background:#fff;color:#162616;padding:30px 36px}
.ph{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:2.5px solid #2e7d32;margin-bottom:18px}
.pt{font-size:1.05rem;font-weight:800;color:#2e7d32}.pa{font-size:.6rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;margin-top:2px}
.logo{height:44px;object-fit:contain;mix-blend-mode:multiply}
.sec{font-size:.56rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#5e8a5e;margin:16px 0 8px;display:flex;align-items:center;gap:7px}
.sec::after{content:"";flex:1;height:1px;background:#c2dfc2}
.banner-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
.banner-cell{background:#edf6ed;border:1.5px solid #c2dfc2;border-radius:8px;padding:10px 12px;text-align:center}
.banner-lbl{font-size:.52rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#5e8a5e;margin-bottom:3px}
.banner-val{font-family:"JetBrains Mono",monospace;font-size:.9rem;font-weight:700;color:#1b5e20}
.risk-table{width:100%;border-collapse:collapse;font-size:.62rem}
.risk-table th{background:#1e4d20;color:#fff;font-size:.58rem;font-weight:700;letter-spacing:.5px;padding:6px 8px;text-align:right}
.risk-table th:first-child{text-align:left}
.risk-table td{padding:5px 8px;border-bottom:1px solid #e8f5e9;text-align:right;font-family:"JetBrains Mono",monospace;font-size:.65rem;font-weight:600}
.risk-table td:first-child{text-align:left;font-family:"Raleway",sans-serif;font-weight:700;max-width:200px}
.risk-table tr:nth-child(even) td{background:#f5fbf5}
.pos{color:#1b5e20}.neg{color:#b71c1c}
.ci{border:1px solid #c2dfc2;border-radius:8px;overflow:hidden}
.dis{padding:9px 13px;border-radius:7px;background:#fffde7;border-left:3px solid #f9a825;font-size:.6rem;color:#5d4037;line-height:1.65;font-family:"JetBrains Mono",monospace;margin-top:14px}
.meta{font-size:.55rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;margin-top:6px}
@media print{body{padding:16px 20px}@page{margin:.8cm;size:A4 portrait}}
</style></head><body>
<div class="ph">
  <div><div class="pt">Portfolio Backtest — ${rows.length} Holding${rows.length > 1 ? "s" : ""}</div>
  <div class="pa">Abundance Financial Services® · ARN-251838 · AMFI Registered Mutual Funds &amp; SIF Distributor</div></div>
  <img class="logo" src="/logo-og.png" onerror="this.style.display='none'">
</div>
<div class="sec">At a Glance · ${fmtDate(r.gridStart)} → ${fmtDate(r.end)} (${r.years.toFixed(1)} yrs)</div>
<div class="banner-grid">${banner}</div>
<div class="sec">Growth — Invested vs Portfolio Value</div>
<div class="ci">${chartSVG(r.curve)}</div>
${stitchHTML}
<div class="sec">Holdings &amp; Per-Fund Strategy</div>
<table class="risk-table"><thead><tr><th>Holding</th><th style="text-align:left">Strategy</th><th style="text-align:left">Start</th><th>Invested</th><th>Value</th><th>XIRR</th></tr></thead><tbody>${rowsHTML}</tbody></table>
${benchHTML}
<div class="meta">SIP date: ${sipDay}${sipDay === 1 ? "st" : "th"} of month · Generated ${esc(dateStr)} · mfcalc.getabundance.in/backtest</div>
<div class="dis">&#9888;&#65039; <strong style="color:#e65100">Disclaimer:</strong> Hypothetical back-tested illustration from historical NAVs, for education only — not investment advice. Past performance is not indicative of future results. Mutual fund investments are subject to market risks; read all scheme-related documents carefully. Figures exclude exit loads, STT, stamp duty, expense-ratio changes and taxes. Data: AMFI / mfapi.in. | ARN-251838 | Abundance Financial Services | EUIN: E334718</div>
</body></html>`);
  win.document.close();
  win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 600);
  setTimeout(() => { try { win.focus(); win.print(); } catch (e) {} }, 1400);
}

/* ===================== PICKER ===================== */
function Picker({ sifList, onPick, onClose, mode }) {
  const [tab, setTab] = useState("mf");
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null), inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const score = (n) => (/growth/i.test(n) ? 3 : 0) - (/(idcw|dividend|bonus|payout|reinvest|segregated)/i.test(n) ? 4 : 0);
  useEffect(() => {
    if (tab !== "mf") return;
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 3) { setRes([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const d = await fetch(`/api/mf?q=${encodeURIComponent(q.trim())}`).then((r) => r.json());
        const regular = (Array.isArray(d) ? d : []).filter((s) => !/\bdirect\b/i.test(s.schemeName));
        setRes(regular.sort((a, b) => score(b.schemeName) - score(a.schemeName)).slice(0, 40));
      } catch { setRes([]); }
      setLoading(false);
    }, 280);
    return () => timer.current && clearTimeout(timer.current);
  }, [q, tab]);
  const sifFiltered = useMemo(() => { const s = q.trim().toLowerCase(); return sifList.filter((x) => !s || (x.nav_name || "").toLowerCase().includes(s) || (x.category || "").toLowerCase().includes(s)); }, [q, sifList]);
  return (
    <div className="bt-modal" onMouseDown={onClose}>
      <div className="bt-modal-c" onMouseDown={(e) => e.stopPropagation()}>
        <div className="bt-modal-h"><h3>{mode === "bench" ? "Pick a benchmark fund" : "Add to portfolio"}</h3><button className="bt-x" onClick={onClose}>×</button></div>
        <div className="bt-seg sm">
          <button className={`bt-seg-b ${tab === "mf" ? "on" : ""}`} onClick={() => setTab("mf")}>Mutual Funds</button>
          <button className={`bt-seg-b ${tab === "sif" ? "on" : ""}`} onClick={() => setTab("sif")} disabled={mode === "bench"}>SIFs {mode === "bench" ? "" : `(${sifList.length})`}</button>
        </div>
        <div className="bt-search"><input ref={inputRef} placeholder={tab === "mf" ? "Search e.g. 'parag parikh flexi', 'nifty 50 index'…" : "Filter SIFs by name or strategy…"} value={q} onChange={(e) => setQ(e.target.value)} />{loading && <span className="bt-spin dark" />}</div>
        <div className="bt-list">
          {tab === "mf" && q.trim().length < 3 && <div className="bt-hint">Type at least 3 letters. Direct plans are hidden — Regular (Growth) shown.</div>}
          {tab === "mf" && res.map((s) => (<button className="bt-item" key={s.schemeCode} onClick={() => onPick({ kind: "mf", id: s.schemeCode, name: s.schemeName.replace(/\s*-\s*/g, " - ").trim() })}><span className="bt-item-n">{s.schemeName}</span><span className="bt-add">Add</span></button>))}
          {tab === "mf" && !loading && q.trim().length >= 3 && res.length === 0 && <div className="bt-hint">No Regular-plan schemes matched. Try a simpler keyword.</div>}
          {tab === "sif" && sifFiltered.map((s) => (<button className="bt-item" key={s.scheme_id} onClick={() => onPick({ kind: "sif", id: s.scheme_id, name: s.nav_name, cat: shortCat(s.category) })}><span className="bt-item-n">{s.nav_name}<span className="bt-item-sub">{shortCat(s.category)} · NAV ₹{s.nav}</span></span><span className="bt-add">Add</span></button>))}
          {tab === "sif" && sifFiltered.length === 0 && <div className="bt-hint">No SIFs matched.</div>}
        </div>
        {tab === "sif" && <div className="bt-modal-f">SIFs are newer with limited NAV history — back-tests cover only the period since launch.</div>}
      </div>
    </div>
  );
}
const shortCat = (c) => (c || "").replace(/Equity Oriented Investment Strategies\s*-\s*/i, "").replace(/Debt Oriented Investment Strategies\s*-\s*/i, "").trim() || "SIF";

/* ===================== FAQ (content also mirrored as FAQPage JSON-LD in layout.js) ===================== */
const FAQ_ITEMS = [
  { q: "What does this portfolio backtester do?", a: "It lets you build a hypothetical basket of mutual funds and SIFs, then replays it through real historical NAVs to show how a SIP, a lumpsum, or a combination would have performed. Each holding can have its own strategy, amount and start date." },
  { q: "How is the return calculated — what is XIRR?", a: "Because SIPs and combinations involve many cash-flows on different dates, the headline annualised figure is XIRR (the money-weighted internal rate of return). For a single lumpsum, XIRR equals the simple point-to-point CAGR. Absolute return is the total gain over the total amount invested." },
  { q: "Where does the NAV data come from?", a: "Daily NAV history is sourced from AMFI via mfapi.in for mutual funds, and from the AMFI SIF feed for Specialised Investment Funds. Each instalment is executed at the next available trading-day NAV." },
  { q: "Can I backtest SIFs (Specialised Investment Funds)?", a: "Yes. SIFs are a newer SEBI category, so most have only a few months of live NAV history — backtests will automatically cover only the period since each SIF launched." },
  { q: "Why does some history start later than I chose?", a: "A backtest can only use the data that exists. If a fund launched after your chosen start date, that holding begins at its inception. For funds that changed hands (e.g. JPMorgan schemes that became Edelweiss in 2016), pre-merger NAVs can be return-linked so the track record extends back to the original launch." },
  { q: "What costs are included?", a: "The illustration uses scheme NAVs, which are already net of the expense ratio. It does not deduct exit loads, STT, stamp duty, or capital-gains tax, and it does not model expense-ratio changes over time. Treat the figures as indicative." },
  { q: "Why are only Regular plans shown, not Direct?", a: "Abundance Financial Services is an AMFI-registered mutual fund distributor (ARN-251838), so the tool surfaces Regular plans, which is what its clients invest in. Direct plans are intentionally hidden." },
  { q: "Is this investment advice?", a: "No. This is an educational, hypothetical illustration only. Past performance is not indicative of future results, and nothing here is a recommendation to buy or sell any scheme. Please consult your financial advisor before investing." },
];

function FAQ() {
  const [open, setOpen] = useState(0);
  return (
    <section className="bt-faq" aria-label="Frequently asked questions">
      <div className="bt-card-h"><span className="bt-step">?</span><h2>Frequently asked questions</h2></div>
      <div className="bt-faq-list">
        {FAQ_ITEMS.map((f, i) => (
          <div className={`bt-faq-item ${open === i ? "open" : ""}`} key={i}>
            <button className="bt-faq-q" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
              <span>{f.q}</span><span className="bt-faq-ic">{open === i ? "−" : "+"}</span>
            </button>
            <div className="bt-faq-a" style={{ maxHeight: open === i ? 360 : 0 }}><p>{f.a}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ===================== CSS ===================== */
const CSS = `
.bt-body{font-family:Raleway,sans-serif;color:var(--text);padding-bottom:48px;display:grid;grid-template-columns:1fr 1fr;gap:16px;align-items:start}
.bt-body b{color:var(--g2)}
@media(max-width:820px){.bt-body{grid-template-columns:1fr}}
.bt-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;box-shadow:var(--shadow)}
.bt-card-h{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.bt-card-h h2{font-size:17px;font-weight:700;margin:0;color:var(--text)}
.bt-step{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;background:var(--g-xlight);color:var(--g1);font:700 13px JetBrains Mono,monospace;border:1px solid var(--border)}
.bt-step.done{background:var(--g2);color:#fff;border-color:var(--g2)}
.bt-period{margin-left:auto;font:600 12px JetBrains Mono,monospace;color:var(--muted)}
.bt-pdf{border:1px solid var(--border2);background:#fff;color:var(--g2);border-radius:8px;padding:6px 12px;font:700 12px Raleway,sans-serif;cursor:pointer;transition:.15s}
.bt-pdf:hover{background:var(--g-xlight)}

.bt-empty{text-align:center;padding:22px 10px;color:var(--muted)}
.bt-empty-ic{font-size:30px;color:var(--g-light);margin-bottom:6px}
.bt-empty p{margin:0;font-size:14px}

.bt-holdings{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}
.bt-hold{background:var(--s2);border:1px solid var(--border);border-radius:11px;padding:12px}
.bt-hold-top{display:flex;align-items:center;gap:10px}
.bt-dot{width:10px;height:10px;border-radius:50%;flex:none}
.bt-dot.sm{width:8px;height:8px;display:inline-block;margin-right:7px}
.bt-hold-main{flex:1;min-width:0}
.bt-hold-name{font-size:13.5px;font-weight:600;color:var(--text);line-height:1.3}
.bt-hold-tag{display:flex;gap:6px;margin-top:3px;flex-wrap:wrap;align-items:center}
.bt-kind{font:600 10px JetBrains Mono,monospace;padding:2px 6px;border-radius:5px;text-transform:uppercase;letter-spacing:.04em}
.bt-kind.mini{margin-left:8px}
.bt-kind-mf{background:var(--g-xlight);color:var(--g1)}
.bt-kind-sif{background:#fff3e0;color:var(--warn)}
.bt-cat{font-size:10.5px;color:var(--muted)}
.bt-x{border:0;background:var(--s3);color:var(--text2);width:26px;height:26px;border-radius:7px;font-size:18px;line-height:1;cursor:pointer;flex:none}
.bt-x:hover{background:var(--neg-bg);color:var(--neg)}
.bt-x.sm{width:22px;height:22px;font-size:15px}

.bt-strat{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px;margin-top:11px;padding-top:11px;border-top:1px dashed var(--border)}
.bt-mseg{display:inline-flex;background:#fff;border:1px solid var(--border);border-radius:9px;padding:3px;gap:2px}
.bt-mseg.sm button{padding:5px 9px;font-size:11.5px}
.bt-mseg button{border:0;background:transparent;border-radius:7px;padding:6px 11px;font:600 12px Raleway,sans-serif;color:var(--text2);cursor:pointer;transition:.12s}
.bt-mseg button.on{background:var(--g2);color:#fff}
.bt-sfield{display:flex;flex-direction:column;gap:4px}
.bt-sfield>span{font:600 10px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.bt-startf{flex:1;min-width:190px}
.bt-startrow{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.bt-startbtn{border:1px solid var(--border2);background:#fff;color:var(--text2);border-radius:7px;padding:7px 10px;font:600 11.5px Raleway,sans-serif;cursor:pointer;transition:.12s}
.bt-startbtn.on{background:var(--g-xlight);border-color:var(--g-light);color:var(--g1)}
.bt-date{border:1px solid var(--border2);border-radius:7px;padding:6px 8px;font:600 12px JetBrains Mono,monospace;color:var(--text);background:#fff}

.bt-inp{display:flex;align-items:center;background:#fff;border:1px solid var(--border2);border-radius:9px;padding:0 10px;transition:.15s}
.bt-inp.sm{padding:0 8px}
.bt-inp:focus-within{border-color:var(--g3);box-shadow:0 0 0 3px #43a04722}
.bt-inp i{font-style:normal;color:var(--muted);font:600 13px JetBrains Mono,monospace;margin-right:3px}
.bt-inp input,.bt-inp select{border:0;outline:0;background:transparent;padding:9px 0;width:100%;font:600 14px JetBrains Mono,monospace;color:var(--text)}
.bt-inp.sm input{width:86px;padding:7px 0;font-size:13px}
.bt-inp select{cursor:pointer;font-family:Raleway,sans-serif;font-size:13.5px}
.bt-permo{font:600 11px JetBrains Mono,monospace;color:var(--muted)}

.bt-defaults{display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:10px 12px;margin-bottom:12px}
.bt-def-lbl{font:600 10.5px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.bt-link{border:0;background:transparent;color:var(--g3);font:700 11.5px Raleway,sans-serif;cursor:pointer;text-decoration:underline;margin-left:auto}

.bt-btn{border-radius:9px;font:600 13px Raleway,sans-serif;padding:11px 14px;cursor:pointer;border:1px solid transparent;transition:.15s;width:100%}
.bt-btn-pri{background:var(--g2);color:#fff}
.bt-btn-pri:hover{background:var(--g1)}
.bt-ghost{background:#fff;border-color:var(--border2);color:var(--text2);width:auto}
.bt-ghost:hover{background:var(--s2)}
.bt-btn.sm{padding:8px 12px;font-size:12px}

.bt-fields{display:flex;flex-wrap:wrap;gap:14px;margin-bottom:14px}
.bt-field{flex:1;min-width:200px;display:flex;flex-direction:column;gap:7px}
.bt-field-sm{flex:0 0 160px;min-width:150px}
.bt-field>span{font:600 11px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.bt-field>span em{text-transform:none;font-style:normal;color:var(--g3);letter-spacing:0}

.bt-bench{border-top:1px dashed var(--border);padding-top:14px;margin-bottom:16px}
.bt-check{display:flex;align-items:center;gap:9px;cursor:pointer;font-size:13.5px;color:var(--text2);font-weight:600}
.bt-check input{width:17px;height:17px;accent-color:var(--g2)}
.bt-stitch{margin:0 0 14px;padding-top:14px;border-top:1px dashed var(--border)}
.bt-stitch em{font-style:normal;color:var(--muted);font-weight:500}
.bt-bench-pick{margin-top:10px}
.bt-bench-sel{display:flex;align-items:center;gap:8px;background:var(--s2);border:1px solid var(--border);border-radius:9px;padding:8px 10px;font-size:13px}
.bt-bench-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-bench-hint{font-size:11px;color:var(--muted);margin:7px 2px 0}

.bt-run{width:100%;margin-top:4px;background:var(--g1);color:#fff;border:0;border-radius:11px;padding:15px;font:700 15px Raleway,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;transition:.15s}
.bt-run:hover:not(:disabled){background:#0f3d13}
.bt-run:disabled{opacity:.75;cursor:wait}
.bt-err{margin-top:12px;background:var(--neg-bg);color:var(--neg);border:1px solid var(--neg-light);border-radius:9px;padding:11px 13px;font-size:13px;font-weight:600}
.bt-spin{width:15px;height:15px;border:2px solid #ffffff66;border-top-color:#fff;border-radius:50%;animation:bt-rot .7s linear infinite}
.bt-spin.dark{border-color:#43a04744;border-top-color:var(--g2)}
@keyframes bt-rot{to{transform:rotate(360deg)}}

.bt-res{grid-column:1 / -1;margin-top:2px;animation:bt-in .4s ease}
@keyframes bt-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.bt-note{background:var(--warn-bg);border:1px solid #ffcc80;color:#8a4300;border-radius:9px;padding:10px 13px;font-size:13px;margin-bottom:16px}
.bt-note-ok{background:var(--g-xlight);border-color:var(--g-light);color:var(--g1)}
.bt-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
@media(max-width:680px){.bt-kpis{grid-template-columns:repeat(2,1fr)}}
.bt-kpi{background:var(--s2);border:1px solid var(--border);border-radius:11px;padding:13px}
.bt-kpi.accent{background:var(--g1);border-color:var(--g1)}
.bt-kpi.accent .bt-kpi-l{color:#bfe0c1}.bt-kpi.accent .bt-kpi-v{color:#fff}
.bt-kpi-l{font:600 10.5px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
.bt-kpi-v{font:800 19px JetBrains Mono,monospace;color:var(--text);letter-spacing:-.01em}
.bt-kpi-v.pos{color:var(--g2)}.bt-kpi-v.neg{color:var(--neg)}
.bt-kpi-h{font-size:9.5px;color:var(--muted);margin-top:3px}
.pos{color:var(--g2)}.neg{color:var(--neg)}

.bt-chart{margin-bottom:20px}
.bt-legend{display:flex;gap:18px;font:600 11.5px JetBrains Mono,monospace;color:var(--muted);margin-bottom:8px}
.bt-legend .lg{display:inline-block;width:14px;height:3px;border-radius:2px;margin-right:5px;vertical-align:middle}
.lg-v{background:#2e7d32}.lg-i{background:#a8cfa8}.lg-m{background:#b08968}
.bt-chart svg{width:100%;height:240px;display:block;background:linear-gradient(#fbfdfb,#f4faf4);border:1px solid var(--border);border-radius:11px}
.bt-axis{display:flex;justify-content:space-between;font:600 11px JetBrains Mono,monospace;color:var(--muted);margin-top:6px;padding:0 2px}
.bt-tip{display:inline-flex;flex-wrap:wrap;gap:4px 14px;align-items:baseline;margin-top:8px;background:var(--s2);border:1px solid var(--border);border-radius:8px;padding:7px 12px;font:600 12px JetBrains Mono,monospace;color:var(--text2)}
.bt-tip b{color:var(--g1)}

.bt-compare{border:1px solid var(--border);border-radius:11px;overflow:hidden;margin-bottom:20px}
.bt-cmp-row{display:grid;grid-template-columns:1fr auto auto;gap:14px;padding:11px 14px;font-size:13.5px;align-items:center;border-top:1px solid var(--border)}
.bt-cmp-row span:nth-child(2),.bt-cmp-row span:nth-child(3){font-family:JetBrains Mono,monospace;font-weight:700;text-align:right;min-width:84px}
.bt-cmp-head{background:var(--s2);border-top:0;font:600 10.5px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.bt-cmp-row em{color:var(--muted);font-style:normal;font-size:11px}
.bt-cmp-foot{background:var(--g-xlight);padding:10px 14px;font-size:12.5px;color:var(--g1);font-weight:600}

.bt-table-wrap{overflow-x:auto}
.bt-table{width:100%;border-collapse:collapse;font-size:13px}
.bt-table th{text-align:right;font:600 10.5px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;padding:8px 10px;border-bottom:1px solid var(--border)}
.bt-table th:first-child,.bt-table th:nth-child(2),.bt-table th:nth-child(3){text-align:left}
.bt-table td{padding:11px 10px;border-bottom:1px solid var(--s3);text-align:right;font-family:JetBrains Mono,monospace;font-weight:600;color:var(--text2)}
.bt-table td:first-child{text-align:left;font-family:Raleway,sans-serif;color:var(--text);max-width:240px}
.bt-table td.bt-l{text-align:left;font-family:Raleway,sans-serif;font-weight:600;color:var(--text2)}

.bt-disc{margin-top:24px;background:var(--s2);border:1px solid var(--border);border-radius:11px;padding:15px 17px;font-size:11.5px;line-height:1.65;color:var(--muted)}
.bt-disc b,.bt-disc strong{color:var(--text2)}
.bt-arn{margin-top:8px;font:600 11px JetBrains Mono,monospace;color:var(--g3)}

.bt-modal{position:fixed;inset:0;background:#0d260d66;backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;padding:5vh 14px;z-index:10000;animation:bt-in .2s}
.bt-modal-c{background:var(--surface);border:1px solid var(--border2);border-radius:16px;width:100%;max-width:560px;max-height:86vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);overflow:hidden}
.bt-modal-h{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 12px}
.bt-modal-h h3{margin:0;font-size:16px;font-weight:700;color:var(--g1)}
.bt-modal-c .bt-seg{margin:0 18px 12px}
.bt-seg{display:flex;gap:4px;background:var(--s2);border:1px solid var(--border);border-radius:11px;padding:4px}
.bt-seg-b{flex:1;border:0;background:transparent;padding:9px 8px;border-radius:8px;font:600 13px Raleway,sans-serif;color:var(--text2);cursor:pointer;transition:.15s}
.bt-seg-b.on{background:#fff;color:var(--g1);box-shadow:0 1px 4px #2e7d3220}
.bt-seg-b:disabled{opacity:.4;cursor:not-allowed}
.bt-search{margin:0 18px 10px;display:flex;align-items:center;gap:8px;background:var(--s2);border:1px solid var(--border2);border-radius:10px;padding:0 12px}
.bt-search input{flex:1;border:0;outline:0;background:transparent;padding:12px 0;font-size:14px;font-family:Raleway,sans-serif;color:var(--text)}
.bt-list{overflow-y:auto;padding:0 10px 8px;flex:1}
.bt-item{display:flex;align-items:center;gap:10px;width:100%;text-align:left;background:transparent;border:0;border-radius:9px;padding:11px 10px;cursor:pointer;border-bottom:1px solid var(--s3)}
.bt-item:hover{background:var(--s2)}
.bt-item-n{flex:1;font-size:13.5px;font-weight:600;color:var(--text);line-height:1.35}
.bt-item-sub{display:block;font:500 11px JetBrains Mono,monospace;color:var(--muted);margin-top:2px}
.bt-add{font:600 11px JetBrains Mono,monospace;color:var(--g2);background:var(--g-xlight);padding:5px 10px;border-radius:7px;flex:none}
.bt-hint{padding:18px 12px;text-align:center;color:var(--muted);font-size:13px}
.bt-modal-f{padding:11px 18px;background:var(--warn-bg);color:#8a4300;font-size:11.5px;border-top:1px solid #ffe0b2}

/* ---- duplicate-tranche cues ---- */
.bt-tranche{font:600 10px JetBrains Mono,monospace;color:var(--warn);background:var(--warn-bg);border:1px solid #ffcc80;padding:2px 7px;border-radius:5px;letter-spacing:.02em}
.bt-duptip{margin-top:-2px;margin-bottom:12px;font-size:11.5px;color:var(--muted);line-height:1.5}

/* ---- motion / micro-interactions ---- */
.bt-card{transition:box-shadow .2s ease,transform .2s ease}
.bt-hold{animation:bt-cardin .34s cubic-bezier(.2,.7,.3,1) both;transition:box-shadow .18s ease}
.bt-hold:hover{box-shadow:0 3px 14px #2e7d3218}
.bt-kpi{transition:transform .18s ease,box-shadow .18s ease}
.bt-kpi:hover{transform:translateY(-2px);box-shadow:var(--shadow)}
.bt-kpis .bt-kpi{animation:bt-rise .5s ease backwards}
.bt-kpis .bt-kpi:nth-child(1){animation-delay:.04s}
.bt-kpis .bt-kpi:nth-child(2){animation-delay:.10s}
.bt-kpis .bt-kpi:nth-child(3){animation-delay:.16s}
.bt-kpis .bt-kpi:nth-child(4){animation-delay:.22s}
.bt-kpis .bt-kpi:nth-child(5){animation-delay:.28s}
.bt-table tbody tr{animation:bt-rise .42s ease backwards}
.bt-table tbody tr:nth-child(1){animation-delay:.05s}
.bt-table tbody tr:nth-child(2){animation-delay:.10s}
.bt-table tbody tr:nth-child(3){animation-delay:.15s}
.bt-table tbody tr:nth-child(4){animation-delay:.20s}
.bt-table tbody tr:nth-child(5){animation-delay:.25s}
.bt-table tbody tr:nth-child(n+6){animation-delay:.30s}
.bt-kpi-v{font-variant-numeric:tabular-nums}
.bt-vline{stroke-dasharray:1;stroke-dashoffset:1;animation:bt-draw 1.15s cubic-bezier(.4,0,.2,1) .15s forwards}
.bt-area{opacity:0;animation:bt-fade .9s ease .5s forwards}
.bt-run{transition:background .15s ease,transform .12s ease}
.bt-run:active:not(:disabled){transform:scale(.985)}
.bt-pdf{transition:background .15s ease,transform .12s ease}
.bt-pdf:active{transform:scale(.96)}
.bt-step.done{animation:bt-pop .4s cubic-bezier(.2,1.4,.4,1) both}
@keyframes bt-cardin{from{opacity:0;transform:translateY(6px) scale(.99)}to{opacity:1;transform:none}}
@keyframes bt-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes bt-draw{to{stroke-dashoffset:0}}
@keyframes bt-fade{to{opacity:1}}
@keyframes bt-pop{0%{transform:scale(0);opacity:0}100%{transform:scale(1);opacity:1}}
@media (prefers-reduced-motion: reduce){
  .bt-hold,.bt-kpis .bt-kpi,.bt-table tbody tr,.bt-res,.bt-step.done{animation:none!important}
  .bt-vline{stroke-dasharray:none;stroke-dashoffset:0;animation:none}
  .bt-area{opacity:1;animation:none}
  .bt-kpi:hover{transform:none}
  .bt-drawer{animation:none!important}
}

/* ---- interactive chart trace ---- */
.bt-plot{position:relative}
.bt-chart svg{touch-action:none;cursor:crosshair}
.bt-flytip{position:absolute;transform:translate(-50%,-118%);background:#fff;border:1px solid var(--border2);border-radius:9px;box-shadow:var(--shadow-lg);padding:8px 11px;pointer-events:none;z-index:5;white-space:nowrap;display:flex;flex-direction:column;gap:2px;animation:bt-fade .12s ease}
.bt-flytip .bt-flytip-d{font:700 11px JetBrains Mono,monospace;color:var(--g1);margin-bottom:2px}
.bt-flytip span{font:600 11.5px JetBrains Mono,monospace;color:var(--text2);display:flex;align-items:center}
.bt-flytip span .lg{display:inline-block;width:10px;height:3px;border-radius:2px;margin-right:6px}
.bt-flytip b{color:var(--g1);margin-left:4px}
.bt-axis-hint{font-weight:600;color:var(--g-light);letter-spacing:.02em}
@media(max-width:560px){.bt-axis-hint{display:none}}

/* ---- clickable holdings ---- */
.bt-trow{cursor:pointer;transition:background .12s ease}
.bt-trow:hover{background:var(--s2)}
.bt-fundlink{display:inline-flex;align-items:center;gap:0;background:none;border:0;padding:0;font:inherit;color:var(--g1);font-weight:700;cursor:pointer;text-align:left;max-width:230px}
.bt-fundlink:hover{text-decoration:underline}
.bt-chev{color:var(--g3);font-size:17px;margin-left:6px;font-weight:700}
.bt-tap-hint{font:600 11px JetBrains Mono,monospace;color:var(--muted);text-align:right;margin-top:8px}

/* ---- fund detail: drawer (desktop) / bottom-sheet (mobile) ---- */
.bt-drawer-wrap{position:fixed;inset:0;background:#0d260d55;backdrop-filter:blur(3px);z-index:10000;display:flex;justify-content:flex-end;animation:bt-fade .2s ease}
.bt-drawer{background:var(--surface);width:440px;max-width:100%;height:100%;overflow-y:auto;box-shadow:var(--shadow-lg);padding:20px;animation:bt-slidein .28s cubic-bezier(.2,.7,.3,1)}
@keyframes bt-slidein{from{transform:translateX(40px);opacity:.4}to{transform:none;opacity:1}}
.bt-drawer-h{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:16px}
.bt-drawer-title{display:flex;gap:10px;align-items:flex-start}
.bt-drawer-title .bt-dot{margin-top:5px}
.bt-drawer-name{font-size:16px;font-weight:800;color:var(--text);line-height:1.25}
.bt-drawer-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
.bt-dk{background:var(--s2);border:1px solid var(--border);border-radius:9px;padding:9px 10px;display:flex;flex-direction:column;gap:3px}
.bt-dk span{font:600 9.5px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.bt-dk b{font:800 15px JetBrains Mono,monospace;color:var(--text)}
.bt-drawer-meta{margin-top:16px;border-top:1px solid var(--border);padding-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:11px 16px}
.bt-drawer-meta div{display:flex;flex-direction:column;gap:2px}
.bt-drawer-meta span{font:600 10px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.bt-drawer-meta b{font-size:13px;font-weight:700;color:var(--text2)}
.bt-drawer-note{margin-top:14px;background:var(--g-xlight);border:1px solid var(--g-light);border-radius:8px;padding:9px 12px;font-size:11.5px;color:var(--g1)}
@media(max-width:560px){
  .bt-drawer-wrap{justify-content:center;align-items:flex-end}
  .bt-drawer{width:100%;height:auto;max-height:90vh;border-radius:18px 18px 0 0;animation:bt-sheetup .3s cubic-bezier(.2,.7,.3,1)}
  .bt-drawer-kpis{grid-template-columns:repeat(2,1fr)}
}
@keyframes bt-sheetup{from{transform:translateY(60px);opacity:.5}to{transform:none;opacity:1}}

/* ---- FAQ ---- */
.bt-faq{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;box-shadow:var(--shadow);margin-top:18px}
.bt-faq-list{display:flex;flex-direction:column;gap:8px}
.bt-faq-item{border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--s2);transition:border-color .15s ease}
.bt-faq-item.open{border-color:var(--g-light)}
.bt-faq-q{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;background:none;border:0;padding:14px 15px;text-align:left;font:700 14px Raleway,sans-serif;color:var(--text);cursor:pointer}
.bt-faq-q:hover{color:var(--g1)}
.bt-faq-ic{font:700 18px JetBrains Mono,monospace;color:var(--g3);flex:none;line-height:1}
.bt-faq-a{max-height:0;overflow:hidden;transition:max-height .3s ease}
.bt-faq-a p{margin:0;padding:0 15px 15px;font-size:13px;line-height:1.65;color:var(--text2)}

/* ---- responsiveness polish ---- */
@media(max-width:560px){
  .bt-wrap,.container{padding-left:12px;padding-right:12px}
  .bt-card,.bt-faq{padding:15px}
  .bt-strat{gap:8px}
  .bt-sfield{flex:1;min-width:120px}
  .bt-startf{min-width:100%}
  .bt-fields{flex-direction:column}
  .bt-field-sm{flex:1 1 auto}
  .bt-kpi-v{font-size:17px}
  .bt-table{font-size:12px}
  .bt-table th,.bt-table td{padding:9px 7px}
  .bt-fundlink{max-width:150px}
  .bt-defaults{gap:7px}
}
@media(max-width:380px){
  .bt-kpis{grid-template-columns:1fr 1fr}
  .bt-mseg button{padding:6px 8px;font-size:11px}
}
.bt-chart svg{height:240px}
@media(max-width:560px){.bt-chart svg{height:200px}}

/* ---- share button + toast ---- */
.bt-share{color:var(--g1)}
.bt-toast{position:fixed;left:50%;bottom:26px;transform:translateX(-50%);background:var(--g1);color:#fff;font:600 13px Raleway,sans-serif;padding:11px 18px;border-radius:10px;box-shadow:var(--shadow-lg);z-index:10000;animation:bt-toastin .25s ease}
@keyframes bt-toastin{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}

/* ---- risk / drawdown ---- */
.bt-risk{border:1px solid var(--border);border-radius:12px;padding:15px 16px;margin-bottom:20px;background:linear-gradient(180deg,#fbfdfb,#f4faf4)}
.bt-risk-h{font:600 11px JetBrains Mono,monospace;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px}
.bt-risk-h em{font-style:normal;text-transform:none;letter-spacing:0;color:var(--muted);font-weight:500}
.bt-risk-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:9px;margin-bottom:14px}
@media(max-width:680px){.bt-risk-kpis{grid-template-columns:repeat(2,1fr)}}
.bt-rk{background:#fff;border:1px solid var(--border);border-radius:9px;padding:9px 11px;display:flex;flex-direction:column;gap:2px}
.bt-rk span{font:600 9.5px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.bt-rk b{font:800 17px JetBrains Mono,monospace;color:var(--text)}
.bt-rk i{font:500 9.5px JetBrains Mono,monospace;color:var(--muted);font-style:normal}
.bt-uw-lbl{display:flex;justify-content:space-between;font:600 10.5px JetBrains Mono,monospace;color:var(--muted);margin-bottom:5px}
.bt-uw-recov{color:var(--neg)}
.bt-uw svg{width:100%;height:90px;display:block;background:#fff;border:1px solid var(--border);border-radius:8px;touch-action:none;cursor:crosshair}
.bt-uw-tip{font:600 11px JetBrains Mono,monospace;color:var(--text2);margin-top:5px}

/* ---- advisory CTA ---- */
.bt-cta{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:20px;background:linear-gradient(120deg,var(--g1),var(--g2));border-radius:14px;padding:18px 20px}
.bt-cta-h{font-size:16px;font-weight:800;color:#fff;margin-bottom:3px}
.bt-cta-txt p{margin:0;font-size:12.5px;color:#d6ead7;line-height:1.5;max-width:430px}
.bt-cta-btn{display:inline-flex;align-items:center;gap:9px;background:#fff;color:var(--g1);font:800 14px Raleway,sans-serif;padding:12px 20px;border-radius:10px;text-decoration:none;white-space:nowrap;transition:transform .12s ease,box-shadow .15s ease;box-shadow:0 2px 10px #00000025}
.bt-cta-btn:hover{transform:translateY(-1px);box-shadow:0 5px 16px #00000033}
.bt-wa{display:inline-grid;place-items:center;width:22px;height:22px;border-radius:50%;background:#25d366;color:#fff;font-size:13px}
@media(max-width:560px){.bt-cta{flex-direction:column;align-items:stretch}.bt-cta-btn{justify-content:center}}
`;
