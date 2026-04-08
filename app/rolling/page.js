'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export default function RollingPage() {
  const [fundCode, setFundCode] = useState('');
  const [fundName, setFundName] = useState('');
  const [returnWindow, setReturnWindow] = useState('1y');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const chartRef = useRef(null);
  const chartInstance = useRef(null);

  async function handleSearch(query) {
    if (!query || query.length < 3) {
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    try {
      const res = await fetch(`/api/mf?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error('Search failed');
      const results = await res.json();
      setSearchResults(Array.isArray(results) ? results.slice(0, 10) : []);
    } catch (e) {
      console.error('Search error:', e);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  async function selectFund(code, name) {
    setFundCode(code);
    setFundName(name);
    setSearchResults([]);
    calculateRolling(code, returnWindow);
  }

  async function calculateRolling(code, win) {
    if (!code) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/mf?code=${code}`);
      if (!res.ok) throw new Error(`Failed to fetch NAV data: ${res.status}`);
      const json = await res.json();

      if (!json.data || json.data.length === 0) {
        throw new Error('No NAV data available');
      }

      const navData = json.data.reverse(); // Oldest first
      const rollingReturns = computeRollingReturns(navData, win);

      setData({
        ...json,
        rollingReturns,
        window: win
      });
      setLoading(false);
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  function computeRollingReturns(navData, win) {
    const windowDays = win === '1y' ? 365 : win === '3y' ? 1095 : 1825;
    const returns = [];

    for (let i = windowDays; i < navData.length; i++) {
      const startNav = parseFloat(navData[i - windowDays].nav);
      const endNav = parseFloat(navData[i].nav);
      const years = windowDays / 365;

      if (startNav > 0) {
        const cagr = (Math.pow(endNav / startNav, 1 / years) - 1) * 100;
        returns.push({
          date: navData[i].date,
          return: cagr
        });
      }
    }

    return returns;
  }

  useEffect(() => {
    if (data && data.rollingReturns && chartRef.current && typeof window !== 'undefined' && window.Chart) {
      renderChart();
    }
  }, [data]);

  function renderChart() {
    if (!chartRef.current || !window.Chart) return;

    // Destroy existing chart
    if (chartInstance.current) {
      chartInstance.current.destroy();
    }

    const ctx = chartRef.current.getContext('2d');
    const returns = data.rollingReturns;

    chartInstance.current = new window.Chart(ctx, {
      type: 'line',
      data: {
        labels: returns.map(r => r.date),
        datasets: [{
          label: `${data.window.toUpperCase()} Rolling Returns`,
          data: returns.map(r => r.return),
          borderColor: '#1b5e20',
          backgroundColor: 'rgba(27, 94, 32, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.1,
          pointRadius: 0,
          pointHitRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: function (context) {
                return `Return: ${context.parsed.y.toFixed(2)}%`;
              }
            }
          }
        },
        scales: {
          x: {
            display: true,
            ticks: {
              maxTicksLimit: 10
            }
          },
          y: {
            display: true,
            title: {
              display: true,
              text: 'CAGR (%)'
            }
          }
        }
      }
    });
  }

  function handleWindowChange(newWindow) {
    setReturnWindow(newWindow);
    if (fundCode) {
      calculateRolling(fundCode, newWindow);
    }
  }

  const stats = data && data.rollingReturns ? {
    min: Math.min(...data.rollingReturns.map(r => r.return)),
    max: Math.max(...data.rollingReturns.map(r => r.return)),
    avg: data.rollingReturns.reduce((sum, r) => sum + r.return, 0) / data.rollingReturns.length,
    median: (() => {
      const sorted = [...data.rollingReturns].sort((a, b) => a.return - b.return);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0
        ? (sorted[mid - 1].return + sorted[mid].return) / 2
        : sorted[mid].return;
    })()
  } : null;

  return (
    <>
      <div className="container">
        <Navbar activePage="rolling" />

        <div className="page-header">
          <div className="page-eyebrow">
            <div className="live-dot"></div>
            <span className="eyebrow-text">Rolling Returns Calculator</span>
          </div>
          <h1 className="page-title">
            Rolling <span>Returns</span> Analysis
          </h1>
          <p className="page-subtitle">
            Calculate rolling returns for any mutual fund with interactive charts
          </p>
        </div>

        <div className="search-section">
          <div className="search-box">
            <input
              type="text"
              className="search-input"
              placeholder="Search for a mutual fund..."
              onChange={(e) => handleSearch(e.target.value)}
              autoComplete="off"
            />
            {searchLoading && <div className="search-spinner">Loading...</div>}
          </div>

          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map((result) => (
                <div
                  key={result.schemeCode}
                  className="search-result-item"
                  onClick={() => selectFund(result.schemeCode, result.schemeName)}
                >
                  <div className="result-name">{result.schemeName}</div>
                  <div className="result-code">Code: {result.schemeCode}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {fundName && (
          <div className="selected-fund">
            <div className="fund-name">{fundName}</div>
            <div className="fund-code">Code: {fundCode}</div>
          </div>
        )}

        <div className="window-selector">
          <button
            className={`window-btn ${returnWindow === '1y' ? 'active' : ''}`}
            onClick={() => handleWindowChange('1y')}
          >
            1 Year
          </button>
          <button
            className={`window-btn ${returnWindow === '3y' ? 'active' : ''}`}
            onClick={() => handleWindowChange('3y')}
          >
            3 Year
          </button>
          <button
            className={`window-btn ${returnWindow === '5y' ? 'active' : ''}`}
            onClick={() => handleWindowChange('5y')}
          >
            5 Year
          </button>
        </div>

        {loading && (
          <div className="loading-box">
            <div className="spinner"></div>
            <div>Calculating rolling returns...</div>
          </div>
        )}

        {error && (
          <div className="error-box">
            <div>⚠ Error: {error}</div>
          </div>
        )}

        {data && data.rollingReturns && stats && (
          <>
            <div className="stat-chips">
              <div className="stat-chip">
                <div className="chip-val">{stats.avg.toFixed(2)}%</div>
                <div className="chip-label">Average Return</div>
              </div>
              <div className="stat-chip">
                <div className="chip-val">{stats.median.toFixed(2)}%</div>
                <div className="chip-label">Median Return</div>
              </div>
              <div className="stat-chip">
                <div className="chip-val">{stats.min.toFixed(2)}%</div>
                <div className="chip-label">Min Return</div>
              </div>
              <div className="stat-chip">
                <div className="chip-val">{stats.max.toFixed(2)}%</div>
                <div className="chip-label">Max Return</div>
              </div>
            </div>

            <div className="chart-section">
              <div className="chart-wrapper">
                <canvas ref={chartRef} height="400"></canvas>
              </div>
            </div>

            <div className="section">
              <div className="section-head">
                <h2 className="section-title">Return Distribution</h2>
                <div className="section-badge">{data.rollingReturns.length} data points</div>
              </div>
              <div className="returns-table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Rolling Return (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rollingReturns.slice(-20).reverse().map((r, i) => (
                      <tr key={i}>
                        <td>{r.date}</td>
                        <td className={r.return >= 0 ? 'positive' : 'negative'}>
                          {r.return.toFixed(2)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      <Footer />
    </>
  );
}