/**
 * app/market-watch/page.js
 *
 * Live Market Watch — Nifty 50, Bank Nifty, Midcap, Smallcap, IT, VIX,
 * USD/INR, FII/DII flows, Advances/Declines, Top Gainers & Losers.
 * Refreshes every 60s. Data: NSE India via /api/market-watch proxy.
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
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

// ── Sector Detail Panel ──────────────────────────────────────────────────────
function SectorPanel({ sector, onClose }) {
  const [detail,  setDetail]  = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [chartPeriod, setChartPeriod] = useState('30d');

  const fmt   = v => v == null ? '—' : v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const fmtCr = v => v == null ? '—' : '₹' + (v / 1e7).toFixed(0) + ' Cr';
  const sign  = v => v >= 0 ? '+' : '';
  const cls   = v => v >= 0 ? 'ret-pos' : 'ret-neg';

  // Fetch sector detail
  useEffect(() => {
    fetch(`/api/sector-detail?index=${encodeURIComponent(sector.id)}`)
      .then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setDetail(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [sector.id]);

  // Keyboard close
  useEffect(() => {
    const h = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  // Browser back button
  useEffect(() => {
    window.history.pushState({ sectorPanel: true }, '', window.location.pathname + '#sector');
    const h = () => { setDetail(null); onClose(); };
    window.addEventListener('popstate', h);
    return () => window.removeEventListener('popstate', h);
  }, [onClose]);

  const meta    = detail?.metadata ?? {};
  const stocks  = detail?.stocks   ?? [];
  const advance = detail?.advance  ?? {};
  const adv     = parseInt(advance.advances  || 0);
  const dec     = parseInt(advance.declines  || 0);
  const unch    = parseInt(advance.unchanged || 0);
  const total   = adv + dec + unch || 1;

  const sorted    = [...stocks].sort((a, b) => b.pChange - a.pChange);
  const gainers   = sorted.slice(0, 5);
  const losers    = sorted.slice(-5).reverse();
  const nearHigh  = [...stocks].sort((a, b) => a.nearWKH - b.nearWKH).slice(0, 4);
  const nearLow   = [...stocks].sort((a, b) => b.nearWKL - a.nearWKL).slice(0, 4);

  const range52 = meta.yearHigh - meta.yearLow;
  const pos52   = range52 > 0
    ? Math.min(((meta.last - meta.yearLow) / range52) * 100, 100)
    : 50;

  const chartSrc = chartPeriod === '30d' ? meta.chart30dPath : meta.chart365dPath;

  return (
    <div className="sp-overlay" onClick={e => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true">
      <div className="sp-panel">

        {/* ── Sticky Header ── */}
        <div className="sp-header">
          <div className="sp-header-row">
            <div className="sp-header-info">
              <div className="sp-eyebrow">NSE India · Sectoral Index</div>
              <div className="sp-title">{sector.id}</div>
              {detail && (
                <div className="sp-subtitle">
                  {meta.timeVal} · {adv}↑ {unch > 0 ? `${unch}— ` : ''}{dec}↓
                </div>
              )}
            </div>
            <button className="sp-close" onClick={onClose} aria-label="Close">✕</button>
          </div>

          {/* Index stats bar */}
          {loading ? (
            <div className="sp-stats-bar sp-sk-bar">
              {[1,2,3,4].map(i => (
                <div key={i} className="sp-stat">
                  <div className="sp-sk" style={{ width: '60%', height: 14, margin: '0 auto 4px' }} />
                  <div className="sp-sk" style={{ width: '40%', height: 8, margin: '0 auto' }} />
                </div>
              ))}
            </div>
          ) : detail ? (
            <div className="sp-stats-bar">
              <div className="sp-stat">
                <div className={`sp-stat-val ${cls(meta.percChange)}`}>{fmt(meta.last)}</div>
                <div className="sp-stat-lbl">Last</div>
              </div>
              <div className="sp-stat">
                <div className={`sp-stat-val ${cls(meta.percChange)}`}>{sign(meta.percChange)}{meta.percChange?.toFixed(2)}%</div>
                <div className="sp-stat-lbl">Today</div>
              </div>
              <div className="sp-stat">
                <div className="sp-stat-val">{pos52.toFixed(0)}%</div>
                <div className="sp-stat-lbl">52W Pos</div>
              </div>
              <div className="sp-stat">
                <div className="sp-stat-val">{fmtCr(meta.totalTradedValue)}</div>
                <div className="sp-stat-lbl">Turnover</div>
              </div>
            </div>
          ) : null}
        </div>

        {/* ── Body ── */}
        <div className="sp-body">
          {error && <div className="error-box">⚠ {error}</div>}

          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[200, 60, 130, 130].map((h, i) => (
                <div key={i} className="sp-sk" style={{ height: h, borderRadius: 10 }} />
              ))}
            </div>
          )}

          {detail && !loading && (
            <>
              {/* A/D Bar */}
              <div className="sp-ad-bar">
                <div className="sp-ad-adv" style={{ width: `${(adv/total*100).toFixed(0)}%` }} />
                {unch > 0 && <div className="sp-ad-unch" style={{ width: `${(unch/total*100).toFixed(0)}%` }} />}
                <div className="sp-ad-dec" style={{ width: `${(dec/total*100).toFixed(0)}%` }} />
              </div>
              <div className="sp-ad-legend">
                <span className="sp-ad-adv-label">▲ {adv} Advances</span>
                {unch > 0 && <span style={{ color: 'var(--muted)' }}>— {unch}</span>}
                <span className="sp-ad-dec-label">▼ {dec} Declines</span>
              </div>

              {/* Chart */}
              <div className="sp-chart-wrap">
                <div className="sp-chart-header">
                  <span className="sp-chart-label">Price Chart</span>
                  <div className="sp-chart-tabs">
                    {[['30d', '30D'], ['365d', '1Y']].map(([key, label]) => (
                      <button
                        key={key}
                        className={`sp-chart-tab${chartPeriod === key ? ' active' : ''}`}
                        onClick={() => setChartPeriod(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {chartSrc ? (
                  <img className="sp-chart-img" src={chartSrc} alt={`${chartPeriod} chart`} />
                ) : (
                  <div className="sp-chart-na">Chart unavailable</div>
                )}
              </div>

              {/* 52-Week Range */}
              <div className="sp-52w-wrap">
                <div className="sp-52w-label">52-Week Range</div>
                <div className="sp-52w-bar-row">
                  <span className="sp-52w-lo">{fmt(meta.yearLow)}</span>
                  <div className="sp-52w-bar">
                    <div className="sp-52w-fill" style={{ width: `${pos52.toFixed(0)}%` }} />
                    <div className="sp-52w-needle" style={{ left: `${Math.min(pos52, 97).toFixed(0)}%` }} />
                  </div>
                  <span className="sp-52w-hi">{fmt(meta.yearHigh)}</span>
                </div>
                <div className="sp-52w-meta">
                  <span>Now: <strong>{fmt(meta.last)}</strong></span>
                  <span>Position: <strong>{pos52.toFixed(0)}% of range</strong></span>
                </div>
              </div>

              {/* Performance */}
              <div className="sp-perf-row">
                {[
                  ['30-Day Return', meta.perChange30d],
                  ['1-Year Return', meta.perChange365d],
                ].map(([label, val]) => (
                  <div key={label} className="sp-perf-card">
                    <div className="sp-perf-label">{label}</div>
                    <div className={`sp-perf-val ${cls(val)}`}>{sign(val)}{val?.toFixed(2)}%</div>
                  </div>
                ))}
              </div>

              {/* Top Movers */}
              <div className="sp-section-head">
                <div className="sp-section-title">🏆 Top Movers Today</div>
              </div>
              <div className="sp-movers-grid">
                <div className="sp-mover-col">
                  <div className="sp-mover-head sp-gain-head">▲ Gainers</div>
                  {gainers.map(s => (
                    <div key={s.symbol} className="sp-mover-row">
                      <div>
                        <div className="sp-mover-sym">{s.symbol}</div>
                        <div className="sp-mover-meta">{fmt(s.lastPrice)}</div>
                      </div>
                      <div className="sp-mover-pct ret-pos">+{s.pChange.toFixed(2)}%</div>
                    </div>
                  ))}
                </div>
                <div className="sp-mover-col">
                  <div className="sp-mover-head sp-loss-head">▼ Losers</div>
                  {losers.map(s => (
                    <div key={s.symbol} className="sp-mover-row">
                      <div>
                        <div className="sp-mover-sym">{s.symbol}</div>
                        <div className="sp-mover-meta">{fmt(s.lastPrice)}</div>
                      </div>
                      <div className="sp-mover-pct ret-neg">{s.pChange.toFixed(2)}%</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 52-Week Extremes */}
              <div className="sp-section-head">
                <div className="sp-section-title">📏 52-Week Position</div>
              </div>
              <div className="sp-extremes-grid">
                <div className="sp-extreme-col sp-extreme-high">
                  <div className="sp-extreme-head">Near 52W High</div>
                  {nearHigh.map(s => (
                    <div key={s.symbol} className="sp-extreme-row">
                      <span className="sp-extreme-sym">{s.symbol}</span>
                      <span className="sp-extreme-val ret-pos">{Math.abs(s.nearWKH).toFixed(1)}% below</span>
                    </div>
                  ))}
                </div>
                <div className="sp-extreme-col sp-extreme-low">
                  <div className="sp-extreme-head">Above 52W Low</div>
                  {nearLow.map(s => (
                    <div key={s.symbol} className="sp-extreme-row">
                      <span className="sp-extreme-sym">{s.symbol}</span>
                      <span className="sp-extreme-val ret-pos">{Math.abs(s.nearWKL).toFixed(1)}% above</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Fun insight */}
              <div className="sp-insight">
                <div className="sp-insight-icon">💡</div>
                <div className="sp-insight-text">
                  <strong>{gainers[0]?.symbol}</strong> leads with <span className="ret-pos">+{gainers[0]?.pChange.toFixed(2)}%</span>.
                  {' '}{stocks.length} stocks tracked in this index.
                  {' '}Sector is <strong>{pos52.toFixed(0)}%</strong> of its 52-week range.
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sectoral Heatmap ─────────────────────────────────────────────────────────
function SectoralHeatmap({ sectoral }) {
  const [activeSector, setActiveSector] = useState(null);
  if (!sectoral?.length) return null;

  function cellStyle(pct) {
    if (pct == null) return { background: 'var(--s3)', color: 'var(--muted)' };
    if (pct >=  2)    return { background: '#1b5e20', color: '#fff' };
    if (pct >=  0.5)  return { background: '#388e3c', color: '#fff' };
    if (pct >=  0)    return { background: '#66bb6a', color: '#1b5e20' };
    if (pct >= -0.5)  return { background: '#ef9a9a', color: '#b71c1c' };
    if (pct >= -2)    return { background: '#e53935', color: '#fff' };
    return { background: '#b71c1c', color: '#fff' };
  }

  function handleTileClick(s) {
    setActiveSector(s);
    window.history.pushState({ sectorPanel: true }, '', window.location.pathname + '#sector');
  }

  function closePanel() {
    setActiveSector(null);
    if (window.location.hash === '#sector') window.history.back();
  }

  return (
    <>
      <div className="mw-section">
        <div className="section-head">
          <div className="section-title">🗂 Sectoral Heatmap</div>
          <div className="section-badge">TAP TO EXPLORE · NSE</div>
        </div>
        <div className="mw-heatmap">
          {sectoral.map(s => {
            const style = cellStyle(s.pct);
            const isActive = activeSector?.id === s.id;
            return (
              <div
                key={s.id}
                className={`mw-heat-cell${isActive ? ' mw-heat-selected' : ''}`}
                style={style}
                onClick={() => handleTileClick(s)}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && handleTileClick(s)}
                aria-label={`${s.name}: ${s.pct >= 0 ? '+' : ''}${s.pct?.toFixed(2)}% — tap to explore`}
              >
                <div className="mw-heat-name">{s.short}</div>
                <div className="mw-heat-pct">{s.pct >= 0 ? '+' : ''}{s.pct?.toFixed(2)}%</div>
              </div>
            );
          })}
        </div>
        <div className="mw-heatmap-legend">
          {[
            { bg: '#1b5e20', label: '> +2%' },
            { bg: '#66bb6a', label: '+0 to +2%' },
            { bg: '#ef9a9a', label: '0 to −2%' },
            { bg: '#b71c1c', label: '< −2%' },
          ].map(l => (
            <div key={l.label} className="mw-legend-item">
              <div className="mw-legend-swatch" style={{ background: l.bg }} />
              <span>{l.label}</span>
            </div>
          ))}
        </div>
        <div className="mw-heatmap-hint">Tap any sector tile to explore stocks, performance & charts</div>
      </div>

      {activeSector && (
        <SectorPanel sector={activeSector} onClose={closePanel} />
      )}
    </>
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
  const { status } = useSession();
  const isLoggedIn = status === 'authenticated';
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
          {isLoggedIn && (
            <button className="mw-refresh-btn" onClick={load} disabled={loading}>
              {loading ? '⏳' : '↻'} Refresh
            </button>
          )}
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
