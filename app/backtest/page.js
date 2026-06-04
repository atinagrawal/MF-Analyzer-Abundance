"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

/* ============================================================
   Abundance · Portfolio Backtester
   Self-contained client page. Reuses global theme tokens
   (--g1, --bg, --border, etc.) defined in globals.css.
   All page-specific styles are scoped under `.bt-*` so this
   file touches NOTHING else in the codebase.

   Verified live data contracts (Jun 2026):
   - MF search : /api/mf?q=text            -> [{schemeCode, schemeName}]
   - MF NAV    : /api/mf?code=NNN          -> {meta, data:[{date:"DD-MM-YYYY", nav}]}  (newest-first)
   - SIF list  : /api/sif-nav              -> {schemes:[{scheme_id:"SIF-34", nav_name, category, nav, nav_date}]}
   - SIF NAV   : /api/sif-history?sd_id=SIF-34&from=YYYY-MM-DD&to=YYYY-MM-DD
                 -> {records:[{date:"YYYY-MM-DD", nav}]}  (oldest-first)
   ============================================================ */

/* ---------- pure backtest engine (validated against real NAVs) ---------- */
const DAY = 86400000;
const Y = 365 * DAY;
const pDMY = (s) => { const [d, m, y] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const pYMD = (s) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };

function normSeries(raw, kind) {
  const arr = (kind === "mf" ? raw : raw).map((r) =>
    kind === "mf" ? { t: pDMY(r.date), nav: +r.nav } : { t: pYMD(r.date), nav: +r.nav }
  );
  return arr.filter((r) => r.nav > 0 && isFinite(r.t)).sort((a, b) => a.t - b.t);
}
// first point with t >= target (execution price for a buy on/after date)
function fwd(s, t) { let lo = 0, hi = s.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (s[m].t >= t) { a = m; hi = m - 1; } else lo = m + 1; } return a < 0 ? null : s[a]; }
// last point with t <= target (valuation as-of date)
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
    let nr = r - n / d;
    if (!isFinite(nr)) break;
    if (nr <= -0.9999) nr = -0.99;
    if (Math.abs(nr - r) < 1e-9) return nr;
    r = nr;
  }
  let lo = -0.9999, hi = 10, fl = npv(lo);
  if (!isFinite(fl)) return null;
  for (let i = 0; i < 240; i++) { const mid = (lo + hi) / 2, fm = npv(mid); if (Math.abs(fm) < 1e-7) return mid; if (fl < 0 === fm < 0) { lo = mid; fl = fm; } else hi = mid; }
  return (lo + hi) / 2;
}

function sipDates(start, end, day) {
  const out = [];
  let cur = new Date(start); cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), 1));
  let guard = 0;
  while (guard++ < 2000) {
    const y = cur.getUTCFullYear(), m = cur.getUTCMonth();
    const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const t = Date.UTC(y, m, Math.min(day, dim));
    if (t >= start && t <= end) out.push(t);
    if (t > end) break;
    cur = new Date(Date.UTC(y, m + 1, 1));
  }
  return out;
}

function runBacktest({ holdings, mode, lumpsum, monthly, sipDay, start, end }) {
  const wsum = holdings.reduce((s, h) => s + (h.weight || 0), 0) || 1;
  const flows = [];
  const pf = {};
  holdings.forEach((h) => (pf[h.key] = { units: 0, invested: 0, buys: [] }));
  const buy = (h, amt, t) => {
    if (amt <= 0) return;
    const px = fwd(h.series, t);
    if (!px) return;
    const u = amt / px.nav;
    pf[h.key].units += u; pf[h.key].invested += amt;
    pf[h.key].buys.push({ t: px.t, units: u });
    flows.push({ t: px.t, amt: -amt });
  };
  if (mode === "lumpsum" || mode === "combo") holdings.forEach((h) => buy(h, (lumpsum * h.weight) / wsum, start));
  if (mode === "sip" || mode === "combo") {
    const ds = sipDates(start, end, sipDay);
    ds.forEach((t) => holdings.forEach((h) => buy(h, (monthly * h.weight) / wsum, t)));
  }
  let finalVal = 0;
  holdings.forEach((h) => {
    const px = asof(h.series, end);
    const v = px ? pf[h.key].units * px.nav : 0;
    pf[h.key].value = v; pf[h.key].finalNav = px ? px.nav : null;
    finalVal += v;
  });
  const invested = holdings.reduce((s, h) => s + pf[h.key].invested, 0);

  // monthly growth series (invested vs value) for the chart
  const grid = [];
  { let g = new Date(start); g = new Date(Date.UTC(g.getUTCFullYear(), g.getUTCMonth(), 1)); let guard = 0;
    while (guard++ < 1000) { const t = g.getTime(); if (t > end) break; if (t >= start) grid.push(t); g = new Date(Date.UTC(g.getUTCFullYear(), g.getUTCMonth() + 1, 1)); }
    if (grid[grid.length - 1] !== end) grid.push(end);
  }
  const curve = grid.map((g) => {
    let val = 0;
    holdings.forEach((h) => {
      const u = pf[h.key].buys.reduce((s, b) => (b.t <= g ? s + b.units : s), 0);
      const px = asof(h.series, g);
      if (px) val += u * px.nav;
    });
    return { t: g, value: val };
  });
  // invested-so-far per grid point (sum of flow amounts up to g)
  curve.forEach((c) => { c.invested = flows.reduce((s, f) => (f.t <= c.t && f.amt < 0 ? s - f.amt : s), 0); });

  flows.push({ t: end, amt: finalVal });
  flows.sort((a, b) => a.t - b.t);

  return {
    invested, finalVal, gain: finalVal - invested,
    absRet: invested ? (finalVal - invested) / invested : 0,
    xirr: xirr(flows), perFund: pf, curve,
  };
}

/* ---------------- formatting helpers ---------------- */
const inr = (n) => "₹" + Math.round(n).toLocaleString("en-IN");
const inrShort = (n) => {
  const a = Math.abs(n);
  if (a >= 1e7) return "₹" + (n / 1e7).toFixed(2) + " Cr";
  if (a >= 1e5) return "₹" + (n / 1e5).toFixed(2) + " L";
  if (a >= 1e3) return "₹" + (n / 1e3).toFixed(1) + "k";
  return "₹" + Math.round(n);
};
const pct = (n) => (n == null || !isFinite(n) ? "—" : (n * 100).toFixed(2) + "%");
const fmtDate = (t) => new Date(t).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
const fmtMon = (t) => new Date(t).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
const uid = () => Math.random().toString(36).slice(2, 9);

const PALETTE = ["#2e7d32", "#43a047", "#1b5e20", "#66bb6a", "#7cb342", "#9ccc65", "#558b2f", "#33691e"];

/* ===================================================================== */
export default function BacktestPage() {
  const [holdings, setHoldings] = useState([]);
  const [autoEqual, setAutoEqual] = useState(true);
  const [mode, setMode] = useState("sip"); // sip | lumpsum | combo
  const [lumpsum, setLumpsum] = useState(100000);
  const [monthly, setMonthly] = useState(10000);
  const [sipDay, setSipDay] = useState(1);
  const [lookback, setLookback] = useState("5"); // years | "max"
  const [benchOn, setBenchOn] = useState(false);
  const [bench, setBench] = useState(null); // holding-like

  const [sifList, setSifList] = useState([]);
  const [picker, setPicker] = useState(false);
  const [pickFor, setPickFor] = useState("holding"); // holding | bench

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");

  const cache = useRef({}); // id -> {series, inception, last, name}

  useEffect(() => {
    fetch("/api/sif-nav").then((r) => r.json()).then((d) => setSifList(d.schemes || [])).catch(() => {});
  }, []);

  /* ---- weight management ---- */
  const equalize = useCallback((list) => {
    if (!list.length) return list;
    const w = Math.round((100 / list.length) * 10) / 10;
    return list.map((h) => ({ ...h, weight: w }));
  }, []);

  const addHolding = (item) => {
    if (pickFor === "bench") {
      setBench({ key: "bench", ...item });
      setPicker(false);
      return;
    }
    if (holdings.some((h) => h.kind === item.kind && h.id === item.id)) { setPicker(false); return; }
    setHoldings((prev) => {
      const next = [...prev, { key: uid(), weight: 0, ...item }];
      return autoEqual ? equalize(next) : next;
    });
    setPicker(false);
  };
  const removeHolding = (key) =>
    setHoldings((prev) => { const next = prev.filter((h) => h.key !== key); return autoEqual ? equalize(next) : next; });
  const setWeight = (key, val) => {
    setAutoEqual(false);
    setHoldings((prev) => prev.map((h) => (h.key === key ? { ...h, weight: Math.max(0, +val || 0) } : h)));
  };
  const resetEqual = () => { setAutoEqual(true); setHoldings((prev) => equalize(prev)); };
  const weightSum = holdings.reduce((s, h) => s + (h.weight || 0), 0);

  /* ---- data loading ---- */
  const todayISO = () => new Date().toISOString().slice(0, 10);
  async function loadSeries(item) {
    const id = item.kind + ":" + item.id;
    if (cache.current[id]) return cache.current[id];
    let series = [];
    if (item.kind === "mf") {
      const d = await fetch(`/api/mf?code=${item.id}`).then((r) => r.json());
      if (!d || !d.data || !d.data.length) throw new Error(`No NAV history for ${item.name}`);
      series = normSeries(d.data, "mf");
    } else {
      const d = await fetch(`/api/sif-history?sd_id=${encodeURIComponent(item.id)}&from=2024-01-01&to=${todayISO()}`).then((r) => r.json());
      if (!d || !d.records || !d.records.length) throw new Error(`No NAV history for ${item.name}`);
      series = normSeries(d.records, "sif");
    }
    if (series.length < 2) throw new Error(`Not enough NAV history for ${item.name}`);
    const obj = { series, inception: series[0].t, last: series[series.length - 1].t };
    cache.current[id] = obj;
    return obj;
  }

  /* ---- run ---- */
  async function run() {
    setErr(""); setResult(null);
    if (!holdings.length) { setErr("Add at least one fund or SIF to your portfolio."); return; }
    if (weightSum <= 0) { setErr("Allocations add up to zero. Give at least one holding a weight."); return; }
    if ((mode === "lumpsum" || mode === "combo") && lumpsum <= 0) { setErr("Enter a lumpsum amount greater than zero."); return; }
    if ((mode === "sip" || mode === "combo") && monthly <= 0) { setErr("Enter a monthly SIP amount greater than zero."); return; }
    setRunning(true);
    try {
      const all = [...holdings];
      if (benchOn && bench) all.push(bench);
      const loaded = await Promise.all(all.map((h) => loadSeries(h).then((s) => ({ ...h, ...s }))));
      const port = loaded.slice(0, holdings.length);
      const bchk = benchOn && bench ? loaded[loaded.length - 1] : null;

      // common window across portfolio holdings
      const maxInc = Math.max(...port.map((h) => h.inception));
      const minLast = Math.min(...port.map((h) => h.last));
      let start = maxInc;
      const end = minLast;
      if (lookback !== "max") {
        const lb = end - parseInt(lookback, 10) * Y;
        if (lb > start) start = lb;
      }
      // snap start to first trading day available across all
      start = Math.max(...port.map((h) => fwd(h.series, start)?.t ?? start));
      if (!(start < end)) throw new Error("The selected funds don't share a long enough common history. Try removing the newest fund or a shorter look-back.");

      const youngest = port.reduce((a, b) => (b.inception > a.inception ? b : a));
      const constrained = lookback === "max" || maxInc > end - parseInt(lookback || "0", 10) * Y;

      const res = runBacktest({ holdings: port, mode, lumpsum, monthly, sipDay, start, end });

      let benchRes = null;
      if (bchk) {
        // feed the benchmark the SAME rupee cashflows (100% into the single fund)
        const bStart = Math.max(fwd(bchk.series, start)?.t ?? start, start);
        benchRes = runBacktest({ holdings: [{ ...bchk, weight: 1 }], mode, lumpsum, monthly, sipDay, start: Math.max(bStart, start), end });
      }

      setResult({
        ...res, start, end, mode, port,
        youngest: youngest.name, constrained,
        benchRes, benchName: bchk ? bchk.name : null,
        years: (end - start) / Y,
      });
    } catch (e) {
      setErr(e.message || "Something went wrong while running the backtest.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <div className="container">
        <Navbar activePage="backtest" />
        <style dangerouslySetInnerHTML={{ __html: CSS }} />

        <div className="page-header">
          <div className="page-eyebrow">Backtest · Hypothetical illustration</div>
          <h1 className="page-title">Portfolio <span>Backtester</span></h1>
          <p className="page-subtitle">
            Build a basket of mutual funds and SIFs, then replay it through real historical NAVs — see how a{" "}
            <b>SIP</b>, a <b>lumpsum</b>, or a <b>combination</b> would actually have played out.
          </p>
        </div>

      <div className="bt-body">
      <div className="bt-grid">
        {/* ---------------- LEFT: builder ---------------- */}
        <section className="bt-card">
          <div className="bt-card-h">
            <span className="bt-step">1</span>
            <h2>Build your portfolio</h2>
          </div>

          {holdings.length === 0 && (
            <div className="bt-empty">
              <div className="bt-empty-ic">＋</div>
              <p>No holdings yet. Add mutual funds or SIFs to begin.</p>
            </div>
          )}

          {holdings.length > 0 && (
            <div className="bt-holdings">
              {holdings.map((h, i) => (
                <div className="bt-hold" key={h.key}>
                  <span className="bt-dot" style={{ background: PALETTE[i % PALETTE.length] }} />
                  <div className="bt-hold-main">
                    <div className="bt-hold-name">{h.name}</div>
                    <div className="bt-hold-tag">
                      <span className={`bt-kind bt-kind-${h.kind}`}>{h.kind === "mf" ? "Mutual Fund" : "SIF"}</span>
                      {h.cat && <span className="bt-cat">{h.cat}</span>}
                    </div>
                  </div>
                  <div className="bt-wbox">
                    <input className="bt-wt" type="number" min="0" inputMode="decimal" value={h.weight}
                      onChange={(e) => setWeight(h.key, e.target.value)} />
                    <span className="bt-wpct">%</span>
                  </div>
                  <button className="bt-x" onClick={() => removeHolding(h.key)} aria-label="Remove">×</button>
                </div>
              ))}
            </div>
          )}

          <div className="bt-row">
            <button className="bt-btn bt-btn-pri" onClick={() => { setPickFor("holding"); setPicker(true); }}>
              ＋ Add fund / SIF
            </button>
            {holdings.length > 1 && (
              <>
                <button className="bt-btn bt-ghost" onClick={resetEqual}>Equal weight</button>
                <span className={`bt-sum ${Math.abs(weightSum - 100) < 0.5 ? "ok" : "warn"}`}>
                  Allocated: {weightSum.toFixed(1)}%{Math.abs(weightSum - 100) >= 0.5 && " · auto-normalised"}
                </span>
              </>
            )}
          </div>
        </section>

        {/* ---------------- RIGHT: strategy ---------------- */}
        <section className="bt-card">
          <div className="bt-card-h">
            <span className="bt-step">2</span>
            <h2>Choose your strategy</h2>
          </div>

          <div className="bt-seg" role="tablist">
            {[["sip", "SIP"], ["lumpsum", "Lumpsum"], ["combo", "Lumpsum + SIP"]].map(([v, l]) => (
              <button key={v} className={`bt-seg-b ${mode === v ? "on" : ""}`} onClick={() => setMode(v)}>{l}</button>
            ))}
          </div>

          <div className="bt-fields">
            {(mode === "lumpsum" || mode === "combo") && (
              <label className="bt-field">
                <span>{mode === "combo" ? "Initial lumpsum" : "Lumpsum amount"}</span>
                <div className="bt-inp"><i>₹</i>
                  <input type="number" min="0" inputMode="numeric" value={lumpsum}
                    onChange={(e) => setLumpsum(Math.max(0, +e.target.value || 0))} />
                </div>
              </label>
            )}
            {(mode === "sip" || mode === "combo") && (
              <>
                <label className="bt-field">
                  <span>Monthly SIP</span>
                  <div className="bt-inp"><i>₹</i>
                    <input type="number" min="0" inputMode="numeric" value={monthly}
                      onChange={(e) => setMonthly(Math.max(0, +e.target.value || 0))} />
                  </div>
                </label>
                <label className="bt-field bt-field-sm">
                  <span>SIP date</span>
                  <div className="bt-inp">
                    <select value={sipDay} onChange={(e) => setSipDay(+e.target.value)}>
                      {[1, 5, 10, 15, 20, 25].map((d) => <option key={d} value={d}>{d}{d === 1 ? "st" : d === 5 ? "th" : "th"}</option>)}
                    </select>
                  </div>
                </label>
              </>
            )}
            <label className="bt-field bt-field-sm">
              <span>Look-back</span>
              <div className="bt-inp">
                <select value={lookback} onChange={(e) => setLookback(e.target.value)}>
                  <option value="1">1 year</option>
                  <option value="3">3 years</option>
                  <option value="5">5 years</option>
                  <option value="7">7 years</option>
                  <option value="10">10 years</option>
                  <option value="max">Max available</option>
                </select>
              </div>
            </label>
          </div>

          <div className="bt-bench">
            <label className="bt-check">
              <input type="checkbox" checked={benchOn} onChange={(e) => setBenchOn(e.target.checked)} />
              <span>Compare against a benchmark fund</span>
            </label>
            {benchOn && (
              <div className="bt-bench-pick">
                {bench ? (
                  <div className="bt-bench-sel">
                    <span className="bt-dot" style={{ background: "#8d6e63" }} />
                    <span className="bt-bench-name">{bench.name}</span>
                    <button className="bt-x sm" onClick={() => setBench(null)}>×</button>
                  </div>
                ) : (
                  <button className="bt-btn bt-ghost sm" onClick={() => { setPickFor("bench"); setPicker(true); }}>
                    Pick benchmark (e.g. a Nifty 50 index fund)
                  </button>
                )}
              </div>
            )}
          </div>

          <button className="bt-run" onClick={run} disabled={running}>
            {running ? <span className="bt-spin" /> : "▸"} {running ? "Replaying NAV history…" : "Run backtest"}
          </button>
          {err && <div className="bt-err">{err}</div>}
        </section>
      </div>

      {/* ---------------- RESULTS ---------------- */}
      {result && <Results r={result} />}

      {/* disclaimer */}
      <div className="bt-disc">
        <strong>Important:</strong> This is a <b>hypothetical, back-tested illustration</b> built from historical NAVs for
        education only — it is <b>not investment advice</b> and not a recommendation of any scheme.{" "}
        <b>Past performance is not indicative of future results.</b> Mutual fund investments are subject to market risks;
        read all scheme-related documents carefully. SIFs (Specialised Investment Funds) are a newer, higher-risk category
        with limited live history, so their back-tests cover short periods only. Figures exclude exit loads, stamp duty,
        STT, expense-ratio changes and taxes, and use NAV on the next available trading day for each instalment.
        <div className="bt-arn">Abundance Financial Services · Mutual Fund Distributor · ARN-251838</div>
      </div>

      {picker && (
        <Picker
          sifList={sifList}
          onPick={addHolding}
          onClose={() => setPicker(false)}
          mode={pickFor}
        />
      )}
      </div>{/* /bt-body */}
      </div>{/* /container */}
      <Footer activePage="backtest" />
    </>
  );
}

/* ===================== RESULTS ===================== */
function Results({ r }) {
  const gainPos = r.gain >= 0;
  const rows = r.port
    .map((h, i) => ({ ...h, ...r.perFund[h.key], color: PALETTE[i % PALETTE.length] }))
    .sort((a, b) => b.value - a.value);
  return (
    <section className="bt-card bt-res">
      <div className="bt-card-h">
        <span className="bt-step done">✓</span>
        <h2>Results</h2>
        <span className="bt-period">
          {fmtDate(r.start)} → {fmtDate(r.end)} · {r.years.toFixed(1)} yrs
        </span>
      </div>

      {r.constrained && (
        <div className="bt-note">
          ⓘ The testable window is capped by <b>{r.youngest}</b>, the youngest holding. All funds are aligned to a common
          start so the comparison is fair.
        </div>
      )}

      <div className="bt-kpis">
        <Kpi label="Invested" val={inr(r.invested)} />
        <Kpi label="Final value" val={inr(r.finalVal)} accent />
        <Kpi label="Gain" val={(gainPos ? "+" : "−") + inr(Math.abs(r.gain)).slice(1)} sign={gainPos ? "pos" : "neg"} />
        <Kpi label="Absolute return" val={(r.absRet >= 0 ? "+" : "") + (r.absRet * 100).toFixed(1) + "%"} sign={r.absRet >= 0 ? "pos" : "neg"} />
        <Kpi label="XIRR (p.a.)" val={pct(r.xirr)} sign={r.xirr >= 0 ? "pos" : "neg"} hint="money-weighted annualised return" />
      </div>

      <Chart curve={r.curve} />

      {r.benchRes && (
        <div className="bt-compare">
          <div className="bt-cmp-row bt-cmp-head"><span>Strategy</span><span>Final value</span><span>XIRR</span></div>
          <div className="bt-cmp-row"><span><b>Your portfolio</b></span><span>{inr(r.finalVal)}</span><span className={r.xirr >= 0 ? "pos" : "neg"}>{pct(r.xirr)}</span></div>
          <div className="bt-cmp-row"><span>{r.benchName} <em>(benchmark)</em></span><span>{inr(r.benchRes.finalVal)}</span><span className={r.benchRes.xirr >= 0 ? "pos" : "neg"}>{pct(r.benchRes.xirr)}</span></div>
          <div className="bt-cmp-foot">
            {r.xirr >= r.benchRes.xirr
              ? `Your portfolio out-performed the benchmark by ${((r.xirr - r.benchRes.xirr) * 100).toFixed(2)} pts of XIRR.`
              : `The benchmark out-performed your portfolio by ${((r.benchRes.xirr - r.xirr) * 100).toFixed(2)} pts of XIRR.`}
          </div>
        </div>
      )}

      <div className="bt-table-wrap">
        <table className="bt-table">
          <thead><tr><th>Holding</th><th>Alloc</th><th>Invested</th><th>Value</th><th>Gain</th></tr></thead>
          <tbody>
            {rows.map((h) => {
              const g = h.value - h.invested;
              const share = r.finalVal ? (h.value / r.finalVal) * 100 : 0;
              return (
                <tr key={h.key}>
                  <td><span className="bt-dot sm" style={{ background: h.color }} />{h.name}
                    <span className={`bt-kind bt-kind-${h.kind} mini`}>{h.kind === "mf" ? "MF" : "SIF"}</span></td>
                  <td>{share.toFixed(0)}%</td>
                  <td>{inrShort(h.invested)}</td>
                  <td>{inrShort(h.value)}</td>
                  <td className={g >= 0 ? "pos" : "neg"}>{(g >= 0 ? "+" : "−") + inrShort(Math.abs(g)).slice(1)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Kpi({ label, val, sign, accent, hint }) {
  return (
    <div className={`bt-kpi ${accent ? "accent" : ""}`}>
      <div className="bt-kpi-l">{label}</div>
      <div className={`bt-kpi-v ${sign || ""}`}>{val}</div>
      {hint && <div className="bt-kpi-h">{hint}</div>}
    </div>
  );
}

/* ===================== CHART (self-drawn SVG) ===================== */
function Chart({ curve }) {
  const [hover, setHover] = useState(null);
  const W = 720, H = 260, padL = 8, padR = 8, padT = 16, padB = 26;
  const data = curve.filter((c) => isFinite(c.value));
  if (data.length < 2) return null;
  const xs = data.map((d) => d.t);
  const maxV = Math.max(...data.map((d) => Math.max(d.value, d.invested)), 1);
  const minX = xs[0], maxX = xs[xs.length - 1];
  const X = (t) => padL + ((t - minX) / (maxX - minX || 1)) * (W - padL - padR);
  const Yc = (v) => padT + (1 - v / maxV) * (H - padT - padB);
  const path = (key) => data.map((d, i) => `${i ? "L" : "M"}${X(d.t).toFixed(1)},${Yc(d[key]).toFixed(1)}`).join(" ");
  const area = `${path("value")} L${X(maxX).toFixed(1)},${Yc(0).toFixed(1)} L${X(minX).toFixed(1)},${Yc(0).toFixed(1)} Z`;

  const onMove = (e) => {
    const svg = e.currentTarget; const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = data[0], bd = Infinity;
    data.forEach((d) => { const dd = Math.abs(X(d.t) - px); if (dd < bd) { bd = dd; best = d; } });
    setHover(best);
  };

  return (
    <div className="bt-chart">
      <div className="bt-legend">
        <span><i className="lg lg-v" /> Portfolio value</span>
        <span><i className="lg lg-i" /> Amount invested</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          <linearGradient id="bt-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2e7d32" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#2e7d32" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#bt-fill)" />
        <path d={path("invested")} fill="none" stroke="#a8cfa8" strokeWidth="1.6" strokeDasharray="4 4" />
        <path d={path("value")} fill="none" stroke="#2e7d32" strokeWidth="2.4" strokeLinejoin="round" />
        {hover && (
          <g>
            <line x1={X(hover.t)} x2={X(hover.t)} y1={padT} y2={H - padB} stroke="#c2dfc2" strokeWidth="1" />
            <circle cx={X(hover.t)} cy={Yc(hover.value)} r="4" fill="#1b5e20" />
            <circle cx={X(hover.t)} cy={Yc(hover.invested)} r="3" fill="#a8cfa8" />
          </g>
        )}
      </svg>
      <div className="bt-axis"><span>{fmtMon(minX)}</span><span>{fmtMon(maxX)}</span></div>
      {hover && (
        <div className="bt-tip">
          <b>{fmtMon(hover.t)}</b>
          <span>Value <b>{inrShort(hover.value)}</b></span>
          <span>Invested {inrShort(hover.invested)}</span>
        </div>
      )}
    </div>
  );
}

/* ===================== PICKER MODAL ===================== */
function Picker({ sifList, onPick, onClose, mode }) {
  const [tab, setTab] = useState("mf");
  const [q, setQ] = useState("");
  const [res, setRes] = useState([]);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    if (tab !== "mf") return;
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 3) { setRes([]); return; }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const d = await fetch(`/api/mf?q=${encodeURIComponent(q.trim())}`).then((r) => r.json());
        // Distributor tool: hide Direct plans entirely; show Regular, Growth-first.
        const regular = (Array.isArray(d) ? d : []).filter((s) => !/\bdirect\b/i.test(s.schemeName));
        const ranked = regular.sort((a, b) => score(b.schemeName) - score(a.schemeName));
        setRes(ranked.slice(0, 40));
      } catch { setRes([]); }
      setLoading(false);
    }, 280);
    return () => timer.current && clearTimeout(timer.current);
  }, [q, tab]);

  const score = (n) => (/growth/i.test(n) ? 3 : 0) - (/(idcw|dividend|bonus|payout|reinvest|segregated)/i.test(n) ? 4 : 0);

  const sifFiltered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return sifList.filter((x) => !s || (x.nav_name || "").toLowerCase().includes(s) || (x.category || "").toLowerCase().includes(s));
  }, [q, sifList]);

  return (
    <div className="bt-modal" onMouseDown={onClose}>
      <div className="bt-modal-c" onMouseDown={(e) => e.stopPropagation()}>
        <div className="bt-modal-h">
          <h3>{mode === "bench" ? "Pick a benchmark fund" : "Add to portfolio"}</h3>
          <button className="bt-x" onClick={onClose}>×</button>
        </div>
        <div className="bt-seg sm">
          <button className={`bt-seg-b ${tab === "mf" ? "on" : ""}`} onClick={() => setTab("mf")}>Mutual Funds</button>
          <button className={`bt-seg-b ${tab === "sif" ? "on" : ""}`} onClick={() => setTab("sif")} disabled={mode === "bench"}>
            SIFs {mode === "bench" ? "" : `(${sifList.length})`}
          </button>
        </div>
        <div className="bt-search">
          <input ref={inputRef} placeholder={tab === "mf" ? "Search e.g. 'parag parikh flexi', 'nifty 50 index'…" : "Filter SIFs by name or strategy…"}
            value={q} onChange={(e) => setQ(e.target.value)} />
          {loading && <span className="bt-spin dark" />}
        </div>

        <div className="bt-list">
          {tab === "mf" && q.trim().length < 3 && <div className="bt-hint">Type at least 3 letters to search ~AMFI scheme master.</div>}
          {tab === "mf" && res.map((s) => (
            <button className="bt-item" key={s.schemeCode}
              onClick={() => onPick({ kind: "mf", id: s.schemeCode, name: clean(s.schemeName) })}>
              <span className="bt-item-n">{clean(s.schemeName)}</span>
              <span className="bt-add">Add</span>
            </button>
          ))}
          {tab === "mf" && !loading && q.trim().length >= 3 && res.length === 0 &&
            <div className="bt-hint">No schemes matched. Try a simpler keyword.</div>}

          {tab === "sif" && sifFiltered.map((s) => (
            <button className="bt-item" key={s.scheme_id}
              onClick={() => onPick({ kind: "sif", id: s.scheme_id, name: s.nav_name, cat: shortCat(s.category) })}>
              <span className="bt-item-n">{s.nav_name}
                <span className="bt-item-sub">{shortCat(s.category)} · NAV ₹{s.nav}</span>
              </span>
              <span className="bt-add">Add</span>
            </button>
          ))}
          {tab === "sif" && sifFiltered.length === 0 && <div className="bt-hint">No SIFs matched.</div>}
        </div>
        {tab === "sif" && <div className="bt-modal-f">SIFs are newer and have limited NAV history — back-tests will cover only the period since their launch.</div>}
      </div>
    </div>
  );
}
const clean = (n) => n.replace(/\s*-\s*/g, " - ").trim();
const shortCat = (c) => (c || "").replace(/Equity Oriented Investment Strategies\s*-\s*/i, "").replace(/Debt Oriented Investment Strategies\s*-\s*/i, "").trim() || "SIF";

/* ===================== SCOPED CSS ===================== */
const CSS = `
.bt-body{font-family:Raleway,sans-serif;color:var(--text);padding-bottom:48px}
.bt-body b{color:var(--g2)}
.bt-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}
@media(max-width:780px){.bt-grid{grid-template-columns:1fr}}
.bt-card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:20px;box-shadow:var(--shadow)}
.bt-card-h{display:flex;align-items:center;gap:10px;margin-bottom:16px}
.bt-card-h h2{font-size:17px;font-weight:700;margin:0;color:var(--text)}
.bt-step{display:grid;place-items:center;width:26px;height:26px;border-radius:8px;background:var(--g-xlight);color:var(--g1);font:700 13px JetBrains Mono,monospace;border:1px solid var(--border)}
.bt-step.done{background:var(--g2);color:#fff;border-color:var(--g2)}
.bt-period{margin-left:auto;font:600 12px JetBrains Mono,monospace;color:var(--muted)}

.bt-empty{text-align:center;padding:26px 10px;color:var(--muted)}
.bt-empty-ic{font-size:30px;color:var(--g-light);margin-bottom:6px}
.bt-empty p{margin:0;font-size:14px}

.bt-holdings{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}
.bt-hold{display:flex;align-items:center;gap:10px;background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:10px 12px}
.bt-dot{width:10px;height:10px;border-radius:50%;flex:none}
.bt-dot.sm{width:8px;height:8px;display:inline-block;margin-right:7px}
.bt-hold-main{flex:1;min-width:0}
.bt-hold-name{font-size:13.5px;font-weight:600;color:var(--text);line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bt-hold-tag{display:flex;gap:6px;margin-top:3px;flex-wrap:wrap}
.bt-kind{font:600 10px JetBrains Mono,monospace;padding:2px 6px;border-radius:5px;text-transform:uppercase;letter-spacing:.04em}
.bt-kind.mini{margin-left:8px;vertical-align:middle}
.bt-kind-mf{background:var(--g-xlight);color:var(--g1)}
.bt-kind-sif{background:#fff3e0;color:var(--warn)}
.bt-cat{font-size:10.5px;color:var(--muted);align-self:center}
.bt-wbox{display:flex;align-items:center;gap:2px;background:#fff;border:1px solid var(--border2);border-radius:8px;padding:2px 6px 2px 4px}
.bt-wt{width:46px;border:0;outline:0;text-align:right;font:700 14px JetBrains Mono,monospace;color:var(--g1);background:transparent}
.bt-wpct{font:600 12px JetBrains Mono,monospace;color:var(--muted)}
.bt-x{border:0;background:var(--s3);color:var(--text2);width:26px;height:26px;border-radius:7px;font-size:18px;line-height:1;cursor:pointer;flex:none}
.bt-x:hover{background:var(--neg-bg);color:var(--neg)}
.bt-x.sm{width:22px;height:22px;font-size:15px}

.bt-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.bt-btn{border-radius:9px;font:600 13px Raleway,sans-serif;padding:10px 14px;cursor:pointer;border:1px solid transparent;transition:.15s}
.bt-btn-pri{background:var(--g2);color:#fff}
.bt-btn-pri:hover{background:var(--g1)}
.bt-ghost{background:#fff;border-color:var(--border2);color:var(--text2)}
.bt-ghost:hover{background:var(--s2)}
.bt-btn.sm{padding:7px 11px;font-size:12px}
.bt-sum{font:600 11.5px JetBrains Mono,monospace;margin-left:auto}
.bt-sum.ok{color:var(--g3)}
.bt-sum.warn{color:var(--warn)}

.bt-seg{display:flex;gap:4px;background:var(--s2);border:1px solid var(--border);border-radius:11px;padding:4px;margin-bottom:16px}
.bt-seg.sm{margin-bottom:12px}
.bt-seg-b{flex:1;border:0;background:transparent;padding:9px 8px;border-radius:8px;font:600 13px Raleway,sans-serif;color:var(--text2);cursor:pointer;transition:.15s}
.bt-seg-b.on{background:#fff;color:var(--g1);box-shadow:0 1px 4px #2e7d3220}
.bt-seg-b:disabled{opacity:.4;cursor:not-allowed}

.bt-fields{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:14px}
.bt-field{flex:1;min-width:140px;display:flex;flex-direction:column;gap:6px}
.bt-field-sm{flex:0 0 120px;min-width:110px}
.bt-field>span{font:600 11.5px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.bt-inp{display:flex;align-items:center;background:#fff;border:1px solid var(--border2);border-radius:9px;padding:0 10px;transition:.15s}
.bt-inp:focus-within{border-color:var(--g3);box-shadow:0 0 0 3px #43a04722}
.bt-inp i{font-style:normal;color:var(--muted);font:600 14px JetBrains Mono,monospace;margin-right:4px}
.bt-inp input,.bt-inp select{border:0;outline:0;background:transparent;padding:10px 0;width:100%;font:600 15px JetBrains Mono,monospace;color:var(--text)}
.bt-inp select{cursor:pointer;font-family:Raleway,sans-serif;font-size:14px}

.bt-bench{border-top:1px dashed var(--border);padding-top:14px;margin-bottom:16px}
.bt-check{display:flex;align-items:center;gap:9px;cursor:pointer;font-size:13.5px;color:var(--text2);font-weight:600}
.bt-check input{width:17px;height:17px;accent-color:var(--g2)}
.bt-bench-pick{margin-top:10px}
.bt-bench-sel{display:flex;align-items:center;gap:8px;background:var(--s2);border:1px solid var(--border);border-radius:9px;padding:8px 10px;font-size:13px}
.bt-bench-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.bt-run{width:100%;margin-top:4px;background:var(--g1);color:#fff;border:0;border-radius:11px;padding:15px;font:700 15px Raleway,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:9px;transition:.15s}
.bt-run:hover:not(:disabled){background:#0f3d13}
.bt-run:disabled{opacity:.75;cursor:wait}
.bt-err{margin-top:12px;background:var(--neg-bg);color:var(--neg);border:1px solid var(--neg-light);border-radius:9px;padding:11px 13px;font-size:13px;font-weight:600}

.bt-spin{width:15px;height:15px;border:2px solid #ffffff66;border-top-color:#fff;border-radius:50%;animation:bt-rot .7s linear infinite}
.bt-spin.dark{border-color:#43a04744;border-top-color:var(--g2)}
@keyframes bt-rot{to{transform:rotate(360deg)}}

.bt-res{margin-top:18px;animation:bt-in .4s ease}
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
.bt-table th:first-child{text-align:left}
.bt-table td{padding:11px 10px;border-bottom:1px solid var(--s3);text-align:right;font-family:JetBrains Mono,monospace;font-weight:600;color:var(--text2)}
.bt-table td:first-child{text-align:left;font-family:Raleway,sans-serif;color:var(--text);max-width:300px}

.bt-disc{margin-top:24px;background:var(--s2);border:1px solid var(--border);border-radius:11px;padding:15px 17px;font-size:11.5px;line-height:1.65;color:var(--muted)}
.bt-disc b,.bt-disc strong{color:var(--text2)}
.bt-arn{margin-top:8px;font:600 11px JetBrains Mono,monospace;color:var(--g3)}

.bt-modal{position:fixed;inset:0;background:#0d260d66;backdrop-filter:blur(3px);display:flex;align-items:flex-start;justify-content:center;padding:5vh 14px;z-index:90;animation:bt-in .2s}
.bt-modal-c{background:var(--surface);border:1px solid var(--border2);border-radius:16px;width:100%;max-width:560px;max-height:86vh;display:flex;flex-direction:column;box-shadow:var(--shadow-lg);overflow:hidden}
.bt-modal-h{display:flex;align-items:center;justify-content:space-between;padding:16px 18px 12px}
.bt-modal-h h3{margin:0;font-size:16px;font-weight:700;color:var(--g1)}
.bt-modal-c .bt-seg{margin:0 18px 12px}
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
