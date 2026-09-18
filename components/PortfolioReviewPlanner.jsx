'use client';

// components/PortfolioReviewPlanner.jsx
//
// Portfolio Review / Quartile Ranking drawer -- groups the currently-
// viewed holdings by SEBI sub-category and ranks each into a performance
// quartile (1-4) against every fund in that category, styled after NJ
// Wealth's "Scheme Analysis" report pages. Abundance's own ARN-251838
// holdings are excluded by default (checkbox to include them). See
// docs/superpowers/specs/2026-09-18-portfolio-review-quartile-planner-design.md.
//
// `holdings` shape required per entry: { name, amfiCode, value, folio,
// advisor, __ownerPan?, __ownerName? } -- exactly what
// app/cas-tracker/page.js's currentInfo.holdings already is (single-PAN
// view or mergeFamilyView's pooled family view). `activePan` is the
// resolveHoldingArn fallback for a holding with no __ownerPan (i.e. not
// in pooled family view) -- same fallback app/cas-tracker/page.js:2734
// already uses for the per-card distributor badge.

import { useState, useEffect, useMemo } from 'react';
import { resolveHoldingArn } from '@/lib/distributorResolution';
import { buildQuartileReport, PERIODS } from '@/lib/quartileRanking';
import { resolveDisplayName } from '@/lib/casDisplayName';
import { printWithTitle } from '@/lib/printWithTitle';

const ABUNDANCE_ARN = '251838';
const PERIOD_LABELS = { ret_1y: '1 Yr', ret_3y: '3 Yr', ret_5y: '5 Yr' };

export default function PortfolioReviewPlanner({ holdings, activePan, investorName, familyName, isFamilyView, arnOverrides = {}, onClose }) {
  const [screenerFunds, setScreenerFunds] = useState(null); // null = still loading
  const [screenerError, setScreenerError] = useState('');
  const [includeOwnArn, setIncludeOwnArn] = useState(false); // "Include funds sold by Abundance" -- off by default

  useEffect(() => {
    let cancelled = false;
    fetch('/api/screener')
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        // app/api/screener/route.js returns HTTP 503 with a valid JSON body
        // ({ error, funds: [], benchmarks }) on failure -- fetch() doesn't
        // reject on a non-2xx status, so this has to be checked explicitly
        // or a real outage silently renders as "everything is Unranked".
        if (!ok || d.error || !(d.funds || []).length) { setScreenerError('Peer fund data unavailable — try again shortly.'); return; }
        setScreenerFunds(d.funds);
      })
      .catch(() => { if (!cancelled) setScreenerError('Peer fund data unavailable — try again shortly.'); });
    return () => { cancelled = true; };
  }, []);

  const fmt = (n) => '₹' + Math.round(n || 0).toLocaleString('en-IN');

  // Same composite-id pattern app/cas-tracker/page.js's buildAllHoldings
  // already uses (id: `cas-${__ownerPan||activePan}-${folio}-${amfiCode||name}`)
  // -- amfiCode/name alone collide in pooled family view when two family
  // members hold the same scheme, which is exactly the case this drawer's
  // un-disabled-in-family-view button exists to support.
  const rowKey = (fund) => `${fund.__ownerPan || activePan}-${fund.folio || ''}-${fund.amfiCode || fund.name}`;

  // Each holding's own ARN, resolved once so both the filter and the
  // excluded-count footer agree on the identical value. Mirrors the exact
  // fallback app/cas-tracker/page.js:2734 uses for the per-card badge.
  const holdingsWithArn = useMemo(() => holdings.map(h => ({
    ...h,
    __resolvedArn: resolveHoldingArn(h.__ownerPan || activePan, h.folio, h.advisor, arnOverrides),
  })), [holdings, activePan, arnOverrides]);

  const ownArnHoldings   = holdingsWithArn.filter(h => h.__resolvedArn === ABUNDANCE_ARN);
  const includedHoldings = includeOwnArn ? holdingsWithArn : holdingsWithArn.filter(h => h.__resolvedArn !== ABUNDANCE_ARN);
  const totalIncludedValue = includedHoldings.reduce((s, h) => s + (h.value || 0), 0);

  const report = useMemo(() => {
    if (!screenerFunds) return null;
    return buildQuartileReport(includedHoldings, screenerFunds);
  }, [includedHoldings, screenerFunds]);

  // Uses the shared resolveDisplayName -- see lib/casDisplayName.js's own
  // docstring for the isFamilyView guard rationale.
  const displayName = resolveDisplayName(includedHoldings.map(h => h.__ownerName), { isFamilyView, familyName, investorName });

  const quartileColor = (q) =>
    q === 1 ? 'var(--g1)' : q === 2 ? '#f9a825' : q === 3 ? '#e65100' : q === 4 ? 'var(--neg)' : 'var(--muted)';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}
      onClick={onClose}>
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.35)', backdropFilter: 'blur(2px)' }} />

      <div onClick={e => e.stopPropagation()} style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 'min(760px, 100vw)',
        height: '100dvh', overflowY: 'auto',
        background: 'var(--surface)',
        boxShadow: '-8px 0 40px rgba(0,0,0,.15)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 28px 16px', borderBottom: '1.5px solid var(--border)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '.6rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 6 }}>
                Portfolio Review Report
              </div>
              <div style={{ fontSize: '.9rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-.3px' }}>
                {displayName}
              </div>
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginTop: 3 }}>
                Quartile ranking vs. category peers · 1Yr / 3Yr / 5Yr return (CAGR)
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
              <button
                className="no-print"
                onClick={() => printWithTitle(`Portfolio Review Report - ${displayName} - ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '6px 13px', borderRadius: 8,
                  border: '1.5px solid var(--border2)',
                  background: '#fff', color: 'var(--g2)',
                  fontFamily: 'Raleway, sans-serif', fontSize: '.72rem',
                  fontWeight: 700, cursor: 'pointer', letterSpacing: '.3px',
                }}
              >
                🖨 Print
              </button>
              <button onClick={onClose} className="no-print" style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'var(--muted)', padding: '4px 8px', marginTop: -4 }}>✕</button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 28px', flex: 1 }}>
          <label className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: '.72rem', fontWeight: 700, color: 'var(--text)', cursor: 'pointer' }}>
            <input type="checkbox" checked={includeOwnArn} onChange={e => setIncludeOwnArn(e.target.checked)}
              style={{ width: 15, height: 15, accentColor: 'var(--g1)', cursor: 'pointer' }} />
            Include funds sold by Abundance (ARN-{ABUNDANCE_ARN})
          </label>

          {!includeOwnArn && ownArnHoldings.length > 0 && (
            <div style={{ marginBottom: 16, padding: '8px 12px', background: 'var(--s2)', border: '1.5px solid var(--border)', borderRadius: 8, fontSize: '.68rem', color: 'var(--muted)' }}>
              {ownArnHoldings.length} fund{ownArnHoldings.length > 1 ? 's' : ''}, {fmt(ownArnHoldings.reduce((s, h) => s + (h.value || 0), 0))} excluded — sold under Abundance's own ARN.
            </div>
          )}

          {screenerError && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'var(--neg-bg)', border: '1.5px solid #ffcdd2', borderRadius: 10, fontSize: '.7rem', color: 'var(--neg)' }}>
              {screenerError}
            </div>
          )}

          {!report && !screenerError && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: '.78rem' }}>
              Loading peer fund data…
            </div>
          )}

          {report && report.categories.length === 0 && report.unranked.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--muted)', fontSize: '.78rem' }}>
              No holdings to review{ownArnHoldings.length > 0 ? " (all holdings are sold under Abundance's own ARN — check the box above to include them)" : ''}.
            </div>
          )}

          {report && report.categories.map(cat => (
            <div key={cat.category} style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8, paddingBottom: 6, borderBottom: '1.5px solid var(--border)', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--text)' }}>{cat.category}</span>
                <span style={{ fontSize: '.6rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                  Category median: {PERIODS.map(p => `${PERIOD_LABELS[p]} ${cat.categoryMedian[p] != null ? cat.categoryMedian[p].toFixed(2) + '%' : '-'}`).join(' · ')}
                </span>
              </div>
              <div style={{ overflowX: 'auto', borderRadius: 10, border: '1.5px solid var(--border)' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.65rem', minWidth: 480 }}>
                  <thead>
                    <tr style={{ background: 'var(--s2)' }}>
                      {['Scheme', 'Value', 'Holding %', ...PERIODS.map(p => `${PERIOD_LABELS[p]} Qtile`)].map(h => (
                        <th key={h} style={{ padding: '8px 10px', textAlign: h === 'Scheme' ? 'left' : 'right', fontWeight: 800, color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", fontSize: '.55rem', letterSpacing: '.5px', textTransform: 'uppercase', whiteSpace: 'nowrap', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cat.funds.map((fund, i) => (
                      <tr key={rowKey(fund)} style={{ borderBottom: i < cat.funds.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <td style={{ padding: '8px 10px' }}>
                          {fund.name}
                          {fund.__ownerName && (
                            <div style={{ fontSize: '.55rem', color: 'var(--muted)', fontWeight: 700 }}>{fund.__ownerName}</div>
                          )}
                        </td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{fmt(fund.value)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace" }}>{totalIncludedValue > 0 ? ((fund.value / totalIncludedValue) * 100).toFixed(2) + '%' : '-'}</td>
                        {PERIODS.map(p => (
                          <td key={p} style={{ padding: '8px 10px', textAlign: 'right' }}>
                            {fund.quartiles[p] != null ? (
                              <span style={{ fontSize: '.6rem', fontWeight: 800, padding: '2px 8px', borderRadius: 6, color: '#fff', background: quartileColor(fund.quartiles[p]) }}>
                                Q{fund.quartiles[p]}
                              </span>
                            ) : (
                              <span style={{ color: 'var(--muted)' }}>-</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {report && report.unranked.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--text)', marginBottom: 8, paddingBottom: 6, borderBottom: '1.5px solid var(--border)' }}>
                Unranked
              </div>
              <div style={{ fontSize: '.65rem', color: 'var(--muted)', marginBottom: 8 }}>
                No matching scheme found by code or by name (SIF, a scheme not currently tracked, or a Direct plan whose Regular-plan counterpart also isn't in our data) — value still counted, no quartile available.
              </div>
              {report.unranked.map(fund => (
                <div key={rowKey(fund)} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: '.65rem', borderBottom: '1px solid var(--border)' }}>
                  <span>{fund.name}{fund.__ownerName ? ` · ${fund.__ownerName}` : ''}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{fmt(fund.value)}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: '.6rem', color: 'var(--muted)', lineHeight: 1.6, padding: '12px 14px', background: 'var(--s2)', borderRadius: 10, border: '1.5px solid var(--border)', marginTop: 20 }}>
            Quartile rank compares each fund's own 1Yr/3Yr/5Yr point-to-point return (CAGR) against every other AMFI-registered fund in its own SEBI sub-category, using the most recently published NAV data. Quartile 1 = top 25% of the category, Quartile 4 = bottom 25%. This is not a rolling-return statistic and not investment advice — past performance does not guarantee future results. Mutual fund investments are subject to market risks; read all scheme-related documents carefully. | ARN-{ABUNDANCE_ARN} | Abundance Financial Services
          </div>
        </div>
      </div>
    </div>
  );
}
