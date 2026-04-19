'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const CAT_LABELS = { 
  broad: 'Broad', 
  sectoral: 'Sectoral', 
  strategy: 'Strategy', 
  thematic: 'Thematic',
  hybrid: 'Hybrid',
};

function fmtRet(v) {
  if (v === null || v === undefined || isNaN(v)) return <span>—</span>;
  const cls = v > 0 ? 'ret-pos' : v < 0 ? 'ret-neg' : 'ret-neu';
  const txt = (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  return <span className={cls}>{txt}</span>;
}

function fmtNum(v, dp = 2) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return v.toFixed(dp);
}

function ordinal(n) {
  const v = n % 100;
  return n + (['th','st','nd','rd'][(v - 20) % 10] || ['th','st','nd','rd'][v] || 'th');
}

/* ── Riskometer SVG gauge ──────────────────────────────────────────────────
 * Renders the same semicircular meter as NSE's official riskometer image.
 * Score range: 1 (Low) – 7 (Very High) mapped to 0°–180° arc.
 * Colours match the NSE palette exactly.
 * No images, no extra requests — pure inline SVG.
 */
// Score range: 1 (Low) → 7 (Very High) per NSE riskometer methodology.
// Colour palette matches NSE's printed riskometer exactly.
// No fallback scores — the needle position is always the PDF-parsed riskScore value.
const RISK_CONFIG = {
  'Low':              { color: '#1b5e20', bg: '#e8f5e9', short: 'Low'      },
  'Low To Moderate':  { color: '#388e3c', bg: '#f1f8e9', short: 'Low–Mod'  },
  'Moderate':         { color: '#f57f17', bg: '#fffde7', short: 'Moderate' },
  'Moderately High':  { color: '#e65100', bg: '#fff3e0', short: 'Mod–High' },
  'High':             { color: '#c62828', bg: '#ffebee', short: 'High'     },
  'Very High':        { color: '#b71c1c', bg: '#ffebee', short: 'Very High'},
};

function RiskGauge({ label, score }) {
  if (!label || label === '—') {
    return <span className="risk-gauge-empty">—</span>;
  }

  const cfg = RISK_CONFIG[label] || { color: '#9e9e9e', bg: '#f5f5f5', short: label };
  // If score is unavailable (shouldn't happen after regex fix, but guard anyway)
  if (typeof score !== 'number') {
    return <span className="risk-gauge-empty" style={{ color: cfg.color }}>{cfg.short}</span>;
  }
  const actualScore = score;

  // Map score 1–7 → angle 0°–180° on a semicircle
  // 0° = left end (low risk), 180° = right end (very high risk)
  const pct = Math.min(1, Math.max(0, (actualScore - 1) / 6));
  const angleDeg = pct * 180;
  const angleRad = (angleDeg - 90) * (Math.PI / 180); // offset: 0° at left, 180° at right

  // Needle tip position on arc (r=26, cx=34, cy=34)
  const cx = 34, cy = 36, r = 26;
  const nx = cx + r * Math.cos((angleDeg - 180) * Math.PI / 180);
  const ny = cy + r * Math.sin((angleDeg - 180) * Math.PI / 180);

  // 6 arc segments (Low → Very High), each 30°
  const SEG_COLORS = ['#1b5e20','#388e3c','#f9a825','#f57f17','#e65100','#b71c1c'];
  const arcSegs = SEG_COLORS.map((c, i) => {
    const startAngle = (i * 30 - 180) * Math.PI / 180;
    const endAngle   = ((i + 1) * 30 - 180) * Math.PI / 180;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    return { x1, y1, x2, y2, color: c };
  });

  const scoreDisplay = typeof score === 'number' ? score.toFixed(2) : '';

  return (
    <div
      className="risk-gauge"
      title={`${label}${scoreDisplay ? ' · Score: ' + scoreDisplay : ''}`}
      style={{ '--gauge-color': cfg.color, '--gauge-bg': cfg.bg }}
    >
      <svg
        width="68" height="40"
        viewBox="0 0 68 40"
        aria-hidden="true"
        className="risk-gauge-svg"
      >
        {/* Arc segments */}
        {arcSegs.map((seg, i) => (
          <line
            key={i}
            x1={seg.x1} y1={seg.y1}
            x2={seg.x2} y2={seg.y2}
            stroke={seg.color}
            strokeWidth="8"
            strokeLinecap="butt"
          />
        ))}
        {/* White track behind for separation */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1"
        />
        {/* Needle */}
        <line
          x1={cx} y1={cy}
          x2={nx} y2={ny}
          stroke="#1a1a1a"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Needle pivot */}
        <circle cx={cx} cy={cy} r="2.5" fill="#1a1a1a" />
      </svg>
      <span className="risk-gauge-label" style={{ color: cfg.color }}>
        {cfg.short}
      </span>
    </div>
  );
}

export default function IndicesPage() {
  const [allData, setAllData] = useState([]);
  const [sortKey, setSortKey] = useState('r1y');
  const [sortDir, setSortDir] = useState(-1);
  const [catFilter, setCatFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState({ month: '', year: '', count: 0, asOf: '' });

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/index-dashboard');
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const data = await res.json();

        if (!data.indices?.length) throw new Error('No index data in response');

        setAllData(data.indices);
        setMetadata({ month: data.month, year: data.year, count: data.count, asOf: data.asOf || '' });
        setLoading(false);
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    }
    loadData();
  }, []);

  const sortTable = (key) => {
    if (sortKey === key) {
      setSortDir(sortDir * -1);
    } else {
      setSortKey(key);
      setSortDir(-1);
    }
  };

  const filterCat = (cat) => setCatFilter(cat);
  const handleSearch = (e) => setSearchFilter(e.target.value.trim());

  let rows = allData.slice();
  if (catFilter !== 'all') rows = rows.filter(r => r.cat === catFilter);
  if (searchFilter) {
    const q = searchFilter.toLowerCase();
    rows = rows.filter(r => r.name.toLowerCase().includes(q));
  }

  rows.sort((a, b) => {
    const kMap = {
      name: r => r.name,
      r1m:  r => r.returns.r1m,
      r3m:  r => r.returns.r3m,
      r1y:  r => r.returns.r1y,
      r3y:  r => r.returns.r3y,
      r5y:  r => r.returns.r5y,
      vol:  r => r.risk.vol,
      beta: r => r.risk.beta,
      pe:   r => r.val.pe,
      pb:   r => r.val.pb,
      dy:   r => r.val.dy,
      risk: r => r.riskScore ?? -1,
    };
    const fn = kMap[sortKey] || (r => r.name);
    const aV = fn(a), bV = fn(b);
    if (typeof aV === 'string') return sortDir * aV.localeCompare(bV);
    return sortDir * ((aV ?? -999) - (bV ?? -999));
  });

  const getSortClass = (key) => {
    if (sortKey !== key) return '';
    return sortDir === -1 ? 'sorted-desc' : 'sorted-asc';
  };

  return (
    <>
      <div className="container">
        <Navbar activePage="indices" />

        <div className="page-header">
          <div className="page-eyebrow">
            <div className="live-dot"></div>
            <span className="eyebrow-text">NSE Index Dashboard</span>
          </div>
          <h1 className="page-title">
            Index <span>Returns</span> & Valuation
          </h1>
          <p className="page-subtitle">
            {metadata.count > 0 
              ? (() => {
                  const day = metadata.asOf ? ordinal(parseInt(metadata.asOf.split('-')[2], 10)) : '';
                  const dateStr = day ? `${day} ${metadata.month} ${metadata.year}` : `${metadata.month} ${metadata.year}`;
                  return `${metadata.count} NSE indices as of ${dateStr} — returns, P/E, P/B, Beta, Volatility. Source: NSE Indices Limited (equity + hybrid)`;
                })()
              : 'Loading NSE index dashboard...'}
          </p>
        </div>

        <div id="controls" className="controls-bar" style={{ display: loading ? 'none' : 'flex' }}>
          <button className={`cat-btn ${catFilter === 'all'      ? 'active' : ''}`} onClick={() => filterCat('all')}>All</button>
          <button className={`cat-btn ${catFilter === 'broad'    ? 'active' : ''}`} onClick={() => filterCat('broad')}>Broad</button>
          <button className={`cat-btn ${catFilter === 'sectoral' ? 'active' : ''}`} onClick={() => filterCat('sectoral')}>Sectoral</button>
          <button className={`cat-btn ${catFilter === 'strategy' ? 'active' : ''}`} onClick={() => filterCat('strategy')}>Strategy</button>
          <button className={`cat-btn ${catFilter === 'thematic' ? 'active' : ''}`} onClick={() => filterCat('thematic')}>Thematic</button>
          <button className={`cat-btn ${catFilter === 'hybrid'   ? 'active' : ''}`} onClick={() => filterCat('hybrid')}>Hybrid</button>
          <input
            type="text"
            className="search-box"
            placeholder="Search indices..."
            onChange={handleSearch}
          />
          <div className="data-badge">
            {rows.length} of {allData.length} indices
          </div>
        </div>

        {loading && (
          <div id="skeleton" className="table-card">
            <div className="table-wrap">
              <table className="idx-table">
                <thead>
                  <tr>
                    <th className="idx-name-th">Index Name</th>
                    <th colSpan={5} className="th-group">TRI Returns</th>
                    <th colSpan={2} className="th-group">Risk</th>
                    <th colSpan={3} className="th-group">Valuation</th>
                    <th>Riskometer</th>
                    <th>Compare</th>
                  </tr>
                  <tr>
                    <th>Name</th>
                    <th>1M</th><th>3M</th><th>1Y</th><th>3Y</th><th>5Y</th>
                    <th>Vol</th><th>Beta</th>
                    <th>P/E</th><th>P/B</th><th>D.Y.</th>
                    <th>Score</th>
                    <th>Compare</th>
                  </tr>
                </thead>
                <tbody>
                  {[...Array(8)].map((_, i) => (
                    <tr key={i}>
                      <td><div className="sk" style={{ width: '180px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '50px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '50px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '50px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '50px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '50px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '40px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '40px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '40px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '40px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '40px', height: '14px' }}></div></td>
                      <td><div className="sk" style={{ width: '68px', height: '40px' }}></div></td>
                      <td><div className="sk" style={{ width: '80px', height: '14px' }}></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {error && (
          <div id="errorBox" style={{ 
            padding: '20px', 
            background: 'var(--neg-bg)', 
            border: '1.5px solid var(--neg)', 
            borderRadius: 'var(--r)', 
            color: 'var(--neg)', 
            fontWeight: 600 
          }}>
            ⚠ Could not load index data: {error}. Please try again in a moment.
          </div>
        )}

        {!loading && !error && (
          <div id="tableCard" className="table-card">
            <div className="table-wrap">
              <table className="idx-table">
                <thead>
                  <tr>
                    <th rowSpan={2} className={`idx-name-th ${getSortClass('name')}`} onClick={() => sortTable('name')}>
                      Index Name
                    </th>
                    <th colSpan={5} className="th-group">TRI Returns</th>
                    <th colSpan={2} className="th-group">Risk</th>
                    <th colSpan={3} className="th-group">Valuation</th>
                    <th rowSpan={2} className={getSortClass('risk')} onClick={() => sortTable('risk')}>Riskometer</th>
                    <th rowSpan={2}>Compare</th>
                  </tr>
                  <tr>
                    <th className={getSortClass('r1m')} onClick={() => sortTable('r1m')}>1M</th>
                    <th className={getSortClass('r3m')} onClick={() => sortTable('r3m')}>3M</th>
                    <th className={getSortClass('r1y')} onClick={() => sortTable('r1y')}>1Y</th>
                    <th className={getSortClass('r3y')} onClick={() => sortTable('r3y')}>3Y</th>
                    <th className={getSortClass('r5y')} onClick={() => sortTable('r5y')}>5Y</th>
                    <th className={getSortClass('vol')} onClick={() => sortTable('vol')}>Vol</th>
                    <th className={getSortClass('beta')} onClick={() => sortTable('beta')}>Beta</th>
                    <th className={getSortClass('pe')} onClick={() => sortTable('pe')}>P/E</th>
                    <th className={getSortClass('pb')} onClick={() => sortTable('pb')}>P/B</th>
                    <th className={getSortClass('dy')} onClick={() => sortTable('dy')}>D.Y.</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const encodedName = encodeURIComponent(r.name);
                    const rollUrl = `/rolling?bench=${encodedName}`;

                    return (
                      <tr key={i} data-cat={r.cat}>
                        <td>
                          {r.name}
                          <span className={`cat-pill cat-${r.cat}`}>
                            {CAT_LABELS[r.cat] || r.cat}
                          </span>
                        </td>
                        <td className="td-divider">{fmtRet(r.returns.r1m)}</td>
                        <td>{fmtRet(r.returns.r3m)}</td>
                        <td>{fmtRet(r.returns.r1y)}</td>
                        <td>{fmtRet(r.returns.r3y)}</td>
                        <td>{fmtRet(r.returns.r5y)}</td>
                        <td className="td-divider">{fmtNum(r.risk.vol)}</td>
                        <td>{fmtNum(r.risk.beta)}</td>
                        <td className="td-divider">{fmtNum(r.val.pe)}</td>
                        <td>{fmtNum(r.val.pb)}</td>
                        <td>{fmtNum(r.val.dy)}</td>
                        <td className="td-gauge">
                          <RiskGauge label={r.riskLabel} score={r.riskScore} />
                        </td>
                        <td>
                          <a className="roll-btn" href={rollUrl} title={`Compare vs ${r.name} on Rolling Returns`}>
                            📉 Compare
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="src-text">
              Data: NSE Indices · {metadata.month} {metadata.year} · TRI basis · {metadata.count} indices
            </div>
          </div>
        )}
      </div>

      <Footer />
    </>
  );
}
