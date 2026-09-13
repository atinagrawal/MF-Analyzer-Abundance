'use client';
// app/pms-preferred/PmsPreferredCompare.jsx
//
// Side-by-side comparison of up to 3 preferred strategies. Deliberately NOT
// a port of /pms-screener's PMSCompare.jsx: that tool is built around the
// raw APMI scrape shape (ret1M..retInception, apmiLink, portfolioManager)
// and fires 3 live fetches per fund on open (benchmark lookup, APMI
// quartile lookup, NSE/BSE index data) because the screener's bulk data
// has no period-return-vs-benchmark or factsheet data at all.
//
// This page's `strategy` objects already carry everything needed with ZERO
// live fetches: `performance.ia`/`performance.benchmark` (month1/3/6,
// year1-5, sinceInception -- see compute_preferred_pms.js, which was
// already fetching this per strategy for the "best alpha" insight, just
// not persisting it until now) and `extracted` (sector allocation,
// holdings, the full portfolioAttributes set). Both sides of every
// period's return are already on hand, so alpha can be shown for every
// period, not just 1Y the way the screener's live-fetch version manages.
import { useState } from 'react';
import { useSession, signIn } from 'next-auth/react';
import { getPMSLogo } from '@/lib/providerLogos';
import { fmtCr, fmtRatio, buildSectorDna } from './pmsPreferredFormat';
import { startCheckout } from '@/lib/checkoutClient';
import './pms-preferred-compare.css';

export const MAX_COMPARE = 3;

const PERIODS = [
  { label: '1 Month', key: 'month1' },
  { label: '3 Months', key: 'month3' },
  { label: '6 Months', key: 'month6' },
  { label: '1 Year', key: 'year1' },
  { label: '2 Years', key: 'year2' },
  { label: '3 Years', key: 'year3' },
  { label: '4 Years', key: 'year4' },
  { label: '5 Years', key: 'year5' },
  { label: 'Since Inception', key: 'sinceInception' },
];

// Same progression /pms-screener's own PERIOD_WEIGHTS uses: longer,
// more-established horizons count more toward the verdict than short-term
// noise. No 7Y/10Y here -- APMI's getPerformanceChart endpoint (this
// data's source) simply doesn't publish those breakpoints, unlike the
// separate WSIAConsolidateReport quartile endpoint the screener's tool
// also hits; never fabricated to fill the gap.
const PERIOD_WEIGHTS = {
  month1: 0.5, month3: 0.75, month6: 1, year1: 1.5,
  year2: 2, year3: 2.5, year4: 3, year5: 3.5, sinceInception: 2,
};

const METRIC_DEFS = [
  { key: 'sharpeRatio', label: 'Sharpe Ratio', unit: '' },
  { key: 'standardDeviation', label: 'Std. Deviation', unit: '%' },
  { key: 'portfolioPe', label: 'Portfolio P/E', unit: '' },
  { key: 'roe', label: 'ROE', unit: '%' },
  { key: 'beta', label: 'Beta', unit: '' },
  { key: 'alpha', label: 'Alpha (factsheet)', unit: '%' },
];

function fmtRet(v) {
  if (v == null || !Number.isFinite(v)) return null;
  return (v > 0 ? '+' : '') + v + '%';
}
function retClass(v) {
  if (v == null) return 'neu';
  return v > 0 ? 'pos' : v < 0 ? 'neg' : 'neu';
}
// `ret` is an ANNUALIZED (CAGR) rate for years > 1 -- growth compounds over
// `years`, not a flat one-time multiply (same convention as the screener's
// own fmtWealth; a bug here would only be visible past the 1Y stop).
function fmtWealth(ret, years) {
  if (ret == null || !Number.isFinite(ret)) return null;
  const INVESTMENT = 5000000; // ₹50L, SEBI's PMS floor
  const val = INVESTMENT * Math.pow(1 + ret / 100, years);
  return { value: `₹${Math.round(val).toLocaleString('en-IN')}`, isPos: val >= INVESTMENT };
}

export function PmsPrefCompareBar({ selected, onRemove, onClear, onCompare }) {
  const vis = selected.length > 0;
  return (
    <div className={`pmspref-cmp-bar${vis ? ' visible' : ''}`} role="region" aria-label="PMS compare basket">
      <div className="pmspref-cmp-bar-chips">
        {selected.map((s) => (
          <span key={s.iaid} className="pmspref-cmp-chip">
            {s.strategyName.length > 20 ? s.strategyName.slice(0, 20) + '…' : s.strategyName}
            <span className="pmspref-cmp-chip-x" role="button" tabIndex={0} onClick={() => onRemove(s.iaid)} aria-label={`Remove ${s.strategyName} from compare`}>×</span>
          </span>
        ))}
        {selected.length < MAX_COMPARE && (
          <span className="pmspref-cmp-chip" style={{ opacity: .4, fontStyle: 'italic' }}>+ {MAX_COMPARE - selected.length} more</span>
        )}
      </div>
      <span className="pmspref-cmp-bar-label">{selected.length}/{MAX_COMPARE} selected</span>
      <button className="pmspref-cmp-go-btn" onClick={onCompare} disabled={selected.length < 2}>⚖ Compare Now</button>
      <button className="pmspref-cmp-clear-btn" onClick={onClear}>Clear</button>
    </div>
  );
}

// Same isPro determination already used client-side elsewhere (e.g.
// app/screener/HoldingsSection.jsx) -- session-token fields only, no extra
// fetch. Gates just the returns/alpha/wealth/verdict sections below (the
// same category of data /pms/[id]'s own Pro gate covers -- full period
// history), never the whole page: portfolio attributes, sector DNA and
// holdings stay free for every visitor, matching that same page's split.
function useIsPro() {
  const { data: session } = useSession();
  return Boolean(
    session?.user?.role === 'admin' ||
    session?.user?.role === 'distributor' ||
    session?.user?.plan === 'pro' ||
    session?.user?.plan === 'pro_lifetime' ||
    session?.user?.plan === 'lifetime' ||
    session?.user?.isPro
  );
}

function CompareReturnsGate() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const isAuthed = Boolean(session?.user);

  async function handleUpgrade() {
    if (!isAuthed) { signIn(); return; }
    setLoading(true);
    setError('');
    try {
      await startCheckout({ plan: 'annual', session, onSuccess() { window.location.reload(); }, onDismiss() { setLoading(false); } });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="pmspref-cmp-gate">
      <div className="pmspref-cmp-gate-crown">👑</div>
      <div className="pmspref-cmp-gate-title">Full Return History is an Abundance Pro Feature</div>
      <p className="pmspref-cmp-gate-desc">
        Returns across every time horizon, alpha vs. each strategy&apos;s own benchmark, the wealth-creation
        simulation and the overall-leader verdict are Pro features — the same as full performance history on
        each strategy&apos;s own detail page. Portfolio attributes, sector allocation and holdings above stay free.
      </p>
      <button className="pmspref-cmp-gate-btn" onClick={handleUpgrade} disabled={loading}>
        {loading ? 'Opening checkout…' : !isAuthed ? 'Sign in to Upgrade →' : 'Upgrade to Pro — ₹499/yr →'}
      </button>
      {error && <p className="pmspref-cmp-gate-err">{error}</p>}
      <a className="pmspref-cmp-gate-link" href="/pricing" target="_blank" rel="noopener noreferrer">See all Pro features &amp; plans →</a>
    </div>
  );
}

export function PmsPrefCompareModal({ strategies, asOn, onClose, onRemove }) {
  const n = strategies.length;
  const isPro = useIsPro();
  if (!n) return null;

  // Per-period "best cell" index (own IA return only -- not alpha, not
  // AUM), used both to highlight the table and to tally each column's
  // "Best in N periods" badge.
  const winners = {};
  PERIODS.forEach(({ key }) => {
    const vals = strategies.map((s) => s.performance?.ia?.[key] ?? -Infinity);
    const maxV = Math.max(...vals);
    winners[key] = vals.map((v) => v !== -Infinity && v === maxV);
  });
  const winCount = strategies.map((_, i) => PERIODS.reduce((c, { key }) => c + (winners[key][i] ? 1 : 0), 0));

  // Weighted, margin-aware verdict score -- same shape as the screener's
  // own `scores`: rank only strategies with real data for a period (skip
  // the period if fewer than 2 have it), average by the weight actually
  // scored on so a younger strategy missing 5Y/Inception isn't penalized
  // for not existing that long, only judged on what it does have.
  const weightSums = Array(n).fill(0);
  const totals = Array(n).fill(0);
  PERIODS.forEach(({ key }) => {
    const weight = PERIOD_WEIGHTS[key];
    const participants = strategies
      .map((s, i) => ({ i, v: s.performance?.ia?.[key] }))
      .filter((p) => p.v != null);
    if (participants.length < 2) return;
    const ranked = [...participants].sort((a, b) => b.v - a.v);
    const m = ranked.length;
    ranked.forEach((p, rankIdx) => {
      const share = (m - rankIdx) / m;
      totals[p.i] += weight * share;
      weightSums[p.i] += weight;
    });
  });
  const scores = totals.map((t, i) => (weightSums[i] > 0 ? t / weightSums[i] : 0));
  const maxScore = Math.max(...scores);
  const winnerIdx = maxScore > 0 ? scores.indexOf(maxScore) : -1;
  const winner = winnerIdx >= 0 ? strategies[winnerIdx] : null;

  const wealthYears = [1, 3, 5];

  return (
    <>
      <div className={`pmspref-cmp-overlay${n ? ' open' : ''}`} onClick={onClose} />
      <div className={`pmspref-cmp-modal${n ? ' open' : ''}`} role="dialog" aria-modal="true" aria-label="Strategy comparison">
        <div className="pmspref-cmp-modal-inner">
          <div className="pmspref-cmp-modal-header">
            <div>
              <div className="pmspref-cmp-modal-title">⚖ Strategy Comparison</div>
              <div className="pmspref-cmp-modal-sub">APMI India{asOn ? ` · as on ${asOn}` : ''} · TWRR · Net of fees · APRN04279</div>
            </div>
            <button className="pmspref-cmp-modal-close" onClick={onClose} aria-label="Close comparison">×</button>
          </div>

          <div className="pmspref-cmp-grid" style={{ '--cols': n }}>
            {/* Strategy header row */}
            <div className="pmspref-cmp-cell pmspref-cmp-strat-header" />
            {strategies.map((s, i) => {
              const logo = getPMSLogo(s.providerName);
              return (
                <div key={s.iaid} className="pmspref-cmp-cell pmspref-cmp-strat-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    {logo
                      ? <img src={logo} alt="" style={{ height: 22, width: 'auto', maxWidth: 80, objectFit: 'contain' }} />
                      : <span style={{ fontWeight: 700, fontSize: '.7rem' }}>{s.providerName.charAt(0)}</span>}
                  </div>
                  <div className="pmspref-cmp-strat-name">{s.strategyName}</div>
                  <div className="pmspref-cmp-strat-mgr">{s.providerName}</div>
                  <div className="pmspref-cmp-strat-aum">{s.aumCr != null ? fmtCr(s.aumCr) : '—'}</div>
                  {isPro && winCount[i] > 0 && (
                    <span className="pmspref-cmp-win-badge">🏆 Best in {winCount[i]} period{winCount[i] > 1 ? 's' : ''}</span>
                  )}
                  <button className="pmspref-cmp-remove-btn" onClick={() => onRemove(s.iaid)}>✕ Remove</button>
                </div>
              );
            })}

            {isPro ? (
              <>
                {/* Returns */}
                <div className="pmspref-cmp-section-head">📊 Returns Across All Time Horizons</div>
                {PERIODS.map(({ label, key }) => {
                  const vals = strategies.map((s) => s.performance?.ia?.[key]);
                  if (vals.every((v) => v == null)) return null;
                  return (
                    <div className="pmspref-cmp-row" key={key}>
                      <div className="pmspref-cmp-cell" style={{ fontWeight: 700 }}>{label}</div>
                      {strategies.map((s, i) => {
                        const v = s.performance?.ia?.[key];
                        const isBest = winners[key][i];
                        return (
                          <div key={s.iaid} className={`pmspref-cmp-cell${isBest ? ' pmspref-cmp-ret-best' : ''}`}>
                            <span className={`pmspref-cmp-ret ${retClass(v)}`}>{fmtRet(v) ?? '—'}</span>
                            {isBest && n > 1 && <span className="pmspref-cmp-best-tag">↑ best</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Alpha vs each strategy's own benchmark, every period --
                    both sides already on hand, no live lookup needed (unlike
                    the screener's tool, which only manages 1Y via a live fetch). */}
                <div className="pmspref-cmp-section-head">📈 Alpha vs Own Benchmark</div>
                {PERIODS.map(({ label, key }) => {
                  const alphas = strategies.map((s) => {
                    const ia = s.performance?.ia?.[key];
                    const bm = s.performance?.benchmark?.[key];
                    return ia != null && bm != null ? +(ia - bm).toFixed(2) : null;
                  });
                  if (alphas.every((v) => v == null)) return null;
                  const valid = alphas.filter((v) => v != null);
                  const maxAlpha = valid.length ? Math.max(...valid) : null;
                  return (
                    <div className="pmspref-cmp-row" key={key}>
                      <div className="pmspref-cmp-cell" style={{ fontWeight: 700 }}>{label}</div>
                      {strategies.map((s, i) => {
                        const a = alphas[i];
                        const isBest = n > 1 && a != null && a === maxAlpha;
                        return (
                          <div key={s.iaid} className={`pmspref-cmp-cell${isBest ? ' pmspref-cmp-ret-best' : ''}`}>
                            <span className={`pmspref-cmp-ret ${retClass(a)}`}>{fmtRet(a) ?? '—'}</span>
                            {isBest && <span className="pmspref-cmp-best-tag">↑ best</span>}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Wealth simulation */}
                <div className="pmspref-cmp-section-head">💰 Wealth Creation Simulation · ₹50 Lakh Invested</div>
                {wealthYears.map((years) => {
                  const key = years === 1 ? 'year1' : years === 3 ? 'year3' : 'year5';
                  const vals = strategies.map((s) => fmtWealth(s.performance?.ia?.[key], years));
                  if (vals.every((v) => v == null)) return null;
                  return (
                    <div className="pmspref-cmp-row" key={key}>
                      <div className="pmspref-cmp-cell" style={{ fontWeight: 700 }}>{years}Y Growth of ₹50L</div>
                      {strategies.map((s, i) => (
                        <div key={s.iaid} className="pmspref-cmp-cell">
                          <span className={`pmspref-cmp-ret ${vals[i] ? (vals[i].isPos ? 'pos' : 'neg') : 'neu'}`}>{vals[i]?.value ?? '—'}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="pmspref-cmp-row">
                <div className="pmspref-cmp-cell" style={{ gridColumn: `1 / span ${n + 1}`, padding: 0 }}>
                  <CompareReturnsGate />
                </div>
              </div>
            )}

            {/* Portfolio attributes, straight from each strategy's factsheet */}
            <div className="pmspref-cmp-section-head">📐 Portfolio Attributes (Latest Factsheet)</div>
            {METRIC_DEFS.map(({ key, label, unit }) => {
              const vals = strategies.map((s) => fmtRatio(s.extracted?.portfolioAttributes?.[key]?.strategy));
              if (vals.every((v) => v == null)) return null;
              return (
                <div className="pmspref-cmp-row" key={key}>
                  <div className="pmspref-cmp-cell" style={{ fontWeight: 700 }}>{label}</div>
                  {strategies.map((s, i) => (
                    <div key={s.iaid} className="pmspref-cmp-cell">
                      <span className="pmspref-cmp-ret neu">{vals[i] != null ? `${vals[i]}${unit}` : '—'}</span>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Sector DNA */}
            <div className="pmspref-cmp-section-head">🧬 Sector DNA</div>
            <div className="pmspref-cmp-row">
              <div className="pmspref-cmp-cell" style={{ fontWeight: 700 }}>Top Sectors</div>
              {strategies.map((s) => {
                const dna = buildSectorDna(s.extracted?.sectorAllocation);
                return (
                  <div key={s.iaid} className="pmspref-cmp-cell">
                    {dna ? (
                      <>
                        <div className="pmspref-dna-bar pmspref-dna-bar--sm" style={{ marginBottom: 6 }}>
                          {dna.map((seg, i2) => (
                            <span key={i2} className={`pmspref-dna-seg pmspref-dna-seg--${seg.swatch}`} style={{ width: `${seg.weightPct}%` }} title={`${seg.sector} ${seg.weightPct}%`} />
                          ))}
                        </div>
                        {dna.slice(0, 3).map((seg, i2) => (
                          <div key={i2} style={{ fontSize: '.66rem', color: 'var(--pmsp-muted-2)' }}>{seg.sector} {seg.weightPct}%</div>
                        ))}
                      </>
                    ) : <span className="pmspref-cmp-ret neu">—</span>}
                  </div>
                );
              })}
            </div>

            {/* Top holdings */}
            <div className="pmspref-cmp-section-head">💼 Top Holdings</div>
            <div className="pmspref-cmp-row">
              <div className="pmspref-cmp-cell" style={{ fontWeight: 700 }}>Holdings</div>
              {strategies.map((s) => {
                const holdings = (s.extracted?.topHoldings || []).filter((h) => h?.name).slice(0, 6);
                return (
                  <div key={s.iaid} className="pmspref-cmp-cell">
                    {holdings.length > 0 ? (
                      <div className="pmspref-cmp-holdings">
                        {holdings.map((h) => <span key={h.name} className="pmspref-holding-chip">{h.name}</span>)}
                      </div>
                    ) : <span className="pmspref-cmp-ret neu">Not disclosed this month</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {isPro && n > 1 && winner && (
            <div className="pmspref-cmp-verdict">
              <div className="pmspref-cmp-verdict-icon">🏆</div>
              <div>
                <div className="pmspref-cmp-verdict-title">Overall Leader: {winner.strategyName}</div>
                <div className="pmspref-cmp-verdict-body">
                  <strong>{winner.strategyName}</strong> by <strong>{winner.providerName}</strong> ranks highest across
                  time horizons — winning {winCount[winnerIdx]} of {PERIODS.length} return periods outright, weighted
                  toward long-term consistency (5Y counts most, 1M counts least; AUM isn&apos;t a factor).{' '}
                  <a href={`/pms/${winner.iaid}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--g1)', fontWeight: 700, textDecoration: 'none' }}>
                    View Full Details ↗
                  </a>
                </div>
              </div>
            </div>
          )}

          <div className="pmspref-cmp-disclaimer">
            <strong>Important Disclosure:</strong> This comparison is for informational and educational purposes only and
            does not constitute investment advice. Data sourced from APMI India{asOn ? ` · as on ${asOn}` : ''} · TWRR,
            net of all fees. Past performance is not indicative of future returns. Minimum PMS investment is ₹50 lakh per SEBI.
            Atin Kumar Agrawal · APRN04279 · APMI Registered Portfolio Management Services Distributor · Abundance Financial Services.
          </div>
        </div>
      </div>
    </>
  );
}
