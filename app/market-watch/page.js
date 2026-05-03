/**
 * app/market-watch/page.js
 *
 * Live Market Watch — Nifty 50, Bank Nifty, Midcap, Smallcap, IT, VIX,
 * USD/INR, advances/declines, OHLC. Refreshes every 60 seconds.
 * Data sourced from NSE India via server-side proxy (/api/market-watch).
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

// ── Helpers ───────────────────────────────────────────────────────────────────
const sign  = v => v > 0 ? '+' : '';
const fmtPt = v => v == null ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtPct = v => v == null ? '—' : `${sign(v)}${v.toFixed(2)}%`;
const fmtCr  = v => {
  if (v == null) return '—';
  const cr = v / 1e7;
  return cr >= 1e5 ? `₹${(cr/1e5).toFixed(2)}L Cr` : `₹${Math.round(cr).toLocaleString('en-IN')} Cr`;
};
const fmtVol = v => v == null ? '—' : (v/1e7).toFixed(2) + ' Cr';
const isPos   = v => v != null && v > 0;
const isNeg   = v => v != null && v < 0;

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
}

// ── Ticker bar ────────────────────────────────────────────────────────────────
function TickerBar({ indices, isOpen }) {
  const content = indices.map(idx =>
    `${idx.name}  ${fmtPt(idx.last)}  ${fmtPct(idx.pct)}`
  ).join('   ·   ');

  return (
    <div className="mw-ticker-bar" aria-label="Live market ticker">
      <div className="mw-ticker-status">
        <span className={`mw-status-dot${isOpen ? ' open' : ''}`} />
        <span className="mw-status-label">{isOpen ? 'LIVE' : 'CLOSED'}</span>
      </div>
      <div className="mw-ticker-scroll-wrap">
        <div className="mw-ticker-scroll">
          {[content, content].map((c, i) => (
            <span key={i} className="mw-ticker-text" aria-hidden={i === 1}>{c}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Index card ────────────────────────────────────────────────────────────────
function IndexCard({ idx, highlight }) {
  const pos = isPos(idx.pct);
  const neg = isNeg(idx.pct);
  return (
    <div className={`mw-idx-card${highlight ? ' mw-idx-primary' : ''}${pos ? ' mw-pos' : neg ? ' mw-neg' : ''}`}>
      <div className="mw-idx-name">{idx.name}</div>
      <div className="mw-idx-last">{fmtPt(idx.last)}</div>
      <div className={`mw-idx-chg ${pos ? 'ret-pos' : neg ? 'ret-neg' : ''}`}>
        {sign(idx.change)}{fmtPt(idx.change)}
        <span className="mw-idx-pct"> ({fmtPct(idx.pct)})</span>
      </div>
      <div className="mw-idx-meta">
        <span>H: {fmtPt(idx.high)}</span>
        <span>L: {fmtPt(idx.low)}</span>
      </div>
      {idx.pe && <div className="mw-idx-pe">PE {idx.pe}</div>}
    </div>
  );
}

// ── AD ratio bar ──────────────────────────────────────────────────────────────
function ADBar({ advances, declines, unchanged }) {
  const total = (advances||0) + (declines||0) + (unchanged||0);
  if (!total) return null;
  const advPct = (advances / total * 100).toFixed(0);
  const decPct = (declines / total * 100).toFixed(0);
  return (
    <div className="mw-ad-section">
      <div className="mw-ad-title">Nifty 50 — Advances / Declines</div>
      <div className="mw-ad-bar">
        <div className="mw-ad-seg mw-ad-adv" style={{ width: `${advPct}%` }} title={`Advances: ${advances}`}>
          {advances}
        </div>
        {unchanged > 0 && (
          <div className="mw-ad-seg mw-ad-unch" style={{ width: `${(unchanged/total*100).toFixed(0)}%` }} title={`Unchanged: ${unchanged}`}>
            {unchanged}
          </div>
        )}
        <div className="mw-ad-seg mw-ad-dec" style={{ width: `${decPct}%` }} title={`Declines: ${declines}`}>
          {declines}
        </div>
      </div>
      <div className="mw-ad-legend">
        <span className="mw-ad-adv-label">▲ {advances} Advances</span>
        {unchanged > 0 && <span className="mw-ad-unch-label">— {unchanged} Unchanged</span>}
        <span className="mw-ad-dec-label">▼ {declines} Declines</span>
      </div>
    </div>
  );
}

// ── OHLC row ──────────────────────────────────────────────────────────────────
function OHLCRow({ ohlc, totalVolume, totalValue }) {
  if (!ohlc) return null;
  const range = ohlc.high - ohlc.low;
  const fillPct = range > 0 ? ((ohlc.close - ohlc.low) / range * 100) : 50;
  return (
    <div className="mw-ohlc">
      <div className="mw-ohlc-title">Nifty 50 — Today&apos;s Range</div>
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

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton() {
  return (
    <div className="mw-grid-skeleton">
      {[...Array(7)].map((_, i) => (
        <div key={i} className="mw-idx-card mw-sk-card">
          <div className="sk" style={{ width: '60%', height: 12, marginBottom: 10 }} />
          <div className="sk" style={{ width: '80%', height: 24, marginBottom: 8 }} />
          <div className="sk" style={{ width: '50%', height: 12 }} />
        </div>
      ))}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function MarketWatchPage() {
  const [data,     setData]     = useState(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [lastFetch, setLastFetch] = useState(null);
  const [secsAgo,  setSecsAgo]  = useState(0);
  const intervalRef = useRef(null);
  const countRef    = useRef(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/market-watch');
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setData(d);
      setLastFetch(new Date());
      setSecsAgo(0);
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 60_000); // refresh every 60s
    countRef.current    = setInterval(() => setSecsAgo(s => s + 1), 1000);
    return () => { clearInterval(intervalRef.current); clearInterval(countRef.current); };
  }, [load]);

  const nifty50 = data?.indices?.find(i => i.id === 'NIFTY 50');
  const vix     = data?.indices?.find(i => i.id === 'INDIA VIX');

  return (
    <>
      <div className="mw-hero">
        <div className="container">
          <Navbar activePage="market-watch" />
        </div>
      </div>

      <div className="container mw-page">

        {/* ── Page header ── */}
        <div className="page-header">
          <div className="page-eyebrow">
            <span className={`mw-status-dot${data?.isOpen ? ' open' : ''}`} />
            <span className="eyebrow-text">NSE India · {data?.isOpen ? 'Market Open' : 'Market Closed'}</span>
          </div>
          <h1 className="page-title">📡 Live Market Watch</h1>
          <div className="page-subtitle">
            Nifty 50, Bank Nifty, Midcap, IT, VIX and more — sourced from NSE India
          </div>
        </div>

        {/* ── Ticker ── */}
        {data && <TickerBar indices={data.indices} isOpen={data.isOpen} />}

        {/* ── Refresh bar ── */}
        <div className="mw-refresh-bar">
          <span className="mw-refresh-info">
            {loading ? 'Loading…' : data?.stale ? `⚠ Stale data (NSE unavailable)` : `Updated ${secsAgo}s ago`}
          </span>
          <button className="mw-refresh-btn" onClick={load} disabled={loading}>
            {loading ? '⏳' : '↻'} Refresh
          </button>
          <span className="mw-data-src">
            Data: <a href="https://www.nseindia.com" target="_blank" rel="noopener noreferrer">NSE India</a>
            {' '}· Auto-refreshes every 60s · {data?.marketStatus ?? '—'}
          </span>
        </div>

        {/* ── Error ── */}
        {error && !data && (
          <div className="error-box">⚠ {error} — NSE India may be temporarily unavailable.</div>
        )}

        {/* ── Loading skeletons ── */}
        {loading && <Skeleton />}

        {/* ── Index cards grid ── */}
        {data && (
          <>
            <div className="mw-grid">
              {data.indices.map((idx, i) => (
                <IndexCard key={idx.id} idx={idx} highlight={i === 0} />
              ))}

              {/* USD/INR card */}
              {data.currency?.usdinr && (
                <div className="mw-idx-card">
                  <div className="mw-idx-name">USD / INR</div>
                  <div className="mw-idx-last">₹{data.currency.usdinr.toFixed(4)}</div>
                  <div className="mw-idx-meta" style={{ marginTop: 6 }}>
                    <span style={{ fontSize: '.6rem', color: 'var(--muted)' }}>Currency futures proxy · NSE</span>
                  </div>
                </div>
              )}
            </div>

            {/* ── Advances / Declines ── */}
            {data.nifty50 && (
              <ADBar
                advances={data.nifty50.advances}
                declines={data.nifty50.declines}
                unchanged={data.nifty50.unchanged}
              />
            )}

            {/* ── OHLC + Volume ── */}
            {data.nifty50 && (
              <OHLCRow
                ohlc={data.nifty50.ohlc}
                totalVolume={data.nifty50.totalVolume}
                totalValue={data.nifty50.totalValue}
              />
            )}

            {/* ── 30d / 1Y performance strip ── */}
            <div className="mw-perf-strip">
              {data.indices.filter(i => i.id !== 'INDIA VIX' && i.id !== 'NIFTY50 USD').map(idx => (
                <div key={idx.id} className="mw-perf-item">
                  <div className="mw-perf-name">{idx.name}</div>
                  <div className={`mw-perf-val ${isPos(idx.perChange30d) ? 'ret-pos' : isNeg(idx.perChange30d) ? 'ret-neg' : ''}`}>
                    {fmtPct(idx.perChange30d)}
                    <span className="mw-perf-period">30d</span>
                  </div>
                  <div className={`mw-perf-val ${isPos(idx.perChange365d) ? 'ret-pos' : isNeg(idx.perChange365d) ? 'ret-neg' : ''}`}>
                    {fmtPct(idx.perChange365d)}
                    <span className="mw-perf-period">1Y</span>
                  </div>
                </div>
              ))}
            </div>

            {/* ── VIX explainer ── */}
            {vix && (
              <div className="mw-vix-bar">
                <span className="mw-vix-label">India VIX</span>
                <span className={`mw-vix-val ${vix.last > 20 ? 'ret-neg' : vix.last < 13 ? 'ret-pos' : ''}`}>
                  {fmtPt(vix.last)}
                </span>
                <span className={`mw-vix-chg ${isPos(vix.pct) ? 'ret-neg' : 'ret-pos'}`}>
                  {fmtPct(vix.pct)}
                </span>
                <span className="mw-vix-note">
                  {vix.last > 20 ? '⚠ High volatility — market fear elevated' : vix.last < 13 ? '✓ Low volatility — market calm' : '○ Moderate volatility'}
                </span>
              </div>
            )}
          </>
        )}

        <div className="mw-disclaimer">
          Data sourced from NSE India. 5-minute server cache applied. Not real-time — do not use for trading decisions.
          GIFT Nifty data is not available through NSE&apos;s public API. USD/INR shown is currency futures, not spot rate.
        </div>

        <div style={{ height: 48 }} />
      </div>

      <Footer />
    </>
  );
}
