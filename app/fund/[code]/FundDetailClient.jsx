'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProviderAvatar from '@/components/ProviderAvatar';
import CompareGrowthChart from '@/app/screener/CompareGrowthChart';
import HoldingsSection from '@/app/screener/HoldingsSection';
import { getMFLogo } from '@/lib/providerLogos';
import { shortCat, CURATED_CATEGORIES, categoryToSlug } from '@/app/screener/screenerContent';
import { normalizeSchemeName } from '@/lib/normalizeSchemeName';
import { startCheckout } from '@/lib/checkoutClient';
import './fund-detail.css';

const BENCHMARK_OPTIONS = [
  'BSE SENSEX',
  'BSE 500',
  'BSE MidCap',
  'BSE SmallCap',
  'BSE BANKEX',
  'BSE Information Technology',
  'BSE Healthcare',
  'BSE Fast Moving Consumer Goods',
];

const pctTxt = (v, sign = true) => (v == null ? '—' : (sign && v > 0 ? '+' : '') + v.toFixed(1) + '%');
const cls = (v) => (v == null ? 'fd-muted' : v >= 0 ? 'fd-pos' : 'fd-neg');

let smfPromise = null;
function getSchemeMasterFacts() {
  if (!smfPromise) {
    smfPromise = fetch('/api/scheme-master-facts')
      .then((r) => (r.ok ? r.json() : { byIsin: {}, byAmfiCode: {}, byNormName: {} }))
      .catch(() => ({ byIsin: {}, byAmfiCode: {}, byNormName: {} }));
  }
  return smfPromise;
}

export default function FundDetailClient({ code }) {
  const { data: session } = useSession();
  const [fundData, setFundData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Pro-only state
  const [navPts, setNavPts] = useState(null);
  const [benchPts, setBenchPts] = useState(null);
  const [benchIdx, setBenchIdx] = useState('BSE SENSEX');
  const [showBench, setShowBench] = useState(true);
  const [benchErr, setBenchErr] = useState(false);
  const [chartPeriod, setChartPeriod] = useState('All');
  const [holdingsData, setHoldingsData] = useState(null);
  const [holdingsLoading, setHoldingsLoading] = useState(false);
  const [schemeFacts, setSchemeFacts] = useState(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeErr, setUpgradeErr] = useState('');

  const isPaidOrAdmin = Boolean(
    session?.user?.role === 'admin' ||
      session?.user?.plan === 'pro' ||
      session?.user?.plan === 'pro_lifetime' ||
      session?.user?.plan === 'lifetime' ||
      session?.user?.isPro
  );

  // ── 1. Fetch core fund data from API ───────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetch(`/api/fund-detail/${code}`)
      .then((r) => {
        if (!r.ok) throw new Error('Fund not found');
        return r.json();
      })
      .then((d) => {
        setFundData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || 'Failed to load fund data');
        setLoading(false);
      });
  }, [code]);

  // ── 2. Operational facts (public) ─────────────────────────────────────────
  useEffect(() => {
    getSchemeMasterFacts().then(setSchemeFacts);
  }, []);

  // ── 3. Pro-only fetches (NAV history & Holdings) ──────────────────────────
  useEffect(() => {
    if (!isPaidOrAdmin || !fundData?.fund) return;
    const f = fundData.fund;

    // NAV history
    fetch(`/api/mf?code=${code}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.data?.length) return;
        const pts = d.data
          .map((x) => {
            const [dd, mm, yy] = x.date.split('-');
            return { t: Date.UTC(+yy, +mm - 1, +dd), v: +x.nav };
          })
          .filter((p) => isFinite(p.v) && p.v > 0)
          .sort((a, b) => a.t - b.t);
        setNavPts(pts);
      })
      .catch(() => {});

    // Holdings
    setHoldingsLoading(true);
    fetch(`/api/proposal-studio/holdings?amfiCode=${encodeURIComponent(code)}&schemeName=${encodeURIComponent(f.name)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setHoldingsData(d);
        setHoldingsLoading(false);
      })
      .catch(() => setHoldingsLoading(false));
  }, [isPaidOrAdmin, fundData, code]);

  // ── 4. Benchmark index fetch (Pro only) ────────────────────────────────────
  useEffect(() => {
    if (!isPaidOrAdmin || !showBench) return;
    setBenchErr(false);
    setBenchPts(null);
    fetch(`/api/nifty-tri?index=${encodeURIComponent(benchIdx)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.data?.length) {
          setBenchErr(true);
          return;
        }
        const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
        const pts = d.data
          .map((r) => {
            const [dd, mon, yy] = r.date.split(' ');
            return { t: Date.UTC(+yy, MONTHS[mon], +dd), v: +r.value };
          })
          .filter((p) => isFinite(p.v) && p.v > 0)
          .sort((a, b) => a.t - b.t);
        setBenchPts(pts);
      })
      .catch(() => setBenchErr(true));
  }, [isPaidOrAdmin, benchIdx, showBench]);

  // ── Chart period filter & normaliser ──────────────────────────────────────
  function filterByPeriod(pts) {
    if (!pts || chartPeriod === 'All') return pts;
    const years = chartPeriod === '1Y' ? 1 : chartPeriod === '3Y' ? 3 : 5;
    const cutoff = Date.now() - years * 365.25 * 86400000;
    return pts.filter((p) => p.t >= cutoff);
  }

  function normaliseSeries(fund, bench) {
    if (!fund?.length) return { fund: null, bench: null };
    const startT = Math.max(fund[0].t, bench?.[0]?.t ?? fund[0].t);
    const fSlice = fund.filter((p) => p.t >= startT);
    const base = fSlice[0]?.v;
    if (!base) return { fund: null, bench: null };
    const normF = fSlice.map((p) => ({ t: p.t, v: (p.v / base) * 100 }));

    if (!bench?.length) return { fund: normF, bench: null };
    const bSlice = bench.filter((p) => p.t >= startT);
    const bBase = bSlice[0]?.v;
    const normB = bBase ? bSlice.map((p) => ({ t: p.t, v: (p.v / bBase) * 100 })) : null;
    return { fund: normF, bench: normB };
  }

  // ── Upgrade CTA Handler ───────────────────────────────────────────────────
  async function handleUpgrade() {
    if (!session?.user) {
      signIn();
      return;
    }
    setUpgradeLoading(true);
    setUpgradeErr('');
    try {
      await startCheckout({
        plan: 'annual',
        session,
        onSuccess() {
          window.location.reload();
        },
        onDismiss() {
          setUpgradeLoading(false);
        },
      });
    } catch (e) {
      setUpgradeErr(e.message);
      setUpgradeLoading(false);
    }
  }

  const f = fundData?.fund;
  const stress = fundData?.stress;
  const isPro = Boolean(fundData?.isPro);

  const masterRec = schemeFacts && f
    ? (schemeFacts.byIsin?.[f.isin]) ||
      (schemeFacts.byAmfiCode?.[code]) ||
      (schemeFacts.byNormName?.[normalizeSchemeName(f.name)]) || null
    : null;

  const catEntry = f ? CURATED_CATEGORIES.find((c) => c.category === f.category) : null;
  const catExplainer = catEntry?.explainer || null;
  const catSlug = f ? categoryToSlug(f.category) : null;

  function backtestLink() {
    if (!f) return '/backtest';
    try {
      const state = { v: 1, h: [{ k: 'mf', i: f.code, n: f.name, c: f.category, m: 'sip', mo: 10000, l: 100000, sm: 'default', cs: '' }], sd: 1, smo: 'lookback', lb: '10', sdt: '', su: 0, st: 1, bo: 0, b: null };
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(state)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `/backtest?p=${b64}`;
    } catch {
      return '/backtest';
    }
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="fd-page"><div className="fd-load">Loading fund details…</div></main>
        <Footer />
      </>
    );
  }

  if (error || !f) {
    return (
      <>
        <Navbar />
        <main className="fd-page">
          <div className="fd-err">
            Fund not found or unavailable.
            <a href="/screener">← Back to mutual fund screener</a>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const filteredNav = filterByPeriod(navPts);
  const filteredBench = filterByPeriod(benchPts);
  const { fund: normNav, bench: normBench } = normaliseSeries(filteredNav, showBench ? filteredBench : null);

  return (
    <>
      <Navbar />
      <main className="fd-page">

        {/* ── ① HERO HEADER ──────────────────────────────────────────────── */}
        <div className="fd-hero">
          <ProviderAvatar name={f.amc} logoPath={getMFLogo(f.amc)} size={52} radius={12} />
          <div className="fd-hero-info">
            <h1 className="fd-fund-name">{f.name}</h1>
            <div className="fd-hero-tags">
              <span className="fd-tag">{f.amc}</span>
              <span className="fd-tag alt">{shortCat(f.category)}</span>
              <span className="fd-tag alt">{f.structure}</span>
              {f.isin && <span className="fd-tag mono">{f.isin}</span>}
            </div>
            <div className="fd-hero-meta">
              {f.inception_date && (
                <span>
                  Launched {new Date(f.inception_date + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}
                </span>
              )}
              {f.age_years != null && <span>~{Math.floor(f.age_years)} yrs old</span>}
              {f.nav != null && <span>NAV ₹{Number(f.nav).toFixed(4)}</span>}
              {f.asof && <span>as of {f.asof}</span>}
            </div>
            {f.flag === 'check' && (
              <div className="fd-warn">
                ⚠ One or more metrics look unusual for this scheme — we’re reviewing the source data.
              </div>
            )}
          </div>
        </div>

        {/* ── ② ABOUT CATEGORY (Public) ──────────────────────────────────── */}
        {catExplainer && (
          <div className="fd-section">
            <div className="fd-section-label">📖 About This SEBI Category</div>
            <p className="fd-explainer">{catExplainer}</p>
          </div>
        )}

        {/* ── ③ OPERATIONAL FACTS (Public) ──────────────────────────────── */}
        {masterRec && (
          <div className="fd-section">
            <div className="fd-section-label">📋 Key Scheme Facts (BSE StAR MF)</div>
            {(masterRec.purchaseAllowed === false || masterRec.redemptionAllowed === false) && (
              <div className="fd-warn" style={{ marginBottom: 12 }}>
                ⚠️ {masterRec.purchaseAllowed === false && masterRec.redemptionAllowed === false
                  ? 'Not accepting fresh purchases or redemptions via BSE'
                  : masterRec.purchaseAllowed === false
                  ? 'Not accepting fresh purchases via BSE'
                  : 'Not accepting redemptions via BSE'}
              </div>
            )}
            <div className="fd-ops-grid">
              <div className="fd-ops-item">
                <div className="fd-ops-label">Min Investment</div>
                <div className="fd-ops-val">
                  {masterRec.minPurchase != null ? `₹${Number(masterRec.minPurchase).toLocaleString('en-IN')}` : '—'}
                </div>
              </div>
              <div className="fd-ops-item">
                <div className="fd-ops-label">RTA</div>
                <div
                  className="fd-ops-val"
                  style={{ color: masterRec.rta === 'CAMS' ? '#1565c0' : masterRec.rta === 'KFINTECH' ? '#6a1b9a' : 'var(--text)' }}
                >
                  {masterRec.rta || '—'}
                </div>
              </div>
              <div className="fd-ops-item">
                <div className="fd-ops-label">NAV Cutoff</div>
                <div className="fd-ops-val">{masterRec.redeemCutoff || masterRec.purchaseCutoff || '—'}</div>
              </div>
              <div className="fd-ops-item">
                <div className="fd-ops-label">Settlement Cycle</div>
                <div className="fd-ops-val">{masterRec.settlement ? `T+${masterRec.settlement} days` : '—'}</div>
              </div>
            </div>
            {masterRec.exitLoadText && (
              <div style={{ marginTop: 12, background: 'var(--s3)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                <div className="fd-ops-label">Exit Load Structure</div>
                <div className="fd-ops-val" style={{ fontSize: '.82rem', fontWeight: 600 }}>
                  {masterRec.exitLoadConfidence === 'high' && Array.isArray(masterRec.exitLoadTiers)
                    ? masterRec.exitLoadTiers.length === 0
                      ? '0% (No exit load)'
                      : masterRec.exitLoadTiers.map((t) => `${(t.rate * 100).toFixed(2).replace(/\.00$/, '')}% (<${Math.round(t.days / 30.44)}mo)`).join(' / ')
                    : masterRec.exitLoadText}
                </div>
              </div>
            )}
            <div className="fd-badge-row">
              {masterRec.sip === true && <span className="fd-badge green">SIP Available</span>}
              {masterRec.swp === true && <span className="fd-badge green">SWP Eligible</span>}
              {masterRec.switchAllowed === true && <span className="fd-badge green">Switch Available</span>}
              {masterRec.divReinvest === true && <span className="fd-badge green">IDCW Reinvestment</span>}
              <span className="fd-badge">Demat &amp; SOA Format</span>
            </div>
          </div>
        )}

        {/* ── ④ FUND-SPECIFIC FAQ (Public) ──────────────────────────────── */}
        <div className="fd-section">
          <div className="fd-section-label">❓ Frequently Asked Questions</div>
          <div className="fd-faq-list">
            <details className="fd-faq-item">
              <summary>What is {f.name}?</summary>
              <p className="fd-faq-answer">
                {f.name} is an open-ended {shortCat(f.category)} mutual fund scheme managed by {f.amc}.
                {f.inception_date && ` It was launched in ${new Date(f.inception_date + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}.`}
                It is categorized under {f.category} as defined by SEBI. Investors can invest via lumpsum or systematic investment plans (SIP).
              </p>
            </details>

            <details className="fd-faq-item">
              <summary>Who manages {f.name}?</summary>
              <p className="fd-faq-answer">
                {f.name} is managed and operated by {f.amc}. As a regulated mutual fund house in India, {f.amc} employs professional fund managers to make asset allocation and security selection decisions in accordance with SEBI guidelines.
              </p>
            </details>

            <details className="fd-faq-item">
              <summary>What is the minimum investment in {f.name}?</summary>
              <p className="fd-faq-answer">
                {masterRec?.minPurchase != null
                  ? `The minimum initial lumpsum purchase amount for ${f.name} via BSE StAR MF is ₹${Number(masterRec.minPurchase).toLocaleString('en-IN')}.`
                  : `Minimum investment limits vary by plan, but most equity mutual funds allow initial lumpsum investments from ₹1,000 to ₹5,000 and monthly SIPs from ₹500.`}
              </p>
            </details>

            <details className="fd-faq-item">
              <summary>What is the exit load on {f.name}?</summary>
              <p className="fd-faq-answer">
                {masterRec?.exitLoadText
                  ? `Exit load: ${masterRec.exitLoadText}`
                  : `Exit load is charged if units are redeemed before a specified holding period (typically 1% for equity funds if redeemed within 1 year). Refer to the official factsheet for exact tier details.`}
              </p>
            </details>

            <details className="fd-faq-item">
              <summary>Is {f.name} suitable for long-term goals?</summary>
              <p className="fd-faq-answer">
                {f.name} belongs to the {f.category} category. Equity-oriented funds are designed for long-term wealth accumulation (5+ year horizon), while debt funds suit shorter horizons. Always evaluate your risk tolerance and goal timeline before investing.
              </p>
            </details>

            <details className="fd-faq-item">
              <summary>How can I view complete analytics &amp; holdings for {f.name}?</summary>
              <p className="fd-faq-answer">
                Abundance Pro members get instant access to complete analytics for {f.name}, including point-to-point CAGR returns (1M to 10Y), interactive NAV history charts with benchmark overlays, SEBI stress test data, and complete 100% portfolio stock disclosures.
              </p>
            </details>
          </div>
        </div>

        {/* ── ⑤ UPGRADE PAYWALL PANEL (Public for Non-Pro) ───────────────── */}
        {!isPro && (
          <div className="fd-section fd-gate-panel">
            <div className="fd-gate-crown">👑 ABUNDANCE PRO FEATURE</div>
            <div className="fd-gate-title">Unlock Full Fund Analytics &amp; Holdings</div>
            <ul className="fd-gate-features">
              <li>Returns across 1M, 3M, 6M, 1Y, 3Y, 5Y, 7Y, 10Y &amp; since inception</li>
              <li>Interactive NAV history chart with BSE benchmark index overlays</li>
              <li>SEBI stress test &amp; liquidity analysis (days to liquidate 25%/50%)</li>
              <li>Complete security-level portfolio holdings with sector weightages</li>
              <li>AMFI market cap allocation (Large / Mid / Small Cap) &amp; PE valuation</li>
            </ul>
            <div className="fd-gate-actions">
              {!session?.user && (
                <button className="fd-gate-btn secondary" onClick={() => signIn()}>
                  Sign In
                </button>
              )}
              <button className="fd-gate-btn primary" onClick={handleUpgrade} disabled={upgradeLoading}>
                {upgradeLoading ? 'Opening checkout…' : 'Upgrade to Pro — ₹499/year →'}
              </button>
            </div>
            {upgradeErr && <div className="fd-gate-err">{upgradeErr}</div>}
            <div className="fd-gate-link">
              <a href="/pricing">View all Pro benefits &amp; features →</a>
            </div>
          </div>
        )}

        {/* ── ⑥ RETURNS DASHBOARD (Pro Only) ─────────────────────────────── */}
        {isPro && (
          <div className="fd-section">
            <div className="fd-section-label">📈 Fund Returns</div>
            <div className="fd-returns-grid">
              {[
                ['1M', f.ret_1m, false],
                ['3M', f.ret_3m, false],
                ['6M', f.ret_6m, false],
                ['1Y', f.ret_1y, true],
                ['3Y', f.ret_3y, true],
                ['5Y', f.ret_5y, true],
                ['7Y', f.ret_7y, true],
                ['10Y', f.ret_10y, true],
                ['Inception', f.ret_inception, true],
              ].map(([label, val, annualised]) => (
                <div className="fd-ret-card" key={label}>
                  <div className="fd-ret-label">{label}</div>
                  <div className={`fd-ret-val ${cls(val)}`}>{pctTxt(val)}</div>
                  {val != null && <div className="fd-ret-type">{annualised ? 'CAGR' : 'Absolute'}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ⑦ NAV HISTORY CHART + BENCHMARK OVERLAY (Pro Only) ─────────── */}
        {isPro && (
          <div className="fd-section">
            <div className="fd-section-label">📊 NAV Growth &amp; Benchmark Overlay</div>
            <div className="fd-chart-controls">
              {['1Y', '3Y', '5Y', 'All'].map((p) => (
                <button
                  key={p}
                  className={`fd-period-pill${chartPeriod === p ? ' active' : ''}`}
                  onClick={() => setChartPeriod(p)}
                >
                  {p}
                </button>
              ))}
              <div style={{ flex: 1 }} />
              <select
                className="fd-benchmark-select"
                value={benchIdx}
                onChange={(e) => {
                  setBenchIdx(e.target.value);
                  setShowBench(true);
                }}
              >
                {BENCHMARK_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <button
                className={`fd-toggle-pill${showBench ? ' active' : ''}`}
                onClick={() => setShowBench((s) => !s)}
              >
                {showBench ? '✓ Benchmark' : 'Benchmark'}
              </button>
            </div>

            {benchErr && showBench && (
              <div className="fd-bench-err">Benchmark series unavailable — showing fund NAV only</div>
            )}

            {normNav && normNav.length >= 2 ? (
              <CompareGrowthChart
                series={[
                  {
                    name: f.name,
                    color: normNav[normNav.length - 1].v >= normNav[0].v ? '#2e7d32' : '#b71c1c',
                    data: normNav,
                  },
                  ...(normBench
                    ? [
                        {
                          name: benchIdx,
                          color: '#90a4ae',
                          data: normBench,
                          dashed: true,
                        },
                      ]
                    : []),
                ]}
                showLegend={Boolean(normBench)}
              />
            ) : (
              <div className="fd-spark-load">Loading NAV chart history…</div>
            )}
          </div>
        )}

        {/* ── ⑧ RISK ANALYTICS (Pro Only) ────────────────────────────────── */}
        {isPro && (f.vol != null || f.max_dd != null || stress?.beta != null) && (
          <div className="fd-section">
            <div className="fd-section-label">⚡ Risk &amp; Volatility Metrics</div>
            <div className="fd-kpi-grid">
              {f.vol != null && (
                <div className="fd-kpi">
                  <span className="fd-kpi-label">Annualised Volatility</span>
                  <b>{f.vol.toFixed(1)}%</b>
                </div>
              )}
              {f.max_dd != null && (
                <div className="fd-kpi">
                  <span className="fd-kpi-label">Max Drawdown</span>
                  <b className="fd-neg">{f.max_dd.toFixed(1)}%</b>
                </div>
              )}
              {f.ret_per_risk != null && (
                <div className="fd-kpi">
                  <span className="fd-kpi-label">Return-per-Risk Ratio</span>
                  <b>{f.ret_per_risk.toFixed(2)}×</b>
                </div>
              )}
              {stress?.beta != null && (
                <div className="fd-kpi">
                  <span className="fd-kpi-label">Portfolio Beta</span>
                  <b>{stress.beta.toFixed(2)}</b>
                </div>
              )}
              {stress?.std_dev_portfolio != null && (
                <div className="fd-kpi">
                  <span className="fd-kpi-label">Portfolio Std Dev</span>
                  <b>{stress.std_dev_portfolio.toFixed(1)}%</b>
                </div>
              )}
              {stress?.std_dev_benchmark != null && (
                <div className="fd-kpi">
                  <span className="fd-kpi-label">Benchmark Std Dev</span>
                  <b>{stress.std_dev_benchmark.toFixed(1)}%</b>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ⑨ SEBI STRESS TEST & LIQUIDITY (Pro Only) ─────────────────── */}
        {isPro && stress && (
          <div className="fd-section">
            <div className="fd-section-label">🎯 SEBI Stress Test &amp; Liquidity Analysis</div>
            {stress.days_50pct > 20 && (
              <div className="fd-warn" style={{ marginBottom: 14 }}>
                ⚠️ <strong>Liquidity Alert:</strong> This scheme takes <strong>{stress.days_50pct} days</strong> to liquidate 50% of its portfolio under stress.
              </div>
            )}
            <div className="fd-kpi-grid" style={{ marginBottom: 14 }}>
              {stress.aum_cr != null && (
                <div className="fd-kpi">
                  <span className="fd-kpi-label">Scheme AUM</span>
                  <b>₹{Number(stress.aum_cr).toLocaleString('en-IN')} Cr</b>
                </div>
              )}
              {stress.days_25pct != null && (
                <div className="fd-kpi">
                  <span className="fd-kpi-label">Days to Liquidate 25%</span>
                  <b>{stress.days_25pct} days</b>
                </div>
              )}
              {stress.days_50pct != null && (
                <div className="fd-kpi">
                  <span className="fd-kpi-label">Days to Liquidate 50%</span>
                  <b>{stress.days_50pct} days</b>
                </div>
              )}
              {stress.top10_investors_pct != null && (
                <div className="fd-kpi">
                  <span className="fd-kpi-label">Top 10 Investor Share</span>
                  <b>{stress.top10_investors_pct.toFixed(1)}%</b>
                </div>
              )}
              {stress.turnover_ratio != null && (
                <div className="fd-kpi">
                  <span className="fd-kpi-label">Turnover Ratio</span>
                  <b>{stress.turnover_ratio.toFixed(1)}%</b>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ⑩ PORTFOLIO COMPOSITION & VALUATION (Pro Only) ─────────────── */}
        {isPro && stress && (stress.large_cap_pct != null || stress.pe_portfolio != null) && (
          <div className="fd-section">
            <div className="fd-section-label">🏢 Market Cap Allocation &amp; Portfolio PE</div>

            {stress.large_cap_pct != null && (
              <div className="fd-alloc-bars" style={{ marginBottom: 16 }}>
                {[
                  ['Large Cap', stress.large_cap_pct, '#1b5e20'],
                  ['Mid Cap', stress.mid_cap_pct, '#2e7d32'],
                  ['Small Cap', stress.small_cap_pct, '#43a047'],
                  ['Cash & Equiv.', stress.cash_pct, '#90a4ae'],
                ].map(([label, pct, color]) => pct != null && (
                  <div className="fd-alloc-item" key={label}>
                    <div className="fd-alloc-lbl">
                      <span>{label}</span>
                      <b>{pct.toFixed(1)}%</b>
                    </div>
                    <div className="fd-alloc-bg">
                      <div className="fd-alloc-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {stress.pe_portfolio != null && (
              <div className="fd-kpi-grid">
                <div className="fd-kpi">
                  <span className="fd-kpi-label">Portfolio PE</span>
                  <b>{stress.pe_portfolio.toFixed(1)}×</b>
                </div>
                {stress.pe_benchmark != null && (
                  <div className="fd-kpi">
                    <span className="fd-kpi-label">Benchmark PE</span>
                    <b>{stress.pe_benchmark.toFixed(1)}×</b>
                  </div>
                )}
                {stress.pe_benchmark_1ya != null && (
                  <div className="fd-kpi">
                    <span className="fd-kpi-label">Benchmark PE (1Y Ago)</span>
                    <b>{stress.pe_benchmark_1ya.toFixed(1)}×</b>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ⑪ PORTFOLIO HOLDINGS (Pro Only) ─────────────────────────────── */}
        {isPro && (
          <div className="fd-section">
            <HoldingsSection holdingsData={holdingsData} loading={holdingsLoading} schemeName={f.name} />
          </div>
        )}

        {/* ── ⑫ QUICK ACTIONS (Public) ───────────────────────────────────── */}
        <div className="fd-actions">
          <a className="fd-action-btn primary" href={backtestLink()}>
            ⚗ Backtest This Fund
          </a>
          <a className="fd-action-btn" href="/rolling">
            📉 Rolling Returns
          </a>
          {catSlug ? (
            <a className="fd-action-btn" href={`/screener?category=${catSlug}`}>
              🔍 Compare All {shortCat(f.category)} Funds
            </a>
          ) : (
            <a className="fd-action-btn" href="/screener">
              🔍 Back to Mutual Fund Screener
            </a>
          )}
        </div>

      </main>
      <Footer />
    </>
  );
}
