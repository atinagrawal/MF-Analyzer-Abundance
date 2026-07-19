'use client';
/**
 * app/pms-screener/PMSCompare.jsx
 *
 * Change from original:
 *  PMSCompareModal now accepts a `dataLabel` prop (e.g. "March 2026")
 *  instead of hardcoding "Feb 2026" in the modal subtitle.
 *  Passed from page.jsx: <PMSCompareModal dataLabel={pmsDate.label} ... />
 */
import { useMemo, useState, useEffect } from 'react';
import ProviderAvatar from '@/components/ProviderAvatar';
import { getPMSLogo } from '@/lib/providerLogos';
import './pms-compare.css';

const MAX_COMPARE = 3;
const INVESTMENT = 5000000; // ₹50L

/** Normalizes an index/benchmark name for matching ("Nifty 500 TRI" ~ "Nifty 500"). */
function normalizeIndexName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\btri\b/g, '')
    .replace(/\btotal return index\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Finds a benchmark's real return data in the NSE index-dashboard list, if present. */
function findBenchmarkReturns(benchmarkName, indices) {
  if (!benchmarkName || !indices) return null;
  const target = normalizeIndexName(benchmarkName);
  const match = indices.find(idx => normalizeIndexName(idx.name) === target);
  return match ? match.returns : null;
}

function fmtRet(v) {
  if (v === null || v === undefined) return '—';
  return (v > 0 ? '+' : '') + v + '%';
}
function fmtAum(v) {
  if (v === null || v === undefined) return '—';
  if (v >= 10000) return '₹' + (v / 1000).toFixed(1) + 'K Cr';
  return '₹' + v.toLocaleString('en-IN') + ' Cr';
}
function fmtWealth(ret1Y) {
  if (ret1Y === null || ret1Y === undefined) return { value: '—', gain: '—', isPos: true };
  const val = INVESTMENT * (1 + ret1Y / 100);
  const gain = val - INVESTMENT;
  return {
    value: '₹' + Math.round(val).toLocaleString('en-IN'),
    gain: (gain >= 0 ? '+' : '') + '₹' + Math.abs(Math.round(gain)).toLocaleString('en-IN'),
    isPos: gain >= 0,
  };
}
function initials(name) {
  return (name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function rc(v) {
  if (v === null || v === undefined) return 'neu';
  return v > 0 ? 'pos' : v < 0 ? 'neg' : 'neu';
}

const PERIODS = [
  { label: '1 Month', key: 'ret1M' },
  { label: '3 Months', key: 'ret3M' },
  { label: '6 Months', key: 'ret6M' },
  { label: '1 Year', key: 'ret1Y' },
  { label: '2 Years', key: 'ret2Y' },
  { label: '3 Years', key: 'ret3Y' },
  { label: '5 Years', key: 'ret5Y' },
  { label: 'Inception', key: 'retInception' },
];

// How much each period counts toward the "Overall Leader" verdict — longer,
// more established horizons carry more weight since they say more about
// sustained skill than short-term noise. Inception sits below 5Y despite
// being "full history" because it isn't a fixed, comparable length across
// funds of different ages (a 1-year-old fund's inception return isn't
// measuring the same thing as a 10-year-old fund's).
const PERIOD_WEIGHTS = {
  ret1M: 0.5, ret3M: 0.75, ret6M: 1, ret1Y: 1.5,
  ret2Y: 2, ret3Y: 2.5, ret5Y: 3, retInception: 2,
};

// ── Compare Bar ───────────────────────────────────────────────────────────
export function PMSCompareBar({ selected, onRemove, onClear, onCompare }) {
  const vis = selected.length > 0;
  return (
    <div className={`cmp-bar${vis ? ' visible' : ''}`} role="region" aria-label="PMS Compare basket">
      <div className="cmp-bar-chips">
        {selected.map(f => (
          <span key={f.id} className="cmp-chip">
            {f.strategyName.length > 20 ? f.strategyName.slice(0, 20) + '…' : f.strategyName}
            <span className="cmp-chip-x" role="button" onClick={() => onRemove(f.id)} aria-label={`Remove ${f.strategyName} from compare`}>×</span>
          </span>
        ))}
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

// ── Compare Modal ─────────────────────────────────────────────────────────
/**
 * @param {Object}   props
 * @param {Array}    props.funds      - Up to 3 strategy objects
 * @param {string}   props.dataLabel  - e.g. "March 2026" — passed from page.jsx
 * @param {Function} props.onClose
 * @param {Function} props.onRemove
 */
export function PMSCompareModal({ funds, dataLabel, onClose, onRemove }) {
  const n = funds.length;

  // ── Real per-fund benchmarks ─────────────────────────────────────────
  // Each fund's declared benchmark (e.g. "BSE 500 TRI") lives only on its
  // own APMI detail page, not the bulk table — fetch one per fund (same
  // cached endpoint the drawer uses). Separately fetch the full NSE index
  // list once, to look up a real return figure for whichever benchmarks
  // happen to match an NSE index. For benchmarks that don't match any NSE
  // index (commonly because they track a BSE index instead — APMI doesn't
  // restrict PMS managers to one exchange's benchmarks), fall back to
  // /api/bse-index, which does the equivalent lookup against BSE's own
  // index data. Only if NEITHER source has the benchmark is alpha left
  // blank — we never substitute a different index just to show a number.
  const [benchNames, setBenchNames] = useState({});
  const [benchLoading, setBenchLoading] = useState(true);
  const [indexData, setIndexData] = useState(null);
  const [nseLoading, setNseLoading] = useState(true);
  const [bseReturns, setBseReturns] = useState({});

  useEffect(() => {
    let cancelled = false;
    setBenchLoading(true);
    Promise.all(funds.map(f => {
      let iaid = null;
      try { iaid = f.apmiLink ? new URL(f.apmiLink).searchParams.get('IAID') : null; } catch { /* ignore */ }
      if (!iaid) return Promise.resolve({ id: f.id, name: null });
      return fetch(`/api/pms-benchmark?iaid=${encodeURIComponent(iaid)}`)
        .then(r => r.json())
        .then(j => ({ id: f.id, name: j.status === 'success' ? j.benchmark : null }))
        .catch(() => ({ id: f.id, name: null }));
    })).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach(r => { map[r.id] = r.name; });
      setBenchNames(map);
      setBenchLoading(false);
    });
    return () => { cancelled = true; };
  }, [funds]);

  useEffect(() => {
    fetch('/api/index-dashboard')
      .then(r => r.json())
      .then(j => setIndexData(j?.indices || null))
      .catch(() => setIndexData(null))
      .finally(() => setNseLoading(false));
  }, []);

  // BSE fallback — only for funds whose benchmark has no NSE match, and
  // only once both benchmark names and the NSE fetch attempt have finished.
  // Gating on `nseLoading` rather than `!indexData` matters: niftyindices.com's
  // PDF source is flaky (see lib/bseIndex.js's header comment) and a failed
  // NSE fetch also sets indexData to null — that must NOT be treated the same
  // as "still loading", or a down NSE source silently kills the BSE fallback
  // for every strategy, even though BSE lookups don't depend on NSE at all.
  useEffect(() => {
    if (benchLoading || nseLoading) return;
    const needsBse = funds.filter(f => {
      const name = benchNames[f.id];
      return name && !findBenchmarkReturns(name, indexData);
    });
    if (!needsBse.length) return;
    let cancelled = false;
    Promise.all(needsBse.map(f =>
      fetch(`/api/bse-index?name=${encodeURIComponent(benchNames[f.id])}`)
        .then(r => r.json())
        .then(j => ({ id: f.id, returns: j.status === 'success' && j.matched ? j.returns : null }))
        .catch(() => ({ id: f.id, returns: null }))
    )).then(results => {
      if (cancelled) return;
      setBseReturns(prev => {
        const next = { ...prev };
        results.forEach(r => { next[r.id] = r.returns; });
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- benchNames/funds identity changes every render; gate on benchLoading/nseLoading instead
  }, [benchLoading, nseLoading]);

  // Per-period "best cell" index, for highlighting the table — kept as a
  // simple raw max, separate from the weighted verdict score below. `aum`
  // is included here purely to highlight the biggest AUM cell in its own
  // row; it does NOT feed the verdict (size isn't a performance metric).
  const winners = useMemo(() => {
    const w = {};
    PERIODS.forEach(({ key }) => {
      const vals = funds.map(f => f[key] ?? -Infinity);
      const maxV = Math.max(...vals);
      w[key] = vals.map((v, i) => v === maxV && v !== -Infinity ? i : -1);
    });
    const aumVals = funds.map(f => f.aum ?? 0);
    const maxAum = Math.max(...aumVals);
    w['aum'] = aumVals.map((v, i) => v === maxAum ? i : -1);
    return w;
  }, [funds]);

  // Raw "Best in N periods" count for the per-card badge — real return
  // periods only (no AUM, no duplicate ret1Y-as-"wealth" slot).
  const winCount = useMemo(() => {
    const counts = Array(n).fill(0);
    PERIODS.forEach(({ key }) => {
      winners[key].forEach((wi, i) => { if (wi === i) counts[i]++; });
    });
    return counts;
  }, [winners, n]);

  // Weighted, margin-aware score that actually decides the "Overall Leader"
  // verdict. For each period: rank only the funds that have data for it
  // (skip the period entirely if fewer than 2 funds have data — nothing
  // to compare), give the top rank the period's full weight and lower
  // ranks a proportional share, then average each fund's total by the sum
  // of weights it was actually scored on. That average-not-sum step matters:
  // a younger fund with no 5Y/Inception figures is judged on the periods it
  // does have, instead of being penalized simply for not existing that long.
  const scores = useMemo(() => {
    const totals = Array(n).fill(0);
    const weightSums = Array(n).fill(0);
    PERIODS.forEach(({ key }) => {
      const weight = PERIOD_WEIGHTS[key];
      const participants = funds
        .map((f, i) => ({ i, v: f[key] }))
        .filter(p => p.v !== null && p.v !== undefined);
      if (participants.length < 2) return;
      const ranked = [...participants].sort((a, b) => b.v - a.v);
      const m = ranked.length;
      ranked.forEach((p, rankIdx) => {
        const share = (m - rankIdx) / m; // 1st place = full weight, last place = weight/m
        totals[p.i] += weight * share;
        weightSums[p.i] += weight;
      });
    });
    return totals.map((t, i) => (weightSums[i] > 0 ? t / weightSums[i] : 0));
  }, [funds, n]);

  const overallWinner = useMemo(() => {
    const maxScore = Math.max(...scores);
    const idx = scores.indexOf(maxScore);
    return { idx, score: maxScore, fund: funds[idx] };
  }, [scores, funds]);

  if (!funds.length) return null;

  return (
    <>
      <div className="cmp-overlay open" onClick={onClose} />
      <div className="cmp-modal open" role="dialog" aria-modal="true" aria-label="PMS Strategy Comparison">
        <div className="cmp-modal-inner" style={{ '--cols': n }}>

          {/* Header */}
          <div className="cmp-modal-header">
            <div>
              <div className="cmp-modal-title">⚖ Strategy Comparison</div>
              {/* dataLabel prop replaces hardcoded "Feb 2026" */}
              <div className="cmp-modal-sub">
                APMI India · {dataLabel} · TWRR · Net of fees · APRN04279
              </div>
            </div>
            <button className="cmp-modal-close" onClick={onClose} aria-label="Close comparison">×</button>
          </div>

          {/* Grid */}
          <div className="cmp-grid" style={{ '--cols': n }}>

            {/* Strategy header row */}
            <div className="cmp-cell cmp-strat-header">
              <div style={{ fontWeight: 700, fontSize: '.72rem', color: 'var(--muted)', paddingTop: 6 }}>STRATEGY</div>
            </div>
            {funds.map((f, i) => (
              <div key={f.id} className="cmp-cell cmp-strat-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: 6 }}>
                  <ProviderAvatar
                    name={f.portfolioManager}
                    logoPath={getPMSLogo(f.portfolioManager)}
                    size={34}
                    radius={8}
                  />
                  <div>
                    <div className="cmp-strat-name">{f.strategyName}</div>
                    <div className="cmp-strat-mgr">{f.portfolioManager}</div>
                  </div>
                </div>
                <div className="cmp-strat-aum">{fmtAum(f.aum)}</div>
                {winCount[i] > 0 && (
                  <span className="cmp-win-badge">🏆 Best in {winCount[i]} period{winCount[i] > 1 ? 's' : ''}</span>
                )}
                <button className="cmp-remove-btn" onClick={() => onRemove(f.id)}>✕ Remove</button>
              </div>
            ))}

            {/* Returns */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              📊 Returns Across All Time Horizons
            </div>
            {PERIODS.map(({ label, key }) => {
              const vals = funds.map(f => f[key]);
              const allNull = vals.every(v => v === null || v === undefined);
              if (allNull) return null;
              return (
                <div key={key} className="cmp-row">
                  <div className="cmp-cell" style={{ fontWeight: 700 }}>{label}</div>
                  {funds.map((f, i) => {
                    const v = f[key];
                    const isBest = winners[key]?.[i] === i;
                    return (
                      <div key={f.id} className={`cmp-cell${isBest ? ' cmp-ret-best' : ''}`}>
                        <span className={`cmp-ret ${rc(v)}`}>{fmtRet(v)}</span>
                        {isBest && n > 1 && <span style={{ fontSize: '.55rem', marginLeft: 4, color: 'var(--g3)' }}>↑ best</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Alpha vs each fund's OWN declared benchmark (real data, not a
                single generic Nifty 50 guess) — see the useEffects above */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              📈 Alpha vs Own Benchmark
            </div>
            <div className="cmp-row">
              <div className="cmp-cell" style={{ fontWeight: 700 }}>Benchmark</div>
              {funds.map(f => (
                <div key={f.id} className="cmp-cell">
                  <span className="cmp-ret neu" style={{ fontWeight: 600 }}>
                    {benchLoading ? 'Loading…' : (benchNames[f.id] || '—')}
                  </span>
                </div>
              ))}
            </div>
            <div className="cmp-row">
              <div className="cmp-cell" style={{ fontWeight: 700 }}>1Y Alpha</div>
              {(() => {
                // Compute all alphas first so "best" only considers funds that
                // actually have a real matched benchmark return. Try NSE first,
                // fall back to BSE — never substitute a different index.
                const alphas = funds.map(f => {
                  const benchReturns = findBenchmarkReturns(benchNames[f.id], indexData) || bseReturns[f.id];
                  if (f.ret1Y == null || !benchReturns || benchReturns.r1y == null) return null;
                  return +(f.ret1Y - benchReturns.r1y).toFixed(2);
                });
                const validAlphas = alphas.filter(a => a !== null);
                const maxAlpha = validAlphas.length ? Math.max(...validAlphas) : null;
                return funds.map((f, i) => {
                  const alpha = alphas[i];
                  const isBest = n > 1 && alpha !== null && alpha === maxAlpha;
                  return (
                    <div key={f.id} className={`cmp-cell${isBest ? ' cmp-ret-best' : ''}`}>
                      {alpha !== null
                        ? <span className={`cmp-ret ${alpha > 0 ? 'pos' : alpha < 0 ? 'neg' : 'neu'}`}>{alpha > 0 ? '+' : ''}{alpha}%</span>
                        : <span className="cmp-ret neu" title="No matching NSE or BSE index found for this benchmark">—</span>}
                      {isBest && <span style={{ fontSize: '.55rem', marginLeft: 4, color: 'var(--g3)' }}>↑ best</span>}
                    </div>
                  );
                });
              })()}
            </div>

            {/* Wealth simulation */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              💰 Wealth Creation Simulation · ₹50 Lakh Invested 1 Year Ago
            </div>
            <div className="cmp-row">
              <div className="cmp-cell" style={{ fontWeight: 700 }}>Value Today</div>
              {funds.map((f, i) => {
                const w = fmtWealth(f.ret1Y);
                const isBest = winners['ret1Y']?.[i] === i; // wealth is just ret1Y framed in rupees
                return (
                  <div key={f.id} className={`cmp-cell${isBest ? ' cmp-ret-best' : ''}`}>
                    <div className="cmp-wealth-num" style={{ color: w.isPos ? 'var(--g2)' : 'var(--neg)' }}>{w.value}</div>
                    <div className="cmp-wealth-gain" style={{ color: w.isPos ? 'var(--g3)' : 'var(--neg)' }}>{w.gain}</div>
                    {isBest && n > 1 && <div style={{ fontSize: '.55rem', color: 'var(--g3)', marginTop: 2 }}>↑ best outcome</div>}
                  </div>
                );
              })}
            </div>

            {/* AUM */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              🏦 Assets Under Management
            </div>
            <div className="cmp-row">
              <div className="cmp-cell" style={{ fontWeight: 700 }}>AUM</div>
              {funds.map((f, i) => {
                const isBest = winners['aum']?.[i] === i;
                return (
                  <div key={f.id} className={`cmp-cell${isBest ? ' cmp-ret-best' : ''}`}>
                    <span className="cmp-ret pos">{fmtAum(f.aum)}</span>
                  </div>
                );
              })}
            </div>

          </div>{/* /cmp-grid */}

          {/* Verdict banner */}
          {n > 1 && overallWinner.fund && (
            <div className="cmp-verdict">
              <div className="cmp-verdict-icon">🏆</div>
              <div>
                <div className="cmp-verdict-title">Overall Leader: {overallWinner.fund.strategyName}</div>
                <div className="cmp-verdict-body">
                  <strong>{overallWinner.fund.strategyName}</strong> by{' '}
                  <strong>{overallWinner.fund.portfolioManager}</strong> ranks highest across time horizons —
                  winning {winCount[overallWinner.idx]} of {PERIODS.length} return periods outright, weighted
                  toward long-term consistency (3Y/5Y count most, 1M/3M count least; AUM isn't a factor) —
                  including a {fmtWealth(overallWinner.fund.ret1Y).gain} gain on a ₹50L basis over 1 year.{' '}
                  {overallWinner.fund.apmiLink && (
                    <a href={overallWinner.fund.apmiLink.startsWith('http') ? overallWinner.fund.apmiLink : `https://www.apmiindia.org${overallWinner.fund.apmiLink}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--g2)', fontWeight: 700, textDecoration: 'none' }}>
                      View on APMI ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="cmp-disclaimer">
            <strong>Important Disclosure:</strong> This comparison is for informational and educational purposes only and does not constitute investment advice.
            Data sourced from APMI India — Discretionary strategies — {dataLabel} — TWRR methodology, net of all fees.
            Past performance is not indicative of future returns. Minimum PMS investment is ₹50 Lakhs as per SEBI regulations.
            Abundance Financial Services. Atin Kumar Agrawal · ARN-251838 · APRN04279 · APMI Registered Portfolio Manager Distributor.
          </div>
        </div>
      </div>
    </>
  );
}
