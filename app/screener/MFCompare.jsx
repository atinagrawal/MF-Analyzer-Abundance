'use client';
// app/screener/MFCompare.jsx
//
// MF/SIF fund comparison — floating selection bar + (added in Task 7) the
// full comparison modal. Modeled directly on app/pms-screener/PMSCompare.jsx's
// PMSCompareBar, extended with a small per-chip type badge (MF/SIF) since
// this feature mixes both.
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
