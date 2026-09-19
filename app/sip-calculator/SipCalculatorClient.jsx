'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  FREQ,
  simulateSIP,
  buildMonthlyNavMap,
  runSIPBacktest,
  fmtINR,
  fmtINRFull,
  fmtINRShort,
} from '@/lib/calculatorMath';

export default function SipCalculatorClient() {
  // Calculator mode: 'sip' | 'stepup' | 'lump' | 'both' | 'backtest'
  const [calcMode, setCalcMode] = useState('sip');

  // Input states
  const [sipAmt, setSipAmt] = useState(10000);
  const [lumpAmt, setLumpAmt] = useState(100000);
  const [durationYears, setDurationYears] = useState(10);
  const [annualRate, setAnnualRate] = useState(12);
  const [stepupPct, setStepupPct] = useState(10);
  const [freq, setFreq] = useState('monthly');
  const [showSchedule, setShowSchedule] = useState(false);

  // Real NAV Backtester states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedFund, setSelectedFund] = useState(null); // { code, name, navMap }
  const [loadingNav, setLoadingNav] = useState(false);
  const [btStartYear, setBtStartYear] = useState('');
  const [btStartMonth, setBtStartMonth] = useState(1);
  const [btEndYear, setBtEndYear] = useState('');
  const [btEndMonth, setBtEndMonth] = useState(12);
  const [btStepup, setBtStepup] = useState(0);

  const searchTimerRef = useRef(null);
  const dropdownRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Projected SIP Calculation
  const projection = useMemo(() => {
    const isLump = calcMode === 'lump';
    const isStepup = calcMode === 'stepup';
    const isBoth = calcMode === 'both';

    return simulateSIP({
      mode: isLump ? 'lump' : isBoth ? 'both' : 'sip',
      freq,
      sipAmt: isLump ? 0 : sipAmt,
      lumpAmt: isLump || isBoth ? lumpAmt : 0,
      totalYears: durationYears,
      annualRate,
      stepupPct: isStepup ? stepupPct : 0,
    });
  }, [calcMode, freq, sipAmt, lumpAmt, durationYears, annualRate, stepupPct]);

  // Fund search handler
  const handleSearch = (q) => {
    setSearchQuery(q);
    if (!q || q.trim().length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    clearTimeout(searchTimerRef.current);
    setIsSearching(true);
    setShowDropdown(true);

    searchTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/mf?q=' + encodeURIComponent(q.trim()));
        const data = await res.json();
        // Exclude Direct plans and institutional funds
        const filtered = (data || []).filter(
          (f) =>
            !f.schemeName.toLowerCase().includes('direct') &&
            !f.schemeName.toLowerCase().includes('institutional')
        );
        setSearchResults(filtered.slice(0, 15));
      } catch (err) {
        console.error('Fund search failed:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  };

  // Fund select handler
  const selectFund = async (fund) => {
    setShowDropdown(false);
    setSearchQuery('');
    setLoadingNav(true);
    try {
      const res = await fetch('/api/mf?code=' + fund.schemeCode);
      const json = await res.json();
      const records = json.data || [];
      const navMap = buildMonthlyNavMap(records);
      const keys = Object.keys(navMap).sort();

      if (keys.length > 0) {
        const years = [...new Set(keys.map((k) => k.slice(0, 4)))].sort();
        const firstYear = parseInt(years[0]);
        const lastYear = parseInt(years[years.length - 1]);
        const defStart = Math.min(firstYear + 5, lastYear - 1);

        setSelectedFund({
          code: fund.schemeCode,
          name: fund.schemeName,
          navMap,
          availableYears: years,
        });
        setBtStartYear(String(defStart));
        setBtStartMonth(1);
        setBtEndYear(String(lastYear));
        setBtEndMonth(12);
      }
    } catch (err) {
      console.error('Failed to load NAV data for backtest:', err);
    } finally {
      setLoadingNav(false);
    }
  };

  // Real NAV Backtest result
  const backtestResult = useMemo(() => {
    if (!selectedFund || !selectedFund.navMap || !btStartYear || !btEndYear) return null;
    return runSIPBacktest(
      selectedFund.navMap,
      parseInt(btStartYear),
      parseInt(btStartMonth),
      sipAmt,
      btStepup,
      parseInt(btEndYear),
      parseInt(btEndMonth)
    );
  }, [selectedFund, btStartYear, btStartMonth, btEndYear, btEndMonth, sipAmt, btStepup]);

  const gainPct = projection.finalCorpus > 0
    ? Math.round((projection.totalGain / projection.finalCorpus) * 100)
    : 0;

  return (
    <div className="sip-calc-container">
      {/* ── Mode Switcher ── */}
      <div className="sip-mode-nav" role="tablist" aria-label="SIP Calculator Modes">
        <button
          className={`sip-mode-btn ${calcMode === 'sip' ? 'active' : ''}`}
          onClick={() => setCalcMode('sip')}
          role="tab"
          aria-selected={calcMode === 'sip'}
        >
          Regular SIP
        </button>
        <button
          className={`sip-mode-btn ${calcMode === 'stepup' ? 'active' : ''}`}
          onClick={() => setCalcMode('stepup')}
          role="tab"
          aria-selected={calcMode === 'stepup'}
        >
          Step-Up SIP
        </button>
        <button
          className={`sip-mode-btn ${calcMode === 'lump' ? 'active' : ''}`}
          onClick={() => setCalcMode('lump')}
          role="tab"
          aria-selected={calcMode === 'lump'}
        >
          Lumpsum
        </button>
        <button
          className={`sip-mode-btn ${calcMode === 'both' ? 'active' : ''}`}
          onClick={() => setCalcMode('both')}
          role="tab"
          aria-selected={calcMode === 'both'}
        >
          SIP + Lumpsum
        </button>
        <button
          className={`sip-mode-btn highlight ${calcMode === 'backtest' ? 'active' : ''}`}
          onClick={() => setCalcMode('backtest')}
          role="tab"
          aria-selected={calcMode === 'backtest'}
        >
          📊 Real NAV Backtest
        </button>
      </div>

      {calcMode !== 'backtest' ? (
        /* ── Standard Projection Mode ── */
        <div className="sip-calc-grid">
          {/* Left: Interactive Controls */}
          <div className="sip-calc-card sip-inputs-panel">
            <h3 className="sip-panel-title">Investment Parameters</h3>

            {/* SIP Amount */}
            {calcMode !== 'lump' && (
              <div className="sip-input-group">
                <div className="sip-input-header">
                  <label htmlFor="sip-amt">Monthly Investment</label>
                  <span className="sip-val-pill">{fmtINRFull(sipAmt)}</span>
                </div>
                <input
                  type="range"
                  id="sip-amt"
                  min={500}
                  max={200000}
                  step={500}
                  value={sipAmt}
                  onChange={(e) => setSipAmt(Number(e.target.value))}
                  className="sip-slider"
                />
                <div className="sip-quick-pills">
                  {[2500, 5000, 10000, 25000, 50000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`sip-pill-btn ${sipAmt === val ? 'active' : ''}`}
                      onClick={() => setSipAmt(val)}
                    >
                      ₹{val / 1000}K
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Lumpsum Amount */}
            {(calcMode === 'lump' || calcMode === 'both') && (
              <div className="sip-input-group">
                <div className="sip-input-header">
                  <label htmlFor="lump-amt">Initial Lumpsum Amount</label>
                  <span className="sip-val-pill">{fmtINRFull(lumpAmt)}</span>
                </div>
                <input
                  type="range"
                  id="lump-amt"
                  min={10000}
                  max={5000000}
                  step={10000}
                  value={lumpAmt}
                  onChange={(e) => setLumpAmt(Number(e.target.value))}
                  className="sip-slider"
                />
                <div className="sip-quick-pills">
                  {[50000, 100000, 500000, 1000000].map((val) => (
                    <button
                      key={val}
                      type="button"
                      className={`sip-pill-btn ${lumpAmt === val ? 'active' : ''}`}
                      onClick={() => setLumpAmt(val)}
                    >
                      ₹{fmtINR(val)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step-Up Percentage */}
            {calcMode === 'stepup' && (
              <div className="sip-input-group">
                <div className="sip-input-header">
                  <label htmlFor="stepup-pct">Annual Step-Up (% p.a.)</label>
                  <span className="sip-val-pill">{stepupPct}%</span>
                </div>
                <input
                  type="range"
                  id="stepup-pct"
                  min={1}
                  max={30}
                  step={1}
                  value={stepupPct}
                  onChange={(e) => setStepupPct(Number(e.target.value))}
                  className="sip-slider"
                />
                <p className="sip-input-hint">
                  Your monthly SIP increases by {stepupPct}% every 12 months to match salary increments.
                </p>
              </div>
            )}

            {/* Expected Annual Return */}
            <div className="sip-input-group">
              <div className="sip-input-header">
                <label htmlFor="annual-rate">Expected Return Rate (% p.a.)</label>
                <span className="sip-val-pill">{annualRate}%</span>
              </div>
              <input
                type="range"
                id="annual-rate"
                min={1}
                max={30}
                step={0.5}
                value={annualRate}
                onChange={(e) => setAnnualRate(Number(e.target.value))}
                className="sip-slider"
              />
              <div className="sip-quick-pills">
                {[8, 10, 12, 14, 15].map((r) => (
                  <button
                    key={r}
                    type="button"
                    className={`sip-pill-btn ${annualRate === r ? 'active' : ''}`}
                    onClick={() => setAnnualRate(r)}
                  >
                    {r}%
                  </button>
                ))}
              </div>
            </div>

            {/* Time Horizon */}
            <div className="sip-input-group">
              <div className="sip-input-header">
                <label htmlFor="duration-yrs">Investment Horizon</label>
                <span className="sip-val-pill">{durationYears} Years</span>
              </div>
              <input
                type="range"
                id="duration-yrs"
                min={1}
                max={35}
                step={1}
                value={durationYears}
                onChange={(e) => setDurationYears(Number(e.target.value))}
                className="sip-slider"
              />
              <div className="sip-quick-pills">
                {[3, 5, 10, 15, 20, 25].map((y) => (
                  <button
                    key={y}
                    type="button"
                    className={`sip-pill-btn ${durationYears === y ? 'active' : ''}`}
                    onClick={() => setDurationYears(y)}
                  >
                    {y}Y
                  </button>
                ))}
              </div>
            </div>

            {/* Frequency Selector */}
            {calcMode !== 'lump' && (
              <div className="sip-input-group">
                <label htmlFor="freq-select" className="sip-label-sub">
                  Compounding &amp; Investment Frequency
                </label>
                <select
                  id="freq-select"
                  className="sip-select-field"
                  value={freq}
                  onChange={(e) => setFreq(e.target.value)}
                >
                  <option value="monthly">Monthly (Recommended)</option>
                  <option value="weekly">Weekly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="annually">Annually</option>
                  <option value="daily">Daily</option>
                </select>
              </div>
            )}
          </div>

          {/* Right: Results & Wealth Clock Ring */}
          <div className="sip-calc-card sip-results-panel">
            <div className="sip-results-header">
              <div>
                <span className="sip-badge-live">Live Projections</span>
                <h3 className="sip-panel-title">Maturity Wealth Projection</h3>
              </div>
              <div className="sip-wealth-clock">
                <svg className="wc-ring" viewBox="0 0 120 120" width="80" height="80">
                  <circle cx="60" cy="60" r="50" stroke="rgba(46,125,50,0.12)" strokeWidth="10" fill="none" />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    stroke="#2e7d32"
                    strokeWidth="10"
                    fill="none"
                    strokeDasharray="314.16"
                    strokeDashoffset={314.16 - (314.16 * gainPct) / 100}
                    strokeLinecap="round"
                    transform="rotate(-90 60 60)"
                  />
                </svg>
                <div className="wc-center">
                  <span className="wc-pct">{gainPct}%</span>
                  <span className="wc-lbl">Returns</span>
                </div>
              </div>
            </div>

            {/* Primary Result Headline */}
            <div className="sip-result-headline">
              <span className="sip-res-label">Expected Maturity Corpus</span>
              <div className="sip-res-amount">{fmtINRFull(projection.finalCorpus)}</div>
              <span className="sip-res-sub">
                Wealth Multiple: <strong>{((projection.finalCorpus / (projection.totalInvested || 1))).toFixed(2)}x</strong> on invested capital
              </span>
            </div>

            {/* Stat Row */}
            <div className="sip-stat-grid">
              <div className="sip-stat-box">
                <span className="sip-stat-lbl">Total Invested</span>
                <span className="sip-stat-val mono">{fmtINRFull(projection.totalInvested)}</span>
                <span className="sip-stat-sub">Principal</span>
              </div>
              <div className="sip-stat-box highlight">
                <span className="sip-stat-lbl">Estimated Gain</span>
                <span className="sip-stat-val mono gain">▲ {fmtINRFull(projection.totalGain)}</span>
                <span className="sip-stat-sub">+{projection.wealthGainPct}% Profit</span>
              </div>
            </div>

            {/* Visual Ratio Bar */}
            <div className="sip-ratio-wrap">
              <div className="sip-ratio-bar">
                <div
                  className="sip-ratio-inv"
                  style={{
                    width: `${Math.max(5, Math.min(95, 100 - gainPct))}%`,
                  }}
                  title={`Invested: ${fmtINRFull(projection.totalInvested)}`}
                />
                <div
                  className="sip-ratio-gain"
                  style={{
                    width: `${Math.max(5, Math.min(95, gainPct))}%`,
                  }}
                  title={`Gain: ${fmtINRFull(projection.totalGain)}`}
                />
              </div>
              <div className="sip-ratio-legend">
                <span className="leg-item">
                  <span className="leg-dot inv" /> Invested Capital ({100 - gainPct}%)
                </span>
                <span className="leg-item">
                  <span className="leg-dot gain" /> Compounded Gains ({gainPct}%)
                </span>
              </div>
            </div>

            {/* Toggle Annual Schedule */}
            <button
              type="button"
              className="sip-schedule-toggle"
              onClick={() => setShowSchedule(!showSchedule)}
            >
              {showSchedule ? '▲ Hide Year-by-Year Growth Table' : '▼ View Year-by-Year Growth Table'}
            </button>

            {showSchedule && (
              <div className="sip-table-wrap">
                <table className="sip-table">
                  <thead>
                    <tr>
                      <th>Year</th>
                      <th>Invested</th>
                      <th>Gain</th>
                      <th>Future Corpus</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projection.snaps.slice(1).map((s) => (
                      <tr key={s.label}>
                        <td className="mono">{s.label}</td>
                        <td className="mono">{fmtINRFull(s.invested)}</td>
                        <td className="mono gain">+{fmtINRFull(s.corpus - s.invested)}</td>
                        <td className="mono bold">{fmtINRFull(s.corpus)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Real AMFI NAV Backtest Mode ── */
        <div className="sip-calc-card sip-bt-panel">
          <div className="sip-bt-header">
            <div>
              <span className="sip-badge-live">Live AMFI Historical Replay</span>
              <h3 className="sip-panel-title">Replay Real SIP Cashflows Against Actual Fund NAVs</h3>
              <p className="sip-panel-desc">
                Unlike theoretical calculators that assume fixed returns, this backtester purchases mutual fund units at the actual AMFI NAV on each monthly investment date and calculates exact XIRR.
              </p>
            </div>
          </div>

          {/* Fund Selector */}
          <div className="sip-bt-search-section" ref={dropdownRef}>
            <label className="sip-label-sub">1. Search Any AMFI Mutual Fund Scheme</label>
            <div className="sip-search-input-wrap">
              <input
                type="text"
                className="sip-search-input"
                placeholder="Type scheme name (e.g. Parag Parikh Flexi Cap, HDFC Mid-Cap, Nippon Small Cap)..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowDropdown(true);
                }}
              />
              {isSearching && <span className="sip-spinner">Searching...</span>}
            </div>

            {showDropdown && searchResults.length > 0 && (
              <div className="sip-dropdown-list">
                {searchResults.map((f) => (
                  <button
                    key={f.schemeCode}
                    type="button"
                    className="sip-dropdown-item"
                    onClick={() => selectFund(f)}
                  >
                    <span className="fund-name">{f.schemeName}</span>
                    <span className="fund-code">#{f.schemeCode}</span>
                  </button>
                ))}
              </div>
            )}

            {selectedFund && (
              <div className="sip-selected-fund-chip">
                <span className="chip-icon">✅</span>
                <span className="chip-name">{selectedFund.name}</span>
                <button
                  type="button"
                  className="chip-clear"
                  onClick={() => setSelectedFund(null)}
                  title="Remove fund"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {loadingNav && <div className="sip-loading-state">Loading complete AMFI NAV history...</div>}

          {selectedFund && !loadingNav && (
            <div className="sip-bt-controls-grid">
              <div className="sip-input-group">
                <label>Monthly SIP (₹)</label>
                <input
                  type="number"
                  className="sip-text-input mono"
                  value={sipAmt}
                  onChange={(e) => setSipAmt(Math.max(100, Number(e.target.value)))}
                />
              </div>

              <div className="sip-input-group">
                <label>Annual Step-Up (%)</label>
                <input
                  type="number"
                  className="sip-text-input mono"
                  value={btStepup}
                  onChange={(e) => setBtStepup(Math.max(0, Number(e.target.value)))}
                />
              </div>

              <div className="sip-input-group">
                <label>Start Year</label>
                <select
                  className="sip-select-field mono"
                  value={btStartYear}
                  onChange={(e) => setBtStartYear(e.target.value)}
                >
                  {selectedFund.availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sip-input-group">
                <label>End Year</label>
                <select
                  className="sip-select-field mono"
                  value={btEndYear}
                  onChange={(e) => setBtEndYear(e.target.value)}
                >
                  {selectedFund.availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {backtestResult && (
            <div className="sip-bt-results-card">
              <div className="sip-bt-results-grid">
                <div className="sip-stat-box highlight">
                  <span className="sip-stat-lbl">Historical XIRR</span>
                  <span className="sip-stat-val mono gain">{backtestResult.xirr ? `${backtestResult.xirr}%` : 'N/A'}</span>
                  <span className="sip-stat-sub">Actual Annualized Return</span>
                </div>
                <div className="sip-stat-box">
                  <span className="sip-stat-lbl">Final Accumulated Corpus</span>
                  <span className="sip-stat-val mono">{fmtINRFull(backtestResult.finalCorpus)}</span>
                  <span className="sip-stat-sub">{backtestResult.multiple}x Capital Multiple</span>
                </div>
                <div className="sip-stat-box">
                  <span className="sip-stat-lbl">Total Cash Invested</span>
                  <span className="sip-stat-val mono">{fmtINRFull(backtestResult.totalInvested)}</span>
                  <span className="sip-stat-sub">{backtestResult.totalMonths} Monthly Installments</span>
                </div>
                <div className="sip-stat-box">
                  <span className="sip-stat-lbl">Accumulated Units</span>
                  <span className="sip-stat-val mono">{backtestResult.units.toLocaleString('en-IN')}</span>
                  <span className="sip-stat-sub">NAV: ₹{backtestResult.startNAV.toFixed(2)} → ₹{backtestResult.finalNAV.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Styled local CSS for clean component layout */}
      <style jsx>{`
        .sip-calc-container {
          margin-bottom: 36px;
        }
        .sip-mode-nav {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .sip-mode-btn {
          padding: 8px 16px;
          border-radius: 8px;
          border: 1.5px solid var(--border);
          background: #fff;
          color: var(--text2);
          font-family: 'Raleway', sans-serif;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
        }
        .sip-mode-btn:hover {
          border-color: var(--g3);
          color: var(--g1);
        }
        .sip-mode-btn.active {
          background: var(--g1);
          color: #fff;
          border-color: var(--g1);
        }
        .sip-mode-btn.highlight {
          border-color: var(--g2);
          color: var(--g1);
          background: var(--g-xlight);
        }
        .sip-mode-btn.highlight.active {
          background: var(--g2);
          color: #fff;
        }
        .sip-calc-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        @media (max-width: 860px) {
          .sip-calc-grid {
            grid-template-columns: 1fr;
          }
        }
        .sip-calc-card {
          background: #fff;
          border: 1.5px solid var(--border);
          border-radius: 14px;
          padding: 24px;
          box-shadow: 0 2px 12px rgba(46, 125, 50, 0.05);
        }
        .sip-panel-title {
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--g1);
          margin-bottom: 16px;
        }
        .sip-panel-desc {
          font-size: 0.85rem;
          color: var(--muted);
          line-height: 1.5;
          margin-bottom: 16px;
        }
        .sip-input-group {
          margin-bottom: 18px;
        }
        .sip-input-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .sip-input-header label {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text2);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .sip-val-pill {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85rem;
          font-weight: 800;
          color: var(--g1);
          background: var(--g-xlight);
          padding: 3px 8px;
          border-radius: 6px;
          border: 1px solid var(--border);
        }
        .sip-slider {
          width: 100%;
          height: 6px;
          background: var(--border);
          border-radius: 4px;
          outline: none;
          accent-color: var(--g2);
          cursor: pointer;
        }
        .sip-quick-pills {
          display: flex;
          gap: 6px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .sip-pill-btn {
          padding: 3px 8px;
          border-radius: 14px;
          border: 1px solid var(--border);
          background: var(--s2);
          color: var(--text2);
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .sip-pill-btn:hover,
        .sip-pill-btn.active {
          background: var(--g2);
          color: #fff;
          border-color: var(--g2);
        }
        .sip-input-hint {
          font-size: 0.72rem;
          color: var(--muted);
          margin-top: 4px;
        }
        .sip-label-sub {
          display: block;
          font-size: 0.72rem;
          font-weight: 700;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 6px;
        }
        .sip-select-field,
        .sip-text-input {
          width: 100%;
          padding: 8px 12px;
          border-radius: 8px;
          border: 1.5px solid var(--border);
          background: #fff;
          font-size: 0.88rem;
          color: var(--text);
          outline: none;
        }
        .sip-select-field:focus,
        .sip-text-input:focus {
          border-color: var(--g2);
        }
        .sip-results-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }
        .sip-badge-live {
          display: inline-block;
          font-size: 0.65rem;
          font-weight: 800;
          text-transform: uppercase;
          color: var(--g1);
          background: var(--g-xlight);
          padding: 2px 8px;
          border-radius: 10px;
          margin-bottom: 6px;
        }
        .sip-wealth-clock {
          position: relative;
          width: 80px;
          height: 80px;
        }
        .wc-center {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .wc-pct {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.82rem;
          font-weight: 800;
          color: var(--g1);
        }
        .wc-lbl {
          font-size: 0.55rem;
          font-weight: 600;
          color: var(--muted);
          text-transform: uppercase;
        }
        .sip-result-headline {
          background: var(--g-xlight);
          border: 1.5px solid var(--border);
          border-radius: 10px;
          padding: 16px;
          text-align: center;
          margin-bottom: 16px;
        }
        .sip-res-label {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          color: var(--muted);
          letter-spacing: 0.6px;
          display: block;
          margin-bottom: 4px;
        }
        .sip-res-amount {
          font-family: 'JetBrains Mono', monospace;
          font-size: 1.7rem;
          font-weight: 800;
          color: var(--g1);
          margin-bottom: 4px;
        }
        .sip-res-sub {
          font-size: 0.78rem;
          color: var(--text2);
        }
        .sip-stat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }
        .sip-stat-box {
          background: var(--s2);
          border: 1.5px solid var(--border);
          border-radius: 9px;
          padding: 12px;
          text-align: center;
        }
        .sip-stat-box.highlight {
          background: #e8f5e9;
          border-color: #a5d6a7;
        }
        .sip-stat-lbl {
          display: block;
          font-size: 0.62rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: var(--muted);
          margin-bottom: 4px;
        }
        .sip-stat-val {
          display: block;
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 2px;
        }
        .sip-stat-val.gain {
          color: var(--g1);
        }
        .sip-stat-sub {
          font-size: 0.68rem;
          color: var(--muted);
        }
        .sip-ratio-wrap {
          margin-bottom: 16px;
        }
        .sip-ratio-bar {
          height: 12px;
          border-radius: 6px;
          overflow: hidden;
          display: flex;
          background: var(--border);
          margin-bottom: 8px;
        }
        .sip-ratio-inv {
          background: #78909c;
          transition: width 0.3s ease;
        }
        .sip-ratio-gain {
          background: #2e7d32;
          transition: width 0.3s ease;
        }
        .sip-ratio-legend {
          display: flex;
          justify-content: space-between;
          font-size: 0.72rem;
          color: var(--text2);
        }
        .leg-item {
          display: flex;
          align-items: center;
          gap: 5px;
        }
        .leg-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        .leg-dot.inv {
          background: #78909c;
        }
        .leg-dot.gain {
          background: #2e7d32;
        }
        .sip-schedule-toggle {
          width: 100%;
          padding: 8px;
          background: transparent;
          border: 1px dashed var(--border2);
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--g1);
          cursor: pointer;
          transition: background 0.15s;
        }
        .sip-schedule-toggle:hover {
          background: var(--g-xlight);
        }
        .sip-table-wrap {
          margin-top: 14px;
          max-height: 220px;
          overflow-y: auto;
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .sip-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.75rem;
        }
        .sip-table th {
          background: var(--s2);
          padding: 8px;
          text-align: right;
          font-size: 0.65rem;
          text-transform: uppercase;
          color: var(--muted);
          position: sticky;
          top: 0;
        }
        .sip-table th:first-child {
          text-align: left;
        }
        .sip-table td {
          padding: 7px 8px;
          border-top: 1px solid var(--border);
          text-align: right;
        }
        .sip-table td:first-child {
          text-align: left;
        }
        .sip-table td.gain {
          color: var(--g1);
        }
        .sip-table td.bold {
          font-weight: 700;
        }

        /* Real NAV Backtest Styles */
        .sip-bt-search-section {
          position: relative;
          margin-bottom: 20px;
        }
        .sip-search-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .sip-search-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 8px;
          border: 1.5px solid var(--border2);
          font-size: 0.9rem;
          outline: none;
        }
        .sip-search-input:focus {
          border-color: var(--g2);
        }
        .sip-spinner {
          position: absolute;
          right: 12px;
          font-size: 0.75rem;
          color: var(--muted);
        }
        .sip-dropdown-list {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: #fff;
          border: 1.5px solid var(--border);
          border-radius: 8px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
          max-height: 250px;
          overflow-y: auto;
          z-index: 50;
          margin-top: 4px;
        }
        .sip-dropdown-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          width: 100%;
          padding: 10px 14px;
          text-align: left;
          background: none;
          border: none;
          border-bottom: 1px solid var(--border);
          cursor: pointer;
        }
        .sip-dropdown-item:hover {
          background: var(--g-xlight);
        }
        .fund-name {
          font-size: 0.82rem;
          font-weight: 600;
          color: var(--text);
        }
        .fund-code {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.7rem;
          color: var(--muted);
        }
        .sip-selected-fund-chip {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--g-xlight);
          border: 1px solid var(--g-light);
          border-radius: 8px;
          padding: 8px 12px;
          margin-top: 10px;
        }
        .chip-name {
          flex: 1;
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--g1);
        }
        .chip-clear {
          background: none;
          border: none;
          color: var(--muted);
          font-size: 0.9rem;
          cursor: pointer;
        }
        .sip-bt-controls-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 20px;
        }
        @media (max-width: 768px) {
          .sip-bt-controls-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        .sip-bt-results-card {
          background: var(--s2);
          border: 1.5px solid var(--border);
          border-radius: 12px;
          padding: 20px;
        }
        .sip-bt-results-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        @media (max-width: 768px) {
          .sip-bt-results-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        .sip-loading-state {
          padding: 24px;
          text-align: center;
          color: var(--muted);
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}
