'use client';

/**
 * app/portfolio/page.jsx — Client Portfolio Portal
 *
 * Personalized wealth dashboard for signed-in clients.
 * Fetches every saved CAS portfolio and manual holdings, merges them
 * (deduped by PAN+folio+scheme so a re-uploaded statement doesn't
 * double-count and an older statement's exclusive holdings aren't
 * dropped), computes totals, and presents a premium private-banking
 * style view.
 *
 * Data flow:
 *   1. GET /api/cas/list            → all saved CAS blob keys, newest first
 *   2. GET /api/cas/load?key=...    → load each portfolio JSON (parallel)
 *   3. merge folios, newest statement wins per (PAN, folio, scheme)
 *   4. GET /api/holdings            → manual holdings (incl. SIF)
 *   5. GET /api/sif-nav             → SIF live NAVs
 */

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { schemeXirr, manualHoldingXirr, schemeCashFlows, manualHoldingCashFlows, combinedXirr } from '@/lib/xirr';
import ProviderAvatar from '@/components/ProviderAvatar';
import { getMFLogoFromSchemeName } from '@/lib/providerLogos';
import { FundDetailDrawer, SifDetailDrawer } from '@/components/HoldingDetailDrawer';
import { PORTFOLIO_FAQ } from './faqData';

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
  const searchParams = useSearchParams();

  // Admin/distributor viewing a client's portfolio via ?userId=&uname= (same
  // pattern app/cas-tracker/page.js already uses). The APIs enforce this
  // server-side via canManageUser() regardless of what's checked here — this
  // is just so an unprivileged visitor sees a clear message instead of a
  // silently-empty dashboard from a wall of 403s.
  const viewUserId    = searchParams.get('userId') || '';
  const viewUname     = searchParams.get('uname')  || '';
  const viewerRole    = session?.user?.role;
  const canViewOthers = viewerRole === 'admin' || viewerRole === 'distributor';
  const isViewingOther = Boolean(viewUserId) && viewUserId !== session?.user?.id;

  const [phase, setPhase]         = useState('loading'); // loading | ready | empty | error
  const [portfolios, setPortfolios] = useState([]);
  const [casData, setCasData]      = useState(null);     // raw CAS JSON
  const [manualHoldings, setManualHoldings] = useState([]);
  const [sifNavMap, setSifNavMap]  = useState({});
  const [activeTab, setActiveTab]  = useState('overview'); // overview | holdings | uploads
  const [errMsg, setErrMsg]        = useState('');
  const [detailHolding, setDetailHolding] = useState(null); // holding object for the fund/SIF details drawer

  // Derived values
  const [panPortfolios, setPanPortfolios] = useState({}); // PAN → {name, current, invested, holdings}
  const [activePan, setActivePan]         = useState('all'); // 'all' | specific PAN
  const [totals, setTotals]               = useState({ current: 0, invested: 0, manual: 0 });
  const [topHoldings, setTopHoldings]     = useState([]);
  const [investorName, setInvestorName]   = useState('');
  const [navDate, setNavDate]             = useState(null);

  // No redirect — unauthenticated users see the gate UI below (better SEO + UX)

  // Main data fetch
  useEffect(() => {
    if (status !== 'authenticated') return;
    if (isViewingOther && !canViewOthers) {
      setErrMsg("You don't have permission to view this portfolio.");
      setPhase('error');
      return;
    }

    async function loadAll() {
      try {
        // 1. Fetch CAS list + manual holdings concurrently
        const userIdQS = isViewingOther ? `?userId=${encodeURIComponent(viewUserId)}` : '';
        const [listRes, holdingsRes] = await Promise.all([
          fetch(`/api/cas/list${userIdQS}`),
          fetch(`/api/holdings${userIdQS}`),
        ]);

        const listData     = await listRes.json();
        const holdingsData = await holdingsRes.json();

        const ports   = listData.portfolios   || [];
        const manual  = holdingsData.holdings || [];
        setPortfolios(ports);
        setManualHoldings(manual);

        // 2. SIF NAVs — localSifMap used directly in computation (state update is async).
        // Fetched unconditionally (cheap, server-cached) rather than only when a manual
        // holding is tagged SIF: CAS statements DO include SIF holdings with full
        // transaction history, but casparser reports scheme.amfi as null for them, so
        // there's no way to know in advance whether THIS CAS contains one without already
        // having this list to match against (isin_po/isin_ri/nav_name below) — same
        // resolution app/cas-tracker/page.js already does for the same reason.
        let localSifMap = {};
        const sifByIsin = {};
        const sifByName = {};
        try {
          const sifRes = await fetch('/api/sif-nav');
          if (sifRes.ok) {
            const sifData = await sifRes.json();
            (sifData.schemes || []).forEach(s => {
              localSifMap[s.scheme_id] = s.nav;
              if (s.isin_po) sifByIsin[s.isin_po] = s;
              if (s.isin_ri) sifByIsin[s.isin_ri] = s;
              const norm = (s.nav_name || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
              if (norm) sifByName[norm] = s;
            });
            setSifNavMap(localSifMap);
            if (sifData.nav_date) setNavDate(sifData.nav_date);
          }
        } catch {}
        // ISIN is the reliable match (unique per scheme); normalised name is a
        // fallback for the rare case a scheme's ISIN isn't in either source.
        function resolveSif(scheme) {
          if (scheme.isin && sifByIsin[scheme.isin]) return sifByIsin[scheme.isin];
          const norm = (scheme.scheme || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
          return sifByName[norm] || null;
        }

        // 3. Load ALL saved CAS files — not just the latest — so holdings
        // spread across multiple statements (e.g. different registrars,
        // or an older upload the newest one doesn't cover) aren't dropped.
        // ports is sorted newest-first, so when the same (PAN, folio,
        // scheme) key shows up in more than one file — a re-upload of the
        // same statement — the first (most recent) file to claim a key
        // wins and later duplicates are skipped, avoiding double-counting.
        if (ports.length > 0) {
          const loadResults = await Promise.allSettled(
            ports.map(p =>
              fetch(`/api/cas/load?key=${encodeURIComponent(p.blob_key)}`)
                .then(r => (r.ok ? r.json() : null))
            )
          );

          const seenKeys = new Set();
          const mergedFolios = [];
          let gName = '';

          loadResults.forEach(res => {
            if (res.status !== 'fulfilled' || !res.value) return;
            const fileData = res.value;
            if (!gName) gName = (fileData.investor_info?.name || '').trim();

            (fileData.folios || []).forEach(folio => {
              const pan = (folio.PAN || '').toUpperCase().trim();
              const folioNo = (folio.folio || '').trim();
              const keptSchemes = (folio.schemes || []).filter(scheme => {
                const units = parseFloat(scheme.close) || 0;
                if (units < 0.001) return false;
                const fundKey = scheme.amfi || (scheme.scheme || '').trim().toLowerCase();
                const dedupKey = `${pan}|${folioNo}|${fundKey}`;
                if (seenKeys.has(dedupKey)) return false;
                seenKeys.add(dedupKey);
                return true;
              });
              if (keptSchemes.length) mergedFolios.push({ ...folio, schemes: keptSchemes });
            });
          });

          if (mergedFolios.length > 0) {
            const data = { folios: mergedFolios };
            setCasData(data);

            // Compute totals from CAS
            let casCurrent = 0, casInvested = 0;
            const holdings = [];
            const panInvestorMap = {};

            // Build PAN→name map
            mergedFolios.forEach(folio => {
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
            setInvestorName(gName || (isViewingOther ? viewUname : session.user.name) || 'Investor');

            // Collect holdings with concurrent NAV fetch
            const allAmfi = new Set();
            mergedFolios.forEach(folio => {
              (folio.schemes || []).forEach(scheme => {
                const units = parseFloat(scheme.close) || 0;
                if (units > 0 && scheme.amfi) allAmfi.add(scheme.amfi);
              });
            });

            // Fetch NAVs
            const navMap = {};
            let maxDateStr = null;
            await Promise.allSettled([...allAmfi].map(async amfi => {
              try {
                const r = await fetch(`/api/mf?code=${amfi}&latest=1`);
                if (r.ok) {
                  const d = await r.json();
                  if (d.status === 'SUCCESS' && d.data?.[0]) {
                    navMap[amfi] = parseFloat(d.data[0].nav);
                    if (!maxDateStr) maxDateStr = d.data[0].date;
                  }
                }
              } catch {}
            }));

            // Parse fetched DD-MM-YYYY date for display
            if (maxDateStr) {
              const [dd, mm, yy] = maxDateStr.split('-');
              if (dd && mm && yy) {
                const dObj = new Date(`${yy}-${mm}-${dd}`);
                setNavDate(dObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
              }
            }

            // Build per-PAN portfolio map
            const panMap = {}; // PAN → { name, current, invested, holdings }
            const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

            mergedFolios.forEach(folio => {
              const pan = (folio.PAN || '').toUpperCase().trim();
              const validPan = pan.length === 10 && PAN_RE.test(pan) ? pan : 'SHARED';

              // Resolve investor name for this PAN
              if (!panMap[validPan]) {
                const txnName = panInvestorMap[validPan] || '';
                const maskedPan = validPan !== 'SHARED'
                  ? `${validPan.slice(0,3)}**${validPan.slice(-2)}`
                  : 'Shared';
                panMap[validPan] = {
                  pan:      validPan,
                  name:     txnName || maskedPan,
                  current:  0,
                  invested: 0,
                  holdings: [],
                };
              }

              (folio.schemes || []).forEach(scheme => {
                const units = parseFloat(scheme.close) || 0;
                if (units < 0.001) return;
                const casCost = parseFloat(scheme.valuation?.cost || 0);
                // CAS statements DO include SIF holdings, but casparser reports
                // scheme.amfi as null for them — resolveSif matches by ISIN/name
                // against the AMFI SIF scheme master instead (see comment above).
                const sifMatch = resolveSif(scheme);
                const liveNav = sifMatch ? sifMatch.nav : (navMap[scheme.amfi] || parseFloat(scheme.valuation?.nav || 0));
                const value   = units * liveNav;
                const invested = casCost > 0 ? casCost : value;
                casCurrent  += value;
                casInvested += invested;
                panMap[validPan].current  += value;
                panMap[validPan].invested += invested;
                const h = {
                  id: `${validPan}-${folio.folio || ''}-${scheme.amfi || scheme.scheme}`,
                  name:     scheme.scheme,
                  code:     sifMatch ? sifMatch.scheme_id : (scheme.amfi || null),
                  value, invested, liveNav, units,
                  isLive:   sifMatch ? true : !!navMap[scheme.amfi],
                  category: sifMatch ? 'sif' : inferCategory(scheme.scheme),
                  isSIF:    !!sifMatch,
                  xirr:     schemeXirr(scheme, value),
                  xirrFlows: schemeCashFlows(scheme),
                };
                panMap[validPan].holdings.push(h);
                holdings.push(h);
              });
            });

            // Manual holdings: attribute to specific PAN if set, always include in 'all'
            let manualVal = 0;
            manual.forEach(h => {
              const pu  = parseFloat(h.purchase_nav);
              const u   = parseFloat(h.units);
              const ln  = h.fund_type === 'SIF' ? (localSifMap[h.amfi_code] ?? null) : null;
              const val = (ln ?? pu) * u;
              manualVal += val;
              const mh = {
                id: `manual-${h.id}`,
                name: h.fund_name, code: h.amfi_code || null, value: val, invested: pu * u,
                liveNav: ln ?? pu, units: u, isLive: ln != null,
                category: h.fund_type === 'SIF' ? 'sif' : inferCategory(h.fund_name),
                isSIF: h.fund_type === 'SIF', isManual: true,
                xirr: manualHoldingXirr({ purchaseDate: h.purchase_date, invested: pu * u, currentValue: val }),
                xirrFlows: manualHoldingCashFlows({ purchaseDate: h.purchase_date, invested: pu * u }),
              };
              holdings.push(mh);
              // Attribute to specific PAN if set and that PAN exists in the CAS
              const hp = (h.pan || '').toUpperCase().trim();
              if (hp && PAN_RE.test(hp) && panMap[hp]) {
                panMap[hp].current  += val;
                panMap[hp].invested += pu * u;
                panMap[hp].holdings.push(mh);
              }
            });

            // Portfolio-level XIRR: only shown when every holding — CAS and
            // manual alike — has a trustworthy transaction history. Computed
            // per PAN (so the PAN selector shows the right scoped number)
            // and once for the full combined portfolio.
            Object.values(panMap).forEach(p => {
              const flows = p.holdings.map(h => h.xirrFlows);
              p.xirr = flows.length ? combinedXirr(flows, p.current) : null;
            });
            const overallXirr = holdings.length
              ? combinedXirr(holdings.map(h => h.xirrFlows), casCurrent + manualVal)
              : null;

            setPanPortfolios(panMap);
            setTotals({ current: casCurrent + manualVal, invested: casInvested, manual: manualVal, xirr: overallXirr });
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
            const ln = h.fund_type === 'SIF' ? (localSifMap[h.amfi_code] ?? null) : null;
            manualVal += (ln ?? pu) * u;
            mhList.push({
              id:       `manual-${h.id}`,
              name:     h.fund_name,
              code:     h.amfi_code || null,
              value:    (ln ?? pu) * u,
              invested: pu * u,
              liveNav:  ln ?? pu,
              units:    u,
              isLive:   ln != null,
              category: h.fund_type === 'SIF' ? 'sif' : inferCategory(h.fund_name),
              isSIF:    h.fund_type === 'SIF',
              isManual: true,
              xirr:     manualHoldingXirr({ purchaseDate: h.purchase_date, invested: pu * u, currentValue: (ln ?? pu) * u }),
              xirrFlows: manualHoldingCashFlows({ purchaseDate: h.purchase_date, invested: pu * u }),
            });
          });
          const manualOnlyXirr = mhList.length
            ? combinedXirr(mhList.map(h => h.xirrFlows), manualVal)
            : null;
          setTotals({ current: manualVal, invested: 0, manual: manualVal, xirr: manualOnlyXirr });
          setTopHoldings(mhList.sort((a, b) => b.value - a.value).slice(0, 6));
          setInvestorName((isViewingOther ? viewUname : session.user.name) || 'Investor');
          setPhase(manual.length > 0 ? 'ready' : 'empty');
        }
      } catch (err) {
        console.error('[portfolio]', err);
        setErrMsg(err.message);
        setPhase('error');
      }
    }

    loadAll();
  }, [status, session, viewUserId, isViewingOther, canViewOthers]);

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

        {/* ── FAQ — visible to all, crawlable, mirrors the FAQPage JSON-LD in layout.js ── */}
        <section style={{ padding: '64px 0', maxWidth: 800, margin: '0 auto' }}>
          <div style={{ padding: '0 20px' }}>
            <div className="page-eyebrow" style={{ marginBottom: 10 }}>
              <span className="eyebrow-text">Help & Support</span>
            </div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-.4px', marginBottom: 28 }}>
              Frequently Asked Questions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {PORTFOLIO_FAQ.map(({ q, a }, i, arr) => (
                <details key={i} style={{
                  borderTop: '1px solid var(--border)',
                  borderBottom: i === arr.length - 1 ? '1px solid var(--border)' : 'none',
                }}>
                  <summary style={{
                    padding: '16px 4px', cursor: 'pointer', listStyle: 'none',
                    fontSize: '.82rem', fontWeight: 800, color: 'var(--text)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    {q}
                    <span style={{ fontSize: '1rem', color: 'var(--muted)', flexShrink: 0, marginLeft: 12 }}>+</span>
                  </summary>
                  <div style={{ padding: '0 4px 16px', fontSize: '.78rem', color: 'var(--text2)', lineHeight: 1.7 }}>
                    {a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

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

  // ── PAN selector computed values ─────────────────────────────────────────────
  const panKeys = Object.keys(panPortfolios); // e.g. ['ABCDE1234F', 'XYZPQ9876G']
  const hasMultiPan = panKeys.length > 1;

  // Active display: if activePan is 'all' or not in panPortfolios, show combined
  const displayHoldings = (activePan !== 'all' && panPortfolios[activePan])
    ? panPortfolios[activePan].holdings
    : topHoldings;
  const displayTotals = (activePan !== 'all' && panPortfolios[activePan])
    ? { current: panPortfolios[activePan].current, invested: panPortfolios[activePan].invested, manual: 0, xirr: panPortfolios[activePan].xirr }
    : totals;
  const displayName = (activePan !== 'all' && panPortfolios[activePan])
    ? panPortfolios[activePan].name
    : investorName;

  const gain       = displayTotals.current - displayTotals.invested;
  const gainPct    = displayTotals.invested > 0 ? ((gain / displayTotals.invested) * 100).toFixed(2) : '0.00';
  const isProfit   = gain >= 0;
  const { g, first } = greeting(displayName);

  // ── Error state (e.g. permission denied viewing someone else's portfolio) ──
  if (phase === 'error') {
    return (
      <>
        <div className="pf-hero pf-hero-empty">
          <div className="container">
            <Navbar activePage="portfolio" />
            <div className="pf-hero-inner">
              <h1 className="pf-gate-title" style={{ fontSize: 'clamp(1.6rem,5vw,2.6rem)' }}>Can't open this portfolio</h1>
              <p className="pf-gate-sub">{errMsg || 'Something went wrong loading this portfolio.'}</p>
              <div className="pf-gate-actions">
                <a href="/portfolio" className="pf-gate-btn-primary">Go to my portfolio</a>
              </div>
            </div>
          </div>
        </div>
        <Footer />
      </>
    );
  }

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

          {isViewingOther && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8,
              margin: '0 0 18px', padding: '10px 16px', borderRadius: 10,
              background: 'rgba(255,255,255,.14)', border: '1px solid rgba(255,255,255,.25)',
              fontSize: '.78rem', fontWeight: 700, color: '#fff',
            }}>
              <span>👁 Viewing <strong>{displayName || 'this client'}</strong>'s portfolio ({viewerRole} view) — read-only.</span>
              <a href="/admin" style={{ color: '#fff', textDecoration: 'underline', flexShrink: 0 }}>← Back to {viewerRole === 'admin' ? 'Admin Panel' : 'My Clients'}</a>
            </div>
          )}

          <div className="pf-hero-inner">
            {/* Greeting */}
            <div className="pf-greeting">{g}, {first}</div>

            {/* Big wealth number */}
            <div className="pf-wealth-row">
              <div className="pf-wealth-block">
                <div className="pf-wealth-label">Total Portfolio Value</div>
                <CountUp to={displayTotals.current} duration={1400} className="pf-wealth-num" key={activePan} />
              </div>
              <div className="pf-gain-pill" data-pos={isProfit ? 'true' : 'false'}>
                <Sparkline positive={isProfit} />
                <span>{isProfit ? '+' : '−'}{fmtFull(gain)}</span>
                <span className="pf-gain-pct">{isProfit ? '+' : ''}{gainPct}%</span>
              </div>
            </div>

            {/* Hero meta + PAN selector (only when multi-PAN) */}
            <div className="pf-hero-meta">
              {portfolios.length > 0 && (
                <span className="pf-meta-chip">
                  <span className="pf-live-dot" />
                  Live NAVs · {navDate || fmtDate(portfolios[0]?.uploaded_at)}
                </span>
              )}
              {manualHoldings.length > 0 && (
                <span className="pf-meta-chip">{manualHoldings.length} manual holding{manualHoldings.length !== 1 ? 's' : ''}</span>
              )}
            </div>

            {/* PAN / family member selector — only when CAS has 2+ PANs */}
            {hasMultiPan && (
              <div className="pf-pan-selector">
                <span className="pf-pan-label">Viewing:</span>
                <div className="pf-pan-chips">
                  <button
                    className={`pf-pan-chip${activePan === 'all' ? ' active' : ''}`}
                    onClick={() => setActivePan('all')}
                  >
                    All members
                  </button>
                  {panKeys.map(pan => (
                    <button
                      key={pan}
                      className={`pf-pan-chip${activePan === pan ? ' active' : ''}`}
                      onClick={() => setActivePan(pan)}
                    >
                      {panPortfolios[pan].name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="container">

        {/* ── Stat row ── */}
        <div className="pf-stat-row">
          {[
            { label: 'Current Value', val: displayTotals.current, color: 'var(--g1)', big: true },
            { label: 'Total Invested', val: displayTotals.invested, color: 'var(--text2)' },
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
              {signed && Number.isFinite(displayTotals.xirr) && (
                <div className="pf-stat-sub" style={{ color: displayTotals.xirr >= 0 ? 'var(--g3)' : 'var(--neg-light)' }}>
                  {displayTotals.xirr >= 0 ? '+' : ''}{(displayTotals.xirr * 100).toFixed(1)}% Portfolio XIRR
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
                {displayHoldings.slice(0, 4).map((h, i) => {
                  const cat   = CATEGORY_COLOR[h.category] || CATEGORY_COLOR.equity;
                  const gain  = h.value - h.invested;
                  const gPct  = h.invested > 0 ? ((gain / h.invested) * 100).toFixed(1) : '0.0';
                  const gPos  = gain >= 0;
                  const pct   = displayTotals.current > 0 ? (h.value / displayTotals.current * 100).toFixed(1) : '0';
                  return (
                    <div key={h.id || i} className="pf-holding-row">
                      <ProviderAvatar
                        name={h.name.split(' ')[0]}
                        logoPath={getMFLogoFromSchemeName(h.name)}
                        size={24}
                        radius={6}
                        style={{ flexShrink: 0, marginRight: 4 }}
                      />
                      <div className="pf-holding-cat" style={{ background: cat.bg }}>
                        <span style={{ color: cat.fg, fontSize: '.48rem', fontWeight: 900, letterSpacing: '.5px', textTransform: 'uppercase', fontFamily: "'JetBrains Mono', monospace" }}>
                          {cat.label}
                        </span>
                      </div>
                      {h.code ? (
                        <button
                          onClick={() => setDetailHolding(h)}
                          title="View fund details"
                          className="pf-holding-name pf-holding-name-link"
                          style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left', minWidth: 0, width: '100%' }}
                        >
                          {h.name}
                        </button>
                      ) : (
                        <div className="pf-holding-name" title={h.name}>{h.name}</div>
                      )}
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
              {displayHoldings.map((h, i) => {
                const cat  = CATEGORY_COLOR[h.category] || CATEGORY_COLOR.equity;
                const gain = h.value - h.invested;
                const gPct = h.invested > 0 ? ((gain / h.invested) * 100).toFixed(2) : '0.00';
                const gPos = gain >= 0;
                const pct  = displayTotals.current > 0 ? (h.value / displayTotals.current * 100).toFixed(1) : '0';
                return (
                  <div key={h.id || i} className="pf-holding-card">
                    <div className="pf-hc-head">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
                        <ProviderAvatar
                          name={h.name.split(' ')[0]}
                          logoPath={getMFLogoFromSchemeName(h.name)}
                          size={28}
                          radius={7}
                        />
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <div className="pf-hc-cat" style={{ background: cat.bg, color: cat.fg }}>{cat.label}</div>
                          {h.isManual && <div className="pf-hc-cat" style={{ background: 'var(--s3)', color: 'var(--muted)' }}>Manual</div>}
                        </div>
                      </div>
                      <div className="pf-hc-pct">{pct}% of portfolio</div>
                    </div>
                    {h.code ? (
                      <button
                        onClick={() => setDetailHolding(h)}
                        title="View fund details"
                        className="pf-hc-name pf-holding-name-link"
                        style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left', display: 'block', width: '100%' }}
                      >
                        {h.name}
                      </button>
                    ) : (
                      <div className="pf-hc-name">{h.name}</div>
                    )}
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
                      <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                        <span className="pf-hc-gpct">{gPos ? '+' : ''}{gPct}%</span>
                        {Number.isFinite(h.xirr) && (
                          <span className="pf-hc-gpct" style={{ opacity: .75 }}>
                            {h.xirr >= 0 ? '+' : ''}{(h.xirr * 100).toFixed(1)}% XIRR
                          </span>
                        )}
                      </span>
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

      {detailHolding && (
        detailHolding.isSIF
          ? <SifDetailDrawer schemeId={detailHolding.code} onClose={() => setDetailHolding(null)} />
          : <FundDetailDrawer code={detailHolding.code} onClose={() => setDetailHolding(null)} />
      )}

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
