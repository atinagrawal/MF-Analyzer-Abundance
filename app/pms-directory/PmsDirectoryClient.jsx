'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';

export default function PmsDirectoryClient({ providers = [], summary = {} }) {
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('coreAum');
  const [aumTier, setAumTier] = useState('all');
  const [positiveFlowOnly, setPositiveFlowOnly] = useState(false);
  const [hasUnlisted, setHasUnlisted] = useState(false);
  const [hasStructDebt, setHasStructDebt] = useState(false);
  const [activeOnly, setActiveOnly] = useState(true);
  const [expandedReg, setExpandedReg] = useState(null);

  // Filter and sort providers
  const filteredProviders = useMemo(() => {
    let list = [...providers];

    // Status filter
    if (activeOnly) {
      list = list.filter((p) => p.isActive);
    }

    // Search query
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.registrationNo.toLowerCase().includes(q)
      );
    }

    // AUM Tier filter (based on Core PMS AUM)
    if (aumTier === 'mega') {
      list = list.filter((p) => p.coreAumCr >= 10000);
    } else if (aumTier === 'large') {
      list = list.filter((p) => p.coreAumCr >= 1000 && p.coreAumCr < 10000);
    } else if (aumTier === 'mid') {
      list = list.filter((p) => p.coreAumCr >= 100 && p.coreAumCr < 1000);
    } else if (aumTier === 'boutique') {
      list = list.filter((p) => p.coreAumCr < 100);
    }

    // Flow filter
    if (positiveFlowOnly) {
      list = list.filter((p) => p.discNetMonthCr > 0);
    }

    // Asset exposure filters
    if (hasUnlisted) {
      list = list.filter((p) => p.hasUnlistedEquity);
    }
    if (hasStructDebt) {
      list = list.filter((p) => p.hasStructuredDebt);
    }

    // Sort order
    list.sort((a, b) => {
      switch (sortBy) {
        case 'coreAum':
          return b.coreAumCr - a.coreAumCr;
        case 'grandAum':
          return b.grandTotalAumCr - a.grandTotalAumCr;
        case 'netFlow':
          return b.discNetMonthCr - a.discNetMonthCr;
        case 'clients':
          return b.coreClients - a.coreClients;
        case 'ticket':
          return (b.avgTicketLakh || 0) - (a.avgTicketLakh || 0);
        case 'turnover':
          return (a.turnoverRatio ?? 999) - (b.turnoverRatio ?? 999);
        default:
          return b.coreAumCr - a.coreAumCr;
      }
    });

    return list;
  }, [
    providers,
    search,
    sortBy,
    aumTier,
    positiveFlowOnly,
    hasUnlisted,
    hasStructDebt,
    activeOnly,
  ]);

  const toggleExpand = (reg) => {
    setExpandedReg((prev) => (prev === reg ? null : reg));
  };

  return (
    <div className="pmsd-wrapper">
      {/* ── Toolbar: Search, Sort, Filter ── */}
      <div className="pmsd-toolbar">
        <div className="pmsd-search-row">
          <div className="pmsd-search-box">
            <span className="pmsd-search-icon">🔍</span>
            <input
              type="text"
              className="pmsd-search-input"
              placeholder="Search by provider name or SEBI registration no (e.g. Abakkus, INP000009959)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="pmsd-sort-box">
            <label htmlFor="pmsd-sort">Sort by:</label>
            <select
              id="pmsd-sort"
              className="pmsd-sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
            >
              <option value="coreAum">Core PMS AUM (Ex-EPFO) ↓ [Default]</option>
              <option value="grandAum">Total Regulatory AUM (incl. EPFO) ↓</option>
              <option value="netFlow">Monthly Net Inflow (₹ Cr) ↓</option>
              <option value="clients">Active Investors ↓</option>
              <option value="ticket">Average Ticket Size ↓</option>
              <option value="turnover">Portfolio Turnover (Lowest first) ↑</option>
            </select>
          </div>
        </div>

        <div className="pmsd-filter-chips">
          <span style={{ fontSize: '0.74rem', color: 'var(--pmsd-muted)', fontWeight: 600, marginRight: 4 }}>
            AUM Scale:
          </span>
          <button
            type="button"
            className={`pmsd-chip ${aumTier === 'all' ? 'active' : ''}`}
            onClick={() => setAumTier('all')}
          >
            All Sizes
          </button>
          <button
            type="button"
            className={`pmsd-chip ${aumTier === 'mega' ? 'active' : ''}`}
            onClick={() => setAumTier('mega')}
          >
            Mega (&gt; ₹10k Cr)
          </button>
          <button
            type="button"
            className={`pmsd-chip ${aumTier === 'large' ? 'active' : ''}`}
            onClick={() => setAumTier('large')}
          >
            Large (₹1k–10k Cr)
          </button>
          <button
            type="button"
            className={`pmsd-chip ${aumTier === 'mid' ? 'active' : ''}`}
            onClick={() => setAumTier('mid')}
          >
            Mid (₹100–1k Cr)
          </button>
          <button
            type="button"
            className={`pmsd-chip ${aumTier === 'boutique' ? 'active' : ''}`}
            onClick={() => setAumTier('boutique')}
          >
            Boutique (&lt; ₹100 Cr)
          </button>

          <span style={{ fontSize: '0.74rem', color: 'var(--pmsd-muted)', fontWeight: 600, margin: '0 4px 0 8px' }}>
            Attributes:
          </span>
          <button
            type="button"
            className={`pmsd-chip ${positiveFlowOnly ? 'active' : ''}`}
            onClick={() => setPositiveFlowOnly(!positiveFlowOnly)}
          >
            {positiveFlowOnly ? '✓ Positive Net Inflows' : '+ Positive Net Inflows'}
          </button>
          <button
            type="button"
            className={`pmsd-chip ${hasUnlisted ? 'active' : ''}`}
            onClick={() => setHasUnlisted(!hasUnlisted)}
          >
            {hasUnlisted ? '✓ Unlisted Equity' : 'Unlisted Equity'}
          </button>
          <button
            type="button"
            className={`pmsd-chip ${hasStructDebt ? 'active' : ''}`}
            onClick={() => setHasStructDebt(!hasStructDebt)}
          >
            {hasStructDebt ? '✓ Structured Debt' : 'Structured Debt'}
          </button>
          <button
            type="button"
            className={`pmsd-chip ${!activeOnly ? 'active' : ''}`}
            onClick={() => setActiveOnly(!activeOnly)}
          >
            {!activeOnly ? '✓ Include Surrendered' : 'Active Only'}
          </button>
        </div>
      </div>

      {/* ── Results Count ── */}
      <div className="pmsd-results-bar">
        <span>
          Showing <strong>{filteredProviders.length}</strong> of{' '}
          {providers.length} SEBI Registered Providers
        </span>
        <span style={{ fontSize: '0.72rem' }}>
          Sorted by:{' '}
          <strong>
            {sortBy === 'coreAum'
              ? 'Core PMS AUM (Ex-EPFO)'
              : sortBy === 'grandAum'
              ? 'Total Regulatory AUM'
              : sortBy === 'netFlow'
              ? 'Net Monthly Flow'
              : sortBy === 'clients'
              ? 'Investor Count'
              : sortBy === 'ticket'
              ? 'Avg Ticket Size'
              : 'Turnover'}
          </strong>
        </span>
      </div>

      {/* ── Table View ── */}
      <div className="pmsd-table-container">
        <table className="pmsd-table">
          <thead>
            <tr>
              <th className="pmsd-col-provider">PMS Provider / AMC</th>
              <th className="pmsd-col-aum">Core PMS AUM</th>
              <th className="pmsd-col-clients">Investors</th>
              <th className="pmsd-col-flow">Net Flow (Month)</th>
              <th className="pmsd-col-alloc">Asset Allocation</th>
              <th className="pmsd-col-turnover">Turnover</th>
              <th className="pmsd-col-actions">Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredProviders.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '36px 0', color: 'var(--pmsd-muted)' }}>
                  No providers matched your filter criteria. Try adjusting the search term or filters.
                </td>
              </tr>
            ) : (
              filteredProviders.map((p) => {
                const isExpanded = expandedReg === p.registrationNo;
                return (
                  <tr key={p.registrationNo} className={isExpanded ? 'pmsd-row-expandable' : ''}>
                    <td className="pmsd-col-provider">
                      <div className="pmsd-prov-cell">
                        {p.logoPath ? (
                          <img src={p.logoPath} alt="" className="pmsd-prov-logo" />
                        ) : (
                          <span className="pmsd-prov-logo-fallback">{p.name.charAt(0)}</span>
                        )}
                        <div>
                          <Link href={`/pms-directory/${p.slug}`} className="pmsd-prov-name">
                            {p.name}
                          </Link>
                          <div className="pmsd-prov-reg">
                            {p.registrationNo}
                            {!p.isActive && (
                              <span style={{ color: '#c62828', marginLeft: 6, fontWeight: 700 }}>
                                ({p.status})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="pmsd-col-aum">
                      <div className="pmsd-aum-headline">
                        ₹{p.coreAumCr.toLocaleString('en-IN')} Cr
                      </div>
                      {p.isEpfoDominant ? (
                        <div className="pmsd-aum-sub" title={`Reported raw regulatory total: ₹${p.grandTotalAumCr.toLocaleString('en-IN')} Cr including ₹${p.aumPfEpfoCr.toLocaleString('en-IN')} Cr institutional EPFO mandate`}>
                          🏛️ Raw ₹{p.grandTotalAumCr.toLocaleString('en-IN')} Cr (EPFO: {p.epfoSharePct}%)
                        </div>
                      ) : (
                        p.aumPfEpfoCr > 0 && (
                          <div className="pmsd-aum-sub">
                            Raw ₹{p.grandTotalAumCr.toLocaleString('en-IN')} Cr
                          </div>
                        )
                      )}
                    </td>

                    <td className="pmsd-col-clients">
                      <div style={{ fontWeight: 600 }}>{p.coreClients.toLocaleString('en-IN')}</div>
                      {p.avgTicketLakh != null && (
                        <div className="pmsd-ticket-sub">
                          ₹{p.avgTicketLakh >= 100
                            ? `${(p.avgTicketLakh / 100).toFixed(1)} Cr`
                            : `${p.avgTicketLakh.toFixed(1)}L`} avg
                        </div>
                      )}
                    </td>

                    <td className="pmsd-col-flow">
                      <span
                        className={
                          p.discNetMonthCr > 0
                            ? 'pmsd-flow-pos'
                            : p.discNetMonthCr < 0
                            ? 'pmsd-flow-neg'
                            : 'pmsd-flow-neu'
                        }
                      >
                        {p.discNetMonthCr > 0 ? '+' : ''}
                        ₹{p.discNetMonthCr.toLocaleString('en-IN')} Cr
                      </span>
                    </td>

                    <td className="pmsd-col-alloc">
                      <div className="pmsd-alloc-bar">
                        <span
                          className="pmsd-alloc-seg-eq"
                          style={{ width: `${p.equityListedPct}%` }}
                          title={`Listed Equity: ${p.equityListedPct}%`}
                        />
                        <span
                          className="pmsd-alloc-seg-debt"
                          style={{ width: `${p.debtPct}%` }}
                          title={`Debt: ${p.debtPct}%`}
                        />
                        <span
                          className="pmsd-alloc-seg-liquid"
                          style={{ width: `${p.liquidCashPct}%` }}
                          title={`Cash/Liquid: ${p.liquidCashPct}%`}
                        />
                      </div>
                      <div className="pmsd-alloc-text">
                        {p.equityListedPct}% Eq · {p.debtPct}% Debt
                      </div>
                    </td>

                    <td className="pmsd-col-turnover">
                      {p.turnoverDisplay ? (
                        <span className={p.isTurnoverElevated ? 'pmsd-turnover-elevated' : ''} title="Estimated computed trading proxy: (sales + purchases) / 2 / discretionary AUM">
                          {p.turnoverDisplay}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>

                    <td className="pmsd-col-actions">
                      <button
                        type="button"
                        onClick={() => toggleExpand(p.registrationNo)}
                        className="pmsd-action-link"
                        style={{ border: 'none', cursor: 'pointer', marginRight: 6 }}
                      >
                        {isExpanded ? 'Hide ▲' : 'Quick View ▼'}
                      </button>
                      <Link href={`/pms-directory/${p.slug}`} className="pmsd-action-link">
                        Profile →
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Expanded Detail Drawer if active ── */}
      {expandedReg && (() => {
        const p = providers.find((x) => x.registrationNo === expandedReg);
        if (!p) return null;
        return (
          <div
            style={{
              background: '#fff',
              border: '2px solid var(--pmsd-green-border)',
              borderRadius: 12,
              padding: 20,
              marginBottom: 32,
              boxShadow: '0 8px 24px rgba(0,0,0,0.06)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <span style={{ fontSize: '0.66rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--pmsd-green)' }}>
                  Detailed SEBI Compliance Disclosure · {p.monthLabel || p.latestMonth}
                </span>
                <h3 style={{ margin: '2px 0 0', fontFamily: 'var(--pmsd-serif)', fontSize: '1.25rem' }}>
                  {p.name} ({p.registrationNo})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setExpandedReg(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.2rem',
                  cursor: 'pointer',
                  color: 'var(--pmsd-muted)'
                }}
              >
                ✕
              </button>
            </div>

            <div className="pmsd-detail-panel" style={{ padding: 0 }}>
              <div className="pmsd-detail-block">
                <div className="pmsd-detail-title">Service Type Split</div>
                <div className="pmsd-detail-row">
                  <span>Discretionary AUM:</span>
                  <span className="pmsd-detail-val">₹{p.discAumCr.toLocaleString('en-IN')} Cr</span>
                </div>
                <div className="pmsd-detail-row">
                  <span>Non-Discretionary:</span>
                  <span className="pmsd-detail-val">₹{p.ndAumCr.toLocaleString('en-IN')} Cr</span>
                </div>
                <div className="pmsd-detail-row">
                  <span>Advisory AUM:</span>
                  <span className="pmsd-detail-val">₹{p.advisoryAumCr.toLocaleString('en-IN')} Cr</span>
                </div>
                <div className="pmsd-detail-row">
                  <span>Co-Investment:</span>
                  <span className="pmsd-detail-val">₹{p.coInvAumCr.toLocaleString('en-IN')} Cr</span>
                </div>
              </div>

              <div className="pmsd-detail-block">
                <div className="pmsd-detail-title">Detailed Asset Breakdown</div>
                <div className="pmsd-detail-row">
                  <span>Listed Equity:</span>
                  <span className="pmsd-detail-val">₹{p.equityListedCr.toLocaleString('en-IN')} Cr</span>
                </div>
                <div className="pmsd-detail-row">
                  <span>Unlisted Equity:</span>
                  <span className="pmsd-detail-val">₹{p.equityUnlistedCr.toLocaleString('en-IN')} Cr</span>
                </div>
                <div className="pmsd-detail-row">
                  <span>Debt (Plain &amp; Struct):</span>
                  <span className="pmsd-detail-val">₹{p.debtCr.toLocaleString('en-IN')} Cr</span>
                </div>
                <div className="pmsd-detail-row">
                  <span>Liquid / Others:</span>
                  <span className="pmsd-detail-val">₹{(p.derivativesCr + p.mutualFundsCr + p.othersCr).toLocaleString('en-IN')} Cr</span>
                </div>
              </div>

              <div className="pmsd-detail-block">
                <div className="pmsd-detail-title">Investor &amp; Flow Metrics</div>
                <div className="pmsd-detail-row">
                  <span>Total Clients:</span>
                  <span className="pmsd-detail-val">{p.totalClients.toLocaleString('en-IN')}</span>
                </div>
                <div className="pmsd-detail-row">
                  <span>Monthly Inflows:</span>
                  <span className="pmsd-detail-val">₹{p.discInflowMonthCr.toLocaleString('en-IN')} Cr</span>
                </div>
                <div className="pmsd-detail-row">
                  <span>Monthly Outflows:</span>
                  <span className="pmsd-detail-val">₹{p.discOutflowMonthCr.toLocaleString('en-IN')} Cr</span>
                </div>
                <div className="pmsd-detail-row">
                  <span>Investor Complaints:</span>
                  <span className="pmsd-detail-val" style={{ color: p.complaintsPending === 0 ? 'var(--pmsd-green)' : '#c62828' }}>
                    {p.complaintsPending === 0 ? '✓ 0 Pending' : `${p.complaintsPending} Pending`}
                  </span>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 16, textAlign: 'right' }}>
              <Link
                href={`/pms-directory/${p.slug}`}
                style={{
                  display: 'inline-block',
                  background: 'var(--pmsd-green)',
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  padding: '8px 16px',
                  borderRadius: 6,
                  textDecoration: 'none'
                }}
              >
                Open Full Provider Profile &amp; 18-Month Trajectory →
              </Link>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
