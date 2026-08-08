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

function sifStratShort(cat) {
  return SIF_STRATEGY_LABELS[cat] || cat?.split(' - ')[1] || cat || 'Specialised Strategy';
}

const pctTxt = (v) => (v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%');

function backtestSifLink(s) {
  try {
    const state = { v: 1, h: [{ k: 'sif', i: s.scheme_id, n: s.nav_name, c: sifStratShort(s.category), m: 'sip', mo: 10000, l: 100000, sm: 'default', cs: '' }], sd: 1, smo: 'lookback', lb: '3', sdt: '', su: 0, st: 0, bo: 0, b: null };
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(state)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `/backtest?p=${b64}`;
  } catch (e) { return '/backtest'; }
}

export default function SifDetailClient({ id }) {
  const [sif, setSif] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [navPts, setNavPts] = useState(null);
  const [benchPts, setBenchPts] = useState(null);
  const [histLoading, setHistLoading] = useState(true);
  const [holdingsData, setHoldingsData] = useState(null);
  const [holdingsLoading, setHoldingsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);

  const [benchIdx, setBenchIdx] = useState('BSE 250 LargeMidCap 65:35 Index');
  const [chartPeriod, setChartPeriod] = useState('All');
  const [chartMode, setChartMode] = useState('reindexed'); // 'reindexed' | 'raw'

  // 1. Fetch SIF Record
  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/api/sif-detail/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!r.ok) throw new Error('SIF scheme not found');
        return r.json();
      })
      .then((d) => {
        setSif(d.scheme);
        if (/arbitrage/i.test(d.scheme?.category || '')) setBenchIdx('BSE Arbitrage Rate Index');
        else if (/liquid/i.test(d.scheme?.category || '')) setBenchIdx('BSE Liquid Rate Index');
        else setBenchIdx('BSE 250 LargeMidCap 65:35 Index');
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message || 'Failed to load SIF scheme');
        setLoading(false);
      });
  }, [id]);

  // 2. Fetch Holdings & NAV History
  useEffect(() => {
    if (!sif) return;

    // Holdings
    setHoldingsLoading(true);
    fetch(`/api/proposal-studio/holdings?amfiCode=${encodeURIComponent(sif.scheme_id)}&schemeName=${encodeURIComponent(sif.nav_name)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setHoldingsData(d))
      .catch(() => {})
      .finally(() => setHoldingsLoading(false));

    // NAV History
    setHistLoading(true);
    const today = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);

    fetch(`/api/sif-history?sd_id=${encodeURIComponent(sif.scheme_id)}&from=${from}&to=${today}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.records?.length) {
          const pts = d.records
            .map((r) => ({ t: new Date(r.date).getTime(), v: +r.nav }))
            .filter((p) => isFinite(p.v))
            .sort((a, b) => a.t - b.t);
          setNavPts(pts);
        }
        setHistLoading(false);
      })
      .catch(() => setHistLoading(false));
  }, [sif]);

  // 3. Fetch Benchmark Series when benchIdx changes
  useEffect(() => {
    if (!sif) return;
    setBenchPts(null);
    fetch(`/api/nifty-tri?index=${encodeURIComponent(benchIdx)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.data?.length) {
          const MONTHS = { Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5, Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11 };
          const bPts = d.data
            .map((r) => {
              const [dd, mon, yy] = r.date.split(' ');
              return { t: Date.UTC(+yy, MONTHS[mon], +dd), v: Number(r.value) };
            })
            .filter((p) => !isNaN(p.t) && isFinite(p.v) && p.v > 0)
            .sort((a, b) => a.t - b.t);
          setBenchPts(bPts);
        }
      })
      .catch(() => {});
  }, [sif, benchIdx]);

  const copyShareLink = () => {
    if (typeof window === 'undefined') return;
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const cleanName = sif ? sif.nav_name.replace(/\s*-\s*(Regular Plan|Regular).*/i, '').trim() : '';

  // Filter NAV and Benchmark series by selected chart period
  const filteredNavPts = useMemo(() => {
    if (!navPts || chartPeriod === 'All') return navPts;
    const months = chartPeriod === '1M' ? 1 : chartPeriod === '3M' ? 3 : chartPeriod === '6M' ? 6 : 12;
    const cutoff = Date.now() - months * 30.4375 * 86400000;
    return navPts.filter((p) => p.t >= cutoff);
  }, [navPts, chartPeriod]);

  const filteredBenchPts = useMemo(() => {
    if (!benchPts || chartPeriod === 'All') return benchPts;
    const months = chartPeriod === '1M' ? 1 : chartPeriod === '3M' ? 3 : chartPeriod === '6M' ? 6 : 12;
    const cutoff = Date.now() - months * 30.4375 * 86400000;
    return benchPts.filter((p) => p.t >= cutoff);
  }, [benchPts, chartPeriod]);

  const chartSeries = useMemo(() => {
    if (!filteredNavPts || filteredNavPts.length < 2) return null;

    if (chartMode === 'raw') {
      return [
        {
          name: cleanName || 'SIF NAV',
          color: filteredNavPts[filteredNavPts.length - 1].v >= filteredNavPts[0].v ? '#2e7d32' : '#b71c1c',
          data: filteredNavPts,
        },
      ];
    }

    // Re-indexed mode (Growth of ₹10,000)
    const baseT = Math.max(filteredNavPts[0].t, filteredBenchPts?.[0]?.t ?? filteredNavPts[0].t);
    const navSlice = filteredNavPts.filter((p) => p.t >= baseT);
    const navBase = navSlice[0]?.v;
    if (!navBase) return null;

    const normNav = navSlice.map((p) => ({ t: p.t, v: (p.v / navBase) * 10000 }));
    const series = [
      {
        name: cleanName,
        color: '#1b5e20',
        data: normNav,
      },
    ];

    if (filteredBenchPts && filteredBenchPts.length >= 2) {
      const benchSlice = filteredBenchPts.filter((p) => p.t >= baseT);
      const benchBase = benchSlice[0]?.v;
      if (benchBase) {
        const normBench = benchSlice.map((p) => ({ t: p.t, v: (p.v / benchBase) * 10000 }));
        series.push({
          name: `Benchmark (${benchIdx})`,
          color: '#0288d1',
          data: normBench,
        });
      }
    }
    return series;
  }, [filteredNavPts, filteredBenchPts, chartMode, cleanName, benchIdx]);

  if (loading) {
    return (
      <>
        <Navbar activePage="sif" />
        <div className="sif-page">
          <div className="sif-load">Loading Specialised Investment Fund details…</div>
        </div>
        <Footer />
      </>
    );
  }

  if (error || !sif) {
    return (
      <>
        <Navbar activePage="sif" />
        <div className="sif-page">
          <div className="sif-err">
            {error || 'SIF scheme not found.'}
            <a href="/sifs">← Return to SIF Screener</a>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  const fam = sif.category?.startsWith('Equity') ? 'Equity' : 'Hybrid';
  const stratTitle = sifStratShort(sif.category);

  return (
    <>
      <Navbar activePage="sif" />
      <div className="sif-page">
        {/* Breadcrumb */}
        <div style={{ padding: '16px 0 12px', fontSize: '0.8rem', color: 'var(--muted)' }}>
          <a href="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Home</a> /{' '}
          <a href="/sifs" style={{ color: 'var(--muted)', textDecoration: 'none' }}>SIF Screener</a> /{' '}
          <span style={{ color: 'var(--text)', fontWeight: 600 }}>{cleanName}</span>
        </div>

        {/* Hero Card */}
        <div className="sif-hero">
          <div className="sif-hero-row">
            <div className="sif-hero-logo">
              <ProviderAvatar name={sif.sif_name} logoPath={getSIFLogo(sif.sif_name)} size={38} radius={10} />
            </div>
            <div className="sif-hero-content">
              <h1 className="sif-hero-title">{cleanName}</h1>
              <div className="sif-hero-tags">
                <span className="sif-tag house">{sif.sif_name}</span>
                <span className={`sif-strat-badge sif-strat-badge-${fam.toLowerCase()}`}>{stratTitle}</span>
                <span className="sif-tag sebi">SEBI Specialised Investment Fund</span>
                <span className="sif-tag code">{sif.scheme_id}</span>
              </div>
              <div className="sif-hero-actions">
                <a href={backtestSifLink(sif)} className="sif-btn primary">⚗ Backtest Strategy</a>
                <button onClick={copyShareLink} className="sif-btn">
                  {copied ? '✓ Link Copied!' : '🔗 Share SIF'}
                </button>
                <a href="/sifs" className="sif-btn">📋 Full SIF Screener</a>
              </div>
            </div>
          </div>
        </div>

        {/* KPI Banner Grid */}
        <div className="sif-kpi-grid">
          <div className="sif-kpi-card">
            <span className="sif-kpi-lbl">Latest NAV</span>
            <span className="sif-kpi-val">₹{sif.nav?.toFixed(4) || '—'}</span>
            <span className="sif-kpi-sub">As of {sif.nav_date || sif.asof}</span>
          </div>
          <div className="sif-kpi-card">
            <span className="sif-kpi-lbl">1M Return</span>
            <span className="sif-kpi-val" style={{ color: sif.ret_1m > 0 ? '#2e7d32' : sif.ret_1m < 0 ? '#d32f2f' : 'inherit' }}>
              {pctTxt(sif.ret_1m)}
            </span>
            <span className="sif-kpi-sub">Absolute</span>
          </div>
          <div className="sif-kpi-card">
            <span className="sif-kpi-lbl">3M Return</span>
            <span className="sif-kpi-val" style={{ color: sif.ret_3m > 0 ? '#2e7d32' : sif.ret_3m < 0 ? '#d32f2f' : 'inherit' }}>
              {pctTxt(sif.ret_3m)}
            </span>
            <span className="sif-kpi-sub">Absolute</span>
          </div>
          <div className="sif-kpi-card">
            <span className="sif-kpi-lbl">6M Return</span>
            <span className="sif-kpi-val" style={{ color: sif.ret_6m > 0 ? '#2e7d32' : sif.ret_6m < 0 ? '#d32f2f' : 'inherit' }}>
              {pctTxt(sif.ret_6m)}
            </span>
            <span className="sif-kpi-sub">Absolute</span>
          </div>
          <div className="sif-kpi-card">
            <span className="sif-kpi-lbl">Inception Return</span>
            <span className="sif-kpi-val" style={{ color: sif.ret_inception > 0 ? '#2e7d32' : sif.ret_inception < 0 ? '#d32f2f' : 'inherit' }}>
              {pctTxt(sif.ret_inception)}
            </span>
            <span className="sif-kpi-sub">Since Inception</span>
          </div>
          <div className="sif-kpi-card">
            <span className="sif-kpi-lbl">Volatility (Risk)</span>
            <span className="sif-kpi-val">{sif.vol != null ? `${sif.vol.toFixed(1)}%` : '—'}</span>
            <span className="sif-kpi-sub">Annualised</span>
          </div>
          <div className="sif-kpi-card">
            <span className="sif-kpi-lbl">Max Drawdown</span>
            <span className="sif-kpi-val" style={{ color: '#d32f2f' }}>
              {sif.max_dd != null ? `${sif.max_dd.toFixed(1)}%` : '—'}
            </span>
            <span className="sif-kpi-sub">Peak to Trough</span>
          </div>
          <div className="sif-kpi-card">
            <span className="sif-kpi-lbl">Ret/Risk Ratio</span>
            <span className="sif-kpi-val">{sif.ret_per_risk != null ? sif.ret_per_risk.toFixed(2) : '—'}</span>
            <span className="sif-kpi-sub">Sharpe Proxy</span>
          </div>
        </div>

        {/* SEBI SIF Framework Callout Notice */}
        <div className="sif-notice-card">
          <div className="sif-notice-icon">ⓘ</div>
          <div className="sif-notice-body">
            <strong>SEBI Specialised Investment Fund (SIF) Framework:</strong> SIFs represent a specialized, high-conviction investment vehicle introduced by SEBI (2024–25) for sophisticated investors, bridging the gap between Mutual Funds and PMS/AIFs. SIFs require a minimum investment threshold of <strong>₹10 Lakhs</strong> per investor.
          </div>
        </div>

        {/* NAV Growth Chart Card */}
        <div className="sif-card">
          <div className="sif-card-h" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <span>📈 NAV Growth &amp; Benchmark Comparison</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>Benchmark:</span>
                <select
                  value={benchIdx}
                  onChange={(e) => setBenchIdx(e.target.value)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 8,
                    fontSize: '0.78rem',
                    border: '1px solid var(--border)',
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    fontWeight: 600,
                  }}
                >
                  <option value="BSE 250 LargeMidCap 65:35 Index">BSE 250 LargeMidCap 65:35</option>
                  <option value="BSE 500">BSE 500</option>
                  <option value="BSE Arbitrage Rate Index">BSE Arbitrage Index</option>
                  <option value="BSE Liquid Rate Index">BSE Liquid Rate Index</option>
                  <option value="BSE India Corporate Bond Index">BSE Corporate Bond</option>
                  <option value="BSE India 10 Year Sovereign Bond">BSE 10Y Sovereign Bond</option>
                </select>
              </div>
            </div>

            {/* Timeframe & Mode Toolbar */}
            <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {['1M', '3M', '6M', '1Y', 'All'].map((p) => (
                  <button
                    key={p}
                    onClick={() => setChartPeriod(p)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      border: '1px solid var(--border)',
                      background: chartPeriod === p ? 'var(--g1)' : 'var(--s2)',
                      color: chartPeriod === p ? '#fff' : 'var(--text2)',
                      cursor: 'pointer',
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  onClick={() => setChartMode('reindexed')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: '1px solid var(--border)',
                    background: chartMode === 'reindexed' ? 'var(--s2)' : 'transparent',
                    color: chartMode === 'reindexed' ? 'var(--text)' : 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  Growth of ₹10k
                </button>
                <button
                  onClick={() => setChartMode('raw')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    border: '1px solid var(--border)',
                    background: chartMode === 'raw' ? 'var(--s2)' : 'transparent',
                    color: chartMode === 'raw' ? 'var(--text)' : 'var(--muted)',
                    cursor: 'pointer',
                  }}
                >
                  Raw NAV
                </button>
              </div>
            </div>
          </div>

          {histLoading ? (
            <div className="sif-load">Fetching NAV historical series…</div>
          ) : !chartSeries ? (
            <div className="sif-err">Historical NAV series is populating as daily NAVs update.</div>
          ) : (
            <CompareGrowthChart series={chartSeries} showLegend={true} />
          )}
        </div>

        {/* Strategy Facts Card */}
        <div className="sif-card">
          <div className="sif-card-h">🏢 Strategy Specifications &amp; Facts</div>
          <div className="sif-facts-grid">
            <div className="sif-fact-item">
              <span className="sif-fact-lbl">Fund House / AMC</span>
              <span className="sif-fact-val">{sif.sif_name}</span>
            </div>
            <div className="sif-fact-item">
              <span className="sif-fact-lbl">Strategy Category</span>
              <span className="sif-fact-val">{sif.category}</span>
            </div>
            <div className="sif-fact-item">
              <span className="sif-fact-lbl">Scheme ID</span>
              <span className="sif-fact-val">{sif.scheme_id}</span>
            </div>
            <div className="sif-fact-item">
              <span className="sif-fact-lbl">Minimum Investment</span>
              <span className="sif-fact-val">₹10,000,000 (₹10 Lakhs)</span>
            </div>
            <div className="sif-fact-item">
              <span className="sif-fact-lbl">Asset Class Family</span>
              <span className="sif-fact-val">{fam} Strategy</span>
            </div>
            <div className="sif-fact-item">
              <span className="sif-fact-lbl">Inception Date</span>
              <span className="sif-fact-val">{sif.inception_date || '2024–25 (SEBI Launch)'}</span>
            </div>
          </div>
        </div>

        {/* Holdings Section */}
        <HoldingsSection holdingsData={holdingsData} loading={holdingsLoading} schemeName={sif.nav_name} />

        {/* FAQ Section */}
        <div className="sif-card">
          <div className="sif-card-h">❓ Frequently Asked Questions</div>
          <div className="sif-faq-list">
            <div className="sif-faq-item">
              <button className="sif-faq-q" onClick={() => setOpenFaq(openFaq === 1 ? null : 1)}>
                <span>What is a SEBI Specialised Investment Fund (SIF)?</span>
                <span>{openFaq === 1 ? '▲' : '▼'}</span>
              </button>
              {openFaq === 1 && (
                <div className="sif-faq-a">
                  SIFs are SEBI-regulated investment products introduced to bridge the gap between Mutual Funds (₹100 minimum) and Portfolio Management Services (PMS, ₹50 Lakhs minimum). SIFs allow asset managers to execute specialized long-short, unconstrained, or active derivative strategies with a ₹10 Lakh minimum investment per investor.
                </div>
              )}
            </div>

            <div className="sif-faq-item">
              <button className="sif-faq-q" onClick={() => setOpenFaq(openFaq === 2 ? null : 2)}>
                <span>What strategy does {cleanName} follow?</span>
                <span>{openFaq === 2 ? '▲' : '▼'}</span>
              </button>
              {openFaq === 2 && (
                <div className="sif-faq-a">
                  {cleanName} follows the <strong>{sif.category}</strong> mandate, managed by {sif.sif_name}. It combines active security selection with hedging or tactical exposure techniques as specified under SEBI guidelines for this category.
                </div>
              )}
            </div>

            <div className="sif-faq-item">
              <button className="sif-faq-q" onClick={() => setOpenFaq(openFaq === 3 ? null : 3)}>
                <span>Why are long-term (3Y/5Y) return metrics blank for some SIFs?</span>
                <span>{openFaq === 3 ? '▲' : '▼'}</span>
              </button>
              {openFaq === 3 && (
                <div className="sif-faq-a">
                  Because the SEBI SIF framework was introduced in 2024–25, SIF schemes are brand-new offerings. 3-year and 5-year annualized metrics will automatically populate as these funds build multi-year NAV track records over time.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Distributor Compliance Footer Callout */}
        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>
          Abundance Financial Services · AMFI Registered Mutual Fund Distributor (ARN-251838)<br />
          Data sourced daily from AMFI &amp; official scheme disclosures. Investment in securities market are subject to market risks, read all scheme related documents carefully.
        </div>
      </div>
      <Footer />
    </>
  );
}
