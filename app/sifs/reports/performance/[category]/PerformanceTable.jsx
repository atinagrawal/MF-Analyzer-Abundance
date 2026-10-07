'use client';

/**
 * app/sifs/reports/performance/[category]/PerformanceTable.jsx
 *
 * Client component: sortable, scaled-heatmap version of the category
 * performance table. Server-rendered page.jsx passes the full scheme
 * list as a prop; everything below is pure client-side interaction, so
 * the real data/HTML is still there for crawlers/SEO before hydration.
 */

import { useMemo, useState } from 'react';

const COLS = [
  { key: 'name', label: 'SIF', numeric: false },
  { key: 'nav', label: 'NAV', numeric: true },
  { key: 'ret1m', label: '1M', numeric: true },
  { key: 'ret3m', label: '3M', numeric: true },
  { key: 'ret6m', label: '6M', numeric: true },
  { key: 'ret1y', label: '1Y', numeric: true },
  { key: 'ret3y', label: '3Y (Ann.)', numeric: true },
  { key: 'vol', label: 'Vol', numeric: true },
];

function fmtPct(n) {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

// Scaled heatmap intensity (not flat two-tone) -- magnitude capped at
// +/-15% so one outlier scheme doesn't wash out every other cell, same
// approach as the downloadable image (app/api/og-sif-performance).
function heatStyle(n) {
  if (n == null) return {};
  const capped = Math.max(-15, Math.min(15, n));
  const t = Math.abs(capped) / 15;
  const alpha = 0.1 + t * 0.5;
  return n >= 0
    ? { background: `rgba(27,94,32,${alpha.toFixed(2)})`, color: 'var(--g1)' }
    : { background: `rgba(183,28,28,${alpha.toFixed(2)})`, color: 'var(--neg)' };
}

export default function PerformanceTable({ schemes }) {
  const [sortKey, setSortKey] = useState('ret1y');
  const [sortDir, setSortDir] = useState('desc');

  const sorted = useMemo(() => {
    const copy = [...schemes];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; // nulls always last, regardless of direction
      if (bv == null) return -1;
      if (typeof av === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return copy;
  }, [schemes, sortKey, sortDir]);

  function handleSort(key) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc'); // numeric columns default to "best first"
    }
  }

  return (
    <div className="sifr-perf-table-wrap">
      <table className="sifr-perf-table">
        <thead>
          <tr>
            {COLS.map((c) => (
              <th
                key={c.key}
                onClick={() => handleSort(c.key)}
                className={`sifr-sortable${sortKey === c.key ? ' sorted' : ''}`}
                aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
              >
                {c.label}
                {sortKey === c.key && <span className="sifr-sort-arrow">{sortDir === 'asc' ? ' ▲' : ' ▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <tr key={s.schemeId}>
              <td title={s.fullName}>{s.name}</td>
              <td>{s.nav != null ? s.nav.toFixed(2) : '—'}</td>
              <td style={heatStyle(s.ret1m)}>{fmtPct(s.ret1m)}</td>
              <td style={heatStyle(s.ret3m)}>{fmtPct(s.ret3m)}</td>
              <td style={heatStyle(s.ret6m)}>{fmtPct(s.ret6m)}</td>
              <td style={heatStyle(s.ret1y)}>{fmtPct(s.ret1y)}</td>
              <td style={heatStyle(s.ret3y)}>{fmtPct(s.ret3y)}</td>
              <td>{s.vol != null ? `${s.vol.toFixed(2)}%` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
