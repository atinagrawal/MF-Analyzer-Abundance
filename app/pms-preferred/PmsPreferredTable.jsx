'use client';
/**
 * app/pms-preferred/PmsPreferredTable.jsx
 *
 * The full preferred list as a sortable / category-filterable table. It's
 * free for everyone (no tier gate) -- the only reason this is a client
 * component rather than server-rendered like the grid above it is the
 * interactive sort/filter state. Its initial render (default sort, no
 * filter) IS produced server-side by React, so the table content is in the
 * page's HTML for crawlers; the client only takes over for interaction.
 */

import { useState, useMemo } from 'react';

const SORT_COLUMNS = [
  { key: 'strategyName', label: 'Strategy' },
  { key: 'providerName', label: 'Provider' },
  { key: 'category', label: 'Category' },
  { key: 'aumCr', label: 'AUM (₹ Cr)' },
  { key: 'qualifyingPeriod', label: 'Quartile Period' },
];

export default function PmsPreferredTable({ strategies }) {
  const [sortKey, setSortKey] = useState('aumCr');
  const [sortDir, setSortDir] = useState('desc');
  const [categoryFilter, setCategoryFilter] = useState('');

  const categories = useMemo(
    () => [...new Set(strategies.map((s) => s.category).filter(Boolean))].sort(),
    [strategies],
  );

  const rows = useMemo(() => {
    const filtered = categoryFilter ? strategies.filter((s) => s.category === categoryFilter) : strategies;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls always sort last, regardless of direction
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      return sortDir === 'asc'
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
  }, [strategies, categoryFilter, sortKey, sortDir]);

  const onSort = (key) => {
    if (sortKey === key) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  return (
    <section className="pmspref-table-section">
      <h2 className="pmspref-section-title">Sortable &amp; Filterable Table</h2>
      <div className="pmspref-table-controls">
        <label htmlFor="pmspref-category" className="pmspref-visually-hidden">Filter by category</label>
        <select
          id="pmspref-category"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All Categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="pmspref-table-wrap">
        <table className="pmspref-table">
          <thead>
            <tr>
              {SORT_COLUMNS.map((col) => {
                const active = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      className="pmspref-th-btn"
                      onClick={() => onSort(col.key)}
                    >
                      {col.label}{active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                    </button>
                  </th>
                );
              })}
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
