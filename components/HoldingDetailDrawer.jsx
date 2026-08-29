'use client';

/**
 * components/HoldingDetailDrawer.jsx
 *
 * The same slide-in fund/SIF detail drawer that already exists on the
 * Screener (app/screener/ScreenerClient.jsx's Detail/SifDetail), made
 * portable to any page that only knows a scheme code — not a full,
 * already-loaded screener row. Used by /cas-tracker and /portfolio so
 * clicking a holding shows the same rich detail (chart, KPIs, stress test,
 * portfolio holdings, key operational facts) without leaving the page.
 *
 * Deliberately self-contained rather than sharing ScreenerClient.jsx's own
 * <style> block: that block is one giant template string covering the
 * whole screener page (table, FAQ, pager, ...), not just the drawer, and
 * importing it elsewhere would inject a lot of unrelated CSS. This file
 * duplicates only the classes the drawer, HoldingsSection, and the small
 * helper functions actually need — verified byte-for-byte against the
 * screener source. Screener itself is untouched.
 */

import { useState, useEffect } from 'react';
import ProviderAvatar from '@/components/ProviderAvatar';
import { getMFLogo } from '@/lib/providerLogos';
import { normalizeSchemeName } from '@/lib/normalizeSchemeName';
import { shortCat } from '@/app/screener/screenerContent';
import CompareGrowthChart from '@/app/screener/CompareGrowthChart';
import HoldingsSection from '@/app/screener/HoldingsSection';
import '@/app/screener/mf-compare.css';

// ---------- shared small helpers (copied from ScreenerClient.jsx) ----------
const SIF_STRATEGY_LABELS = {
  'Equity Oriented Investment Strategies - Equity Ex-Top 100 Long-Short Fund': 'Equity Ex-Top 100 L/S',
  'Equity Oriented Investment Strategies - Equity Long-Short Fund': 'Equity Long-Short',
  'Hybrid Investment Strategies - Active Asset Allocator Long-Short Fund': 'Active Asset Allocator',
  'Hybrid Investment Strategies - Hybrid Long-Short Fund': 'Hybrid Long-Short',
};
const sifStratShort = (cat) => SIF_STRATEGY_LABELS[cat] || cat?.split(' - ')[1] || cat || '—';

function formatMonth(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function getLiquidityColor(days) {
  if (days <= 5) return '#2e7d32';
  if (days <= 10) return '#4caf50';
  if (days <= 15) return '#ff9800';
  return '#d32f2f';
}
const cls = (v) => (v == null ? 'scr-muted' : v >= 0 ? 'scr-pos' : 'scr-neg');

function backtestLink(f) {
  try {
    const state = { v: 1, h: [{ k: 'mf', i: f.code, n: f.name, c: f.category, m: 'sip', mo: 10000, l: 100000, sm: 'default', cs: '' }], sd: 1, smo: 'lookback', lb: '10', sdt: '', su: 0, st: 1, bo: 0, b: null };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(state)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `/backtest?p=${b64}`;
  } catch (e) { return '/backtest'; }
}
function backtestSifLink(s) {
  try {
    const state = { v: 1, h: [{ k: 'sif', i: s.scheme_id, n: s.nav_name, c: sifStratShort(s.category), m: 'sip', mo: 10000, l: 100000, sm: 'default', cs: '' }], sd: 1, smo: 'lookback', lb: '3', sdt: '', su: 0, st: 0, bo: 0, b: null };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(state)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `/backtest?p=${b64}`;
  } catch (e) { return '/backtest'; }
}

// Slim, server-fetched projection of data/isin-scheme-master.json — fetched
// once and cached across every drawer mount on this page (own copy of
// ScreenerClient.jsx's identical cache, kept separate since the two never
// share a page load).
let schemeMasterFactsPromise = null;
function getSchemeMasterFacts() {
  if (!schemeMasterFactsPromise) {
    schemeMasterFactsPromise = fetch('/api/scheme-master-facts')
      .then(r => r.ok ? r.json() : { byIsin: {}, byAmfiCode: {}, byNormName: {} })
      .catch(() => ({ byIsin: {}, byAmfiCode: {}, byNormName: {} }));
  }
  return schemeMasterFactsPromise;
}

// Pure rendering -- takes fully-resolved data as props, no fetching of its
// own. Used by FundDetailDrawer below (which fetches by code, for CAS
// Tracker/Portfolio) AND by app/screener/ScreenerClient.jsx's Detail
// (which already has f/stress from its own bulk row data, and only
// fetches holdings/nav/schemeFacts itself) -- previously each of those
// two callers inlined its own copy of this exact JSX; this is the single
// shared version. See docs/superpowers/specs/
// 2026-08-19-aum-surfaces-and-drawer-consolidation-design.md.
export function FundDetailPanel({ f, stress, holdings, holdingsLoading = false, nav, schemeFacts, onClose }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="scr-drawer-h">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <ProviderAvatar name={f.amc} logoPath={getMFLogo(f.amc)} size={36} radius={8} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="scr-drawer-name">{f.name}</div>
            <div className="scr-drawer-tags"><span className="scr-tag">{f.amc}</span><span className="scr-tag alt">{shortCat(f.category)}</span><span className="scr-tag alt">{f.structure}</span></div>
          </div>
        </div>
        <button className="scr-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      {f.siblingResolved && (
        <div className="scr-warn" style={{ backgroundColor: 'var(--g-xlight)', border: '1px solid var(--g-light)', color: 'var(--g1)' }}>
          ℹ️ You hold a different plan/option of this fund (e.g. Direct Plan) — the facts and returns below are for its <b>Regular Growth Plan</b> variant. Your own returns are typically a little higher, since Direct plans carry a lower expense ratio. The chart below still reflects your actual holding's own NAV history.
        </div>
      )}
      {f.flag === 'check' && <div className="scr-warn">⚠ One or more returns look unusual for this fund — we're reviewing the source NAV. Treat with caution.</div>}
      {stress && stress.days_50pct > 20 && (
        <div className="scr-warn" style={{ backgroundColor: 'rgba(211, 47, 47, 0.08)', border: '1px solid rgba(211, 47, 47, 0.2)', color: '#d32f2f' }}>
          ⚠️ <b>Liquidity Alert:</b> This fund takes <b>{stress.days_50pct} days</b> to liquidate 50% of its portfolio under stress. High redemption volume could significantly impact portfolio values.
        </div>
      )}

      {!nav ? (
        <div className="scr-spark-load">Loading NAV history…</div>
      ) : nav.length < 2 ? null : (
        <CompareGrowthChart series={[{ name: f.name, color: nav[nav.length - 1].v >= nav[0].v ? '#2e7d32' : '#b71c1c', data: nav }]} showLegend={false} />
      )}

      <div className="scr-drawer-kpis">
        {[['1Y', f.ret_1y, '%'], ['3Y', f.ret_3y, '%'], ['5Y', f.ret_5y, '%'], ['Since inception', f.ret_inception, '%'], ['Volatility', f.vol, '%'], ['Max drawdown', f.max_dd, '%'], ['Return / risk', f.ret_per_risk, '']].map(([l, v, u]) => (
          <div className="scr-dk" key={l}><span>{l}</span><b className={u === '%' && l.includes('draw') ? 'scr-neg' : cls(typeof v === 'number' ? v : null)}>{v == null ? '—' : (u === '%' ? (v > 0 && !l.includes('draw') && !l.includes('Vol') ? '+' : '') + v.toFixed(1) + '%' : v.toFixed(2))}</b></div>
        ))}
      </div>

      {stress && (
        <div className="scr-stress-section">
          <div className="scr-stress-title">💧 Liquidity &amp; Stress Test Analysis</div>
          <div className="scr-stress-month">Data as of {formatMonth(stress.month)}</div>
          <div className="scr-stress-liquidity-grid">
            <div className="scr-stress-liq-card">
              <div className="scr-liq-label">Days to Liquidate 50%</div>
              <div className="scr-liq-val">{stress.days_50pct} days</div>
              <div className="scr-liq-meter"><div className="scr-liq-meter-fill" style={{ width: `${Math.min(100, (stress.days_50pct / 30) * 100)}%`, backgroundColor: getLiquidityColor(stress.days_50pct) }}></div></div>
            </div>
            <div className="scr-stress-liq-card">
              <div className="scr-liq-label">Days to Liquidate 25%</div>
              <div className="scr-liq-val">{stress.days_25pct} days</div>
              <div className="scr-liq-meter"><div className="scr-liq-meter-fill" style={{ width: `${Math.min(100, (stress.days_25pct / 15) * 100)}%`, backgroundColor: getLiquidityColor(stress.days_25pct * 2) }}></div></div>
            </div>
          </div>
          {stress.days_50pct >= 15 && stress.days_50pct <= 20 && (
            <div className="scr-warn-liquidity">⚠️ <b>Moderate Liquidity Risk:</b> Takes {stress.days_50pct} days to liquidate half of the portfolio under stress conditions.</div>
          )}
          <div className="scr-stress-kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
            <div className="scr-dk"><span>Top 10 Investors</span><b>{stress.top10_investors_pct ? `${stress.top10_investors_pct}%` : '—'}</b></div>
            <div className="scr-dk"><span>Turnover Ratio</span><b>{stress.turnover_ratio ? `${stress.turnover_ratio}%` : '—'}</b></div>
            <div className="scr-dk"><span>Portfolio Beta</span><b>{stress.beta ? stress.beta.toFixed(2) : '—'}</b></div>
          </div>
          <div className="scr-allocation-card">
            <div className="scr-alloc-title">Asset Allocation Breakdown</div>
            <div className="scr-alloc-bars">
              <div className="scr-alloc-item"><div className="scr-alloc-lbl">Large Cap ({stress.large_cap_pct}%)</div><div className="scr-alloc-bar-bg"><div className="scr-alloc-bar-fill large-cap" style={{ width: `${stress.large_cap_pct}%` }}></div></div></div>
              <div className="scr-alloc-item"><div className="scr-alloc-lbl">Mid Cap ({stress.mid_cap_pct}%)</div><div className="scr-alloc-bar-bg"><div className="scr-alloc-bar-fill mid-cap" style={{ width: `${stress.mid_cap_pct}%` }}></div></div></div>
              <div className="scr-alloc-item"><div className="scr-alloc-lbl">Small Cap ({stress.small_cap_pct}%)</div><div className="scr-alloc-bar-bg"><div className="scr-alloc-bar-fill small-cap" style={{ width: `${stress.small_cap_pct}%` }}></div></div></div>
              <div className="scr-alloc-item"><div className="scr-alloc-lbl">Cash ({stress.cash_pct}%)</div><div className="scr-alloc-bar-bg"><div className="scr-alloc-bar-fill cash" style={{ width: `${stress.cash_pct}%` }}></div></div></div>
            </div>
          </div>
          <div className="scr-valuation-card">
            <div className="scr-alloc-title">PE Valuation vs Benchmark</div>
            <div className="scr-pe-grid">
              <div className="scr-pe-item"><div className="scr-pe-label">Portfolio PE</div><div className="scr-pe-val">{stress.pe_portfolio ? stress.pe_portfolio.toFixed(1) : '—'}</div></div>
              <div className="scr-pe-item"><div className="scr-pe-label">Benchmark PE</div><div className="scr-pe-val">{stress.pe_benchmark ? stress.pe_benchmark.toFixed(1) : '—'}</div></div>
            </div>
            {stress.pe_benchmark_1ya && (
              <div className="scr-pe-history">Benchmark PE: 1Y ago <b>{stress.pe_benchmark_1ya.toFixed(1)}</b> {stress.pe_benchmark_2ya && <>| 2Y ago <b>{stress.pe_benchmark_2ya.toFixed(1)}</b></>}</div>
            )}
          </div>
        </div>
      )}

      <HoldingsSection holdingsData={holdings} loading={holdingsLoading} schemeName={f.name} />

      <div className="scr-drawer-meta">
        <span>Latest NAV{f.siblingResolved ? ' (Regular Plan)' : ''} ₹{f.nav}</span>
        {f.aumCr != null && <span>AUM ₹{Number(f.aumCr).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr</span>}
        {f.inception_date && <span>Since {new Date(f.inception_date + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>}
        <span>Age ~{f.age_years ?? '—'} yrs</span>
        <span>as of {f.asof}</span>
      </div>

      {(() => {
        if (!schemeFacts) return null;
        const masterRec = (f.isin && schemeFacts.byIsin?.[f.isin]) ||
          (f.code && schemeFacts.byAmfiCode?.[f.code]) || (() => {
            const norm = normalizeSchemeName(f.name);
            return norm ? schemeFacts.byNormName?.[norm] : null;
          })();
        if (!masterRec) return null;
        return (
          <div style={{ margin: '14px 0', padding: '14px 16px', background: 'var(--s2)', borderRadius: '12px', border: '1.5px solid var(--border)' }}>
            <div style={{ fontSize: '.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '10px', fontFamily: "'JetBrains Mono', monospace" }}>📋 Key Operational Facts (BSE StAR)</div>
            {(masterRec.purchaseAllowed === false || masterRec.redemptionAllowed === false) && (
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: '#d32f2f', background: 'rgba(211,47,47,0.08)', border: '1px solid rgba(211,47,47,0.2)', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px' }}>
                ⚠️ {masterRec.purchaseAllowed === false && masterRec.redemptionAllowed === false ? 'Currently not accepting fresh purchases or redemptions via BSE' : masterRec.purchaseAllowed === false ? 'Currently not accepting fresh purchases via BSE' : 'Currently not accepting redemptions via BSE'}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '10px' }}>
              <div><div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>🕒 Daily NAV Cutoff</div><div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text)' }}>{masterRec.redeemCutoff || masterRec.purchaseCutoff || masterRec.cutoff || '—'}</div></div>
              <div><div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>🏦 Settlement Cycle</div><div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text)' }}>{masterRec.settlement ? `${masterRec.settlement} Business Days` : '—'}</div></div>
              <div><div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>💰 Min Lumpsum</div><div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text)' }}>{masterRec.minPurchase != null ? `₹${masterRec.minPurchase.toLocaleString('en-IN')}` : '—'}</div></div>
              <div><div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>🏢 RTA Servicer</div><div style={{ fontSize: '.78rem', fontWeight: 700, color: masterRec.rta === 'CAMS' ? '#1565c0' : masterRec.rta === 'KFINTECH' ? '#6a1b9a' : 'var(--text)' }}>{masterRec.rta || '—'}</div></div>
            </div>
            {masterRec.exitLoadText && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>🚪 Exit Load {masterRec.exitLoadConfidence === 'low' && '(needs review)'}</div>
                {masterRec.exitLoadConfidence === 'high' && Array.isArray(masterRec.exitLoadTiers) ? (
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text)' }}>
                    {masterRec.exitLoadTiers.length === 0 ? '0% (No Load)' : masterRec.exitLoadTiers.map(t => `${(t.rate * 100).toFixed(2).replace(/\.00$/, '')}% (<${Math.round(t.days / 30.44)}mo)`).join(' / ')}
                    {masterRec.exitLoadFreePercent ? ` · ${masterRec.exitLoadFreePercent}% free` : ''}
                  </div>
                ) : (
                  <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--muted)', fontStyle: 'italic' }}>{masterRec.exitLoadText}</div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {masterRec.swp === true && <span style={{ fontSize: '.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--g-xlight)', color: 'var(--g1)', border: '1px solid var(--g-light)' }}>SWP Eligible</span>}
              {masterRec.sip === true && <span style={{ fontSize: '.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--g-xlight)', color: 'var(--g1)', border: '1px solid var(--g-light)' }}>SIP Available</span>}
              {masterRec.switchAllowed === true && <span style={{ fontSize: '.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--g-xlight)', color: 'var(--g1)', border: '1px solid var(--g-light)' }}>Switch Available</span>}
              {masterRec.divReinvest === true && <span style={{ fontSize: '.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--g-xlight)', color: 'var(--g1)', border: '1px solid var(--g-light)' }}>IDCW Reinvestment</span>}
              <span style={{ fontSize: '.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--s3)', color: 'var(--muted)', border: '1px solid var(--border)' }}>Demat &amp; SOA</span>
            </div>
          </div>
        );
      })()}

      <div className="scr-drawer-cta">
        <a className="scr-btn primary" href={`/fund/${f.code}`} target="_blank" rel="noreferrer">📄 Full Fund Report →</a>
        <a className="scr-btn" href={backtestLink(f)}>⚗ Backtest this fund</a>
        <a className="scr-btn" href="/rolling">📉 Rolling returns</a>
      </div>
    </>
  );
}

// ---------- Mutual Fund detail drawer ----------
export function FundDetailDrawer({ code, onClose }) {
  const [state, setState] = useState({ loading: true, error: false, fund: null, stress: null, holdings: null });
  const [nav, setNav] = useState(null);
  const [schemeFacts, setSchemeFacts] = useState(null);

  useEffect(() => {
    let alive = true;
    getSchemeMasterFacts().then(facts => { if (alive) setSchemeFacts(facts); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: false, fund: null, stress: null, holdings: null });
    fetch(`/api/fund-detail/${encodeURIComponent(code)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive) return;
        if (!d?.fund) { setState({ loading: false, error: true, fund: null, stress: null, holdings: null }); return; }
        setState({ loading: false, error: false, fund: d.fund, stress: d.stress, holdings: d.holdings ?? null });
      })
      .catch(() => { if (alive) setState({ loading: false, error: true, fund: null, stress: null, holdings: null }); });
    return () => { alive = false; };
  }, [code]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    let alive = true;
    fetch(`/api/mf?code=${code}`).then(r => r.json()).then(d => {
      if (!alive || !d?.data?.length) return;
      const pts = d.data.map(x => { const [dd, mm, yy] = x.date.split('-'); return { t: Date.UTC(+yy, +mm - 1, +dd), v: +x.nav }; }).filter(p => isFinite(p.v)).sort((a, b) => a.t - b.t);
      setNav(pts);
    }).catch(() => {});
    return () => { alive = false; window.removeEventListener('keydown', onKey); };
  }, [code, onClose]);

  const f = state.fund;
  const stress = state.stress;

  return (
    <div className="scr-drawer-wrap" onMouseDown={onClose}>
      <div className="scr-drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        {state.loading ? (
          <>
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
            <div className="scr-spark-load">Loading fund details…</div>
          </>
        ) : state.error || !f ? (
          <>
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
            <div className="scr-drawer-h">
              <div className="scr-drawer-name">Fund details unavailable</div>
              <button className="scr-x" onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="scr-warn">We couldn't load details for this fund right now.</div>
          </>
        ) : (
          <FundDetailPanel f={f} stress={stress} holdings={state.holdings} nav={nav} schemeFacts={schemeFacts} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

// Pure rendering counterpart to FundDetailPanel above, for SIFs. See that
// function's header comment for why this split exists.
export function SifDetailPanel({ s, holdings, holdingsLoading = false, pts, histLoading, onClose }) {
  const fam = s.category?.startsWith('Equity') ? 'Equity' : 'Hybrid';
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="scr-drawer-h">
        <div>
          <div className="scr-drawer-name">{s.nav_name.replace(/\s*-\s*(Regular Plan|Regular).*/i, '').trim()}</div>
          <div className="scr-drawer-tags">
            <span className="scr-tag">{s.sif_name}</span>
            <span className={`scr-sif-badge scr-sif-badge-${fam.toLowerCase()}`} style={{ fontSize: '10px', padding: '3px 8px' }}>{SIF_STRATEGY_LABELS[s.category] || sifStratShort(s.category)}</span>
            <span className="scr-tag alt">{s.scheme_id}</span>
          </div>
        </div>
        <button className="scr-x" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="scr-sif-notice">ⓘ SIFs are a new asset class (launched 2024–25) with limited NAV history — longer-horizon metrics (3Y+) will populate as funds mature. See the table for the return periods already available.</div>

      {histLoading ? (
        <div className="scr-spark-load">Loading NAV history…</div>
      ) : (!pts || pts.length < 2) ? (
        <div className="scr-spark-load">No NAV history available yet</div>
      ) : (
        <CompareGrowthChart series={[{ name: s.nav_name, color: pts[pts.length - 1].v >= pts[0].v ? '#2e7d32' : '#b71c1c', data: pts }]} showLegend={false} />
      )}

      <div className="scr-drawer-kpis">
        <div className="scr-dk"><span>Latest NAV</span><b>₹{s.nav.toFixed(4)}</b></div>
        <div className="scr-dk"><span>NAV Date</span><b style={{ fontSize: '13px' }}>{s.nav_date}</b></div>
        <div className="scr-dk"><span>Data points</span><b>{pts ? pts.length : '—'}</b></div>
        {s.aumCr != null && (
          <div className="scr-dk"><span>AUM</span><b style={{ fontSize: '13px' }}>₹{Number(s.aumCr).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr</b></div>
        )}
      </div>

      <HoldingsSection holdingsData={holdings} loading={holdingsLoading} schemeName={s.nav_name} />

      <div className="scr-drawer-cta">
        <a className="scr-btn primary" href={`/sif/${s.scheme_id}`} target="_blank" rel="noreferrer">View Full SIF Page →</a>
        <a className="scr-btn" href={backtestSifLink(s)}>⚗ Backtest this SIF</a>
        <a className="scr-btn" href="/sifs">📋 Full SIF screener</a>
      </div>
    </>
  );
}

// ---------- SIF detail drawer ----------
export function SifDetailDrawer({ schemeId, onClose }) {
  const [state, setState] = useState({ loading: true, error: false, scheme: null, holdings: null });
  const [pts, setPts] = useState(null);
  const [histLoading, setHistLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: false, scheme: null, holdings: null });
    fetch(`/api/sif-detail/${encodeURIComponent(schemeId)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!alive) return;
        if (!d?.scheme) { setState({ loading: false, error: true, scheme: null, holdings: null }); return; }
        setState({ loading: false, error: false, scheme: d.scheme, holdings: d.holdings ?? null });
      })
      .catch(() => { if (alive) setState({ loading: false, error: true, scheme: null, holdings: null }); });
    return () => { alive = false; };
  }, [schemeId]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    let alive = true;
    setHistLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    fetch(`/api/sif-history?sd_id=${encodeURIComponent(schemeId)}&from=${from}&to=${today}`)
      .then(r => r.json())
      .then(d => {
        if (!alive || !d?.records?.length) { setHistLoading(false); return; }
        setPts(d.records.map(r => ({ t: new Date(r.date).getTime(), v: +r.nav })).filter(p => isFinite(p.v)).sort((a, b) => a.t - b.t));
        setHistLoading(false);
      })
      .catch(() => setHistLoading(false));
    return () => { alive = false; window.removeEventListener('keydown', onKey); };
  }, [schemeId, onClose]);

  const s = state.scheme;

  return (
    <div className="scr-drawer-wrap" onMouseDown={onClose}>
      <div className="scr-drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        {state.loading ? (
          <>
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
            <div className="scr-spark-load">Loading SIF details…</div>
          </>
        ) : state.error || !s ? (
          <>
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
            <div className="scr-drawer-h">
              <div className="scr-drawer-name">SIF details unavailable</div>
              <button className="scr-x" onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="scr-warn">We couldn't load details for this SIF right now.</div>
          </>
        ) : (
          <SifDetailPanel s={s} holdings={state.holdings} pts={pts} histLoading={histLoading} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

// ---------- shared CSS (verified against ScreenerClient.jsx's own CSS blob) ----------
const CSS = `
.scr-drawer-wrap{position:fixed;inset:0;background:#0d260d55;backdrop-filter:blur(3px);z-index:10000;display:flex;justify-content:flex-end;animation:scrfade .2s ease}
.scr-drawer{background:var(--surface);width:460px;max-width:100%;height:100%;overflow-y:auto;box-shadow:var(--shadow-lg);padding:22px;animation:scrslide .28s cubic-bezier(.2,.7,.3,1)}
@keyframes scrfade{from{opacity:0}to{opacity:1}}
@keyframes scrslide{from{transform:translateX(40px);opacity:.4}to{transform:none;opacity:1}}
@keyframes scrup{from{transform:translateY(60px);opacity:.5}to{transform:none;opacity:1}}
.scr-drawer-h{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;margin-bottom:14px}
.scr-drawer-name{font-size:16px;font-weight:800;color:var(--text);line-height:1.3}
.scr-drawer-tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.scr-tag{font:700 10px JetBrains Mono,monospace;background:var(--g-xlight);color:var(--g1);padding:3px 8px;border-radius:5px}
.scr-tag.alt{background:var(--s3,#eef5ee);color:var(--text2)}
.scr-x{width:34px;height:34px;border:1px solid var(--border);background:var(--surface);border-radius:9px;font-size:20px;color:var(--muted);cursor:pointer;flex:none}
.scr-warn{background:var(--warn-bg,#fff3e0);border:1px solid #ffcc80;color:#8a4300;padding:9px 12px;border-radius:8px;font-size:12px;margin-bottom:14px}
.scr-spark-load{font:500 11px JetBrains Mono,monospace;color:var(--muted);margin-top:5px;padding:34px 0;text-align:center}
.scr-drawer-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:14px}
.scr-dk{background:var(--s2);border:1px solid var(--border);border-radius:9px;padding:9px 10px;display:flex;flex-direction:column;gap:3px}
.scr-dk span{font:600 9.5px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase}
.scr-dk b{font:800 16px JetBrains Mono,monospace;color:var(--text)}
.scr-drawer-meta{display:flex;flex-wrap:wrap;gap:12px;font:600 11px JetBrains Mono,monospace;color:var(--muted);border-top:1px solid var(--border);padding-top:12px;margin-bottom:16px}
.scr-drawer-cta{display:flex;gap:10px;flex-wrap:wrap}
.scr-btn{flex:1;text-align:center;padding:12px;border-radius:10px;border:1px solid var(--border);background:var(--surface);color:var(--text);font:800 13px Raleway,sans-serif;text-decoration:none;white-space:nowrap}
.scr-btn.primary{background:var(--g1);color:#fff;border-color:var(--g1)}
.scr-btn:hover{transform:translateY(-1px)}
.scr-pos{color:var(--g2)}
.scr-neg{color:var(--neg)}
.scr-muted{color:var(--muted)}
@media(max-width:560px){
  .scr-drawer-wrap{justify-content:center;align-items:flex-end}
  .scr-drawer{width:100%;height:auto;max-height:90vh;border-radius:18px 18px 0 0;animation:scrup .3s cubic-bezier(.2,.7,.3,1)}
  .scr-drawer-kpis{grid-template-columns:repeat(2,1fr)}
}
@media (prefers-reduced-motion: reduce){ .scr-drawer,.scr-drawer-wrap{animation:none} .scr-btn:hover{transform:none} }

/* SIF badges + notice */
.scr-sif-badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:6px;font:700 11px JetBrains Mono,monospace;white-space:nowrap}
.scr-sif-badge-equity{background:rgba(27,94,32,.12);color:var(--g1)}
.scr-sif-badge-hybrid{background:rgba(94,53,177,.10);color:#5e35b1}
.scr-sif-notice{background:rgba(94,53,177,.08);border:1px solid rgba(94,53,177,.2);border-radius:8px;padding:9px 12px;font-size:12px;color:#7c4dff;margin-bottom:14px}

/* Stress test section in drawer */
.scr-stress-section{border-top:1px solid var(--border);padding-top:16px;margin-top:16px}
.scr-stress-title{font-size:14px;font-weight:800;color:var(--text);margin-bottom:4px}
.scr-stress-month{font:500 11px JetBrains Mono,monospace;color:var(--muted);margin-bottom:12px}
.scr-stress-liquidity-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:12px}
.scr-stress-liq-card{background:var(--s2);border:1px solid var(--border);border-radius:9px;padding:10px;display:flex;flex-direction:column;gap:4px}
.scr-liq-label{font-size:9px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.02em}
.scr-liq-val{font:800 18px JetBrains Mono,monospace;color:var(--text)}
.scr-liq-meter{height:4px;background:var(--border);border-radius:2px;overflow:hidden;margin-top:2px}
.scr-liq-meter-fill{height:100%;border-radius:2px;transition:width .3s ease}
.scr-warn-liquidity{background:rgba(230,81,0,.08);border:1px solid rgba(230,81,0,.15);color:#e65100;padding:8px 12px;border-radius:8px;font-size:11px;margin-bottom:12px;line-height:1.4}
.scr-allocation-card,.scr-valuation-card{background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:12px}
.scr-alloc-title{font-size:10px;font-weight:800;color:var(--muted);text-transform:uppercase;margin-bottom:10px;letter-spacing:.03em}
.scr-alloc-bars{display:flex;flex-direction:column;gap:8px}
.scr-alloc-item{display:flex;flex-direction:column;gap:3px}
.scr-alloc-lbl{font:600 10.5px JetBrains Mono,monospace;color:var(--text2)}
.scr-alloc-bar-bg{height:6px;background:var(--border);border-radius:3px;overflow:hidden}
.scr-alloc-bar-fill{height:100%;border-radius:3px}
.scr-alloc-bar-fill.large-cap{background:#1b5e20}
.scr-alloc-bar-fill.mid-cap{background:#2e7d32}
.scr-alloc-bar-fill.small-cap{background:#e65100}
.scr-alloc-bar-fill.cash{background:#0288d1}
.scr-pe-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.scr-pe-label{font-size:9px;color:var(--muted);font-weight:600;margin-bottom:2px;text-transform:uppercase}
.scr-pe-val{font:800 16px JetBrains Mono,monospace;color:var(--text)}
.scr-pe-history{font:500 10px JetBrains Mono,monospace;color:var(--muted);text-align:center;margin-top:8px;border-top:1px dashed var(--border);padding-top:6px}

/* Holdings section in drawer */
.scr-hold-section{border-top:1px solid var(--border);padding-top:16px;margin-top:16px}
.scr-hold-title{font-size:14px;font-weight:800;color:var(--text);margin-bottom:12px}
.scr-hold-table-wrap{overflow-x:auto;margin-bottom:12px;-webkit-overflow-scrolling:touch}
.scr-hold-table{width:100%;border-collapse:collapse;font:500 12px Raleway,sans-serif}
.scr-hold-table th{font:700 9px JetBrains Mono,monospace;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;padding:6px 8px;border-bottom:1.5px solid var(--border);text-align:left}
.scr-hold-table td{padding:7px 8px;border-bottom:1px solid var(--border);color:var(--text);font-size:12px}
.scr-hold-stock{font-weight:600;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.scr-hold-sector{font:500 10px JetBrains Mono,monospace;color:var(--muted)}
.scr-hold-pct{font:700 12px JetBrains Mono,monospace;text-align:right;color:var(--g1)}
.scr-hold-toggle{display:block;width:100%;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--s2);color:var(--g1);font:700 11px JetBrains Mono,monospace;cursor:pointer;text-align:center;margin-bottom:12px;transition:background .15s}
.scr-hold-toggle:hover{background:var(--g-xlight)}
.scr-hold-empty{font:500 11px JetBrains Mono,monospace;color:var(--muted);text-align:center;padding:16px 0}

/* Holdings gating & paywall modal */
.scr-hold-row-locked{cursor:pointer;background:var(--s2);transition:background .15s ease}
.scr-hold-row-locked:hover{background:var(--g-xlight)}
.scr-hold-locked-cell{display:flex;align-items:center;justify-content:space-between;padding:4px 2px;font:700 11px JetBrains Mono,monospace;color:var(--muted)}
.scr-hold-pro-badge{background:linear-gradient(135deg,#1b5e20 0%,#2e7d32 100%);color:#fff;font:800 9px JetBrains Mono,monospace;padding:2px 6px;border-radius:4px;letter-spacing:.05em}
.scr-hold-toggle-wrap{margin-bottom:12px}
.scr-hold-pro-teaser{background:linear-gradient(135deg,var(--s2) 0%,var(--g-xlight) 100%);border:1.5px solid var(--g-light);border-radius:10px;padding:12px 14px;display:flex;flex-direction:column;gap:10px;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease}
.scr-hold-pro-teaser:hover{transform:translateY(-1px);box-shadow:var(--shadow);border-color:var(--g2)}
.scr-hold-teaser-info{display:flex;align-items:center;gap:10px}
.scr-hold-teaser-crown{font-size:22px;line-height:1}
.scr-hold-teaser-head{font:800 12.5px Raleway,sans-serif;color:var(--text)}
.scr-hold-teaser-sub{font:500 11px Raleway,sans-serif;color:var(--muted)}
.scr-hold-teaser-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:9px;border:0;border-radius:8px;background:linear-gradient(135deg,#1b5e20 0%,#2e7d32 100%);color:#fff;font:800 12px Raleway,sans-serif;cursor:pointer;box-shadow:0 2px 8px rgba(27,94,32,.25);transition:opacity .15s ease}
.scr-hold-teaser-btn:hover{opacity:.92}
.scr-hold-btn-tag{background:rgba(255,255,255,.25);color:#fff;font:800 9px JetBrains Mono,monospace;padding:2px 5px;border-radius:4px}
.scr-pro-modal-wrap{position:fixed;inset:0;background:rgba(13,38,13,.72);backdrop-filter:blur(6px);z-index:10005;display:grid;place-items:center;padding:16px;animation:scrfade .2s ease}
.scr-pro-modal{background:var(--surface);border:1.5px solid var(--g-light);border-radius:18px;max-width:480px;width:100%;padding:24px;box-shadow:0 20px 40px rgba(0,0,0,.35);position:relative;animation:scrup .25s cubic-bezier(.2,.7,.3,1)}
.scr-pro-modal-x{position:absolute;top:14px;right:14px;width:32px;height:32px;border:1px solid var(--border);background:var(--s2);border-radius:8px;font-size:20px;color:var(--muted);cursor:pointer;display:grid;place-items:center}
.scr-pro-modal-x:hover{color:var(--text);border-color:var(--g3)}
.scr-pro-modal-header{text-align:center;margin-bottom:18px}
.scr-pro-crown-badge{display:inline-flex;align-items:center;gap:5px;background:var(--g-xlight);color:var(--g1);border:1px solid var(--g-light);border-radius:20px;padding:4px 12px;font:800 10.5px JetBrains Mono,monospace;letter-spacing:.05em;margin-bottom:10px}
.scr-pro-modal-title{font:800 19px Raleway,sans-serif;color:var(--text);margin:0 0 6px;line-height:1.25}
.scr-pro-modal-desc{font:500 12.5px/1.55 Raleway,sans-serif;color:var(--text2);margin:0}
.scr-pro-features-grid{display:flex;flex-direction:column;gap:10px;margin-bottom:20px;background:var(--s2);border:1px solid var(--border);border-radius:12px;padding:14px}
.scr-pro-feat-item{display:flex;gap:12px;align-items:flex-start}
.scr-pro-feat-ic{font-size:18px;flex:none;margin-top:1px}
.scr-pro-feat-item strong{display:block;font:700 12.5px Raleway,sans-serif;color:var(--text);margin-bottom:2px}
.scr-pro-feat-item span{display:block;font:500 11.5px/1.4 Raleway,sans-serif;color:var(--muted)}
.scr-pro-pricing-card{background:linear-gradient(135deg,var(--s2) 0%,var(--g-xlight) 100%);border:1.5px solid var(--g-light);border-radius:12px;padding:16px;text-align:center}
.scr-pro-price-row{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px}
.scr-pro-price-amount{font:800 24px JetBrains Mono,monospace;color:var(--g1)}
.scr-pro-price-period{font:600 12px Raleway,sans-serif;color:var(--muted);margin-left:4px}
.scr-pro-price-total{font:700 11px JetBrains Mono,monospace;color:var(--muted)}
.scr-pro-cta{width:100%;padding:12px;border:0;border-radius:10px;background:linear-gradient(135deg,#1b5e20 0%,#2e7d32 100%);color:#fff;font:800 14px Raleway,sans-serif;cursor:pointer;box-shadow:0 4px 12px rgba(27,94,32,.3);transition:transform .15s ease,opacity .15s ease}
.scr-pro-cta:hover:not(:disabled){transform:translateY(-1px);opacity:.95}
.scr-pro-cta:disabled{opacity:.6;cursor:wait}
.scr-pro-err{color:#d32f2f;font-size:11.5px;margin-top:8px}
.scr-pro-sublink{margin-top:10px}
.scr-pro-sublink a{font:600 11.5px Raleway,sans-serif;color:var(--g1);text-decoration:none}
.scr-pro-sublink a:hover{text-decoration:underline}
`;
