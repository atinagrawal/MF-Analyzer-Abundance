'use client';

import { useState, useEffect, useMemo } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProviderAvatar from '@/components/ProviderAvatar';
import { getSIFLogo } from '@/lib/providerLogos';
import CompareGrowthChart from '@/app/screener/CompareGrowthChart';
import HoldingsSection from '@/app/screener/HoldingsSection';
import './sif-detail.css';

const SIF_STRATEGY_LABELS = {
  'Equity Oriented Investment Strategies - Equity Ex-Top 100 Long-Short Fund': 'Equity Ex-Top 100 Long-Short',
  'Equity Oriented Investment Strategies - Equity Long-Short Fund': 'Equity Long-Short',
  'Hybrid Investment Strategies - Active Asset Allocator Long-Short Fund': 'Active Asset Allocator Long-Short',
  'Hybrid Investment Strategies - Hybrid Long-Short Fund': 'Hybrid Long-Short',
};

const BENCH_OPTIONS = [
  { value: 'BSE MidCap',                       label: 'BSE MidCap' },
  { value: 'BSE SmallCap',                     label: 'BSE SmallCap' },
  { value: 'BSE 250 LargeMidCap 65:35 Index', label: 'BSE 250 LargeMidCap 65:35' },
  { value: 'BSE 500',                          label: 'BSE 500' },
  { value: 'BSE Arbitrage Rate Index',          label: 'BSE Arbitrage Index' },
  { value: 'BSE Liquid Rate Index',             label: 'BSE Liquid Rate Index' },
  { value: 'BSE India Corporate Bond Index',    label: 'BSE Corporate Bond' },
  { value: 'BSE India 10 Year Sovereign Bond',  label: 'BSE 10Y Sovereign Bond' },
];

const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };

function sifStratShort(cat) {
  return SIF_STRATEGY_LABELS[cat] || cat?.split(' - ')[1] || cat || 'Specialised Strategy';
}

function sifDefaultBench(cat) {
  const c = (cat || '').toLowerCase();
  if (c.includes('ex-top 100') || c.includes('ex top 100')) return 'BSE MidCap';
  if (c.includes('arbitrage')) return 'BSE Arbitrage Rate Index';
  if (c.includes('liquid'))    return 'BSE Liquid Rate Index';
  return 'BSE 250 LargeMidCap 65:35 Index';
}

const pct = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%');

function backtestLink(s) {
  try {
    const state = {
      v: 1,
      h: [{ k: 'sif', i: s.scheme_id, n: s.nav_name, c: sifStratShort(s.category), m: 'sip', mo: 10000, l: 100000, sm: 'default', cs: '' }],
      sd: 1, smo: 'lookback', lb: '3', sdt: '', su: 0, st: 0, bo: 0, b: null,
    };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(state))))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `/backtest?p=${b64}`;
  } catch { return '/backtest'; }
}

export default function SifDetailClient({ id }) {
  const [sif,           setSif]           = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState('');
  const [navPts,        setNavPts]        = useState(null);
  const [benchPts,      setBenchPts]      = useState(null);
  const [histLoading,   setHistLoading]   = useState(true);
  const [holdingsData,  setHoldingsData]  = useState(null);
  const [holdingsLoad,  setHoldingsLoad]  = useState(true);
  const [copied,        setCopied]        = useState(false);
  const [openFaq,       setOpenFaq]       = useState(null);
  const [benchIdx,      setBenchIdx]      = useState('BSE 250 LargeMidCap 65:35 Index');
  const [chartPeriod,   setChartPeriod]   = useState('All');
  const [chartMode,     setChartMode]     = useState('reindexed');

  // 1. Fetch SIF data
  useEffect(() => {
    setLoading(true); setError('');
    fetch(`/api/sif-detail/${encodeURIComponent(id)}`)
      .then((r) => { if (!r.ok) throw new Error('SIF not found'); return r.json(); })
      .then((d) => {
        setSif(d.scheme);
        setBenchIdx(sifDefaultBench(d.scheme?.category));
        setLoading(false);
      })
      .catch((e) => { setError(e.message || 'Failed to load SIF'); setLoading(false); });
  }, [id]);

  // 2. Holdings + NAV history
  useEffect(() => {
    if (!sif) return;
    setHoldingsLoad(true);
    fetch(`/api/proposal-studio/holdings?amfiCode=${encodeURIComponent(sif.scheme_id)}&schemeName=${encodeURIComponent(sif.nav_name)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setHoldingsData)
      .catch(() => {})
      .finally(() => setHoldingsLoad(false));

    setHistLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const from  = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
    fetch(`/api/sif-history?sd_id=${encodeURIComponent(sif.scheme_id)}&from=${from}&to=${today}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.records?.length) {
          setNavPts(
            d.records
              .map((r) => ({ t: new Date(r.date).getTime(), v: +r.nav }))
              .filter((p) => isFinite(p.v))
              .sort((a, b) => a.t - b.t)
          );
        }
        setHistLoading(false);
      })
      .catch(() => setHistLoading(false));
  }, [sif]);

  // 3. Benchmark series (re-fetches when benchIdx changes)
  useEffect(() => {
    if (!sif) return;
    setBenchPts(null);
    fetch(`/api/nifty-tri?index=${encodeURIComponent(benchIdx)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.data?.length) {
          setBenchPts(
            d.data
              .map((r) => {
                const [dd, mon, yy] = r.date.split(' ');
                return { t: Date.UTC(+yy, MONTHS[mon], +dd), v: Number(r.value) };
              })
              .filter((p) => !isNaN(p.t) && isFinite(p.v) && p.v > 0)
              .sort((a, b) => a.t - b.t)
          );
        }
      })
      .catch(() => {});
  }, [sif, benchIdx]);

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Derived: clean name
  const cleanName = sif ? sif.nav_name.replace(/\s*-\s*(Regular Plan|Regular).*/i, '').trim() : '';
  const fam = sif?.category?.startsWith('Equity') ? 'equity' : 'hybrid';

  // Period-filtered nav/bench
  const PERIOD_MS = { '1M': 30.44, '3M': 91.31, '6M': 182.62, '1Y': 365.25 };
  const filtered = (pts) => {
    if (!pts || chartPeriod === 'All') return pts;
    const cutoff = Date.now() - PERIOD_MS[chartPeriod] * 86400000;
    return pts.filter((p) => p.t >= cutoff);
  };

  const fNav   = useMemo(() => filtered(navPts),   [navPts, chartPeriod]);
  const fBench = useMemo(() => filtered(benchPts), [benchPts, chartPeriod]);

  const chartSeries = useMemo(() => {
    if (!fNav || fNav.length < 2) return null;
    if (chartMode === 'raw') {
      return [{ name: cleanName || 'SIF NAV', color: fNav.at(-1).v >= fNav[0].v ? '#2e7d32' : '#c62828', data: fNav }];
    }
    // Reindexed to ₹10,000
    const baseT  = Math.max(fNav[0].t, fBench?.[0]?.t ?? fNav[0].t);
    const navSlice = fNav.filter((p) => p.t >= baseT);
    const navBase  = navSlice[0]?.v;
    if (!navBase) return null;
    const series = [{ name: cleanName, color: '#1b5e20', data: navSlice.map((p) => ({ t: p.t, v: (p.v / navBase) * 10000 })) }];
    if (fBench?.length >= 2) {
      const bSlice = fBench.filter((p) => p.t >= baseT);
      const bBase  = bSlice[0]?.v;
      if (bBase) series.push({ name: benchIdx.split(' ').slice(0, 3).join(' '), color: '#0288d1', data: bSlice.map((p) => ({ t: p.t, v: (p.v / bBase) * 10000 })) });
    }
    return series;
  }, [fNav, fBench, chartMode, cleanName, benchIdx]);

  /* ── Loading ── */
  if (loading) return (
    <>
      <Navbar activePage="sif" />
      <div className="sif-page"><div className="sif-load">Loading Specialised Investment Fund details…</div></div>
      <Footer />
    </>
  );

  /* ── Error ── */
  if (error || !sif) return (
    <>
      <Navbar activePage="sif" />
      <div className="sif-page">
        <div className="sif-err">{error || 'SIF scheme not found.'}<a href="/sifs">← Return to SIF Screener</a></div>
      </div>
      <Footer />
    </>
  );

  return (
    <>
      <Navbar activePage="sif" />
      <div className="sif-page">

        {/* Breadcrumb */}
        <div className="sif-breadcrumb">
          <a href="/">Home</a> / <a href="/sifs">SIF Screener</a> / <strong style={{ color: 'var(--text)' }}>{cleanName}</strong>
        </div>

        {/* Hero */}
        <div className="sif-hero">
          <div className="sif-hero-row">
            <div className="sif-hero-logo">
              <ProviderAvatar name={sif.sif_name} logoPath={getSIFLogo(sif.sif_name)} size={36} radius={8} />
            </div>
            <div className="sif-hero-content">
              <h1 className="sif-hero-title">{cleanName}</h1>
              <div className="sif-hero-tags">
                <span className="sif-tag house">{sif.sif_name}</span>
                <span className={`sif-strat-badge sif-strat-badge-${fam}`}>{sifStratShort(sif.category)}</span>
                <span className="sif-tag sebi">SEBI SIF</span>
                <span className="sif-tag code">{sif.scheme_id}</span>
              </div>
              <div className="sif-hero-actions">
                <a href={backtestLink(sif)} className="sif-btn primary">⚗ Backtest Strategy</a>
                <button onClick={copyLink} className="sif-btn">
                  {copied ? '✓ Copied!' : '🔗 Share'}
                </button>
                <a href="/sifs" className="sif-btn">📋 SIF Screener</a>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="sif-kpi-grid">
          {[
            { lbl: 'Latest NAV',       val: sif.nav != null ? `₹${Number(sif.nav).toFixed(4)}` : '—', sub: `As of ${sif.nav_date || sif.asof}` },
            { lbl: '1M Return',        val: pct(sif.ret_1m),        sub: 'Absolute',      color: sif.ret_1m  },
            { lbl: '3M Return',        val: pct(sif.ret_3m),        sub: 'Absolute',      color: sif.ret_3m  },
            { lbl: '6M Return',        val: pct(sif.ret_6m),        sub: 'Absolute',      color: sif.ret_6m  },
            { lbl: 'Since Inception',  val: pct(sif.ret_inception), sub: 'Total return',  color: sif.ret_inception },
            { lbl: 'Volatility',       val: sif.vol   != null ? `${sif.vol.toFixed(1)}%`    : '—', sub: 'Annualised' },
            { lbl: 'Max Drawdown',     val: sif.max_dd != null ? `${sif.max_dd.toFixed(1)}%`  : '—', sub: 'Peak to trough', forceColor: '#c62828' },
            { lbl: 'Ret / Risk',       val: sif.ret_per_risk != null ? sif.ret_per_risk.toFixed(2) : '—', sub: 'Sharpe proxy' },
          ].map(({ lbl, val, sub, color, forceColor }) => (
            <div className="sif-kpi-card" key={lbl}>
              <span className="sif-kpi-lbl">{lbl}</span>
              <span className="sif-kpi-val" style={{ color: forceColor || (color > 0 ? '#2e7d32' : color < 0 ? '#c62828' : 'inherit') }}>
                {val}
              </span>
              <span className="sif-kpi-sub">{sub}</span>
            </div>
          ))}
        </div>

        {/* SEBI Notice */}
        <div className="sif-notice-card">
          <div className="sif-notice-icon">ⓘ</div>
          <div className="sif-notice-body">
            <strong>SEBI Specialised Investment Fund (SIF):</strong> A new SEBI-regulated asset class (2024-25) bridging mutual funds and PMS/AIFs, with a minimum investment of <strong>₹10 Lakhs</strong> per investor.
          </div>
        </div>

        {/* NAV Chart Card */}
        <div className="sif-card">
          {/* Top row: title + benchmark selector */}
          <div className="sif-chart-header">
            <span className="sif-chart-title">📈 NAV Growth &amp; Benchmark</span>
            <div className="sif-chart-bench-wrap">
              <span className="sif-chart-bench-lbl">vs.</span>
              <select className="sif-chart-bench-select" value={benchIdx} onChange={(e) => setBenchIdx(e.target.value)}>
                {BENCH_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Toolbar: period chips + mode buttons */}
          <div className="sif-chart-toolbar">
            <div className="sif-period-btns">
              {['1M', '3M', '6M', '1Y', 'All'].map((p) => (
                <button key={p} className={`sif-period-btn${chartPeriod === p ? ' active' : ''}`} onClick={() => setChartPeriod(p)}>
                  {p}
                </button>
              ))}
            </div>
            <div className="sif-mode-btns">
              <button className={`sif-mode-btn${chartMode === 'reindexed' ? ' active' : ''}`} onClick={() => setChartMode('reindexed')}>
                Growth of ₹10k
              </button>
              <button className={`sif-mode-btn${chartMode === 'raw' ? ' active' : ''}`} onClick={() => setChartMode('raw')}>
                Raw NAV
              </button>
            </div>
          </div>

          {histLoading ? (
            <div className="sif-load">Fetching NAV history…</div>
          ) : !chartSeries ? (
            <div className="sif-err" style={{ padding: '32px 0' }}>
              NAV history is populating as daily NAVs are recorded.
            </div>
          ) : (
            <CompareGrowthChart series={chartSeries} showLegend={true} />
          )}
        </div>

        {/* Strategy Facts */}
        <div className="sif-card">
          <div className="sif-card-h">🏢 Strategy &amp; Fund Facts</div>
          <div className="sif-facts-grid">
            {[
              { lbl: 'Fund House / AMC',    val: sif.sif_name },
              { lbl: 'Strategy Category',   val: sif.category },
              { lbl: 'Scheme ID',           val: sif.scheme_id },
              { lbl: 'Min. Investment',     val: '₹10 Lakhs (SEBI mandated)' },
              { lbl: 'Asset Family',        val: fam.charAt(0).toUpperCase() + fam.slice(1) + ' Strategy' },
              { lbl: 'Inception Date',      val: sif.inception_date || '2024–25 (SEBI Launch)' },
            ].map(({ lbl, val }) => (
              <div className="sif-fact-item" key={lbl}>
                <span className="sif-fact-lbl">{lbl}</span>
                <span className="sif-fact-val">{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Holdings */}
        <HoldingsSection holdingsData={holdingsData} loading={holdingsLoad} schemeName={sif.nav_name} />

        {/* FAQs */}
        <div className="sif-card">
          <div className="sif-card-h">❓ Frequently Asked Questions</div>
          <div className="sif-faq-list">
            {[
              {
                q: 'What is a SEBI Specialised Investment Fund (SIF)?',
                a: 'SIFs are SEBI-regulated investment products introduced in 2024–25 to bridge the gap between Mutual Funds (₹100 minimum) and Portfolio Management Services (₹50 Lakhs minimum). They allow asset managers to run specialized long-short and unconstrained strategies with a ₹10 Lakh minimum.',
              },
              {
                q: `What strategy does ${cleanName} follow?`,
                a: `${cleanName} follows the "${sif.category}" mandate, managed by ${sif.sif_name}. It combines active security selection with hedging or tactical derivative exposure techniques as defined under SEBI SIF guidelines.`,
              },
              {
                q: 'Why are 3Y / 5Y returns blank?',
                a: 'SIFs were launched in 2024–25. Longer-duration return metrics (3Y, 5Y) will populate automatically as the fund builds a multi-year NAV track record.',
              },
            ].map((item, i) => (
              <div className="sif-faq-item" key={i}>
                <button className="sif-faq-q" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{item.q}</span>
                  <span>{openFaq === i ? '▲' : '▼'}</span>
                </button>
                {openFaq === i && <div className="sif-faq-a">{item.a}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Compliance */}
        <div className="sif-compliance">
          Abundance Financial Services · AMFI Registered Mutual Fund Distributor (ARN-251838)<br />
          Data sourced from AMFI India. Investments are subject to market risks; read all scheme documents carefully.
        </div>

      </div>
      <Footer />
    </>
  );
}
