'use client';

import { useState, useEffect, useRef } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

// AMFI state name → GeoJSON ST_NM mapping
// Source of truth: GeoJSON has 'Andaman & Nicobar Island' (no 's'), 'Dadara & Nagar Havelli' (typo)
const AMFI_TO_GEO = {
  // Exact AMFI names → exact GeoJSON ST_NM values
  'Andaman and Nicobar Islands': 'Andaman & Nicobar Island',
  'New Delhi': 'NCT of Delhi',
  'Jammu and Kashmir': 'Jammu & Kashmir',
  'Pondicherry': 'Puducherry',
  'Orissa': 'Odisha',
};

// GeoJSON ST_NM → AMFI state name (reverse lookup for click events)
const GEO_TO_AMFI = {};
Object.entries(AMFI_TO_GEO).forEach(([amfi, geo]) => {
  if (!GEO_TO_AMFI[geo]) GEO_TO_AMFI[geo] = amfi;
});

// States that were merged by AMFI into a single UT after 2019 reorganisation
const MERGED_UT_MAP = {
  'Dadra and Nagar Haveli': 'Dadra & Nagar Haveli and Daman & Diu',
  'Daman and Diu': 'Dadra & Nagar Haveli and Daman & Diu',
};

// Adaptive formatters — no more hardcoded L Cr for small states
function fmtCr(val) {
  if (!val && val !== 0) return '₹0 Cr';
  const v = val || 0;
  if (v >= 100000) return '₹' + (v / 100000).toFixed(2) + ' L Cr';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(1) + ' K Cr';
  return '₹' + Math.round(v) + ' Cr';
}
function fmtCrShort(val) {
  if (!val && val !== 0) return '₹0';
  const v = val || 0;
  if (v >= 100000) return '₹' + (v / 100000).toFixed(1) + 'L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(0) + 'K';
  return '₹' + Math.round(v);
}

const SORT_KEYS = [
  { key: 'total', label: 'Total AUM' },
  { key: 'equity', label: 'Equity' },
  { key: 'otherDebt', label: 'Debt' },
  { key: 'equityPct', label: 'Equity %' },
  { key: 'sharePct', label: 'Share %' },
];

export default function GeographyPage() {
  const [data, setData] = useState(null);
  const [geoJson, setGeoJson] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedState, setSelectedState] = useState(null);
  const [filterCategory, setFilterCategory] = useState('all');
  const [selectedMonth, setSelectedMonth] = useState('');
  const [sortKey, setSortKey] = useState('total');
  const [sortDir, setSortDir] = useState(-1);
  const [aumByGeo, setAumByGeo] = useState({});
  const [maxAum, setMaxAum] = useState(1);

  const mapRef = useRef(null);
  const mapContainerRef = useRef(null);
  const tooltipRef = useRef(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [apiRes, geoRes] = await Promise.all([
          fetch('/api/amfi-statewise'),
          fetch('/india-states.geojson'),
        ]);
        if (!apiRes.ok) throw new Error(`API error: ${apiRes.status}`);
        if (!geoRes.ok) throw new Error(`GeoJSON error: ${geoRes.status}`);
        const apiData = await apiRes.json();
        const geoData = await geoRes.json();
        setData(apiData);
        setGeoJson(geoData);
        setSelectedMonth(apiData.date || '');
        const lookup = buildLookups(apiData);
        setAumByGeo(lookup);
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
      // Check merged UT map first
      if (MERGED_UT_MAP[s.state]) {
        const gName = MERGED_UT_MAP[s.state];
        if (!lookup[gName]) {
          lookup[gName] = { ...s, _merged: [s.state] };
        } else {
          const m = lookup[gName];
          ['total', 'equity', 'debt', 'etf', 'fof', 'liquid', 'otherDebt', 'goldETF', 'otherETF', 'equitySchemes', 'balanced'].forEach(k => {
            m[k] = (m[k] || 0) + (s[k] || 0);
          });
          m.sharePct = apiData.grandTotal > 0 ? m.total / apiData.grandTotal * 100 : 0;
          m.equityPct = m.total > 0 ? (m.equity || 0) / m.total * 100 : 0;
          m._merged.push(s.state);
        }
        return;
      }
      // Map AMFI name to GeoJSON name
      const geoName = AMFI_TO_GEO[s.state] || s.state;
      lookup[geoName] = s;
    });
    return lookup;
  }

  // Render / update map
  useEffect(() => {
    if (data && geoJson && typeof window !== 'undefined' && window.d3) {
      renderMap();
    }
  }, [data, geoJson, aumByGeo]);

  // Update selection highlight
  useEffect(() => {
    if (!mapRef.current || typeof window === 'undefined' || !window.d3) return;
    const d3 = window.d3;
    const svg = d3.select(mapRef.current.querySelector('svg'));
    if (!svg.node()) return;
    svg.selectAll('.state-path').classed('selected', false);
    if (selectedState) {
      const geoName = Object.keys(aumByGeo).find(key => {
        const s = aumByGeo[key];
        return s.state === selectedState.state || (s._merged && s._merged.includes(selectedState.state));
      });
      if (geoName) {
        svg.selectAll('.state-path').filter(d => d.properties.ST_NM === geoName).classed('selected', true);
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
    const states = data.states.filter(s => s.state !== 'Others' && s.total > 0);
    const vals = states.map(s => s.total);
    const lo = d3.min(vals), hi = d3.max(vals) || lo + 1;
    const colorScale = d3.scaleSqrt().domain([lo, hi]).range(['#c8e6c9', '#1b5e20']).clamp(true);
    const svg = d3.select(container).append('svg')
      .attr('viewBox', `0 0 ${W} ${H}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%').style('height', 'auto');
    const projection = d3.geoMercator().fitSize([W, H], geoJson);
    const pathFn = d3.geoPath().projection(projection);

    // Tooltip element
    let ttEl = document.getElementById('mapTooltip');
    if (!ttEl) {
      ttEl = document.createElement('div');
      ttEl.id = 'mapTooltip';
      ttEl.className = 'map-tooltip';
      ttEl.innerHTML = '<div class="tt-name"></div><div class="tt-val"></div>';
      document.body.appendChild(ttEl);
    }

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
        const stateData = aumByGeo[d.properties.ST_NM];
        if (stateData) setSelectedState(stateData);
      })
      .on('mouseover', function (event, d) {
        d3.select(this).attr('stroke-width', 1.5).attr('stroke', '#1b5e20');
        const s = aumByGeo[d.properties.ST_NM];
        if (s && ttEl) {
          ttEl.querySelector('.tt-name').textContent = s.state || d.properties.ST_NM;
          ttEl.querySelector('.tt-val').textContent = fmtCr(s.total) + ' · ' + (s.sharePct || 0).toFixed(2) + '% of India';
          ttEl.classList.add('visible');
        }
      })
      .on('mousemove', function (event) {
        if (ttEl) { ttEl.style.left = (event.clientX + 14) + 'px'; ttEl.style.top = (event.clientY - 10) + 'px'; }
      })
      .on('mouseout', function () {
        d3.select(this).attr('stroke-width', 0.6).attr('stroke', '#fff');
        if (ttEl) ttEl.classList.remove('visible');
      });

    // Legend with actual values
    const legendStates = data.states.filter(s => s.state !== 'Others' && s.total > 0).sort((a, b) => a.total - b.total);
    const legendMin = legendStates[0]?.total || 0;
    const legendMid = legendStates[Math.floor(legendStates.length / 2)]?.total || 0;
    const legendMax = legendStates[legendStates.length - 1]?.total || 1;
    const existingLegend = container.parentElement?.querySelector('.color-legend-vals');
    if (existingLegend) {
      existingLegend.querySelector('.clv-min').textContent = fmtCrShort(legendMin);
      existingLegend.querySelector('.clv-mid').textContent = fmtCrShort(legendMid);
      existingLegend.querySelector('.clv-max').textContent = fmtCrShort(legendMax);
    }

    // Compute max for AUM bars
    setMaxAum(Math.max(...data.states.filter(s => s.state !== 'Others').map(s => s.total || 0), 1));
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
        const lookup = buildLookups(newData);
        setAumByGeo(lookup);
        setSelectedState(null);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }

  function handleStateClick(state) {
    setSelectedState(state);
    if (mapContainerRef.current) mapContainerRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d * -1);
    else { setSortKey(key); setSortDir(-1); }
  }

  if (loading) {
    return (
      <>
        <div className="container"><Navbar activePage="geography" />
          <div className="page-header">
            <div className="page-eyebrow"><div className="live-dot"></div><span className="eyebrow-text">India MF Geography</span></div>
            <h1 className="page-title">State-wise <span>AUM</span> Distribution</h1>
            <p className="page-subtitle">Loading data…</p>
          </div>
        </div><Footer />
      </>
    );
  }
  if (error) {
    return (
      <>
        <div className="container"><Navbar activePage="geography" />
          <div className="page-header">
            <div className="page-eyebrow"><div className="live-dot"></div><span className="eyebrow-text">India MF Geography</span></div>
            <h1 className="page-title">State-wise <span>AUM</span> Distribution</h1>
            <p className="page-subtitle" style={{ color: 'var(--neg)' }}>⚠ Error: {error}</p>
          </div>
        </div><Footer />
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
    .sort((a, b) => sortDir * ((a[sortKey] || 0) - (b[sortKey] || 0)));

  const eqAvg = data.equityPctIndustry;

  function rankClass(rank) {
    if (!rank) return 'plain';
    if (rank === 1) return 'gold';
    if (rank === 2) return 'silver';
    if (rank === 3) return 'bronze';
    return 'plain';
  }

  function eqChipClass(pct) {
    if (pct >= eqAvg + 5) return 'high';
    if (pct >= eqAvg - 5) return 'med';
    return 'low';
  }

  return (
    <>
      <div className="container">
        <Navbar activePage="geography" />

        <div className="page-header">
          <div className="page-eyebrow"><div className="live-dot"></div><span className="eyebrow-text">India MF Geography</span></div>
          <h1 className="page-title">State-wise <span>AUM</span> Distribution</h1>
          <p className="page-subtitle">Interactive India map showing mutual fund AUM across all 36 states and union territories</p>
          {data.availableMonths?.length > 0 && (
            <div className="month-selector">
              <select id="monthSel" className="month-select" onChange={handleMonthChange} value={selectedMonth}>
                {data.availableMonths.map(m => {
                  const [mon, yr] = m.split('-');
                  const dStr = `01-${mon.slice(0, 3).toLowerCase()}-${yr}`;
                  return <option key={m} value={dStr}>{mon} {yr}</option>;
                })}
              </select>
            </div>
          )}
        </div>

        {/* Summary stat chips */}
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

        {/* Map + Detail layout */}
        <div className="geo-layout">
          <div className="map-card" ref={mapContainerRef}>
            <div className="map-card-title">India Choropleth Map</div>
            <div className="map-card-sub">Click any state to view details · Hover for quick stats</div>
            <div id="mapContainer" ref={mapRef}></div>
            {/* Color legend with actual values */}
            <div className="color-legend color-legend-vals">
              <div className="cl-bar"></div>
              <div className="cl-label-row">
                <span className="clv-min">Low</span>
                <span className="clv-mid">—</span>
                <span className="clv-max">High</span>
              </div>
            </div>
            <div className="map-footer-note">Data: AMFI · {data.date} · 36 states & UTs</div>
          </div>

          {/* Detail panel */}
          <div className="detail-panel">
            {selectedState ? (
              <>
                <div className="detail-state-name">{selectedState.state}</div>
                {selectedState.rank && <div className="detail-rank">Rank #{selectedState.rank}</div>}
                {selectedState._merged && (
                  <div className="merged-note">Merged: {selectedState._merged.join(' + ')}</div>
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
                  <div className="detail-box">
                    <div className="db-val">{fmtCrShort(selectedState.equity || 0)}</div>
                    <div className="db-label">Equity AUM</div>
                  </div>
                  <div className="detail-box">
                    <div className="db-val">{fmtCrShort((selectedState.otherDebt || 0) + (selectedState.liquid || 0))}</div>
                    <div className="db-label">Debt + Liquid</div>
                  </div>
                </div>

                {/* Equity concentration bar */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.6rem', color: 'var(--muted)', marginBottom: 4 }}>
                    <span>Equity mix</span>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontWeight: 700 }}>{selectedState.equityPct?.toFixed(1)}%</span>
                  </div>
                  <div className="aum-bar-track" style={{ height: 6, borderRadius: 4 }}>
                    <div className="aum-bar-fill" style={{ background: '#1565c0', width: Math.min(selectedState.equityPct || 0, 100) + '%', borderRadius: 4 }}></div>
                  </div>
                </div>

                {/* Share of national bar */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.6rem', color: 'var(--muted)', marginBottom: 4 }}>
                    <span>Share of national AUM</span>
                    <span style={{ fontFamily: 'JetBrains Mono,monospace', fontWeight: 700 }}>{selectedState.sharePct?.toFixed(2)}%</span>
                  </div>
                  <div className="aum-bar-track" style={{ height: 6, borderRadius: 4 }}>
                    <div className="aum-bar-fill" style={{ width: Math.min((selectedState.sharePct || 0) * 2, 100) + '%', borderRadius: 4 }}></div>
                  </div>
                </div>

                {/* vs-avg badge */}
                {selectedState.equityPct > eqAvg ? (
                  <div className="vs-badge vs-above">+{(selectedState.equityPct - eqAvg).toFixed(1)}% above avg equity mix</div>
                ) : (
                  <div className="vs-badge vs-below">{(eqAvg - selectedState.equityPct).toFixed(1)}% below avg equity mix</div>
                )}

                {/* Full breakdown */}
                <div className="detail-breakdown">
                  <div className="dbrk-title">Full breakdown</div>
                  {[
                    ['Equity schemes', selectedState.equitySchemes || 0],
                    ['Balanced / Hybrid', selectedState.balanced || 0],
                    ['Other Debt', selectedState.otherDebt || 0],
                    ['Liquid schemes', selectedState.liquid || 0],
                    ['Gold ETF', selectedState.goldETF || 0],
                    ['Other ETF', selectedState.otherETF || 0],
                    ['FoF (Overseas + Dom)', selectedState.fof || 0],
                  ].map(([name, val]) => (
                    <div key={name} className="dbrk-row">
                      <span className="dbrk-name">{name}</span>
                      <span className="dbrk-val">{fmtCr(val)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="detail-empty">
                <div className="detail-empty-icon">🗺️</div>
                <div className="detail-empty-text">Click any state on the map to view detailed AUM breakdown</div>
              </div>
            )}
          </div>
        </div>

        {/* State Rankings table */}
        <div className="section">
          <div className="section-head">
            <h2 className="section-title">State Rankings</h2>
            <div className="section-badge">{filteredStates.length} states</div>
          </div>

          <div className="geo-table-wrap">
            {/* Filter + Sort row */}
            <div className="geo-filters" style={{ display: 'flex', gap: 8, padding: '14px 16px', borderBottom: '1.5px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: '.6rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'JetBrains Mono,monospace' }}>Show:</span>
              {[['all', 'All States'], ['top10', 'Top 10'], ['b30', 'B30 Cities']].map(([val, label]) => (
                <button key={val} className={`geo-filter-btn${filterCategory === val ? ' active' : ''}`} onClick={() => setFilterCategory(val)}>{label}</button>
              ))}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '.6rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: 'JetBrains Mono,monospace', alignSelf: 'center' }}>Sort:</span>
                {SORT_KEYS.map(({ key, label }) => (
                  <button key={key}
                    style={{ padding: '4px 10px', borderRadius: 20, fontSize: '.6rem', fontWeight: 700, border: `1.5px solid ${sortKey === key ? 'var(--g2)' : 'var(--border)'}`, background: sortKey === key ? 'var(--g2)' : 'var(--surface2)', color: sortKey === key ? '#fff' : 'var(--muted)', cursor: 'pointer', fontFamily: 'Raleway,sans-serif', whiteSpace: 'nowrap' }}
                    onClick={() => handleSort(key)}>
                    {label}{sortKey === key ? (sortDir === -1 ? '↓' : '↑') : ''}
                  </button>
                ))}
              </div>
            </div>

            <div className="table-wrap">
              <table className="geo-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>State</th>
                    <th>Total AUM</th>
                    <th>Equity AUM</th>
                    <th>Debt AUM</th>
                    <th>Equity %</th>
                    <th>Share %</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredStates.map((s, i) => (
                    <tr key={i} onClick={() => handleStateClick(s)} style={{ cursor: 'pointer' }}
                      className={selectedState?.state === s.state ? 'selected-row' : ''}>
                      <td>
                        <span className={`rank-badge ${rankClass(s.rank)}`}>{s.rank || '—'}</span>
                      </td>
                      <td style={{ textAlign: 'left' }}>{s.state}</td>
                      <td>
                        <div>{fmtCr(s.total)}</div>
                        <div className="aum-bar-wrap">
                          <div className="aum-bar-track">
                            <div className="aum-bar-fill" style={{ width: Math.min(((s.total || 0) / maxAum) * 100, 100) + '%' }}></div>
                          </div>
                        </div>
                      </td>
                      <td>{fmtCrShort(s.equity || 0)}</td>
                      <td>{fmtCrShort((s.otherDebt || 0) + (s.liquid || 0))}</td>
                      <td>
                        <span className={`eq-chip ${eqChipClass(s.equityPct || 0)}`}>{(s.equityPct || 0).toFixed(1)}%</span>
                      </td>
                      <td>{(s.sharePct || 0).toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: '10px 16px', fontSize: '.6rem', color: 'var(--muted)', fontFamily: 'JetBrains Mono,monospace', borderTop: '1.5px solid var(--border)' }}>
              Source: AMFI · portal.amfiindia.com · {data.date}
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
