'use client';
/**
 * app/pms-preferred/PmsPreferredTable.jsx
 *
 * The ONLY client-rendered piece of /pms-preferred -- everything else on
 * the page (the free grid + insights) is server-rendered directly in
 * page.jsx for SEO (crawlers see real HTML with zero client JS needed).
 * This component exists purely to gate the sortable/filterable table
 * behind Pro: it checks /api/pms-preferred for isPro on mount and renders
 * nothing at all for non-Pro visitors (including crawlers, which never
 * run this effect) -- deliberately NOT server-rendered, since it's the
 * one piece of this page that's genuinely tier-gated.
 */

import { useState, useEffect, useMemo } from 'react';

const SORT_COLUMNS = [
  { key: 'strategyName', label: 'Strategy' },
  { key: 'providerName', label: 'Provider' },
  { key: 'category', label: 'Category' },
  { key: 'aumCr', label: 'AUM (₹ Cr)' },
  { key: 'qualifyingPeriod', label: 'Quartile Period' },
];

export default function PmsPreferredTable({ strategies }) {
  const [isPro, setIsPro] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [sortKey, setSortKey] = useState('aumCr');
  const [sortDir, setSortDir] = useState('desc');
  const [categoryFilter, setCategoryFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/pms-preferred')
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setIsPro(Boolean(data?.isPro)); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, []);

  const categories = useMemo(() => [...new Set(strategies.map((s) => s.category))].sort(), [strategies]);

  const rows = useMemo(() => {
    let filtered = categoryFilter ? strategies.filter((s) => s.category === categoryFilter) : strategies;
    const sorted = [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return sorted;
  }, [strategies, categoryFilter, sortKey, sortDir]);

  if (!loaded) return null; // avoid a flash of the upsell before we know

  if (!isPro) {
    return (
      <section className="pmspref-table-section pmspref-table-locked">
        <h2 className="pmspref-section-title">Sortable & Filterable Table</h2>
        <p className="pmspref-locked-msg">
          Sort and filter the full preferred list by AUM, category and quartile period with{' '}
          <a href="/pricing">Abundance Pro</a>.
        </p>
      </section>
    );
  }

  return (
    <section className="pmspref-table-section">
      <h2 className="pmspref-section-title">Sortable & Filterable Table</h2>
      <div className="pmspref-table-controls">
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="pmspref-table-wrap">
        <table className="pmspref-table">
          <thead>
            <tr>
              {SORT_COLUMNS.map((col) => (
                <th key={col.key} onClick={() => {
                  if (sortKey === col.key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
                  else { setSortKey(col.key); setSortDir('desc'); }
                }}>
                  {col.label}{sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.iaid}>
                <td><a href={`/pms/${s.iaid}`}>{s.strategyName}</a></td>
                <td>{s.providerName}</td>
                <td>{s.category}</td>
                <td>{s.aumCr != null ? `₹${s.aumCr} Cr` : '—'}</td>
                <td>{s.qualifyingPeriod ? `${s.qualifyingPeriod} · ${s.quartile}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
