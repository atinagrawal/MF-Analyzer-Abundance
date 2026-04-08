'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

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
  const [filterType, setFilterType] = useState('all');
  const [sortCol, setSortCol] = useState('netFlow');
  const [sortDir, setSortDir] = useState(-1);
  const flowChartRef = useRef(null);
  const flowChartInstance = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (data && typeof window !== 'undefined' && window.Chart && flowChartRef.current) {
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
              <span className="page-eyebrow-text">AMFI Official Data</span>
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
              <span className="page-eyebrow-text">AMFI Official Data</span>
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

  const mon = data.month || '';
  const yr = data.year || '';
  const label = mon && yr ? (MONTH_LABELS[MONTHS.indexOf(mon)] || mon) + ' ' + yr : '';

  // Summary cards data
  const cards = [
    { icon: '🏦', val: fmtCr(s.totalAum), label: 'Total Industry AUM', sub: label,
      aaum: industryAAUM ? 'AAUM ' + fmtCr(industryAAUM) : '', highlight: true },
    { icon: '👥', val: fmtFolios(totalFolios), label: 'Total Folios', sub: 'Investor accounts', aaum: '', highlight: false },
    { icon: '📈', val: fmtCr(s.equityAum), label: 'Equity AUM', sub: 'Growth/equity schemes', aaum: '', highlight: false },
    { icon: '🏛', val: fmtCr(s.debtAum), label: 'Debt AUM', sub: 'Fixed income schemes', aaum: '', highlight: false },
    { icon: '⚖️', val: fmtCr(s.hybridAum), label: 'Hybrid AUM', sub: 'Balanced funds', aaum: '', highlight: false },
    { icon: '📊', val: fmtCr(s.passiveAum), label: 'Passive AUM', sub: 'Index funds & ETFs', aaum: '', highlight: false },
  ];

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
    if (filterType === 'all') return true;
    return c.type === filterType;
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
            <span className="page-eyebrow-text">AMFI Official Data</span>
          </div>
          <h1 className="page-title">
            MF Industry <span>Pulse</span>
          </h1>
          <p className="page-subtitle">
            AUM · AAUM · category flows · 12-month trends — sourced directly from AMFI official monthly reports
          </p>
        </div>

        {/* Summary Cards */}
        <div className="summary-grid">
          {cards.map((c, i) => (
            <div key={i} className={`sum-card${c.highlight ? ' highlight' : ''}`}>
              <div className="sum-icon">{c.icon}</div>
              <div className="sum-val">{c.val}</div>
              <div className="sum-label">{c.label}</div>
              <div className="sum-sub">{c.sub}</div>
              {c.aaum && <div className="sum-aaum">{c.aaum}</div>}
            </div>
          ))}
        </div>

        {/* AUM Breakdown */}
        <div className="aum-breakdown section">
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
            <div className="section-badge">THIS MONTH · ₹ CRORE</div>
          </div>
          <div className="chart-card">
            <div className="chart-sub">Positive = net buying · negative = net redemptions · hover for exact figures</div>
            <div className="chart-wrap" style={{ height: '220px' }}>
              <canvas ref={flowChartRef}></canvas>
            </div>
          </div>
        </div>

        {/* Category Table */}
        <div className="section">
          <div className="section-head">
            <div className="section-title">📋 Category-wise data</div>
            <div className="section-badge">{Object.keys(cats).length} CATEGORIES</div>
          </div>
          <div className="cat-table-wrap">
            <div className="cat-filters">
              <button
                className={`cat-filter-btn ${filterType === 'all' ? 'active' : ''}`}
                onClick={() => setFilterType('all')}
              >
                All
              </button>
              <button
                className={`cat-filter-btn ${filterType === 'equity' ? 'active' : ''}`}
                onClick={() => setFilterType('equity')}
              >
                Equity
              </button>
              <button
                className={`cat-filter-btn ${filterType === 'debt' ? 'active' : ''}`}
                onClick={() => setFilterType('debt')}
              >
                Debt
              </button>
              <button
                className={`cat-filter-btn ${filterType === 'hybrid' ? 'active' : ''}`}
                onClick={() => setFilterType('hybrid')}
              >
                Hybrid
              </button>
              <button
                className={`cat-filter-btn ${filterType === 'passive' ? 'active' : ''}`}
                onClick={() => setFilterType('passive')}
              >
                Passive
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="cat-table">
                <thead>
                  <tr>
                    <th onClick={() => handleSort('label')}>
                      Category <span className="sort-arrow">{sortCol === 'label' ? (sortDir === -1 ? '↓' : '↑') : '↕'}</span>
                    </th>
                    <th onClick={() => handleSort('folios')} className="mono">
                      Folios <span className="sort-arrow">{sortCol === 'folios' ? (sortDir === -1 ? '↓' : '↑') : '↕'}</span>
                    </th>
                    <th onClick={() => handleSort('inflow')} className="mono">
                      Inflow (Cr) <span className="sort-arrow">{sortCol === 'inflow' ? (sortDir === -1 ? '↓' : '↑') : '↕'}</span>
                    </th>
                    <th onClick={() => handleSort('redemption')} className="mono col-hide-mobile">
                      Redemption (Cr) <span className="sort-arrow">{sortCol === 'redemption' ? (sortDir === -1 ? '↓' : '↑') : '↕'}</span>
                    </th>
                    <th onClick={() => handleSort('netFlow')} className={`sorted mono`}>
                      Net Flow (Cr) <span className="sort-arrow">{sortCol === 'netFlow' ? (sortDir === -1 ? '↓' : '↑') : '↕'}</span>
                    </th>
                    <th onClick={() => handleSort('aum')} className="mono">
                      AUM (Cr) <span className="sort-arrow">{sortCol === 'aum' ? (sortDir === -1 ? '↓' : '↑') : '↕'}</span>
                    </th>
                    <th onClick={() => handleSort('avgAum')} className="mono col-hide-mobile">
                      AAUM (Cr) <span className="sort-arrow">{sortCol === 'avgAum' ? (sortDir === -1 ? '↓' : '↑') : '↕'}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat, i) => (
                    <tr key={i}>
                      <td>{cat.label}</td>
                      <td className="mono">{fmtFolios(cat.folios)}</td>
                      <td className="mono">{fmtCr(cat.inflow)}</td>
                      <td className="mono col-hide-mobile">{fmtCr(cat.redemption)}</td>
                      <td className="mono" style={{ color: (cat.netFlow || 0) >= 0 ? 'var(--g2)' : 'var(--neg)' }}>
                        {fmtFlow(cat.netFlow)}
                      </td>
                      <td className="mono">{fmtCr(cat.aum)}</td>
                      <td className="mono col-hide-mobile">{fmtCr(cat.avgAum)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
