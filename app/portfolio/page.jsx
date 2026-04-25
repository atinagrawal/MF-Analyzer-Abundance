'use client';

/**
 * app/portfolio/page.jsx — Client Portfolio Portal
 *
 * Personalized wealth dashboard for signed-in clients.
 * Fetches the most recent saved CAS portfolio and manual holdings,
 * computes totals, and presents a premium private-banking style view.
 *
 * Data flow:
 *   1. GET /api/cas/list            → find most recent saved CAS blob key
 *   2. GET /api/cas/load?key=...    → load full portfolio JSON
 *   3. processCasData()             → compute holding values + totals
 *   4. GET /api/holdings            → manual holdings (incl. SIF)
 *   5. GET /api/sif-nav             → SIF live NAVs
 */

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtINR(n) {
  const abs = Math.abs(n);
  if (abs >= 1e7)  return (n / 1e7).toFixed(2)  + ' Cr';
  if (abs >= 1e5)  return (n / 1e5).toFixed(2)  + ' L';
  if (abs >= 1e3)  return (n / 1e3).toFixed(1)  + ' K';
  return Math.round(n).toLocaleString('en-IN');
}

function fmtFull(n) {
  return '₹' + Math.abs(Math.round(n)).toLocaleString('en-IN');
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function greeting(name) {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const first = (name || 'there').split(' ')[0];
  return { g, first };
}

// ── Animated number counter ───────────────────────────────────────────────────
function CountUp({ to, duration = 1200, prefix = '₹', className, style }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    if (!to) return;
    const from = 0;
    const start = performance.now();
    startRef.current = start;
    function step(ts) {
      const elapsed = ts - start;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    }
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [to, duration]);

  const abs = Math.abs(display);
  let shown;
  if (abs >= 1e7)      shown = (display / 1e7).toFixed(2) + ' Cr';
  else if (abs >= 1e5) shown = (display / 1e5).toFixed(2) + ' L';
  else                 shown = Math.round(display).toLocaleString('en-IN');

  return <span className={className} style={style}>{prefix}{shown}</span>;
}

// ── Category inference (same as CAS tracker) ─────────────────────────────────
function inferCategory(name) {
  const n = (name || '').toUpperCase();
  if (/LIQUID|OVERNIGHT|ULTRA.?SHORT|LOW.?DURA|SHORT.?DURA|MEDIUM.?DURA|LONG.?DURA|GILT|MONEY.?MARKET|BANKING.?PSU|CORPORATE.?BOND|CREDIT.?RISK|FMP|FIXED.?MATURITY/.test(n)) return 'debt';
  if (/BALANCED|HYBRID|ARBITRAGE|DYNAMIC.?ASSET|MULTI.?ASSET|EQUITY.?SAVINGS|CONSERVATIVE/.test(n)) return 'hybrid';
  return 'equity';
}

const CATEGORY_COLOR = {
  equity:  { bg: 'rgba(27,94,32,.12)',   fg: '#1b5e20', label: 'Equity' },
  hybrid:  { bg: 'rgba(74,20,140,.10)',  fg: '#4a148c', label: 'Hybrid' },
  debt:    { bg: 'rgba(13,71,161,.10)',  fg: '#0d47a1', label: 'Debt'   },
  sif:     { bg: 'rgba(0,105,92,.12)',   fg: '#00695c', label: 'SIF'    },
};

// ── Mini sparkline (SVG path) ─────────────────────────────────────────────────
function Sparkline({ positive, style }) {
  // Simple decorative wave line
  const d = positive
    ? 'M0,18 C8,16 12,8 20,6 C28,4 32,12 40,10 C48,8 52,4 60,2'
    : 'M0,2 C8,4 12,12 20,14 C28,16 32,8 40,10 C48,12 52,16 60,18';
  return (
    <svg width="60" height="20" viewBox="0 0 60 20" fill="none" style={style}>
      <path d={d} stroke={positive ? '#43a047' : '#ef5350'} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ── Main portfolio inner ──────────────────────────────────────────────────────
function PortfolioInner() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [phase, setPhase]         = useState('loading'); // loading | ready | empty | error
  const [portfolios, setPortfolios] = useState([]);
  const [casData, setCasData]      = useState(null);     // raw CAS JSON
  const [manualHoldings, setManualHoldings] = useState([]);
  const [sifNavMap, setSifNavMap]  = useState({});
  const [activeTab, setActiveTab]  = useState('overview'); // overview | holdings | uploads
  const [errMsg, setErrMsg]        = useState('');

  // Derived values
  const [totals, setTotals] = useState({ current: 0, invested: 0, manual: 0 });
  const [topHoldings, setTopHoldings] = useState([]);
  const [investorName, setInvestorName] = useState('');

  // Auth guard
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login?from=/portfolio');
    }
  }, [status, router]);

  // Main data fetch
  useEffect(() => {
    if (status !== 'authenticated') return;

    async function loadAll() {
      try {
        // 1. Fetch CAS list + manual holdings concurrently
        const [listRes, holdingsRes] = await Promise.all([
          fetch('/api/cas/list'),
          fetch('/api/holdings'),
        ]);

        const listData     = await listRes.json();
        const holdingsData = await holdingsRes.json();

        const ports   = listData.portfolios   || [];
        const manual  = holdingsData.holdings || [];
        setPortfolios(ports);
        setManualHoldings(manual);

        // 2. SIF NAVs if manual SIF holdings exist
        const hasSIF = manual.some(h => h.fund_type === 'SIF');
        if (hasSIF) {
          const sifRes = await fetch('/api/sif-nav');
          if (sifRes.ok) {
            const sifData = await sifRes.json();
            const nm = {};
            (sifData.schemes || []).forEach(s => { nm[s.scheme_id] = s.nav; });
            setSifNavMap(nm);
          }
        }

        // 3. Load latest CAS if available
        if (ports.length > 0) {
          const latest = ports[0];
          const loadRes = await fetch(`/api/cas/load?key=${encodeURIComponent(latest.blob_key)}`);
          if (loadRes.ok) {
            const data = await loadRes.json();
            setCasData(data);

            // Compute totals from CAS
            let casCurrent = 0, casInvested = 0;
            const holdings = [];
            const panInvestorMap = {};

            // Build PAN→name map
            (data.folios || []).forEach(folio => {
              if (folio.PAN && folio.PAN.length === 10) {
                const transactions = (folio.schemes || []).flatMap(s => s.transactions || []);
                for (const txn of transactions) {
                  if (txn.type && /purchase|SIP/i.test(txn.type) && txn.investor) {
                    panInvestorMap[folio.PAN] = txn.investor;
                    break;
                  }
                }
              }
            });

            // Investor name
            const gName = (data.investor_info?.name || '').trim();
            setInvestorName(gName || session.user.name || 'Investor');

            // Collect holdings with concurrent NAV fetch
            const allAmfi = new Set();
            (data.folios || []).forEach(folio => {
              (folio.schemes || []).forEach(scheme => {
                const units = parseFloat(scheme.close) || 0;
                if (units > 0 && scheme.amfi) allAmfi.add(scheme.amfi);
              });
            });

            // Fetch NAVs
            const navMap = {};
            await Promise.allSettled([...allAmfi].map(async amfi => {
              try {
                const r = await fetch(`/api/mf?code=${amfi}&latest=1`);
                if (r.ok) {
                  const d = await r.json();
                  if (d.status === 'SUCCESS' && d.data?.[0]) {
                    navMap[amfi] = parseFloat(d.data[0].nav);
                  }
                }
              } catch {}
            }));

            // Build holdings list
            (data.folios || []).forEach(folio => {
              (folio.schemes || []).forEach(scheme => {
                const units = parseFloat(scheme.close) || 0;
                if (units < 0.001) return;
                const casCost = parseFloat(scheme.valuation?.cost || 0);
                const liveNav = navMap[scheme.amfi] || parseFloat(scheme.valuation?.nav || 0);
                const value   = units * liveNav;
                const invested = casCost > 0 ? casCost : units * liveNav;
                casCurrent  += value;
                casInvested += invested;
                holdings.push({
                  name:      scheme.scheme,
                  value,
                  invested,
                  liveNav,
                  units,
                  isLive:    !!navMap[scheme.amfi],
                  category:  inferCategory(scheme.scheme),
                  isSIF:     false,
                });
              });
            });

            // Manual holdings value
            let manualVal = 0;
            manual.forEach(h => {
              const pu = parseFloat(h.purchase_nav);
              const u  = parseFloat(h.units);
              const ln = h.fund_type === 'SIF' ? (sifNavMap[h.amfi_code] ?? null) : null;
              manualVal += (ln ?? pu) * u;
              holdings.push({
                name:      h.fund_name,
                value:     (ln ?? pu) * u,
                invested:  pu * u,
                liveNav:   ln ?? pu,
                units:     u,
                isLive:    ln != null,
                category:  h.fund_type === 'SIF' ? 'sif' : inferCategory(h.fund_name),
                isSIF:     h.fund_type === 'SIF',
                isManual:  true,
              });
            });

            setTotals({ current: casCurrent + manualVal, invested: casInvested, manual: manualVal });
            // Top 6 by value
            setTopHoldings(holdings.sort((a, b) => b.value - a.value).slice(0, 6));
            setPhase('ready');
          } else {
            setPhase(manual.length > 0 ? 'ready' : 'empty');
          }
        } else {
          // No CAS — check manual
          let manualVal = 0;
          const mhList = [];
          manual.forEach(h => {
            const pu = parseFloat(h.purchase_nav);
            const u  = parseFloat(h.units);
            const ln = h.fund_type === 'SIF' ? (sifNavMap[h.amfi_code] ?? null) : null;
            manualVal += (ln ?? pu) * u;
            mhList.push({
              name:     h.fund_name,
              value:    (ln ?? pu) * u,
              invested: pu * u,
              liveNav:  ln ?? pu,
              units:    u,
              isLive:   ln != null,
              category: h.fund_type === 'SIF' ? 'sif' : inferCategory(h.fund_name),
              isSIF:    h.fund_type === 'SIF',
              isManual: true,
            });
          });
          setTotals({ current: manualVal, invested: 0, manual: manualVal });
          setTopHoldings(mhList.sort((a, b) => b.value - a.value).slice(0, 6));
          setInvestorName(session.user.name || 'Investor');
          setPhase(manual.length > 0 ? 'ready' : 'empty');
        }
      } catch (err) {
        console.error('[portfolio]', err);
        setErrMsg(err.message);
        setPhase('error');
      }
    }

    loadAll();
  }, [status, session]);

  // ── Unauthenticated gate ─────────────────────────────────────────────────────
  if (status === 'unauthenticated') {
    return (
      <>
        <div className="pf-hero" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
          <div className="container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <Navbar activePage="portfolio" />
            <div className="pf-hero-inner pf-gate-inner">
              <div className="pf-gate-logo">
                <img src="/logo-192.png" alt="Abundance" style={{ width: 56, height: 56, borderRadius: 14, border: '2px solid rgba(255,255,255,.2)', marginBottom: 20 }} />
              </div>
              <div className="pf-greeting">Your wealth, beautifully organised</div>
              <h1 className="pf-gate-title">Sign in to view<br />your portfolio</h1>
              <p className="pf-gate-sub">
                Your mutual fund holdings, live NAVs, FIFO gains, and ELSS lock-in status —
                all in one place. Managed by Abundance Financial Services (ARN-251838).
              </p>
              <div className="pf-gate-actions">
                <a href={`/login?from=/portfolio`} className="pf-gate-btn-primary">
                  Sign in to Abundance →
                </a>
                <a href="/cas-tracker" className="pf-gate-btn-secondary">
                  Try without signing in
                </a>
              </div>
              <div className="pf-gate-features">
                {['Live AMFI NAVs', 'FIFO capital gains', 'ELSS lock-in tracker', 'SIF holdings', 'Redemption planner'].map(f => (
                  <span key={f} className="pf-gate-feature">✓ {f}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  // ── Auth / data loading — animated skeleton ───────────────────────────────
  if (status === 'loading' || (status === 'authenticated' && phase === 'loading')) {
    return (
      <>
        <div className="pf-hero">
          <div className="container">
            <Navbar activePage="portfolio" />
            <div className="pf-hero-inner pf-loading-inner">
              {/* Animated greeting shimmer */}
              <div className="pf-sk-line" style={{ width: 160, height: 12 }} />
              <div className="pf-sk-line" style={{ width: 280, height: 44, marginTop: 10, borderRadius: 10 }} />
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 14 }}>
                <div className="pf-sk-pill" style={{ width: 100 }} />
                <div className="pf-sk-pill" style={{ width: 80 }} />
              </div>
              {/* Loading indicator */}
              <div className="pf-loading-dots">
                <span /><span /><span />
              </div>
            </div>
          </div>
        </div>
        <div className="container">
          <div className="pf-stat-row" style={{ marginTop: -28 }}>
            {[1,2,3].map(i => (
              <div key={i} className="pf-stat-card pf-sk-card" style={{ height: 96 }}>
                <div className="pf-sk-line" style={{ width: '55%', height: 10, marginBottom: 10 }} />
                <div className="pf-sk-line" style={{ width: '80%', height: 24 }} />
                <div className="pf-sk-line" style={{ width: '40%', height: 10, marginTop: 8 }} />
              </div>
            ))}
          </div>
          <div className="pf-sk-tabs" />
          <div className="pf-section">
            {[1,2,3,4].map(i => (
              <div key={i} className="pf-holding-row pf-sk-row" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="pf-sk-badge" />
                <div className="pf-sk-line" style={{ width: `${55 + i * 7}%`, height: 12 }} />
                <div className="pf-sk-line" style={{ width: 60, height: 12 }} />
                <div className="pf-sk-line" style={{ width: 48, height: 12 }} />
              </div>
            ))}
          </div>
        </div>
      </>
    );
  }

  const gain       = totals.current - totals.invested;
  const gainPct    = totals.invested > 0 ? ((gain / totals.invested) * 100).toFixed(2) : '0.00';
  const isProfit   = gain >= 0;
  const { g, first } = greeting(investorName);

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (phase === 'empty') {
    return (
      <>
        <div className="pf-hero pf-hero-empty">
          <div className="container">
            <Navbar activePage="portfolio" />
            <div className="pf-hero-inner">
              <div className="pf-greeting">{g}, {first} 👋</div>
              <h1 className="pf-gate-title" style={{ fontSize: 'clamp(1.6rem,5vw,2.6rem)' }}>Your portfolio<br />is waiting</h1>
              <p className="pf-gate-sub">Upload your CAMS or KFintech CAS statement to see your complete mutual fund portfolio with live NAVs, FIFO gains, and ELSS lock-in analysis.</p>
              <div className="pf-gate-actions">
                <a href="/cas-tracker" className="pf-gate-btn-primary">📄 Upload CAS Statement</a>
                <a href="/login?from=/portfolio" className="pf-gate-btn-secondary">Sign in first</a>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

  // ── Main dashboard ───────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Hero ── */}
      <div className="pf-hero">
        <div className="container">
          <Navbar activePage="portfolio" />

          <div className="pf-hero-inner">
            {/* Greeting */}
            <div className="pf-greeting">{g}, {first}</div>

            {/* Big wealth number */}
            <div className="pf-wealth-row">
              <div className="pf-wealth-block">
                <div className="pf-wealth-label">Total Portfolio Value</div>
                <CountUp to={totals.current} duration={1400} className="pf-wealth-num" />
              </div>
              <div className="pf-gain-pill" data-pos={isProfit ? 'true' : 'false'}>
                <Sparkline positive={isProfit} />
                <span>{isProfit ? '+' : '−'}{fmtFull(gain)}</span>
                <span className="pf-gain-pct">{isProfit ? '+' : ''}{gainPct}%</span>
              </div>
            </div>

            {/* Hero meta */}
            <div className="pf-hero-meta">
              {portfolios.length > 0 && (
                <span className="pf-meta-chip">
                  <span className="pf-live-dot" />
                  Live NAVs · {fmtDate(portfolios[0]?.uploaded_at)}
                </span>
              )}
              {manualHoldings.length > 0 && (
                <span className="pf-meta-chip">{manualHoldings.length} manual holding{manualHoldings.length !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="container">

        {/* ── Stat row ── */}
        <div className="pf-stat-row">
          {[
            { label: 'Current Value', val: totals.current, color: 'var(--g1)', big: true },
            { label: 'Total Invested', val: totals.invested, color: 'var(--text2)' },
            { label: isProfit ? 'Unrealised Gain' : 'Unrealised Loss', val: gain, color: isProfit ? 'var(--g2)' : 'var(--neg)', signed: true },
          ].map(({ label, val, color, big, signed }) => (
            <div key={label} className="pf-stat-card">
              <div className="pf-stat-label">{label}</div>
              <div className="pf-stat-val" style={{ color, fontSize: big ? '1.35rem' : '1.1rem' }}>
                {signed && val > 0 ? '+' : ''}₹{fmtINR(val)}
              </div>
              {signed && totals.invested > 0 && (
                <div className="pf-stat-sub" style={{ color: isProfit ? 'var(--g3)' : 'var(--neg-light)' }}>
                  {isProfit ? '+' : ''}{gainPct}% all-time
                </div>
              )}
            </div>
          ))}
        </div>

        {/* ── Tab bar ── */}
        <div className="pf-tabs">
          {[
            { key: 'overview',  label: 'Overview'  },
            { key: 'holdings',  label: `Holdings (${topHoldings.length})` },
            { key: 'uploads',   label: `Statements (${portfolios.length})` },
          ].map(t => (
            <button key={t.key}
              className={`pf-tab${activeTab === t.key ? ' active' : ''}`}
              onClick={() => setActiveTab(t.key)}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview tab ── */}
        {activeTab === 'overview' && (
          <div className="pf-overview">

            {/* Top holdings preview */}
            <div className="pf-section">
              <div className="pf-section-head">
                <span className="pf-section-title">Top Holdings</span>
                <button className="pf-text-btn" onClick={() => setActiveTab('holdings')}>View all →</button>
              </div>

              <div className="pf-holdings-list">
                {topHoldings.slice(0, 4).map((h, i) => {
                  const cat   = CATEGORY_COLOR[h.category] || CATEGORY_COLOR.equity;
                  const gain  = h.value - h.invested;
                  const gPct  = h.invested > 0 ? ((gain / h.invested) * 100).toFixed(1) : '0.0';
                  const gPos  = gain >= 0;
                  const pct   = totals.current > 0 ? (h.value / totals.current * 100).toFixed(1) : '0';
                  return (
                    <div key={i} className="pf-holding-row">
                      <div className="pf-holding-cat" style={{ background: cat.bg }}>
                        <span style={{ color: cat.fg, fontSize: '.48rem', fontWeight: 900, letterSpacing: '.5px', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                          {cat.label}
                        </span>
                      </div>
                      <div className="pf-holding-name" title={h.name}>{h.name}</div>
                      <div className="pf-holding-bar-wrap">
                        <div className="pf-holding-bar" style={{ width: `${pct}%`, background: cat.fg + '30' }} />
                        <span className="pf-holding-pct">{pct}%</span>
                      </div>
                      <div className="pf-holding-val">₹{fmtINR(h.value)}</div>
                      <div className="pf-holding-gain" data-pos={gPos ? 'true' : 'false'}>
                        {gPos ? '+' : ''}{gPct}%
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action cards */}
            <div className="pf-actions">
              <a href="/cas-tracker" className="pf-action-card pf-action-primary">
                <div className="pf-action-icon">📋</div>
                <div>
                  <div className="pf-action-title">Full Portfolio Analysis</div>
                  <div className="pf-action-sub">Live NAVs · ELSS lock-in · FIFO gains</div>
                </div>
                <span className="pf-action-arrow">→</span>
              </a>
              <a href="/cas-tracker#upload-section" className="pf-action-card">
                <div className="pf-action-icon">📤</div>
                <div>
                  <div className="pf-action-title">Upload New Statement</div>
                  <div className="pf-action-sub">CAMS or KFintech CAS PDF</div>
                </div>
                <span className="pf-action-arrow">→</span>
              </a>
              <a href="https://www.getabundance.in/contact-us" target="_blank" rel="noopener noreferrer" className="pf-action-card">
                <div className="pf-action-icon">📞</div>
                <div>
                  <div className="pf-action-title">Talk to Your Advisor</div>
                  <div className="pf-action-sub">Abundance Financial · ARN-251838</div>
                </div>
                <span className="pf-action-arrow">→</span>
              </a>
            </div>

            {/* Distributor card */}
            <div className="pf-advisor-card">
              <img src="/logo-192.png" alt="Abundance" className="pf-advisor-logo" />
              <div className="pf-advisor-info">
                <div className="pf-advisor-name">Abundance Financial Services</div>
                <div className="pf-advisor-detail">AMFI Registered Distributor · ARN-251838 · Haldwani, Uttarakhand</div>
                <div className="pf-advisor-detail" style={{ marginTop: 2 }}>
                  Your portfolio is managed securely through this portal.
                </div>
              </div>
              <a href="https://www.getabundance.in" target="_blank" rel="noopener noreferrer" className="pf-advisor-btn">
                Visit →
              </a>
            </div>
          </div>
        )}

        {/* ── Holdings tab ── */}
        {activeTab === 'holdings' && (
          <div className="pf-section">
            <div className="pf-holdings-full">
              {topHoldings.map((h, i) => {
                const cat  = CATEGORY_COLOR[h.category] || CATEGORY_COLOR.equity;
                const gain = h.value - h.invested;
                const gPct = h.invested > 0 ? ((gain / h.invested) * 100).toFixed(2) : '0.00';
                const gPos = gain >= 0;
                const pct  = totals.current > 0 ? (h.value / totals.current * 100).toFixed(1) : '0';
                return (
                  <div key={i} className="pf-holding-card">
                    <div className="pf-hc-head">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                        <div className="pf-hc-cat" style={{ background: cat.bg, color: cat.fg }}>{cat.label}</div>
                        {h.isManual && <div className="pf-hc-cat" style={{ background: 'var(--s3)', color: 'var(--muted)' }}>Manual</div>}
                      </div>
                      <div className="pf-hc-pct">{pct}% of portfolio</div>
                    </div>
                    <div className="pf-hc-name">{h.name}</div>
                    <div className="pf-hc-bar">
                      <div className="pf-hc-bar-fill" style={{ width: `${pct}%`, background: cat.fg + '40' }} />
                    </div>
                    <div className="pf-hc-metrics">
                      {[
                        ['Current Value', '₹' + fmtINR(h.value), 'var(--text)', '.82rem'],
                        ['Invested',      '₹' + fmtINR(h.invested), 'var(--text2)', '.72rem'],
                        ['Live NAV',      '₹' + h.liveNav.toFixed(4), 'var(--text2)', '.7rem'],
                        ['Units',         h.units.toFixed(4), 'var(--muted)', '.7rem'],
                      ].map(([lbl, val, col, fs]) => (
                        <div key={lbl} className="pf-hc-metric">
                          <div className="pf-hc-mlabel">{lbl}</div>
                          <div className="pf-hc-mval" style={{ color: col, fontSize: fs }}>{val}</div>
                        </div>
                      ))}
                    </div>
                    <div className="pf-hc-gain" data-pos={gPos ? 'true' : 'false'}>
                      <span>{gPos ? '+' : '−'}₹{fmtINR(Math.abs(gain))}</span>
                      <span className="pf-hc-gpct">{gPos ? '+' : ''}{gPct}%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Uploads tab ── */}
        {activeTab === 'uploads' && (
          <div className="pf-section">
            {portfolios.length === 0 ? (
              <div className="pf-empty-uploads">
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📭</div>
                <div className="pf-empty-title">No statements uploaded yet</div>
                <a href="/cas-tracker" className="pf-cta-btn" style={{ marginTop: 16 }}>Upload your first CAS</a>
              </div>
            ) : (
              <div className="pf-uploads-list">
                {portfolios.map((p, i) => (
                  <div key={p.id} className="pf-upload-item">
                    <div className="pf-upload-num">{String(i + 1).padStart(2, '0')}</div>
                    <div className="pf-upload-info">
                      <div className="pf-upload-name">📄 {p.file_name}</div>
                      <div className="pf-upload-meta">
                        {p.pan_count} PAN{p.pan_count !== 1 ? 's' : ''} · {fmtDate(p.uploaded_at)}
                      </div>
                    </div>
                    <a href={`/cas-tracker?load=${encodeURIComponent(p.blob_key)}`}
                      className="pf-upload-btn">
                      Analyse →
                    </a>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ height: 48 }} />
      </div>

      <Footer />
    </>
  );
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="sk" style={{ width: 160, height: 18, borderRadius: 8 }} />
      </div>
    }>
      <PortfolioInner />
    </Suspense>
  );
}
