'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function PmsProviderComplianceClient({ provider, history = [] }) {
  const [activeTab, setActiveTab] = useState('chart');

  if (!provider) return null;

  // Compute SVG chart points for 18-month AUM trajectory
  const aumValues = history.map((h) => h.coreAumCr);
  const minAum = Math.min(...aumValues, 0);
  const maxAum = Math.max(...aumValues, 10);
  const range = maxAum - minAum || 1;

  const chartWidth = 800;
  const chartHeight = 220;
  const paddingX = 40;
  const paddingY = 30;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - paddingY * 2;

  const points = history.map((h, i) => {
    const x = paddingX + (i / Math.max(history.length - 1, 1)) * plotWidth;
    const y = chartHeight - paddingY - ((h.coreAumCr - minAum) / range) * plotHeight;
    return { x, y, month: h.monthLabel || h.monthId, val: h.coreAumCr, netFlow: h.discNetMonthCr };
  });

  const pathD = points.length > 0
    ? `M ${points[0].x} ${points[0].y} ` + points.slice(1).map((p) => `L ${p.x} ${p.y}`).join(' ')
    : '';

  const areaD = points.length > 0
    ? `${pathD} L ${points[points.length - 1].x} ${chartHeight - paddingY} L ${points[0].x} ${chartHeight - paddingY} Z`
    : '';

  return (
    <div className="pmspc-client-wrap">
      {/* ── 18-Month Trajectory Section ── */}
      <section className="pmspc-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 className="pmspc-section-title">18-Month Compliance &amp; AUM Trajectory</h2>
            <div className="pmspc-section-sub">
              Official monthly reported book size from March 2025 to {provider.monthLabel || provider.latestMonth}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              className={`pmsd-chip ${activeTab === 'chart' ? 'active' : ''}`}
              onClick={() => setActiveTab('chart')}
            >
              📈 Growth Chart
            </button>
            <button
              type="button"
              className={`pmsd-chip ${activeTab === 'table' ? 'active' : ''}`}
              onClick={() => setActiveTab('table')}
            >
              📋 All 18 Months Data
            </button>
          </div>
        </div>

        {activeTab === 'chart' ? (
          <div className="pmspc-chart-wrap">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}
            >
              <defs>
                <linearGradient id="aumGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1b5e20" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#1b5e20" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Gridlines */}
              <line
                x1={paddingX}
                y1={paddingY}
                x2={chartWidth - paddingX}
                y2={paddingY}
                stroke="#e6decb"
                strokeDasharray="4 4"
              />
              <line
                x1={paddingX}
                y1={chartHeight / 2}
                x2={chartWidth - paddingX}
                y2={chartHeight / 2}
                stroke="#e6decb"
                strokeDasharray="4 4"
              />
              <line
                x1={paddingX}
                y1={chartHeight - paddingY}
                x2={chartWidth - paddingX}
                y2={chartHeight - paddingY}
                stroke="#d3c8b4"
              />

              {/* Y Axis Labels */}
              <text x={paddingX - 8} y={paddingY + 4} fontSize="10" fill="#82755e" textAnchor="end" fontFamily="monospace">
                ₹{Math.round(maxAum).toLocaleString('en-IN')} Cr
              </text>
              <text x={paddingX - 8} y={chartHeight - paddingY + 3} fontSize="10" fill="#82755e" textAnchor="end" fontFamily="monospace">
                ₹{Math.round(minAum).toLocaleString('en-IN')} Cr
              </text>

              {/* Area & Line */}
              {areaD && <path d={areaD} fill="url(#aumGrad)" />}
              {pathD && <path d={pathD} fill="none" stroke="#1b5e20" strokeWidth="2.5" strokeLinecap="round" />}

              {/* Data Dots & X Axis Labels */}
              {points.map((p, idx) => {
                const showLabel = idx === 0 || idx === Math.floor(points.length / 2) || idx === points.length - 1;
                return (
                  <g key={idx}>
                    <circle cx={p.x} cy={p.y} r="4" fill="#1b5e20" stroke="#fff" strokeWidth="1.5" />
                    {showLabel && (
                      <text
                        x={p.x}
                        y={chartHeight - paddingY + 16}
                        fontSize="10"
                        fill="#82755e"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        {p.month}
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
            <div style={{ textAlign: 'center', fontSize: '0.72rem', color: 'var(--pmsd-muted)', marginTop: 8 }}>
              Green curve reflects Core PMS AUM (Ex-EPFO). Hover or switch to table view to inspect month-by-month net capital flows.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="pmspc-history-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Core AUM</th>
                  <th>Total Clients</th>
                  <th>Discretionary AUM</th>
                  <th>Net Flow</th>
                  <th>Est. Turnover</th>
                  <th>Complaints</th>
                </tr>
              </thead>
              <tbody>
                {[...history].reverse().map((h) => (
                  <tr key={h.monthId}>
                    <td style={{ fontWeight: 600 }}>{h.monthLabel || h.monthId}</td>
                    <td>₹{h.coreAumCr.toLocaleString('en-IN')} Cr</td>
                    <td>{h.coreClients.toLocaleString('en-IN')}</td>
                    <td>₹{h.discAumCr.toLocaleString('en-IN')} Cr</td>
                    <td style={{ color: h.discNetMonthCr > 0 ? '#1b5e20' : h.discNetMonthCr < 0 ? '#c62828' : 'inherit' }}>
                      {h.discNetMonthCr > 0 ? '+' : ''}₹{h.discNetMonthCr.toLocaleString('en-IN')} Cr
                    </td>
                    <td>{h.turnoverDisplay || '—'}</td>
                    <td style={{ color: h.complaintsPending === 0 ? '#1b5e20' : '#c62828' }}>
                      {h.complaintsPending === 0 ? '0' : `${h.complaintsPending} pending`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Asset Class Diversification ── */}
      <section className="pmspc-section">
        <h2 className="pmspc-section-title">Asset Class Allocation (Latest Filing)</h2>
        <div className="pmspc-section-sub">
          Distribution of managed capital across equity, debt, derivatives, and liquid instruments
        </div>

        <div className="pmspc-grid-4">
          <div className="pmspc-card-mini">
            <span className="pmspc-card-mini-lbl">Listed Equity</span>
            <span className="pmspc-card-mini-val">₹{provider.equityListedCr.toLocaleString('en-IN')} Cr</span>
            <span className="pmspc-card-mini-sub">{provider.equityListedPct}% of reported AUM</span>
          </div>

          <div className="pmspc-card-mini">
            <span className="pmspc-card-mini-lbl">Unlisted Equity</span>
            <span className="pmspc-card-mini-val">₹{provider.equityUnlistedCr.toLocaleString('en-IN')} Cr</span>
            <span className="pmspc-card-mini-sub">{provider.equityUnlistedPct}% of reported AUM</span>
          </div>

          <div className="pmspc-card-mini">
            <span className="pmspc-card-mini-lbl">Debt &amp; Fixed Income</span>
            <span className="pmspc-card-mini-val">₹{provider.debtCr.toLocaleString('en-IN')} Cr</span>
            <span className="pmspc-card-mini-sub">{provider.debtPct}% (Plain + Struct Debt)</span>
          </div>

          <div className="pmspc-card-mini">
            <span className="pmspc-card-mini-lbl">Liquid, Cash &amp; Others</span>
            <span className="pmspc-card-mini-val">
              ₹{(provider.derivativesCr + provider.mutualFundsCr + provider.othersCr).toLocaleString('en-IN')} Cr
            </span>
            <span className="pmspc-card-mini-sub">{provider.liquidCashPct}% Cash, Deriv &amp; MFs</span>
          </div>
        </div>
      </section>

      {/* ── Service Type Breakdown ── */}
      <section className="pmspc-section">
        <h2 className="pmspc-section-title">Service Type &amp; Portfolio Mandates</h2>
        <div className="pmspc-section-sub">
          Regulatory classification between Discretionary, Non-Discretionary, Advisory, and Co-Investment services
        </div>

        <div className="pmspc-grid-4">
          <div className="pmspc-card-mini">
            <span className="pmspc-card-mini-lbl">Discretionary Portfolio</span>
            <span className="pmspc-card-mini-val">₹{provider.discAumCr.toLocaleString('en-IN')} Cr</span>
            <span className="pmspc-card-mini-sub">{provider.clientsDiscretionary.toLocaleString('en-IN')} discretionary clients</span>
          </div>

          <div className="pmspc-card-mini">
            <span className="pmspc-card-mini-lbl">Non-Discretionary</span>
            <span className="pmspc-card-mini-val">₹{provider.ndAumCr.toLocaleString('en-IN')} Cr</span>
            <span className="pmspc-card-mini-sub">{provider.clientsNonDiscretionary.toLocaleString('en-IN')} clients</span>
          </div>

          <div className="pmspc-card-mini">
            <span className="pmspc-card-mini-lbl">Advisory Mandates</span>
            <span className="pmspc-card-mini-val">₹{provider.advisoryAumCr.toLocaleString('en-IN')} Cr</span>
            <span className="pmspc-card-mini-sub">{provider.clientsAdvisory.toLocaleString('en-IN')} advisory clients</span>
          </div>

          <div className="pmspc-card-mini">
            <span className="pmspc-card-mini-lbl">Co-Investment Services</span>
            <span className="pmspc-card-mini-val">₹{provider.coInvAumCr.toLocaleString('en-IN')} Cr</span>
            <span className="pmspc-card-mini-sub">HNIs &amp; Family Offices</span>
          </div>
        </div>
      </section>

      {/* ── Navigation Actions ── */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
        <Link
          href="/pms-directory"
          style={{
            background: 'var(--pmsd-surface)',
            border: '1px solid var(--pmsd-border)',
            padding: '10px 18px',
            borderRadius: 8,
            fontSize: '0.84rem',
            fontWeight: 700,
            color: 'var(--pmsd-text)',
            textDecoration: 'none'
          }}
        >
          ← Back to All 510 SEBI PMS Providers
        </Link>
        <Link
          href={`/pms-screener?search=${encodeURIComponent(provider.name)}`}
          style={{
            background: 'var(--pmsd-green)',
            color: '#fff',
            padding: '10px 18px',
            borderRadius: 8,
            fontSize: '0.84rem',
            fontWeight: 700,
            textDecoration: 'none'
          }}
        >
          View Strategies in PMS Screener →
        </Link>
      </div>
    </div>
  );
}
