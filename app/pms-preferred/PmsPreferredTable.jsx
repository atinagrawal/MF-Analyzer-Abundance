'use client';
/**
 * app/pms-preferred/PmsPreferredTable.jsx
 *
 * The full preferred list as a sortable / category-filterable table. Free
 * for everyone (no tier gate) -- the only reason this is a client component
 * rather than server-rendered like the grid above it is the interactive
 * sort/filter state. Its initial render (default sort, no filter) IS
 * produced server-side by React, so the table content is in the page's HTML
 * for crawlers; the client only takes over for interaction.
 */

import { useState, useMemo } from 'react';

const SORT_COLUMNS = [
  { key: 'strategyName', label: 'Strategy', numeric: false },
  { key: 'providerName', label: 'Provider', numeric: false },
  { key: 'category', label: 'Category', numeric: false },
  { key: 'aumCr', label: 'AUM (₹ Cr)', numeric: true },
  { key: 'qualifyingPeriod', label: 'Quartile Period', numeric: false },
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

  const fmtAum = (n) =>
    n != null ? `₹${new Intl.NumberFormat('en-IN').format(n)} Cr` : '—';

  return (
    <section className="pmspref-table-section" aria-label="Sortable and filterable strategy table">
      <div className="pmspref-table-bar">
        <h2 className="pmspref-h2">Full List</h2>
        <label className="pmspref-filter">
          <span className="pmspref-visually-hidden">Filter by category</span>
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="">All categories ({strategies.length})</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
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
                    className={col.numeric ? 'pmspref-num' : undefined}
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      className={`pmspref-th-btn${active ? ' is-active' : ''}`}
                      onClick={() => onSort(col.key)}
                    >
                      {col.label}
                      <span className="pmspref-th-arrow" aria-hidden="true">
                        {active ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                      </span>
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
                <td className="pmspref-num">{fmtAum(s.aumCr)}</td>
                <td>{s.qualifyingPeriod ? `${s.qualifyingPeriod} · ${s.quartile}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
