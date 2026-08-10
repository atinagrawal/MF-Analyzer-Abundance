'use client';

import { useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { startCheckout } from '@/lib/checkoutClient';

function ProHoldingsModal({ schemeName, totalCount, onClose, session }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isAuthed = Boolean(session?.user);

  const handleUpgrade = async () => {
    if (!isAuthed) {
      signIn();
      return;
    }
    setLoading(true);
    setError('');
    try {
      await startCheckout({
        plan: 'annual',
        session,
        onSuccess() { window.location.reload(); },
        onDismiss() { setLoading(false); },
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="scr-pro-modal-wrap" onClick={onClose}>
      <div className="scr-pro-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="scr-pro-modal-x" onClick={onClose} aria-label="Close">×</button>

        <div className="scr-pro-modal-header">
          <div className="scr-pro-crown-badge">👑 ABUNDANCE PRO FEATURE</div>
          <h3 className="scr-pro-modal-title">Unlock Complete Portfolio Holdings</h3>
          <p className="scr-pro-modal-desc">
            {schemeName ? <strong>{schemeName}</strong> : 'This scheme'} holds <strong>{totalCount} total equity securities</strong>. Free accounts can view the top 10 holdings. Upgrade to <strong>Abundance Pro</strong> to unlock the complete holding list &amp; full analytics.
          </p>
        </div>

        <div className="scr-pro-features-grid">
          <div className="scr-pro-feat-item">
            <div className="scr-pro-feat-ic">📊</div>
            <div>
              <strong>Complete {totalCount}-Stock Disclosure</strong>
              <span>Full security-level breakdown with exact portfolio weightages &amp; sector tags.</span>
            </div>
          </div>
          <div className="scr-pro-feat-item">
            <div className="scr-pro-feat-ic">⚡</div>
            <div>
              <strong>Pairwise Fund Overlap</strong>
              <span>Detect hidden stock duplication across multiple mutual funds in Proposal Studio.</span>
            </div>
          </div>
          <div className="scr-pro-feat-item">
            <div className="scr-pro-feat-ic">🏢</div>
            <div>
              <strong>AMFI Market Cap Allocation</strong>
              <span>Official Large, Mid &amp; Small cap breakdown based on AMFI semi-annual categorization.</span>
            </div>
          </div>
          <div className="scr-pro-feat-item">
            <div className="scr-pro-feat-ic">🎯</div>
            <div>
              <strong>SEBI Stress Test &amp; Liquidity</strong>
              <span>Days to liquidate 25%/50% portfolio and top 10 investor concentration metrics.</span>
            </div>
          </div>
        </div>

        <div className="scr-pro-pricing-card">
          <div className="scr-pro-price-row">
            <div>
              <span className="scr-pro-price-amount">₹499</span>
              <span className="scr-pro-price-period">/ year + 18% GST</span>
            </div>
            <span className="scr-pro-price-total">Total ₹588.82</span>
          </div>
          <button className="scr-pro-cta" onClick={handleUpgrade} disabled={loading}>
            {loading ? 'Opening checkout…' : !isAuthed ? 'Sign in to Upgrade →' : 'Upgrade to Pro Now →'}
          </button>
          {error && <div className="scr-pro-err">{error}</div>}
          <div className="scr-pro-sublink">
            <a href="/pricing" target="_blank" rel="noreferrer">See all Pro features &amp; plans →</a>
          </div>
        </div>
      </div>
    </div>
  );
}

function getHoldingMeta(h) {
  const name = (h.securityName || '').toLowerCase();
  const rawAc = (h.assetClass || '').toUpperCase();

  // Derivative check (Futures, Options, Call/Put, Expiries)
  const isDerivative =
    name.includes('futures') ||
    name.includes('option') ||
    name.includes(' call') ||
    name.includes(' put') ||
    /\b\d{1,2}-[a-z]{3}-\d{2,4}\b/.test(name) ||
    /\b\d{1,2}(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\d{2,4}\b/.test(name);

  if (isDerivative) {
    return { key: 'DERIVATIVE', label: 'Derivative', badgeClass: 'scr-badge-deriv' };
  }
  if (rawAc === 'EQUITY') {
    return { key: 'EQUITY', label: 'Equity Stock', badgeClass: 'scr-badge-eq' };
  }
  if (rawAc === 'DEBT' || name.includes('bond') || name.includes('gsec') || name.includes('goi') || name.includes('tbill') || name.includes('ncd') || name.includes(' cp') || name.includes(' cd')) {
    return { key: 'DEBT', label: 'Debt & Bond', badgeClass: 'scr-badge-debt' };
  }
  if (rawAc === 'REALEST' || name.includes('reit') || name.includes('invit') || name.includes('trust')) {
    return { key: 'REALEST', label: 'REIT / InvIT', badgeClass: 'scr-badge-reit' };
  }
  if (rawAc === 'COMM' || name.includes('gold') || name.includes('silver') || name.includes('crude')) {
    return { key: 'COMMODITY', label: 'Commodity', badgeClass: 'scr-badge-comm' };
  }
  if (rawAc === 'MF' || name.includes('etf') || name.includes('mutual fund')) {
    return { key: 'MUTUAL_FUND', label: 'Mutual Fund', badgeClass: 'scr-badge-mf' };
  }
  return { key: 'CASH', label: 'Cash & Repo', badgeClass: 'scr-badge-cash' };
}

export default function HoldingsSection({ holdingsData, loading, schemeName }) {
  const [expanded, setExpanded] = useState(false);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [activeTab, setActiveTab] = useState('ALL');

  const { data: session } = useSession();
  const isPaidOrAdmin = Boolean(
    session?.user?.role === 'admin' ||
      session?.user?.role === 'distributor' ||
      session?.user?.plan === 'pro' ||
      session?.user?.plan === 'pro_lifetime' ||
      session?.user?.plan === 'lifetime' ||
      session?.user?.isPro
  );

  if (loading) {
    return (
      <div className="scr-hold-section">
        <div className="scr-hold-title">📊 Portfolio Holdings &amp; Sectors</div>
        <div className="scr-spark-load" style={{ padding: '16px 0' }}>Loading portfolio holdings &amp; sectors…</div>
      </div>
    );
  }

  if (!holdingsData || !holdingsData.holdings) return null;

  const holdings = holdingsData.holdings;
  if (holdings.length === 0) {
    return (
      <div className="scr-hold-section">
        <div className="scr-hold-title">📊 Portfolio Holdings &amp; Sectors</div>
        <div className="scr-hold-empty">No portfolio holdings data available for this scheme.</div>
      </div>
    );
  }

  // Annotate holdings with Security Metadata
  const annotatedHoldings = holdings.map((h) => ({
    ...h,
    meta: getHoldingMeta(h),
  }));

  // Asset Class Allocation Breakdown
  const assetWeights = {};
  annotatedHoldings.forEach((h) => {
    const k = h.meta.key;
    assetWeights[k] = (assetWeights[k] || 0) + (h.weightagePct || 0);
  });

  // Filtered holdings based on selected tab
  const activeHoldings = activeTab === 'ALL'
    ? annotatedHoldings
    : annotatedHoldings.filter((h) => h.meta.key === activeTab);

  const top5Pct = annotatedHoldings.slice(0, 5).reduce((a, h) => a + (h.weightagePct || 0), 0);
  const top10Pct = annotatedHoldings.slice(0, 10).reduce((a, h) => a + (h.weightagePct || 0), 0);
  const totalCount = holdingsData.totalHoldingsCount ?? annotatedHoldings.length;

  // Sector breakdown
  const sectorMap = {};
  annotatedHoldings.forEach((h) => {
    const sec = h.sector && h.sector !== 'Unknown' && h.sector !== 'Unspecified' ? h.sector : h.meta.label;
    sectorMap[sec] = (sectorMap[sec] || 0) + (h.weightagePct || 0);
  });
  const sectors = Object.entries(sectorMap)
    .map(([name, pct]) => ({ name, pct }))
    .sort((a, b) => b.pct - a.pct);
  const topSectors = sectors.slice(0, 6);
  const maxSectorPct = topSectors[0]?.pct || 1;

  const SECTOR_COLORS = ['#1b5e20', '#2e7d32', '#43a047', '#e65100', '#0288d1', '#5e35b1'];

  // Asset Class Tabs
  const tabCounts = { ALL: annotatedHoldings.length };
  annotatedHoldings.forEach((h) => {
    tabCounts[h.meta.key] = (tabCounts[h.meta.key] || 0) + 1;
  });

  const tabOptions = [
    { key: 'ALL', label: 'All Items' },
    { key: 'EQUITY', label: 'Equity' },
    { key: 'DERIVATIVE', label: 'Derivatives' },
    { key: 'DEBT', label: 'Debt & Bonds' },
    { key: 'REALEST', label: 'REITs / InvITs' },
    { key: 'COMMODITY', label: 'Commodities' },
    { key: 'CASH', label: 'Cash & Repo' },
  ].filter((t) => t.key === 'ALL' || (tabCounts[t.key] && tabCounts[t.key] > 0));

  const displayedHoldings = (expanded && isPaidOrAdmin) ? activeHoldings : activeHoldings.slice(0, 10);

  // totalCount is portfolio-wide (across every asset class); activeTabCount
  // is scoped to whichever tab is selected. Pro users' "Show All" toggle and
  // the free-tier paywall nudge both used to quote totalCount unconditionally,
  // which was wrong once switched to a non-ALL tab: Pro's toggle promised
  // "Show All 47" but a click only ever revealed the current tab's items, and
  // the free nudge claimed "+37 locked" underneath a tab whose few items were
  // already fully shown. The free-tier count is only ever known portfolio-wide
  // (the server truncates before per-asset-class breakdown is knowable), so
  // that nudge only makes sense on the ALL tab.
  const activeTabCount = tabCounts[activeTab] ?? annotatedHoldings.length;
  const showProToggle = isPaidOrAdmin && activeTabCount > 10;
  const showFreeTeaser = !isPaidOrAdmin && activeTab === 'ALL' && totalCount > 10;

  const handleToggleClick = () => {
    if (isPaidOrAdmin) {
      setExpanded(!expanded);
    } else {
      setShowPaywallModal(true);
    }
  };

  return (
    <div className="scr-hold-section">
      <div className="scr-hold-title">📊 Portfolio Holdings &amp; Asset Breakdown</div>

      <div className="scr-drawer-kpis" style={{ marginBottom: '16px' }}>
        <div className="scr-dk">
          <span>Top 5 Conc.</span>
          <b>{top5Pct.toFixed(1)}%</b>
        </div>
        <div className="scr-dk">
          <span>Top 10 Conc.</span>
          <b>{top10Pct.toFixed(1)}%</b>
        </div>
        <div className="scr-dk">
          <span>Total Holdings</span>
          <b>{totalCount}</b>
        </div>
      </div>

      {/* Asset Allocation Summary Bar */}
      {Object.keys(assetWeights).length > 1 && (
        <div className="scr-asset-summary-card">
          <div className="scr-alloc-title">Asset Class Allocation Summary</div>
          <div className="scr-asset-bar-wrap">
            {Object.entries(assetWeights)
              .filter(([_, w]) => Math.abs(w) > 0.01)
              .map(([key, weight]) => {
                const isNeg = weight < 0;
                const absW = Math.abs(weight);
                const colorMap = {
                  EQUITY: '#2e7d32',
                  DERIVATIVE: isNeg ? '#ef5350' : '#43a047',
                  DEBT: '#0288d1',
                  REALEST: '#8e24aa',
                  COMMODITY: '#f57f17',
                  MUTUAL_FUND: '#00897b',
                  CASH: '#78909c',
                };
                return (
                  <div
                    key={key}
                    className="scr-asset-segment"
                    style={{
                      width: `${Math.min(100, Math.max(4, absW))}%`,
                      backgroundColor: colorMap[key] || '#78909c',
                    }}
                    title={`${key}: ${weight.toFixed(1)}%`}
                  />
                );
              })}
          </div>
          <div className="scr-asset-legend">
            {Object.entries(assetWeights)
              .filter(([_, w]) => Math.abs(w) > 0.01)
              .map(([key, weight]) => (
                <div className="scr-asset-legend-item" key={key}>
                  <span className={`scr-legend-dot scr-dot-${key.toLowerCase()}`} />
                  <span className="scr-legend-label">{key.replace('_', ' ')}</span>
                  <span className="scr-legend-val">{weight > 0 ? `+${weight.toFixed(1)}%` : `${weight.toFixed(1)}%`}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {topSectors.length > 0 && (
        <div className="scr-allocation-card">
          <div className="scr-alloc-title">Top Sector Exposure</div>
          <div className="scr-alloc-bars">
            {topSectors.map((sec, idx) => (
              <div className="scr-alloc-item" key={sec.name}>
                <div className="scr-alloc-lbl">{sec.name} ({sec.pct.toFixed(1)}%)</div>
                <div className="scr-alloc-bar-bg">
                  <div
                    className="scr-alloc-bar-fill"
                    style={{
                      width: `${Math.min(100, (sec.pct / maxSectorPct) * 100)}%`,
                      backgroundColor: SECTOR_COLORS[idx % SECTOR_COLORS.length]
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Asset Filter Tabs */}
      {tabOptions.length > 2 && (
        <div className="scr-asset-tabs">
          {tabOptions.map((t) => (
            <button
              key={t.key}
              className={`scr-asset-tab ${activeTab === t.key ? 'active' : ''}`}
              onClick={() => setActiveTab(t.key)}
            >
              {t.label} ({tabCounts[t.key] || 0})
            </button>
          ))}
        </div>
      )}

      <div className="scr-hold-table-wrap">
        <table className="scr-hold-table">
          <thead>
            <tr>
              <th>Security / Instrument</th>
              <th>Asset &amp; Sector</th>
              <th style={{ textAlign: 'right' }}>Weight</th>
            </tr>
          </thead>
          <tbody>
            {displayedHoldings.map((h, i) => {
              const weight = h.weightagePct || 0;
              const isNeg = weight < 0;
              return (
                <tr key={i}>
                  <td className="scr-hold-stock" title={h.securityName}>
                    <div className="scr-hold-name-cell">
                      <span className="scr-hold-sec-name">{h.securityName}</span>
                    </div>
                  </td>
                  <td className="scr-hold-sector">
                    <span className={`scr-badge ${h.meta.badgeClass}`}>{h.meta.label}</span>
                    <span className="scr-hold-sec-sub">{h.sector && h.sector !== 'Unknown' && h.sector !== 'Unspecified' ? h.sector : ''}</span>
                  </td>
                  <td className={`scr-hold-pct ${isNeg ? 'scr-hold-neg' : 'scr-hold-pos'}`}>
                    {isNeg ? `${weight.toFixed(2)}%` : `${weight.toFixed(2)}%`}
                  </td>
                </tr>
              );
            })}
            {showFreeTeaser && (
              <tr
                className="scr-hold-row-locked"
                onClick={() => setShowPaywallModal(true)}
                title="Unlock full holdings list"
              >
                <td className="scr-hold-stock" colSpan={3}>
                  <div className="scr-hold-locked-cell">
                    <span>🔒 +{totalCount - 10} additional holdings locked</span>
                    <span className="scr-hold-pro-badge">PRO</span>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(showProToggle || showFreeTeaser) && (
        <div className="scr-hold-toggle-wrap">
          {isPaidOrAdmin ? (
            <button className="scr-hold-toggle" onClick={handleToggleClick}>
              {expanded ? '▲ Show Top 10' : `▼ Show All ${activeTabCount} Holdings`}
            </button>
          ) : (
            <div className="scr-hold-pro-teaser" onClick={() => setShowPaywallModal(true)}>
              <div className="scr-hold-teaser-info">
                <span className="scr-hold-teaser-crown">👑</span>
                <div>
                  <div className="scr-hold-teaser-head">Showing 10 of {totalCount} Holdings</div>
                  <div className="scr-hold-teaser-sub">Unlock all {totalCount} securities &amp; full weightages with Pro</div>
                </div>
              </div>
              <button className="scr-hold-teaser-btn" onClick={(e) => { e.stopPropagation(); setShowPaywallModal(true); }}>
                <span>Show All {totalCount} Holdings</span>
                <span className="scr-hold-btn-tag">PRO</span>
              </button>
            </div>
          )}
        </div>
      )}

      {showPaywallModal && (
        <ProHoldingsModal
          schemeName={schemeName}
          totalCount={totalCount}
          onClose={() => setShowPaywallModal(false)}
          session={session}
        />
      )}
    </div>
  );
}
