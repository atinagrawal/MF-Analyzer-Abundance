'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProviderAvatar from '@/components/ProviderAvatar';
import { getPMSLogo } from '@/lib/providerLogos';
import { startCheckout } from '@/lib/checkoutClient';
import { buildPmsDetailFaq } from '@/lib/pmsDetailFaq';
import CompareGrowthChart from '@/app/screener/CompareGrowthChart';
import './pms-detail.css';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Apr-2024" -> ms timestamp of that month's last day (UTC). */
function monthLabelToTimestamp(label) {
  const [abbr, yearStr] = label.split('-');
  const year = parseInt(yearStr, 10);
  const month = MONTH_ABBR.indexOf(abbr) + 1; // 1-indexed
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Date.UTC(year, month - 1, lastDay);
}

/**
 * Reconstructs "grew ₹100 to ₹X" cumulative series for both the IA and its
 * benchmark in a single pass over history -- the same shape
 * CompareGrowthChart already renders elsewhere in this app. Built together
 * (rather than as two independent per-series calls) so a month missing on
 * either side is skipped from BOTH series, keeping them the same
 * length/x-axis as CompareGrowthChart's documented invariant requires.
 */
function buildGrowthSeries(history, iaName, iaColor, benchName, benchColor) {
  let iaValue = 100;
  let benchValue = 100;
  const iaData = [];
  const benchData = [];
  for (const snap of history) {
    const iaRet = snap.ia?.month1;
    const benchRet = snap.benchmark?.month1;
    if (iaRet == null || benchRet == null) continue; // keep both series aligned to the same months
    iaValue = iaValue * (1 + iaRet / 100);
    benchValue = benchValue * (1 + benchRet / 100);
    const t = monthLabelToTimestamp(snap.asOnMonth);
    iaData.push({ t, v: iaValue });
    benchData.push({ t, v: benchValue });
  }
  const series = [];
  if (iaData.length >= 2 && benchData.length >= 2) {
    series.push({ name: iaName, color: iaColor, data: iaData });
    series.push({ name: benchName, color: benchColor, data: benchData });
  }
  return series;
}

function pctTxt(v) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function fmtCr(v) {
  if (v == null) return '—';
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
}

function fmtInr(v) {
  if (v == null) return '—';
  return `₹${Number(v).toLocaleString('en-IN')}`;
}

export default function PMSDetailClient({ iaid }) {
  const { data: session } = useSession();
  const [state, setState] = useState({ loading: true, error: false, result: null });
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeErr, setUpgradeErr] = useState('');
  const [faqOpen, setFaqOpen] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: false, result: null });
    fetch(`/api/pms-detail/${iaid}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        setState({ loading: false, error: false, result: json });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ loading: false, error: true, result: null });
      });
    return () => { cancelled = true; };
  }, [iaid]);

  async function handleUpgrade() {
    if (!session?.user) { signIn(); return; }
    setUpgradeLoading(true);
    setUpgradeErr('');
    try {
      await startCheckout({
        plan: 'annual',
        session,
        onSuccess() { window.location.reload(); },
        onDismiss() { setUpgradeLoading(false); },
      });
    } catch (e) {
      setUpgradeErr(e.message);
      setUpgradeLoading(false);
    }
  }

  if (state.loading) {
    return (
      <>
        <Navbar />
        <main className="pmsd-page">
          <div className="pmsd-loading">Loading strategy details…</div>
        </main>
        <Footer />
      </>
    );
  }

  if (state.error || !state.result?.data) {
    return (
      <>
        <Navbar />
        <main className="pmsd-page">
          <div className="pmsd-loading">Could not load this strategy right now. Please try again shortly.</div>
        </main>
        <Footer />
      </>
    );
  }

  const { data: d, performance, history, quartile, isPro } = state.result;
  const faq = buildPmsDetailFaq(d);
  const displayName = d.iaName || d.strategyName;

  return (
    <>
      <Navbar />
      <main className="pmsd-page">

        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <div className="pmsd-hero">
          <div className="pmsd-hero-row">
            <div className="pmsd-hero-logo">
              <ProviderAvatar name={d.providerName} logoPath={getPMSLogo(d.providerName)} size={48} radius={10} />
            </div>
            <div className="pmsd-hero-info">
              <h1 className="pmsd-name">{displayName}</h1>
              <div className="pmsd-hero-tags">
                <span className="pmsd-tag">{d.providerName}</span>
                <span className="pmsd-tag green">{d.strategyName}</span>
                {d.benchmark && <span className="pmsd-tag">vs {d.benchmark}</span>}
              </div>
            </div>
          </div>

          <div className="pmsd-hero-stats">
            {d.aumCr != null && (
              <div className="pmsd-stat-item">
                <div className="pmsd-stat-label">AUM</div>
                <div className="pmsd-stat-val">{fmtCr(d.aumCr)}</div>
              </div>
            )}
            {d.inceptionDate && (
              <div className="pmsd-stat-item">
                <div className="pmsd-stat-label">Inception</div>
                <div className="pmsd-stat-val">{d.inceptionDate}</div>
                {d.age && <div className="pmsd-stat-sub">{d.age}</div>}
              </div>
            )}
            {d.minInvestment != null && (
              <div className="pmsd-stat-item">
                <div className="pmsd-stat-label">Min Investment</div>
                <div className="pmsd-stat-val">{fmtInr(d.minInvestment)}</div>
              </div>
            )}
          </div>
        </div>

        {/* ── FEE & TERMS (always free) ───────────────────────────────── */}
        <div className="pmsd-section">
          <div className="pmsd-section-head">
            <span className="pmsd-section-title">Fee &amp; Terms</span>
          </div>
          <div className="pmsd-facts-grid">
            <div className="pmsd-fact-card">
              <div className="pmsd-fact-label">Fixed Fees</div>
              <div className="pmsd-fact-val">{d.fixedFees || '—'}</div>
            </div>
            <div className="pmsd-fact-card">
              <div className="pmsd-fact-label">Variable Fees</div>
              <div className="pmsd-fact-val">{d.variableFees || '—'}</div>
            </div>
            <div className="pmsd-fact-card">
              <div className="pmsd-fact-label">Exit Load</div>
              <div className="pmsd-fact-val">{d.exitLoad || '—'}</div>
            </div>
            <div className="pmsd-fact-card">
              <div className="pmsd-fact-label">Purpose</div>
              <div className="pmsd-fact-val">{d.purpose || '—'}</div>
            </div>
          </div>
        </div>

        {/* ── PORTFOLIO COMPOSITION (from factsheet extraction, always free) ── */}
        {d.factsheetData && (d.factsheetData.marketCapAllocation || d.factsheetData.sectorAllocation || d.factsheetData.topHoldings) && (() => {
          const fd = d.factsheetData;
          const mc = fd.marketCapAllocation;
          const mcSegments = mc
            ? [
                { label: 'Large Cap', value: mc.largeCap, className: 'lg' },
                { label: 'Mid Cap', value: mc.midCap, className: 'md' },
                { label: 'Small Cap', value: mc.smallCap, className: 'sm' },
                { label: 'Cash', value: mc.cash, className: 'cash' },
              ].filter((s) => s.value != null && s.value > 0)
            : [];

          const sortedSectors = fd.sectorAllocation ? [...fd.sectorAllocation].sort((a, b) => b.weightPct - a.weightPct) : [];
          const maxSectorWeight = sortedSectors.length ? sortedSectors[0].weightPct : 1;

          return (
            <div className="pmsd-section">
              <div className="pmsd-section-head">
                <span className="pmsd-section-title">Portfolio Composition</span>
                <span className="pmsd-section-sub">
                  From the {fd.strategyName} factsheet{fd.period ? ` · ${fd.period}` : ''}{fd.asOfDate ? ` · data as of ${fd.asOfDate}` : ''}
                </span>
              </div>

              {mcSegments.length > 0 && (
                <div className="pmsd-composition-block">
                  <div className="pmsd-composition-label">Market Cap Allocation</div>
                  <div className="pmsd-mcap-bar">
                    {mcSegments.map((s) => (
                      <div key={s.label} className={`pmsd-mcap-seg ${s.className}`} style={{ width: `${s.value}%` }} title={`${s.label}: ${s.value}%`} />
                    ))}
                  </div>
                  <div className="pmsd-mcap-legend">
                    {mcSegments.map((s) => (
                      <span key={s.label} className="pmsd-mcap-legend-item">
                        <span className={`pmsd-mcap-swatch ${s.className}`} />
                        {s.label} <b>{s.value}%</b>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {sortedSectors.length > 0 && (
                <div className="pmsd-composition-block">
                  <div className="pmsd-composition-label">Sector Allocation</div>
                  <div className="pmsd-sector-list">
                    {sortedSectors.map((s) => (
                      <div key={s.sector} className="pmsd-sector-row">
                        <span className="pmsd-sector-name">{s.sector}</span>
                        <div className="pmsd-sector-bar-wrap">
                          <div className="pmsd-sector-bar-fill" style={{ width: `${(s.weightPct / maxSectorWeight) * 100}%` }} />
                        </div>
                        <span className="pmsd-sector-val">{s.weightPct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {fd.topHoldings && fd.topHoldings.length > 0 && (
                <div className="pmsd-composition-block">
                  <div className="pmsd-composition-label">Top Holdings</div>
                  <div className="pmsd-holdings-grid">
                    {fd.topHoldings.map((h, i) => (
                      <div key={h.name} className="pmsd-holding-item">
                        <span className="pmsd-holding-rank">{i + 1}</span>
                        <span className="pmsd-holding-name">{h.name}</span>
                        {h.weightPct != null ? (
                          <span className="pmsd-holding-weight">{h.weightPct}%</span>
                        ) : h.capBucket ? (
                          <span className="pmsd-holding-bucket">{h.capBucket}</span>
                        ) : (
                          <span />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── FUNDAMENTALS VS BENCHMARK (from factsheet extraction, always free) ── */}
        {d.factsheetData?.portfolioAttributes && (() => {
          const pa = d.factsheetData.portfolioAttributes;
          const rows = [
            ['Revenue CAGR', pa.revenueCagr, '%'],
            ['EPS CAGR', pa.epsCagr, '%'],
            ['Portfolio PE', pa.portfolioPe, 'x'],
            ['ROE', pa.roe, '%'],
            ['Net Debt/Equity', pa.netDebtEquity, 'x'],
            ['PEG Ratio', pa.peg, 'x'],
            ['Sharpe Ratio', pa.sharpeRatio, ''],
            ['Std. Deviation', pa.standardDeviation, '%'],
          ].filter(([, v]) => v.strategy != null || v.benchmark != null);

          if (rows.length === 0) return null;

          return (
            <div className="pmsd-section">
              <div className="pmsd-section-head">
                <span className="pmsd-section-title">Fundamentals vs Benchmark</span>
                <span className="pmsd-section-sub">Strategy vs {d.benchmark || 'benchmark'}, from the factsheet</span>
              </div>
              <div className="pmsd-fund-table">
                <div className="pmsd-fund-row pmsd-fund-head">
                  <span>Metric</span>
                  <span>Strategy</span>
                  <span>Benchmark</span>
                </div>
                {rows.map(([label, v, unit]) => (
                  <div key={label} className="pmsd-fund-row">
                    <span className="pmsd-fund-label">{label}</span>
                    <span className="pmsd-fund-val">{v.strategy != null ? `${v.strategy}${unit}` : '—'}</span>
                    <span className="pmsd-fund-val muted">{v.benchmark != null ? `${v.benchmark}${unit}` : '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── WHAT CHANGED THIS MONTH (from factsheet extraction, always free) ── */}
        {d.factsheetData?.portfolioChanges &&
          (d.factsheetData.portfolioChanges.newEntrants.length > 0 || d.factsheetData.portfolioChanges.exits.length > 0) && (
            <div className="pmsd-section">
              <div className="pmsd-section-head">
                <span className="pmsd-section-title">What Changed This Month</span>
              </div>
              <div className="pmsd-changes-grid">
                {d.factsheetData.portfolioChanges.newEntrants.length > 0 && (
                  <div>
                    <div className="pmsd-composition-label">New Entrants</div>
                    <ul className="pmsd-changes-list">
                      {d.factsheetData.portfolioChanges.newEntrants.map((n) => (
                        <li key={n} className="pmsd-changes-item entrant">{n}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {d.factsheetData.portfolioChanges.exits.length > 0 && (
                  <div>
                    <div className="pmsd-composition-label">Exits</div>
                    <ul className="pmsd-changes-list">
                      {d.factsheetData.portfolioChanges.exits.map((n) => (
                        <li key={n} className="pmsd-changes-item exit">{n}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

        {/* ── FACTSHEETS & PRESENTATIONS (always free, curated providers only) ── */}
        {d.factsheets && d.factsheets.some((doc) => doc.url) && (() => {
          const byStrategy = new Map();
          for (const doc of d.factsheets) {
            // A doc with no url can't be a download link (e.g. a factsheet
            // we hold but the provider hasn't published online yet) -- its
            // portfolio data still renders above, just skip the link chip.
            if (!doc.url) continue;
            if (!byStrategy.has(doc.strategyName)) byStrategy.set(doc.strategyName, []);
            byStrategy.get(doc.strategyName).push(doc);
          }
          return (
            <div className="pmsd-section">
              <div className="pmsd-section-head">
                <span className="pmsd-section-title">Factsheets &amp; Presentations</span>
                <span className="pmsd-section-sub">Published directly by {d.providerName}</span>
              </div>
              <div className="pmsd-factsheet-groups">
                {[...byStrategy.entries()].map(([strategyName, docs]) => (
                  <div key={strategyName} className="pmsd-factsheet-group">
                    <div className="pmsd-factsheet-strategy">{strategyName}</div>
                    <div className="pmsd-factsheet-list">
                      {docs.map((doc, i) => (
                        <a key={i} href={doc.url} target="_blank" rel="noopener noreferrer" className="pmsd-factsheet-link">
                          <span className="pmsd-factsheet-icon">{doc.docType === 'presentation' ? '📊' : '📄'}</span>
                          <span className="pmsd-factsheet-label">{doc.docType === 'presentation' ? 'Presentation' : 'Factsheet'}</span>
                          {doc.period && <span className="pmsd-factsheet-period">{doc.period}</span>}
                          <span className="pmsd-factsheet-arrow">↗</span>
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── ⑤ CURRENT PERIOD-WISE PERFORMANCE (Pro) ─────────────────── */}
        {isPro && performance && (() => {
          const rows = [
            ['1M', performance.ia.month1, performance.benchmark?.month1],
            ['3M', performance.ia.month3, performance.benchmark?.month3],
            ['6M', performance.ia.month6, performance.benchmark?.month6],
            ['1Y', performance.ia.year1, performance.benchmark?.year1],
            ['2Y', performance.ia.year2, performance.benchmark?.year2],
            ['3Y', performance.ia.year3, performance.benchmark?.year3],
            ['5Y', performance.ia.year5, performance.benchmark?.year5],
            ['Since Inception', performance.ia.sinceInception, performance.benchmark?.sinceInception],
          ];
          // Shared scale across every bar in the table (fund + benchmark, every
          // period) so a 1M return isn't invisible next to a Since-Inception one.
          const maxAbs = Math.max(1, ...rows.flatMap(([, ia, bm]) => [ia, bm].filter((v) => v != null).map(Math.abs)));
          return (
            <div className="pmsd-section">
              <div className="pmsd-section-head">
                <span className="pmsd-section-title">Performance vs Benchmark</span>
                <span className="pmsd-section-sub">as of {performance.asOnMonth}</span>
              </div>
              <div className="pmsd-ret-legend">
                <span className="pmsd-ret-legend-item"><span className="pmsd-ret-swatch ia" />{displayName}</span>
                <span className="pmsd-ret-legend-item"><span className="pmsd-ret-swatch bm" />{d.benchmark || 'Benchmark'}</span>
              </div>
              <div className="pmsd-ret-bars">
                {rows.map(([label, iaVal, benchVal]) => {
                  const alpha = iaVal != null && benchVal != null ? iaVal - benchVal : null;
                  return (
                    <div key={label} className="pmsd-ret-row">
                      <span className="pmsd-ret-lbl">{label}</span>
                      <div className="pmsd-ret-bar-group">
                        <div className="pmsd-ret-bar-wrap">
                          <div
                            className={`pmsd-ret-bar-fill ia${iaVal < 0 ? ' neg' : ''}`}
                            style={{ width: `${Math.min(100, (Math.abs(iaVal ?? 0) / maxAbs) * 100)}%` }}
                          />
                        </div>
                        <div className="pmsd-ret-bar-wrap">
                          <div
                            className="pmsd-ret-bar-fill bm"
                            style={{ width: `${benchVal != null ? Math.min(100, (Math.abs(benchVal) / maxAbs) * 100) : 0}%` }}
                          />
                        </div>
                      </div>
                      <div className="pmsd-ret-figures">
                        <span className="pmsd-ret-val">{pctTxt(iaVal)}</span>
                        <span className="pmsd-ret-val bm">{benchVal != null ? pctTxt(benchVal) : '—'}</span>
                      </div>
                      {alpha != null ? (
                        <span className={`pmsd-ret-alpha${alpha >= 0 ? ' pos' : ' neg'}`}>
                          {alpha >= 0 ? '+' : ''}{alpha.toFixed(2)}pp
                        </span>
                      ) : <span />}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── ⑥ HISTORICAL GROWTH CHART (Pro) ──────────────────────────── */}
        {isPro && history && (() => {
          const chartSeries = buildGrowthSeries(history, displayName, '#1b5e20', d.benchmark || 'Benchmark', '#78909c');
          if (chartSeries.length < 1) return null;
          return (
            <div className="pmsd-section">
              <div className="pmsd-section-head">
                <span className="pmsd-section-title">Historical Growth</span>
                <span className="pmsd-section-sub">₹100 invested, since {history[0].asOnMonth}</span>
              </div>
              <CompareGrowthChart series={chartSeries} />
            </div>
          );
        })()}

        {/* ── ⑦ QUARTILE RANKING (Pro) ─────────────────────────────────── */}
        {isPro && quartile && quartile.length > 0 && (
          <div className="pmsd-section">
            <div className="pmsd-section-head">
              <span className="pmsd-section-title">Peer Quartile Ranking</span>
              <span className="pmsd-section-sub">APMI methodology, TWRR-based</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="pmsd-quartile-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Peers</th>
                    <th>TWRR</th>
                    <th>Benchmark</th>
                    <th>Quartile</th>
                  </tr>
                </thead>
                <tbody>
                  {quartile.map((row) => (
                    <tr key={row.period}>
                      <td>{row.label}</td>
                      <td>{row.peers ?? '—'}</td>
                      <td>{pctTxt(row.iaTwrr)}</td>
                      <td>{pctTxt(row.benchmark)}</td>
                      <td>{row.quartile ? <span className="pmsd-quartile-badge">{row.quartile}</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ⑧ TURNOVER + FUND MANAGER (Pro) ──────────────────────────── */}
        {isPro && (d.turnover1M != null || d.turnover1Y != null || d.fundManager) && (
          <div className="pmsd-section">
            <div className="pmsd-section-head">
              <span className="pmsd-section-title">Portfolio &amp; Manager</span>
            </div>
            <div className="pmsd-facts-grid">
              {d.turnover1M != null && (
                <div className="pmsd-fact-card">
                  <div className="pmsd-fact-label">1 Month Turnover</div>
                  <div className="pmsd-fact-val">{d.turnover1M}</div>
                </div>
              )}
              {d.turnover1Y != null && (
                <div className="pmsd-fact-card">
                  <div className="pmsd-fact-label">1 Year Turnover</div>
                  <div className="pmsd-fact-val">{d.turnover1Y}</div>
                </div>
              )}
              {d.fundManager?.name && (
                <div className="pmsd-fact-card">
                  <div className="pmsd-fact-label">Fund Manager</div>
                  <div className="pmsd-fact-val">
                    {d.fundManager.name}
                    {d.fundManager.workExp && d.fundManager.workExp !== 'NA' && (
                      <div style={{ fontWeight: 400, fontSize: '.72rem', marginTop: 4, color: 'var(--muted)' }}>
                        {d.fundManager.workExp}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ⑨ UPGRADE GATE (Non-Pro) ─────────────────────────────────── */}
        {!isPro && (
          <div className="pmsd-gate-panel">
            <div className="pmsd-gate-crown">👑 Abundance Pro Feature</div>
            <div className="pmsd-gate-title">Unlock Full Performance Analytics</div>
            <div className="pmsd-gate-subtitle">Get institutional-grade analysis for every PMS strategy in India.</div>
            <ul className="pmsd-gate-features">
              <li>Current returns vs benchmark across every period (1M to Since Inception)</li>
              <li>Historical growth chart, monthly, back to April 2023</li>
              <li>APMI's own peer-quartile ranking (1/2/3/5/7/10 year)</li>
              <li>Portfolio turnover ratio &amp; fund manager details</li>
            </ul>
            <div className="pmsd-gate-actions">
              {!session?.user && (
                <button className="pmsd-gate-btn secondary" onClick={() => signIn()}>Sign In</button>
              )}
              <button className="pmsd-gate-btn primary" onClick={handleUpgrade} disabled={upgradeLoading}>
                {upgradeLoading ? 'Opening checkout…' : 'Upgrade to Pro — ₹499/year →'}
              </button>
            </div>
            {upgradeErr && <div className="pmsd-gate-err">{upgradeErr}</div>}
            <div className="pmsd-gate-link">
              <a href="/pricing">View all Pro benefits &amp; features →</a>
            </div>
          </div>
        )}

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <div className="pmsd-section pmsd-faq">
          <div className="pmsd-section-head">
            <span className="pmsd-section-title">Frequently Asked Questions</span>
          </div>
          {faq.map((item, i) => (
            <div key={i} className="pmsd-faq-item">
              <button className="pmsd-faq-q" onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                {item.q}
                <span className="pmsd-faq-caret">{faqOpen === i ? '−' : '+'}</span>
              </button>
              {faqOpen === i && <div className="pmsd-faq-a">{item.a}</div>}
            </div>
          ))}
        </div>

        <div className="pmsd-disclosure">
          Data sourced from APMI India (Association of Portfolio Managers in India).
          Min PMS investment ₹50L per SEBI. Past performance is not indicative of future results.
          Atin Kumar Agrawal · APRN04279 · APMI Registered Portfolio Management Services Distributor · Abundance Financial Services.
        </div>
      </main>
      <Footer />
    </>
  );
}
