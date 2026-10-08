/**
 * app/sifs/reports/performance/[category]/MonthlyHeatmap.jsx
 *
 * Server-rendered (no client interactivity needed -- chronological column
 * order is the only order that makes sense here) month-by-month returns
 * grid. Data: lib/sifReports.js's getSifMonthlyReturnsHeatmap().
 */

function fmtPct(n) {
  if (n == null) return '—';
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

// Scaled heatmap intensity, same formula as PerformanceTable.jsx's
// heatStyle -- magnitude capped at +/-15% so one outlier month doesn't
// wash out the rest of the grid.
function heatStyle(n) {
  if (n == null) return {};
  const capped = Math.max(-15, Math.min(15, n));
  const t = Math.abs(capped) / 15;
  const alpha = 0.14 + t * 0.5;
  return n >= 0
    ? { background: `rgba(102,187,106,${alpha.toFixed(2)})`, color: '#c8f5cc' }
    : { background: `rgba(239,83,80,${alpha.toFixed(2)})`, color: '#ffd6d4' };
}

// Paired with heatStyle's inline style -- see PerformanceTable.jsx's
// identical helper for why print needs this instead of the inline style.
function heatClass(n) {
  if (n == null) return '';
  return n >= 0 ? 'sifr-pos' : 'sifr-neg';
}

export default function MonthlyHeatmap({ months, schemes }) {
  if (!months.length || !schemes.length) return null;

  return (
    <div className="sifr-heatmap-section">
      <h2 className="sifr-section-title">Monthly Returns Heatmap</h2>
      <p className="sifr-section-sub">Last {months.length} complete months &middot; each cell is that single month&rsquo;s standalone return</p>
      <div className="sifr-perf-table-wrap">
        <table className="sifr-perf-table">
          <thead>
            <tr>
              <th>SIF</th>
              {months.map((m) => <th key={m.value}>{m.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {schemes.map((s) => (
              <tr key={s.schemeId}>
                <td className="sifr-perf-name" title={s.fullName}>{s.name}</td>
                {months.map((m) => (
                  <td key={m.value} className={`sifr-perf-num ${heatClass(s.returns[m.value])}`} style={heatStyle(s.returns[m.value])}>
                    {fmtPct(s.returns[m.value])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
