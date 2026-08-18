'use client';

import { useState, useEffect } from 'react';

const SYNTHETIC_PANS = new Set(['SHARED', 'UNKNOWN']);

export default function CasMemberMerge({
  open, onClose, members, overrides, targetUserId, initialFromPan, onMerged,
}) {
  const [fromPan, setFromPan] = useState(initialFromPan || '');
  const [toPan, setToPan]     = useState('');
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (open) {
      setFromPan(initialFromPan || '');
      setToPan('');
      setError('');
    }
  }, [open, initialFromPan]);

  if (!open) return null;

  const fromMember = members.find(m => m.pan === fromPan);
  const targetCandidates = members.filter(m => m.pan !== fromPan && !SYNTHETIC_PANS.has(m.pan));

  async function doMerge() {
    // Never fail silently: fromMember can be missing even when fromPan is set
    // (e.g. a stale initialFromPan for a member that no longer exists after a
    // re-load), and a merge that reports nothing while doing nothing is the
    // worst possible outcome here.
    if (!fromMember || !toPan) {
      setError('Pick both a member to merge and a target to merge it into.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/cas/merge-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folioNos: fromMember.folioNos, targetPan: toPan, targetUserId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not save this merge.');
        setBusy(false);
        return;
      }
      setBusy(false);
      onMerged();
    } catch {
      setError('Could not save this merge. Please try again.');
      setBusy(false);
    }
  }

  async function undoOverride(folioNo) {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/cas/merge-member', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folioNos: [folioNo], targetUserId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || 'Could not undo this merge.');
        setBusy(false);
        return;
      }
      setBusy(false);
      onMerged();
    } catch {
      setError('Could not undo this merge. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className="cmm-overlay" onClick={onClose}>
      <div className="cmm-panel" onClick={e => e.stopPropagation()}>
        <div className="cmm-head">
          <h3>Manage members</h3>
          <button className="cmm-close" onClick={onClose}>✕</button>
        </div>

        <div className="cmm-section">
          <div className="cmm-section-title">Merge a member into another</div>
          <p className="cmm-hint">
            Use this when the same investor shows up as two separate members —
            most often because one folio is missing its PAN. This moves ALL of
            that folio's holdings under the member you pick below.
          </p>
          <div className="cmm-merge-row">
            <select value={fromPan} onChange={e => setFromPan(e.target.value)}>
              <option value="">Merge which member…</option>
              {members.map(m => (
                <option key={m.pan} value={m.pan}>{m.name} ({m.folioNos.length} folio{m.folioNos.length === 1 ? '' : 's'})</option>
              ))}
            </select>
            <span>into</span>
            <select value={toPan} onChange={e => setToPan(e.target.value)} disabled={!fromPan}>
              <option value="">Pick target member…</option>
              {targetCandidates.map(m => (
                <option key={m.pan} value={m.pan}>{m.name}</option>
              ))}
            </select>
            <button onClick={doMerge} disabled={busy || !fromPan || !toPan}>
              {busy ? 'Merging…' : 'Merge'}
            </button>
          </div>
          {error && <div className="cmm-error">⚠ {error}</div>}
        </div>

        {overrides.length > 0 && (
          <div className="cmm-section">
            <div className="cmm-section-title">Active manual merges</div>
            <div className="cmm-override-list">
              {overrides.map(o => (
                <div key={o.folioNo} className="cmm-override-row">
                  <span>Folio {o.folioNo} → {o.targetName}</span>
                  <button onClick={() => undoOverride(o.folioNo)} disabled={busy}>Undo</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
