'use client';

// components/LossAdjustmentPanel.jsx
//
// Shared "loss adjustment" teaser + expandable panel — used by both the
// single-fund RedemptionPlanner (0-1 notes) and CAS Tracker's portfolio-level
// PortfolioRedemptionPlanner (0-2 notes, one per tax-rate pool). Renders
// nothing if there's nothing to report.

import { useState } from 'react';
import { describeLossOffset } from '@/lib/taxCalc';

export default function LossAdjustmentPanel({ notes }) {
  const [expanded, setExpanded] = useState(false);
  const lines = notes.flatMap(describeLossOffset);
  if (lines.length === 0) return null;

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--g-light)' }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
      >
        <span style={{ fontSize: 14 }}>💡</span>
        <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--g1)' }}>
          Loss adjustment applied — tap for details
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '.6rem', color: 'var(--muted)' }}>
          {expanded ? '▴' : '▾'}
        </span>
      </div>
      {expanded && (
        <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--surface)', borderRadius: 8, fontSize: '.68rem', lineHeight: 1.7, color: 'var(--text)' }}>
          {lines.map((line, i) => (
            <div key={i} style={{ marginBottom: i < lines.length - 1 ? 6 : 0 }}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
