/**
 * app/market-watch/page.js
 *
 * Live Market Watch — Nifty 50, Bank Nifty, Midcap, Smallcap, IT, VIX,
 * USD/INR, FII/DII flows, Advances/Declines, Top Gainers & Losers.
 * Refreshes every 60s. Data: NSE India via /api/market-watch proxy.
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

// ── Formatters ────────────────────────────────────────────────────────────────
const sign   = v => v > 0 ? '+' : '';
const fmtPt  = v => v == null ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtPct = v => v == null ? '—' : `${sign(v)}${v.toFixed(2)}%`;
const fmtCr  = v => {
  if (v == null) return '—';
  const cr = v / 1e7;
  return cr >= 1e5 ? `₹${(cr / 1e5).toFixed(2)}L Cr` : `₹${Math.round(cr).toLocaleString('en-IN')} Cr`;
};
const fmtVol  = v => v == null ? '—' : (v / 1e7).toFixed(2) + ' Cr units';
const isPos   = v => v != null && v > 0;
const isNeg   = v => v != null && v < 0;
const retCls  = v => isPos(v) ? 'ret-pos' : isNeg(v) ? 'ret-neg' : '';
const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }) : '—';

// ── Ticker ────────────────────────────────────────────────────────────────────
function TickerBar({ indices, isOpen }) {
  const content = indices.map(i => `${i.name}  ${fmtPt(i.last)}  ${fmtPct(i.pct)}`).join('   ·   ');
  return (
    <div className="mw-ticker-bar">
      <div className="mw-ticker-status">
        <span className={`mw-status-dot${isOpen ? ' open' : ''}`} />
        <span className="mw-status-label">{isOpen ? 'LIVE' : 'CLOSED'}</span>
      </div>
      <div className="mw-ticker-scroll-wrap">
        <div className="mw-ticker-scroll">
          <span className="mw-ticker-text">{content}</span>
          <span className="mw-ticker-text" aria-hidden="true">{content}</span>
        </div>
      </div>
    </div>
  );
}

// ── Index card ────────────────────────────────────────────────────────────────
function IndexCard({ idx, highlight }) {
  const pos = isPos(idx.pct), neg = isNeg(idx.pct);
  return (
    <div className={`mw-idx-card${highlight ? ' mw-idx-primary' : ''}${pos ? ' mw-pos' : neg ? ' mw-neg' : ''}`}>
      <div className="mw-idx-name">{idx.name}</div>
      <div className="mw-idx-last">{fmtPt(idx.last)}</div>
      <div className={`mw-idx-chg ${retCls(idx.pct)}`}>
        {sign(idx.change)}{fmtPt(idx.change)}
        <span className="mw-idx-pct"> ({fmtPct(idx.pct)})</span>
      </div>
      <div className="mw-idx-meta">
        <span>H: {fmtPt(idx.high)}</span>
        <span>L: {fmtPt(idx.low)}</span>
      </div>
      {idx.pe != null && <div className="mw-idx-pe">PE {idx.pe}</div>}
    </div>
  );
}

// ── FII / DII Flows ───────────────────────────────────────────────────────────
function FiiDiiSection({ fiiDii }) {
  if (!fiiDii) return null;
  const { fii, dii, date } = fiiDii;
  const totalNet = fii.net + dii.net;
  const maxAbs   = Math.max(Math.abs(fii.net), Math.abs(dii.net), 1);

  const Bar = ({ val, label }) => {
    const pct = Math.min(Math.abs(val) / maxAbs * 100, 100);
    const pos = val >= 0;
    return (
      <div className="mw-fii-row">
        <div className="mw-fii-label">{label}</div>
        <div className="mw-fii-bar-track">
          <div
            className={`mw-fii-bar-fill ${pos ? 'mw-fii-pos' : 'mw-fii-neg'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className={`mw-fii-net ${retCls(val)}`}>
          {val >= 0 ? '+' : ''}₹{Math.abs(val).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr
        </div>
      </div>
    );
  };

  return (
    <div className="mw-section">
      <div className="section-head">
        <div className="section-title">🏦 FII / DII Cash Market Flows</div>
        <div className="section-badge">{date} · NSE INDIA</div>
      </div>
      <div className="mw-fii-grid">
        <div className="mw-fii-card">
          <div className="mw-fii-entity">FII / FPI</div>
          <div className="mw-fii-stats">
            <div><span>Buy</span><strong className="ret-pos">₹{fii.buy.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr</strong></div>
            <div><span>Sell</span><strong className="ret-neg">₹{fii.sell.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr</strong></div>
          </div>
          <div className={`mw-fii-netval ${retCls(fii.net)}`}>
            Net {fii.net >= 0 ? '+' : ''}₹{Math.abs(fii.net).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr
          </div>
        </div>
        <div className="mw-fii-card">
          <div className="mw-fii-entity">DII</div>
          <div className="mw-fii-stats">
            <div><span>Buy</span><strong className="ret-pos">₹{dii.buy.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr</strong></div>
            <div><span>Sell</span><strong className="ret-neg">₹{dii.sell.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr</strong></div>
          </div>
          <div className={`mw-fii-netval ${retCls(dii.net)}`}>
            Net {dii.net >= 0 ? '+' : ''}₹{Math.abs(dii.net).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr
          </div>
        </div>
        <div className="mw-fii-card mw-fii-total">
          <div className="mw-fii-entity">Net Combined</div>
          <div className={`mw-fii-bignet ${retCls(totalNet)}`}>
            {totalNet >= 0 ? '+' : ''}₹{Math.abs(totalNet).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr
          </div>
          <div className="mw-fii-note">
            {totalNet > 0 ? '📈 Net buyers — institutions adding positions' : '📉 Net sellers — institutional outflow'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Advances / Declines ───────────────────────────────────────────────────────
function ADBar({ advances, declines, unchanged }) {
  const total = (advances || 0) + (declines || 0) + (unchanged || 0);
  if (!total) return null;
  return (
    <div className="mw-section">
      <div className="section-head">
        <div className="section-title">📊 Nifty 50 — Advances / Declines</div>
      </div>
      <div className="mw-ad-bar">
        <div className="mw-ad-seg mw-ad-adv" style={{ width: `${(advances / total * 100).toFixed(0)}%` }}>{advances}</div>
        {unchanged > 0 && <div className="mw-ad-seg mw-ad-unch" style={{ width: `${(unchanged / total * 100).toFixed(0)}%` }}>{unchanged}</div>}
        <div className="mw-ad-seg mw-ad-dec" style={{ width: `${(declines / total * 100).toFixed(0)}%` }}>{declines}</div>
      </div>
      <div className="mw-ad-legend">
        <span className="mw-ad-adv-label">▲ {advances} Advances</span>
        {unchanged > 0 && <span className="mw-ad-unch-label">— {unchanged} Unchanged</span>}
        <span className="mw-ad-dec-label">▼ {declines} Declines</span>
      </div>
    </div>
  );
}

// ── OHLC ─────────────────────────────────────────────────────────────────────
function OHLCRow({ ohlc, totalVolume, totalValue }) {
  if (!ohlc) return null;
  const range   = ohlc.high - ohlc.low;
  const fillPct = range > 0 ? ((ohlc.close - ohlc.low) / range * 100) : 50;
  return (
    <div className="mw-section">
      <div className="section-head">
        <div className="section-title">📉 Nifty 50 — Today&apos;s Range</div>
      </div>
      <div className="mw-ohlc-bar-wrap">
        <span className="mw-ohlc-val">{fmtPt(ohlc.low)}</span>
        <div className="mw-ohlc-bar">
          <div className="mw-ohlc-fill" style={{ width: `${fillPct.toFixed(0)}%` }} />
          <div className="mw-ohlc-needle" style={{ left: `${fillPct.toFixed(0)}%` }} />
        </div>
        <span className="mw-ohlc-val">{fmtPt(ohlc.high)}</span>
      </div>
      <div className="mw-ohlc-stats">
        <div className="mw-ohlc-stat"><span>Open</span><strong>{fmtPt(ohlc.open)}</strong></div>
        <div className="mw-ohlc-stat"><span>Close</span><strong>{fmtPt(ohlc.close)}</strong></div>
        <div className="mw-ohlc-stat"><span>Volume</span><strong>{fmtVol(totalVolume)}</strong></div>
        <div className="mw-ohlc-stat"><span>Turnover</span><strong>{fmtCr(totalValue)}</strong></div>
      </div>
    </div>
  );
}

// ── Top Gainers / Losers ──────────────────────────────────────────────────────
function GainersLosers({ gainers, losers }) {
  if (!gainers?.length && !losers?.length) return null;
  const Row = ({ s, isGainer }) => (
    <div className="mw-gl-row">
      <span className="mw-gl-symbol">{s.symbol}</span>
      <span className="mw-gl-ltp">{fmtPt(s.ltp)}</span>
      <span className={`mw-gl-pct ${isGainer ? 'ret-pos' : 'ret-neg'}`}>
        {isGainer ? '+' : ''}{s.pct?.toFixed(2)}%
      </span>
    </div>
  );
  return (
    <div className="mw-section">
      <div className="section-head">
        <div className="section-title">🏆 Nifty 50 — Top Movers</div>
        <div className="section-badge">TODAY · NSE</div>
      </div>
      <div className="mw-gl-grid">
        <div className="mw-gl-col">
          <div className="mw-gl-head mw-gl-gain-head">▲ Top Gainers</div>
          {gainers.map(s => <Row key={s.symbol} s={s} isGainer={true} />)}
        </div>
        <div className="mw-gl-col">
          <div className="mw-gl-head mw-gl-loss-head">▼ Top Losers</div>
          {losers.map(s => <Row key={s.symbol} s={s} isGainer={false} />)}
        </div>
      </div>
    </div>
  );
}

// ── Performance strip ─────────────────────────────────────────────────────────
function PerfStrip({ indices }) {
  const filtered = indices.filter(i => i.id !== 'INDIA VIX' && i.id !== 'NIFTY50 USD');
  if (!filtered.length) return null;
  return (
    <div className="mw-section">
      <div className="section-head">
        <div className="section-title">📅 30-Day & 1-Year Performance</div>
      </div>
      <div className="mw-perf-strip">
        {filtered.map(idx => (
          <div key={idx.id} className="mw-perf-item">
            <div className="mw-perf-name">{idx.name}</div>
            <div className={`mw-perf-val ${retCls(idx.perChange30d)}`}>
              {fmtPct(idx.perChange30d)}<span className="mw-perf-period">30d</span>
            </div>
            <div className={`mw-perf-val ${retCls(idx.perChange365d)}`}>
              {fmtPct(idx.perChange365d)}<span className="mw-perf-period">1Y</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── VIX bar ───────────────────────────────────────────────────────────────────
function VixBar({ vix }) {
  if (!vix) return null;
  const note = vix.last > 20 ? '⚠ Elevated fear — expect higher volatility'
             : vix.last < 13 ? '✓ Calm market — low volatility environment'
             : '○ Moderate volatility — normal market conditions';
  return (
    <div className="mw-vix-bar">
      <span className="mw-vix-label">India VIX</span>
      <span className={`mw-vix-val ${vix.last > 20 ? 'ret-neg' : vix.last < 13 ? 'ret-pos' : ''}`}>{fmtPt(vix.last)}</span>
      <span className={`mw-vix-chg ${isPos(vix.pct) ? 'ret-neg' : 'ret-pos'}`}>{fmtPct(vix.pct)}</span>
      <span className="mw-vix-note">{note}</span>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
// ── Sectoral Heatmap ─────────────────────────────────────────────────────────
function SectoralHeatmap({ sectoral }) {
  if (!sectoral?.length) return null;

  // Colour based on % change: deep green → light green → grey → light red → deep red
  function cellStyle(pct) {
    if (pct == null) return { background: 'var(--s3)', color: 'var(--muted)' };
    if (pct >=  2) return { background: '#1b5e20', color: '#fff' };
    if (pct >=  0.5) return { background: '#388e3c', color: '#fff' };
    if (pct >=  0) return { background: '#66bb6a', color: '#1b5e20' };
    if (pct >= -0.5) return { background: '#ef9a9a', color: '#b71c1c' };
    if (pct >= -2) return { background: '#e53935', color: '#fff' };
    return { background: '#b71c1c', color: '#fff' };
  }

  return (
    <div className="mw-section">
      <div className="section-head">
        <div className="section-title">🗂 Sectoral Heatmap</div>
        <div className="section-badge">NSE INDIA · TODAY</div>
      </div>
      <div className="mw-heatmap">
        {sectoral.map(s => {
          const style = cellStyle(s.pct);
          return (
            <div key={s.id} className="mw-heat-cell" style={style}
              title={`${s.name}: ${s.last?.toLocaleString('en-IN')} (${s.pct >= 0 ? '+' : ''}${s.pct?.toFixed(2)}%)`}>
              <div className="mw-heat-name">{s.short}</div>
              <div className="mw-heat-pct">{s.pct >= 0 ? '+' : ''}{s.pct?.toFixed(2)}%</div>
            </div>
          );
        })}
      </div>
      <div className="mw-heatmap-legend">
        {[
          { bg: '#1b5e20', color: '#fff', label: '> +2%' },
          { bg: '#66bb6a', color: '#1b5e20', label: '+0 to +2%' },
          { bg: '#ef9a9a', color: '#b71c1c', label: '0 to −2%' },
          { bg: '#b71c1c', color: '#fff', label: '< −2%' },
        ].map(l => (
          <div key={l.label} className="mw-legend-item">
            <div className="mw-legend-swatch" style={{ background: l.bg }} />
            <span>{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 52-Week High/Low Tracker ──────────────────────────────────────────────────
function YearTracker({ yearTracker }) {
  if (!yearTracker?.length) return null;
  return (
    <div className="mw-section">
      <div className="section-head">
        <div className="section-title">📏 52-Week High / Low Range</div>
        <div className="section-badge">NSE INDIA</div>
      </div>
      <div className="mw-yr-list">
        {yearTracker.map(idx => {
          const range = idx.yearHigh - idx.yearLow;
          const pos   = range > 0 ? ((idx.last - idx.yearLow) / range * 100) : 50;
          const pct   = Math.min(Math.max(pos, 0), 100);
          const nearHigh = pct >= 90;
          const nearLow  = pct <= 10;
          return (
            <div key={idx.id} className="mw-yr-row">
              <div className="mw-yr-name">{idx.name}</div>
              <div className="mw-yr-range">
                <span className="mw-yr-bound mw-yr-low">{idx.yearLow?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                <div className="mw-yr-track" title={`Last: ${idx.last?.toLocaleString('en-IN')} · 52W High: ${idx.yearHigh?.toLocaleString('en-IN')} · 52W Low: ${idx.yearLow?.toLocaleString('en-IN')}`}>
                  <div className="mw-yr-fill" style={{ width: `${pct.toFixed(0)}%` }} />
                  <div className={`mw-yr-needle ${nearHigh ? 'mw-yr-near-high' : nearLow ? 'mw-yr-near-low' : ''}`}
                    style={{ left: `${pct.toFixed(0)}%` }} />
                </div>
                <span className="mw-yr-bound mw-yr-high">{idx.yearHigh?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="mw-yr-meta">
                <span className="mw-yr-last">{idx.last?.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                <span className={`mw-yr-pct ${pct >= 50 ? 'ret-pos' : 'ret-neg'}`}>
                  {pct.toFixed(0)}% of range
                </span>
                {nearHigh && <span className="mw-yr-badge mw-badge-high">Near 52W High</span>}
                {nearLow  && <span className="mw-yr-badge mw-badge-low">Near 52W Low</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Market Holidays Calendar ──────────────────────────────────────────────────
function HolidaysCalendar({ holidays }) {
  if (!holidays?.length) return null;

  const today    = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  function parseDate(str) {
    // "15-Jan-2026" → Date
    const [d, m, y] = str.split('-');
    return new Date(`${d} ${m} ${y}`);
  }

  const upcoming = holidays.filter(h => parseDate(h.date) >= today);
  const past     = holidays.filter(h => parseDate(h.date) < today);
  const next     = upcoming[0];

  // Days until next holiday
  const daysUntil = next
    ? Math.ceil((parseDate(next.date) - today) / 86400000)
    : null;

  return (
    <div className="mw-section">
      <div className="section-head">
        <div className="section-title">🗓 NSE Market Holidays 2026</div>
        <div className="section-badge">CM SEGMENT</div>
      </div>

      {next && (
        <div className="mw-holiday-next">
          <div className="mw-holiday-next-label">Next Holiday</div>
          <div className="mw-holiday-next-name">{next.desc}</div>
          <div className="mw-holiday-next-date">{next.date} · {next.day}</div>
          {daysUntil !== null && (
            <div className="mw-holiday-next-days">
              {daysUntil === 0 ? '🎉 Today is a market holiday' :
               daysUntil === 1 ? '⚠ Tomorrow is a market holiday' :
               `${daysUntil} days away`}
            </div>
          )}
        </div>
      )}

      <div className="mw-holiday-grid">
        {holidays.map(h => {
          const isPast   = parseDate(h.date) < today;
          const isNext   = h === next;
          return (
            <div key={h.date} className={`mw-holiday-row${isPast ? ' mw-holiday-past' : ''}${isNext ? ' mw-holiday-upcoming' : ''}`}>
              <div className="mw-holiday-date">
                <div className="mw-holiday-day-num">{h.date.split('-')[0]}</div>
                <div className="mw-holiday-month">{h.date.split('-')[1]}</div>
              </div>
              <div className="mw-holiday-info">
                <div className="mw-holiday-name">{h.desc}</div>
                <div className="mw-holiday-weekday">{h.day}</div>
              </div>
              {isPast && <div className="mw-holiday-status">Passed</div>}
              {isNext  && <div className="mw-holiday-status mw-next-tag">Next</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}


export default function MarketWatchPage() {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [secsAgo, setSecsAgo] = useState(0);
  const [activeTab, setActiveTab] = useState('heatmap');
  const timerRef = useRef(null);
  const countRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/market-watch');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setData(d); setSecsAgo(0); setError('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, 60_000);
    countRef.current = setInterval(() => setSecsAgo(s => s + 1), 1000);
    return () => { clearInterval(timerRef.current); clearInterval(countRef.current); };
  }, [load]);

  const vix = data?.indices?.find(i => i.id === 'INDIA VIX');

  return (
    <>
      <div className="mw-hero">
        <div className="container">
          <Navbar activePage="market-watch" />
        </div>
      </div>

      <div className="container mw-page">
        <div className="page-header">
          <div className="page-eyebrow">
            <span className={`mw-status-dot${data?.isOpen ? ' open' : ''}`} />
            <span className="eyebrow-text">NSE India · {data?.isOpen ? 'Market Open' : 'Market Closed'} · {data?.marketStatus ?? '—'}</span>
          </div>
          <h1 className="page-title">📡 Live Market Watch</h1>
          <div className="page-subtitle">
            Live indices, FII/DII flows, top movers and market breadth — sourced from NSE India
          </div>
        </div>

        {data && <TickerBar indices={data.indices} isOpen={data.isOpen} />}

        {/* Refresh bar */}
        <div className="mw-refresh-bar">
          <span className="mw-refresh-info">
            {loading ? 'Fetching…' : data?.stale ? '⚠ Stale data — NSE unavailable' : `Updated ${secsAgo}s ago · auto-refreshes every 60s`}
          </span>
          <button className="mw-refresh-btn" onClick={load} disabled={loading}>
            {loading ? '⏳' : '↻'} Refresh
          </button>
          <span className="mw-data-src">
            Source: <a href="https://www.nseindia.com" target="_blank" rel="noopener noreferrer">NSE India</a>
          </span>
        </div>

        {error && !data && <div className="error-box">⚠ {error} — NSE India may be temporarily unavailable.</div>}

        {/* Skeleton */}
        {loading && (
          <div className="mw-grid">
            {[...Array(7)].map((_, i) => (
              <div key={i} className="mw-idx-card mw-sk-card">
                <div className="sk" style={{ width: '60%', height: 11, marginBottom: 10 }} />
                <div className="sk" style={{ width: '80%', height: 26, marginBottom: 8 }} />
                <div className="sk" style={{ width: '50%', height: 11 }} />
              </div>
            ))}
          </div>
        )}

        {data && (
          <>
            {/* Index cards */}
            <div className="mw-grid">
              {data.indices.map((idx, i) => <IndexCard key={idx.id} idx={idx} highlight={i === 0} />)}
              {data.currency?.usdinr && (
                <div className="mw-idx-card">
                  <div className="mw-idx-name">USD / INR</div>
                  <div className="mw-idx-last">₹{data.currency.usdinr.toFixed(4)}</div>
                  <div className="mw-idx-meta" style={{ marginTop: 6 }}>
                    <span style={{ fontSize: '.6rem', color: 'var(--muted)' }}>Currency futures · NSE</span>
                  </div>
                </div>
              )}
            </div>

            <VixBar vix={vix} />
            <ADBar advances={data.nifty50?.advances} declines={data.nifty50?.declines} unchanged={data.nifty50?.unchanged} />
            <OHLCRow ohlc={data.nifty50?.ohlc} totalVolume={data.nifty50?.totalVolume} totalValue={data.nifty50?.totalValue} />

            {/* ── Mobile tab nav — secondary sections ── */}
            <div className="mw-tab-nav" role="tablist">
              {[
                { id: 'heatmap',  label: '🗂 Sectors'   },
                { id: 'fiidii',   label: '🏦 FII/DII'   },
                { id: 'movers',   label: '🏆 Movers'    },
                { id: 'analytics',label: '📏 Analytics' },
                { id: 'calendar', label: '🗓 Calendar'  },
              ].map(t => (
                <button
                  key={t.id}
                  className={`mw-tab-btn${activeTab === t.id ? ' active' : ''}`}
                  onClick={() => setActiveTab(t.id)}
                  role="tab"
                  aria-selected={activeTab === t.id}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Secondary sections — all visible on desktop, tabbed on mobile */}
            <div className={`mw-tab-panel${activeTab === 'heatmap' ? ' active' : ''}`} data-tab="heatmap">
              <SectoralHeatmap sectoral={data.sectoral} />
            </div>
            <div className={`mw-tab-panel${activeTab === 'fiidii' ? ' active' : ''}`} data-tab="fiidii">
              <FiiDiiSection fiiDii={data.fiiDii} />
            </div>
            <div className={`mw-tab-panel${activeTab === 'movers' ? ' active' : ''}`} data-tab="movers">
              <GainersLosers gainers={data.gainers} losers={data.losers} />
            </div>
            <div className={`mw-tab-panel${activeTab === 'analytics' ? ' active' : ''}`} data-tab="analytics">
              <YearTracker yearTracker={data.yearTracker} />
              <PerfStrip indices={data.indices} />
            </div>
            <div className={`mw-tab-panel${activeTab === 'calendar' ? ' active' : ''}`} data-tab="calendar">
              <HolidaysCalendar holidays={data.holidays} />
            </div>
          </>
        )}

        <div className="mw-disclaimer">
          Data sourced from NSE India with a 5-minute server cache. Not real-time — do not use for trading decisions.
          USD/INR shown is currency futures (NSE), not spot rate. GIFT Nifty is not available through NSE&apos;s public API.
          FII/DII data reflects provisional cash market figures for the current trading date.
        </div>

        <div style={{ height: 48 }} />
      </div>
      <Footer />
    </>
  );
}
