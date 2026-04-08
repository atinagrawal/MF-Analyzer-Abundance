'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

// State name mappings between AMFI and GeoJSON
const AMFI_TO_GEO = {
  'Andaman & Nicobar Islands': 'Andaman & Nicobar',
  'Dadra & Nagar Haveli and Daman & Diu': 'Dadra and Nagar Haveli and Daman and Diu',
};

const MERGED_UT_MAP = {
  'Dadra & Nagar Haveli': 'Dadra and Nagar Haveli and Daman and Diu',
  'Daman & Diu': 'Dadra and Nagar Haveli and Daman and Diu',
};

function fmtCr(val) {
  if (!val) return '₹0';
  return '₹' + (val / 100000).toFixed(2) + ' L Cr';
}

function fmtCrShort(val) {
  if (!val) return '0';
  return '₹' + (val / 100000).toFixed(1) + 'L';
}

export default function GeographyPage() {
  const [data, setData] = useState(null);
  const [geoJson, setGeoJson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedState, setSelectedState] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('');
  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const [aumByGeo, setAumByGeo] = useState({});

  useEffect(() => {
    async function loadData() {
      try {
        const [apiRes, geoRes] = await Promise.all([
          fetch('/api/amfi-statewise'),
          fetch('/india-states.geojson')
        ]);

        if (!apiRes.ok) throw new Error(`API error: ${apiRes.status}`);
        if (!geoRes.ok) throw new Error(`GeoJSON error: ${geoRes.status}`);

        const apiData = await apiRes.json();
        const geoData = await geoRes.json();

        setData(apiData);
        setGeoJson(geoData);
        setSelectedMonth(apiData.date || '');
        buildLookups(apiData);
        setLoading(false);
      } catch (e) {
        setError(e.message);
        setLoading(false);
      }
    }
    loadData();
  }, []);

  function buildLookups(apiData) {
    const lookup = {};

    apiData.states.forEach(s => {
      // Handle merged UTs
      if (MERGED_UT_MAP[s.state]) {
        const gName = MERGED_UT_MAP[s.state];
        if (!lookup[gName]) {
          lookup[gName] = { ...s, _merged: [s.state] };
        } else {
          const m = lookup[gName];
          ['total', 'equity', 'debt', 'etf', 'fof', 'liquid'].forEach(k => {
            m[k] = (m[k] || 0) + (s[k] || 0);
          });
          m.sharePct = apiData.grandTotal > 0 ? m.total / apiData.grandTotal * 100 : 0;
          m.equityPct = m.total > 0 ? m.equity / m.total * 100 : 0;
          m._merged.push(s.state);
        }
        return;
      }

      lookup[AMFI_TO_GEO[s.state] || s.state] = s;
    });

    setAumByGeo(lookup);
  }

  useEffect(() => {
    if (data && geoJson && typeof window !== 'undefined' && window.d3) {
      renderMap();
    }
  }, [data, geoJson, aumByGeo]);

  // Update map highlights when selected state changes
  useEffect(() => {
    if (!window.d3 || !mapRef.current) return;

    const d3 = window.d3;
    const svg = d3.select(mapRef.current.querySelector('svg'));

    // Remove all selected classes
    svg.selectAll('.state-path').classed('selected', false);

    // Add selected class to the clicked state
    if (selectedState) {
      const geoName = Object.keys(aumByGeo).find(key => {
        const state = aumByGeo[key];
        return state.state === selectedState.state ||
          (state._merged && state._merged.includes(selectedState.state));
      });

      if (geoName) {
        svg.selectAll('.state-path')
          .filter(d => d.properties.ST_NM === geoName)
          .classed('selected', true);
      }
    }
  }, [selectedState, aumByGeo]);

  function renderMap() {
    if (!mapRef.current || !window.d3) return;

    const container = mapRef.current;
    container.innerHTML = '';

    const W = container.clientWidth || 580;
    const H = Math.round(W * 1.1);

    const d3 = window.d3;

    // Color scale
    const states = data.states.filter(s => s.state !== 'Others' && s.total > 0);
    const vals = states.map(s => s.total);
    const lo = d3.min(vals);
    const hi = d3.max(vals) || lo + 1;
    const colorScale = d3.scaleSqrt()
      .domain([lo, hi])
      .range(['#c8e6c9', '#1b5e20'])
      .clamp(true);

    const svg = d3.select(container).append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', 'auto');

    const projection = d3.geoMercator().fitSize([W, H], geoJson);
    const pathFn = d3.geoPath().projection(projection);

    svg.append('g')
      .selectAll('path')
      .data(geoJson.features)
      .join('path')
      .attr('class', 'state-path')
      .attr('d', pathFn)
      .attr('fill', d => {
        const s = aumByGeo[d.properties.ST_NM];
        return s ? colorScale(s.total) : '#e8f5e9';
      })
      .attr('stroke', '#fff')
      .attr('stroke-width', 0.6)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        const stateName = d.properties.ST_NM;
        const stateData = aumByGeo[stateName];
        if (stateData) {
          setSelectedState(stateData);
        }
      })
      .on('mouseover', function () {
        d3.select(this).attr('stroke-width', 1.5).attr('stroke', '#1b5e20');
      })
      .on('mouseout', function () {
        d3.select(this).attr('stroke-width', 0.6).attr('stroke', '#fff');
      });
  }

  function handleMonthChange(e) {
    const date = e.target.value;
    if (!date) return;

    setLoading(true);
    setSelectedMonth(date);

    fetch(`/api/amfi-statewise?date=${date}`)
      .then(r => r.json())
      .then(newData => {
        setData(newData);
        buildLookups(newData);
        setSelectedState(null);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }

  function handleStateClick(state) {
    setSelectedState(state);

    // Scroll to map
    if (mapContainerRef.current) {
      mapContainerRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }

  if (loading) {
    return (
      <>
        <div className="container">
          <Navbar activePage="geography" />
          <div className="page-header">
            <div className="page-eyebrow">
              <div className="live-dot"></div>
              <span className="eyebrow-text">India MF Geography</span>
            </div>
            <h1 className="page-title">
              State-wise <span>AUM</span> Distribution
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
          <Navbar activePage="geography" />
          <div className="page-header">
            <div className="page-eyebrow">
              <div className="live-dot"></div>
              <span className="eyebrow-text">India MF Geography</span>
            </div>
            <h1 className="page-title">
              State-wise <span>AUM</span> Distribution
            </h1>
            <p className="page-subtitle" style={{ color: 'var(--neg)' }}>⚠ Error: {error}</p>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  const filteredStates = data.states
    .filter(s => s.state !== 'Others')
    .filter(s => {
      if (filterCategory === 'all') return true;
      if (filterCategory === 'top10') return s.rank && s.rank <= 10;
      if (filterCategory === 'b30') return s.rank && s.rank > 10;
      return true;
    })
    .sort((a, b) => (a.rank || 999) - (b.rank || 999));

  return (
    <>
      <div className="container">
        <Navbar activePage="geography" />

        <div className="page-header">
          <div className="page-eyebrow">
            <div className="live-dot"></div>
            <span className="eyebrow-text">India MF Geography</span>
          </div>
          <h1 className="page-title">
            State-wise <span>AUM</span> Distribution
          </h1>
          <p className="page-subtitle">
            Interactive India map showing mutual fund AUM across all 36 states and union territories
          </p>

          {data.availableMonths && data.availableMonths.length > 0 && (
            <div className="month-selector">
              <select
                id="monthSel"
                className="month-select"
                onChange={handleMonthChange}
                value={selectedMonth}
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
            </div>
          )}
        </div>

        <div className="stat-chips">
          <div className="stat-chip highlight">
            <div className="chip-val">{fmtCr(data.grandTotal)}</div>
            <div className="chip-label">Total Industry AUM</div>
            <div className="chip-sub">{data.date}</div>
          </div>
          <div className="stat-chip">
            <div className="chip-val">{data.top5SharePct?.toFixed(1)}%</div>
            <div className="chip-label">Top 5 States</div>
            <div className="chip-sub">MH, DL, KA, GJ, WB</div>
          </div>
          <div className="stat-chip">
            <div className="chip-val">{data.equityPctIndustry?.toFixed(1)}%</div>
            <div className="chip-label">Equity Share</div>
            <div className="chip-sub">of total AUM</div>
          </div>
        </div>

        <div className="geo-layout">
          <div className="map-card" ref={mapContainerRef}>
            <div className="map-card-title">India Choropleth Map</div>
            <div className="map-card-sub">Click any state to view details</div>
            <div id="mapContainer" ref={mapRef}></div>
            <div className="color-legend">
              <div className="cl-bar"></div>
              <div className="cl-label-row">
                <span>Low AUM</span>
                <span>High AUM</span>
              </div>
            </div>
            <div className="map-footer-note">
              Data: AMFI · {data.date} · 36 states & UTs
            </div>
          </div>

          <div className="detail-panel">
            {selectedState ? (
              <>
                <div className="detail-state-name">{selectedState.state}</div>
                {selectedState.rank && (
                  <div className="detail-rank">Rank #{selectedState.rank}</div>
                )}
                {selectedState._merged && (
                  <div className="merged-note">
                    Merged: {selectedState._merged.join(' + ')}
                  </div>
                )}
                <div className="detail-grid">
                  <div className="detail-box">
                    <div className="db-val">{fmtCr(selectedState.total)}</div>
                    <div className="db-label">Total AUM</div>
                  </div>
                  <div className="detail-box">
                    <div className="db-val">{selectedState.sharePct?.toFixed(2)}%</div>
                    <div className="db-label">Share of India</div>
                  </div>
                </div>
                <div className="detail-breakdown">
                  <div className="dbrk-title">Full breakdown</div>
                  <div className="dbrk-row">
                    <span className="dbrk-name">Equity schemes</span>
                    <span className="dbrk-val">{fmtCr(selectedState.equitySchemes || 0)}</span>
                  </div>
                  <div className="dbrk-row">
                    <span className="dbrk-name">Balanced / Hybrid</span>
                    <span className="dbrk-val">{fmtCr(selectedState.balanced || 0)}</span>
                  </div>
                  <div className="dbrk-row">
                    <span className="dbrk-name">Other debt</span>
                    <span className="dbrk-val">{fmtCr(selectedState.otherDebt || 0)}</span>
                  </div>
                  <div className="dbrk-row">
                    <span className="dbrk-name">Liquid schemes</span>
                    <span className="dbrk-val">{fmtCr(selectedState.liquid || 0)}</span>
                  </div>
                  <div className="dbrk-row">
                    <span className="dbrk-name">Gold ETF</span>
                    <span className="dbrk-val">{fmtCr(selectedState.goldETF || 0)}</span>
                  </div>
                  <div className="dbrk-row">
                    <span className="dbrk-name">Other ETF</span>
                    <span className="dbrk-val">{fmtCr(selectedState.otherETF || 0)}</span>
                  </div>
                  <div className="dbrk-row">
                    <span className="dbrk-name">FoF (Overseas + Dom)</span>
                    <span className="dbrk-val">{fmtCr(selectedState.fof || 0)}</span>
                  </div>
                </div>
                {selectedState.equityPct > data.equityPctIndustry ? (
                  <div className="vs-badge vs-above">
                    {(selectedState.equityPct - data.equityPctIndustry).toFixed(1)}% above avg equity mix
                  </div>
                ) : (
                  <div className="vs-badge vs-below">
                    {(data.equityPctIndustry - selectedState.equityPct).toFixed(1)}% below avg equity mix
                  </div>
                )}
              </>
            ) : (
              <div className="detail-empty">
                <div className="detail-empty-icon">🗺️</div>
                <div className="detail-empty-text">
                  Click any state on the map to view detailed AUM breakdown
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="section">
          <div className="section-head">
            <h2 className="section-title">State Rankings</h2>
            <div className="section-badge">{filteredStates.length} states</div>
          </div>

          <div className="geo-table-wrap">
            <div className="geo-filters">
              <span className="geo-filter-label">Show:</span>
              <button
                className={`geo-filter-btn ${filterCategory === 'all' ? 'active' : ''}`}
                onClick={() => setFilterCategory('all')}
              >
                All States
              </button>
              <button
                className={`geo-filter-btn ${filterCategory === 'top10' ? 'active' : ''}`}
                onClick={() => setFilterCategory('top10')}
              >
                Top 10
              </button>
              <button
                className={`geo-filter-btn ${filterCategory === 'b30' ? 'active' : ''}`}
                onClick={() => setFilterCategory('b30')}
              >
                B30 Cities
              </button>
            </div>

            <div className="table-wrap">
              <table className="geo-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>State</th>
                    <th>Total AUM</th>
                    <th>Share %</th>
                    <th>Equity %</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStates.map((s, i) => (
                    <tr
                      key={i}
                      onClick={() => handleStateClick(s)}
                      style={{ cursor: 'pointer' }}
                      className={selectedState?.state === s.state ? 'selected-row' : ''}
                    >
                      <td>{s.rank || '—'}</td>
                      <td style={{ textAlign: 'left' }}>{s.state}</td>
                      <td>{fmtCr(s.total)}</td>
                      <td>{s.sharePct?.toFixed(2)}%</td>
                      <td>{s.equityPct?.toFixed(1)}%</td>
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