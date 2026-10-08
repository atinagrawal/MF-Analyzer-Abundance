'use client';

/**
 * app/sifs/reports/performance/[category]/PerformanceTable.jsx
 *
 * Client component: sortable, scaled-heatmap version of the category
 * performance table. Server-rendered page.jsx passes the full scheme
 * list as a prop; everything below is pure client-side interaction, so
 * the real data/HTML is still there for crawlers/SEO before hydration.
 *
 * Period columns (1M..10Y) only render once real data exists for them --
 * lib/sifReports.js's availableReturnPeriods(), same principle as
 * app/screener/ScreenerClient.jsx's pickDefaultSifReturnCols for the MF
 * screener. A brand-new category naturally shows just 1M/3M/6M/1Y today;
 * 3Y/5Y/7Y/10Y appear on their own as funds age into them. Since
 * Inception is always available once a scheme has any NAV history (it's
 * not a fixed trailing window), so it's a separate column appended after
 * the dynamic periods -- same reason Vol is handled this way already.
 *
 * Column visibility (activeCols) is a pure display toggle on top of the
 * already-available columns, same UX pattern as the MF screener's
 * "Columns:" bar (app/screener/ScreenerClient.jsx's scr-colbar).
 */

import { useMemo, useState } from 'react';

const STATIC_COLS = [
  { key: 'name', label: 'SIF', numeric: false },
  { key: 'nav', label: 'NAV', numeric: true },
];
const TRAILING_COLS = [
  { key: 'retInception', label: 'Since Incep.', numeric: true },
  { key: 'vol', label: 'Vol', numeric: true },
];

function fmtPct(n) {
  if (n == null) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(2)}%`;
}

// Scaled heatmap intensity (not flat two-tone) -- magnitude capped at
// +/-15% so one outlier scheme doesn't wash out every other cell, same
// approach as the downloadable image (lib/sifReportImages.js).
function heatStyle(n) {
  if (n == null) return {};
  const capped = Math.max(-15, Math.min(15, n));
  const t = Math.abs(capped) / 15;
  const alpha = 0.14 + t * 0.5;
  return n >= 0
    ? { background: `rgba(102,187,106,${alpha.toFixed(2)})`, color: '#c8f5cc' }
    : { background: `rgba(239,83,80,${alpha.toFixed(2)})`, color: '#ffd6d4' };
}

// Paired with heatStyle's inline style: print stylesheets can't target an
// exact rgba() value cleanly, so these sign-only classes give @media
// print something stable to restyle (dark text, no background fill)
// instead of trying to pattern-match the inline color.
function heatClass(n) {
  if (n == null) return '';
  return n >= 0 ? 'sifr-pos' : 'sifr-neg';
}

export default function PerformanceTable({ schemes, periods }) {
  const toggleable = useMemo(() => [...periods, ...TRAILING_COLS], [periods]);
  const [activeCols, setActiveCols] = useState(() => toggleable.map((c) => c.key));
  const cols = useMemo(
    () => [...STATIC_COLS, ...toggleable.filter((c) => activeCols.includes(c.key))],
    [toggleable, activeCols]
  );
  const [sortKey, setSortKey] = useState(periods.find((p) => p.key === 'ret1y')?.key || periods[periods.length - 1]?.key || 'name');
  const [sortDir, setSortDir] = useState('desc');

  function toggleCol(key) {
    setActiveCols((cur) => (cur.includes(key)
      ? (cur.length > 1 ? cur.filter((k) => k !== key) : cur)
      : [...cur, key]));
  }

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

  const dataCols = cols.filter((c) => c.key !== 'name' && c.key !== 'nav');

  return (
    <>
      <div className="sifr-colbar sifr-no-print">
        <span className="sifr-colbar-l">Columns:</span>
        {toggleable.map((c) => {
          const isOn = activeCols.includes(c.key);
          return (
            <button
              key={c.key}
              type="button"
              className={`sifr-colchip${isOn ? ' on' : ''}`}
              onClick={() => toggleCol(c.key)}
              title={`Toggle ${c.label} column`}
            >
              {c.label}
            </button>
          );
        })}
      </div>
      <div className="sifr-perf-table-wrap">
        <table className="sifr-perf-table">
          <thead>
            <tr>
              {cols.map((c) => (
                <th
                  key={c.key}
                  onClick={() => handleSort(c.key)}
                  className={`sifr-sortable${sortKey === c.key ? ' sorted' : ''}`}
                  aria-sort={sortKey === c.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  {c.label}
                  <span className="sifr-sort-arrow">{sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => (
              <tr key={s.schemeId}>
                <td className="sifr-perf-name" title={s.fullName}>
                  {i === 0 && sortDir === 'desc' && sortKey !== 'name' && sortKey !== 'nav' && (
                    <span className="sifr-rank-badge" title="Leading this metric">★</span>
                  )}
                  <a href={`/sif/${s.schemeId}`}>{s.name}</a>
                </td>
                <td className="sifr-perf-num">{s.nav != null ? s.nav.toFixed(2) : '—'}</td>
                {dataCols.map((c) => (
                  c.key === 'vol'
                    ? <td key="vol" className="sifr-perf-num sifr-perf-vol">{s.vol != null ? `${s.vol.toFixed(2)}%` : '—'}</td>
                    : <td key={c.key} className={`sifr-perf-num ${heatClass(s[c.key])}`} style={heatStyle(s[c.key])}>{fmtPct(s[c.key])}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
