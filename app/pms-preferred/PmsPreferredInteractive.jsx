'use client';
// app/pms-preferred/PmsPreferredInteractive.jsx
//
// Client island holding every part of the free showcase that needs
// interactivity: the insights tiles, the spotlight card, the strategy grid,
// and a quick-info drawer that opens instead of navigating away on a plain
// tile click. Deliberately mirrors /pms-screener's own click-tile-to-open-
// drawer-then-"View Full Details"-button-for-the-real-page pattern -- the
// same convention users already learned there, applied consistently here.
//
// Every tile/link stays a real <a href="/pms/[iaid]">: only a plain,
// unmodified left click is intercepted (preventDefault + open the drawer).
// Ctrl/Cmd/Shift/Alt-click and middle-click fall through untouched, so
// "open in a new tab" still works exactly the way any other link on the
// web does -- we don't have to reimplement that ourselves.
import { useEffect } from 'react';
import { useState } from 'react';
import { getPMSLogo } from '@/lib/providerLogos';
import { fmtCr, fmtRatio, buildSectorDna } from './pmsPreferredFormat';

// Only intercept a plain left-click. Anything carrying new-tab/new-window
// intent (modifier keys, middle-click) is left alone so the browser's own
// native handling takes over, same as it would for any other <a>.
function isPlainLeftClick(e) {
  return e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
}

function SectorDnaBar({ segments, size = 'sm' }) {
  if (!segments) return null;
  return (
    <div className={`pmspref-dna-bar pmspref-dna-bar--${size}`}>
      {segments.map((seg, i) => (
        <span
          // Index, not seg.sector: several real factsheets (ICICI Prudential's)
          // already disclose a sector literally named "Other", which would
          // otherwise collide with this array's own synthetic "Other" remainder.
          key={i}
          className={`pmspref-dna-seg pmspref-dna-seg--${seg.swatch}`}
          style={{ width: `${seg.weightPct}%` }}
          title={`${seg.sector} ${seg.weightPct}%`}
        />
      ))}
    </div>
  );
}

function SpotlightCard({ strategy, metric, totalCount, onOpen }) {
  const e = strategy.extracted || {};
  const pa = e.portfolioAttributes || {};
  const sharpe = fmtRatio(pa.sharpeRatio?.strategy);
  const sharpeBench = fmtRatio(pa.sharpeRatio?.benchmark);
  const stdDev = fmtRatio(pa.standardDeviation?.strategy);
  const pe = fmtRatio(pa.portfolioPe?.strategy);
  const peBench = fmtRatio(pa.portfolioPe?.benchmark);
  const beta = fmtRatio(pa.beta?.strategy);
  const alphaPct = fmtRatio(pa.alpha?.strategy);
  const holdings = (e.topHoldings || []).filter((h) => h?.name).slice(0, 5);
  const dna = buildSectorDna(e.sectorAllocation);
  const logo = getPMSLogo(strategy.providerName);
  const tagLabel = metric === 'sharpe'
    ? `Best Sharpe Ratio of all ${totalCount} Preferred Strategies`
    : `Best 1-Year Alpha of all ${totalCount} Preferred Strategies`;

  return (
    <section className="pmspref-spotlight" aria-label="This month's spotlight strategy">
      <span className="pmspref-spotlight-tag">★ This Month&apos;s Spotlight · {tagLabel}</span>
      <div className="pmspref-spotlight-body">
        <div className="pmspref-spotlight-main">
          <div className="pmspref-spotlight-head">
            {logo
              ? <img src={logo} alt="" className="pmspref-spotlight-logo" />
              : <span className="pmspref-spotlight-logo pmspref-spotlight-logo-fallback">{strategy.providerName.charAt(0)}</span>}
            <span className="pmspref-spotlight-provider">{strategy.providerName}</span>
          </div>
          <a
            href={`/pms/${strategy.iaid}`}
            className="pmspref-spotlight-name"
            onClick={(ev) => { if (isPlainLeftClick(ev)) { ev.preventDefault(); onOpen(strategy); } }}
          >
            {strategy.strategyName}
          </a>
          {e.objective && <blockquote className="pmspref-spotlight-quote">&ldquo;{e.objective}&rdquo;</blockquote>}
          {holdings.length > 0 && (
            <>
              <div className="pmspref-spotlight-holdings-lbl">Disclosed Top Holdings</div>
              <div className="pmspref-spotlight-holdings">
                {holdings.map((h) => <span key={h.name} className="pmspref-holding-chip">{h.name}</span>)}
              </div>
            </>
          )}
        </div>
        <div className="pmspref-spotlight-stats">
          {metric === 'sharpe' && sharpe != null ? (
            <div className="pmspref-spotlight-hero-stat">
              <span className="pmspref-stat-lbl">Sharpe Ratio</span>
              <div className="pmspref-spotlight-hero-num">{sharpe}</div>
              <div className="pmspref-spotlight-hero-vs">
                {sharpeBench != null && <>vs benchmark <b>{sharpeBench}</b></>}
                {stdDev != null && <> · Std. Deviation <b>{stdDev}%</b></>}
              </div>
            </div>
          ) : alphaPct != null ? (
            <div className="pmspref-spotlight-hero-stat">
              <span className="pmspref-stat-lbl">1-Year Alpha</span>
              <div className="pmspref-spotlight-hero-num">+{alphaPct}pp</div>
            </div>
          ) : null}
          <div className="pmspref-mini-stats">
            <div><span className="pmspref-mini-lbl">AUM</span><div className="pmspref-mini-val">{strategy.aumCr != null ? fmtCr(strategy.aumCr) : '—'}</div></div>
            <div><span className="pmspref-mini-lbl">Top Quartile</span><div className="pmspref-mini-val">{strategy.qualifyingPeriod || '—'}</div></div>
            {pe != null && (
              <div>
                <span className="pmspref-mini-lbl">Portfolio P/E</span>
                <div className="pmspref-mini-val">{pe}{peBench != null && <span className="pmspref-mini-val-muted"> / {peBench}</span>}</div>
              </div>
            )}
            {beta != null && (
              <div><span className="pmspref-mini-lbl">Beta</span><div className="pmspref-mini-val">{beta}</div></div>
            )}
          </div>
          {dna && (
            <div className="pmspref-dna-block">
              <div className="pmspref-dna-lbl">Sector DNA</div>
              <SectorDnaBar segments={dna} size="lg" />
              <div className="pmspref-dna-legend">
                {dna.slice(0, 4).map((seg, i) => (
                  <span key={i} className="pmspref-dna-legend-item">
                    <span className={`pmspref-dna-swatch pmspref-dna-swatch--${seg.swatch}`} />
                    {seg.sector} {seg.weightPct}%
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// A single-strategy insight tile. Renders as a link/drawer-trigger to
// /pms/<iaid> when both the iaid and the full strategy record are known,
// otherwise as a plain card (no hrefless anchor).
function InsightTile({ iaid, label, value, sub, src, strategy, onOpen }) {
  const inner = (
    <>
      <div className="pmspref-insight-label">{label}</div>
      <div className="pmspref-insight-value">{value}</div>
      <div className="pmspref-insight-sub">
        {sub}
        {src && <span className="pmspref-insight-src"> · {src}</span>}
      </div>
      {iaid && <span className="pmspref-insight-arrow" aria-hidden="true">→</span>}
    </>
  );
  return iaid && strategy
    ? (
      <a
        className="pmspref-insight-card pmspref-insight-link"
        href={`/pms/${iaid}`}
        onClick={(ev) => { if (isPlainLeftClick(ev)) { ev.preventDefault(); onOpen(strategy); } }}
      >
        {inner}
      </a>
    )
    : <div className="pmspref-insight-card">{inner}</div>;
}

const METRIC_DEFS = [
  { key: 'sharpeRatio', label: 'Sharpe Ratio', unit: '' },
  { key: 'standardDeviation', label: 'Std. Deviation', unit: '%' },
  { key: 'portfolioPe', label: 'Portfolio P/E', unit: '' },
  { key: 'roe', label: 'ROE', unit: '%' },
  { key: 'revenueCagr', label: 'Revenue CAGR', unit: '%' },
  { key: 'epsCagr', label: 'EPS CAGR', unit: '%' },
  { key: 'netDebtEquity', label: 'Net Debt/Equity', unit: '' },
  { key: 'peg', label: 'PEG Ratio', unit: '' },
  { key: 'beta', label: 'Beta', unit: '' },
  { key: 'alpha', label: 'Alpha', unit: '%' },
  { key: 'correlation', label: 'Correlation', unit: '' },
  { key: 'trackingError', label: 'Tracking Error', unit: '%' },
  { key: 'arithmeticMeanReturn', label: 'Arithmetic Mean Return', unit: '%' },
  { key: 'upCaptureRatio', label: 'Up Capture', unit: '%' },
  { key: 'downCaptureRatio', label: 'Down Capture', unit: '%' },
];

const MKTCAP_SEGMENTS = [
  { key: 'largeCap', label: 'Large Cap', swatch: 0 },
  { key: 'midCap', label: 'Mid Cap', swatch: 1 },
  { key: 'smallCap', label: 'Small Cap', swatch: 2 },
  { key: 'cash', label: 'Cash', swatch: 'other' },
];

// The drawer's whole reason to exist: everything the card teases (Sharpe,
// AUM, top-2 holdings, top-5 sector DNA) PLUS everything the card doesn't
// have room for -- the full 15-field portfolioAttributes table, market-cap
// split, the complete holdings and sector lists, and portfolio changes.
// All of this already lives in `strategy.extracted`; nothing here is a new
// fetch, just more of what compute_preferred_pms.js already computed.
function PmsPreferredDrawer({ strategy, onClose }) {
  const open = !!strategy;
  const e = strategy?.extracted || {};
  const pa = e.portfolioAttributes || {};
  const mc = e.marketCapAllocation || {};
  const logo = strategy ? getPMSLogo(strategy.providerName) : null;
  const dna = strategy ? buildSectorDna(e.sectorAllocation) : null;
  const holdings = (e.topHoldings || []).filter((h) => h?.name);
  const sectorRows = Array.isArray(e.sectorAllocation)
    ? [...e.sectorAllocation].filter((s) => s?.sector && Number.isFinite(s.weightPct)).sort((a, b) => b.weightPct - a.weightPct)
    : [];
  const mktCapSegs = MKTCAP_SEGMENTS
    .map((seg) => ({ ...seg, weightPct: mc[seg.key] }))
    .filter((seg) => Number.isFinite(seg.weightPct) && seg.weightPct > 0);
  const metricRows = METRIC_DEFS
    .map((m) => ({ ...m, strategy: fmtRatio(pa[m.key]?.strategy), benchmark: fmtRatio(pa[m.key]?.benchmark) }))
    .filter((m) => m.strategy != null);
  const changes = e.portfolioChanges || {};
  const newEntrants = Array.isArray(changes.newEntrants) ? changes.newEntrants.filter(Boolean) : [];
  const exits = Array.isArray(changes.exits) ? changes.exits.filter(Boolean) : [];

  return (
    <>
      <div className={`pmspref-drawer-backdrop${open ? ' open' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`pmspref-drawer${open ? ' open' : ''}`} aria-label="Strategy quick info" aria-hidden={!open}>
        {strategy && (
          <>
            <button className="pmspref-drawer-close" onClick={onClose} aria-label="Close">×</button>
            <div className="pmspref-drawer-head">
              {strategy.quartile && <span className="pmspref-drawer-ribbon">{strategy.quartile}</span>}
              <div className="pmspref-drawer-provider">
                {logo
                  ? <img src={logo} alt="" className="pmspref-drawer-logo" />
                  : <span className="pmspref-drawer-logo pmspref-drawer-logo-fallback">{strategy.providerName.charAt(0)}</span>}
                <span>{strategy.providerName}</span>
              </div>
              <div className="pmspref-drawer-name">{strategy.strategyName}</div>
              {e.objective && <blockquote className="pmspref-drawer-quote">&ldquo;{e.objective}&rdquo;</blockquote>}
            </div>

            <div className="pmspref-drawer-body">
              <div className="pmspref-drawer-stats">
                <div><span className="pmspref-mini-lbl">AUM</span><div className="pmspref-mini-val">{strategy.aumCr != null ? fmtCr(strategy.aumCr) : '—'}</div></div>
                <div><span className="pmspref-mini-lbl">Top Quartile</span><div className="pmspref-mini-val">{strategy.qualifyingPeriod || '—'}</div></div>
              </div>

              {mktCapSegs.length > 0 && (
                <div className="pmspref-drawer-section">
                  <div className="pmspref-drawer-section-head">Market Cap Allocation</div>
                  <div className="pmspref-dna-bar pmspref-dna-bar--lg">
                    {mktCapSegs.map((seg) => (
                      <span
                        key={seg.key}
                        className={`pmspref-dna-seg pmspref-dna-seg--${seg.swatch}`}
                        style={{ width: `${seg.weightPct}%` }}
                        title={`${seg.label} ${seg.weightPct}%`}
                      />
                    ))}
                  </div>
                  <div className="pmspref-dna-legend">
                    {mktCapSegs.map((seg) => (
                      <span key={seg.key} className="pmspref-dna-legend-item">
                        <span className={`pmspref-dna-swatch pmspref-dna-swatch--${seg.swatch}`} />
                        {seg.label} {seg.weightPct}%
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {dna && (
                <div className="pmspref-drawer-section">
                  <div className="pmspref-drawer-section-head">Sector Allocation</div>
                  <SectorDnaBar segments={dna} size="lg" />
                  <div className="pmspref-drawer-sector-list">
                    {sectorRows.map((s) => (
                      <div key={s.sector} className="pmspref-drawer-sector-row">
                        <span>{s.sector}</span>
                        <span className="pmspref-drawer-sector-val">{s.weightPct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {holdings.length > 0 && (
                <div className="pmspref-drawer-section">
                  <div className="pmspref-drawer-section-head">Top Holdings ({holdings.length})</div>
                  <div className="pmspref-spotlight-holdings">
                    {holdings.map((h) => (
                      <span key={h.name} className="pmspref-holding-chip">
                        {h.name}{h.weightPct != null && <b> {h.weightPct}%</b>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {metricRows.length > 0 && (
                <div className="pmspref-drawer-section">
                  <div className="pmspref-drawer-section-head">Portfolio Attributes</div>
                  <div className="pmspref-drawer-metrics">
                    {metricRows.map((m) => (
                      <div key={m.key} className="pmspref-drawer-metric-row">
                        <span className="pmspref-drawer-metric-lbl">{m.label}</span>
                        <span className="pmspref-drawer-metric-val">
                          {m.strategy}{m.unit}
                          {m.benchmark != null && <span className="pmspref-mini-val-muted"> vs {m.benchmark}{m.unit}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(newEntrants.length > 0 || exits.length > 0) && (
                <div className="pmspref-drawer-section">
                  <div className="pmspref-drawer-section-head">Portfolio Changes This Month</div>
                  {newEntrants.length > 0 && (
                    <div className="pmspref-drawer-changes-row">
                      <span className="pmspref-drawer-changes-lbl pmspref-drawer-changes-lbl--in">+ Added</span>
                      <span>{newEntrants.join(', ')}</span>
                    </div>
                  )}
                  {exits.length > 0 && (
                    <div className="pmspref-drawer-changes-row">
                      <span className="pmspref-drawer-changes-lbl pmspref-drawer-changes-lbl--out">− Exited</span>
                      <span>{exits.join(', ')}</span>
                    </div>
                  )}
                </div>
              )}

              <a href={`/pms/${strategy.iaid}`} target="_blank" rel="noopener noreferrer" className="pmspref-drawer-cta">
                📄 View Fees, History &amp; Quartile Ranking →
              </a>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

export default function PmsPreferredInteractive({ strategies, insights, spotlight, asOn }) {
  const [selected, setSelected] = useState(null);

  // Escape closes the drawer, same as the close button/backdrop click --
  // matches the site's existing modal/drawer keyboard convention.
  useEffect(() => {
    if (!selected) return;
    function onKey(ev) { if (ev.key === 'Escape') setSelected(null); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const findStrategy = (iaid) => strategies.find((s) => s.iaid === iaid) || null;

  return (
    <>
      {insights && (
        <section className="pmspref-insights" aria-label="Cross-strategy insights">
          <h2 className="pmspref-h2">This Month&apos;s Insights</h2>
          <div className="pmspref-insights-grid">
            {insights.mostHeldStock && (
              <div className="pmspref-insight-card">
                <div className="pmspref-insight-label">Most-Held Stock</div>
                <div className="pmspref-insight-value">{insights.mostHeldStock.name}</div>
                <div className="pmspref-insight-sub">
                  Held by {insights.mostHeldStock.count} of {strategies.length} preferred strategies
                  <span className="pmspref-insight-src"> · from latest factsheets</span>
                </div>
              </div>
            )}
            {insights.topSector && (
              <div className="pmspref-insight-card">
                <div className="pmspref-insight-label">Top Aggregate Sector Conviction</div>
                <div className="pmspref-insight-value">{insights.topSector.sector}</div>
                <div className="pmspref-insight-sub">
                  {Math.round(insights.topSector.totalWeightPct / insights.topSector.strategies.length)}% average
                  weight across {insights.topSector.strategies.length} strategies
                  <span className="pmspref-insight-src"> · from latest factsheets</span>
                </div>
              </div>
            )}
            {insights.bestAlpha && (
              <InsightTile
                iaid={insights.bestAlpha.iaid}
                strategy={findStrategy(insights.bestAlpha.iaid)}
                onOpen={setSelected}
                label="Best 1-Year Alpha"
                value={`+${insights.bestAlpha.alphaPct}pp`}
                sub={`${insights.bestAlpha.strategyName} (${insights.bestAlpha.providerName})`}
                src={asOn ? `APMI, as on ${asOn}` : 'APMI'}
              />
            )}
            {/* Best Sharpe already gets the full Spotlight feature below when
                it's the metric behind that pick -- shown here only when the
                Spotlight is instead running on Best Alpha (no strategy has a
                disclosed Sharpe yet), so the two sections never repeat the
                same strategy. */}
            {insights.bestSharpe && spotlight?.metric !== 'sharpe' && (
              <InsightTile
                iaid={insights.bestSharpe.iaid}
                strategy={findStrategy(insights.bestSharpe.iaid)}
                onOpen={setSelected}
                label="Best Sharpe Ratio"
                value={fmtRatio(insights.bestSharpe.sharpeRatio)}
                sub={`${insights.bestSharpe.strategyName} (${insights.bestSharpe.providerName})`}
                src="from latest factsheet"
              />
            )}
          </div>
        </section>
      )}

      {spotlight && (
        <SpotlightCard strategy={spotlight.strategy} metric={spotlight.metric} totalCount={strategies.length} onOpen={setSelected} />
      )}

      <section className="pmspref-grid-section" aria-label="Preferred strategies">
        <h2 className="pmspref-h2">{strategies.length} Preferred Strategies</h2>
        <p className="pmspref-h2-sub">Every card&apos;s Sharpe ratio and sector bar come straight from that strategy&apos;s latest factsheet — no two look alike because no two portfolios are alike. Tap a card for the full picture.</p>
        <div className="pmspref-grid">
          {strategies.map((s) => {
            const logo = getPMSLogo(s.providerName);
            const e = s.extracted || {};
            const sharpe = fmtRatio(e.portfolioAttributes?.sharpeRatio?.strategy);
            const holdings = (e.topHoldings || []).filter((h) => h?.name);
            const dna = buildSectorDna(e.sectorAllocation);
            return (
              <a
                key={s.iaid}
                href={`/pms/${s.iaid}`}
                className="pmspref-card"
                onClick={(ev) => { if (isPlainLeftClick(ev)) { ev.preventDefault(); setSelected(s); } }}
              >
                {s.quartile && <span className="pmspref-card-ribbon">{s.quartile}</span>}
                <div className="pmspref-card-head">
                  {logo
                    ? <img src={logo} alt="" className="pmspref-card-logo" />
                    : <span className="pmspref-card-logo pmspref-card-logo-fallback">{s.providerName.charAt(0)}</span>}
                  <span className="pmspref-card-provider">{s.providerName}</span>
                </div>
                <div className="pmspref-card-name">{s.strategyName}</div>
                {e.objective
                  ? <div className="pmspref-card-obj">&ldquo;{e.objective}&rdquo;</div>
                  : <div className="pmspref-card-obj-spacer" aria-hidden="true" />}
                <div className="pmspref-card-stats">
                  {sharpe != null && (
                    <div>
                      <span className="pmspref-card-stat-lbl">Sharpe</span>
                      <span className="pmspref-card-stat-val pmspref-card-stat-val--hero">{sharpe}</span>
                    </div>
                  )}
                  <div>
                    <span className="pmspref-card-stat-lbl">AUM</span>
                    <span className="pmspref-card-stat-val">{s.aumCr != null ? fmtCr(s.aumCr) : '—'}</span>
                  </div>
                </div>
                {holdings.length > 0 ? (
                  <div className="pmspref-card-holdings">
                    {holdings.slice(0, 2).map((h) => (
                      <span key={h.name} className="pmspref-holding-chip pmspref-holding-chip--sm">{h.name}</span>
                    ))}
                    {holdings.length > 2 && (
                      <span className="pmspref-holding-chip pmspref-holding-chip--sm">+{holdings.length - 2} more</span>
                    )}
                  </div>
                ) : (
                  <div className="pmspref-card-holdings-none">Holdings not disclosed this month</div>
                )}
                {dna ? (
                  <div className="pmspref-card-dna-wrap">
                    <div className="pmspref-card-dna-top">
                      <span className="pmspref-card-dna-lbl">Top Sector</span>
                      <span className="pmspref-card-dna-sector">{dna[0].sector} {dna[0].weightPct}%</span>
                    </div>
                    <SectorDnaBar segments={dna} size="sm" />
                  </div>
                ) : (
                  <div className="pmspref-card-dna-wrap pmspref-card-dna-wrap--empty" aria-hidden="true" />
                )}
              </a>
            );
          })}
        </div>
      </section>

      <PmsPreferredDrawer strategy={selected} onClose={() => setSelected(null)} />
    </>
  );
}
