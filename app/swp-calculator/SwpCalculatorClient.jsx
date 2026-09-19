'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import {
  SWP_FREQ,
  calculateSWP,
  buildMonthlyNavMap,
  runNAVBacktest,
  fmtINR,
  fmtINRFull,
  fmtINRShort,
} from '@/lib/calculatorMath';

export default function SwpCalculatorClient() {
  // Mode: 'haveCorpus' | 'needIncome' | 'backtest'
  const [swpMode, setSwpMode] = useState('haveCorpus');

  // Parameters for projected modes
  const [corpus, setCorpus] = useState(5000000);
  const [withdrawal, setWithdrawal] = useState(30000);
  const [targetIncome, setTargetIncome] = useState(30000);
  const [rate, setRate] = useState(10);
  const [freq, setFreq] = useState('monthly');
  const [durationYears, setDurationYears] = useState(20);
  const [stepup, setStepup] = useState(0);
  const [inflation, setInflation] = useState(6);
  const [delayOn, setDelayOn] = useState(false);
  const [delayMonths, setDelayMonths] = useState(36); // 3 years default
  const [delayRate, setDelayRate] = useState(10);
  const [showSchedule, setShowSchedule] = useState(false);

  // Real NAV Backtester states
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedFund, setSelectedFund] = useState(null); // { code, name, navMap, availableYears }
  const [loadingNav, setLoadingNav] = useState(false);
  const [btStartYear, setBtStartYear] = useState('');
  const [btStartMonth, setBtStartMonth] = useState(1);
  const [btEndYear, setBtEndYear] = useState('');
  const [btEndMonth, setBtEndMonth] = useState(12);
  const [btCorpus, setBtCorpus] = useState(5000000);
  const [btWithdrawal, setBtWithdrawal] = useState(30000);
  const [btStepup, setBtStepup] = useState(0);
  const [btDelayOn, setBtDelayOn] = useState(false);
  const [btDelayMonths, setBtDelayMonths] = useState(36);

  const searchTimerRef = useRef(null);
  const dropdownRef = useRef(null);

  // Outside click listener for dropdown
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Projected SWP calculation
  const swpResult = useMemo(() => {
    return calculateSWP({
      mode: swpMode === 'needIncome' ? 'needIncome' : 'haveCorpus',
      corpus,
      withdrawal,
      targetIncome,
      rate,
      freq,
      durationYears,
      stepup,
      inflation,
      delayOn,
      delayMonths,
      delayRate,
    });
  }, [
    swpMode,
    corpus,
    withdrawal,
    targetIncome,
    rate,
    freq,
    durationYears,
    stepup,
    inflation,
    delayOn,
    delayMonths,
    delayRate,
  ]);

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

  // Select fund for backtester
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
      console.error('Failed to load NAV data:', err);
    } finally {
      setLoadingNav(false);
    }
  };

  // Real NAV Backtest result
  const backtestResult = useMemo(() => {
    if (!selectedFund || !selectedFund.navMap || !btStartYear || !btEndYear) return null;
    return runNAVBacktest(
      selectedFund.navMap,
      parseInt(btStartYear),
      parseInt(btStartMonth),
      btCorpus,
      btWithdrawal,
      btStepup,
      6,
      btDelayOn ? btDelayMonths : 0,
      parseInt(btEndYear),
      parseInt(btEndMonth)
    );
  }, [
    selectedFund,
    btStartYear,
    btStartMonth,
    btEndYear,
    btEndMonth,
    btCorpus,
    btWithdrawal,
    btStepup,
    btDelayOn,
    btDelayMonths,
  ]);

  // Fuel gauge health computation
  const healthPct = swpResult.survives
    ? Math.min(100, Math.round((swpResult.finalCorpus / (swpResult.startCorpus || 1)) * 100))
    : Math.max(0, Math.round(((swpResult.depleted || 0) / durationYears) * 100));

  const fuelColor = swpResult.survives
    ? 'linear-gradient(90deg, #00897b, #26a69a, #4db6ac)'
    : healthPct > 60
    ? 'linear-gradient(90deg, #f57f17, #fb8c00, #ffa726)'
    : 'linear-gradient(90deg, #b71c1c, #e53935, #ef5350)';

  return (
    <div className="swp-calc-container">
      {/* ── Mode Switcher ── */}
      <div className="swp-mode-nav" role="tablist" aria-label="SWP Modes">
        <button
          className={`swp-mode-btn ${swpMode === 'haveCorpus' ? 'active' : ''}`}
          onClick={() => setSwpMode('haveCorpus')}
          role="tab"
          aria-selected={swpMode === 'haveCorpus'}
        >
          I Have a Corpus
        </button>
        <button
          className={`swp-mode-btn ${swpMode === 'needIncome' ? 'active' : ''}`}
          onClick={() => setSwpMode('needIncome')}
          role="tab"
          aria-selected={swpMode === 'needIncome'}
        >
          I Need ₹X/Month
        </button>
        <button
          className={`swp-mode-btn highlight ${swpMode === 'backtest' ? 'active' : ''}`}
          onClick={() => setSwpMode('backtest')}
          role="tab"
          aria-selected={swpMode === 'backtest'}
        >
          📊 Real NAV Backtester
        </button>
      </div>

      {swpMode !== 'backtest' ? (
        <>
          {/* ── Journey Phase Strip ── */}
          <div className="swp-journey-strip">
            <div className="journey-phase">
              <span className="phase-icon">📈</span>
              <div>
                <span className="phase-lbl">Starting Corpus</span>
                <span className="phase-val mono">
                  {fmtINRFull(swpMode === 'haveCorpus' ? corpus : swpResult.startCorpus)}
                </span>
              </div>
            </div>

            {delayOn && (
              <>
                <span className="journey-arrow">→</span>
                <div className="journey-phase highlight">
                  <span className="phase-icon">⏳</span>
                  <div>
                    <span className="phase-lbl">Accumulation Phase</span>
                    <span className="phase-val mono">
                      {fmtINRFull(swpResult.startCorpus)} ({(delayMonths / 12).toFixed(1)}Y delay)
                    </span>
                  </div>
                </div>
              </>
            )}

            <span className="journey-arrow">→</span>
            <div className="journey-phase">
              <span className="phase-icon">💸</span>
              <div>
                <span className="phase-lbl">Monthly Withdrawal</span>
                <span className="phase-val mono">
                  {fmtINRFull(swpMode === 'haveCorpus' ? withdrawal : targetIncome)}/mo
                </span>
              </div>
            </div>
          </div>

          <div className="swp-calc-grid">
            {/* Left: Input Controls */}
            <div className="swp-calc-card swp-inputs-panel">
              <h3 className="swp-panel-title">Retirement Cashflow Settings</h3>

              {swpMode === 'haveCorpus' ? (
                /* Have Corpus Mode */
                <>
                  <div className="swp-input-group">
                    <div className="swp-input-header">
                      <label htmlFor="swp-corpus">Initial Corpus Amount</label>
                      <span className="swp-val-pill">{fmtINRFull(corpus)}</span>
                    </div>
                    <input
                      type="range"
                      id="swp-corpus"
                      min={500000}
                      max={50000000}
                      step={100000}
                      value={corpus}
                      onChange={(e) => setCorpus(Number(e.target.value))}
                      className="swp-slider"
                    />
                    <div className="swp-quick-pills">
                      {[2500000, 5000000, 10000000, 20000000].map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={`swp-pill-btn ${corpus === c ? 'active' : ''}`}
                          onClick={() => setCorpus(c)}
                        >
                          ₹{fmtINR(c)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="swp-input-group">
                    <div className="swp-input-header">
                      <label htmlFor="swp-withdrawal">Monthly Withdrawal</label>
                      <span className="swp-val-pill">{fmtINRFull(withdrawal)}/mo</span>
                    </div>
                    <input
                      type="range"
                      id="swp-withdrawal"
                      min={5000}
                      max={500000}
                      step={2000}
                      value={withdrawal}
                      onChange={(e) => setWithdrawal(Number(e.target.value))}
                      className="swp-slider"
                    />
                    <div className="swp-quick-pills">
                      {[20000, 30000, 50000, 75000, 100000].map((w) => (
                        <button
                          key={w}
                          type="button"
                          className={`swp-pill-btn ${withdrawal === w ? 'active' : ''}`}
                          onClick={() => setWithdrawal(w)}
                        >
                          ₹{w / 1000}k
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                /* Need Income Mode */
                <div className="swp-input-group">
                  <div className="swp-input-header">
                    <label htmlFor="target-income">Target Monthly Income</label>
                    <span className="swp-val-pill">{fmtINRFull(targetIncome)}/mo</span>
                  </div>
                  <input
                    type="range"
                    id="target-income"
                    min={10000}
                    max={500000}
                    step={2500}
                    value={targetIncome}
                    onChange={(e) => setTargetIncome(Number(e.target.value))}
                    className="swp-slider"
                  />
                  <div className="swp-quick-pills">
                    {[25000, 50000, 75000, 100000, 150000].map((w) => (
                      <button
                        key={w}
                        type="button"
                        className={`swp-pill-btn ${targetIncome === w ? 'active' : ''}`}
                        onClick={() => setTargetIncome(w)}
                      >
                        ₹{w / 1000}k
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Expected Return Rate */}
              <div className="swp-input-group">
                <div className="swp-input-header">
                  <label htmlFor="swp-rate">Expected Return Rate (% p.a.)</label>
                  <span className="swp-val-pill">{rate}%</span>
                </div>
                <input
                  type="range"
                  id="swp-rate"
                  min={4}
                  max={18}
                  step={0.5}
                  value={rate}
                  onChange={(e) => setRate(Number(e.target.value))}
                  className="swp-slider"
                />
              </div>

              {/* Tenure */}
              <div className="swp-input-group">
                <div className="swp-input-header">
                  <label htmlFor="swp-duration">Payout Duration</label>
                  <span className="swp-val-pill">{durationYears} Years</span>
                </div>
                <input
                  type="range"
                  id="swp-duration"
                  min={5}
                  max={40}
                  step={1}
                  value={durationYears}
                  onChange={(e) => setDurationYears(Number(e.target.value))}
                  className="swp-slider"
                />
              </div>

              {/* Annual Step-Up */}
              <div className="swp-input-group">
                <div className="swp-input-header">
                  <label htmlFor="swp-stepup">Annual Step-Up (% p.a.)</label>
                  <span className="swp-val-pill">{stepup}%</span>
                </div>
                <input
                  type="range"
                  id="swp-stepup"
                  min={0}
                  max={15}
                  step={1}
                  value={stepup}
                  onChange={(e) => setStepup(Number(e.target.value))}
                  className="swp-slider"
                />
                <span className="swp-input-hint">
                  Increases payout annually to counter lifestyle inflation.
                </span>
              </div>

              {/* Delay Phase Toggle */}
              <div className="swp-delay-toggle-wrap">
                <label className="delay-checkbox-label">
                  <input
                    type="checkbox"
                    checked={delayOn}
                    onChange={(e) => setDelayOn(e.target.checked)}
                  />
                  <span>Add Delay / Accumulation Period (Pre-Retirement)</span>
                </label>

                {delayOn && (
                  <div className="delay-controls">
                    <div className="swp-input-header">
                      <label>Delay Duration</label>
                      <span className="swp-val-pill">{(delayMonths / 12).toFixed(1)} Years</span>
                    </div>
                    <input
                      type="range"
                      min={6}
                      max={120}
                      step={6}
                      value={delayMonths}
                      onChange={(e) => setDelayMonths(Number(e.target.value))}
                      className="swp-slider"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Right: Results & Fuel Gauge */}
            <div className="swp-calc-card swp-results-panel">
              <h3 className="swp-panel-title">Corpus Longevity &amp; Sustainability</h3>

              {/* Longevity Fuel Gauge */}
              <div className="fuel-gauge-card">
                <div className="fuel-header">
                  <span className="fuel-title">Corpus Health Score</span>
                  <span className="fuel-pct mono">{healthPct}%</span>
                </div>
                <div className="fuel-track">
                  <div
                    className="fuel-fill"
                    style={{ width: `${Math.max(3, healthPct)}%`, background: fuelColor }}
                  />
                </div>
                <div className="fuel-verdict">
                  {swpResult.survives ? (
                    <span className="verdict-good">
                      ✅ Outlasts full {durationYears}-year horizon with surplus corpus!
                    </span>
                  ) : (
                    <span className="verdict-bad">
                      ⚠️ Alert: Corpus depletes around Year {swpResult.depleted?.toFixed(1)}. Consider reducing withdrawal or stepping down payout.
                    </span>
                  )}
                </div>
              </div>

              {/* Primary Metric Banner */}
              <div className="swp-primary-banner">
                {swpMode === 'haveCorpus' ? (
                  <>
                    <span className="swp-banner-lbl">
                      {swpResult.survives ? 'Estimated Remaining Corpus' : 'Depletion Point'}
                    </span>
                    <div className="swp-banner-amt mono">
                      {swpResult.survives ? fmtINRFull(swpResult.finalCorpus) : `Year ${swpResult.depleted?.toFixed(1)}`}
                    </div>
                    <span className="swp-banner-sub">
                      Total Withdrawn: <strong>{fmtINRFull(swpResult.totalWithdrawn)}</strong> over {durationYears} years
                    </span>
                  </>
                ) : (
                  <>
                    <span className="swp-banner-lbl">Required Starting Corpus</span>
                    <div className="swp-banner-amt mono">{fmtINRFull(swpResult.startCorpus)}</div>
                    <span className="swp-banner-sub">
                      Needed to support {fmtINRFull(targetIncome)}/month for {durationYears} years
                    </span>
                  </>
                )}
              </div>

              {/* 8-Point Stat Grid */}
              <div className="swp-stat-grid">
                <div className="swp-stat-box highlight">
                  <span className="stat-lbl">Annual Income</span>
                  <span className="stat-val mono">{fmtINRFull(swpResult.annualIncome)}</span>
                  <span className="stat-sub">{swpResult.yieldPct}% of Corpus</span>
                </div>
                <div className="swp-stat-box">
                  <span className="stat-lbl">Safe Withdrawal Rate</span>
                  <span className="stat-val mono">{fmtINRFull(swpResult.sustWithdrawal)}/mo</span>
                  <span className="stat-sub">Zero Principal Depletion</span>
                </div>
                <div className="swp-stat-box">
                  <span className="stat-lbl">Total Cash Paid Out</span>
                  <span className="stat-val mono">{fmtINRFull(swpResult.totalWithdrawn)}</span>
                  <span className="stat-sub">{durationYears} Years Total</span>
                </div>
                <div className="swp-stat-box">
                  <span className="stat-lbl">Wealth Multiple</span>
                  <span className="stat-val mono">{swpResult.wealthMultiple}x</span>
                  <span className="stat-sub">(Withdrawn + Remaining) / Initial</span>
                </div>
              </div>

              {/* Toggle Schedule Table */}
              <button
                type="button"
                className="swp-schedule-toggle"
                onClick={() => setShowSchedule(!showSchedule)}
              >
                {showSchedule ? '▲ Hide Year-by-Year Cashflow Table' : '▼ View Year-by-Year Cashflow Table'}
              </button>

              {showSchedule && (
                <div className="swp-table-wrap">
                  <table className="swp-table">
                    <thead>
                      <tr>
                        <th>Year</th>
                        <th>Payout/Mo</th>
                        <th>Withdrawn</th>
                        <th>Corpus Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {swpResult.sim.snaps.slice(1).map((s) => (
                        <tr key={s.period}>
                          <td className="mono">Year {s.period}</td>
                          <td className="mono">{fmtINRFull(s.payout)}</td>
                          <td className="mono">{fmtINRFull(s.totalWithdrawn)}</td>
                          <td className={`mono bold ${s.corpus <= 0 ? 'depleted' : ''}`}>
                            {s.corpus <= 0 ? 'Depleted (₹0)' : fmtINRFull(s.corpus)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      ) : (
        /* ── Real NAV Backtester Mode ── */
        <div className="swp-calc-card swp-bt-panel">
          <div className="swp-bt-header">
            <div>
              <span className="swp-badge-live">Live Historical AMFI Replay</span>
              <h3 className="swp-panel-title">Replay Actual Monthly SWP Redemptions on Real Fund NAVs</h3>
              <p className="swp-panel-desc">
                Unlike theoretical models that assume linear compound returns, this tool replays real monthly unit sales against actual historical AMFI NAVs, accounting for market crashes and computing real XIRR.
              </p>
            </div>
          </div>

          {/* Search Section */}
          <div className="swp-bt-search-section" ref={dropdownRef}>
            <label className="swp-label-sub">1. Search Any AMFI Mutual Fund Scheme</label>
            <div className="swp-search-input-wrap">
              <input
                type="text"
                className="swp-search-input"
                placeholder="Type scheme name (e.g. Parag Parikh Flexi Cap, HDFC Top 100, ICICI Bluechip)..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                onFocus={() => {
                  if (searchResults.length > 0) setShowDropdown(true);
                }}
              />
              {isSearching && <span className="swp-spinner">Searching...</span>}
            </div>

            {showDropdown && searchResults.length > 0 && (
              <div className="swp-dropdown-list">
                {searchResults.map((f) => (
                  <button
                    key={f.schemeCode}
                    type="button"
                    className="swp-dropdown-item"
                    onClick={() => selectFund(f)}
                  >
                    <span className="fund-name">{f.schemeName}</span>
                    <span className="fund-code">#{f.schemeCode}</span>
                  </button>
                ))}
              </div>
            )}

            {selectedFund && (
              <div className="swp-selected-fund-chip">
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

          {loadingNav && <div className="swp-loading-state">Loading complete AMFI NAV history...</div>}

          {selectedFund && !loadingNav && (
            <div className="swp-bt-controls-grid">
              <div className="swp-input-group">
                <label>Starting Corpus (₹)</label>
                <input
                  type="number"
                  className="swp-text-input mono"
                  value={btCorpus}
                  onChange={(e) => setBtCorpus(Math.max(10000, Number(e.target.value)))}
                />
              </div>

              <div className="swp-input-group">
                <label>Monthly Withdrawal (₹)</label>
                <input
                  type="number"
                  className="swp-text-input mono"
                  value={btWithdrawal}
                  onChange={(e) => setBtWithdrawal(Math.max(100, Number(e.target.value)))}
                />
              </div>

              <div className="swp-input-group">
                <label>Start Year</label>
                <select
                  className="swp-select-field mono"
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

              <div className="swp-input-group">
                <label>End Year</label>
                <select
                  className="swp-select-field mono"
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
            <div className="swp-bt-results-card">
              <div className="swp-bt-results-grid">
                <div className="swp-stat-box highlight">
                  <span className="stat-lbl">Historical XIRR</span>
                  <span className="stat-val mono gain">{backtestResult.xirr ? `${backtestResult.xirr}%` : 'N/A'}</span>
                  <span className="stat-sub">Realized Annual Return</span>
                </div>
                <div className="swp-stat-box">
                  <span className="stat-lbl">Final Remaining Corpus</span>
                  <span className="stat-val mono">{fmtINRFull(backtestResult.finalCorpus)}</span>
                  <span className="stat-sub">
                    {backtestResult.depleted === null ? '✅ Survived Period' : `⚠️ Depleted at Month ${backtestResult.depleted}`}
                  </span>
                </div>
                <div className="swp-stat-box">
                  <span className="stat-lbl">Total Cash Paid Out</span>
                  <span className="stat-val mono">{fmtINRFull(backtestResult.totalWithdrawn)}</span>
                  <span className="stat-sub">{backtestResult.withdrawalMonths} Monthly Payouts</span>
                </div>
                <div className="swp-stat-box">
                  <span className="stat-lbl">Capital Multiple</span>
                  <span className="stat-val mono">
                    {((backtestResult.totalWithdrawn + backtestResult.finalCorpus) / (btCorpus || 1)).toFixed(2)}x
                  </span>
                  <span className="stat-sub">(Withdrawn + Balance) / Initial</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Styled JSX */}
      <style jsx>{`
        .swp-calc-container {
          margin-bottom: 36px;
        }
        .swp-mode-nav {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .swp-mode-btn {
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
        .swp-mode-btn:hover {
          border-color: var(--g3);
          color: var(--g1);
        }
        .swp-mode-btn.active {
          background: var(--g1);
          color: #fff;
          border-color: var(--g1);
        }
        .swp-mode-btn.highlight {
          border-color: var(--g2);
          color: var(--g1);
          background: var(--g-xlight);
        }
        .swp-mode-btn.highlight.active {
          background: var(--g2);
          color: #fff;
        }
        .swp-journey-strip {
          display: flex;
          align-items: center;
          gap: 12px;
          background: #fff;
          border: 1.5px solid var(--border);
          border-radius: 12px;
          padding: 14px 20px;
          margin-bottom: 20px;
          flex-wrap: wrap;
        }
        .journey-phase {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .phase-icon {
          font-size: 1.3rem;
        }
        .phase-lbl {
          display: block;
          font-size: 0.65rem;
          font-weight: 800;
          text-transform: uppercase;
          color: var(--muted);
        }
        .phase-val {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--g1);
        }
        .journey-arrow {
          color: var(--border2);
          font-size: 1.2rem;
          font-weight: 700;
        }
        .swp-calc-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        @media (max-width: 860px) {
          .swp-calc-grid {
            grid-template-columns: 1fr;
          }
        }
        .swp-calc-card {
          background: #fff;
          border: 1.5px solid var(--border);
          border-radius: 14px;
          padding: 24px;
          box-shadow: 0 2px 12px rgba(46, 125, 50, 0.05);
        }
        .swp-panel-title {
          font-size: 1.05rem;
          font-weight: 800;
          color: var(--g1);
          margin-bottom: 16px;
        }
        .swp-panel-desc {
          font-size: 0.85rem;
          color: var(--muted);
          line-height: 1.5;
          margin-bottom: 16px;
        }
        .swp-input-group {
          margin-bottom: 18px;
        }
        .swp-input-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 6px;
        }
        .swp-input-header label {
          font-size: 0.75rem;
          font-weight: 700;
          color: var(--text2);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .swp-val-pill {
          font-family: 'JetBrains Mono', monospace;
          font-size: 0.85rem;
          font-weight: 800;
          color: var(--g1);
          background: var(--g-xlight);
          padding: 3px 8px;
          border-radius: 6px;
          border: 1px solid var(--border);
        }
        .swp-slider {
          width: 100%;
          height: 6px;
          background: var(--border);
          border-radius: 4px;
          outline: none;
          accent-color: var(--g2);
          cursor: pointer;
        }
        .swp-quick-pills {
          display: flex;
          gap: 6px;
          margin-top: 8px;
          flex-wrap: wrap;
        }
        .swp-pill-btn {
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
        .swp-pill-btn:hover,
        .swp-pill-btn.active {
          background: var(--g2);
          color: #fff;
          border-color: var(--g2);
        }
        .swp-input-hint {
          font-size: 0.72rem;
          color: var(--muted);
          display: block;
          margin-top: 4px;
        }
        .swp-delay-toggle-wrap {
          border-top: 1px solid var(--border);
          padding-top: 14px;
          margin-top: 14px;
        }
        .delay-checkbox-label {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.82rem;
          font-weight: 700;
          color: var(--g1);
          cursor: pointer;
        }
        .delay-controls {
          margin-top: 12px;
          background: var(--s2);
          padding: 12px;
          border-radius: 8px;
        }
        .fuel-gauge-card {
          background: var(--s2);
          border: 1.5px solid var(--border);
          border-radius: 10px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .fuel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .fuel-title {
          font-size: 0.75rem;
          font-weight: 800;
          text-transform: uppercase;
          color: var(--muted);
        }
        .fuel-pct {
          font-size: 0.95rem;
          font-weight: 800;
          color: var(--g1);
        }
        .fuel-track {
          height: 10px;
          background: var(--border);
          border-radius: 6px;
          overflow: hidden;
          margin-bottom: 10px;
        }
        .fuel-fill {
          height: 100%;
          border-radius: 6px;
          transition: width 0.3s ease;
        }
        .fuel-verdict {
          font-size: 0.8rem;
          font-weight: 600;
        }
        .verdict-good {
          color: #00695c;
        }
        .verdict-bad {
          color: #c62828;
        }
        .swp-primary-banner {
          background: var(--g-xlight);
          border: 1.5px solid var(--border);
          border-radius: 10px;
          padding: 16px;
          text-align: center;
          margin-bottom: 16px;
        }
        .swp-banner-lbl {
          display: block;
          font-size: 0.7rem;
          font-weight: 800;
          text-transform: uppercase;
          color: var(--muted);
          letter-spacing: 0.6px;
          margin-bottom: 4px;
        }
        .swp-banner-amt {
          font-size: 1.7rem;
          font-weight: 800;
          color: var(--g1);
          margin-bottom: 4px;
        }
        .swp-banner-sub {
          font-size: 0.78rem;
          color: var(--text2);
        }
        .swp-stat-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }
        .swp-stat-box {
          background: var(--s2);
          border: 1.5px solid var(--border);
          border-radius: 9px;
          padding: 12px;
          text-align: center;
        }
        .swp-stat-box.highlight {
          background: #e0f2f1;
          border-color: #80cbc4;
        }
        .stat-lbl {
          display: block;
          font-size: 0.62rem;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.6px;
          color: var(--muted);
          margin-bottom: 4px;
        }
        .stat-val {
          display: block;
          font-size: 1rem;
          font-weight: 800;
          color: var(--text);
          margin-bottom: 2px;
        }
        .stat-val.gain {
          color: var(--g1);
        }
        .stat-sub {
          font-size: 0.68rem;
          color: var(--muted);
        }
        .swp-schedule-toggle {
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
        .swp-schedule-toggle:hover {
          background: var(--g-xlight);
        }
        .swp-table-wrap {
          margin-top: 14px;
          max-height: 220px;
          overflow-y: auto;
          border: 1px solid var(--border);
          border-radius: 8px;
        }
        .swp-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.75rem;
        }
        .swp-table th {
          background: var(--s2);
          padding: 8px;
          text-align: right;
          font-size: 0.65rem;
          text-transform: uppercase;
          color: var(--muted);
          position: sticky;
          top: 0;
        }
        .swp-table th:first-child {
          text-align: left;
        }
        .swp-table td {
          padding: 7px 8px;
          border-top: 1px solid var(--border);
          text-align: right;
        }
        .swp-table td:first-child {
          text-align: left;
        }
        .swp-table td.depleted {
          color: #c62828;
        }

        /* Real NAV Backtest Styles */
        .swp-bt-search-section {
          position: relative;
          margin-bottom: 20px;
        }
        .swp-search-input-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .swp-search-input {
          width: 100%;
          padding: 10px 14px;
          border-radius: 8px;
          border: 1.5px solid var(--border2);
          font-size: 0.9rem;
          outline: none;
        }
        .swp-search-input:focus {
          border-color: var(--g2);
        }
        .swp-spinner {
          position: absolute;
          right: 12px;
          font-size: 0.75rem;
          color: var(--muted);
        }
        .swp-dropdown-list {
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
        .swp-dropdown-item {
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
        .swp-dropdown-item:hover {
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
        .swp-selected-fund-chip {
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
        .swp-bt-controls-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
          margin-bottom: 20px;
        }
        @media (max-width: 768px) {
          .swp-bt-controls-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        .swp-bt-results-card {
          background: var(--s2);
          border: 1.5px solid var(--border);
          border-radius: 12px;
          padding: 20px;
        }
        .swp-bt-results-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 12px;
        }
        @media (max-width: 768px) {
          .swp-bt-results-grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        .swp-loading-state {
          padding: 24px;
          text-align: center;
          color: var(--muted);
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  );
}
