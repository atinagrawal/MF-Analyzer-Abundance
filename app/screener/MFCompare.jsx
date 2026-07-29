'use client';
// app/screener/MFCompare.jsx
//
// MF/SIF fund comparison — floating selection bar + (added in Task 7) the
// full comparison modal. Modeled directly on app/pms-screener/PMSCompare.jsx's
// PMSCompareBar, extended with a small per-chip type badge (MF/SIF) since
// this feature mixes both.
import { useMemo } from 'react';
import ProviderAvatar from '@/components/ProviderAvatar';
import { getMFLogo, getSIFLogo } from '@/lib/providerLogos';
import { normalizeFund, winCounts } from './compareEngine';
import './mf-compare.css';

const MAX_COMPARE = 3;

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
  const counts = useMemo(() => winCounts(normalized), [normalized]);

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
