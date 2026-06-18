'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const DMAS = [20, 50, 100, 150, 200];
const pctOf = (a, t) => (t ? (100 * a) / t : null);
const fmtPct = (v, d = 0) => (v == null ? '—' : v.toFixed(d) + '%');
const fmtNum = (v) => (v == null ? '—' : v.toLocaleString('en-IN'));
const sign = (v) => (v == null ? '' : v > 0 ? '+' : '');

function regimeLabel(p) {
  if (p == null) return ['Unknown', 'brd-neutral'];
  if (p >= 60) return ['Risk-on', 'brd-up'];
  if (p >= 40) return ['Mixed / neutral', 'brd-neutral'];
  if (p >= 20) return ['Risk-off', 'brd-warn'];
  return ['Deep risk-off', 'brd-down'];
}

/* ---- stock screener helpers ---- */
const SS_PAGE_SIZE = 50;
const SS_FILTERS = [
  { key: 'above_200',    label: 'Above 200 DMA', pos: true  },
  { key: 'above_50',     label: 'Above 50 DMA',  pos: true  },
  { key: 'above_20',     label: 'Above 20 DMA',  pos: true  },
  { key: 'bull_stacked', label: 'Bull stacked',  pos: true  },
  { key: 'bear_stacked', label: 'Bear stacked',  pos: false },
  { key: 'golden_cross', label: 'Golden cross',  pos: true  },
  { key: 'death_cross',  label: 'Death cross',   pos: false },
  { key: 'new_high_52w', label: '52W high',      pos: true  },
  { key: 'new_low_52w',  label: '52W low',       pos: false },
];
const fmtClose = (v, d = 2) => v == null ? '—' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
function ssAboveCount(s) { return [s.above_20, s.above_50, s.above_100, s.above_150, s.above_200].filter(Boolean).length; }
function SsDmaDots({ s }) {
  return (
    <span className="ssc-dots">
      {[20, 50, 100, 150, 200].map((n) => (
        <span key={n} className={`ssc-dot ${s['above_' + n] === true ? 'on' : s['above_' + n] === false ? 'off' : 'na'}`} title={`${n} DMA`} />
      ))}
    </span>
  );
}
function SsSignalBadges({ s }) {
  const badges = [];
  if (s.bull_stacked) badges.push(['bs-bull', 'Bull↑']);
  if (s.bear_stacked) badges.push(['bs-bear', 'Bear↓']);
  if (s.golden_cross) badges.push(['bs-gc',   'GC']);
  if (s.death_cross)  badges.push(['bs-dc',   'DC']);
  if (s.new_high_52w) badges.push(['bs-hi',   '52H']);
  if (s.new_low_52w)  badges.push(['bs-lo',   '52L']);
  if (!badges.length) return null;
  return (
    <span className="ssc-badges">
      {badges.map(([c, lbl]) => <span key={c} className={`ssc-badge ${c}`}>{lbl}</span>)}
    </span>
  );
}

export default function BreadthPage() {
  const { data: session, status } = useSession();
  const isAuthed = status === 'authenticated';
  const isPro    = session?.user?.plan === 'pro';

  const [data, setData] = useState(null);
  const [idx, setIdx] = useState(null);
  const [err, setErr] = useState('');
  const [date, setDate] = useState(null);
  const [mode, setMode] = useState('day'); // day | week | month
  const [sectorData, setSectorData] = useState(null);

  const [tab, setTab]         = useState('breadth');
  const [ssRaw, setSsRaw]     = useState(null);
  const [ssErr, setSsErr]     = useState('');
  const [ssLoaded, setSsLoaded] = useState(false);

  useEffect(() => {
    if (!isAuthed || !isPro) return;
    fetch('/api/breadth').then((r) => r.json()).then((d) => {
      if (d.error) { setErr(d.error); return; }
      setData(d); setDate(d.asof);
    }).catch(() => setErr('Could not load breadth data.'));
  }, [isAuthed, isPro]);

  useEffect(() => {
    fetch('/api/breadth-indices').then((r) => r.json()).then(setIdx).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isAuthed || !isPro) return;
    fetch('/api/sector-breadth')
      .then((r) => r.json())
      .then((d) => { if (!d.error && d.snaps?.length) setSectorData(d); })
      .catch(() => {});
  }, [isAuthed, isPro]);

  useEffect(() => {
    if (tab !== 'screener' || !isPro || ssLoaded) return;
    setSsLoaded(true);
    fetch('/api/stock-signals')
      .then((r) => r.json())
      .then((d) => { if (d.error) { setSsErr(d.error); return; } setSsRaw(d); })
      .catch(() => setSsErr('Could not load stock signals.'));
  }, [tab, isPro, ssLoaded]);

  const snaps = data?.snaps || [];
  const dates = useMemo(() => snaps.map((s) => s.date), [snaps]);
  const curIdx = date ? dates.indexOf(date) : -1;
  const cur = curIdx >= 0 ? snaps[curIdx] : null;
  const offset = mode === 'day' ? 1 : mode === 'week' ? 5 : 21;
  const prev = curIdx > 0 ? snaps[Math.max(0, curIdx - offset)] : null;

  const dmaRows = useMemo(() => {
    if (!cur) return [];
    return DMAS.map((n) => {
      const a = cur['a' + n], t = cur['t' + n];
      const p = pctOf(a, t);
      const pp = prev ? pctOf(prev['a' + n], prev['t' + n]) : null;
      const series = snaps.slice(Math.max(0, curIdx - 29), curIdx + 1).map((s) => pctOf(s['a' + n], s['t' + n]));
      return { n, a, t, below: t != null && a != null ? t - a : null, pct: p, delta: p != null && pp != null ? p - pp : null, series };
    });
  }, [cur, prev, snaps, curIdx]);

  const [rLabel, rCls] = regimeLabel(cur?.regime_pct);
  const pct50 = cur ? pctOf(cur.a50, cur.t50) : null;

  const adData = useMemo(() => {
    if (!snaps.length) return [];
    let cum = 0;
    return snaps.map((s) => {
      const hasData = (s.advancing ?? 0) + (s.declining ?? 0) > 0;
      if (hasData) cum += (s.advancing ?? 0) - (s.declining ?? 0);
      return { date: s.date, net: (s.advancing ?? 0) - (s.declining ?? 0), cum, hasData };
    });
  }, [snaps]);

  const percentileMap = useMemo(() => {
    if (!snaps.length || !cur) return {};
    const out = {};
    for (const n of DMAS) {
      const vals = snaps.map((s) => pctOf(s['a' + n], s['t' + n])).filter((v) => v != null).sort((a, b) => a - b);
      const curVal = pctOf(cur['a' + n], cur['t' + n]);
      if (curVal == null || !vals.length) { out[n] = null; continue; }
      out[n] = Math.round((vals.filter((v) => v < curVal).length / vals.length) * 100);
    }
    return out;
  }, [snaps, cur]);

  const curSectorSnap = useMemo(() => {
    if (!sectorData?.snaps) return null;
    return sectorData.snaps.find((s) => s.date === date) ?? sectorData.snaps[sectorData.snaps.length - 1];
  }, [sectorData, date]);

  const signals = useMemo(() => {
    if (!cur) return [];
    const out = [];
    const p200 = cur.regime_pct, p20 = pctOf(cur.a20, cur.t20);
    if (p200 != null) out.push(p200 >= 60 ? ['up', 'Broad uptrend — majority of stocks above their 200-DMA.'] : p200 < 40 ? ['down', 'Defensive tape — most stocks are below their 200-DMA.'] : ['neutral', 'Two-sided market — selectivity matters.']);
    if (p20 != null && p200 != null && p20 - p200 > 20) out.push(['up', 'Short-term rebound building inside a weaker long-term trend.']);
    if (p20 != null && p200 != null && p200 - p20 > 20) out.push(['down', 'Short-term weakness against a firmer long-term trend.']);
    if (cur.advancing != null && cur.declining) {
      if (cur.advancing > 2 * cur.declining) out.push(['up', 'Strong advance-decline — broad buying across the tape.']);
      else if (cur.declining > 2 * cur.advancing) out.push(['down', 'Heavy advance-decline skew — broad selling pressure.']);
    }
    if (cur.new_high != null && cur.new_low != null) {
      if (cur.new_high > Math.max(5, cur.new_low * 3)) out.push(['up', `Expanding new highs (${cur.new_high} vs ${cur.new_low} new lows).`]);
      else if (cur.new_low > Math.max(5, cur.new_high * 3)) out.push(['down', `Expanding new lows (${cur.new_low} vs ${cur.new_high} new highs) — distribution.`]);
    }
    const back = snaps[Math.max(0, curIdx - 5)];
    if (back && pct50 != null) { const d = pct50 - pctOf(back.a50, back.t50); if (d > 12) out.push(['up', 'Breadth thrust — share above the 50-DMA jumped sharply this week.']); if (d < -12) out.push(['down', 'Breadth breakdown — share above the 50-DMA fell sharply this week.']); }
    return out;
  }, [cur, snaps, curIdx, pct50]);

  return (
    <div className="brd-body">
      <Navbar activePage="breadth" />
      <div className="container">
        <div className="page-header">
          <div className="page-eyebrow"><span className="live-dot" /><span className="page-eyebrow-text">Live · market breadth · BSE equity universe</span></div>
          <h1 className="page-title">Market Breadth <span className="brd-prem">PREMIUM</span></h1>
          <p className="page-subtitle">How broad is the move? Participation across ~{cur ? fmtNum(cur.universe) : '2,200'} stocks — moving-average breadth, advance-decline and new highs/lows, updated every trading day.</p>
        </div>

        {/* index strip — visible to all visitors */}
        <div className="brd-indices">
          {(idx?.indices || [{ key: 'a' }, { key: 'b' }, { key: 'c' }, { key: 'd' }]).map((ix) => (
            <div className="brd-ix" key={ix.key}>
              <div className="brd-ix-top"><span className="brd-ix-name">{ix.label || '—'}</span>{ix.tag && <span className={`brd-ix-tag ${tagCls(ix.tag)}`}>{ix.tag}</span>}</div>
              <div className="brd-ix-lvl">{ix.last != null ? ix.last.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}</div>
              <div className="brd-ix-sub">
                <span className="brd-ix-rsi">RSI(14)W {ix.rsi_w ?? '—'}</span>
                {ix.change_pct != null && <span className={ix.change_pct >= 0 ? 'brd-up' : 'brd-down'}>{ix.change_pct >= 0 ? '▲' : '▼'} {Math.abs(ix.change_pct).toFixed(2)}%</span>}
              </div>
              {ix.spark && ix.spark.length > 1 && <Spark series={ix.spark} />}
            </div>
          ))}
        </div>

        <div className="brd-tabs">
          <button className={`brd-tab ${tab === 'breadth' ? 'on' : ''}`} onClick={() => setTab('breadth')}>Market Breadth</button>
          <button className={`brd-tab ${tab === 'screener' ? 'on' : ''}`} onClick={() => setTab('screener')}>Stock Screener</button>
        </div>

        {tab === 'breadth' && <>
        {status !== 'loading' && !isAuthed && <BreadthGate />}
        {status !== 'loading' && isAuthed && !isPro && <ProGate />}

        {isAuthed && isPro && <>

        {err && <div className="brd-err">{err} The dashboard populates once the nightly breadth job has written snapshots.</div>}

        {/* regime */}
        {cur && (
          <div className={`brd-regime ${rCls}`}>
            <div className="brd-regime-pct">{cur.regime_pct != null ? Math.round(cur.regime_pct) : '—'}%</div>
            <div className="brd-regime-body">
              <div className="brd-regime-label">{rLabel}</div>
              <div className="brd-regime-sub">{cur.regime_pct >= 40 && cur.regime_pct < 60 ? 'Two-sided market — selectivity matters.' : 'Regime read from breadth.'} · {fmtPct(cur.regime_pct, 0)} above 200-DMA, {fmtPct(pct50, 0)} above 50-DMA.</div>
            </div>
          </div>
        )}

        {/* breadth trend over time */}
        {snaps.length > 2 && <TrendChart snaps={snaps} />}
        {adData.length > 39 && <ADLineChart adData={adData} />}

        {/* time controls */}
        {cur && (
          <div className="brd-controls">
            <div className="brd-modes">
              {[['day', 'Day-on-day'], ['week', 'Week-on-week'], ['month', 'Month-on-month']].map(([k, l]) => (
                <button key={k} className={`brd-mode ${mode === k ? 'on' : ''}`} onClick={() => setMode(k)}>{l}</button>
              ))}
            </div>
            <label className="brd-datesel">State at close on
              <select value={date || ''} onChange={(e) => setDate(e.target.value)}>
                {[...dates].reverse().map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
          </div>
        )}

        {/* DMA cards */}
        {cur && (
          <div className="brd-grid">
            {dmaRows.map((r) => (
              <div className="brd-card" key={r.n}>
                <div className="brd-card-h">Above {r.n} DMA</div>
                <div className="brd-card-big">{fmtNum(r.a)}</div>
                <div className="brd-card-meta">{fmtPct(r.pct, 0)} · {fmtNum(r.below)} below</div>
                <Spark series={r.series} />
                <div className={`brd-card-delta ${r.delta == null ? '' : r.delta >= 0 ? 'brd-up' : 'brd-down'}`}>{r.delta == null ? '—' : `${r.delta >= 0 ? '▲' : '▼'} ${Math.abs(r.delta).toFixed(1)} pts vs ${mode === 'day' ? 'prev day' : mode === 'week' ? 'prev wk' : 'prev mo'}`}</div>
                {percentileMap[r.n] != null && <div className={`brd-card-pctile ${percentileMap[r.n] >= 75 ? 'brd-up' : percentileMap[r.n] < 25 ? 'brd-down' : 'brd-neutral'}`}>{percentileMap[r.n]}th pctile of history</div>}
              </div>
            ))}
          </div>
        )}

        {/* daily internals */}
        {cur && (
          <>
            <div className="brd-section-h">Daily internals · {date}</div>
            <div className="brd-internals">
              <div className="brd-int"><span className="brd-int-l">Advancing</span><b className="brd-up">{fmtNum(cur.advancing)}</b></div>
              <div className="brd-int"><span className="brd-int-l">Declining</span><b className="brd-down">{fmtNum(cur.declining)}</b></div>
              <div className="brd-int"><span className="brd-int-l">New 52W highs</span><b className="brd-up">{fmtNum(cur.new_high)}</b></div>
              <div className="brd-int"><span className="brd-int-l">New 52W lows</span><b className="brd-down">{fmtNum(cur.new_low)}</b></div>
            </div>
          </>
        )}

        {/* signal counts (golden/death cross, stacked alignment) */}
        {cur && (cur.golden_cross != null || cur.bull_stacked != null) && (
          <>
            <div className="brd-section-h">Signals · {date}</div>
            <div className="brd-internals">
              <div className="brd-int"><span className="brd-int-l">Golden cross 50×200</span><b className="brd-up">{fmtNum(cur.golden_cross)}</b></div>
              <div className="brd-int"><span className="brd-int-l">Death cross 50×200</span><b className="brd-down">{fmtNum(cur.death_cross)}</b></div>
              <div className="brd-int"><span className="brd-int-l">Bullish stacked</span><b className="brd-up">{fmtNum(cur.bull_stacked)}</b></div>
              <div className="brd-int"><span className="brd-int-l">Bearish stacked</span><b className="brd-down">{fmtNum(cur.bear_stacked)}</b></div>
            </div>
          </>
        )}

        {/* signals */}
        {signals.length > 0 && (
          <>
            <div className="brd-section-h">Signals</div>
            <div className="brd-signals">
              {signals.map((s, i) => (
                <div className={`brd-signal ${s[0]}`} key={i}><span className="brd-sig-dot" />{s[1]}</div>
              ))}
            </div>
          </>
        )}

        {curSectorSnap && sectorData?.sectors && (
          <>
            <div className="brd-section-h sec-section-h">Sector breadth · {date}<SectorGlossary /></div>
            <SectorGrid snap={curSectorSnap} sectors={sectorData.sectors} />
          </>
        )}

        {sectorData?.snaps?.length > 5 && (
          <>
            <div className="brd-section-h">Sector rotation · ranked by 200-DMA breadth · week-on-week change</div>
            <SectorRotation sectorData={sectorData} date={date} />
          </>
        )}

        </>}

        <BreadthFAQ />

        <div className="brd-disc">
          <b>Disclaimer.</b> Educational market-breadth analytics by <b>Atin Kumar Agrawal | Abundance Financial Services</b> · AMFI Registered Mutual Funds &amp; SIF Distributor (ARN-251838). Breadth is computed on end-of-day prices for the BSE main-board equity universe (groups A/B); index levels and weekly RSI are sourced separately and may differ slightly from NSE. Moving-average and 52-week figures use unadjusted prices. This is technical market context for education only — not a recommendation to buy or sell any security, index or fund. Past behaviour does not predict future results.
        </div>
        </>}

        {tab === 'screener' && (
          !isAuthed ? <BreadthGate /> :
          !isPro    ? <ProGate /> :
          <StockScreenerSection raw={ssRaw} err={ssErr} />
        )}
      </div>
      <Footer activePage="breadth" />
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
    </div>
  );
}

function tagCls(t) {
  if (/bull|low/i.test(t)) return 'tg-up';
  if (/bear|high/i.test(t)) return 'tg-down';
  if (/elevat/i.test(t)) return 'tg-warn';
  return 'tg-neutral';
}

const DMA_LINES = [
  { n: 20, c: '#66bb6a' }, { n: 50, c: '#2e7d32' }, { n: 100, c: '#f9a825' }, { n: 150, c: '#5b8def' }, { n: 200, c: '#e53935' },
];

function TrendChart({ snaps }) {
  const [range, setRange] = useState('6M');
  const [hi, setHi] = useState(null);
  const [hidden, setHidden] = useState(() => new Set());
  const N = { '1M': 22, '3M': 66, '6M': 126, '1Y': 252, 'All': snaps.length }[range];
  const data = snaps.slice(Math.max(0, snaps.length - N));
  if (data.length < 2) return null;
  const W = 760, H = 240, padL = 30, padR = 12, padT = 10, padB = 22;
  const iw = W - padL - padR, ih = H - padT - padB;
  const X = (i) => padL + (i / (data.length - 1)) * iw;
  const Y = (v) => padT + (1 - v / 100) * ih;
  const pathOf = (n) => {
    let d = '', started = false;
    data.forEach((s, i) => { const v = pctOf(s['a' + n], s['t' + n]); if (v == null) return; d += `${started ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)} `; started = true; });
    return d.trim();
  };
  const toggle = (n) => setHidden((h) => { const s = new Set(h); s.has(n) ? s.delete(n) : s.add(n); return s; });
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
    let i = Math.round(((cx / r.width) * W - padL) / iw * (data.length - 1));
    setHi(Math.max(0, Math.min(data.length - 1, i)));
  };
  const hv = hi != null ? data[hi] : null;
  const tipLeft = hi != null ? `${(X(hi) / W) * 100}%` : '0';
  const tipFlip = hi != null && X(hi) / W > 0.6;

  return (
    <div className="brd-trend">
      <div className="brd-trend-head">
        <div className="brd-trend-title">Breadth over time <span className="brd-trend-sub2">% of stocks above each DMA</span></div>
        <div className="brd-trend-ranges">
          {['1M', '3M', '6M', '1Y', 'All'].map((r) => <button key={r} className={`brd-rg ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>{r}</button>)}
        </div>
      </div>
      <div className="brd-legend">
        {DMA_LINES.map((l) => (
          <button key={l.n} className={`brd-legchip ${hidden.has(l.n) ? 'off' : ''}`} onClick={() => toggle(l.n)}>
            <i style={{ background: l.c }} />{l.n} DMA
            <b>{hv ? fmtPct(pctOf(hv['a' + l.n], hv['t' + l.n]), 0) : fmtPct(pctOf(data[data.length - 1]['a' + l.n], data[data.length - 1]['t' + l.n]), 0)}</b>
          </button>
        ))}
      </div>
      <div className="brd-trend-wrap">
        <svg className="brd-trend-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onMouseMove={onMove} onMouseLeave={() => setHi(null)} onTouchStart={onMove} onTouchMove={onMove}>
          <rect x={padL} y={Y(60)} width={iw} height={Y(40) - Y(60)} fill="var(--warn-bg,#fff3e0)" opacity="0.45" />
          {[0, 20, 40, 60, 80, 100].map((g) => (<g key={g}><line x1={padL} y1={Y(g)} x2={W - padR} y2={Y(g)} stroke="var(--border)" strokeWidth="0.5" /><text x={2} y={Y(g) + 3} fontSize="9" fill="var(--muted)" fontFamily="monospace">{g}</text></g>))}
          {DMA_LINES.filter((l) => !hidden.has(l.n)).map((l) => <path key={l.n} d={pathOf(l.n)} fill="none" stroke={l.c} strokeWidth={l.n === 200 ? 2 : 1.4} opacity={l.n === 200 || l.n === 20 ? 1 : 0.9} />)}
          {hi != null && (<g>
            <line x1={X(hi)} y1={padT} x2={X(hi)} y2={H - padB} stroke="var(--muted)" strokeWidth="0.7" strokeDasharray="3 3" />
            {DMA_LINES.filter((l) => !hidden.has(l.n)).map((l) => { const v = pctOf(hv['a' + l.n], hv['t' + l.n]); return v == null ? null : <circle key={l.n} cx={X(hi)} cy={Y(v)} r="3" fill={l.c} />; })}
          </g>)}
        </svg>
        {hi != null && (
          <div className="brd-tip" style={{ left: tipLeft, transform: `translateX(${tipFlip ? 'calc(-100% - 12px)' : '12px'})` }}>
            <div className="brd-tip-date">{hv.date}</div>
            {DMA_LINES.filter((l) => !hidden.has(l.n)).map((l) => (
              <div className="brd-tip-row" key={l.n}><span><i style={{ background: l.c }} />{l.n} DMA</span><b>{fmtPct(pctOf(hv['a' + l.n], hv['t' + l.n]), 0)}</b></div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Spark({ series }) {
  const pts = (series || []).filter((v) => v != null);
  if (pts.length < 2) return <div className="brd-spark-empty" />;
  const W = 150, H = 34, min = Math.min(...pts), max = Math.max(...pts);
  const X = (i) => (i / (pts.length - 1)) * W;
  const Y = (v) => H - 3 - ((v - min) / (max - min || 1)) * (H - 6);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const up = pts[pts.length - 1] >= pts[0];
  return (
    <svg className="brd-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <path d={`${d} L${W},${H} L0,${H} Z`} fill={up ? 'var(--g-xlight)' : '#fdeaea'} />
      <path d={d} fill="none" stroke={up ? 'var(--g2)' : 'var(--neg)'} strokeWidth="1.5" />
    </svg>
  );
}

function ADLineChart({ adData }) {
  const [range, setRange] = useState('6M');
  const [hi, setHi] = useState(null);

  const { allEma19, allEma39 } = useMemo(() => {
    const k19 = 2 / 20, k39 = 2 / 40;
    let e19 = null, e39 = null;
    const allEma19 = [], allEma39 = [];
    for (const d of adData) {
      if (d.hasData) {
        e19 = e19 == null ? d.net : d.net * k19 + e19 * (1 - k19);
        e39 = e39 == null ? d.net : d.net * k39 + e39 * (1 - k39);
      }
      allEma19.push(e19);
      allEma39.push(e39);
    }
    return { allEma19, allEma39 };
  }, [adData]);

  const N = { '1M': 22, '3M': 66, '6M': 126, '1Y': 252, 'All': adData.length }[range];
  const startIdx = Math.max(0, adData.length - N);
  const data = adData.slice(startIdx);
  const mdata = allEma19.slice(startIdx).map((e19, i) => {
    const e39 = allEma39[startIdx + i];
    return e19 != null && e39 != null ? +(e19 - e39).toFixed(1) : null;
  });

  if (data.length < 5) return null;

  const W = 760, H1 = 150, H2 = 80, padL = 44, padR = 12, padT = 8, padB = 18;
  const iw = W - padL - padR;
  const Xc = (i) => padL + (i / Math.max(data.length - 1, 1)) * iw;

  const cumVals = data.filter((d) => d.hasData).map((d) => d.cum);
  const cumMin = Math.min(...cumVals), cumMax = Math.max(...cumVals), cumRange = cumMax - cumMin || 1;
  const Yad = (v) => padT + (1 - (v - cumMin) / cumRange) * (H1 - padT - padB);
  let adPath = '', adStarted = false;
  data.forEach((d, i) => { if (!d.hasData) return; adPath += `${adStarted ? 'L' : 'M'}${Xc(i).toFixed(1)},${Yad(d.cum).toFixed(1)} `; adStarted = true; });
  const adFill = adPath ? `${adPath}L${Xc(data.length - 1)},${H1 - padB} L${padL},${H1 - padB} Z` : '';
  const lastCum = cumVals[cumVals.length - 1] ?? 0;
  const firstCum = cumVals[0] ?? 0;
  const adUp = lastCum >= firstCum;

  const mcVals = mdata.filter((v) => v != null);
  const mcAbs = mcVals.length ? Math.max(Math.abs(Math.min(...mcVals)), Math.abs(Math.max(...mcVals)), 1) : 100;
  const Ymc = (v) => padT + (1 - (v + mcAbs) / (2 * mcAbs)) * (H2 - padT - padB);
  const Ymc0 = Ymc(0);
  const barW = Math.max(1.5, (iw / data.length) - 0.5);

  const hv = hi != null ? data[hi] : null;
  const hvmc = hi != null ? mdata[hi] : null;
  const tipFlip = hi != null && Xc(hi) / W > 0.65;
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    setHi(Math.max(0, Math.min(data.length - 1, Math.round(((cx / rect.width) * W - padL) / iw * (data.length - 1)))));
  };

  const fmtCum = (v) => v == null ? '—' : (v >= 0 ? '+' : '') + (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : v.toLocaleString('en-IN'));
  const yTicks = [cumMin, (cumMin + cumMax) / 2, cumMax];

  return (
    <div className="brd-trend">
      <div className="brd-trend-head">
        <div>
          <div className="brd-trend-title">Advance-Decline Line <span className="brd-trend-sub2">cumulative net advances</span></div>
          <div className="adl-sub">McClellan Oscillator (19-EMA − 39-EMA of net advances) shown below</div>
        </div>
        <div className="brd-trend-ranges">
          {['1M', '3M', '6M', '1Y', 'All'].map((r) => <button key={r} className={`brd-rg ${range === r ? 'on' : ''}`} onClick={() => setRange(r)}>{r}</button>)}
        </div>
      </div>
      <div className="brd-trend-wrap" onMouseMove={onMove} onMouseLeave={() => setHi(null)} onTouchStart={onMove} onTouchMove={onMove}>
        <svg className="brd-trend-svg" style={{ height: H1 + 'px' }} viewBox={`0 0 ${W} ${H1}`} preserveAspectRatio="none">
          {yTicks.map((v, k) => (
            <g key={k}>
              <line x1={padL} y1={Yad(v)} x2={W - padR} y2={Yad(v)} stroke="var(--border)" strokeWidth="0.5" />
              <text x={2} y={Yad(v) + 3} fontSize="9" fill="var(--muted)" fontFamily="monospace">{fmtCum(Math.round(v))}</text>
            </g>
          ))}
          {adFill && <path d={adFill} fill={adUp ? 'var(--g-xlight)' : '#fdeaea'} opacity="0.6" />}
          {adPath && <path d={adPath.trim()} fill="none" stroke={adUp ? 'var(--g2)' : 'var(--neg)'} strokeWidth="2" />}
          {hi != null && <line x1={Xc(hi)} y1={padT} x2={Xc(hi)} y2={H1 - padB} stroke="var(--muted)" strokeWidth="0.7" strokeDasharray="3 3" />}
          {hi != null && hv?.hasData && <circle cx={Xc(hi)} cy={Yad(hv.cum)} r="3.5" fill={adUp ? 'var(--g2)' : 'var(--neg)'} />}
        </svg>
        <div className="adl-mc-label">McClellan Oscillator</div>
        <svg className="brd-trend-svg" style={{ height: H2 + 'px', marginTop: '2px' }} viewBox={`0 0 ${W} ${H2}`} preserveAspectRatio="none">
          <line x1={padL} y1={Ymc0} x2={W - padR} y2={Ymc0} stroke="var(--border)" strokeWidth="1" />
          {mdata.map((v, i) => {
            if (v == null) return null;
            const x = Xc(i), y0 = Ymc0, y1 = Ymc(v), h = Math.abs(y1 - y0);
            return h > 0.3 ? <rect key={i} x={x - barW / 2} y={Math.min(y0, y1)} width={barW} height={h} fill={v >= 0 ? 'var(--g3)' : 'var(--neg)'} opacity="0.8" /> : null;
          })}
          {hi != null && <line x1={Xc(hi)} y1={0} x2={Xc(hi)} y2={H2} stroke="var(--muted)" strokeWidth="0.7" strokeDasharray="3 3" />}
        </svg>
        {hi != null && (
          <div className="brd-tip" style={{ left: `${(Xc(hi) / W) * 100}%`, transform: `translateX(${tipFlip ? 'calc(-100% - 12px)' : '12px'})`, top: '6px' }}>
            <div className="brd-tip-date">{hv?.date}</div>
            <div className="brd-tip-row"><span>Net Adv/Dec</span><b style={{ color: hv?.net >= 0 ? 'var(--g2)' : 'var(--neg)' }}>{hv?.hasData ? (hv.net >= 0 ? '+' : '') + hv.net.toLocaleString('en-IN') : '—'}</b></div>
            <div className="brd-tip-row"><span>A-D Line</span><b>{hv?.hasData ? fmtCum(hv.cum) : '—'}</b></div>
            {hvmc != null && <div className="brd-tip-row"><span>McClellan</span><b style={{ color: hvmc >= 0 ? 'var(--g2)' : 'var(--neg)' }}>{hvmc >= 0 ? '+' : ''}{hvmc}</b></div>}
          </div>
        )}
      </div>
    </div>
  );
}

const SECTOR_COLORS = {
  'Bank': '#1565c0', 'PSU Bank': '#0277bd', 'Financial Services': '#283593',
  'IT': '#00695c', 'Auto': '#558b2f', 'FMCG': '#2e7d32',
  'Pharma': '#6a1b9a', 'Healthcare': '#7b1fa2',
  'Metal': '#4e342e', 'Energy': '#e65100', 'Oil & Gas': '#bf360c',
  'Realty': '#37474f', 'Infrastructure': '#546e7a',
  'Media': '#ad1457', 'Consumer Durables': '#00838f',
};
const sColor = (s) => SECTOR_COLORS[s] || 'var(--g2)';

function sectorReading(d) {
  const rp = d?.regime_pct;
  if (rp == null) return null;
  const gc = d.golden_cross ?? 0, dc = d.death_cross ?? 0;
  const bs = d.bull_stacked ?? 0, br = d.bear_stacked ?? 0;
  if (rp >= 70) return bs > 0 ? 'Broad rally — strong multi-timeframe alignment' : 'Strong breadth, wide participation';
  if (rp >= 60) return gc > dc ? 'Strong — fresh momentum building' : 'Above-average breadth, bulls in control';
  if (rp >= 50) return 'Slight bullish edge — more stocks in long-term uptrend';
  if (rp >= 40) return 'Mixed — no clear directional edge';
  if (rp >= 30) return dc > gc ? 'Weakening — trend structure deteriorating' : 'Below midpoint, bears have slight edge';
  if (rp >= 20) return 'Weak — majority below long-term trend';
  return br > 0 ? 'Wide selling — downtrend dominant across timeframes' : 'Very weak — defensive conditions';
}

function SectorGrid({ snap, sectors }) {
  if (!snap || !sectors) return null;
  return (
    <div className="sec-grid">
      {sectors.map((s) => {
        const d = snap[s];
        if (!d) return null;
        const rp = d.regime_pct;
        const color = sColor(s);
        const cls = rp == null ? '' : rp >= 60 ? 'sec-up' : rp >= 40 ? 'sec-mix' : rp >= 20 ? 'sec-warn' : 'sec-dn';
        const reading = sectorReading(d);
        return (
          <div className={`sec-card ${cls}`} key={s} style={{ '--sc': color }}>
            <div className="sec-name">{s}</div>
            <div className="sec-pct">{rp != null ? Math.round(rp) + '%' : '—'}</div>
            <div className="sec-label" title="Percentage of this sector's stocks currently trading above their 200-day moving average — measures how many are in a long-term uptrend">
              {d.a200 != null && d.t200 != null ? `${d.a200} / ${d.t200} above 200-day MA` : 'above 200-day MA'}
            </div>
            <div className="sec-bar" title={`Breadth bar: empty = 0% (all stocks below 200-day MA), full = 100% (all above). Current: ${rp != null ? Math.round(rp) : '—'}%`}>
              <div className="sec-bar-fill" style={{ width: `${rp ?? 0}%` }} />
            </div>
            <div className="sec-row">
              <span className="brd-up sec-tt" title={`${d.advancing ?? 0} stocks in this sector closed higher than the previous session today`}>▲{d.advancing ?? '—'}</span>
              <span className="brd-down sec-tt" title={`${d.declining ?? 0} stocks in this sector closed lower than the previous session today`}>▼{d.declining ?? '—'}</span>
              <span className="sec-uni sec-tt" title={`${d.universe ?? 0} total stocks tracked in the Nifty ${s} index universe`}>∑{d.universe ?? '—'}</span>
            </div>
            {reading && <div className="sec-reading">{reading}</div>}
            {(d.bull_stacked > 0 || d.bear_stacked > 0 || d.golden_cross > 0 || d.death_cross > 0) && (
              <div className="sec-sigs">
                {d.golden_cross > 0 && <span className="sec-sig-gc sec-tt" title={`Golden Cross ×${d.golden_cross}: the 50-day MA recently crossed above the 200-day MA — a traditionally bullish trend signal`}>GC {d.golden_cross}</span>}
                {d.death_cross > 0 && <span className="sec-sig-dc sec-tt" title={`Death Cross ×${d.death_cross}: the 50-day MA recently crossed below the 200-day MA — a bearish trend signal indicating weakening momentum`}>DC {d.death_cross}</span>}
                {d.bull_stacked > 0 && <span className="sec-sig-bs sec-tt" title={`Bull Stacked ×${d.bull_stacked}: Price > 20-day MA > 50-day MA > 100-day MA > 150-day MA > 200-day MA — all moving averages in perfect bullish sequence, strong multi-timeframe uptrend`}>B↑ {d.bull_stacked}</span>}
                {d.bear_stacked > 0 && <span className="sec-sig-bs sec-sig-bear sec-tt" title={`Bear Stacked ×${d.bear_stacked}: Price < 20-day MA < 50-day MA < 100-day MA < 150-day MA < 200-day MA — all moving averages in bearish sequence, multi-timeframe downtrend`}>B↓ {d.bear_stacked}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SectorRotation({ sectorData, date }) {
  if (!sectorData?.snaps?.length || !sectorData?.sectors) return null;
  const { snaps, sectors } = sectorData;
  const curIdx = date ? snaps.findIndex((s) => s.date === date) : -1;
  const i = curIdx < 0 ? snaps.length - 1 : curIdx;
  const cur = snaps[i];
  if (!cur) return null;

  const SPARK_WIN = 20, WEEK = 5;
  const rows = sectors.map((sec) => {
    const rp = cur[sec]?.regime_pct ?? null;
    const prev5 = i >= WEEK ? snaps[i - WEEK] : null;
    const delta = rp != null && prev5?.[sec]?.regime_pct != null ? +(rp - prev5[sec].regime_pct).toFixed(1) : null;
    const spark = snaps.slice(Math.max(0, i - SPARK_WIN + 1), i + 1).map((s) => s[sec]?.regime_pct ?? null);
    return { sec, rp, delta, spark };
  }).sort((a, b) => (b.rp ?? -1) - (a.rp ?? -1));

  return (
    <div className="sec-rot-list">
      {rows.map(({ sec, rp, delta, spark }) => {
        const color = sColor(sec);
        const cls = rp == null ? '' : rp >= 60 ? 'sec-up' : rp >= 40 ? 'sec-mix' : rp >= 20 ? 'sec-warn' : 'sec-dn';
        return (
          <div className={`sec-rot-row ${cls}`} key={sec}>
            <span className="sec-rot-dot" style={{ background: color }} />
            <span className="sec-rot-name">{sec}</span>
            <div className="sec-rot-bar-track">
              <div className="sec-rot-bar-fill" style={{ width: `${rp ?? 0}%`, background: rp >= 60 ? color : rp >= 20 ? 'var(--warn)' : 'var(--neg)' }} />
            </div>
            <span className="sec-rot-pct">{rp != null ? Math.round(rp) + '%' : '—'}</span>
            <span className={`sec-rot-delta ${delta == null ? '' : delta >= 0 ? 'brd-up' : 'brd-down'}`}>
              {delta == null ? '—' : (delta >= 0 ? '▲' : '▼') + Math.abs(delta) + 'pt'}
            </span>
            <RotSpark series={spark} color={color} />
          </div>
        );
      })}
    </div>
  );
}

function RotSpark({ series, color }) {
  const pts = (series || []).filter((v) => v != null);
  if (pts.length < 2) return <div className="rot-spark-empty" />;
  const W = 80, H = 26;
  const min = Math.min(...pts), max = Math.max(...pts);
  const X = (idx) => (idx / (pts.length - 1)) * W;
  const Y = (v) => H - 2 - ((v - min) / (max - min || 1)) * (H - 4);
  const d = pts.map((v, idx) => `${idx ? 'L' : 'M'}${X(idx).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="rot-spark" preserveAspectRatio="none">
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" opacity="0.85" />
    </svg>
  );
}

function ProGate() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleUpgrade() {
    setLoading(true);
    setError('');
    try {
      const res  = await fetch('/api/checkout', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create order');

      const rzp = new window.Razorpay({
        key:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id:    data.orderId,
        amount:      data.amount,
        currency:    data.currency,
        name:        'Abundance Financial Services',
        description: 'Pro Plan — 1 year',
        image:       '/logo-192.png',
        prefill: { name: session?.user?.name || '', email: session?.user?.email || '' },
        theme: { color: '#1a7a4a' },
        handler() { window.location.reload(); },
        modal: { ondismiss() { setLoading(false); } },
      });
      rzp.open();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="brd-gate">
      <div className="brd-gate-lock">⭐</div>
      <h2 className="brd-gate-title">Market Breadth is a Pro feature</h2>
      <p className="brd-gate-desc">
        Track DMA participation across 1,100+ BSE stocks, advance-decline trends,
        sector rotation, the McClellan Oscillator, and 15-sector breadth —
        updated every trading day after market close.
      </p>
      <div className="brd-gate-pricing">
        <span className="brd-gate-amount">₹499</span>
        <span className="brd-gate-period">/yr + 18% GST</span>
        <span className="brd-gate-total">· Total ₹588.82</span>
      </div>
      <div className="brd-gate-actions">
        <button className="brd-gate-btn brd-gate-btn-pro" onClick={handleUpgrade} disabled={loading}>
          {loading ? 'Opening checkout…' : 'Upgrade to Pro →'}
        </button>
        <a className="brd-gate-faq" href="/pricing">See all Pro features</a>
      </div>
      {error && <p className="brd-gate-error">{error}</p>}
    </div>
  );
}

function BreadthGate() {
  return (
    <div className="brd-gate">
      <div className="brd-gate-lock">🔒</div>
      <h2 className="brd-gate-title">Sign in to access Market Breadth</h2>
      <p className="brd-gate-desc">
        Track DMA participation across 1,100+ BSE stocks, advance-decline trends, sector
        rotation, the McClellan Oscillator, and 15-sector breadth — updated every trading
        day after BSE bhavcopy publication.
      </p>
      <div className="brd-gate-actions">
        <button className="brd-gate-btn" onClick={() => signIn()}>Sign in to continue →</button>
        <a className="brd-gate-faq" href="#faq">What do these indicators mean?</a>
      </div>
    </div>
  );
}

function StockScreenerSection({ raw, err }) {
  const [active, setActive]   = useState(() => new Set());
  const [sortKey, setSortKey] = useState('above_count');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage]       = useState(0);
  const [search, setSearch]   = useState('');

  const toggleFilter = (key) => {
    setActive((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
    setPage(0);
  };
  const doSort = (key) => {
    setSortKey((prev) => { if (prev === key) { setSortAsc((a) => !a); return prev; } setSortAsc(false); return key; });
    setPage(0);
  };

  const filtered = useMemo(() => {
    if (!raw?.stocks) return [];
    let list = raw.stocks;
    if (search.trim()) { const q = search.trim().toLowerCase(); list = list.filter((s) => s.symbol?.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q)); }
    if (active.size > 0) list = list.filter((s) => [...active].every((k) => s[k] === true));
    const mult = sortAsc ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sortKey === 'name')         return mult * (a.name || '').localeCompare(b.name || '');
      if (sortKey === 'close')        return mult * ((a.close ?? 0) - (b.close ?? 0));
      if (sortKey === 'pct_from_52h') return mult * ((a.pct_from_52h ?? -999) - (b.pct_from_52h ?? -999));
      if (sortKey === 'pct_from_52l') return mult * ((a.pct_from_52l ?? 0) - (b.pct_from_52l ?? 0));
      if (sortKey === 'above_count')  return mult * (ssAboveCount(a) - ssAboveCount(b));
      return 0;
    });
  }, [raw, active, sortKey, sortAsc, search]);

  const pages    = Math.ceil(filtered.length / SS_PAGE_SIZE);
  const pageRows = filtered.slice(page * SS_PAGE_SIZE, (page + 1) * SS_PAGE_SIZE);

  return (
    <>
      <div className="page-eyebrow" style={{ marginBottom: 6 }}><span className="page-eyebrow-text">Nightly · per-stock signals · BSE liquid universe top-1100</span></div>
      {err && <div className="brd-err">{err}</div>}

      <div className="ssc-toolbar">
        <input className="ssc-search" type="text" placeholder="Search symbol or name…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        <div className="ssc-chips">
          {SS_FILTERS.map(({ key, label, pos }) => (
            <button key={key} className={`ssc-chip ${active.has(key) ? 'on' : ''} ${pos ? 'pos' : 'neg'}`} onClick={() => toggleFilter(key)}>{label}</button>
          ))}
          {active.size > 0 && <button className="ssc-chip clear" onClick={() => { setActive(new Set()); setPage(0); }}>Clear ×</button>}
        </div>
      </div>

      {raw && <div className="ssc-meta">{filtered.length} of {raw.stocks.length} stocks{raw.asof ? ` · as of ${raw.asof}` : ''}</div>}
      {!raw && !err && <div className="ssc-loading">Loading signals…</div>}

      {pageRows.length > 0 && (
        <div className="ssc-wrap">
          <table className="ssc-table">
            <thead>
              <tr>
                <th className="ssc-th-num">#</th>
                <th className="ssc-th-sym" onClick={() => doSort('name')} style={{ cursor: 'pointer' }}>Symbol / Name {sortKey === 'name' ? (sortAsc ? '↑' : '↓') : ''}</th>
                <th onClick={() => doSort('close')} style={{ cursor: 'pointer', textAlign: 'right' }}>Close {sortKey === 'close' ? (sortAsc ? '↑' : '↓') : ''}</th>
                <th onClick={() => doSort('above_count')} style={{ cursor: 'pointer', textAlign: 'center' }}>DMAs {sortKey === 'above_count' ? (sortAsc ? '↑' : '↓') : ''}</th>
                <th style={{ textAlign: 'center' }}>Signals</th>
                <th onClick={() => doSort('pct_from_52h')} style={{ cursor: 'pointer', textAlign: 'right' }}>vs 52W H {sortKey === 'pct_from_52h' ? (sortAsc ? '↑' : '↓') : ''}</th>
                <th onClick={() => doSort('pct_from_52l')} style={{ cursor: 'pointer', textAlign: 'right' }}>vs 52W L {sortKey === 'pct_from_52l' ? (sortAsc ? '↑' : '↓') : ''}</th>
                <th style={{ textAlign: 'center' }}>A/D</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((s, i) => {
                const adCls = s.adv_dec === 1 ? 'brd-up' : s.adv_dec === -1 ? 'brd-down' : '';
                const adLbl = s.adv_dec === 1 ? '▲' : s.adv_dec === -1 ? '▼' : '—';
                return (
                  <tr key={s.isin} className="ssc-tr">
                    <td className="ssc-num">{page * SS_PAGE_SIZE + i + 1}</td>
                    <td className="ssc-sym">
                      <span className="ssc-sym-code">{s.symbol}</span>
                      <span className="ssc-sym-name">{s.name}</span>
                    </td>
                    <td className="ssc-close" style={{ textAlign: 'right' }}>{fmtClose(s.close)}</td>
                    <td style={{ textAlign: 'center' }}><SsDmaDots s={s} /></td>
                    <td style={{ textAlign: 'center' }}><SsSignalBadges s={s} /></td>
                    <td style={{ textAlign: 'right' }} className={s.pct_from_52h != null ? (s.pct_from_52h >= -5 ? 'brd-up' : s.pct_from_52h < -20 ? 'brd-down' : '') : ''}>{s.pct_from_52h != null ? s.pct_from_52h.toFixed(1) + '%' : '—'}</td>
                    <td style={{ textAlign: 'right' }} className={s.pct_from_52l != null && s.pct_from_52l > 50 ? 'brd-up' : ''}>{s.pct_from_52l != null ? '+' + s.pct_from_52l.toFixed(1) + '%' : '—'}</td>
                    <td style={{ textAlign: 'center' }} className={adCls}>{adLbl}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="ssc-pages">
          <button className="ssc-pg" disabled={page === 0} onClick={() => setPage(0)}>«</button>
          <button className="ssc-pg" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
          <span className="ssc-pg-info">{page + 1} / {pages}</span>
          <button className="ssc-pg" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>›</button>
          <button className="ssc-pg" disabled={page >= pages - 1} onClick={() => setPage(pages - 1)}>»</button>
        </div>
      )}

      <div className="ssc-disc">
        <b>Disclaimer.</b> Stock signals are precomputed from unadjusted BSE EOD prices. DMA crossings use simple moving averages. 52-week H/L use intraday highs/lows. Golden/death cross = 50×200 SMA cross within the last 25 sessions. Technical analysis data for educational reference only — not a recommendation to buy or sell any security.
      </div>
    </>
  );
}

const GLOSSARY_ITEMS = [
  { sym: '42%', desc: 'Breadth — what fraction of the sector\'s stocks are trading above their 200-day moving average. Higher = broader participation in the long-term uptrend. Below 40% signals weak conditions; above 60% signals broad strength.' },
  { sym: '▲ / ▼', desc: 'Advancing and declining stock counts — the number of individual stocks in this sector that closed higher (▲) or lower (▼) than the previous session today. This is not the sector index direction.' },
  { sym: '∑', desc: 'Universe size — total number of stocks tracked in this sector, sourced from the NSE sectoral index constituent list. All breadth percentages are calculated against this count.' },
  { sym: 'GC', desc: 'Golden Cross — stocks where the 50-day moving average recently crossed above the 200-day moving average (within last 25 sessions). Historically associated with a transition from a bearish to a bullish long-term trend.' },
  { sym: 'DC', desc: 'Death Cross — stocks where the 50-day MA recently crossed below the 200-day MA. The mirror of the golden cross; signals deteriorating trend structure.' },
  { sym: 'B↑', desc: 'Bull Stacked — stocks where: Price > 20-day MA > 50-day MA > 100-day MA > 150-day MA > 200-day MA, all in descending order. This "perfect alignment" means the stock is in an uptrend across every time horizon simultaneously — short, medium, and long term.' },
  { sym: 'B↓', desc: 'Bear Stacked — the mirror image: Price < 20-day MA < 50-day MA < … < 200-day MA. All moving averages in bearish sequence across every timeframe.' },
  { sym: 'Bar', desc: 'Progress bar — a visual 0–100% scale showing breadth. An empty bar means all stocks are below their 200-day MA; a full bar means all are above. Colour matches the regime: green (≥60%), amber (40–60%), red (<40%).' },
];

function SectorGlossary() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <span className="sec-gloss-wrap" ref={ref}>
      <button className={`sec-gloss-btn ${open ? 'on' : ''}`} onClick={() => setOpen((v) => !v)} aria-label="Explain tile symbols">
        {open ? '✕ close' : 'ⓘ how to read'}
      </button>
      {open && (
        <div className="sec-gloss-panel" role="dialog" aria-label="Sector tile glossary">
          <div className="sec-gloss-head">Reading the sector tiles</div>
          <div className="sec-gloss-list">
            {GLOSSARY_ITEMS.map(({ sym, desc }) => (
              <div className="sec-gloss-row" key={sym}>
                <span className="sec-gloss-sym">{sym}</span>
                <span className="sec-gloss-desc">{desc}</span>
              </div>
            ))}
          </div>
          <div className="sec-gloss-note">All signals are computed on unadjusted end-of-day prices from the BSE bhavcopy. Moving averages are simple (arithmetic) averages. GC/DC detection window is 25 trading sessions.</div>
        </div>
      )}
    </span>
  );
}

const FAQ_SECTIONS = [
  {
    heading: 'Market breadth basics',
    items: [
      { q: 'What is market breadth, and why does it matter?', a: `Market breadth measures how many individual stocks are participating in a move, not just whether the index is up or down. An index like Nifty 50 tracks a small basket of large-cap stocks weighted by market cap, so a handful of heavyweights can lift the index even while most stocks are falling.\n\nBreadth tells you whether a rally is broad (most stocks moving together) or narrow (just a few leaders). Broad rallies tend to be durable; narrow ones are more fragile. A market where 80% of stocks are above their 200-day MA is in a fundamentally different condition than one where only 30% are — even if the headline index is at the same level.` },
      { q: 'How is this different from watching Nifty or Sensex?', a: `Nifty 50 is the weighted average of 50 stocks. Reliance, HDFC Bank, Infosys, and ICICI Bank alone make up roughly 35–40% of its weight. If those four rise strongly, the index can go up even if 800 of the other 1,000 stocks on the exchange are falling.\n\nThis dashboard tracks 1,100+ liquid BSE stocks equally. When it says "42% of stocks are above their 200-day MA," that means 42% of real companies — not 42% of market cap — are in long-term uptrends. That is a more honest picture of what most investors actually hold.` },
      { q: 'What does the Risk-on / Risk-off regime label mean?', a: `The regime is derived from the percentage of stocks above their 200-day moving average:\n\n• 60% or more → Risk-on (broad uptrend; majority of stocks in long-term upswings)\n• 40–60% → Mixed / Neutral (two-sided market; no strong directional edge)\n• 20–40% → Risk-off (defensive conditions; most stocks below long-term trend)\n• Below 20% → Deep risk-off (broad downtrend; preserve capital, be selective)\n\nThe value is in the direction of change as much as the absolute level.` },
    ],
  },
  {
    heading: 'Moving average breadth',
    items: [
      { q: 'What does "% above 200-day MA" mean?', a: `The 200-day moving average (200-day MA) is the average closing price of a stock over the last 200 trading sessions — roughly 10 months. When a stock's price is above it, the stock is in a long-term uptrend; below it, a long-term downtrend.\n\n"% above 200-day MA" counts what fraction of the 1,100+ tracked stocks are currently above their own 200-day MA. The higher the percentage, the more stocks are individually in uptrends.` },
      { q: 'Why are there five DMA lines (20, 50, 100, 150, 200)?', a: `Each represents a different time horizon: 20-day (one month, short-term), 50-day (one quarter, medium), 100-day (five months, intermediate), 150-day (seven months), 200-day (ten months, long-term).\n\nWatching all five together shows whether strength is a short-term blip or is embedded across multiple timeframes. When most stocks are above all five MAs simultaneously, conditions are broadly constructive.` },
      { q: 'What is the historical percentile rank shown on each card?', a: `The percentile rank compares the current breadth reading against every prior reading in the database. A "72nd percentile" means the current reading is higher than 72% of all historical readings.\n\nThis adds context the raw percentage lacks: a reading of 45% above the 200-day MA could be average or elevated depending on history. Green = top quartile (>75th pct), amber = middle range, red = bottom quartile (<25th pct).` },
    ],
  },
  {
    heading: 'Advance-Decline Line & McClellan Oscillator',
    items: [
      { q: 'What is the Advance-Decline (A-D) Line?', a: `Each day, the number of advancing stocks minus declining stocks gives a "net advance" figure. The A-D Line is the running cumulative sum of this number.\n\nWhen the A-D Line is rising, more stocks are advancing than declining on most days — the market has broad participation. When it falls even as the index rises, it is a divergence warning: the rally is narrowing, driven by fewer and fewer stocks. This divergence often precedes corrections.` },
      { q: 'What is the McClellan Oscillator?', a: `The McClellan Oscillator is the difference between a 19-day EMA and a 39-day EMA of the daily net advances.\n\nPositive and rising → short-term breadth momentum is expanding. Negative and falling → breadth is deteriorating. Extreme readings often signal overbought or oversold conditions. It is more timely than the raw A-D Line and useful for identifying breadth thrusts or exhaustion.` },
    ],
  },
  {
    heading: 'Signal definitions',
    items: [
      { q: 'What is a Golden Cross and a Death Cross?', a: `Both relate to the 50-day and 200-day moving averages of an individual stock:\n\n• Golden Cross (GC): the 50-day MA crosses above the 200-day MA — medium-term momentum has turned bullish relative to the long-term trend.\n• Death Cross (DC): the 50-day MA crosses below the 200-day MA — the mirror image.\n\nThe counts on sector tiles (e.g. "GC 3") show how many stocks within the sector had this crossover within the last 25 trading sessions.` },
      { q: 'What is Bull Stacked and Bear Stacked?', a: `These describe a "perfect alignment" of all five moving averages for an individual stock:\n\n• Bull Stacked (B↑): Price > 20-day MA > 50-day MA > 100-day MA > 150-day MA > 200-day MA — the stock is in an uptrend across every time horizon simultaneously.\n• Bear Stacked (B↓): Price < 20-day MA < 50-day MA < … < 200-day MA — every timeframe is in a downtrend.\n\nA sector with many bull-stacked stocks is showing exceptionally clean trend alignment.` },
      { q: 'What are new 52-week highs and lows?', a: `A stock makes a new 52-week high when its intraday high today equals or exceeds the highest point over the prior 252 trading sessions. Expanding new highs alongside a rising index confirms strength. The worrying combination is: index rising, but new lows expanding — it signals the rally is narrowing and distribution is underway in the broader market.` },
    ],
  },
  {
    heading: 'Sector breadth',
    items: [
      { q: 'What does the sector breadth grid show?', a: `The sector grid applies the same 200-day MA breadth calculation to each of the 15 Nifty sectoral indices individually. This lets you see which sectors are in broad uptrends, which are struggling, and which are seeing fresh momentum signals.\n\nSectors with high breadth and rising advance-decline are typically where current market leadership sits.` },
      { q: 'What does the sector rotation panel show?', a: `The rotation panel ranks all 15 sectors from highest to lowest current 200-day MA breadth and shows the week-on-week change (▲/▼ N points) next to each, plus a 20-session sparkline.\n\nSectors near the top with rising deltas are in a leadership position. Crossings from bottom to top — rapidly improving breadth with a large positive delta — can signal early-stage sector rotation worth paying attention to.` },
    ],
  },
  {
    heading: 'About the data',
    items: [
      { q: 'Which stocks are included?', a: `The dashboard tracks the top 1,100 liquid stocks on the BSE by 60-session average daily turnover. This universe is broad enough to capture the real breadth of the market including mid- and small-cap stocks, while excluding thinly traded stocks where prices can be erratic.` },
      { q: 'How often does data update?', a: `End-of-day price data is sourced from the BSE bhavcopy — the official daily price file published by the Bombay Stock Exchange after market close, typically available between 6–7 PM IST.\n\nThe nightly pipeline runs at 6 PM IST on weekdays. It downloads the bhavcopy, computes all breadth metrics, per-stock signals, and sector breadth, and writes results to the database. If a date shows no data, either it was a market holiday or the pipeline has not yet run for that day.` },
      { q: 'Are moving averages adjusted for corporate actions?', a: `No. All moving averages and signals are computed on unadjusted end-of-day closing prices from the BSE bhavcopy. Corporate actions like stock splits or bonus issues can create discontinuities in a stock's price series, but because breadth metrics aggregate hundreds of stocks, the impact of any single stock's corporate action on aggregate readings is minimal.` },
    ],
  },
];

function BreadthFAQ() {
  return (
    <section id="faq" className="brd-faq">
      <div className="brd-faq-head">
        <div className="brd-section-h" style={{ margin: 0 }}>Frequently asked questions</div>
        <p className="brd-faq-sub">Understanding every indicator and signal on this page</p>
      </div>
      {FAQ_SECTIONS.map((sec) => (
        <div key={sec.heading} className="brd-faq-sec">
          <div className="brd-faq-sec-h">{sec.heading}</div>
          {sec.items.map((item) => (
            <details key={item.q} className="brd-faq-item">
              <summary className="brd-faq-q">{item.q}</summary>
              <div className="brd-faq-a">
                {item.a.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}
              </div>
            </details>
          ))}
        </div>
      ))}
    </section>
  );
}

const CSS = `
.brd-body{font-family:Raleway,sans-serif;color:var(--text);padding-bottom:48px}
.brd-prem{font:800 10px JetBrains Mono,monospace;background:linear-gradient(90deg,var(--g1),var(--g3));color:#fff;padding:3px 8px;border-radius:6px;vertical-align:middle;letter-spacing:.08em;margin-left:8px}
.brd-up{color:var(--g2)}.brd-down{color:var(--neg)}.brd-neutral{color:var(--muted)}.brd-warn{color:var(--warn)}

.brd-indices{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.brd-ix{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:13px 14px;box-shadow:var(--shadow)}
.brd-ix-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:6px}
.brd-ix-name{font:700 12px Raleway,sans-serif;color:var(--text2)}
.brd-ix-tag{font:700 9.5px JetBrains Mono,monospace;padding:2px 7px;border-radius:5px;text-transform:uppercase;letter-spacing:.03em}
.tg-up{background:var(--g-xlight);color:var(--g1)}.tg-down{background:#fdeaea;color:var(--neg)}.tg-warn{background:var(--warn-bg,#fff3e0);color:var(--warn)}.tg-neutral{background:var(--s3,#eef5ee);color:var(--muted)}
.brd-ix-lvl{font:800 22px JetBrains Mono,monospace;color:var(--text);line-height:1.1}
.brd-ix-sub{display:flex;justify-content:space-between;gap:8px;margin-top:5px;font:600 11px JetBrains Mono,monospace}
.brd-ix-rsi{color:var(--muted)}

.brd-err{background:var(--warn-bg,#fff3e0);border:1px solid #ffcc80;color:#8a4300;padding:11px 14px;border-radius:10px;font-size:13px;margin-bottom:16px}

.brd-regime{display:flex;align-items:center;gap:18px;background:var(--surface);border:1px solid var(--border);border-left:5px solid var(--g2);border-radius:14px;padding:18px 22px;box-shadow:var(--shadow);margin-bottom:16px}
.brd-regime.brd-up{border-left-color:var(--g2)}.brd-regime.brd-neutral{border-left-color:var(--warn)}.brd-regime.brd-warn{border-left-color:var(--warn)}.brd-regime.brd-down{border-left-color:var(--neg)}
.brd-regime-pct{font:800 46px JetBrains Mono,monospace;color:var(--g1);line-height:1}
.brd-regime.brd-down .brd-regime-pct{color:var(--neg)}.brd-regime.brd-neutral .brd-regime-pct,.brd-regime.brd-warn .brd-regime-pct{color:var(--warn)}
.brd-regime-label{font:800 18px Raleway,sans-serif;color:var(--text)}
.brd-regime-sub{font-size:13px;color:var(--muted);margin-top:3px}

.brd-ix .brd-spark{margin-top:8px;height:30px}

.brd-trend{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 18px;box-shadow:var(--shadow);margin-bottom:16px}
.brd-trend-head{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:10px}
.brd-trend-title{font:800 14px Raleway,sans-serif;color:var(--text)}
.brd-trend-sub2{font:500 12px Raleway,sans-serif;color:var(--muted);margin-left:8px}
.brd-trend-ranges{display:flex;gap:5px}
.brd-rg{padding:5px 10px;border:1px solid var(--border);background:var(--surface);border-radius:7px;font:700 11.5px JetBrains Mono,monospace;color:var(--muted);cursor:pointer}
.brd-rg.on{background:var(--g1);color:#fff;border-color:var(--g1)}
.brd-legend{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.brd-legchip{display:flex;align-items:center;gap:6px;padding:4px 9px;border:1px solid var(--border);background:var(--surface);border-radius:999px;font:600 11px JetBrains Mono,monospace;color:var(--text2);cursor:pointer}
.brd-legchip i{width:11px;height:3px;border-radius:2px;display:inline-block}
.brd-legchip b{color:var(--text);font-weight:800}
.brd-legchip.off{opacity:.4}.brd-legchip.off b{color:var(--muted)}
.brd-trend-wrap{position:relative}
.brd-trend-svg{width:100%;height:240px;display:block;touch-action:none;cursor:crosshair}
.brd-tip{position:absolute;top:6px;background:var(--surface);border:1px solid var(--border);border-radius:9px;box-shadow:var(--shadow-lg);padding:8px 10px;pointer-events:none;min-width:120px;z-index:5}
.brd-tip-date{font:700 11px JetBrains Mono,monospace;color:var(--text);border-bottom:1px solid var(--border);padding-bottom:5px;margin-bottom:5px}
.brd-tip-row{display:flex;justify-content:space-between;gap:14px;font:600 11px JetBrains Mono,monospace;color:var(--muted);padding:2px 0}
.brd-tip-row span{display:flex;align-items:center;gap:5px}
.brd-tip-row i{width:10px;height:3px;border-radius:2px;display:inline-block}
.brd-tip-row b{color:var(--text)}

.brd-controls{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;align-items:center;margin-bottom:14px}
.brd-modes{display:flex;gap:6px}
.brd-mode{padding:8px 13px;border:1px solid var(--border);background:var(--surface);border-radius:9px;font:700 12.5px Raleway,sans-serif;color:var(--text2);cursor:pointer}
.brd-mode.on{background:var(--g1);color:#fff;border-color:var(--g1)}
.brd-datesel{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--muted)}
.brd-datesel select{padding:7px 10px;border:1px solid var(--border);border-radius:8px;font:700 12.5px JetBrains Mono,monospace;background:var(--surface);color:var(--text)}

.brd-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
.brd-card{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:var(--shadow)}
.brd-card-h{font:700 11px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.03em}
.brd-card-big{font:800 30px JetBrains Mono,monospace;color:var(--text);line-height:1.15;margin:4px 0 2px}
.brd-card-meta{font-size:12px;color:var(--text2);margin-bottom:8px}
.brd-spark{width:100%;height:34px;display:block}
.brd-spark-empty{height:34px}
.brd-card-delta{font:700 11px JetBrains Mono,monospace;margin-top:7px}

.brd-section-h{font:700 12px JetBrains Mono,monospace;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin:6px 0 10px}
.brd-internals{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
.brd-int{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px;box-shadow:var(--shadow);display:flex;flex-direction:column;gap:5px}
.brd-int-l{font:600 11px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase}
.brd-int b{font:800 26px JetBrains Mono,monospace}

.brd-signals{display:flex;flex-direction:column;gap:8px;margin-bottom:20px}
.brd-signal{display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:11px 14px;font-size:13.5px;color:var(--text2)}
.brd-sig-dot{width:9px;height:9px;border-radius:50%;flex:none}
.brd-signal.up .brd-sig-dot{background:var(--g3)}.brd-signal.down .brd-sig-dot{background:var(--neg)}.brd-signal.neutral .brd-sig-dot{background:var(--warn)}

.brd-disc{margin-top:8px;background:var(--s2);border:1px solid var(--border);border-radius:11px;padding:15px 17px;font-size:11.5px;line-height:1.65;color:var(--muted)}
.brd-disc b{color:var(--text2)}

@media(max-width:900px){.brd-indices{grid-template-columns:repeat(2,1fr)}.brd-grid{grid-template-columns:repeat(2,1fr)}.brd-internals{grid-template-columns:repeat(2,1fr)}}
@media(max-width:560px){.brd-regime{flex-direction:row;gap:14px}.brd-regime-pct{font-size:38px}.brd-controls{justify-content:flex-start}.brd-datesel{width:100%}}

.sec-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
.sec-card{background:var(--surface);border:1px solid var(--border);border-top:3px solid var(--sc,var(--g2));border-radius:12px;padding:14px;box-shadow:var(--shadow)}
.sec-name{font:700 11px JetBrains Mono,monospace;color:var(--text2);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
.sec-pct{font:800 26px JetBrains Mono,monospace;color:var(--sc,var(--g2));line-height:1.1}
.sec-card.sec-dn .sec-pct{color:var(--neg)}.sec-card.sec-warn .sec-pct{color:var(--warn)}
.sec-label{font-size:10.5px;color:var(--muted);margin-bottom:7px}
.sec-bar{height:4px;background:var(--s3,#eef5ee);border-radius:2px;overflow:hidden;margin-bottom:8px}
.sec-bar-fill{height:100%;background:var(--sc,var(--g2));border-radius:2px;transition:width .3s}
.sec-card.sec-dn .sec-bar-fill{background:var(--neg)}.sec-card.sec-warn .sec-bar-fill{background:var(--warn)}
.sec-row{display:flex;gap:9px;font:700 11px JetBrains Mono,monospace;align-items:center}
.sec-uni{color:var(--muted);margin-left:auto}
.sec-sigs{display:flex;gap:4px;flex-wrap:wrap;margin-top:7px}
.sec-sig-gc,.sec-sig-dc,.sec-sig-bs{font:700 9px JetBrains Mono,monospace;padding:2px 5px;border-radius:4px}
.sec-sig-gc{background:var(--g-xlight);color:var(--g1)}.sec-sig-dc{background:#fdeaea;color:var(--neg)}.sec-sig-bs{background:var(--g-xlight);color:var(--g1)}.sec-sig-bear{background:#fdeaea;color:var(--neg)}
@media(max-width:900px){.sec-grid{grid-template-columns:repeat(3,1fr)}}
@media(max-width:560px){.sec-grid{grid-template-columns:repeat(2,1fr)}}

/* Tier 1 — tooltip cursor */
.sec-tt{cursor:help}

/* Tier 2 — interpretive phrase */
.sec-reading{font:500 10.5px Raleway,sans-serif;color:var(--muted);margin-top:6px;line-height:1.45;font-style:italic;border-top:1px solid var(--border);padding-top:5px}
.sec-card.sec-up .sec-reading{color:var(--g2)}.sec-card.sec-dn .sec-reading{color:var(--neg)}.sec-card.sec-warn .sec-reading{color:var(--warn)}

/* Tier 3 — section header + glossary */
.sec-section-h{display:flex;align-items:center;gap:8px;flex-wrap:nowrap}
.sec-gloss-wrap{position:relative;display:inline-flex;align-items:center}
.sec-gloss-btn{background:none;border:1px solid var(--border);border-radius:6px;font:600 10px JetBrains Mono,monospace;color:var(--muted);cursor:pointer;padding:3px 9px;white-space:nowrap;transition:background .15s,color .15s,border-color .15s}
.sec-gloss-btn:hover{background:var(--s2);color:var(--text)}
.sec-gloss-btn.on{background:var(--g1);color:#fff;border-color:var(--g1)}
.sec-gloss-panel{position:absolute;top:calc(100% + 8px);left:0;width:540px;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-lg,0 8px 32px rgba(0,0,0,.13));padding:18px 20px;z-index:30}
.sec-gloss-head{font:800 13px Raleway,sans-serif;color:var(--text);margin-bottom:13px;padding-bottom:10px;border-bottom:1px solid var(--border)}
.sec-gloss-list{display:flex;flex-direction:column;gap:10px}
.sec-gloss-row{display:grid;grid-template-columns:48px 1fr;gap:12px;align-items:start}
.sec-gloss-sym{font:800 11px JetBrains Mono,monospace;background:var(--s2,#f6f6f6);color:var(--text);border:1px solid var(--border);border-radius:5px;padding:3px 5px;text-align:center;white-space:nowrap;line-height:1.4}
.sec-gloss-desc{font-size:12px;color:var(--text2);line-height:1.6}
.sec-gloss-note{font:500 11px Raleway,sans-serif;color:var(--muted);margin-top:13px;padding-top:11px;border-top:1px solid var(--border);line-height:1.55}
@media(max-width:700px){.sec-gloss-panel{width:calc(100vw - 32px);left:-4px}}

.brd-faq{margin:32px 0 8px;border-top:1px solid var(--border);padding-top:28px}
.brd-faq-head{margin-bottom:20px}
.brd-faq-sub{font-size:13px;color:var(--muted);margin:5px 0 0;line-height:1.5}
.brd-faq-sec{margin-bottom:22px}
.brd-faq-sec-h{font:700 10.5px JetBrains Mono,monospace;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;padding-left:2px}
.brd-faq-item{background:var(--surface);border:1px solid var(--border);border-radius:11px;overflow:hidden;margin-bottom:5px;transition:border-color .15s}
.brd-faq-item[open]{border-color:var(--g-light,#a5d6a7)}
.brd-faq-item[open] .brd-faq-q{border-bottom:1px solid var(--border)}
.brd-faq-q{list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 16px;font:600 13.5px Raleway,sans-serif;color:var(--text);cursor:pointer;user-select:none}
.brd-faq-q::-webkit-details-marker{display:none}
.brd-faq-q::after{content:'＋';font:700 15px JetBrains Mono,monospace;color:var(--g2);flex:none}
.brd-faq-item[open] .brd-faq-q::after{content:'－'}
.brd-faq-a{padding:14px 18px 16px;font-size:13px;line-height:1.75;color:var(--text2)}
.brd-faq-a p{margin:0 0 10px}
.brd-faq-a p:last-child{margin:0}

.brd-gate{text-align:center;padding:64px 32px;background:var(--surface);border:1px solid var(--border);border-radius:16px;box-shadow:var(--shadow);margin:8px 0 32px}
.brd-gate-lock{font-size:2.4rem;margin-bottom:16px;line-height:1}
.brd-gate-title{font:800 21px Raleway,sans-serif;color:var(--text);margin:0 0 10px}
.brd-gate-desc{font-size:14px;color:var(--text2);max-width:500px;margin:0 auto 28px;line-height:1.7}
.brd-gate-actions{display:flex;align-items:center;justify-content:center;gap:22px;flex-wrap:wrap}
.brd-gate-btn{padding:12px 26px;background:var(--g1);color:#fff;border:none;border-radius:10px;font:700 13.5px Raleway,sans-serif;cursor:pointer;transition:background .15s}
.brd-gate-btn:hover{background:var(--g2)}
.brd-gate-faq{font:600 13px Raleway,sans-serif;color:var(--g2);text-decoration:none;border-bottom:1px solid var(--g-light,#a5d6a7)}
.brd-gate-faq:hover{color:var(--g1)}

.adl-sub{font:500 11px Raleway,sans-serif;color:var(--muted);margin-top:2px}
.adl-mc-label{font:700 10px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin:8px 0 3px}

.brd-card-pctile{font:700 10px JetBrains Mono,monospace;margin-top:4px;opacity:.85}

.sec-rot-list{display:flex;flex-direction:column;gap:5px;margin-bottom:20px}
.sec-rot-row{background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:9px 13px;display:grid;grid-template-columns:10px 155px 1fr 50px 52px 80px;gap:10px;align-items:center;box-shadow:var(--shadow)}
.sec-rot-dot{width:10px;height:10px;border-radius:50%;display:block}
.sec-rot-name{font:600 11.5px JetBrains Mono,monospace;color:var(--text2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sec-rot-bar-track{height:5px;background:var(--s3,#eef5ee);border-radius:3px;overflow:hidden}
.sec-rot-bar-fill{height:100%;border-radius:3px;transition:width .4s}
.sec-rot-pct{font:800 13px JetBrains Mono,monospace;color:var(--text);text-align:right}
.sec-rot-delta{font:700 11px JetBrains Mono,monospace;text-align:right}
.rot-spark{width:80px;height:26px;display:block}
.rot-spark-empty{width:80px;height:26px;display:block}
.sec-rot-row.sec-dn .sec-rot-pct{color:var(--neg)}
.sec-rot-row.sec-warn .sec-rot-pct{color:var(--warn)}
.sec-rot-row.sec-up .sec-rot-pct{color:var(--g2)}
@media(max-width:900px){.sec-rot-row{grid-template-columns:10px 1fr 40px 50px}.sec-rot-bar-track,.rot-spark,.rot-spark-empty{display:none}}
@media(max-width:560px){.sec-rot-row{grid-template-columns:10px 1fr 40px}.sec-rot-delta{display:none}}

/* page tabs */
.brd-tabs{display:flex;gap:6px;margin-bottom:20px}
.brd-tab{padding:9px 18px;border:1.5px solid var(--border);background:var(--surface);border-radius:10px;font:700 13px Raleway,sans-serif;color:var(--text2);cursor:pointer;transition:all .14s}
.brd-tab:hover{border-color:var(--g3)}
.brd-tab.on{background:var(--g1);color:#fff;border-color:var(--g1)}

/* stock screener panel */
.ssc-loading{text-align:center;color:var(--muted);padding:48px 0;font-size:14px}
.ssc-toolbar{display:flex;flex-direction:column;gap:12px;margin-bottom:14px}
.ssc-search{padding:9px 13px;border:1.5px solid var(--border);border-radius:10px;font:600 13.5px Raleway,sans-serif;color:var(--text);background:var(--surface);width:100%;max-width:340px;outline:none}
.ssc-search:focus{border-color:var(--g2)}
.ssc-chips{display:flex;flex-wrap:wrap;gap:6px}
.ssc-chip{padding:6px 12px;border:1.5px solid var(--border);background:var(--surface);border-radius:999px;font:700 11.5px JetBrains Mono,monospace;color:var(--muted);cursor:pointer;transition:all .14s}
.ssc-chip.pos.on{background:var(--g1);color:#fff;border-color:var(--g1)}
.ssc-chip.neg.on{background:var(--neg);color:#fff;border-color:var(--neg)}
.ssc-chip.clear{background:var(--s3,#eef5ee);border-color:var(--border);color:var(--text2)}
.ssc-chip:hover:not(.on){background:var(--s2)}
.ssc-meta{font:600 12px JetBrains Mono,monospace;color:var(--muted);margin-bottom:12px}
.ssc-wrap{overflow-x:auto;border-radius:12px;border:1px solid var(--border);box-shadow:var(--shadow)}
.ssc-table{width:100%;border-collapse:collapse;font-size:13px;background:var(--surface)}
.ssc-table th{padding:9px 11px;font:700 10.5px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;border-bottom:1.5px solid var(--border);background:var(--s2);white-space:nowrap;user-select:none}
.ssc-table th:hover{color:var(--text)}
.ssc-tr{border-bottom:1px solid var(--border);transition:background .1s}
.ssc-tr:hover{background:var(--s2)}
.ssc-table td{padding:8px 11px;vertical-align:middle}
.ssc-th-num,.ssc-num{width:38px;text-align:right;color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:11px}
.ssc-th-sym{width:200px}
.ssc-sym{display:flex;flex-direction:column;gap:2px}
.ssc-sym-code{font:800 12.5px JetBrains Mono,monospace;color:var(--text);letter-spacing:.02em}
.ssc-sym-name{font:500 11px Raleway,sans-serif;color:var(--muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px}
.ssc-close{font:700 13px JetBrains Mono,monospace;color:var(--text)}
.ssc-dots{display:inline-flex;gap:3px;align-items:center}
.ssc-dot{width:9px;height:9px;border-radius:50%;flex:none}
.ssc-dot.on{background:var(--g2)}.ssc-dot.off{background:#e57373;opacity:.6}.ssc-dot.na{background:var(--border)}
.ssc-badges{display:inline-flex;flex-wrap:wrap;gap:3px}
.ssc-badge{font:700 8.5px JetBrains Mono,monospace;padding:2px 5px;border-radius:4px;white-space:nowrap}
.bs-gc,.bs-bull,.bs-hi{background:var(--g-xlight);color:var(--g1)}
.bs-dc,.bs-bear,.bs-lo{background:#fdeaea;color:var(--neg)}
.ssc-pages{display:flex;align-items:center;gap:6px;justify-content:center;margin-top:16px}
.ssc-pg{padding:7px 12px;border:1.5px solid var(--border);background:var(--surface);border-radius:8px;font:700 12px JetBrains Mono,monospace;color:var(--text2);cursor:pointer;transition:all .12s}
.ssc-pg:hover:not(:disabled){background:var(--s2)}.ssc-pg:disabled{opacity:.35;cursor:default}
.ssc-pg-info{font:600 12px JetBrains Mono,monospace;color:var(--muted);padding:0 6px}
.ssc-disc{margin-top:24px;background:var(--s2);border:1px solid var(--border);border-radius:11px;padding:15px 17px;font-size:11.5px;line-height:1.65;color:var(--muted)}
.ssc-disc b{color:var(--text2)}
@media(max-width:700px){
  .ssc-table th:nth-child(6),.ssc-table td:nth-child(6),
  .ssc-table th:nth-child(7),.ssc-table td:nth-child(7){display:none}
  .ssc-sym-name{max-width:120px}
}
`;
