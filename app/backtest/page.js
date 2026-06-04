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
function planBuys(h, sipDay, defaultStart, end) {
  const incep = h.series[0].t;
  let want = (h.startMode === "custom" && h.customStart) ? pYMD(h.customStart) : defaultStart;
  let clamped = false;
  if (want < incep) { if (h.startMode === "custom") clamped = true; want = incep; }
  const f0 = fwd(h.series, want);
  if (!f0 || f0.t > end) return { effStart: f0 ? f0.t : want, incep, clamped, noInvest: true, buys: [] };
  const start = f0.t, buys = [];
  if (h.mode === "lumpsum" || h.mode === "combo") buys.push({ t: start, amt: +h.lumpsum || 0 });
  if (h.mode === "sip" || h.mode === "combo") sipDates(start, end, sipDay).forEach((t) => buys.push({ t, amt: +h.monthly || 0 }));
  return { effStart: start, incep, clamped, noInvest: false, buys };
}

function runBacktest({ holdings, sipDay, defaultStart, end, benchmark }) {
  const pf = {}, flows = [], agg = new Map();
  holdings.forEach((h) => {
    const plan = planBuys(h, sipDay, defaultStart, end);
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

  const [sifList, setSifList] = useState([]);
  const [picker, setPicker] = useState(false);
  const [pickFor, setPickFor] = useState("holding");

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const cache = useRef({});

  useEffect(() => { fetch("/api/sif-nav").then((r) => r.json()).then((d) => setSifList(d.schemes || [])).catch(() => {}); }, []);

  /* holdings ops */
  const addHolding = (item) => {
    if (pickFor === "bench") { setBench({ key: "bench", ...item }); setPicker(false); return; }
    if (holdings.some((h) => h.kind === item.kind && h.id === item.id)) { setPicker(false); return; }
    setHoldings((p) => [...p, { key: uid(), mode: defaults.mode, monthly: defaults.monthly, lumpsum: defaults.lumpsum, startMode: "default", customStart: "", ...item }]);
    setPicker(false);
  };
  const patch = (key, kv) => setHoldings((p) => p.map((h) => (h.key === key ? { ...h, ...kv } : h)));
  const remove = (key) => setHoldings((p) => p.filter((h) => h.key !== key));
  const applyDefaultsToAll = () => setHoldings((p) => p.map((h) => ({ ...h, mode: defaults.mode, monthly: defaults.monthly, lumpsum: defaults.lumpsum })));

  /* data */
  async function loadSeries(item) {
    const id = item.kind + ":" + item.id;
    if (cache.current[id]) return cache.current[id];
    let series = [];
    if (item.kind === "mf") {
      const d = await fetch(`/api/mf?code=${item.id}`).then((r) => r.json());
      if (!d?.data?.length) throw new Error(`No NAV history for ${item.name}`);
      series = normSeries(d.data, "mf");
    } else {
      const d = await fetch(`/api/sif-history?sd_id=${encodeURIComponent(item.id)}&from=2024-01-01&to=${toYMD(todayUTC())}`).then((r) => r.json());
      if (!d?.records?.length) throw new Error(`No NAV history for ${item.name}`);
      series = normSeries(d.records, "sif");
    }
    if (series.length < 2) throw new Error(`Not enough NAV history for ${item.name}`);
    const obj = { series, inception: series[0].t, last: series[series.length - 1].t };
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
      const bchk = benchOn && bench ? loaded[loaded.length - 1] : null;

      const end = todayUTC();
      let defaultStart;
      if (startMode === "date" && startDate) defaultStart = pYMD(startDate);
      else if (lookback === "max") defaultStart = 0;
      else defaultStart = end - parseInt(lookback, 10) * Y;

      const res = runBacktest({ holdings: port, sipDay, defaultStart, end, benchmark: bchk });
      if (res.invested <= 0) throw new Error("No investments could be placed in the selected window. Check your start dates against each fund's launch date.");
      setResult({ ...res, end, port, bench: res.bench, years: (end - res.gridStart) / Y, generatedAt: Date.now() });
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
              {holdings.map((h, i) => (
                <div className="bt-hold" key={h.key}>
                  <div className="bt-hold-top">
                    <span className="bt-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                    <div className="bt-hold-main">
                      <div className="bt-hold-name">{h.name}</div>
                      <div className="bt-hold-tag"><span className={`bt-kind bt-kind-${h.kind}`}>{h.kind === "mf" ? "Mutual Fund" : "SIF"}</span>{h.cat && <span className="bt-cat">{h.cat}</span>}</div>
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
              ))}
            </div>

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
            </div>
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

        {result && <Results r={result} sipDay={sipDay} />}

        <div className="bt-disc">
          <strong>Important:</strong> This is a <b>hypothetical, back-tested illustration</b> built from historical NAVs for education only — it is <b>not investment advice</b> and not a recommendation of any scheme. <b>Past performance is not indicative of future results.</b> Mutual fund investments are subject to market risks; read all scheme-related documents carefully. SIFs are a newer, higher-risk category with limited live history, so their back-tests cover short periods only. Figures exclude exit loads, stamp duty, STT, expense-ratio changes and taxes, and execute each instalment at the next available trading-day NAV.
          <div className="bt-arn">Abundance Financial Services® · ARN-251838 · EUIN: E334718 · AMFI-Registered Mutual Fund &amp; SIF Distributor</div>
        </div>
      </div>

      <Footer activePage="backtest" />
      {picker && <Picker sifList={sifList} onPick={addHolding} onClose={() => setPicker(false)} mode={pickFor} />}
    </>
  );
}

/* ===================== RESULTS ===================== */
function Results({ r, sipDay }) {
  const gainPos = r.gain >= 0;
  const rows = r.port.map((h, i) => ({ ...h, ...r.perFund[h.key], color: PALETTE[i % PALETTE.length] })).sort((a, b) => b.value - a.value);
  const clampedAny = rows.filter((h) => h.clamped);

  const exportPDF = () => doExport(r, rows, sipDay);

  return (
    <section className="bt-card bt-res">
      <div className="bt-card-h">
        <span className="bt-step done">✓</span><h2>Results</h2>
        <span className="bt-period">{fmtDate(r.gridStart)} → {fmtDate(r.end)} · {r.years.toFixed(1)} yrs</span>
        <button className="bt-pdf" onClick={exportPDF}>⤓ Export PDF</button>
      </div>

      {clampedAny.length > 0 && (
        <div className="bt-note">ⓘ {clampedAny.map((h) => h.name).join(", ")} {clampedAny.length > 1 ? "were" : "was"} requested to start before {clampedAny.length > 1 ? "their" : "its"} launch — started at inception instead.</div>
      )}

      <div className="bt-kpis">
        <Kpi label="Invested" val={inr(r.invested)} />
        <Kpi label="Final value" val={inr(r.finalVal)} accent />
        <Kpi label="Gain" val={(gainPos ? "+" : "−") + inr(Math.abs(r.gain)).slice(1)} sign={gainPos ? "pos" : "neg"} />
        <Kpi label="Absolute return" val={(r.absRet >= 0 ? "+" : "") + (r.absRet * 100).toFixed(1) + "%"} sign={r.absRet >= 0 ? "pos" : "neg"} />
        <Kpi label="XIRR (p.a.)" val={pct(r.xirr)} sign={r.xirr >= 0 ? "pos" : "neg"} hint="money-weighted annualised" />
      </div>

      <Chart curve={r.curve} />

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
              <tr key={h.key}>
                <td><span className="bt-dot sm" style={{ background: h.color }} />{h.name}<span className={`bt-kind bt-kind-${h.kind} mini`}>{h.kind === "mf" ? "MF" : "SIF"}</span></td>
                <td className="bt-l">{strategyLabel(h)}</td>
                <td className="bt-l">{fmtMon(h.start)}</td>
                <td>{inrShort(h.invested)}</td>
                <td>{inrShort(h.value)}</td>
                <td className={h.xirr >= 0 ? "pos" : "neg"}>{pct(h.xirr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function Kpi({ label, val, sign, accent, hint }) {
  return (<div className={`bt-kpi ${accent ? "accent" : ""}`}><div className="bt-kpi-l">{label}</div><div className={`bt-kpi-v ${sign || ""}`}>{val}</div>{hint && <div className="bt-kpi-h">{hint}</div>}</div>);
}

/* ===================== CHART ===================== */
function Chart({ curve }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = 260, padX = 8, padT = 16, padB = 26;
  const data = curve.filter((c) => isFinite(c.value)); if (data.length < 2) return null;
  const xs = data.map((d) => d.t), minX = xs[0], maxX = xs[xs.length - 1];
  const maxV = Math.max(...data.map((d) => Math.max(d.value, d.invested)), 1);
  const X = (t) => padX + ((t - minX) / (maxX - minX || 1)) * (W - padX * 2);
  const Yc = (v) => padT + (1 - v / maxV) * (H - padT - padB);
  const line = (k) => data.map((d, i) => `${i ? "L" : "M"}${X(d.t).toFixed(1)},${Yc(d[k]).toFixed(1)}`).join(" ");
  const area = `${line("value")} L${X(maxX).toFixed(1)},${Yc(0).toFixed(1)} L${X(minX).toFixed(1)},${Yc(0).toFixed(1)} Z`;
  const onMove = (e) => { const rect = e.currentTarget.getBoundingClientRect(); const px = ((e.clientX - rect.left) / rect.width) * W; let best = data[0], bd = Infinity; data.forEach((d) => { const dd = Math.abs(X(d.t) - px); if (dd < bd) { bd = dd; best = d; } }); setHover(best); };
  return (
    <div className="bt-chart">
      <div className="bt-legend"><span><i className="lg lg-v" /> Portfolio value</span><span><i className="lg lg-i" /> Amount invested</span></div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs><linearGradient id="bt-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2e7d32" stopOpacity="0.22" /><stop offset="100%" stopColor="#2e7d32" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#bt-fill)" />
        <path d={line("invested")} fill="none" stroke="#a8cfa8" strokeWidth="1.6" strokeDasharray="4 4" />
        <path d={line("value")} fill="none" stroke="#2e7d32" strokeWidth="2.4" strokeLinejoin="round" />
        {hover && (<g><line x1={X(hover.t)} x2={X(hover.t)} y1={padT} y2={H - padB} stroke="#c2dfc2" strokeWidth="1" /><circle cx={X(hover.t)} cy={Yc(hover.value)} r="4" fill="#1b5e20" /><circle cx={X(hover.t)} cy={Yc(hover.invested)} r="3" fill="#a8cfa8" /></g>)}
      </svg>
      <div className="bt-axis"><span>{fmtMon(minX)}</span><span>{fmtMon(maxX)}</span></div>
      {hover && (<div className="bt-tip"><b>{fmtMon(hover.t)}</b><span>Value <b>{inrShort(hover.value)}</b></span><span>Invested {inrShort(hover.invested)}</span></div>)}
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
.lg-v{background:#2e7d32}.lg-i{background:#a8cfa8}
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

.bt-modal{position:fixed;inset:0;background:#0d260d66;backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;padding:5vh 14px;z-index:90;animation:bt-in .2s}
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
`;
