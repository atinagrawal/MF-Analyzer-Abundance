'use client';
// app/screener/MFCompare.jsx
//
// MF/SIF fund comparison — floating selection bar + (added in Task 7) the
// full comparison modal. Modeled directly on app/pms-screener/PMSCompare.jsx's
// PMSCompareBar, extended with a small per-chip type badge (MF/SIF) since
// this feature mixes both.
import { useState, useEffect, useMemo } from 'react';
import ProviderAvatar from '@/components/ProviderAvatar';
import { getMFLogo, getSIFLogo } from '@/lib/providerLogos';
import { normalizeFund, winCounts, applyDerivedStats, fetchNavSeries, categoryPeerRank, pickCommonRankPeriod, computeWealthSimulation, seriesAsOf, computeVerdictScores, overallWinner } from './compareEngine';
import CompareGrowthChart from './CompareGrowthChart';
import './mf-compare.css';

const MAX_COMPARE = 3;

const PERIODS = [
  { label: '1 Month', key: 'ret_1m' },
  { label: '3 Months', key: 'ret_3m' },
  { label: '6 Months', key: 'ret_6m' },
  { label: '1 Year', key: 'ret_1y' },
  { label: '3 Years', key: 'ret_3y' },
  { label: '5 Years', key: 'ret_5y' },
  { label: '7 Years', key: 'ret_7y' },
  { label: '10 Years', key: 'ret_10y' },
  { label: 'Inception', key: 'ret_inception' },
];
const RISK_METRICS = [
  { label: 'Volatility', key: 'vol', lowerIsBetter: true, suffix: '%' },
  { label: 'Max Drawdown', key: 'max_dd', lowerIsBetter: false, suffix: '%' }, // values are <= 0; "best" = closest to zero = the MAX value, not the min
  { label: 'Return/Risk', key: 'ret_per_risk', lowerIsBetter: false, suffix: '' },
];

function fmtRet(v) {
  if (v == null) return '—';
  return (v > 0 ? '+' : '') + v.toFixed(1) + '%';
}
function rc(v) {
  if (v == null) return 'neu';
  return v > 0 ? 'pos' : v < 0 ? 'neg' : 'neu';
}
function bestIndexFor(vals, lowerIsBetter) {
  const valid = vals.map((v, i) => ({ v, i })).filter((p) => p.v != null);
  if (valid.length < 2) return -1;
  const best = lowerIsBetter ? Math.min(...valid.map((p) => p.v)) : Math.max(...valid.map((p) => p.v));
  const match = valid.find((p) => p.v === best);
  return match ? match.i : -1;
}

// compareList entries are raw fund objects (pre-normalizeFund) -- an MF row
// carries `.name`, but a raw SIF row has no `.name` field at all (its display
// name is `.nav_name`), matching normalizeFund's own MF-vs-SIF field mapping.
function displayName(f) {
  return (f.type === 'mf' ? f.name : f.nav_name) || '';
}

export function MFCompareBar({ selected, onRemove, onClear, onCompare }) {
  const vis = selected.length > 0;
  return (
    <div className={`cmp-bar${vis ? ' visible' : ''}`} role="region" aria-label="Fund Compare basket">
      <div className="cmp-bar-chips">
        {selected.map((f) => {
          const name = displayName(f);
          return (
          <span key={f.id} className="cmp-chip">
            <span className="cmp-chip-type">{f.type}</span>
            {name.length > 18 ? name.slice(0, 18) + '…' : name}
            <span className="cmp-chip-x" role="button" onClick={() => onRemove(f.id)} aria-label={`Remove ${name} from compare`}>×</span>
          </span>
          );
        })}
        {selected.length < MAX_COMPARE && (
          <span className="cmp-chip" style={{ opacity: 0.4, fontStyle: 'italic' }}>
            + {MAX_COMPARE - selected.length} more
          </span>
        )}
      </div>
      <span className="cmp-bar-label">{selected.length}/{MAX_COMPARE} selected</span>
      <button className="cmp-go-btn" onClick={onCompare} disabled={selected.length < 2} style={{ opacity: selected.length < 2 ? 0.5 : 1 }}>
        ⚖ Compare Now
      </button>
      <button className="cmp-clear-btn" onClick={onClear}>Clear</button>
    </div>
  );
}

/**
 * @param {Array} props.funds        - compareList entries, each { type: 'mf'|'sif', ...rawFund }
 * @param {Array} props.allMfFunds   - the screener's full `funds` array, for category peer-rank (Task 8)
 * @param {Function} props.onClose
 * @param {Function} props.onRemove
 */
export function MFCompareModal({ funds, allMfFunds, onClose, onRemove }) {
  const normalized = useMemo(() => funds.map(normalizeFund), [funds]);
  const n = normalized.length;

  // SIF funds start with null return/risk fields (normalizeFund) — fetch
  // each SIF's real NAV history once on mount and derive its stats. MF
  // funds are already fully populated, so this only ever touches SIF
  // entries. Each fetch is independent; a failure leaves that one fund's
  // fields null (rendered as "—"), never blocks the others.
  const [derived, setDerived] = useState(normalized);
  // Tracks whether the SIF-derivation fetch below is still in flight, so the
  // verdict banner (and win-badges) never render a confident conclusion from
  // a mix of "real" MF stats and still-null SIF stats — see the loading
  // branch in the verdict banner section below.
  const [derivedLoading, setDerivedLoading] = useState(true);
  useEffect(() => {
    setDerived(normalized);
    setDerivedLoading(true);
    let cancelled = false;
    Promise.all(normalized.map(async (f) => {
      if (f.type !== 'sif') return f;
      const series = await fetchNavSeries(f);
      return applyDerivedStats(f, series);
    })).then((results) => {
      if (!cancelled) {
        setDerived(results);
        setDerivedLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [normalized]);

  // Real NAV history per selected fund — used by both the Wealth Simulation
  // (SIP calculation) and the interactive chart (Task 10). Fetched once per
  // fund here so neither section re-fetches the same data independently.
  const [navSeriesByFund, setNavSeriesByFund] = useState({});
  useEffect(() => {
    let cancelled = false;
    Promise.all(normalized.map(async (f) => ({ id: f.id, series: await fetchNavSeries(f) }))).then((results) => {
      if (cancelled) return;
      const map = {};
      results.forEach((r) => { map[r.id] = r.series; });
      setNavSeriesByFund(map);
    });
    return () => { cancelled = true; };
  }, [normalized]);

  const counts = useMemo(() => winCounts(derived), [derived]);

  if (!funds.length) return null;

  return (
    <>
      <div className="cmp-overlay open" onClick={onClose} />
      <div className="cmp-modal open" role="dialog" aria-modal="true" aria-label="Fund Comparison">
        <div className="cmp-modal-inner" style={{ '--cols': n }}>

          <div className="cmp-modal-header">
            <div>
              <div className="cmp-modal-title">⚖ Fund Comparison</div>
              <div className="cmp-modal-sub">Abundance Financial Services · ARN-251838</div>
            </div>
            <button className="cmp-modal-close" onClick={onClose} aria-label="Close comparison">×</button>
          </div>

          {(() => {
            // Align every fund's series to the same start date -- the LATEST
            // "first available NAV" among the selected funds (i.e. governed
            // by whichever fund has the shortest real history) -- then build
            // ONE SHARED date grid from whichever fund has the SPARSEST
            // trimmed series (a sparse calendar's dates can't be fabricated
            // for), and resample every OTHER fund onto those EXACT dates via
            // seriesAsOf (last known NAV on/before that date). This
            // guarantees every series ends up the SAME LENGTH and
            // index-aligned by the SAME real date -- required because
            // CompareGrowthChart's x-axis is purely index-based (see its own
            // doc comment) and MF (/api/mf) vs SIF (/api/sif-history) NAV
            // data come from different upstreams with no shared publishing
            // calendar, so raw series can differ in length or (worse) match
            // in length while covering different actual dates at the same
            // index.
            const seriesList = derived
              .map((f) => ({ f, raw: navSeriesByFund[f.id] }))
              .filter((x) => x.raw && x.raw.length >= 2);
            if (seriesList.length < 2) return null;

            const commonStartT = Math.max(...seriesList.map((x) => x.raw[0].t));
            const trimmedList = seriesList
              .map((x) => ({ f: x.f, trimmed: x.raw.filter((p) => p.t >= commonStartT) }))
              .filter((x) => x.trimmed.length >= 2);
            if (trimmedList.length < 2) return null;

            const sparsest = trimmedList.reduce((a, b) => (b.trimmed.length < a.trimmed.length ? b : a));
            const commonStartT2 = Math.max(...trimmedList.map((x) => x.trimmed[0].t));
            const gridDates = sparsest.trimmed.map((p) => p.t).filter((t) => t >= commonStartT2);
            if (gridDates.length < 2) return null;

            const colors = ['#1b5e20', '#e65100', '#1565c0'];
            const chartSeries = trimmedList.map(({ f, trimmed }, i) => {
              const basePx = seriesAsOf(trimmed, gridDates[0]);
              if (!basePx) return null;
              const baseNav = basePx.nav;
              const aligned = gridDates.map((t) => {
                const px = seriesAsOf(trimmed, t);
                return px ? { t, v: (px.nav / baseNav) * 100000 } : null;
              });
              if (aligned.some((p) => p == null)) return null;
              return {
                name: f.name.length > 24 ? f.name.slice(0, 24) + '…' : f.name,
                color: colors[i % colors.length],
                data: aligned,
              };
            }).filter(Boolean);

            if (chartSeries.length < 2) return null;
            return <CompareGrowthChart series={chartSeries} />;
          })()}

          <div className="cmp-grid" style={{ '--cols': n }}>
            <div className="cmp-cell cmp-strat-header">
              <div style={{ fontWeight: 700, fontSize: '.72rem', color: 'var(--muted)', paddingTop: 6 }}>FUND</div>
            </div>
            {normalized.map((f, i) => (
              <div key={f.id} className="cmp-cell cmp-strat-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 6 }}>
                  <ProviderAvatar
                    name={f.house}
                    logoPath={f.type === 'mf' ? getMFLogo(f.house) : getSIFLogo(f.house)}
                    size={34}
                    radius={8}
                  />
                  <div>
                    <div className="cmp-strat-name">{f.name}</div>
                    <div className="cmp-strat-mgr">{f.house}</div>
                  </div>
                </div>
                <span className={`cmp-type-badge ${f.type}`}>{f.type === 'mf' ? 'Mutual Fund' : 'SIF'}</span>
                {!derivedLoading && counts[i] > 0 && (
                  <span className="cmp-win-badge">🏆 Best in {counts[i]} metric{counts[i] > 1 ? 's' : ''}</span>
                )}
                <button className="cmp-remove-btn" onClick={() => onRemove(f.id)}>✕ Remove</button>
              </div>
            ))}

            {/* Returns */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              📊 Returns Across All Time Horizons
            </div>
            {PERIODS.map(({ label, key }) => {
              const vals = derived.map((f) => f[key]);
              if (vals.every((v) => v == null)) return null;
              const bestIdx = bestIndexFor(vals, false);
              return (
                <div key={key} className="cmp-row">
                  <div className="cmp-cell" style={{ fontWeight: 700 }}>{label}</div>
                  {derived.map((f, i) => (
                    <div key={f.id} className={`cmp-cell${bestIdx === i ? ' cmp-ret-best' : ''}`}>
                      <span className={`cmp-ret ${rc(f[key])}`}>{fmtRet(f[key])}</span>
                      {bestIdx === i && n > 1 && <span style={{ fontSize: '.55rem', marginLeft: 4, color: 'var(--g3)' }}>↑ best</span>}
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Risk metrics */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              📉 Risk Metrics
            </div>
            {RISK_METRICS.map(({ label, key, lowerIsBetter, suffix }) => {
              const vals = derived.map((f) => f[key]);
              if (vals.every((v) => v == null)) return null;
              const bestIdx = bestIndexFor(vals, lowerIsBetter);
              return (
                <div key={key} className="cmp-row">
                  <div className="cmp-cell" style={{ fontWeight: 700 }}>{label}</div>
                  {derived.map((f, i) => (
                    <div key={f.id} className={`cmp-cell${bestIdx === i ? ' cmp-ret-best' : ''}`}>
                      <span className={`cmp-ret ${key === 'max_dd' ? 'neg' : 'neu'}`}>
                        {f[key] == null ? '—' : (key === 'ret_per_risk' ? f[key].toFixed(2) : f[key].toFixed(1) + suffix)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Category peer-rank (MF only — see categoryPeerRank's doc comment).
                Uses the longest return period every compared MF fund actually
                has (preferring 3Y), so the row shows one consistent period
                across all funds instead of "3Y for one, dash for another" —
                see pickCommonRankPeriod. Hidden entirely if no MF fund is
                being compared, or none of the fallback periods is common to
                all of them. */}
            {(() => {
              const rankPeriod = pickCommonRankPeriod(derived);
              if (!rankPeriod) return null;
              return (
                <>
                  <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
                    🏅 Category Peer-Rank
                  </div>
                  <div className="cmp-row">
                    <div className="cmp-cell" style={{ fontWeight: 700 }}>Rank by {rankPeriod.label} Return</div>
                    {derived.map((f) => {
                      const rank = categoryPeerRank(f, allMfFunds, rankPeriod.key);
                      return (
                        <div key={f.id} className="cmp-cell">
                          {rank ? (
                            <span className="cmp-peer-rank">#{rank.rank} <span className="cmp-peer-rank-of">of {rank.of}</span></span>
                          ) : (
                            <span className="cmp-ret neu" title={f.type === 'sif' ? 'Not enough SIF peer data yet' : 'Not enough data for this category'}>—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}

            {/* Wealth Simulation. Hides an individual stop (1Y/3Y/5Y) that
                NO selected fund has data for, rather than showing "—" for
                everyone in that column; hides the Lumpsum or SIP row
                entirely if NO fund has any data for it at all (this is also
                how an all-SIF comparison's SIP row disappears — SIFs never
                produce sip data, see computeWealthSimulation); hides the
                whole section if both rows end up empty. */}
            {(() => {
              const sims = derived.map((f) => computeWealthSimulation(f, navSeriesByFund[f.id]));
              const stopsOf = sims[0] || [];
              const qualifyingStops = (field) =>
                stopsOf.map((_, idx) => idx).filter((idx) => sims.some((s) => s[idx]?.[field] != null));
              const lumpsumStops = qualifyingStops('lumpsum');
              const sipStops = qualifyingStops('sip');
              if (!lumpsumStops.length && !sipStops.length) return null;

              return (
                <>
                  <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
                    💰 Wealth Simulation
                  </div>
                  {lumpsumStops.length > 0 && (
                    <div className="cmp-row">
                      <div className="cmp-cell" style={{ fontWeight: 700 }}>
                        <div className="cmp-wealth-subhead">Lumpsum (₹1L MF · ₹10L SIF min.)</div>
                      </div>
                      {derived.map((f, i) => (
                        <div key={f.id} className="cmp-cell">
                          <div className="cmp-wealth-strip">
                            {lumpsumStops.map((stopIdx, pos) => {
                              const { label, lumpsum } = sims[i][stopIdx];
                              return (
                                <div key={label} style={{ display: 'contents' }}>
                                  <div className="cmp-wealth-stop">
                                    <div className="cmp-wealth-stop-period">{label}</div>
                                    <div className="cmp-wealth-stop-val" style={{ color: lumpsum && lumpsum.gain >= 0 ? 'var(--g2)' : 'var(--neg)' }}>
                                      {lumpsum ? '₹' + Math.round(lumpsum.value).toLocaleString('en-IN') : '—'}
                                    </div>
                                    <div className="cmp-wealth-stop-gain" style={{ color: lumpsum && lumpsum.gain >= 0 ? 'var(--g3)' : 'var(--neg)' }}>
                                      {lumpsum ? (lumpsum.gain >= 0 ? '+' : '') + '₹' + Math.abs(Math.round(lumpsum.gain)).toLocaleString('en-IN') : ''}
                                    </div>
                                  </div>
                                  {pos < lumpsumStops.length - 1 && <div className="cmp-wealth-arrow">→</div>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {sipStops.length > 0 && (
                    <div className="cmp-row">
                      <div className="cmp-cell" style={{ fontWeight: 700 }}>
                        <div className="cmp-wealth-subhead">₹10,000/mo SIP (Real, MF only)</div>
                      </div>
                      {derived.map((f, i) => (
                        <div key={f.id} className="cmp-cell">
                          <div className="cmp-wealth-strip">
                            {sipStops.map((stopIdx, pos) => {
                              const { label, sip } = sims[i][stopIdx];
                              return (
                                <div key={label} style={{ display: 'contents' }}>
                                  <div className="cmp-wealth-stop">
                                    <div className="cmp-wealth-stop-period">{label}</div>
                                    <div className="cmp-wealth-stop-val" style={{ color: sip && sip.gain >= 0 ? 'var(--g2)' : 'var(--neg)' }}>
                                      {sip ? '₹' + Math.round(sip.value).toLocaleString('en-IN') : '—'}
                                    </div>
                                    <div className="cmp-wealth-stop-gain" style={{ color: sip && sip.gain >= 0 ? 'var(--g3)' : 'var(--neg)' }}>
                                      {sip ? `XIRR ${(sip.xirr * 100).toFixed(1)}%` : ''}
                                    </div>
                                  </div>
                                  {pos < sipStops.length - 1 && <div className="cmp-wealth-arrow">→</div>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {n > 1 && (() => {
            if (derivedLoading) {
              return (
                <div className="cmp-verdict">
                  <div className="cmp-verdict-icon">⏳</div>
                  <div>
                    <div className="cmp-verdict-title">Calculating Overall Leader…</div>
                    <div className="cmp-verdict-body">Waiting for all selected funds' data to finish loading before determining the overall leader.</div>
                  </div>
                </div>
              );
            }
            const scores = computeVerdictScores(derived);
            const winner = overallWinner(derived, scores);
            if (!winner) return null;
            if (winner.tie) {
              const names = winner.funds.map((f) => f.name).join(' and ');
              return (
                <div className="cmp-verdict">
                  <div className="cmp-verdict-icon">🤝</div>
                  <div>
                    <div className="cmp-verdict-title">It's a Tie: {names}</div>
                    <div className="cmp-verdict-body">
                      <strong>{names}</strong> are evenly matched across the metrics compared — weighted toward long-term
                      consistency (5Y/7Y/10Y and Return/Risk count most, 1M/3M count least), averaged only over the periods
                      each fund actually has data for so a newer fund isn't penalized for not existing that long.
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div className="cmp-verdict">
                <div className="cmp-verdict-icon">🏆</div>
                <div>
                  <div className="cmp-verdict-title">Overall Leader: {winner.fund.name}</div>
                  <div className="cmp-verdict-body">
                    <strong>{winner.fund.name}</strong> by <strong>{winner.fund.house}</strong> ranks highest across the
                    metrics compared — weighted toward long-term consistency (5Y/7Y/10Y and Return/Risk count most,
                    1M/3M count least), averaged only over the periods each fund actually has data for so a newer
                    fund isn't penalized for not existing that long.
                  </div>
                </div>
              </div>
            );
          })()}

          <div className="cmp-disclaimer">
            <strong>Important Disclosure:</strong> This comparison is for informational and educational purposes only and does not constitute investment advice.
            Data sourced from AMFI (mutual funds) and SEBI-regulated SIF disclosures. Past performance is not indicative of future returns.
            Abundance Financial Services. Atin Kumar Agrawal · ARN-251838 · AMFI Registered Mutual Fund &amp; SIF Distributor.
          </div>
        </div>
      </div>
    </>
  );
}
