'use client';

import { useState, useEffect, useMemo } from 'react';
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

export default function BreadthPage() {
  const [data, setData] = useState(null);
  const [idx, setIdx] = useState(null);
  const [err, setErr] = useState('');
  const [date, setDate] = useState(null);
  const [mode, setMode] = useState('day'); // day | week | month
  const [sectorData, setSectorData] = useState(null);

  useEffect(() => {
    fetch('/api/breadth').then((r) => r.json()).then((d) => {
      if (d.error) { setErr(d.error); return; }
      setData(d); setDate(d.asof);
    }).catch(() => setErr('Could not load breadth data.'));
    fetch('/api/breadth-indices').then((r) => r.json()).then(setIdx).catch(() => {});
  }, []);

  useEffect(() => {
    if (!date) return;
    fetch(`/api/sector-breadth?date=${date}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error && d.snaps?.length) setSectorData(d); })
      .catch(() => {});
  }, [date]);

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

        {/* index strip */}
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

        {sectorData?.snaps?.length > 0 && (
          <>
            <div className="brd-section-h">Sector breadth · {date}</div>
            <SectorGrid snap={sectorData.snaps[sectorData.snaps.length - 1]} sectors={sectorData.sectors} />
          </>
        )}

        <div className="brd-disc">
          <b>Disclaimer.</b> Educational market-breadth analytics by <b>Atin Kumar Agrawal | Abundance Financial Services</b> · AMFI Registered Mutual Funds &amp; SIF Distributor (ARN-251838). Breadth is computed on end-of-day prices for the BSE main-board equity universe (groups A/B); index levels and weekly RSI are sourced separately and may differ slightly from NSE. Moving-average and 52-week figures use unadjusted prices. This is technical market context for education only — not a recommendation to buy or sell any security, index or fund. Past behaviour does not predict future results.
        </div>
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

const SECTOR_COLORS = {
  'Bank': '#1565c0', 'PSU Bank': '#0277bd', 'Financial Services': '#283593',
  'IT': '#00695c', 'Auto': '#558b2f', 'FMCG': '#2e7d32',
  'Pharma': '#6a1b9a', 'Healthcare': '#7b1fa2',
  'Metal': '#4e342e', 'Energy': '#e65100', 'Oil & Gas': '#bf360c',
  'Realty': '#37474f', 'Infrastructure': '#546e7a',
  'Media': '#ad1457', 'Consumer Durables': '#00838f',
};
const sColor = (s) => SECTOR_COLORS[s] || 'var(--g2)';

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
        return (
          <div className={`sec-card ${cls}`} key={s} style={{ '--sc': color }}>
            <div className="sec-name">{s}</div>
            <div className="sec-pct">{rp != null ? Math.round(rp) + '%' : '—'}</div>
            <div className="sec-label">above 200DMA</div>
            <div className="sec-bar"><div className="sec-bar-fill" style={{ width: `${rp ?? 0}%` }} /></div>
            <div className="sec-row">
              <span className="brd-up">▲{d.advancing ?? '—'}</span>
              <span className="brd-down">▼{d.declining ?? '—'}</span>
              <span className="sec-uni">∑{d.universe ?? '—'}</span>
            </div>
            {(d.bull_stacked > 0 || d.bear_stacked > 0 || d.golden_cross > 0 || d.death_cross > 0) && (
              <div className="sec-sigs">
                {d.golden_cross > 0 && <span className="sec-sig-gc">GC{d.golden_cross}</span>}
                {d.death_cross > 0 && <span className="sec-sig-dc">DC{d.death_cross}</span>}
                {d.bull_stacked > 0 && <span className="sec-sig-bs">B↑{d.bull_stacked}</span>}
                {d.bear_stacked > 0 && <span className="sec-sig-bs sec-sig-bear">B↓{d.bear_stacked}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
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
`;
