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

export default function IndicesPage() {
  const [allData, setAllData] = useState([]);
  const [sortKey, setSortKey] = useState('r1y');
  const [sortDir, setSortDir] = useState(-1);
  const [catFilter, setCatFilter] = useState('all');
  const [searchFilter, setSearchFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [metadata, setMetadata] = useState({ month: '', year: '', count: 0 });

  useEffect(() => {
    async function loadData() {
      try {
        const res = await fetch('/api/index-dashboard');
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const data = await res.json();

        if (!data.indices?.length) throw new Error('No index data in response');

        setAllData(data.indices);
        setMetadata({ month: data.month, year: data.year, count: data.count });
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

  const filterCat = (cat) => {
    setCatFilter(cat);
  };

  const handleSearch = (e) => {
    setSearchFilter(e.target.value.trim());
  };

  // Apply filters and sorting
  let rows = allData.slice();

  // Category filter
  if (catFilter !== 'all') {
    rows = rows.filter(r => r.cat === catFilter);
  }

  // Search filter
  if (searchFilter) {
    const q = searchFilter.toLowerCase();
    rows = rows.filter(r => r.name.toLowerCase().includes(q));
  }

  // Sort
  rows.sort((a, b) => {
    const kMap = {
      name: r => r.name,
      r1m: r => r.returns.r1m,
      r3m: r => r.returns.r3m,
      r1y: r => r.returns.r1y,
      r3y: r => r.returns.r3y,
      r5y: r => r.returns.r5y,
      vol: r => r.risk.vol,
      beta: r => r.risk.beta,
      pe: r => r.val.pe,
      pb: r => r.val.pb,
      dy: r => r.val.dy,
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
              ? `${metadata.count} NSE indices as of ${metadata.month} ${metadata.year} — returns, P/E, P/B, Beta, Volatility. Source: NSE Indices Limited (equity + hybrid)`
              : 'Loading NSE index dashboard...'}
          </p>
        </div>

        <div id="controls" className="controls-bar" style={{ display: loading ? 'none' : 'flex' }}>
          <button className={`cat-btn ${catFilter === 'all' ? 'active' : ''}`} onClick={() => filterCat('all')}>
            All
          </button>
          <button className={`cat-btn ${catFilter === 'broad' ? 'active' : ''}`} onClick={() => filterCat('broad')}>
            Broad
          </button>
          <button className={`cat-btn ${catFilter === 'sectoral' ? 'active' : ''}`} onClick={() => filterCat('sectoral')}>
            Sectoral
          </button>
          <button className={`cat-btn ${catFilter === 'strategy' ? 'active' : ''}`} onClick={() => filterCat('strategy')}>
            Strategy
          </button>
          <button className={`cat-btn ${catFilter === 'thematic' ? 'active' : ''}`} onClick={() => filterCat('thematic')}>
            Thematic
          </button>
          <button className={`cat-btn ${catFilter === 'hybrid' ? 'active' : ''}`} onClick={() => filterCat('hybrid')}>
            Hybrid
          </button>
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
                    <th>Index Name</th>
                    <th colSpan={5} className="th-group">TRI Returns</th>
                    <th colSpan={2} className="th-group">Risk</th>
                    <th colSpan={3} className="th-group">Valuation</th>
                    <th>Risk</th>
                    <th></th>
                  </tr>
                  <tr>
                    <th>Name</th>
                    <th>1M</th><th>3M</th><th>1Y</th><th>3Y</th><th>5Y</th>
                    <th>Vol</th><th>Beta</th>
                    <th>P/E</th><th>P/B</th><th>D.Y.</th>
                    <th>Score</th>
                    <th></th>
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
                      <td><div className="sk" style={{ width: '60px', height: '14px' }}></div></td>
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
                    <th rowSpan={2} className={getSortClass('name')} onClick={() => sortTable('name')}>
                      Index Name
                    </th>
                    <th colSpan={5} className="th-group">TRI Returns</th>
                    <th colSpan={2} className="th-group">Risk</th>
                    <th colSpan={3} className="th-group">Valuation</th>
                    <th rowSpan={2}>Risk</th>
                    <th rowSpan={2}></th>
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
                    const riskLabel = r.riskLabel || '—';
                    const riskScore = r.riskScore != null ? r.riskScore.toFixed(2) : '—';
                    const riskCls = riskLabel === '—' ? 'risk-n'
                      : riskLabel === 'Very High' ? 'risk-vh' 
                      : riskLabel === 'High' ? 'risk-h' 
                      : riskLabel.includes('Moderate') ? 'risk-m' 
                      : 'risk-l';

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
                        <td>
                          <span className={`risk-badge ${riskCls}`} title={`Score: ${riskScore}`}>
                            {riskLabel}
                          </span>
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
