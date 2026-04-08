'use client';

import { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

function fmtCr(val) {
  if (!val) return '₹0';
  const cr = val / 100000;
  return cr >= 1000 ? `₹${(cr / 1000).toFixed(2)}L Cr` : `₹${cr.toFixed(0)} Cr`;
}

export default function IndustryPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData(date) {
    try {
      setLoading(true);
      const res = await fetch(`/api/amfi-industry${date ? `?date=${date}` : ''}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      setData(json);
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

  if (loading) {
    return (
      <>
        <div className="container">
          <Navbar activePage="industry" />
          <div className="page-header">
            <div className="page-eyebrow">
              <div className="live-dot"></div>
              <span className="eyebrow-text">Industry Trends · Monthly</span>
            </div>
            <h1 className="page-title">
              MF Industry <span>Pulse</span>
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
          <Navbar activePage="industry" />
          <div className="page-header">
            <div className="page-eyebrow">
              <div className="live-dot"></div>
              <span className="eyebrow-text">Industry Trends · Monthly</span>
            </div>
            <h1 className="page-title">
              MF Industry <span>Pulse</span>
            </h1>
            <p className="page-subtitle" style={{ color: 'var(--neg)' }}>⚠ Error: {error}</p>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  const categories = data.categories
    ? Object.values(data.categories)
    : [];
  const filteredCategories = categories.filter(c => {
    if (typeFilter === 'all') return true;
    return c.type === typeFilter;
  });

  const totalAUM = data.summary?.totalAum || 0;
  const totalNetFlow = data.summary?.totalNetFlow || 0;
  const positiveFlowCount = categories.filter(c => c.netFlow > 0).length;

  return (
    <>
      <div className="container">
        <Navbar activePage="industry" />

        <div className="page-header">
          <div className="page-eyebrow">
            <div className="live-dot"></div>
            <span className="eyebrow-text">Industry Trends · Monthly</span>
          </div>
          <h1 className="page-title">
            MF Industry <span>Pulse</span>
          </h1>
          <p className="page-subtitle">
            Track category-wise trends across all 39 AMFI fund categories
          </p>
        </div>

        {data.availableMonths && data.availableMonths.length > 0 && (
          <div className="controls-bar">
            <select
              className="month-select"
              onChange={handleMonthChange}
              defaultValue={data.date}
            >
              {data.availableMonths.map(m => {
                const [mon, yr] = m.split('-');
                const dStr = `01-${mon.slice(0, 3).toLowerCase()}-${yr}`;
                return (
                  <option key={m} value={dStr}>
                    {mon} {yr}
                  </option>
                );
              })}
            </select>
            <span className="data-note">Source: AMFI · {data.date}</span>
          </div>
        )}

        <div className="stat-chips">
          <div className="stat-chip highlight">
            <div className="chip-val">{fmtCr(totalAUM)}</div>
            <div className="chip-label">Total Industry AUM</div>
            <div className="chip-sub">{data.date}</div>
          </div>
          <div className="stat-chip">
            <div className="chip-val">{fmtCr(totalNetFlow)}</div>
            <div className="chip-label">Total Net Flow</div>
            <div className="chip-sub">All categories</div>
          </div>
          <div className="stat-chip">
            <div className="chip-val">{positiveFlowCount}/{categories.length}</div>
            <div className="chip-label">Positive Flows</div>
            <div className="chip-sub">Categories with inflows</div>
          </div>
        </div>

        <div className="section">
          <div className="section-head">
            <h2 className="section-title">Category Analysis</h2>
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
            </div>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Type</th>
                  <th>AUM</th>
                  <th>Net Flow</th>
                  <th>Folios</th>
                  <th>Schemes</th>
                </tr>
              </thead>
              <tbody>
                {filteredCategories.map((cat, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: 'left' }}>{cat.label}</td>
                    <td>{cat.type}</td>
                    <td>{fmtCr(cat.aum)}</td>
                    <td className={cat.netFlow >= 0 ? 'positive' : 'negative'}>
                      {cat.netFlow >= 0 ? '+' : '−'}{fmtCr(Math.abs(cat.netFlow))}
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