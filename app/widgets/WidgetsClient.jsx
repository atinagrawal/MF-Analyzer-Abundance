'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

const TIME_HORIZONS = [
  { key: 'ret_1m', label: '1M', sub: '1 Month', type: 'Abs' },
  { key: 'ret_3m', label: '3M', sub: '3 Months', type: 'Abs' },
  { key: 'ret_6m', label: '6M', sub: '6 Months', type: 'Abs' },
  { key: 'ret_1y', label: '1Y', sub: '1 Year', type: 'CAGR' },
  { key: 'ret_3y', label: '3Y', sub: '3 Years', type: 'CAGR' },
  { key: 'ret_5y', label: '5Y', sub: '5 Years', type: 'CAGR' },
  { key: 'ret_7y', label: '7Y', sub: '7 Years', type: 'CAGR' },
  { key: 'ret_10y', label: '10Y', sub: '10 Years', type: 'CAGR' },
  { key: 'ret_inception', label: 'Inception', sub: 'Since Inception', type: 'CAGR' },
];

const FUND_CATEGORIES = [
  { key: 'All', label: 'All Categories' },
  { key: 'Flexi Cap', label: 'Flexi Cap' },
  { key: 'Large Cap', label: 'Large Cap' },
  { key: 'Large & Mid Cap', label: 'Large & Mid Cap' },
  { key: 'Mid Cap', label: 'Mid Cap' },
  { key: 'Small Cap', label: 'Small Cap' },
  { key: 'Multi Cap', label: 'Multi Cap' },
  { key: 'Focused', label: 'Focused Fund' },
  { key: 'Value', label: 'Value / Contra' },
  { key: 'ELSS', label: 'ELSS Tax Saver' },
  { key: 'Aggressive Hybrid', label: 'Aggressive Hybrid' },
  { key: 'Balanced Advantage', label: 'Balanced Advantage' },
  { key: 'Arbitrage', label: 'Arbitrage' },
  { key: 'Corporate Bond', label: 'Corporate Bond' },
  { key: 'Liquid', label: 'Liquid' },
];

export default function WidgetsClientWrapper() {
  return (
    <Suspense fallback={<div className="wdg-loading-shell">Loading Abundance Widgets…</div>}>
      <WidgetsClient />
    </Suspense>
  );
}

function WidgetsClient() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'market';
  const isMiniMode = searchParams.get('mini') === '1';

  const { data: session, status: authStatus } = useSession();

  // Widget state
  const [tab, setTab] = useState(initialTab); // 'market' | 'portfolio' | 'funds' | 'mini'
  const [refreshSec, setRefreshSec] = useState(30);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Market data state
  const [marketData, setMarketData] = useState(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState(null);

  // Portfolio data state
  const [portfolioData, setPortfolioData] = useState(null);
  const [portfolioLoading, setPortfolioLoading] = useState(true);
  const [portfolioError, setPortfolioError] = useState(null);

  // Funds data state
  const [fundsData, setFundsData] = useState([]);
  const [fundsLoading, setFundsLoading] = useState(true);
  const [fundCategory, setFundCategory] = useState('Flexi Cap');
  const [fundHorizon, setFundHorizon] = useState('ret_3y'); // default 3Y

  // Active horizon object
  const activeHorizonObj = TIME_HORIZONS.find(h => h.key === fundHorizon) || TIME_HORIZONS[4];

  // Inline Login state for unauthenticated users
  const [loginEmail, setLoginEmail] = useState('');
  const [loginStep, setLoginStep] = useState('idle'); // 'idle' | 'sending' | 'sent' | 'error'
  const [loginCode, setLoginCode] = useState('');
  const [loginErrMsg, setLoginErrMsg] = useState('');
  const [loginVerifying, setLoginVerifying] = useState(false);

  // Fetch Market Data
  const fetchMarket = useCallback(async () => {
    try {
      setMarketLoading(true);
      const res = await fetch('/api/market-watch');
      if (res.ok) {
        const data = await res.json();
        setMarketData(data);
        setMarketError(null);
      } else {
        setMarketError('Could not fetch market data');
      }
    } catch (err) {
      setMarketError(err.message);
    } finally {
      setMarketLoading(false);
    }
  }, []);

  // Fetch Portfolio Summary
  const fetchPortfolio = useCallback(async () => {
    try {
      setPortfolioLoading(true);
      const res = await fetch('/api/widgets/portfolio-summary');
      if (res.ok) {
        const data = await res.json();
        setPortfolioData(data);
        setPortfolioError(null);
      } else {
        setPortfolioError('Could not load portfolio summary');
      }
    } catch (err) {
      setPortfolioError(err.message);
    } finally {
      setPortfolioLoading(false);
    }
  }, []);

  // Fetch Top Funds
  const fetchFunds = useCallback(async () => {
    try {
      setFundsLoading(true);
      const res = await fetch('/api/screener');
      if (res.ok) {
        const data = await res.json();
        setFundsData(data.funds || data.rows || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFundsLoading(false);
    }
  }, []);

  // Master refresh function
  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.allSettled([
      fetchMarket(),
      fetchPortfolio(),
      fetchFunds(),
    ]);
    setLastUpdated(new Date());
    setIsRefreshing(false);
  }, [fetchMarket, fetchPortfolio, fetchFunds]);

  // Initial load
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Auto-refresh interval timer
  useEffect(() => {
    if (!refreshSec || refreshSec <= 0) return;
    const interval = setInterval(() => {
      refreshAll();
    }, refreshSec * 1000);
    return () => clearInterval(interval);
  }, [refreshSec, refreshAll]);

  // Handle Pop-out Mini Window
  const handlePopout = () => {
    const w = 400;
    const h = 640;
    const left = window.screen.width - w - 20;
    const top = 60;
    window.open(
      `/widgets?mini=1&tab=${tab}`,
      'AbundanceWidgets',
      `width=${w},height=${h},top=${top},left=${left},resizable=yes,scrollbars=yes,status=no,toolbar=no,menubar=no,location=no`
    );
  };

  // Inline Email Login Handlers
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    const email = loginEmail.trim().toLowerCase();
    if (!email) return;
    setLoginStep('sending');
    setLoginErrMsg('');
    try {
      const res = await signIn('resend', { email, redirect: false });
      if (res?.error) {
        setLoginStep('error');
        setLoginErrMsg('Could not send code. Please verify email.');
      } else {
        setLoginStep('sent');
      }
    } catch {
      setLoginStep('error');
      setLoginErrMsg('Something went wrong. Please try again.');
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    const code = loginCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setLoginErrMsg('Please enter a valid 6-digit code.');
      return;
    }
    setLoginVerifying(true);
    setLoginErrMsg('');
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim().toLowerCase(), code }),
      });
      const data = await res.json();
      if (data.ok) {
        // Refresh session & portfolio
        await fetchPortfolio();
        setLoginStep('idle');
        setLoginCode('');
      } else {
        setLoginErrMsg('Invalid or expired code. Please try again.');
      }
    } catch {
      setLoginErrMsg('Verification failed. Try again.');
    } finally {
      setLoginVerifying(false);
    }
  };

  // Filter top funds by category and horizon
  const topFundsFiltered = React.useMemo(() => {
    if (!fundsData || !fundsData.length) return [];
    let list = fundsData;
    if (fundCategory !== 'All') {
      const matchCat = fundCategory.toLowerCase().replace(/fund/i, '').trim();
      list = list.filter(f => f.category && f.category.toLowerCase().includes(matchCat));
    }
    return [...list]
      .filter(f => f[fundHorizon] != null && typeof f[fundHorizon] === 'number' && f[fundHorizon] > 0)
      .sort((a, b) => (b[fundHorizon] || 0) - (a[fundHorizon] || 0))
      .slice(0, 5);
  }, [fundsData, fundCategory, fundHorizon]);

  // Major Indices from market data
  const indices = marketData?.indices || [];
  const nifty50Detail = marketData?.nifty50;
  const isMarketOpen = marketData?.isOpen;
  const marketStatus = marketData?.marketStatus || 'Unknown';

  return (
    <div className={`wdg-container ${isMiniMode ? 'wdg-mini-mode' : ''}`}>
      {/* Widget Header */}
      <header className="wdg-header">
        <div className="wdg-brand">
          <img src="/logo-32.png" alt="Abundance" className="wdg-logo" width={22} height={22} />
          <span className="wdg-title">Abundance <b>Widgets</b></span>
        </div>

        <div className="wdg-actions">
          {/* Refresh pulse indicator */}
          <button
            className={`wdg-refresh-btn ${isRefreshing ? 'spinning' : ''}`}
            onClick={refreshAll}
            title="Refresh live data"
          >
            ↻
          </button>

          {/* Auto-refresh interval selector */}
          <select
            className="wdg-interval-sel"
            value={refreshSec}
            onChange={(e) => setRefreshSec(+e.target.value)}
            title="Auto-refresh interval"
          >
            <option value={15}>15s</option>
            <option value={30}>30s</option>
            <option value={60}>1m</option>
            <option value={300}>5m</option>
            <option value={0}>Manual</option>
          </select>

          {/* Pop-out button (only if not already mini popup) */}
          {!isMiniMode && (
            <button
              className="wdg-popout-btn"
              onClick={handlePopout}
              title="Pop out as floating desktop mini-window"
            >
              ❐ Mini Window
            </button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="wdg-tabs">
        <button
          className={`wdg-tab ${tab === 'market' ? 'active' : ''}`}
          onClick={() => setTab('market')}
        >
          📈 Market
        </button>
        <button
          className={`wdg-tab ${tab === 'portfolio' ? 'active' : ''}`}
          onClick={() => setTab('portfolio')}
        >
          💼 Portfolio
        </button>
        <button
          className={`wdg-tab ${tab === 'funds' ? 'active' : ''}`}
          onClick={() => setTab('funds')}
        >
          🏆 Top Funds
        </button>
        <button
          className={`wdg-tab ${tab === 'mini' ? 'active' : ''}`}
          onClick={() => setTab('mini')}
        >
          ⚡ Compact
        </button>
      </nav>

      {/* Body Content */}
      <main className="wdg-body">
        {/* ────────────────── 1. MARKET WATCH TAB ────────────────── */}
        {tab === 'market' && (
          <div className="wdg-pane">
            <div className="wdg-status-strip">
              <span className={`wdg-status-pill ${isMarketOpen ? 'open' : 'closed'}`}>
                <span className="wdg-dot" /> {isMarketOpen ? 'Market Live' : marketStatus}
              </span>
              <span className="wdg-time">
                {lastUpdated ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'Updating…'}
              </span>
            </div>

            {marketLoading && !marketData ? (
              <div className="wdg-loading">Loading live market data…</div>
            ) : marketError && !marketData ? (
              <div className="wdg-error">{marketError}</div>
            ) : (
              <>
                {/* Major Indices Grid */}
                <div className="wdg-indices-grid">
                  {indices.slice(0, 6).map((idx) => {
                    const isPos = (idx.change || 0) >= 0;
                    return (
                      <div key={idx.id} className="wdg-idx-card">
                        <div className="wdg-idx-name">{idx.name}</div>
                        <div className="wdg-idx-val">
                          {idx.last ? idx.last.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                        </div>
                        <div className={`wdg-idx-delta ${isPos ? 'pos' : 'neg'}`}>
                          {isPos ? '▲ +' : '▼ '}{idx.change != null ? idx.change.toFixed(2) : '0.00'} ({isPos ? '+' : ''}{idx.pct != null ? idx.pct.toFixed(2) : '0.00'}%)
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Nifty 50 Advance / Decline Meter */}
                {nifty50Detail && (
                  <div className="wdg-breadth-card">
                    <div className="wdg-sec-title">Nifty 50 Market Breadth</div>
                    <div className="wdg-breadth-bar">
                      <div
                        className="wdg-breadth-adv"
                        style={{ width: `${(nifty50Detail.advances / (nifty50Detail.advances + nifty50Detail.declines || 1)) * 100}%` }}
                        title={`Advances: ${nifty50Detail.advances}`}
                      />
                      <div
                        className="wdg-breadth-dec"
                        style={{ width: `${(nifty50Detail.declines / (nifty50Detail.advances + nifty50Detail.declines || 1)) * 100}%` }}
                        title={`Declines: ${nifty50Detail.declines}`}
                      />
                    </div>
                    <div className="wdg-breadth-labels">
                      <span className="pos">▲ {nifty50Detail.advances} Advances</span>
                      <span className="neg">▼ {nifty50Detail.declines} Declines</span>
                    </div>
                  </div>
                )}

                {/* Sector Heatmap Tiles */}
                {marketData?.sectoral?.length > 0 && (
                  <div className="wdg-sec-section">
                    <div className="wdg-sec-title">Sectoral Movers</div>
                    <div className="wdg-sector-grid">
                      {marketData.sectoral.slice(0, 8).map((s) => {
                        const isPos = (s.pct || 0) >= 0;
                        return (
                          <div key={s.id} className={`wdg-sec-chip ${isPos ? 'chip-pos' : 'chip-neg'}`}>
                            <span className="wdg-sec-name">{s.short || s.name}</span>
                            <span className="wdg-sec-pct">{isPos ? '+' : ''}{s.pct ? s.pct.toFixed(1) : 0.0}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ────────────────── 2. LIVE PORTFOLIO TAB ────────────────── */}
        {tab === 'portfolio' && (
          <div className="wdg-pane">
            {portfolioLoading && !portfolioData ? (
              <div className="wdg-loading">Loading portfolio summary…</div>
            ) : !portfolioData?.authenticated ? (
              /* Inline Login Card */
              <div className="wdg-auth-card">
                <div className="wdg-auth-icon">🔒</div>
                <h3>Live Portfolio Widget</h3>
                <p className="wdg-auth-sub">
                  Sign in with your registered email to view your live portfolio valuation and daily gains.
                </p>

                {loginStep !== 'sent' ? (
                  <form onSubmit={handleEmailSubmit} className="wdg-login-form">
                    <input
                      type="email"
                      className="wdg-input"
                      placeholder="Enter your email address"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                    />
                    <button
                      type="submit"
                      className="wdg-btn-primary"
                      disabled={loginStep === 'sending'}
                    >
                      {loginStep === 'sending' ? 'Sending Code…' : 'Get Sign-in Code →'}
                    </button>
                    {loginErrMsg && <div className="wdg-form-err">{loginErrMsg}</div>}

                    <div className="wdg-divider"><span>or</span></div>
                    <button
                      type="button"
                      className="wdg-btn-google"
                      onClick={() => signIn('google')}
                    >
                      Sign in with Google
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleVerifyOtp} className="wdg-login-form">
                    <div className="wdg-otp-msg">
                      Code sent to <b>{loginEmail}</b>
                    </div>
                    <input
                      type="text"
                      className="wdg-input wdg-input-otp"
                      placeholder="Enter 6-digit code"
                      maxLength={6}
                      value={loginCode}
                      onChange={(e) => setLoginCode(e.target.value)}
                      autoFocus
                      required
                    />
                    <button
                      type="submit"
                      className="wdg-btn-primary"
                      disabled={loginVerifying}
                    >
                      {loginVerifying ? 'Verifying…' : 'Verify & Open Portfolio →'}
                    </button>
                    <button
                      type="button"
                      className="wdg-btn-text"
                      onClick={() => setLoginStep('idle')}
                    >
                      Change Email
                    </button>
                    {loginErrMsg && <div className="wdg-form-err">{loginErrMsg}</div>}
                  </form>
                )}
              </div>
            ) : !portfolioData?.hasPortfolio ? (
              /* Authenticated but no CAS file */
              <div className="wdg-empty-card">
                <div className="wdg-empty-icon">📁</div>
                <h4>Welcome, {portfolioData.user?.name || 'Investor'}!</h4>
                <p>You haven't uploaded a CAS statement yet.</p>
                <Link href="/cas-tracker" className="wdg-btn-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>
                  Upload CAS Statement →
                </Link>
              </div>
            ) : (
              /* Live Portfolio Summary */
              <div className="wdg-port-content">
                <div className="wdg-port-user">
                  <span>Investor: <b>{portfolioData.user?.name}</b></span>
                  <span className="wdg-port-tag">Live CAS</span>
                </div>

                {/* Main Valuation Hero */}
                <div className="wdg-port-hero">
                  <div className="wdg-port-subl">Current Valuation</div>
                  <div className="wdg-port-val">
                    ₹{portfolioData.summary?.totalCurrent?.toLocaleString('en-IN', { maximumFractionDigits: 0 }) || '0'}
                  </div>
                  <div className="wdg-port-day-row">
                    <span className="wdg-port-day-badge pos">
                      Day's Gain: +₹{portfolioData.summary?.daysGain?.toLocaleString('en-IN', { maximumFractionDigits: 0 })} (+{portfolioData.summary?.daysGainPct}%)
                    </span>
                  </div>
                </div>

                {/* Portfolio Stats Grid */}
                <div className="wdg-port-stats">
                  <div className="wdg-port-stat">
                    <span className="wdg-stat-l">Invested</span>
                    <span className="wdg-stat-v">
                      ₹{portfolioData.summary?.totalInvested?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="wdg-port-stat">
                    <span className="wdg-stat-l">Total Gain</span>
                    <span className={`wdg-stat-v ${portfolioData.summary?.totalGain >= 0 ? 'pos' : 'neg'}`}>
                      {portfolioData.summary?.totalGain >= 0 ? '+' : ''}₹{portfolioData.summary?.totalGain?.toLocaleString('en-IN', { maximumFractionDigits: 0 })} ({portfolioData.summary?.totalGainPct?.toFixed(1)}%)
                    </span>
                  </div>
                  <div className="wdg-port-stat">
                    <span className="wdg-stat-l">Schemes</span>
                    <span className="wdg-stat-v">{portfolioData.summary?.schemeCount}</span>
                  </div>
                  <div className="wdg-port-stat">
                    <span className="wdg-stat-l">Folios</span>
                    <span className="wdg-stat-v">{portfolioData.summary?.folioCount}</span>
                  </div>
                </div>

                {/* Asset Allocation */}
                {portfolioData.summary?.allocation && (
                  <div className="wdg-alloc-section">
                    <div className="wdg-sec-title">Asset Allocation</div>
                    <div className="wdg-alloc-bar">
                      <div className="bar-eq" style={{ width: `${portfolioData.summary.allocation.equityPct}%` }} title={`Equity: ${portfolioData.summary.allocation.equityPct}%`} />
                      <div className="bar-deb" style={{ width: `${portfolioData.summary.allocation.debtPct}%` }} title={`Debt: ${portfolioData.summary.allocation.debtPct}%`} />
                      <div className="bar-hyb" style={{ width: `${portfolioData.summary.allocation.hybridPct}%` }} title={`Hybrid: ${portfolioData.summary.allocation.hybridPct}%`} />
                      <div className="bar-oth" style={{ width: `${portfolioData.summary.allocation.otherPct}%` }} title={`Other: ${portfolioData.summary.allocation.otherPct}%`} />
                    </div>
                    <div className="wdg-alloc-labels">
                      <span>Equity: <b>{portfolioData.summary.allocation.equityPct}%</b></span>
                      <span>Debt: <b>{portfolioData.summary.allocation.debtPct}%</b></span>
                      <span>Hybrid: <b>{portfolioData.summary.allocation.hybridPct}%</b></span>
                    </div>
                  </div>
                )}

                {/* Top Holdings */}
                {portfolioData.summary?.topHoldings?.length > 0 && (
                  <div className="wdg-holdings-section">
                    <div className="wdg-sec-title">Top Holdings</div>
                    <div className="wdg-holdings-list">
                      {portfolioData.summary.topHoldings.map((h, i) => (
                        <div key={i} className="wdg-holding-row">
                          <div className="wdg-h-name" title={h.fullName}>{h.name}</div>
                          <div className="wdg-h-val">
                            ₹{h.curVal.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                            <span className={`wdg-h-gain ${h.gain >= 0 ? 'pos' : 'neg'}`}>
                              ({h.gainPct >= 0 ? '+' : ''}{h.gainPct.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="wdg-port-footer">
                  <Link href="/portfolio" className="wdg-port-link">View Full Portfolio Analytics →</Link>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ────────────────── 3. TOP FUNDS TAB ────────────────── */}
        {tab === 'funds' && (
          <div className="wdg-pane">
            {/* Category selection row */}
            <div className="wdg-controls-row">
              <div className="wdg-sel-wrap">
                <span className="wdg-sel-label">📂 Category:</span>
                <select
                  className="wdg-select"
                  value={fundCategory}
                  onChange={(e) => setFundCategory(e.target.value)}
                >
                  {FUND_CATEGORIES.map((c) => (
                    <option key={c.key} value={c.key}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Active horizon tag */}
              <div className="wdg-horizon-tag">
                {activeHorizonObj?.sub} ({activeHorizonObj?.type})
              </div>
            </div>

            {/* Horizontal Scrollable Time Horizon Rail */}
            <div className="wdg-horizon-rail" role="tablist" aria-label="Return Time Horizon">
              {TIME_HORIZONS.map((h) => (
                <button
                  key={h.key}
                  className={`wdg-horizon-chip ${fundHorizon === h.key ? 'active' : ''}`}
                  onClick={() => setFundHorizon(h.key)}
                  title={`${h.sub} (${h.type} Return)`}
                >
                  {h.label}
                </button>
              ))}
            </div>

            {fundsLoading && !fundsData.length ? (
              <div className="wdg-loading">Loading top funds…</div>
            ) : topFundsFiltered.length === 0 ? (
              <div className="wdg-loading">No funds found with {activeHorizonObj?.sub} track record in this category.</div>
            ) : (
              <div className="wdg-funds-list">
                {topFundsFiltered.map((fund, idx) => {
                  const retVal = fund[fundHorizon];
                  const cleanTitle = (fund.name || '').replace(/\s*-\s*(Regular Plan|Direct Plan|Regular|Direct|Growth( Option)?| Plan).*/i, '').trim();
                  const rankClass = idx === 0 ? 'wdg-rank-1' : idx === 1 ? 'wdg-rank-2' : idx === 2 ? 'wdg-rank-3' : '';
                  return (
                    <Link
                      key={fund.code || idx}
                      href={`/fund/${fund.code}`}
                      className="wdg-fund-card"
                      target="_blank"
                    >
                      <div className={`wdg-fund-rank-badge ${rankClass}`}>
                        {idx + 1}
                      </div>
                      <div className="wdg-fund-info">
                        <div className="wdg-f-title" title={fund.name}>{cleanTitle}</div>
                        <div className="wdg-f-meta">
                          <span>{fund.amc || fund.category}</span> · <span>NAV: ₹{fund.nav?.toFixed(2)}</span>
                        </div>
                      </div>
                      <div className="wdg-fund-ret pos">
                        {retVal > 0 ? '+' : ''}{retVal ? retVal.toFixed(1) : '—'}%
                        <small>{activeHorizonObj?.label} {activeHorizonObj?.type}</small>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ────────────────── 4. COMPACT ALL-IN-ONE TAB ────────────────── */}
        {tab === 'mini' && (
          <div className="wdg-pane wdg-compact-pane">
            {/* Quick Nifty / Sensex bar */}
            <div className="wdg-mini-indices">
              {indices.slice(0, 2).map((idx) => {
                const isPos = (idx.change || 0) >= 0;
                return (
                  <div key={idx.id} className="wdg-mini-idx">
                    <span className="wdg-m-name">{idx.name}</span>
                    <span className="wdg-m-val">{idx.last?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                    <span className={`wdg-m-pct ${isPos ? 'pos' : 'neg'}`}>
                      {isPos ? '+' : ''}{idx.pct?.toFixed(2)}%
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Portfolio Mini Card (if logged in) */}
            {portfolioData?.authenticated && portfolioData?.hasPortfolio ? (
              <div className="wdg-mini-port">
                <div className="wdg-mp-head">
                  <span>💼 My Portfolio</span>
                  <span className="pos">Day: +₹{portfolioData.summary?.daysGain?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                </div>
                <div className="wdg-mp-val">
                  ₹{portfolioData.summary?.totalCurrent?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </div>
                <div className="wdg-mp-gain">
                  Total Gain: <b className="pos">+{portfolioData.summary?.totalGainPct?.toFixed(1)}%</b>
                </div>
              </div>
            ) : (
              <div className="wdg-mini-port-promo" onClick={() => setTab('portfolio')}>
                <span>💼 Connect Live Portfolio</span>
                <span className="wdg-promo-arrow">Sign in →</span>
              </div>
            )}

            {/* Top 3 Portfolio Holdings */}
            <div className="wdg-mini-funds">
              <div className="wdg-sec-title">Top 3 Holdings</div>
              {portfolioData?.authenticated && portfolioData?.hasPortfolio && portfolioData?.summary?.topHoldings?.length > 0 ? (
                portfolioData.summary.topHoldings.slice(0, 3).map((h, i) => (
                  <div key={i} className="wdg-mf-row">
                    <span className="wdg-mf-name" title={h.fullName}>{h.name}</span>
                    <span className="wdg-mf-ret">
                      ₹{h.curVal?.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                      <span className={h.gain >= 0 ? 'pos' : 'neg'} style={{ marginLeft: 5, fontSize: '10.5px' }}>
                        ({h.gainPct >= 0 ? '+' : ''}{h.gainPct?.toFixed(1)}%)
                      </span>
                    </span>
                  </div>
                ))
              ) : (
                <div className="wdg-mini-port-promo" style={{ margin: '4px 0', padding: '9px 12px' }} onClick={() => setTab('portfolio')}>
                  <span>Sign in to view top holdings</span>
                  <span className="wdg-promo-arrow">→</span>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Styles */}
      <style jsx global>{`
        .wdg-container {
          max-width: 480px;
          margin: 20px auto;
          background: var(--surface, #ffffff);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.08);
          font-family: Raleway, -apple-system, BlinkMacSystemFont, sans-serif;
          color: var(--text, #1e293b);
          overflow: hidden;
        }
        .wdg-mini-mode {
          max-width: 100%;
          margin: 0;
          border-radius: 0;
          border: none;
          box-shadow: none;
          min-height: 100vh;
        }
        .wdg-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--s2, #f8fafc);
          border-bottom: 1px solid var(--border, #e2e8f0);
        }
        .wdg-brand {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .wdg-logo {
          border-radius: 6px;
        }
        .wdg-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text, #1e293b);
        }
        .wdg-title b {
          color: var(--g1, #1a7a4a);
          font-weight: 800;
        }
        .wdg-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .wdg-refresh-btn {
          width: 28px;
          height: 28px;
          border: 1px solid var(--border, #e2e8f0);
          background: var(--surface, #fff);
          border-radius: 7px;
          font-size: 14px;
          cursor: pointer;
          color: var(--text2, #475569);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform .2s ease;
        }
        .wdg-refresh-btn.spinning {
          animation: wdgspin .6s linear infinite;
        }
        @keyframes wdgspin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .wdg-interval-sel {
          padding: 4px 6px;
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 6px;
          font-size: 11px;
          font-weight: 600;
          background: var(--surface, #fff);
          color: var(--text2, #475569);
        }
        .wdg-popout-btn {
          padding: 5px 9px;
          border: 1px solid var(--g-light, #86efac);
          background: var(--g-xlight, #f0fdf4);
          color: var(--g1, #1a7a4a);
          border-radius: 7px;
          font-size: 11.5px;
          font-weight: 700;
          cursor: pointer;
          transition: all .15s ease;
        }
        .wdg-popout-btn:hover {
          background: var(--g1, #1a7a4a);
          color: #fff;
        }
        .wdg-tabs {
          display: flex;
          background: var(--s2, #f8fafc);
          border-bottom: 1px solid var(--border, #e2e8f0);
          padding: 4px 8px;
          gap: 4px;
        }
        .wdg-tab {
          flex: 1;
          padding: 8px 4px;
          border: none;
          background: none;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          color: var(--muted, #64748b);
          cursor: pointer;
          transition: all .15s ease;
          text-align: center;
          white-space: nowrap;
        }
        .wdg-tab:hover {
          color: var(--text, #1e293b);
          background: rgba(0,0,0,0.03);
        }
        .wdg-tab.active {
          background: var(--surface, #fff);
          color: var(--g1, #1a7a4a);
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        }
        .wdg-body {
          padding: 14px 16px;
          min-height: 400px;
        }
        .wdg-status-strip {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;
          font-size: 11px;
        }
        .wdg-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 12px;
          font-weight: 700;
          font-family: JetBrains Mono, monospace;
        }
        .wdg-status-pill.open {
          background: #dcfce7;
          color: #15803d;
        }
        .wdg-status-pill.closed {
          background: #fee2e2;
          color: #b91c1c;
        }
        .wdg-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }
        .wdg-time {
          color: var(--muted, #94a3b8);
          font-family: JetBrains Mono, monospace;
        }
        .wdg-indices-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-bottom: 14px;
        }
        .wdg-idx-card {
          background: var(--s2, #f8fafc);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 10px;
          padding: 9px 11px;
        }
        .wdg-idx-name {
          font-size: 11.5px;
          font-weight: 700;
          color: var(--text2, #475569);
          margin-bottom: 2px;
        }
        .wdg-idx-val {
          font-size: 15px;
          font-weight: 800;
          font-family: JetBrains Mono, monospace;
          color: var(--text, #1e293b);
        }
        .wdg-idx-delta {
          font-size: 10.5px;
          font-weight: 700;
          font-family: JetBrains Mono, monospace;
          margin-top: 2px;
        }
        .pos { color: #16a34a !important; }
        .neg { color: #dc2626 !important; }

        .wdg-sec-title {
          font-size: 11.5px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: .04em;
          color: var(--muted, #64748b);
          font-family: JetBrains Mono, monospace;
          margin: 14px 0 8px;
        }
        .wdg-breadth-bar {
          height: 7px;
          display: flex;
          border-radius: 4px;
          overflow: hidden;
          background: #e2e8f0;
          margin-bottom: 6px;
        }
        .wdg-breadth-adv { background: #16a34a; }
        .wdg-breadth-dec { background: #dc2626; }
        .wdg-breadth-labels {
          display: flex;
          justify-content: space-between;
          font-size: 10.5px;
          font-weight: 700;
          font-family: JetBrains Mono, monospace;
        }
        .wdg-sector-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 6px;
        }
        .wdg-sec-chip {
          padding: 6px 4px;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          border: 1px solid transparent;
        }
        .chip-pos {
          background: #f0fdf4;
          border-color: #bbf7d0;
          color: #16a34a;
        }
        .chip-neg {
          background: #fef2f2;
          border-color: #fecaca;
          color: #dc2626;
        }
        .wdg-sec-name {
          font-size: 9.5px;
          font-weight: 700;
          color: var(--text, #1e293b);
        }
        .wdg-sec-pct {
          font-size: 11px;
          font-weight: 800;
          font-family: JetBrains Mono, monospace;
        }

        /* Portfolio Tab Styles */
        .wdg-port-user {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          color: var(--text2, #475569);
          margin-bottom: 10px;
        }
        .wdg-port-tag {
          font-size: 10px;
          font-weight: 800;
          color: var(--g1, #1a7a4a);
          background: var(--g-xlight, #f0fdf4);
          padding: 2px 6px;
          border-radius: 4px;
        }
        .wdg-port-hero {
          background: linear-gradient(135deg, var(--s2, #f8fafc), var(--surface, #fff));
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 12px;
          padding: 14px 16px;
          text-align: center;
          margin-bottom: 12px;
        }
        .wdg-port-subl {
          font-size: 11.5px;
          color: var(--muted, #64748b);
          font-weight: 600;
          margin-bottom: 4px;
        }
        .wdg-port-val {
          font-size: 24px;
          font-weight: 900;
          font-family: JetBrains Mono, monospace;
          color: var(--text, #1e293b);
        }
        .wdg-port-day-row {
          margin-top: 6px;
        }
        .wdg-port-day-badge {
          font-size: 11.5px;
          font-weight: 700;
          font-family: JetBrains Mono, monospace;
          padding: 2px 8px;
          border-radius: 6px;
          background: #dcfce7;
        }
        .wdg-port-stats {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
          margin-bottom: 14px;
        }
        .wdg-port-stat {
          background: var(--s2, #f8fafc);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 9px;
          padding: 8px 10px;
          display: flex;
          flex-direction: column;
        }
        .wdg-stat-l {
          font-size: 10.5px;
          color: var(--muted, #64748b);
          font-weight: 600;
        }
        .wdg-stat-v {
          font-size: 13.5px;
          font-weight: 800;
          font-family: JetBrains Mono, monospace;
          color: var(--text, #1e293b);
          margin-top: 2px;
        }
        .wdg-alloc-bar {
          height: 8px;
          display: flex;
          border-radius: 4px;
          overflow: hidden;
          background: #e2e8f0;
          margin-bottom: 6px;
        }
        .bar-eq { background: #16a34a; }
        .bar-deb { background: #3b82f6; }
        .bar-hyb { background: #f59e0b; }
        .bar-oth { background: #8b5cf6; }
        .wdg-alloc-labels {
          display: flex;
          justify-content: space-between;
          font-size: 10.5px;
          color: var(--text2, #475569);
        }
        .wdg-holdings-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .wdg-holding-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 7px 9px;
          background: var(--s2, #f8fafc);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 8px;
          font-size: 12px;
        }
        .wdg-h-name {
          flex: 1;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          padding-right: 10px;
        }
        .wdg-h-val {
          font-weight: 800;
          font-family: JetBrains Mono, monospace;
          white-space: nowrap;
        }
        .wdg-h-gain {
          font-size: 10.5px;
          margin-left: 4px;
        }
        .wdg-port-footer {
          text-align: center;
          margin-top: 14px;
        }
        .wdg-port-link {
          font-size: 12px;
          font-weight: 700;
          color: var(--g1, #1a7a4a);
          text-decoration: none;
        }
        .wdg-port-link:hover { text-decoration: underline; }

        /* Inline Login Styles */
        .wdg-auth-card, .wdg-empty-card {
          text-align: center;
          padding: 20px 16px;
        }
        .wdg-auth-icon, .wdg-empty-icon {
          font-size: 32px;
          margin-bottom: 8px;
        }
        .wdg-auth-card h3, .wdg-empty-card h4 {
          font-size: 16px;
          font-weight: 800;
          margin: 0 0 6px;
          color: var(--text, #1e293b);
        }
        .wdg-auth-sub, .wdg-empty-card p {
          font-size: 12.5px;
          color: var(--muted, #64748b);
          line-height: 1.5;
          margin: 0 0 16px;
        }
        .wdg-login-form {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-width: 320px;
          margin: 0 auto;
        }
        .wdg-input {
          padding: 10px 12px;
          border: 1.5px solid var(--border, #e2e8f0);
          border-radius: 9px;
          font-size: 13px;
          font-weight: 600;
          outline: none;
          background: var(--s2, #f8fafc);
        }
        .wdg-input-otp {
          text-align: center;
          letter-spacing: 6px;
          font-size: 18px;
          font-weight: 800;
          font-family: JetBrains Mono, monospace;
        }
        .wdg-btn-primary {
          padding: 10px 16px;
          border: none;
          border-radius: 9px;
          background: var(--g1, #1a7a4a);
          color: #fff;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          transition: opacity .15s;
        }
        .wdg-btn-primary:disabled { opacity: .6; cursor: not-allowed; }
        .wdg-btn-google {
          padding: 10px 16px;
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 9px;
          background: #fff;
          color: #1e293b;
          font-size: 12.5px;
          font-weight: 700;
          cursor: pointer;
        }
        .wdg-btn-text {
          background: none;
          border: none;
          color: var(--muted, #64748b);
          font-size: 11.5px;
          cursor: pointer;
          text-decoration: underline;
        }
        .wdg-divider {
          display: flex;
          align-items: center;
          text-align: center;
          color: var(--muted, #94a3b8);
          font-size: 11px;
          margin: 4px 0;
        }
        .wdg-divider::before, .wdg-divider::after {
          content: '';
          flex: 1;
          border-bottom: 1px solid var(--border, #e2e8f0);
        }
        .wdg-divider span { padding: 0 8px; }
        .wdg-form-err {
          color: #dc2626;
          font-size: 11.5px;
          font-weight: 600;
        }

        /* Top Funds Tab Styles */
        .wdg-controls-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          margin-bottom: 10px;
        }
        .wdg-sel-wrap {
          display: flex;
          align-items: center;
          gap: 6px;
          flex: 1;
        }
        .wdg-sel-label {
          font-size: 11.5px;
          font-weight: 700;
          color: var(--muted, #64748b);
          white-space: nowrap;
        }
        .wdg-select {
          padding: 6px 10px;
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          background: var(--surface, #fff);
          color: var(--text, #1e293b);
          flex: 1;
        }
        .wdg-horizon-tag {
          font-size: 10.5px;
          font-weight: 700;
          color: var(--g1, #1a7a4a);
          background: var(--g-xlight, #f0fdf4);
          padding: 3px 8px;
          border-radius: 6px;
          border: 1px solid var(--g-light, #bbf7d0);
          font-family: JetBrains Mono, monospace;
          white-space: nowrap;
        }
        .wdg-horizon-rail {
          display: flex;
          gap: 5px;
          overflow-x: auto;
          padding: 2px 2px 8px;
          margin-bottom: 10px;
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .wdg-horizon-rail::-webkit-scrollbar {
          display: none;
        }
        .wdg-horizon-chip {
          flex: none;
          padding: 5px 10px;
          border-radius: 7px;
          border: 1px solid var(--border, #e2e8f0);
          background: var(--s2, #f8fafc);
          font: 700 11px JetBrains Mono, monospace;
          color: var(--muted, #64748b);
          cursor: pointer;
          transition: all .15s ease;
          white-space: nowrap;
        }
        .wdg-horizon-chip:hover {
          border-color: var(--g3, #86efac);
          color: var(--text, #1e293b);
        }
        .wdg-horizon-chip.active {
          background: var(--g1, #1a7a4a);
          color: #ffffff;
          border-color: var(--g1, #1a7a4a);
          box-shadow: 0 2px 6px rgba(26, 122, 74, 0.25);
        }
        .wdg-funds-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .wdg-fund-card {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 9px 12px;
          background: var(--s2, #f8fafc);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 10px;
          text-decoration: none;
          color: inherit;
          transition: transform .12s ease, border-color .12s ease;
        }
        .wdg-fund-card:hover {
          border-color: var(--g-light, #86efac);
          transform: translateY(-1px);
        }
        .wdg-fund-rank-badge {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 800;
          font-family: JetBrains Mono, monospace;
          background: var(--s2, #f8fafc);
          color: var(--muted, #64748b);
          flex: none;
          border: 1px solid var(--border, #e2e8f0);
        }
        .wdg-rank-1 { background: #fef9c3; color: #a16207; border: 1px solid #fde047; }
        .wdg-rank-2 { background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; }
        .wdg-rank-3 { background: #ffedd5; color: #c2410c; border: 1px solid #fed7aa; }
        .wdg-fund-info {
          flex: 1;
          min-width: 0;
        }
        .wdg-f-title {
          font-size: 12.5px;
          font-weight: 700;
          color: var(--text, #1e293b);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .wdg-f-meta {
          font-size: 10.5px;
          color: var(--muted, #64748b);
          margin-top: 2px;
        }
        .wdg-fund-ret {
          font-size: 13.5px;
          font-weight: 900;
          font-family: JetBrains Mono, monospace;
          text-align: right;
          display: flex;
          flex-direction: column;
        }
        .wdg-fund-ret small {
          font-size: 9px;
          color: var(--muted, #64748b);
          font-weight: 700;
        }

        /* Compact All-in-One Styles */
        .wdg-compact-pane {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .wdg-mini-indices {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        .wdg-mini-idx {
          padding: 8px 10px;
          background: var(--s2, #f8fafc);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 9px;
          display: flex;
          flex-direction: column;
        }
        .wdg-m-name { font-size: 11px; font-weight: 700; color: var(--muted, #64748b); }
        .wdg-m-val { font-size: 15px; font-weight: 800; font-family: JetBrains Mono, monospace; }
        .wdg-m-pct { font-size: 11px; font-weight: 700; font-family: JetBrains Mono, monospace; }
        .wdg-mini-port {
          padding: 10px 12px;
          background: linear-gradient(135deg, var(--s2, #f8fafc), #fff);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 10px;
        }
        .wdg-mp-head {
          display: flex;
          justify-content: space-between;
          font-size: 11.5px;
          font-weight: 700;
        }
        .wdg-mp-val {
          font-size: 20px;
          font-weight: 900;
          font-family: JetBrains Mono, monospace;
          margin: 4px 0 2px;
        }
        .wdg-mp-gain { font-size: 11.5px; color: var(--muted, #64748b); }
        .wdg-mini-port-promo {
          padding: 12px;
          border: 1.5px dashed var(--g-light, #86efac);
          background: var(--g-xlight, #f0fdf4);
          border-radius: 10px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 12px;
          font-weight: 700;
          color: var(--g1, #1a7a4a);
          cursor: pointer;
        }
        .wdg-mini-funds {
          background: var(--s2, #f8fafc);
          border: 1px solid var(--border, #e2e8f0);
          border-radius: 10px;
          padding: 10px 12px;
        }
        .wdg-mf-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11.5px;
          padding: 4px 0;
          border-bottom: 1px solid var(--border, #e2e8f0);
        }
        .wdg-mf-row:last-child { border-bottom: none; }
        .wdg-mf-name {
          flex: 1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          padding-right: 8px;
          font-weight: 600;
        }
        .wdg-mf-ret {
          font-weight: 800;
          font-family: JetBrains Mono, monospace;
        }
        .wdg-loading, .wdg-error {
          padding: 24px;
          text-align: center;
          font-size: 13px;
          color: var(--muted, #64748b);
        }
        .wdg-loading-shell {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 400px;
          font-size: 14px;
          font-weight: 600;
          color: var(--muted, #64748b);
        }
      `}</style>
    </div>
  );
}
