'use client';

/**
 * app/admin/LeadsTab.jsx
 *
 * One scannable list of every user who has uploaded a CAS, sorted by
 * most recent upload, for personal follow-up. Backed by
 * app/api/admin/leads (GET only -- this tab is read-only, nothing to
 * save here).
 *
 * cas_email/cas_mobile were already captured (see
 * docs/superpowers/specs/2026-10-14-admin-client-outreach-design.md and
 * scripts/migrate-cas-mobile.mjs) but only visible by clicking into one
 * user at a time in the Users tab -- this surfaces the same data as one
 * list instead.
 *
 * lead_contacted_at (see scripts/migrate-lead-contacted.mjs) lets whoever's
 * working this list mark a lead as already followed up with, and "Hide
 * contacted" filters them out of view so the list tracks what's left to do
 * -- both are local UI state, nothing more to fetch for them.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function searchLeads(list, q) {
  const t = q.trim().toLowerCase();
  if (!t) return list;
  return list.filter((l) =>
    (l.name || '').toLowerCase().includes(t) ||
    (l.email || '').toLowerCase().includes(t) ||
    (l.cas_email || '').toLowerCase().includes(t) ||
    (l.cas_mobile || '').toLowerCase().includes(t)
  );
}

export default function LeadsTab() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [hideContacted, setHideContacted] = useState(false);
  const [togglingId, setTogglingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/leads');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setLeads(data.leads || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function toggleContacted(l) {
    const nextContacted = !l.lead_contacted_at;
    setTogglingId(l.id);
    try {
      const res = await fetch('/api/admin/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: l.id, contacted: nextContacted }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update');
      setLeads((prev) => prev.map((p) => p.id === l.id ? { ...p, lead_contacted_at: data.leadContactedAt } : p));
    } catch (e) {
      setError(e.message);
    } finally {
      setTogglingId('');
    }
  }

  const visibleLeads = useMemo(() => {
    const filtered = searchLeads(leads, search);
    return hideContacted ? filtered.filter((l) => !l.lead_contacted_at) : filtered;
  }, [leads, search, hideContacted]);

  if (loading) return <div className="sk" style={{ width: '100%', height: 200, borderRadius: 12 }} />;
  if (error) return <div className="error-box">⚠ {error}</div>;

  return (
    <div>
      <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 16 }}>
        {leads.length} user{leads.length === 1 ? '' : 's'} with at least one CAS upload, newest first.
        Contact details below come from the CAS statement itself, not the account's sign-up email.
      </p>

      {leads.length === 0 ? (
        <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>No CAS uploads yet.</p>
      ) : (
        <>
          <div className="admin-search-bar">
            <input
              className="admin-search-input"
              type="text"
              placeholder="Search by name, email or CAS contact…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.68rem', fontWeight: 700, color: 'var(--muted)', flexShrink: 0, cursor: 'pointer' }}>
              <input type="checkbox" checked={hideContacted} onChange={(e) => setHideContacted(e.target.checked)} />
              Hide contacted
            </label>
            <div className="admin-search-count">
              {visibleLeads.length} of {leads.length}
            </div>
          </div>

          {visibleLeads.length === 0 ? (
            <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>No leads match.</p>
          ) : (
            visibleLeads.map((l) => {
              const emailDiffers = l.cas_email && l.cas_email !== (l.email || '').toLowerCase();
              const contacted = Boolean(l.lead_contacted_at);
              return (
                <div key={l.id} className="admin-holding-card" style={contacted ? { opacity: 0.6 } : undefined}>
                  <div className="admin-holding-card-head">
                    <div>
                      <div className="admin-holding-card-name">{l.name || l.email}</div>
                      <div className="admin-holding-card-notes">{l.email}</div>
                    </div>
                    <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--muted)', flexShrink: 0 }}>
                      {l.upload_count} upload{l.upload_count === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="admin-holding-card-metrics">
                    <div>
                      <div className="admin-holding-metric-label">Last Upload</div>
                      <div className="admin-holding-metric-value">{formatDate(l.last_upload)}</div>
                    </div>
                    <div>
                      <div className="admin-holding-metric-label">CAS Mobile</div>
                      <div className="admin-holding-metric-value">{l.cas_mobile || '—'}</div>
                    </div>
                    {emailDiffers && (
                      <div>
                        <div className="admin-holding-metric-label">CAS Email</div>
                        <div className="admin-holding-metric-value">{l.cas_email}</div>
                      </div>
                    )}
                  </div>
                  <div className="admin-holding-card-actions">
                    <button
                      onClick={() => toggleContacted(l)}
                      disabled={togglingId === l.id}
                      style={{
                        fontSize: '.65rem', fontWeight: 700, border: '1.5px solid var(--border)',
                        borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
                        background: contacted ? 'var(--s2)' : 'transparent',
                        color: contacted ? 'var(--muted)' : 'var(--g2)',
                      }}
                    >
                      {contacted ? '✓ Contacted' : 'Mark contacted'}
                    </button>
                    <a
                      href={`/portfolio?userId=${l.id}&uname=${encodeURIComponent(l.name || l.email || '')}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--g2)', textDecoration: 'none' }}
                    >
                      View Dashboard →
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </>
      )}
    </div>
  );
}
