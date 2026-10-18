'use client';

/**
 * app/admin/NfoPromoTab.jsx
 *
 * Admin control for the homepage NFO promo banner (components/NfoPromoBanner.jsx,
 * resolved server-side by app/page.js's getFeaturedNfoPromo()). Backed by
 * app/api/admin/nfo-promo (GET for the promotable list + current config,
 * POST to change it) and lib/nfoPromoConfig.js (R2-stored setting).
 *
 * Only open NFOs that already have a resolvable invest link are selectable
 * -- the banner's whole point is driving a real transaction, so there's
 * nothing useful to feature otherwise.
 */

import { useState, useEffect, useCallback } from 'react';

const MODES = [
  { key: 'auto',   label: 'Auto',   hint: 'Soonest-closing open NFO with an invest link' },
  { key: 'manual', label: 'Manual', hint: 'Always feature the NFO picked below' },
  { key: 'off',    label: 'Off',    hint: 'Never show the homepage banner' },
];

function formatDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function NfoPromoTab() {
  const [promotable, setPromotable] = useState([]);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/nfo-promo');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load');
      setPromotable(data.promotable || []);
      setConfig(data.config);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save(next) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/nfo-promo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      setConfig(data.config);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div style={{ padding: 24, color: 'var(--muted)', fontSize: '.8rem' }}>Loading…</div>;

  const effectivePick = config?.mode === 'manual'
    ? promotable.find((e) => e.slug === config.slug)
    : null;

  return (
    <div style={{ maxWidth: 720 }}>
      <p style={{ fontSize: '.78rem', color: 'var(--muted)', marginBottom: 16, lineHeight: 1.5 }}>
        Controls the dismissible NFO banner on the homepage. Only NFOs with a working direct-invest link
        can be featured. Changes take effect on the live site within a couple of minutes.
      </p>

      {error && (
        <div style={{ background: 'var(--neg-bg)', color: 'var(--neg)', border: '1px solid #ffcdd2', borderRadius: 8, padding: '8px 12px', fontSize: '.72rem', marginBottom: 14 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        {MODES.map((m) => (
          <button
            key={m.key}
            disabled={saving}
            onClick={() => save({ mode: m.key, slug: config?.slug })}
            title={m.hint}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: '.74rem', fontWeight: 700,
              fontFamily: 'Raleway, sans-serif', cursor: saving ? 'default' : 'pointer',
              border: `1.5px solid ${config?.mode === m.key ? 'var(--g1)' : 'var(--border)'}`,
              background: config?.mode === m.key ? 'var(--g1)' : 'var(--s2)',
              color: config?.mode === m.key ? '#fff' : 'var(--text2)',
            }}
          >
            {m.label}
          </button>
        ))}
      </div>

      {config?.mode !== 'off' && (
        <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginBottom: 14 }}>
          {config?.mode === 'manual'
            ? (effectivePick
                ? <>Featuring: <strong style={{ color: 'var(--text)' }}>{effectivePick.schemeName}</strong></>
                : <span style={{ color: 'var(--warn, #b26a00)' }}>Picked NFO is no longer open or lost its invest link -- showing Auto pick instead.</span>)
            : 'Showing the soonest-closing open NFO with an invest link.'}
          {config?.updatedAt && (
            <span> · Last changed {new Date(config.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}{config.updatedBy ? ` by ${config.updatedBy}` : ''}</span>
          )}
        </div>
      )}

      {promotable.length === 0 ? (
        <p style={{ fontSize: '.78rem', color: 'var(--muted)' }}>No open NFOs currently have a resolvable invest link.</p>
      ) : (
        promotable.map((e) => {
          const isPicked = config?.mode === 'manual' && config.slug === e.slug;
          return (
            <div
              key={e.slug}
              className="admin-holding-card"
              style={{ borderColor: isPicked ? 'var(--g1)' : undefined, cursor: saving ? 'default' : 'pointer' }}
              onClick={() => !saving && save({ mode: 'manual', slug: e.slug })}
            >
              <div className="admin-holding-card-head">
                <div>
                  <div className="admin-holding-card-name">{e.schemeName}</div>
                  <div className="admin-holding-card-notes">{e.amcName} · {e.category || e.schemeType}</div>
                </div>
                {isPicked && (
                  <span style={{ fontSize: '.6rem', fontWeight: 800, color: '#fff', background: 'var(--g1)', padding: '3px 8px', borderRadius: 20, flexShrink: 0 }}>
                    FEATURED
                  </span>
                )}
              </div>
              <div className="admin-holding-card-metrics">
                <div><div className="admin-holding-metric-label">Closes</div><div className="admin-holding-metric-value">{formatDate(e.closeDate)}</div></div>
                <div><div className="admin-holding-metric-label">Min Investment</div><div className="admin-holding-metric-value">{e.minInvestment != null ? `₹${e.minInvestment}` : '—'}</div></div>
              </div>
              <div className="admin-holding-card-actions">
                <span style={{ fontSize: '.65rem', fontWeight: 700, color: isPicked ? 'var(--g1)' : 'var(--g2)' }}>
                  {isPicked ? '✓ Currently featured' : 'Click to feature →'}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
