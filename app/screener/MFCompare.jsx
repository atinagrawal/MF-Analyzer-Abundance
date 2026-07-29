'use client';
// app/screener/MFCompare.jsx
//
// MF/SIF fund comparison — floating selection bar + (added in Task 7) the
// full comparison modal. Modeled directly on app/pms-screener/PMSCompare.jsx's
// PMSCompareBar, extended with a small per-chip type badge (MF/SIF) since
// this feature mixes both.
import { useState, useEffect, useMemo } from 'react';
import ProviderAvatar from '@/components/ProviderAvatar';
import { getMFLogo, getSIFLogo } from '@/lib/providerLogos';
import { normalizeFund, winCounts, applyDerivedStats, fetchNavSeries, categoryPeerRank } from './compareEngine';
import './mf-compare.css';

const MAX_COMPARE = 3;

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
  { label: 'Max Drawdown', key: 'max_dd', lowerIsBetter: false, suffix: '%' }, // values are <= 0; "best" = closest to zero = the MAX value, not the min
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

/**
 * @param {Array} props.funds        - compareList entries, each { type: 'mf'|'sif', ...rawFund }
 * @param {Array} props.allMfFunds   - the screener's full `funds` array, for category peer-rank (Task 8)
 * @param {Function} props.onClose
 * @param {Function} props.onRemove
 */
export function MFCompareModal({ funds, allMfFunds, onClose, onRemove }) {
  const normalized = useMemo(() => funds.map(normalizeFund), [funds]);
  const n = normalized.length;

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

  const counts = useMemo(() => winCounts(derived), [derived]);

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
