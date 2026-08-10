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

export default function HoldingsSection({ holdingsData, loading, schemeName }) {
  const [expanded, setExpanded] = useState(false);
  const [showPaywallModal, setShowPaywallModal] = useState(false);

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
  const equityHoldings = holdings.filter((h) => h.assetClass === 'EQUITY');
  const activeHoldings = equityHoldings.length > 0 ? equityHoldings : holdings;

  if (activeHoldings.length === 0) {
    return (
      <div className="scr-hold-section">
        <div className="scr-hold-title">📊 Portfolio Holdings &amp; Sectors</div>
        <div className="scr-hold-empty">No portfolio holdings data available for this scheme.</div>
      </div>
    );
  }

  const isEquity = equityHoldings.length > 0;
  const top5Pct = activeHoldings.slice(0, 5).reduce((a, h) => a + (h.weightagePct || 0), 0);
  const top10Pct = activeHoldings.slice(0, 10).reduce((a, h) => a + (h.weightagePct || 0), 0);
  // When the server has already truncated `holdings` to a free-tier preview
  // (lib/holdingsLookup.js's truncateHoldingsForFreeTier), it also sends the
  // TRUE count separately so "Showing 10 of N" stays accurate without the
  // other N-10 holdings ever reaching this browser. Falls back to the
  // array's own length when the caller sent the full list (Pro users, or
  // any consumer that hasn't opted into server-side truncation).
  const totalCount = holdingsData.totalHoldingsCount ?? activeHoldings.length;

  const sectorMap = {};
  activeHoldings.forEach((h) => {
    const sec = h.sector && h.sector !== 'Unknown' && h.sector !== 'Unspecified' ? h.sector : (h.assetClass || 'Debt / Cash');
    sectorMap[sec] = (sectorMap[sec] || 0) + (h.weightagePct || 0);
  });
  const sectors = Object.entries(sectorMap)
    .map(([name, pct]) => ({ name, pct }))
    .sort((a, b) => b.pct - a.pct);
  const topSectors = sectors.slice(0, 6);
  const maxSectorPct = topSectors[0]?.pct || 1;

  const SECTOR_COLORS = ['#1b5e20', '#2e7d32', '#43a047', '#e65100', '#0288d1', '#5e35b1'];

  const displayedHoldings = (expanded && isPaidOrAdmin) ? activeHoldings : activeHoldings.slice(0, 10);

  const handleToggleClick = () => {
    if (isPaidOrAdmin) {
      setExpanded(!expanded);
    } else {
      setShowPaywallModal(true);
    }
  };

  return (
    <div className="scr-hold-section">
      <div className="scr-hold-title">📊 Portfolio Holdings &amp; Sectors</div>

      <div className="scr-drawer-kpis" style={{ marginBottom: '12px' }}>
        <div className="scr-dk">
          <span>Top 5 Conc.</span>
          <b>{top5Pct.toFixed(1)}%</b>
        </div>
        <div className="scr-dk">
          <span>Top 10 Conc.</span>
          <b>{top10Pct.toFixed(1)}%</b>
        </div>
        <div className="scr-dk">
          <span>{isEquity ? 'Equity Stocks' : 'Securities'}</span>
          <b>{totalCount}</b>
        </div>
      </div>

      {topSectors.length > 0 && (
        <div className="scr-allocation-card">
          <div className="scr-alloc-title">{isEquity ? 'Top Sector Exposure' : 'Top Instrument / Sector Exposure'}</div>
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

      <div className="scr-hold-table-wrap">
        <table className="scr-hold-table">
          <thead>
            <tr>
              <th>{isEquity ? 'Stock' : 'Security / Instrument'}</th>
              <th>{isEquity ? 'Sector' : 'Type / Sector'}</th>
              <th style={{ textAlign: 'right' }}>Weight</th>
            </tr>
          </thead>
          <tbody>
            {displayedHoldings.map((h, i) => (
              <tr key={i}>
                <td className="scr-hold-stock" title={h.securityName}>{h.securityName}</td>
                <td className="scr-hold-sector">{h.sector || h.assetClass || '—'}</td>
                <td className="scr-hold-pct">{(h.weightagePct || 0).toFixed(2)}%</td>
              </tr>
            ))}
            {!isPaidOrAdmin && totalCount > 10 && (
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

      {totalCount > 10 && (
        <div className="scr-hold-toggle-wrap">
          {isPaidOrAdmin ? (
            <button className="scr-hold-toggle" onClick={handleToggleClick}>
              {expanded ? '▲ Show Top 10' : `▼ Show All ${totalCount} Holdings`}
            </button>
          ) : (
            <div className="scr-hold-pro-teaser" onClick={() => setShowPaywallModal(true)}>
              <div className="scr-hold-teaser-info">
                <span className="scr-hold-teaser-crown">👑</span>
                <div>
                  <div className="scr-hold-teaser-head">Showing 10 of {totalCount} Holdings</div>
                  <div className="scr-hold-teaser-sub">Unlock all {totalCount} stocks &amp; full weightages with Pro</div>
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
