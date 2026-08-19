'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProviderAvatar from '@/components/ProviderAvatar';
import CompareGrowthChart from '@/app/screener/CompareGrowthChart';
import HoldingsSection from '@/app/screener/HoldingsSection';
import { getMFLogo } from '@/lib/providerLogos';
import { shortCat, CURATED_CATEGORIES, categoryToSlug, matchCategory } from '@/app/screener/screenerContent';
import { normalizeSchemeName } from '@/lib/normalizeSchemeName';
import { startCheckout } from '@/lib/checkoutClient';
import '@/app/screener/mf-compare.css';
import './fund-detail.css';

const BENCHMARK_OPTIONS = [
  'BSE 500',
  'BSE SENSEX',
  'BSE 100',
  'BSE 200',
  'BSE NEXT 500',
  'BSE LargeCap',
  'BSE MidCap',
  'BSE SmallCap',
  'BSE 400 MidSmallCap Index',
  'BSE MidSmallCap',
  'BSE LargeMidCap',
  'BSE 250 LargeMidCap 65:35 Index',
  'BSE Arbitrage Rate Index',
  'BSE Liquid Rate Index',
  'BSE India Corporate Bond Index',
  'BSE India 10 Year Sovereign Bond',
  'BSE India 5 Year Sovereign Bond Index',
  'BSE India Government Bill Index',
  'BSE India Government Bond Index',
  'BSE India Sovereign Bond Index',
  'BSE India Bond Index',
  'BSE India Defence',
  'BSE BANKEX',
  'BSE Financial Services',
  'BSE Information Technology',
  'BSE Healthcare',
  'BSE Fast Moving Consumer Goods',
  'BSE India Infrastructure Index',
  'BSE India Manufacturing Index',
  'BSE AUTO',
  'BSE PSU',
  'BSE PSU BANK',
  'BSE CPSE',
  'BSE Energy',
  'BSE REALTY',
  'BSE METAL',
  'BSE Commodities',
  'BSE REITs and InvITs Index',
];

function getDefaultBenchmark(name, category, benchmarkName) {
  const bName = (benchmarkName || '').toLowerCase();
  if (bName) {
    if (bName.includes('midsmall') || bName.includes('mid small') || bName.includes('400')) return 'BSE 400 MidSmallCap Index';
    if (bName.includes('500')) return 'BSE 500';
    if (bName.includes('small')) return 'BSE SmallCap';
    if (bName.includes('mid') && !bName.includes('large')) return 'BSE MidCap';
    if (bName.includes('large') && bName.includes('mid')) return 'BSE LargeMidCap';
    if (bName.includes('next 50') || bName.includes('next50') || bName.includes('next 500')) return 'BSE NEXT 500';
    if (bName.includes('sensex') || bName.includes(' 50')) return 'BSE SENSEX';
    if (bName.includes('100')) return 'BSE LargeCap';
    if (bName.includes('200')) return 'BSE 200';
    if (bName.includes('bank')) return 'BSE BANKEX';
    if (/\b(it|tech|technology|software)\b/i.test(bName)) return 'BSE Information Technology';
    if (bName.includes('pharma') || bName.includes('health')) return 'BSE Healthcare';
    if (bName.includes('fmcg') || bName.includes('consumer')) return 'BSE Fast Moving Consumer Goods';
    if (bName.includes('infra')) return 'BSE India Infrastructure Index';
    if (bName.includes('manufacturing')) return 'BSE India Manufacturing Index';
    if (bName.includes('auto')) return 'BSE AUTO';
    if (bName.includes('defenc') || bName.includes('defense')) return 'BSE India Defence';
    if (bName.includes('psu')) return 'BSE PSU';
    if (bName.includes('realty')) return 'BSE REALTY';
    if (bName.includes('metal')) return 'BSE METAL';
  }

  const text = `${name || ''} ${category || ''}`.toLowerCase();

  // 1. Debt & Liquid Benchmarks
  if (text.includes('liquid') || text.includes('overnight') || text.includes('cash') || text.includes('cblo') || text.includes('treps')) {
    return 'BSE Liquid Rate Index';
  }
  if (text.includes('corporate bond') || text.includes('credit risk') || text.includes('financials bond')) {
    return 'BSE India Corporate Bond Index';
  }
  if (text.includes('10 year') || text.includes('constant duration') || text.includes('gilt') || text.includes('sovereign')) {
    return 'BSE India 10 Year Sovereign Bond';
  }
  if (text.includes('g-sec') || text.includes('treasury') || text.includes('tbill') || text.includes('t-bill') || text.includes('bill') || text.includes('money market')) {
    return 'BSE India Government Bill Index';
  }
  if (text.includes('govt bond') || text.includes('government bond')) {
    return 'BSE India Government Bond Index';
  }
  if (text.includes('short duration') || text.includes('medium duration') || text.includes('long duration') || text.includes('low duration') || text.includes('ultra short') || text.includes('dynamic bond') || text.includes('floater') || text.includes('debt') || text.includes('income')) {
    return 'BSE India Bond Index';
  }

  // 2. Hybrid & Arbitrage Benchmarks
  if (text.includes('arbitrage')) {
    return 'BSE Arbitrage Rate Index';
  }
  if (text.includes('balanced advantage') || text.includes('dynamic asset') || text.includes('aggressive hybrid') || text.includes('multi asset')) {
    return 'BSE 250 LargeMidCap 65:35 Index';
  }
  if (text.includes('conservative hybrid') || text.includes('equity savings')) {
    return 'BSE India Bond Index';
  }

  // 3. Index & ETF Special Categories
  if (text.includes('gold') || text.includes('silver') || text.includes('commodity')) {
    return 'BSE Commodities';
  }
  if (text.includes('reit') || text.includes('invit') || text.includes('real estate')) {
    return 'BSE REITs and InvITs Index';
  }
  if (text.includes('next 50') || text.includes('next50') || text.includes('next 500')) {
    return 'BSE NEXT 500';
  }
  if (text.includes('cpse')) {
    return 'BSE CPSE';
  }

  // 4. Sectoral / Thematic Equity Benchmarks
  if (text.includes('defenc') || text.includes('defense')) return 'BSE India Defence';
  if (text.includes('small cap') || text.includes('smallcap')) return 'BSE SmallCap';
  if (text.includes('mid cap') || text.includes('midcap')) return 'BSE MidCap';
  if (text.includes('bank') || text.includes('finance') || text.includes('financial')) return 'BSE BANKEX';
  if (/\b(it|tech|technology|software)\b/i.test(text)) return 'BSE Information Technology';
  if (text.includes('pharma') || text.includes('health') || text.includes('healthcare')) return 'BSE Healthcare';
  if (text.includes('fmcg') || text.includes('consumer')) return 'BSE Fast Moving Consumer Goods';
  if (text.includes('infra') || text.includes('infrastructure')) return 'BSE India Infrastructure Index';
  if (text.includes('manufacturing')) return 'BSE India Manufacturing Index';
  if (text.includes('auto') || text.includes('automotive')) return 'BSE AUTO';
  if (text.includes('psu bank')) return 'BSE PSU BANK';
  if (text.includes('psu')) return 'BSE PSU';
  if (text.includes('energy') || text.includes('power')) return 'BSE Energy';
  if (text.includes('realty')) return 'BSE REALTY';
  if (text.includes('metal')) return 'BSE METAL';
  if (text.includes('large & mid') || text.includes('large and mid')) return 'BSE LargeMidCap';
  if (text.includes('large cap') || text.includes('largecap')) return 'BSE LargeCap';
  if (text.includes('flexi cap') || text.includes('flexicap') || text.includes('multi cap') || text.includes('multicap')) return 'BSE 500';
  if (text.includes('sensex')) return 'BSE SENSEX';
  if (text.includes('nifty 100') || text.includes('bse 100')) return 'BSE 100';
  if (text.includes('nifty 200') || text.includes('bse 200')) return 'BSE 200';

  // 5. Default fallback for general equity / solution-oriented / FoF
  return 'BSE 500';
}

function formatSettlementText(val) {
  if (!val) return '—';
  const str = String(val).trim();
  if (/^t\+/i.test(str)) {
    return `${str.toUpperCase()} Business Days`;
  }
  return `T+${str} Business Days`;
}

const pctTxt = (v, sign = true) =>
  v == null ? '—' : (sign && v > 0 ? '+' : '') + v.toFixed(1) + '%';

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
  const [openFaq, setOpenFaq] = useState(null);

  // Pro-only state
  const [navPts, setNavPts] = useState(null);
  const [benchPts, setBenchPts] = useState(null);
  const [benchIdx, setBenchIdx] = useState('BSE SENSEX');
  const [showBench, setShowBench] = useState(true);
  const [benchErr, setBenchErr] = useState(false);
  const [chartPeriod, setChartPeriod] = useState('All');
  const [schemeFacts, setSchemeFacts] = useState(null);
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeErr, setUpgradeErr] = useState('');

  const isPaidOrAdmin = Boolean(
    session?.user?.role === 'admin' ||
      session?.user?.role === 'distributor' ||
      session?.user?.plan === 'pro' ||
      session?.user?.plan === 'pro_lifetime' ||
      session?.user?.plan === 'lifetime' ||
      session?.user?.isPro
  );

  // ── 1. Fetch core fund data ───────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    fetch(`/api/fund-detail/${code}`)
      .then(async (r) => {
        if (r.status === 429) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || "You're doing that too fast — please wait a bit and try again.");
        }
        if (!r.ok) throw new Error('Fund not found');
        return r.json();
      })
      .then((d) => {
        setFundData(d);
        if (d?.fund) {
          setBenchIdx(getDefaultBenchmark(d.fund.name, d.fund.category, d.holdings?.benchmarkName));
        }
        setLoading(false);
      })
      .catch((e) => { setError(e.message || 'Failed to load fund data'); setLoading(false); });
  }, [code]);

  // ── 2. Scheme master facts (public) ───────────────────────────────────────
  useEffect(() => {
    getSchemeMasterFacts().then(setSchemeFacts);
  }, []);

  // ── 3. Pro-only fetches ────────────────────────────────────────────────────
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

  }, [isPaidOrAdmin, fundData, code]);

  // Holdings come from the already plan-gated /api/fund-detail response
  // (lib/holdingsLookup.js, called server-side) -- never fetched directly
  // from the public /api/proposal-studio/holdings route here, so a non-Pro
  // visitor's browser never receives full holdings even via direct API
  // inspection. `fundData.holdings` is null for non-Pro responses.
  const holdingsData = fundData?.holdings ?? null;
  const holdingsLoading = loading;

  // ── 4. Benchmark fetch ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isPaidOrAdmin || !showBench) return;
    setBenchErr(false);
    setBenchPts(null);
    fetch(`/api/nifty-tri?index=${encodeURIComponent(benchIdx)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.data?.length) {
          setBenchErr(true);
          // Fall back to BSE 500 if specific benchmark data is unavailable
          if (benchIdx !== 'BSE 500') {
            setBenchIdx('BSE 500');
          }
          return;
        }
        const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
        const pts = d.data
          .map((r) => {
            const [dd, mon, yy] = r.date.split(' ');
            return { t: Date.UTC(+yy, MONTHS[mon], +dd), v: +r.value };
          })
          .filter((p) => isFinite(p.v) && p.v > 0)
          .sort((a, b) => a.t - b.t);
        setBenchPts(pts);
      })
      .catch(() => {
        setBenchErr(true);
        if (benchIdx !== 'BSE 500') {
          setBenchIdx('BSE 500');
        }
      });
  }, [isPaidOrAdmin, benchIdx, showBench]);

  // ── Chart helpers ─────────────────────────────────────────────────────────
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

  // ── Upgrade handler ───────────────────────────────────────────────────────
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

  const f = fundData?.fund;
  const stress = fundData?.stress;
  const isPro = Boolean(fundData?.isPro);

  const masterRec = schemeFacts && f
    ? (schemeFacts.byIsin?.[f.isin]) ||
      (schemeFacts.byAmfiCode?.[code]) ||
      (schemeFacts.byNormName?.[normalizeSchemeName(f.name)]) || null
    : null;

  const catEntry = f ? CURATED_CATEGORIES.find((c) => matchCategory(f.category, c.category)) : null;
  const catExplainer = catEntry?.explainer || null;
  const catSlug = f ? categoryToSlug(f.category) : null;

  function backtestLink() {
    if (!f) return '/backtest';
    try {
      const state = {
        v: 1,
        h: [{ k: 'mf', i: f.code, n: f.name, c: f.category, m: 'sip', mo: 10000, l: 100000, sm: 'default', cs: '' }],
        sd: 1, smo: 'lookback', lb: '10', sdt: '', su: 0, st: 1, bo: 0, b: null,
      };
      const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(state))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return `/backtest?p=${b64}`;
    } catch { return '/backtest'; }
  }

  /* ── Loading ─────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <>
        <Navbar />
        <main className="fd-page">
          <div className="fd-load">Loading fund details…</div>
        </main>
        <Footer />
      </>
    );
  }

  /* ── Error ───────────────────────────────────────────────────────────── */
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
  const { fund: normNav, bench: normBench } = normaliseSeries(
    filteredNav,
    showBench ? filteredBench : null
  );

  // Chart date-range info bar
  const chartFromDate = filteredNav?.length
    ? new Date(filteredNav[0].t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  const chartToDate = filteredNav?.length
    ? new Date(filteredNav[filteredNav.length - 1].t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : null;
  const chartDataPts = filteredNav?.length ?? 0;

  const ageYrs = f.age_years != null ? Math.floor(f.age_years) : null;
  const navFormatted = f.nav != null ? `₹${Number(f.nav).toFixed(4)}` : null;
  const launchDate = f.inception_date
    ? new Date(f.inception_date + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : null;
  // Same AMFI-sourced field (and same formatting) Proposal Studio's Scheme
  // Details table already shows -- see app/proposal-studio/ProposalSections.jsx.
  const aumFormatted = f.aumCr != null
    ? `₹${Number(f.aumCr).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`
    : null;

  const faqItems = [
    {
      q: `What is ${f.name}?`,
      a: <>
        {f.name} is an open-ended {shortCat(f.category)} mutual fund scheme managed by {f.amc}.
        {f.inception_date &&
          ` It was launched in ${new Date(f.inception_date + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}.`}{' '}
        It is categorised under {f.category} as defined by SEBI. Investors can invest via lumpsum or
        systematic investment plans (SIP).
      </>,
    },
    {
      q: `Who manages ${f.name}?`,
      a: <>
        {f.name} is managed and operated by {f.amc}. As a SEBI-regulated mutual fund house in India,{' '}
        {f.amc} employs professional fund managers and quantitative research teams to make asset allocation and security selection decisions
        in accordance with SEBI guidelines and the scheme's SID mandate.
      </>,
    },
    {
      q: `What is the minimum investment in ${f.name}?`,
      a: masterRec?.minPurchase != null
        ? `The minimum initial lumpsum purchase amount for ${f.name} via BSE StAR MF is ₹${Number(masterRec.minPurchase).toLocaleString('en-IN')}.`
        : `Minimum investment limits vary by plan, but most equity mutual funds allow initial lumpsum investments from ₹1,000 to ₹5,000 and monthly SIPs from ₹500.`,
    },
    {
      q: `What is the exit load on ${f.name}?`,
      a: masterRec?.exitLoadText
        ? `Exit load: ${masterRec.exitLoadText}`
        : `Exit load is charged if units are redeemed before a specified holding period (typically 1% for equity funds if redeemed within 1 year). Refer to the official factsheet for exact tier details.`,
    },
    {
      q: `Is ${f.name} suitable for long-term goals?`,
      a: `${f.name} belongs to the ${f.category} category. Equity-oriented funds are designed for long-term wealth accumulation (5+ year horizon), while debt funds suit shorter horizons. Always evaluate your risk tolerance and goal timeline before investing.`,
    },
    {
      q: `How can I view complete analytics & holdings for ${f.name}?`,
      a: `Abundance Pro members get instant access to complete analytics for ${f.name}, including point-to-point CAGR returns (1M to 10Y), interactive NAV history charts with benchmark overlays, SEBI stress test data, and complete 100% portfolio stock disclosures.`,
    },
  ];

  return (
    <>
      <Navbar />
      <main className="fd-page">

        {/* ── ① HERO ────────────────────────────────────────────────────── */}
        <div className="fd-hero">
          <div className="fd-hero-row">
            <div className="fd-hero-logo">
              <ProviderAvatar name={f.amc} logoPath={getMFLogo(f.amc)} size={48} radius={10} />
            </div>
            <div className="fd-hero-info">
              <h1 className="fd-fund-name">{f.name}</h1>
              <div className="fd-hero-tags">
                <span className="fd-tag">{f.amc}</span>
                <span className="fd-tag green">{shortCat(f.category)}</span>
                <span className="fd-tag">{f.structure}</span>
                {f.isin && <span className="fd-tag mono">{f.isin}</span>}
              </div>
            </div>
          </div>

          {/* NAV stats strip */}
          <div className="fd-hero-stats">
            {navFormatted && (
              <div className="fd-stat-item">
                <div className="fd-stat-label">Current NAV</div>
                <div className="fd-stat-val">{navFormatted}</div>
                {f.asof && <div className="fd-stat-sub">as of {f.asof}</div>}
              </div>
            )}
            {aumFormatted && (
              <div className="fd-stat-item">
                <div className="fd-stat-label">AUM</div>
                <div className="fd-stat-val" style={{ fontFamily: 'Raleway, sans-serif', fontSize: '.88rem' }}>
                  {aumFormatted}
                </div>
                {f.aumAsOf && <div className="fd-stat-sub">as of {f.aumAsOf}</div>}
              </div>
            )}
            {launchDate && (
              <div className="fd-stat-item">
                <div className="fd-stat-label">Launched</div>
                <div className="fd-stat-val" style={{ fontFamily: 'Raleway, sans-serif', fontSize: '.88rem' }}>
                  {launchDate}
                </div>
                {ageYrs && <div className="fd-stat-sub">{ageYrs} years ago</div>}
              </div>
            )}
            {masterRec?.minPurchase != null && (
              <div className="fd-stat-item">
                <div className="fd-stat-label">Min Investment</div>
                <div className="fd-stat-val" style={{ fontFamily: 'Raleway, sans-serif', fontSize: '.88rem' }}>
                  ₹{Number(masterRec.minPurchase).toLocaleString('en-IN')}
                </div>
                <div className="fd-stat-sub">lumpsum</div>
              </div>
            )}
            {masterRec?.rta && (
              <div className="fd-stat-item">
                <div className="fd-stat-label">RTA</div>
                <div
                  className="fd-stat-val"
                  style={{
                    fontFamily: 'Raleway, sans-serif',
                    fontSize: '.85rem',
                    color: masterRec.rta === 'CAMS' ? '#1565c0' : masterRec.rta === 'KFINTECH' ? '#6a1b9a' : 'var(--text)',
                  }}
                >
                  {masterRec.rta}
                </div>
              </div>
            )}
          </div>

          {f.flag === 'check' && (
            <div className="fd-warn">
              ⚠ One or more metrics look unusual for this scheme — we are reviewing the source data.
            </div>
          )}
        </div>

        {/* ── ② ABOUT CATEGORY (Public) ─────────────────────────────────── */}
        {catExplainer && (
          <div className="fd-section">
            <div className="fd-section-head">
              <div className="fd-section-icon">📖</div>
              <span className="fd-section-title">About This SEBI Category</span>
              <span className="fd-section-sub">{shortCat(f.category)}</span>
            </div>
            <p className="fd-explainer">{catExplainer}</p>
          </div>
        )}

        {/* ── ③ OPERATIONAL FACTS (Public) ──────────────────────────────── */}
        {masterRec && (
          <div className="fd-section">
            <div className="fd-section-head">
              <div className="fd-section-icon">📋</div>
              <span className="fd-section-title">Key Scheme Facts</span>
              <span className="fd-section-sub">via BSE StAR MF</span>
            </div>

            {(masterRec.purchaseAllowed === false || masterRec.redemptionAllowed === false) && (
              <div className="fd-warn" style={{ marginBottom: 16 }}>
                ⚠️{' '}
                {masterRec.purchaseAllowed === false && masterRec.redemptionAllowed === false
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
                  {masterRec.minPurchase != null
                    ? `₹${Number(masterRec.minPurchase).toLocaleString('en-IN')}`
                    : '—'}
                </div>
              </div>
              <div className="fd-ops-item">
                <div className="fd-ops-label">RTA Agent</div>
                <div
                  className="fd-ops-val"
                  style={{
                    color:
                      masterRec.rta === 'CAMS'
                        ? '#1565c0'
                        : masterRec.rta === 'KFINTECH'
                        ? '#6a1b9a'
                        : 'var(--text)',
                  }}
                >
                  {masterRec.rta || '—'}
                </div>
              </div>
              <div className="fd-ops-item">
                <div className="fd-ops-label">NAV Cutoff</div>
                <div className="fd-ops-val">{masterRec.redeemCutoff || masterRec.purchaseCutoff || '—'}</div>
              </div>
              <div className="fd-ops-item">
                <div className="fd-ops-label">Settlement</div>
                <div className="fd-ops-val">
                  {formatSettlementText(masterRec.settlement)}
                </div>
              </div>
            </div>

            {masterRec.exitLoadText && (
              <div className="fd-exit-load-box">
                <div className="fd-ops-label">Exit Load Structure</div>
                <div className="fd-exit-load-val">
                  {masterRec.exitLoadConfidence === 'high' && Array.isArray(masterRec.exitLoadTiers)
                    ? masterRec.exitLoadTiers.length === 0
                      ? '0% — No exit load'
                      : masterRec.exitLoadTiers
                          .map(
                            (t) =>
                              `${(t.rate * 100).toFixed(2).replace(/\.00$/, '')}% if redeemed within ${Math.round(t.days / 30.44)} months`
                          )
                          .join(' · ')
                    : masterRec.exitLoadText}
                </div>
              </div>
            )}

            <div className="fd-badge-row">
              {masterRec.sip === true && <span className="fd-badge green">✓ SIP Available</span>}
              {masterRec.swp === true && <span className="fd-badge green">✓ SWP Eligible</span>}
              {masterRec.switchAllowed === true && <span className="fd-badge green">✓ Switch Available</span>}
              {masterRec.divReinvest === true && <span className="fd-badge green">✓ IDCW Reinvestment</span>}
              <span className="fd-badge">Demat &amp; SOA</span>
            </div>
          </div>
        )}

        {/* Operational Facts Section ends here, FAQ moved to bottom */}

        {/* ── ⑤ UPGRADE GATE (Non-Pro) ──────────────────────────────────── */}
        {!isPro && (
          <div className="fd-gate-panel">
            <div className="fd-gate-crown">👑 Abundance Pro Feature</div>
            <div className="fd-gate-title">Unlock Full Fund Analytics &amp; Holdings</div>
            <div className="fd-gate-subtitle">
              Get institutional-grade analysis for every mutual fund in India.
            </div>
            <ul className="fd-gate-features">
              <li>Returns across 1M, 3M, 6M, 1Y, 3Y, 5Y, 7Y, 10Y &amp; since inception</li>
              <li>Interactive NAV history chart with BSE benchmark overlays</li>
              <li>SEBI stress test &amp; liquidity analysis (days to liquidate 25%/50%)</li>
              <li>Complete security-level holdings with sector weightages</li>
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

        {/* ── ⑥ RETURNS DASHBOARD (Pro) ─────────────────────────────────── */}
        {isPro && (
          <div className="fd-section">
            <div className="fd-section-head">
              <div className="fd-section-icon">📈</div>
              <span className="fd-section-title">Fund Returns</span>
              <span className="fd-section-sub">Point-to-point CAGR</span>
            </div>
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
                ['Since Inception', f.ret_inception, true],
              ].map(([label, val, annualised]) => (
                <div className="fd-ret-card" key={label}>
                  <div className="fd-ret-label">{label}</div>
                  <div className={`fd-ret-val ${cls(val)}`}>{pctTxt(val)}</div>
                  {val != null && (
                    <div className="fd-ret-type">{annualised ? 'CAGR' : 'Absolute'}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ⑦ NAV CHART + BENCHMARK (Pro) ────────────────────────────── */}
        {isPro && (
          <div className="fd-section">
            <div className="fd-section-head">
              <div className="fd-section-icon">📊</div>
              <span className="fd-section-title">NAV Growth &amp; Benchmark Overlay</span>
              <span className="fd-section-sub">Base 100 normalised</span>
            </div>

            {/* Period segmented control + benchmark selector */}
            <div className="fd-chart-controls">
              {/* Segmented pill group */}
              <div className="fd-period-group">
                {['1Y', '3Y', '5Y', 'All'].map((p) => (
                  <button
                    key={p}
                    className={`fd-period-pill${chartPeriod === p ? ' active' : ''}`}
                    onClick={() => setChartPeriod(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="fd-chart-spacer" />
              {/* Benchmark controls */}
              <div className="fd-benchmark-controls">
                <select
                  className="fd-benchmark-select"
                  value={benchIdx}
                  onChange={(e) => { setBenchIdx(e.target.value); setShowBench(true); }}
                >
                  {BENCHMARK_OPTIONS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
                <button
                  className={`fd-toggle-pill${showBench ? ' active' : ''}`}
                  onClick={() => setShowBench((s) => !s)}
                >
                  Benchmark
                </button>
              </div>
            </div>

            {/* Date range info bar */}
            {chartFromDate && (
              <div className="fd-chart-info-bar">
                <span className="fd-chart-info-label">
                  {chartPeriod === 'All' ? 'Full history' : `Last ${chartPeriod}`}
                  {normBench && showBench && ` · vs ${benchIdx}`}
                </span>
                <div className="fd-chart-info-dates">
                  <span>{chartFromDate}</span>
                  <span className="fd-chart-date-sep">→</span>
                  <span>{chartToDate}</span>
                  <span className="fd-chart-date-sep">·</span>
                  <span>{chartDataPts} data points</span>
                </div>
              </div>
            )}

            {benchErr && showBench && (
              <div className="fd-bench-err">
                Benchmark data unavailable for {benchIdx} — showing fund NAV only
              </div>
            )}

            {normNav && normNav.length >= 2 ? (
              <CompareGrowthChart
                series={[
                  {
                    name: f.name,
                    color: (normNav && normNav.length >= 2 && normNav[normNav.length - 1]?.v >= normNav[0]?.v) ? '#2e7d32' : '#b71c1c',
                    data: normNav,
                  },
                  ...(normBench
                    ? [{ name: benchIdx, color: '#90a4ae', data: normBench, dashed: true }]
                    : []),
                ]}
                showLegend={Boolean(normBench)}
              />
            ) : (
              <div className="fd-spark-load">Loading NAV history…</div>
            )}
          </div>
        )}

        {/* ── ⑧ RISK ANALYTICS (Pro) ────────────────────────────────────── */}
        {isPro && (f.vol != null || f.max_dd != null || stress?.beta != null) && (
          <div className="fd-section">
            <div className="fd-section-head">
              <div className="fd-section-icon">⚡</div>
              <span className="fd-section-title">Risk &amp; Volatility</span>
              <span className="fd-section-sub">3-year window</span>
            </div>
            <div className="fd-kpi-grid">
              {f.vol != null && (
                <div className="fd-kpi">
                  <span className="fd-kpi-label">Annualised Volatility</span>
                  <b>{f.vol.toFixed(1)}%</b>
                </div>
              )}
              {f.max_dd != null && (
                <div className="fd-kpi red">
                  <span className="fd-kpi-label">Max Drawdown</span>
                  <b>{f.max_dd.toFixed(1)}%</b>
                </div>
              )}
              {f.ret_per_risk != null && (
                <div className="fd-kpi green">
                  <span className="fd-kpi-label">Return-per-Risk</span>
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

        {/* ── ⑨ SEBI STRESS TEST (Pro) ──────────────────────────────────── */}
        {isPro && stress && (
          <div className="fd-section">
            <div className="fd-section-head">
              <div className="fd-section-icon">🎯</div>
              <span className="fd-section-title">SEBI Stress Test &amp; Liquidity</span>
              <span className="fd-section-sub">{stress.month || ''}</span>
            </div>

            {stress.days_50pct > 20 && (
              <div className="fd-liquidity-alert">
                ⚠ <span>
                  <strong>Liquidity Alert:</strong> This scheme takes{' '}
                  <strong>{stress.days_50pct} days</strong> to liquidate 50% of its portfolio under stress conditions.
                </span>
              </div>
            )}

            <div className="fd-kpi-grid">
              {stress.aum_cr != null && (
                <div className="fd-kpi">
                  <span className="fd-kpi-label">Scheme AUM</span>
                  <b>₹{Number(stress.aum_cr).toLocaleString('en-IN')} Cr</b>
                </div>
              )}
              {stress.days_25pct != null && (
                <div className={`fd-kpi${stress.days_25pct > 15 ? ' warn' : ' green'}`}>
                  <span className="fd-kpi-label">Days to Liquidate 25%</span>
                  <b>{stress.days_25pct} days</b>
                </div>
              )}
              {stress.days_50pct != null && (
                <div className={`fd-kpi${stress.days_50pct > 20 ? ' red' : ' green'}`}>
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
                  <span className="fd-kpi-label">Portfolio Turnover</span>
                  <b>{stress.turnover_ratio.toFixed(1)}%</b>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ⑩ MARKET CAP ALLOCATION & PE (Pro) ───────────────────────── */}
        {isPro && stress && (stress.large_cap_pct != null || stress.pe_portfolio != null) && (
          <div className="fd-section">
            <div className="fd-section-head">
              <div className="fd-section-icon">🏢</div>
              <span className="fd-section-title">Portfolio Composition &amp; Valuation</span>
            </div>

            {stress.large_cap_pct != null && (
              <div className="fd-alloc-bars">
                {[
                  ['Large Cap', stress.large_cap_pct, '#1b5e20'],
                  ['Mid Cap', stress.mid_cap_pct, '#2e7d32'],
                  ['Small Cap', stress.small_cap_pct, '#43a047'],
                  ['Cash &amp; Equiv.', stress.cash_pct, '#90a4ae'],
                ].map(
                  ([label, pct, color]) =>
                    pct != null && (
                      <div className="fd-alloc-item" key={label}>
                        <div className="fd-alloc-lbl">
                          <span dangerouslySetInnerHTML={{ __html: label }} />
                          <b>{pct.toFixed(1)}%</b>
                        </div>
                        <div className="fd-alloc-bg">
                          <div
                            className="fd-alloc-fill"
                            style={{ width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: color }}
                          />
                        </div>
                      </div>
                    )
                )}
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
                    <span className="fd-kpi-label">Benchmark PE (Current)</span>
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

        {/* ── ⑪ HOLDINGS (Pro) ──────────────────────────────────────────── */}
        {/* No fd-section-head wrapper here (unlike other sections) --
            HoldingsSection renders its own title + accurate all-asset-class
            "Total Holdings" count, so a second outer title would either
            duplicate it or (as it did before) drift out of sync, since the
            outer copy couldn't see per-asset-class composition. Matches the
            SIF detail page's pattern for the same component. */}
        {isPro && (
          <div className="fd-section">
            <HoldingsSection holdingsData={holdingsData} loading={holdingsLoading} schemeName={f.name} />
          </div>
        )}

        {/* ── ⑫ FREQUENTLY ASKED QUESTIONS (Public - Bottom for SEO) ─────── */}
        <div className="fd-section">
          <div className="fd-section-head">
            <div className="fd-section-icon">❓</div>
            <span className="fd-section-title">Frequently Asked Questions</span>
          </div>
          <div className="fd-faq-list">
            {faqItems.map((item, i) => (
              <div className={`fd-faq-item${openFaq === i ? ' open' : ''}`} key={i}>
                <button className="fd-faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{item.q}</span>
                  <span className="fd-faq-icon" aria-hidden="true">{openFaq === i ? '−' : '+'}</span>
                </button>
                {openFaq === i && <div className="fd-faq-answer"><p>{item.a}</p></div>}
              </div>
            ))}
          </div>
        </div>

        {/* ── ⑫ QUICK ACTIONS ───────────────────────────────────────────── */}
        <div className="fd-actions">
          <a className="fd-action-btn primary" href={backtestLink()}>
            ⚗ Backtest This Fund
          </a>
          <a className="fd-action-btn" href="/rolling">
            📉 Rolling Returns
          </a>
          {catSlug ? (
            <a className="fd-action-btn" href={`/screener?category=${catSlug}`}>
              🔍 Compare {shortCat(f.category)} Funds
            </a>
          ) : (
            <a className="fd-action-btn" href="/screener">
              🔍 Back to Screener
            </a>
          )}
        </div>

      </main>
      <Footer />
    </>
  );
}
