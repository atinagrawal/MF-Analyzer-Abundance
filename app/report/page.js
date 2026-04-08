'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

function fmtCr(val) {
  if (!val) return '₹0';
  const cr = val / 100000;
  return cr >= 1000 ? `₹${(cr / 1000).toFixed(2)}L Cr` : `₹${cr.toFixed(0)} Cr`;
}

export default function ReportPage() {
  const [industryData, setIndustryData] = useState(null);
  const [stateData, setStateData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortColumn, setSortColumn] = useState('aum');
  const [sortDesc, setSortDesc] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData(date) {
    try {
      setLoading(true);
      const [indRes, stateRes] = await Promise.all([
        fetch(`/api/amfi-industry${date ? `?date=${date}` : ''}`),
        fetch(`/api/amfi-statewise${date ? `?date=${date}` : ''}`)
      ]);

      if (!indRes.ok) throw new Error(`Industry API error: ${indRes.status}`);
      if (!stateRes.ok) throw new Error(`State API error: ${stateRes.ok}`);

      const ind = await indRes.json();
      const state = await stateRes.json();

      setIndustryData(ind);
      setStateData(state);
      setLoading(false);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  function handleMonthChange(e) {
    const date = e.target.value;
    if (date) loadData(date);
  }

  function handleSort(col) {
    if (sortColumn === col) {
      setSortDesc(!sortDesc);
    } else {
      setSortColumn(col);
      setSortDesc(true);
    }
  }

  if (loading) {
    return (
      <>
        <div className="container">
          <Navbar activePage="report" />
          <div className="page-header">
            <div className="page-eyebrow">
              <div className="live-dot"></div>
              <span className="eyebrow-text">AMFI Official Data · Monthly</span>
            </div>
            <h1 className="page-title">
              India MF Industry <span>Report Card</span>
            </h1>
            <p className="page-subtitle">Loading data...</p>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  if (error) {
    return (
      <>
        <div className="container">
          <Navbar activePage="report" />
          <div className="page-header">
            <div className="page-eyebrow">
              <div className="live-dot"></div>
              <span className="eyebrow-text">AMFI Official Data · Monthly</span>
            </div>
            <h1 className="page-title">
              India MF Industry <span>Report Card</span>
            </h1>
            <p className="page-subtitle" style={{ color: 'var(--neg)' }}>⚠ Error: {error}</p>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  const categories = industryData.categories || [];
  
  const filteredCategories = categories
    .filter(c => {
      if (typeFilter === 'all') return true;
      return c.type === typeFilter;
    })
    .sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];
      if (sortColumn === 'label') {
        return sortDesc ? bVal.localeCompare(aVal) : aVal.localeCompare(bVal);
      }
      aVal = parseFloat(aVal) || 0;
      bVal = parseFloat(bVal) || 0;
      return sortDesc ? bVal - aVal : aVal - bVal;
    });

  const totalAUM = industryData.totalAUM || 0;
  const equityAUM = categories.filter(c => c.type === 'equity').reduce((sum, c) => sum + (c.aum || 0), 0);
  const debtAUM = categories.filter(c => c.type === 'debt').reduce((sum, c) => sum + (c.aum || 0), 0);
  const hybridAUM = categories.filter(c => c.type === 'hybrid').reduce((sum, c) => sum + (c.aum || 0), 0);
  const passiveAUM = categories.filter(c => c.type === 'passive').reduce((sum, c) => sum + (c.aum || 0), 0);

  const topInflowsCategories = [...categories]
    .filter(c => c.netFlow > 0 && c.type !== 'debt' && !c.label.toLowerCase().includes('liquid'))
    .sort((a, b) => b.netFlow - a.netFlow)
    .slice(0, 7);

  return (
    <>
      <div className="container">
        <Navbar activePage="report" />

        <div className="page-header">
          <div className="page-eyebrow">
            <div className="live-dot"></div>
            <span className="eyebrow-text">AMFI Official Data · Monthly</span>
          </div>
          <h1 className="page-title">
            India MF Industry <span>Report Card</span>
          </h1>
          <p className="page-subtitle">
            One-click shareable monthly snapshot — {industryData.date}
          </p>
        </div>

        {industryData.availableMonths && industryData.availableMonths.length > 0 && (
          <div className="controls-bar">
            <select 
              className="month-select"
              onChange={handleMonthChange}
              defaultValue={industryData.date}
            >
              {industryData.availableMonths.map(m => {
                const [mon, yr] = m.split('-');
                const dStr = `01-${mon.slice(0, 3).toLowerCase()}-${yr}`;
                return (
                  <option key={m} value={dStr}>
                    {mon} {yr}
                  </option>
                );
              })}
            </select>
            <span className="data-note">Source: AMFI · {industryData.date}</span>
          </div>
        )}

        <div className="report-stats">
          <div className="stat-card stat-card-highlight">
            <div className="stat-val">{fmtCr(totalAUM)}</div>
            <div className="stat-label">Total Industry AUM</div>
            <div className="stat-sub">{industryData.date}</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{fmtCr(equityAUM)}</div>
            <div className="stat-label">Equity</div>
            <div className="stat-sub">{((equityAUM / totalAUM) * 100).toFixed(1)}% of total</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{fmtCr(debtAUM)}</div>
            <div className="stat-label">Debt</div>
            <div className="stat-sub">{((debtAUM / totalAUM) * 100).toFixed(1)}% of total</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{fmtCr(hybridAUM)}</div>
            <div className="stat-label">Hybrid</div>
            <div className="stat-sub">{((hybridAUM / totalAUM) * 100).toFixed(1)}% of total</div>
          </div>
          <div className="stat-card">
            <div className="stat-val">{fmtCr(passiveAUM)}</div>
            <div className="stat-label">Passive</div>
            <div className="stat-sub">{((passiveAUM / totalAUM) * 100).toFixed(1)}% of total</div>
          </div>
        </div>

        {topInflowsCategories.length > 0 && (
          <div className="section">
            <div className="section-head">
              <h2 className="section-title">📈 Top Net Inflows</h2>
              <div className="section-badge">Top 7 categories</div>
            </div>
            <div className="inflows-grid">
              {topInflowsCategories.map((cat, i) => (
                <div key={i} className="inflow-card">
                  <div className="inflow-rank">#{i + 1}</div>
                  <div className="inflow-name">{cat.label}</div>
                  <div className="inflow-val">{fmtCr(cat.netFlow)}</div>
                  <div className="inflow-type">{cat.type}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="section">
          <div className="section-head">
            <h2 className="section-title">📂 Category Breakdown</h2>
            <div className="type-filters">
              <button 
                className={`type-btn ${typeFilter === 'all' ? 'active' : ''}`}
                onClick={() => setTypeFilter('all')}
              >
                All
              </button>
              <button 
                className={`type-btn ${typeFilter === 'equity' ? 'active' : ''}`}
                onClick={() => setTypeFilter('equity')}
              >
                Equity
              </button>
              <button 
                className={`type-btn ${typeFilter === 'debt' ? 'active' : ''}`}
                onClick={() => setTypeFilter('debt')}
              >
                Debt
              </button>
              <button 
                className={`type-btn ${typeFilter === 'hybrid' ? 'active' : ''}`}
                onClick={() => setTypeFilter('hybrid')}
              >
                Hybrid
              </button>
              <button 
                className={`type-btn ${typeFilter === 'passive' ? 'active' : ''}`}
                onClick={() => setTypeFilter('passive')}
              >
                Passive
              </button>
              <button 
                className={`type-btn ${typeFilter === 'solution' ? 'active' : ''}`}
                onClick={() => setTypeFilter('solution')}
              >
                Solution
              </button>
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('label')} style={{ cursor: 'pointer' }}>
                    Category {sortColumn === 'label' && (sortDesc ? '↓' : '↑')}
                  </th>
                  <th onClick={() => handleSort('type')} style={{ cursor: 'pointer' }}>
                    Type {sortColumn === 'type' && (sortDesc ? '↓' : '↑')}
                  </th>
                  <th onClick={() => handleSort('aum')} style={{ cursor: 'pointer' }}>
                    AUM {sortColumn === 'aum' && (sortDesc ? '↓' : '↑')}
                  </th>
                  <th onClick={() => handleSort('netFlow')} style={{ cursor: 'pointer' }}>
                    Net Flow {sortColumn === 'netFlow' && (sortDesc ? '↓' : '↑')}
                  </th>
                  <th onClick={() => handleSort('folios')} style={{ cursor: 'pointer' }}>
                    Folios {sortColumn === 'folios' && (sortDesc ? '↓' : '↑')}
                  </th>
                  <th onClick={() => handleSort('schemes')} style={{ cursor: 'pointer' }}>
                    Schemes {sortColumn === 'schemes' && (sortDesc ? '↓' : '↑')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredCategories.map((cat, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: 'left' }}>{cat.label}</td>
                    <td>{cat.type}</td>
                    <td>{fmtCr(cat.aum)}</td>
                    <td className={cat.netFlow >= 0 ? 'positive' : 'negative'}>
                      {fmtCr(Math.abs(cat.netFlow))}
                    </td>
                    <td>{(cat.folios / 100000).toFixed(2)}L</td>
                    <td>{cat.schemes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
