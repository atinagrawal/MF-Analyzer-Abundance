'use client';
/**
 * app/pms-screener/PMSCompare.jsx
 *
 * Change from original:
 *  PMSCompareModal now accepts a `dataLabel` prop (e.g. "March 2026")
 *  instead of hardcoding "Feb 2026" in the modal subtitle.
 *  Passed from page.jsx: <PMSCompareModal dataLabel={pmsDate.label} ... />
 */
import { useMemo } from 'react';
import './pms-compare.css';

const MAX_COMPARE = 3;
const INVESTMENT = 5000000; // ₹50L
const BENCHMARK_1Y = 18.5;

function fmtRet(v) {
  if (v === null || v === undefined) return '—';
  return (v > 0 ? '+' : '') + v + '%';
}
function fmtAum(v) {
  if (v === null || v === undefined) return '—';
  if (v >= 10000) return '₹' + (v / 1000).toFixed(1) + 'K Cr';
  return '₹' + v.toLocaleString('en-IN') + ' Cr';
}
function fmtWealth(ret1Y) {
  if (ret1Y === null || ret1Y === undefined) return { value: '—', gain: '—', isPos: true };
  const val = INVESTMENT * (1 + ret1Y / 100);
  const gain = val - INVESTMENT;
  return {
    value: '₹' + Math.round(val).toLocaleString('en-IN'),
    gain: (gain >= 0 ? '+' : '') + '₹' + Math.abs(Math.round(gain)).toLocaleString('en-IN'),
    isPos: gain >= 0,
  };
}
function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function rc(v) {
  if (v === null || v === undefined) return 'neu';
  return v > 0 ? 'pos' : v < 0 ? 'neg' : 'neu';
}

const PERIODS = [
  { label: '1 Month', key: 'ret1M' },
  { label: '3 Months', key: 'ret3M' },
  { label: '6 Months', key: 'ret6M' },
  { label: '1 Year', key: 'ret1Y' },
  { label: '2 Years', key: 'ret2Y' },
  { label: '3 Years', key: 'ret3Y' },
  { label: '5 Years', key: 'ret5Y' },
  { label: 'Inception', key: 'retInception' },
];

// ── Compare Bar ───────────────────────────────────────────────────────────
export function PMSCompareBar({ selected, onRemove, onClear, onCompare }) {
  const vis = selected.length > 0;
  return (
    <div className={`cmp-bar${vis ? ' visible' : ''}`} role="region" aria-label="PMS Compare basket">
      <div className="cmp-bar-chips">
        {selected.map(f => (
          <span key={f.id} className="cmp-chip">
            {f.strategyName.length > 20 ? f.strategyName.slice(0, 20) + '…' : f.strategyName}
            <span className="cmp-chip-x" role="button" onClick={() => onRemove(f.id)} aria-label={`Remove ${f.strategyName} from compare`}>×</span>
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

// ── Compare Modal ─────────────────────────────────────────────────────────
/**
 * @param {Object}   props
 * @param {Array}    props.funds      - Up to 3 strategy objects
 * @param {string}   props.dataLabel  - e.g. "March 2026" — passed from page.jsx
 * @param {Function} props.onClose
 * @param {Function} props.onRemove
 */
export function PMSCompareModal({ funds, dataLabel, onClose, onRemove }) {
  const n = funds.length;

  const winners = useMemo(() => {
    const w = {};
    PERIODS.forEach(({ key }) => {
      const vals = funds.map(f => f[key] ?? -Infinity);
      const maxV = Math.max(...vals);
      w[key] = vals.map((v, i) => v === maxV && v !== -Infinity ? i : -1);
    });
    const aumVals = funds.map(f => f.aum ?? 0);
    const maxAum = Math.max(...aumVals);
    w['aum'] = aumVals.map((v, i) => v === maxAum ? i : -1);
    const wVals = funds.map(f => f.ret1Y ?? -Infinity);
    const maxW = Math.max(...wVals);
    w['wealth'] = wVals.map((v, i) => v === maxW && v !== -Infinity ? i : -1);
    return w;
  }, [funds]);

  const winCount = useMemo(() => {
    const counts = Array(n).fill(0);
    Object.values(winners).forEach(arr => {
      arr.forEach((wi, i) => { if (wi === i) counts[i]++; });
    });
    return counts;
  }, [winners, n]);

  const overallWinner = useMemo(() => {
    const maxWins = Math.max(...winCount);
    const idx = winCount.indexOf(maxWins);
    return { idx, wins: maxWins, fund: funds[idx] };
  }, [winCount, funds]);

  if (!funds.length) return null;

  return (
    <>
      <div className="cmp-overlay open" onClick={onClose} />
      <div className="cmp-modal open" role="dialog" aria-modal="true" aria-label="PMS Strategy Comparison">
        <div className="cmp-modal-inner" style={{ '--cols': n }}>

          {/* Header */}
          <div className="cmp-modal-header">
            <div>
              <div className="cmp-modal-title">⚖ Strategy Comparison</div>
              {/* dataLabel prop replaces hardcoded "Feb 2026" */}
              <div className="cmp-modal-sub">
                APMI India · {dataLabel} · TWRR · Net of fees · APRN04279
              </div>
            </div>
            <button className="cmp-modal-close" onClick={onClose} aria-label="Close comparison">×</button>
          </div>

          {/* Grid */}
          <div className="cmp-grid" style={{ '--cols': n }}>

            {/* Strategy header row */}
            <div className="cmp-cell cmp-strat-header">
              <div style={{ fontWeight: 700, fontSize: '.72rem', color: 'var(--muted)', paddingTop: 6 }}>STRATEGY</div>
            </div>
            {funds.map((f, i) => (
              <div key={f.id} className="cmp-cell cmp-strat-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 6 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--g-xlight)', border: '1.5px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace', fontSize: '.6rem', fontWeight: 800, color: 'var(--g1)', flexShrink: 0 }}>
                    {initials(f.portfolioManager)}
                  </div>
                  <div>
                    <div className="cmp-strat-name">{f.strategyName}</div>
                    <div className="cmp-strat-mgr">{f.portfolioManager}</div>
                  </div>
                </div>
                <div className="cmp-strat-aum">{fmtAum(f.aum)}</div>
                {winCount[i] > 0 && (
                  <span className="cmp-win-badge">🏆 Best in {winCount[i]} period{winCount[i] > 1 ? 's' : ''}</span>
                )}
                <button className="cmp-remove-btn" onClick={() => onRemove(f.id)}>✕ Remove</button>
              </div>
            ))}

            {/* Returns */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              📊 Returns Across All Time Horizons
            </div>
            {PERIODS.map(({ label, key }) => {
              const vals = funds.map(f => f[key]);
              const allNull = vals.every(v => v === null || v === undefined);
              if (allNull) return null;
              return (
                <div key={key} className="cmp-row">
                  <div className="cmp-cell" style={{ fontWeight: 700 }}>{label}</div>
                  {funds.map((f, i) => {
                    const v = f[key];
                    const isBest = winners[key]?.[i] === i;
                    return (
                      <div key={f.id} className={`cmp-cell${isBest ? ' cmp-ret-best' : ''}`}>
                        <span className={`cmp-ret ${rc(v)}`}>{fmtRet(v)}</span>
                        {isBest && n > 1 && <span style={{ fontSize: '.55rem', marginLeft: 4, color: 'var(--g3)' }}>↑ best</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Alpha vs benchmark */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              📈 Alpha vs Benchmark (Nifty 50 · {BENCHMARK_1Y}% 1Y)
            </div>
            <div className="cmp-row">
              <div className="cmp-cell" style={{ fontWeight: 700 }}>1Y Alpha</div>
              {funds.map((f, i) => {
                const alpha = f.ret1Y !== null && f.ret1Y !== undefined ? (f.ret1Y - BENCHMARK_1Y).toFixed(2) : null;
                const isBest = winners['ret1Y']?.[i] === i;
                return (
                  <div key={f.id} className={`cmp-cell${isBest ? ' cmp-ret-best' : ''}`}>
                    {alpha !== null
                      ? <span className={`cmp-ret ${parseFloat(alpha) > 0 ? 'pos' : 'neg'}`}>{parseFloat(alpha) > 0 ? '+' : ''}{alpha}%</span>
                      : <span className="cmp-ret neu">—</span>}
                    {isBest && n > 1 && <span style={{ fontSize: '.55rem', marginLeft: 4, color: 'var(--g3)' }}>↑ best</span>}
                  </div>
                );
              })}
            </div>

            {/* Wealth simulation */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              💰 Wealth Creation Simulation · ₹50 Lakh Invested 1 Year Ago
            </div>
            <div className="cmp-row">
              <div className="cmp-cell" style={{ fontWeight: 700 }}>Value Today</div>
              {funds.map((f, i) => {
                const w = fmtWealth(f.ret1Y);
                const isBest = winners['wealth']?.[i] === i;
                return (
                  <div key={f.id} className={`cmp-cell${isBest ? ' cmp-ret-best' : ''}`}>
                    <div className="cmp-wealth-num" style={{ color: w.isPos ? 'var(--g2)' : 'var(--neg)' }}>{w.value}</div>
                    <div className="cmp-wealth-gain" style={{ color: w.isPos ? 'var(--g3)' : 'var(--neg)' }}>{w.gain}</div>
                    {isBest && n > 1 && <div style={{ fontSize: '.55rem', color: 'var(--g3)', marginTop: 2 }}>↑ best outcome</div>}
                  </div>
                );
              })}
            </div>

            {/* AUM */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              🏦 Assets Under Management
            </div>
            <div className="cmp-row">
              <div className="cmp-cell" style={{ fontWeight: 700 }}>AUM</div>
              {funds.map((f, i) => {
                const isBest = winners['aum']?.[i] === i;
                return (
                  <div key={f.id} className={`cmp-cell${isBest ? ' cmp-ret-best' : ''}`}>
                    <span className="cmp-ret pos">{fmtAum(f.aum)}</span>
                  </div>
                );
              })}
            </div>

          </div>{/* /cmp-grid */}

          {/* Verdict banner */}
          {n > 1 && overallWinner.fund && (
            <div className="cmp-verdict">
              <div className="cmp-verdict-icon">🏆</div>
              <div>
                <div className="cmp-verdict-title">Overall Leader: {overallWinner.fund.strategyName}</div>
                <div className="cmp-verdict-body">
                  <strong>{overallWinner.fund.strategyName}</strong> by{' '}
                  <strong>{overallWinner.fund.portfolioManager}</strong> leads on{' '}
                  <strong>{overallWinner.wins} out of {Object.keys(winners).length}</strong> metrics —
                  including a {fmtWealth(overallWinner.fund.ret1Y).gain} gain on a ₹50L basis over 1 year.{' '}
                  {overallWinner.fund.apmiLink && (
                    <a href={overallWinner.fund.apmiLink.startsWith('http') ? overallWinner.fund.apmiLink : `https://www.apmiindia.org${overallWinner.fund.apmiLink}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--g2)', fontWeight: 700, textDecoration: 'none' }}>
                      View on APMI ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="cmp-disclaimer">
            <strong>Important Disclosure:</strong> This comparison is for informational and educational purposes only and does not constitute investment advice.
            Data sourced from APMI India — Discretionary strategies — {dataLabel} — TWRR methodology, net of all fees.
            Past performance is not indicative of future returns. Minimum PMS investment is ₹50 Lakhs as per SEBI regulations.
            Abundance Financial Services. Atin Kumar Agrawal · ARN-251838 · APRN04279 · APMI Registered Portfolio Manager Distributor.
          </div>
        </div>
      </div>
    </>
  );
}
