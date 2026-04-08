'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

function fmtCr(val) {
  if (!val && val !== 0) return '—';
  if (val >= 100000) return '₹' + (val / 100000).toFixed(2) + 'L Cr';
  if (val >= 1000) return '₹' + (val / 1000).toFixed(2) + 'K Cr';
  return '₹' + val.toFixed(2) + ' Cr';
}

function fmtFlow(val) {
  if (!val && val !== 0) return '—';
  const abs = Math.abs(val);
  let str = abs >= 100000 ? (abs / 100000).toFixed(2) + 'L' :
    abs >= 1000 ? (abs / 1000).toFixed(2) + 'K' :
      abs.toFixed(2);
  return (val < 0 ? '−' : '+') + '₹' + str + ' Cr';
}

function fmtFolios(val) {
  if (!val && val !== 0) return '—';
  if (val >= 10000000) return (val / 10000000).toFixed(2) + ' Cr';
  if (val >= 100000) return (val / 100000).toFixed(2) + ' L';
  return val.toLocaleString('en-IN');
}

export default function IndustryPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortCol, setSortCol] = useState('netFlow');
  const [sortDir, setSortDir] = useState(-1);
  const flowChartRef = useRef(null);
  const flowChartInstance = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (data && typeof window !== 'undefined' && window.Chart) {
      renderFlowChart();
    }
    return () => {
      if (flowChartInstance.current) {
        flowChartInstance.current.destroy();
        flowChartInstance.current = null;
      }
    };
  }, [data]);

  async function loadData() {
    try {
      setLoading(true);
      const res = await fetch('/api/amfi-industry');
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = await res.json();
      setData(json);
      setLoading(false);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  function renderFlowChart() {
    if (!flowChartRef.current || !window.Chart) return;

    if (flowChartInstance.current) {
      flowChartInstance.current.destroy();
    }

    const ctx = flowChartRef.current.getContext('2d');
    const cats = Object.values(data.categories || {});

    const flows = { equity: 0, debt: 0, hybrid: 0, passive: 0, solution: 0 };
    cats.forEach(c => {
      if (flows[c.type] !== undefined) flows[c.type] += (c.netFlow || 0);
    });

    const labels = ['Equity', 'Debt', 'Hybrid', 'Passive', 'Solution'];
    const vals = [flows.equity, flows.debt, flows.hybrid, flows.passive, flows.solution];
    const colors = vals.map(v => v >= 0 ? 'rgba(27,94,32,.82)' : 'rgba(183,28,28,.72)');

    flowChartInstance.current = new window.Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          data: vals,
          backgroundColor: colors,
          borderRadius: 7,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 900, easing: 'easeInOutQuart' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#162616',
            bodyFont: { family: 'JetBrains Mono', size: 11 },
            padding: 10,
            cornerRadius: 7,
            callbacks: {
              label: c => ' Net Flow: ' + fmtFlow(c.raw)
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { family: 'Raleway', size: 12 }, color: '#2e4d2e' }
          },
          y: {
            grid: { color: 'rgba(0,0,0,.05)' },
            ticks: {
              font: { family: 'JetBrains Mono', size: 10 },
              callback: v => v >= 0 ? '+₹' + Math.round(v / 100) + 'K Cr' : '−₹' + Math.round(-v / 100) + 'K Cr'
            }
          }
        }
      }
    });
  }

  function handleSort(col) {
    if (sortCol === col) {
      setSortDir(sortDir * -1);
    } else {
      setSortCol(col);
      setSortDir(-1);
    }
  }

  if (loading) {
    return (
      <>
        <div className="container">
          <Navbar activePage="industry" />
          <div className="page-header">
            <div className="page-eyebrow">
              <div className="live-dot"></div>
              <span className="page-eyebrow-text">Industry Trends · Monthly</span>
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
              <span className="page-eyebrow-text">Industry Trends · Monthly</span>
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

  const s = data.summary || {};
  const gt = data.grandTotal || {};
  const cats = data.categories || {};

  const catFolios = Object.values(cats).reduce((sum, c) => sum + (c.folios || 0), 0);
  const totalFolios = s.totalFolios > 0 ? s.totalFolios : (gt.folios > 0 ? gt.folios : catFolios);
  const industryAAUM = gt.avgAum || 0;

  // AUM breakdown segments
  const total = s.totalAum || 1;
  const aumSegs = [
    { label: 'Equity', val: s.equityAum, color: '#1565c0', pct: ((s.equityAum || 0) / total * 100).toFixed(1) },
    { label: 'Debt', val: s.debtAum, color: '#880e4f', pct: ((s.debtAum || 0) / total * 100).toFixed(1) },
    { label: 'Hybrid', val: s.hybridAum, color: '#6a1b9a', pct: ((s.hybridAum || 0) / total * 100).toFixed(1) },
    { label: 'Passive', val: s.passiveAum, color: '#1b5e20', pct: ((s.passiveAum || 0) / total * 100).toFixed(1) },
  ];

  // Filter and sort categories
  const categories = Object.values(cats).filter(c => {
    if (typeFilter === 'all') return true;
    return c.type === typeFilter;
  }).sort((a, b) => {
    const aVal = a[sortCol] || 0;
    const bVal = b[sortCol] || 0;
    return sortDir * (bVal - aVal);
  });

  return (
    <>
      <div className="container">
        <Navbar activePage="industry" />

        <div className="page-header">
          <div className="page-eyebrow">
            <div className="live-dot"></div>
            <span className="page-eyebrow-text">AMFI Official Data · Monthly</span>
          </div>
          <h1 className="page-title">
            MF Industry <span>Pulse</span>
          </h1>
          <p className="page-subtitle">
            39 fund categories · Flows, AUM, folios breakdown
          </p>
        </div>

        {/* 6 Summary Cards */}
        <div className="summary-grid">
          <div className="sum-card highlight">
            <div className="sum-icon">🏦</div>
            <div className="sum-val">{fmtCr(s.totalAum)}</div>
            <div className="sum-label">Total Industry AUM</div>
            <div className="sum-sub">{data.month} {data.year}</div>
            {industryAAUM > 0 && <div className="sum-aaum">AAUM {fmtCr(industryAAUM)}</div>}
          </div>
          <div className="sum-card">
            <div className="sum-icon">👥</div>
            <div className="sum-val">{fmtFolios(totalFolios)}</div>
            <div className="sum-label">Total Folios</div>
            <div className="sum-sub">Investor accounts</div>
          </div>
          <div className="sum-card">
            <div className="sum-icon">📈</div>
            <div className="sum-val">{fmtCr(s.equityAum)}</div>
            <div className="sum-label">Equity AUM</div>
            <div className="sum-sub">Growth/equity schemes</div>
          </div>
          <div className="sum-card">
            <div className="sum-icon">🏛</div>
            <div className="sum-val">{fmtCr(s.debtAum)}</div>
            <div className="sum-label">Debt AUM</div>
            <div className="sum-sub">Fixed income schemes</div>
          </div>
          <div className="sum-card">
            <div className="sum-icon">⚖️</div>
            <div className="sum-val">{fmtCr(s.hybridAum)}</div>
            <div className="sum-label">Hybrid AUM</div>
            <div className="sum-sub">Balanced funds</div>
          </div>
          <div className="sum-card">
            <div className="sum-icon">📊</div>
            <div className="sum-val">{fmtCr(s.passiveAum)}</div>
            <div className="sum-label">Passive AUM</div>
            <div className="sum-sub">Index funds & ETFs</div>
          </div>
        </div>

        {/* AUM Distribution Bar */}
        <div className="section">
          <div className="section-head">
            <div className="section-title">📊 AUM distribution</div>
            <div className="section-badge">BREAKDOWN</div>
          </div>
          <div className="aum-bar-wrap">
            {aumSegs.map(seg => (
              <div
                key={seg.label}
                className="aum-seg"
                style={{ width: seg.pct + '%', background: seg.color }}
                title={`${seg.label}: ${fmtCr(seg.val)}`}
              />
            ))}
          </div>
          <div className="aum-legend">
            {aumSegs.map(seg => (
              <div key={seg.label} className="aum-leg-item">
                <div className="aum-leg-dot" style={{ background: seg.color }}></div>
                {seg.label} <span className="aum-leg-val">{fmtCr(seg.val)} · {seg.pct}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Net Flows Chart */}
        <div className="section">
          <div className="section-head">
            <div className="section-title">💸 Net flows by category type</div>
            <div className="section-badge">MONTHLY</div>
          </div>
          <div className="chart-wrap" style={{ height: '280px' }}>
            <canvas ref={flowChartRef}></canvas>
          </div>
        </div>

        {/* Category Table */}
        <div className="section">
          <div className="section-head">
            <div className="section-title">📋 Category-wise data</div>
            <div className="section-badge">{Object.keys(cats).length} CATEGORIES</div>
          </div>

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

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort('label')}>
                    Category {sortCol === 'label' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('folios')} style={{ fontFamily: 'JetBrains Mono' }}>
                    Folios {sortCol === 'folios' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('netFlow')} style={{ fontFamily: 'JetBrains Mono' }}>
                    Net Flow (Cr) {sortCol === 'netFlow' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                  <th onClick={() => handleSort('aum')} style={{ fontFamily: 'JetBrains Mono' }}>
                    AUM (Cr) {sortCol === 'aum' && (sortDir === 1 ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: 'left' }}>{cat.label}</td>
                    <td style={{ fontFamily: 'JetBrains Mono' }}>{fmtFolios(cat.folios)}</td>
                    <td style={{ fontFamily: 'JetBrains Mono', color: (cat.netFlow || 0) >= 0 ? 'var(--g2)' : 'var(--neg)' }}>
                      {fmtFlow(cat.netFlow)}
                    </td>
                    <td style={{ fontFamily: 'JetBrains Mono' }}>{fmtCr(cat.aum)}</td>
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