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
import { getMFLogoFromSchemeName, getSIFLogo } from '@/lib/providerLogos';
import { FundDetailDrawer, SifDetailDrawer } from '@/components/HoldingDetailDrawer';
import RedemptionPlanner from '@/components/RedemptionPlanner';
import TransactionHistoryDrawer, { navHistoryCacheKey, earliestTxnDate } from '@/components/TransactionHistoryDrawer';
import CasMemberMerge from '@/components/CasMemberMerge';
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

// ── FIFO cost basis + ELSS lock-in (ported from app/cas-tracker/page.js's
// calculateFifoCost, verbatim — same math, same edge cases, so this page's
// numbers always agree with CAS Tracker's rather than drifting from a
// second, subtly-different implementation) ────────────────────────────────
const TRANSMISSION_RE = /transmission/i;
function isTransmissionTxn(description) {
  return TRANSMISSION_RE.test(description || '');
}

function calculateFifoCost(scheme, currentNav, isTransmittedFolio = false) {
  const units = parseFloat(scheme.close) || 0;
  if (units === 0) return { invested: 0, lockedValue: 0 };

  const directCost = parseFloat(scheme.valuation?.cost || scheme.cost || 0);
  let buyLots = [];
  let lockedUnits = 0;

  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
  const isELSS = /ELSS|TAX.?SAVER/i.test(scheme.scheme);

  (scheme.transactions || []).forEach(txn => {
    const type = (txn.type || '').toUpperCase();
    const txnUnits = parseFloat(txn.units) || 0;
    const amount = parseFloat(txn.amount) || 0;
    if (txnUnits === 0) return;

    if (/PURCHASE|SIP|SWITCH.?IN|REINVEST/.test(type)) {
      buyLots.push({
        units: txnUnits,
        amount: amount,
        nav: amount / txnUnits,
        date: new Date(txn.date),
        isTransmission: isTransmissionTxn(txn.description) || isTransmittedFolio,
      });
    } else if (/REDEMPTION|SWITCH.?OUT|REVERSAL/.test(type)) {
      // REVERSAL voids an earlier purchase attempt (most commonly a SIP
      // instalment that bounced -- "ER04: Insufficient Balance" -- and was
      // retried same-day). Removing FIFO-style, same as a real sell, was
      // verified against a real CAS to reconcile exactly: every scheme with
      // an unhandled reversal was overstating FIFO invested by the full
      // reversed amount (₹3.5K-₹44K on the funds checked), since the
      // voided purchase's lot was never removed.
      let rem = Math.abs(txnUnits);
      while (rem > 0 && buyLots.length > 0) {
        if (buyLots[0].units <= rem) {
          rem -= buyLots[0].units;
          buyLots.shift();
        } else {
          buyLots[0].units -= rem;
          buyLots[0].amount = buyLots[0].units * buyLots[0].nav;
          rem = 0;
        }
      }
    }
  });

  let fifoInvested = 0;
  buyLots.forEach(lot => {
    fifoInvested += lot.amount;
    if (isELSS && lot.date > threeYearsAgo) {
      lockedUnits += lot.units;
    }
  });

  // PARTIAL/TRUNCATED CAS: if sum of buy lots is less than current unit balance,
  // the difference represents opening balance / older holdings before the CAS start date.
  const totalBuyUnits = buyLots.reduce((sum, l) => sum + l.units, 0);
  if (units > totalBuyUnits + 0.001) {
    const unaccountedUnits = units - totalBuyUnits;
    const casCost = parseFloat(scheme.valuation?.cost || scheme.cost || 0);
    const unaccountedCost = Math.max(0, casCost - fifoInvested);
    const avgNav = unaccountedCost > 0 ? (unaccountedCost / unaccountedUnits) : currentNav;

    buyLots.unshift({
      units: unaccountedUnits,
      amount: unaccountedCost,
      nav: avgNav,
      date: new Date(0),
      synthetic: true,
    });
    fifoInvested += unaccountedCost;
  }

  let finalInvested = fifoInvested;
  if (directCost > 0 && (fifoInvested === 0 || fifoInvested < directCost * 0.5)) {
    finalInvested = directCost;
  }

  return {
    invested:    Math.max(0, finalInvested),
    lockedValue: lockedUnits * currentNav,
    buyLots,
  };
}

// Slim, server-fetched projection of the ISIN scheme master — fetched once
// and cached across the page's lifetime, same pattern as
// components/HoldingDetailDrawer.jsx's own copy (kept separate since the
// two never share a page load).
let schemeMasterFactsPromise = null;
function getSchemeMasterFacts() {
  if (!schemeMasterFactsPromise) {
    schemeMasterFactsPromise = fetch('/api/scheme-master-facts')
      .then(r => r.ok ? r.json() : { byIsin: {}, byAmfiCode: {}, byNormName: {} })
      .catch(() => ({ byIsin: {}, byAmfiCode: {}, byNormName: {} }));
  }
  return schemeMasterFactsPromise;
}

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

// ── FAQ section — visible to all (logged out, empty, and the main
// dashboard), crawlable, mirrors the FAQPage JSON-LD in layout.js. Shared
// by all three render branches below so they can't drift apart. ──────────────
function PortfolioFaqSection() {
  return (
    <section style={{ padding: '64px 0 0', borderTop: '1px solid var(--border)', marginTop: 64 }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px' }}>
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
  );
}

// ── Best-effort pooled XIRR ────────────────────────────────────────────────────
// combinedXirr() (lib/xirr.js) is deliberately all-or-nothing: if even one
// holding in the group lacks a trustworthy transaction history, the whole
// figure comes back null. That's the right contract for a number claiming to
// be precise, but for a family CAS the odds that AT LEAST ONE holding across
// everyone's history is untrustworthy (an old transfer-in, a pre-2018 folio,
// a switch not captured) are high — "Portfolio XIRR" would go missing almost
// always. Falls back to pooling only the holdings that DO have valid flows,
// closing the position at exactly their combined current value (not the
// group's full value — mixing in excluded holdings' value would distort the
// return), and reports how many holdings were actually included so the UI
// can caveat it honestly instead of presenting a partial number as exact.
function bestEffortXirr(holdingsForGroup, totalValue) {
  const total = holdingsForGroup.length;
  const validHoldings = holdingsForGroup.filter(h => Array.isArray(h.xirrFlows));
  if (!validHoldings.length) return { xirr: null, partial: false, included: 0, total };

  const strict = total ? combinedXirr(holdingsForGroup.map(h => h.xirrFlows), totalValue) : null;
  if (strict != null) return { xirr: strict, partial: false, included: total, total };

  const partialValue = validHoldings.reduce((s, h) => s + h.value, 0);
  const partial = combinedXirr(validHoldings.map(h => h.xirrFlows), partialValue);
  return { xirr: partial, partial: true, included: validHoldings.length, total };
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
  const [planFund,      setPlanFund]      = useState(null); // holding object for the Redemption Planner
  const [txnDrawerFund, setTxnDrawerFund] = useState(null); // holding object for the Transaction History drawer
  const [navHistoryCache, setNavHistoryCache] = useState({}); // navHistoryCacheKey(fund) → { loading, points, error }
  const [refreshKey, setRefreshKey] = useState(0); // bump to re-run the main data fetch (e.g. after deleting a statement)
  const [deletingId, setDeletingId] = useState('');   // upload id in inline "confirm delete?" state
  const [deleteInFlight, setDeleteInFlight] = useState(false);
  const [deleteErr, setDeleteErr]   = useState('');

  // Derived values
  const [panPortfolios, setPanPortfolios] = useState({}); // PAN → {name, current, invested, holdings}
  const [activePan, setActivePan]         = useState('all'); // 'all' | specific PAN
  const [totals, setTotals]               = useState({ current: 0, invested: 0, manual: 0 });
  // Full combined holdings (CAS + manual), sorted by value desc -- the
  // 'all' fallback for displayHoldings below, and the source for the tab
  // count label. NOT capped: an earlier version capped this at 6 (meant
  // only for the Overview tab's small preview list, which actually reads
  // displayHoldings.slice(0, 4) instead and never used this array), which
  // silently hid every holding past the 6th highest-value one from the
  // "All members" Holdings tab, and made the tab's own count label wrong
  // for every single-member view too (see the 2026-08-18 bug report).
  const [allHoldings, setAllHoldings]     = useState([]);
  const [investorName, setInvestorName]   = useState('');
  const [navDate, setNavDate]             = useState(null);

  // CAS member merge — "Manage members" panel state
  const [mergeOpen, setMergeOpen]             = useState(false);
  const [mergeFromPan, setMergeFromPan]       = useState('');
  const [activeOverrides, setActiveOverrides] = useState([]); // populated after loadAll — see Step 4

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
        // 1. Fetch CAS list + manual holdings concurrently, plus the scheme
        // master (for ELSS lock-in detection beyond a name-regex match —
        // some ELSS funds don't literally say "ELSS" in their name).
        const userIdQS = isViewingOther ? `?userId=${encodeURIComponent(viewUserId)}` : '';
        const [listRes, holdingsRes, masterFacts] = await Promise.all([
          fetch(`/api/cas/list${userIdQS}`),
          fetch(`/api/holdings${userIdQS}`),
          getSchemeMasterFacts(),
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
        // scheme_id → sif_name (e.g. "SIF-34" → "Altiva SIF") — the SIF *house*
        // name getSIFLogo() actually needs, distinct from the scheme's own
        // display name. Needed separately from sifByIsin/sifByName because a
        // manually-added SIF holding is only identified by its scheme_id.
        const sifNameByCode = {};
        try {
          const sifRes = await fetch('/api/sif-nav');
          if (sifRes.ok) {
            const sifData = await sifRes.json();
            (sifData.schemes || []).forEach(s => {
              localSifMap[s.scheme_id] = s.nav;
              sifNameByCode[s.scheme_id] = s.sif_name;
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
          // Folio-level "Transmission of Folios" events (see api/parse.py's
          // build_folio_transmission_map), keyed by base folio number (no
          // "/ 0" registrar suffix) -- same source app/cas-tracker/page.js
          // reads, merged across files with first (newest) file winning,
          // matching the folio dedup priority below.
          const folioTransmissionsMerged = {};
          let gName = '';

          loadResults.forEach(res => {
            if (res.status !== 'fulfilled' || !res.value) return;
            const fileData = res.value;
            if (!gName) gName = (fileData.investor_info?.name || '').trim();
            Object.entries(fileData.folio_transmissions || {}).forEach(([k, v]) => {
              if (!(k in folioTransmissionsMerged)) folioTransmissionsMerged[k] = v;
            });

            (fileData.folios || []).forEach(folio => {
              const pan = (folio.PAN || '').toUpperCase().trim();
              const folioNo = (folio.folio || '').trim();
              const keptSchemes = (folio.schemes || []).filter(scheme => {
                const units = parseFloat(scheme.close) || 0;
                if (units < 0.001) return false;
                // AMFI code is null for every SIF holding (casparser can't report
                // one), so falling straight through to the scheme name risked two
                // pulls of the same SIF not deduping if minor formatting (spacing,
                // case) differed between statements. ISIN is stable and unique per
                // scheme (same tier used by resolveSif below), so try it first.
                const fundKey = scheme.amfi || scheme.isin || (scheme.scheme || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
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
            manual.forEach(h => {
              if (h.amfi_code && h.fund_type !== 'SIF') allAmfi.add(h.amfi_code);
            });

            // Fetch NAVs via batch endpoint
            const navMap = {};
            const prevNavMap = {};
            const ret1dMap = {};
            let maxDateStr = null;
            const amfiList = [...allAmfi];
            if (amfiList.length > 0) {
              try {
                const r = await fetch(`/api/mf?codes=${encodeURIComponent(amfiList.join(','))}&latest=1`);
                if (r.ok) {
                  const d = await r.json();
                  if (d.status === 'SUCCESS') {
                    for (const [c, n] of Object.entries(d.navs || {})) {
                      navMap[c] = parseFloat(n);
                    }
                    for (const [c, pn] of Object.entries(d.prev_navs || {})) {
                      prevNavMap[c] = parseFloat(pn);
                    }
                    for (const [c, r1d] of Object.entries(d.ret_1d || {})) {
                      ret1dMap[c] = parseFloat(r1d);
                    }
                    const dateEntries = Object.values(d.dates || {});
                    if (dateEntries.length > 0 && dateEntries[0]) maxDateStr = dateEntries[0];
                  }
                }
              } catch (_) {}
            }

            // Fallback for any unresolved codes
            const missingCodes = amfiList.filter(c => !navMap[c]);
            if (missingCodes.length > 0) {
              await Promise.allSettled(missingCodes.map(async amfi => {
                try {
                  const r = await fetch(`/api/mf?code=${amfi}&latest=1`);
                  if (r.ok) {
                    const d = await r.json();
                    if (d.status === 'SUCCESS' && d.data?.[0]) {
                      navMap[amfi] = parseFloat(d.data[0].nav);
                      if (d.prev_nav) prevNavMap[amfi] = parseFloat(d.prev_nav);
                      if (d.ret_1d != null) ret1dMap[amfi] = parseFloat(d.ret_1d);
                      if (!maxDateStr && d.data[0].date) maxDateStr = d.data[0].date;
                    }
                  }
                } catch {}
              }));
            }

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

            // Some registrars only restate a folio's PAN on some of its
            // blocks, not every one -- when the WHOLE statement otherwise
            // has exactly one distinct valid PAN, a folio with a blank/
            // malformed PAN of its own almost certainly belongs to that
            // same single investor, not a second "Shared" one (confirmed
            // against a real single-PAN CAS where ~10 of 29 folios came
            // back with PAN: "" from the parser, splitting one investor
            // into two panMap entries). Only applied when unambiguous
            // (exactly one other valid PAN found across the whole file) --
            // a genuinely multi-PAN CAS keeps the existing 'SHARED'
            // fallback for any folio whose PAN truly can't be determined.
            const distinctValidPans = new Set();
            mergedFolios.forEach(folio => {
              const p = (folio.PAN || '').toUpperCase().trim();
              if (p.length === 10 && PAN_RE.test(p)) distinctValidPans.add(p);
            });
            const solePan = distinctValidPans.size === 1 ? [...distinctValidPans][0] : null;

            // Two lists for resolve-folios (see that route's header comment):
            //  - allFolioNos: every folio here, since a MANUAL merge outranks
            //    even a folio's own valid PAN (that's the whole point of being
            //    able to merge away a well-formed-but-wrong OCR'd PAN).
            //  - stillAmbiguousFolios: only folios the existing tiers (own PAN,
            //    sole-PAN-in-statement) can't resolve -- the only ones worth
            //    paying for a cross-statement history scan on.
            // See docs/superpowers/specs/2026-08-18-cas-member-merge-design.md.
            const allFolioNos = [];
            const stillAmbiguousFolios = [];
            mergedFolios.forEach(folio => {
              const baseFolioNo = (folio.folio || '').split('/')[0].trim();
              if (!baseFolioNo) return;
              allFolioNos.push(baseFolioNo);
              const pan = (folio.PAN || '').toUpperCase().trim();
              if (pan.length === 10 && PAN_RE.test(pan)) return; // own PAN, fine
              stillAmbiguousFolios.push(baseFolioNo);
            });
            // The same folio can appear across several of the merged statements.
            const uniqueFolioNos = [...new Set(allFolioNos)];
            const uniqueAmbiguousFolioNos = [...new Set(stillAmbiguousFolios)];

            let externalResolutions = {};
            if (uniqueFolioNos.length) {
              try {
                const targetQS2 = isViewingOther ? `&targetUserId=${encodeURIComponent(viewUserId)}` : '';
                // No excludeBlobKey on this page. /portfolio merges folios from
                // ALL of the owner's saved statements, so there is no single
                // "statement being viewed" to exclude; the question here is
                // "what PAN has this folio ever resolved to anywhere in this
                // account's history", and excluding any one statement (the
                // newest, as this used to) just blinds the lookup to the
                // statement most likely to carry the corrected PAN.
                const res = await fetch(
                  `/api/cas/resolve-folios?folios=${encodeURIComponent(uniqueFolioNos.join(','))}`
                  + `&ambiguousFolios=${encodeURIComponent(uniqueAmbiguousFolioNos.join(','))}`
                  + `&excludeBlobKey=` + targetQS2
                );
                if (res.ok) {
                  const body = await res.json();
                  externalResolutions = body.resolutions || {};
                }
              } catch { /* non-fatal -- these folios simply stay Shared for now */ }
            }

            let casDayGain = 0;

            mergedFolios.forEach(folio => {
              const pan = (folio.PAN || '').toUpperCase().trim();
              const baseFolioNo = (folio.folio || '').split('/')[0].trim();
              // Resolution order, highest first:
              //   1. a MANUAL merge on file (a human's explicit decision --
              //      outranks the folio's own PAN, which is exactly the case
              //      where that PAN is well-formed but wrong),
              //   2. the folio's own valid PAN,
              //   3. cross-statement history / the sole-PAN-in-statement fix,
              //   4. 'SHARED'.
              // A 'history' resolution is NOT a human decision, so it stays
              // below the folio's own PAN.
              const resolved = externalResolutions[baseFolioNo];
              const hasOwnValidPan = pan.length === 10 && PAN_RE.test(pan);
              const validPan = resolved?.source === 'manual'
                ? resolved.pan
                : hasOwnValidPan
                  ? pan
                  : (resolved?.pan || solePan || 'SHARED');

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
                  dayGain:  0,
                  holdings: [],
                  folioNos: [],
                };
              }
              if (baseFolioNo && !panMap[validPan].folioNos.includes(baseFolioNo)) panMap[validPan].folioNos.push(baseFolioNo);

              const folioTransmission = folioTransmissionsMerged[baseFolioNo] || null;

              (folio.schemes || []).forEach(scheme => {
                const units = parseFloat(scheme.close) || 0;
                if (units < 0.001) return;
                // CAS statements DO include SIF holdings, but casparser reports
                // scheme.amfi as null for them — resolveSif matches by ISIN/name
                // against the AMFI SIF scheme master instead (see comment above).
                const sifMatch = resolveSif(scheme);
                const liveNav = sifMatch ? sifMatch.nav : (navMap[scheme.amfi] || parseFloat(scheme.valuation?.nav || 0));
                const prevNav = sifMatch ? null : (prevNavMap[scheme.amfi] ?? null);
                const value   = units * liveNav;
                // 1-Day gain/loss for this holding
                const change1d = prevNav && prevNav > 0 ? (liveNav - prevNav) : 0;
                const change1dPct = prevNav && prevNav > 0
                  ? (ret1dMap[scheme.amfi] != null ? ret1dMap[scheme.amfi] : +(((liveNav - prevNav) / prevNav) * 100).toFixed(2))
                  : null;
                const dayGain = prevNav && prevNav > 0 ? (units * change1d) : 0;

                // FIFO cost basis (not the CAS's own declared "cost", which is
                // just units × avg NAV and doesn't drive ELSS lock-in or match
                // what CAS Tracker itself shows) — same calculateFifoCost used
                // there, so the two pages always agree.
                const fifo = calculateFifoCost(scheme, liveNav, !!folioTransmission);
                const invested = fifo.invested;
                const isELSS = !sifMatch && (/ELSS|TAX.?SAVER/i.test(scheme.scheme) || (masterFacts.byIsin[scheme.isin || '']?.isLocked || false));
                casCurrent  += value;
                casInvested += invested;
                casDayGain  += dayGain;
                panMap[validPan].current  += value;
                panMap[validPan].invested += invested;
                panMap[validPan].dayGain  = (panMap[validPan].dayGain || 0) + dayGain;
                const h = {
                  id: `${validPan}-${folio.folio || ''}-${scheme.amfi || scheme.scheme}`,
                  name:     scheme.scheme,
                  code:     sifMatch ? sifMatch.scheme_id : (scheme.amfi || null),
                  value, invested, liveNav, prevNav, units,
                  change1d, change1dPct, dayGain,
                  isLive:   sifMatch ? true : !!navMap[scheme.amfi],
                  category: sifMatch ? 'sif' : inferCategory(scheme.scheme),
                  isSIF:    !!sifMatch,
                  sifName:  sifMatch ? sifMatch.sif_name : null,
                  // Redemption Planner + Transaction History drawer needs —
                  // same fields app/cas-tracker/page.js's own holding objects
                  // carry (see components/RedemptionPlanner.jsx and
                  // components/TransactionHistoryDrawer.jsx).
                  buyLots:      fifo.buyLots,
                  transactions: scheme.transactions || [],
                  folio:        folio.folio || null,
                  amfiCode:     sifMatch ? sifMatch.scheme_id : (scheme.amfi || null),
                  fund_type:    sifMatch ? 'SIF' : 'Mutual Fund',
                  source:       'cas',
                  isin:         scheme.isin || '',
                  folioTransmission,
                  isELSS,
                  lockedValue: fifo.lockedValue,
                  xirr:     schemeXirr(scheme, value),
                  xirrFlows: schemeCashFlows(scheme),
                };
                panMap[validPan].holdings.push(h);
                holdings.push(h);
              });
            });

            // Saved investor-name labels (set via CAS Tracker's ✎ editor on a
            // previous visit) take priority over whatever the transaction text
            // happened to say — same resolution app/cas-tracker/page.js already
            // does. Without this, /portfolio only ever showed the transaction-
            // guessed name or a masked PAN, even for a PAN the user had already
            // labelled.
            try {
              const realPans = Object.keys(panMap).filter(p => p !== 'SHARED' && PAN_RE.test(p));
              if (realPans.length) {
                const targetQS = isViewingOther ? `&targetUserId=${encodeURIComponent(viewUserId)}` : '';
                const res = await fetch(`/api/cas/pan-name?pans=${realPans.join(',')}${targetQS}`);
                const { names } = await res.json();
                Object.entries(names || {}).forEach(([pan, name]) => {
                  if (panMap[pan] && name) panMap[pan].name = name;
                });
              }
            } catch { /* non-fatal — fall back to transaction-derived names */ }

            // Manual holdings: attribute to specific PAN if set, always include in 'all'
            let manualVal = 0;
            let manualInvested = 0;
            let manualDayGain = 0;
            manual.forEach(h => {
              const pu  = parseFloat(h.purchase_nav);
              const u   = parseFloat(h.units);
              const ln  = h.fund_type === 'SIF' ? (localSifMap[h.amfi_code] ?? null) : (navMap[h.amfi_code] ?? null);
              const pn  = h.fund_type === 'SIF' ? null : (prevNavMap[h.amfi_code] ?? null);
              const liveNav = ln ?? pu;
              const prevNav = pn ?? null;
              const val = liveNav * u;
              const change1d = prevNav && prevNav > 0 ? (liveNav - prevNav) : 0;
              const change1dPct = prevNav && prevNav > 0
                ? (ret1dMap[h.amfi_code] != null ? ret1dMap[h.amfi_code] : +(((liveNav - prevNav) / prevNav) * 100).toFixed(2))
                : null;
              const dayGain = prevNav && prevNav > 0 ? (u * change1d) : 0;

              manualVal += val;
              manualInvested += (pu * u);
              manualDayGain += dayGain;
              const mh = {
                id: `manual-${h.id}`,
                name: h.fund_name, code: h.amfi_code || null, value: val, invested: pu * u,
                liveNav, prevNav, units: u, change1d, change1dPct, dayGain, isLive: ln != null,
                category: h.fund_type === 'SIF' ? 'sif' : inferCategory(h.fund_name),
                isSIF: h.fund_type === 'SIF', isManual: true,
                sifName: h.fund_type === 'SIF' ? (sifNameByCode[h.amfi_code] || null) : null,
                xirr: manualHoldingXirr({ purchaseDate: h.purchase_date, invested: pu * u, currentValue: val }),
                xirrFlows: manualHoldingCashFlows({ purchaseDate: h.purchase_date, invested: pu * u }),
                // Transaction History drawer needs — manual holdings have no
                // real transaction log, but do have exactly one known
                // purchase (date/NAV/units), which is the single-transaction
                // shape the drawer already handles (see buildAllHoldings in
                // app/cas-tracker/page.js for the same pattern).
                folio: h.folio || null,
                amfiCode: h.amfi_code || null,
                fund_type: h.fund_type,
                source: 'manual',
                transactions: (pu > 0 && u > 0 && h.purchase_date)
                  ? [{ date: h.purchase_date, type: 'PURCHASE', amount: pu * u, units: u, nav: pu }]
                  : [],
              };
              holdings.push(mh);
              // Attribute to specific PAN if set
              const hp = (h.pan || '').toUpperCase().trim();
              if (hp && PAN_RE.test(hp)) {
                if (!panMap[hp]) {
                  panMap[hp] = { name: hp, current: 0, invested: 0, dayGain: 0, holdings: [] };
                }
                panMap[hp].current  += val;
                panMap[hp].invested += pu * u;
                panMap[hp].dayGain  = (panMap[hp].dayGain || 0) + dayGain;
                panMap[hp].holdings.push(mh);
              }
            });

            // Portfolio-level XIRR — best-effort (see bestEffortXirr above):
            // exact when every holding has a trustworthy history, otherwise
            // pooled from whichever holdings do, with a caveat the UI shows.
            // Computed per PAN (so the PAN selector shows the right scoped
            // number) and once for the full combined family portfolio.
            Object.values(panMap).forEach(p => {
              const info = bestEffortXirr(p.holdings, p.current);
              p.xirr = info.xirr;
              p.xirrPartial = info.partial;
              p.xirrIncluded = info.included;
              p.xirrTotal = info.total;
            });
            const overallXirrInfo = bestEffortXirr(holdings, casCurrent + manualVal);

            const totalCurrent = casCurrent + manualVal;
            const totalDayGain = casDayGain + manualDayGain;
            const prevTotal = totalCurrent - totalDayGain;
            const totalDayGainPct = prevTotal > 0 ? ((totalDayGain / prevTotal) * 100) : 0;

            setPanPortfolios(panMap);
            setActiveOverrides(
              Object.entries(externalResolutions)
                .filter(([, r]) => r.source === 'manual')
                .map(([folioNo, r]) => ({
                  folioNo, pan: r.pan,
                  targetName: panMap[r.pan]?.name || r.pan,
                  updatedBy: '', updatedAt: '',
                }))
            );
            setTotals({
              current: totalCurrent, invested: casInvested + manualInvested, manual: manualVal,
              dayGain: totalDayGain, dayGainPct: totalDayGainPct,
              xirr: overallXirrInfo.xirr, xirrPartial: overallXirrInfo.partial,
              xirrIncluded: overallXirrInfo.included, xirrTotal: overallXirrInfo.total,
            });
            setAllHoldings(holdings.sort((a, b) => b.value - a.value));
            setPhase('ready');
          } else {
            setPhase(manual.length > 0 ? 'ready' : 'empty');
          }
        } else {
          // No CAS — check manual
          let manualVal = 0;
          let manualInvested = 0;
          let manualDayGain = 0;
          const mhList = [];
          const allAmfi = new Set();
          manual.forEach(h => {
            if (h.amfi_code && h.fund_type !== 'SIF') allAmfi.add(h.amfi_code);
          });
          const navMap = {};
          const prevNavMap = {};
          const ret1dMap = {};
          let maxDateStr = null;
          const amfiList = [...allAmfi];
          if (amfiList.length > 0) {
            try {
              const r = await fetch(`/api/mf?codes=${encodeURIComponent(amfiList.join(','))}&latest=1`);
              if (r.ok) {
                const d = await r.json();
                if (d.status === 'SUCCESS') {
                  for (const [c, n] of Object.entries(d.navs || {})) {
                    navMap[c] = parseFloat(n);
                  }
                  for (const [c, pn] of Object.entries(d.prev_navs || {})) {
                    prevNavMap[c] = parseFloat(pn);
                  }
                  for (const [c, r1d] of Object.entries(d.ret_1d || {})) {
                    ret1dMap[c] = parseFloat(r1d);
                  }
                  const dateEntries = Object.values(d.dates || {});
                  if (dateEntries.length > 0 && dateEntries[0]) maxDateStr = dateEntries[0];
                }
              }
            } catch (_) {}
          }

          // Fallback for unresolved
          const missingCodes = amfiList.filter(c => !navMap[c]);
          if (missingCodes.length > 0) {
            await Promise.allSettled(missingCodes.map(async amfi => {
              try {
                const r = await fetch(`/api/mf?code=${amfi}&latest=1`);
                if (r.ok) {
                  const d = await r.json();
                  if (d.status === 'SUCCESS' && d.data?.[0]) {
                    navMap[amfi] = parseFloat(d.data[0].nav);
                    if (d.prev_nav) prevNavMap[amfi] = parseFloat(d.prev_nav);
                    if (d.ret_1d != null) ret1dMap[amfi] = parseFloat(d.ret_1d);
                    if (!maxDateStr && d.data[0].date) maxDateStr = d.data[0].date;
                  }
                }
              } catch {}
            }));
          }

          if (maxDateStr) {
            const [dd, mm, yy] = maxDateStr.split('-');
            if (dd && mm && yy) {
              const dObj = new Date(`${yy}-${mm}-${dd}`);
              setNavDate(dObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }));
            }
          }

          manual.forEach(h => {
            const pu = parseFloat(h.purchase_nav);
            const u  = parseFloat(h.units);
            const ln = h.fund_type === 'SIF' ? (localSifMap[h.amfi_code] ?? null) : (navMap[h.amfi_code] ?? null);
            const pn = h.fund_type === 'SIF' ? null : (prevNavMap[h.amfi_code] ?? null);
            const liveNav = ln ?? pu;
            const prevNav = pn ?? null;
            const val = liveNav * u;
            const change1d = prevNav && prevNav > 0 ? (liveNav - prevNav) : 0;
            const change1dPct = prevNav && prevNav > 0
              ? (ret1dMap[h.amfi_code] != null ? ret1dMap[h.amfi_code] : +(((liveNav - prevNav) / prevNav) * 100).toFixed(2))
              : null;
            const dayGain = prevNav && prevNav > 0 ? (u * change1d) : 0;

            manualVal += val;
            manualInvested += (pu * u);
            manualDayGain += dayGain;

            mhList.push({
              id:       `manual-${h.id}`,
              name:     h.fund_name,
              code:     h.amfi_code || null,
              value:    val,
              invested: pu * u,
              liveNav,
              prevNav,
              units:    u,
              change1d,
              change1dPct,
              dayGain,
              isLive:   ln != null,
              category: h.fund_type === 'SIF' ? 'sif' : inferCategory(h.fund_name),
              isSIF:    h.fund_type === 'SIF',
              sifName:  h.fund_type === 'SIF' ? (sifNameByCode[h.amfi_code] || null) : null,
              isManual: true,
              xirr:     manualHoldingXirr({ purchaseDate: h.purchase_date, invested: pu * u, currentValue: val }),
              xirrFlows: manualHoldingCashFlows({ purchaseDate: h.purchase_date, invested: pu * u }),
              folio: h.folio || null,
              amfiCode: h.amfi_code || null,
              fund_type: h.fund_type,
              source: 'manual',
              transactions: (pu > 0 && u > 0 && h.purchase_date)
                ? [{ date: h.purchase_date, type: 'PURCHASE', amount: pu * u, units: u, nav: pu }]
                : [],
            });
          });
          const manualOnlyXirrInfo = bestEffortXirr(mhList, manualVal);
          const prevTotal = manualVal - manualDayGain;
          const manualDayGainPct = prevTotal > 0 ? ((manualDayGain / prevTotal) * 100) : 0;

          setTotals({
            current: manualVal, invested: manualInvested, manual: manualVal,
            dayGain: manualDayGain, dayGainPct: manualDayGainPct,
            xirr: manualOnlyXirrInfo.xirr, xirrPartial: manualOnlyXirrInfo.partial,
            xirrIncluded: manualOnlyXirrInfo.included, xirrTotal: manualOnlyXirrInfo.total,
          });
          setAllHoldings(mhList.sort((a, b) => b.value - a.value));
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
  }, [status, session, viewUserId, isViewingOther, canViewOthers, refreshKey]);

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
                {/* CAS Tracker's own tool now also requires signing in (see
                    api/parse.py / app/api/parse-mfcentral's server-side
                    checks) -- this used to promise anonymous access, which
                    stopped being true. Its PAGE is still worth linking to
                    (public FAQ/feature overview), just not as a "skip
                    sign-in" shortcut. */}
                <a href="/cas-tracker" className="pf-gate-btn-secondary">
                  See how CAS Tracker works →
                </a>
              </div>
              <div className="pf-gate-features">
                {['Live AMFI NAVs', 'Portfolio XIRR', 'FIFO capital gains', 'ELSS lock-in tracker', 'SIF holdings'].map(f => (
                  <span key={f} className="pf-gate-feature">✓ {f}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <PortfolioFaqSection />

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
    : allHoldings;
  const displayTotals = (activePan !== 'all' && panPortfolios[activePan])
    ? {
        current: panPortfolios[activePan].current, invested: panPortfolios[activePan].invested, manual: 0,
        xirr: panPortfolios[activePan].xirr, xirrPartial: panPortfolios[activePan].xirrPartial,
        xirrIncluded: panPortfolios[activePan].xirrIncluded, xirrTotal: panPortfolios[activePan].xirrTotal,
      }
    : totals;
  const displayName = (activePan !== 'all' && panPortfolios[activePan])
    ? panPortfolios[activePan].name
    : investorName;

  const gain       = displayTotals.current - displayTotals.invested;
  const gainPct    = displayTotals.invested > 0 ? ((gain / displayTotals.invested) * 100).toFixed(2) : '0.00';
  const isProfit   = gain >= 0;
  const { g, first } = greeting(displayName);

  // Delete a saved statement — /api/cas/delete already allows this for the
  // statement's own owner (usually whoever uploaded it) or an admin, so no
  // extra permission check is needed client-side; it 403s cleanly if not.
  async function deleteStatement(id) {
    setDeleteInFlight(true);
    setDeleteErr('');
    try {
      const res = await fetch('/api/cas/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || 'Could not delete this statement.');
      setDeletingId('');
      setRefreshKey(k => k + 1);
    } catch (err) {
      setDeleteErr(err.message);
    } finally {
      setDeleteInFlight(false);
    }
  }

  // Lazily fetches a fund's full NAV history for the Transaction History
  // drawer's optional chart overlay -- same logic as app/cas-tracker/
  // page.js's own fetchNavHistory, kept in sync manually since it's a
  // handful of lines wrapping two already-shared API routes rather than
  // something worth its own shared module. Result is cached (keyed by
  // navHistoryCacheKey) so re-opening the same fund's drawer never re-fetches.
  async function fetchNavHistory(fund) {
    const key = navHistoryCacheKey(fund);
    if (!key || navHistoryCache[key]?.points || navHistoryCache[key]?.loading) return;
    setNavHistoryCache(prev => ({ ...prev, [key]: { loading: true } }));
    try {
      const earliest = earliestTxnDate(fund.transactions);
      const cutoffMs = earliest != null ? earliest - 7 * 24 * 3600 * 1000 : null;
      let points;

      if (fund.fund_type === 'SIF') {
        const iso = (d) => d.toISOString().slice(0, 10);
        const fromDate = new Date(cutoffMs ?? Date.now() - 365 * 24 * 3600 * 1000);
        const res = await fetch(`/api/sif-history?sd_id=${encodeURIComponent(fund.amfiCode)}&from=${iso(fromDate)}&to=${iso(new Date())}`);
        const json = await res.json();
        points = (json.records || [])
          .map(r => ({ t: new Date(r.date).getTime(), nav: parseFloat(r.nav) }))
          .filter(p => Number.isFinite(p.nav) && !isNaN(p.t))
          .sort((a, b) => a.t - b.t);
      } else {
        const res = await fetch(`/api/mf?code=${fund.amfiCode}`);
        const json = await res.json();
        points = (json.data || [])
          .map(d => {
            const [dd, mm, yyyy] = d.date.split('-').map(Number);
            return { t: new Date(yyyy, mm - 1, dd).getTime(), nav: parseFloat(d.nav) };
          })
          .filter(p => Number.isFinite(p.nav) && (cutoffMs == null || p.t >= cutoffMs))
          .sort((a, b) => a.t - b.t);
      }

      setNavHistoryCache(prev => ({ ...prev, [key]: { loading: false, points } }));
    } catch {
      setNavHistoryCache(prev => ({ ...prev, [key]: { loading: false, error: true } }));
    }
  }

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

        <PortfolioFaqSection />

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

          {/* Admin / Distributor view banner (read-only notification) */}
          {isViewingOther && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
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
                <button
                  className="pf-text-btn"
                  onClick={() => { setMergeFromPan(''); setMergeOpen(true); }}
                >
                  Manage members
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="container">

        {/* ── Stat row (4 cards: Current Value, Invested, Total Gain, 1-Day Return) ── */}
        <div className="pf-stat-row">
          <div className="pf-stat-card">
            <div className="pf-stat-label">Current Value</div>
            <div className="pf-stat-val" style={{ color: 'var(--g1)', fontSize: '1.35rem' }}>
              ₹{fmtINR(displayTotals.current)}
            </div>
            <div className="pf-stat-sub" style={{ color: 'var(--muted)' }}>
              Live NAVs · {navDate || fmtDate(portfolios[0]?.uploaded_at) || 'Latest'}
            </div>
          </div>

          <div className="pf-stat-card">
            <div className="pf-stat-label">Total Invested</div>
            <div className="pf-stat-val" style={{ color: 'var(--text2)', fontSize: '1.25rem' }}>
              ₹{fmtINR(displayTotals.invested)}
            </div>
            <div className="pf-stat-sub" style={{ color: 'var(--muted)' }}>
              FIFO Cost Basis
            </div>
          </div>

          <div className="pf-stat-card">
            <div className="pf-stat-label">{isProfit ? 'Total Gain' : 'Total Loss'}</div>
            <div className="pf-stat-val" style={{ color: isProfit ? 'var(--g2)' : 'var(--neg)', fontSize: '1.25rem' }}>
              {gain > 0 ? '+' : gain < 0 ? '−' : ''}₹{fmtINR(Math.abs(gain))}
            </div>
            {displayTotals.invested > 0 && (
              <div className="pf-stat-sub" style={{ color: isProfit ? 'var(--g3)' : 'var(--neg-light)' }}>
                {isProfit ? '+' : ''}{gainPct}% all-time
              </div>
            )}
            {Number.isFinite(displayTotals.xirr) && (
              <div className="pf-stat-sub" style={{ color: displayTotals.xirr >= 0 ? 'var(--g3)' : 'var(--neg-light)' }}
                title={displayTotals.xirrPartial ? `Based on ${displayTotals.xirrIncluded} of ${displayTotals.xirrTotal} holdings with a complete transaction history — the rest couldn't be verified against your CAS.` : undefined}>
                {displayTotals.xirr >= 0 ? '+' : ''}{(displayTotals.xirr * 100).toFixed(1)}% Portfolio XIRR
                {displayTotals.xirrPartial && <span style={{ opacity: .7 }}> *</span>}
              </div>
            )}
            {displayTotals.xirrPartial && Number.isFinite(displayTotals.xirr) && (
              <div className="pf-stat-sub" style={{ color: 'var(--muted)', fontSize: '.6rem', marginTop: 1 }}>
                * based on {displayTotals.xirrIncluded}/{displayTotals.xirrTotal} holdings
              </div>
            )}
          </div>

          <div className="pf-stat-card">
            <div className="pf-stat-label">1-Day Return</div>
            <div
              className="pf-stat-val"
              style={{
                color: (displayTotals.dayGain || 0) > 0 ? 'var(--g2)' : (displayTotals.dayGain || 0) < 0 ? 'var(--neg)' : 'var(--text2)',
                fontSize: '1.25rem',
              }}
            >
              {(displayTotals.dayGain || 0) > 0 ? '+' : (displayTotals.dayGain || 0) < 0 ? '−' : ''}₹{fmtINR(Math.abs(displayTotals.dayGain || 0))}
            </div>
            <div
              className="pf-stat-sub"
              style={{
                color: (displayTotals.dayGainPct || 0) > 0 ? 'var(--g3)' : (displayTotals.dayGainPct || 0) < 0 ? 'var(--neg-light)' : 'var(--muted)',
                fontWeight: 700,
              }}
            >
              {(displayTotals.dayGainPct || 0) > 0 ? '▲ +' : (displayTotals.dayGainPct || 0) < 0 ? '▼ −' : ''}
              {Math.abs(displayTotals.dayGainPct || 0).toFixed(2)}% today
            </div>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="pf-tabs">
          {[
            { key: 'overview',  label: 'Overview'  },
            { key: 'holdings',  label: `Holdings (${displayHoldings.length})` },
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
                        name={h.isSIF ? (h.sifName || h.name.split(' ')[0]) : h.name.split(' ')[0]}
                        logoPath={h.isSIF ? getSIFLogo(h.sifName) : getMFLogoFromSchemeName(h.name)}
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
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div className="pf-holding-gain" data-pos={gPos ? 'true' : 'false'}>
                          {gPos ? '+' : ''}{gPct}%
                        </div>
                        {h.change1dPct != null && (
                          <div
                            style={{
                              fontSize: '.58rem',
                              fontWeight: 700,
                              color: h.change1dPct >= 0 ? 'var(--g3)' : 'var(--neg-light)',
                              fontFamily: "'JetBrains Mono', monospace",
                              marginTop: 1,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {h.change1dPct >= 0 ? '▲ +' : '▼ '}{h.change1dPct.toFixed(2)}%
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action cards */}
            <div className="pf-actions">
              <button onClick={() => setActiveTab('holdings')} className="pf-action-card pf-action-primary"
                style={{ font: 'inherit', textAlign: 'left', width: '100%' }}>
                <div className="pf-action-icon">📋</div>
                <div>
                  <div className="pf-action-title">Full Portfolio Analysis</div>
                  <div className="pf-action-sub">Live NAVs · ELSS lock-in · FIFO gains</div>
                </div>
                <span className="pf-action-arrow">→</span>
              </button>
              <button onClick={() => setActiveTab('uploads')} className="pf-action-card"
                style={{ font: 'inherit', textAlign: 'left', width: '100%' }}>
                <div className="pf-action-icon">📄</div>
                <div>
                  <div className="pf-action-title">Manage Statements</div>
                  <div className="pf-action-sub">{portfolios.length} statement{portfolios.length !== 1 ? 's' : ''} uploaded · Upload new CAS</div>
                </div>
                <span className="pf-action-arrow">→</span>
              </button>
            </div>

            {/* Abundance advisory banner */}
            <div className="pf-advisor-card">
              <div className="pf-advisor-icon">✦</div>
              <div className="pf-advisor-body">
                <div className="pf-advisor-title">Want a professional review of your portfolio?</div>
                <div className="pf-advisor-sub">
                  Abundance Advisors analyzes your scheme overlap, risk-adjusted returns, and tax efficiency to recommend an optimized portfolio.
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
                          name={h.isSIF ? (h.sifName || h.name.split(' ')[0]) : h.name.split(' ')[0]}
                          logoPath={h.isSIF ? getSIFLogo(h.sifName) : getMFLogoFromSchemeName(h.name)}
                          size={28}
                          radius={7}
                        />
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <div className="pf-hc-cat" style={{ background: cat.bg, color: cat.fg }}>{cat.label}</div>
                          {h.isManual && <div className="pf-hc-cat" style={{ background: 'var(--s3)', color: 'var(--muted)' }}>Manual</div>}
                          {!h.isManual && h.isELSS && (
                            h.lockedValue > 0
                              ? <div className="elss-badge elss-locked" style={{ margin: 0 }}>🔒 ₹{fmtINR(h.lockedValue)} Locked</div>
                              : <div className="elss-badge elss-unlocked" style={{ margin: 0 }}>🔓 Unlocked</div>
                          )}
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
                        ['Live NAV',      '₹' + h.liveNav.toFixed(4) + (h.change1dPct != null ? ` (${h.change1dPct >= 0 ? '▲ +' : '▼ '}${h.change1dPct.toFixed(2)}%)` : ''), 'var(--text2)', '.7rem'],
                        ['1D Gain',       (h.dayGain > 0 ? '+₹' : h.dayGain < 0 ? '−₹' : '₹') + fmtINR(Math.abs(h.dayGain || 0)), (h.dayGain || 0) >= 0 ? 'var(--g3)' : 'var(--neg-light)', '.72rem'],
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

                    {/* Redemption planning needs real FIFO purchase-lot history, which
                        only CAS-derived holdings have -- Transactions just needs at least
                        one known purchase, which manually-added holdings also have (a
                        single synthesized entry from their purchase date/NAV/units). Same
                        gating app/cas-tracker/page.js's fund cards use. */}
                    {(!h.isManual || h.transactions?.length > 0) && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                        {!h.isManual && (
                          <button
                            onClick={() => setPlanFund(h)}
                            style={{
                              flex: 1, padding: '9px 0', borderRadius: 8,
                              border: 'none',
                              background: 'var(--g1)', cursor: 'pointer',
                              fontSize: '.72rem', fontWeight: 800,
                              color: '#fff', fontFamily: 'Raleway, sans-serif',
                              letterSpacing: '-.2px', transition: 'background .15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--g2)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--g1)'}
                            title="Plan a tax-efficient redemption for this fund"
                          >
                            📊 Redemption
                          </button>
                        )}
                        {h.transactions?.length > 0 && (
                          <button
                            onClick={() => setTxnDrawerFund(h)}
                            title="View transaction-by-transaction rate history"
                            style={{
                              flex: 1, padding: '9px 0', borderRadius: 8,
                              border: '1.5px solid var(--border2)',
                              background: 'var(--s2)', cursor: 'pointer',
                              fontSize: '.72rem', fontWeight: 800,
                              color: 'var(--g2)', fontFamily: 'Raleway, sans-serif',
                              letterSpacing: '-.2px', transition: 'background .15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = 'var(--s3)'}
                            onMouseLeave={e => e.currentTarget.style.background = 'var(--s2)'}
                          >
                            📈 Transactions
                          </button>
                        )}
                      </div>
                    )}
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
                      {deletingId === p.id && deleteErr && (
                        <div style={{ fontSize: '.62rem', color: 'var(--neg)', marginTop: 4 }}>{deleteErr}</div>
                      )}
                    </div>
                    {deletingId === p.id ? (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: '.68rem', color: 'var(--text2)', fontWeight: 600 }}>Delete?</span>
                        <button onClick={() => deleteStatement(p.id)} disabled={deleteInFlight}
                          style={{ fontSize: '.65rem', fontWeight: 800, color: '#fff', background: 'var(--neg)', border: 'none', borderRadius: 7, padding: '7px 12px', cursor: deleteInFlight ? 'wait' : 'pointer' }}>
                          {deleteInFlight ? '…' : 'Yes'}
                        </button>
                        <button onClick={() => { setDeletingId(''); setDeleteErr(''); }} disabled={deleteInFlight}
                          style={{ fontSize: '.65rem', fontWeight: 700, color: 'var(--muted)', background: 'none', border: '1.5px solid var(--border)', borderRadius: 7, padding: '7px 12px', cursor: 'pointer' }}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        <button onClick={() => { setDeletingId(p.id); setDeleteErr(''); }}
                          title="Delete this statement"
                          style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.8rem', color: 'var(--muted)', background: 'var(--s2)', border: '1.5px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
                          🗑
                        </button>
                        <a href={`/cas-tracker?load=${encodeURIComponent(p.blob_key)}`}
                          className="pf-upload-btn">
                          Analyse →
                        </a>
                      </div>
                    )}
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

      {planFund && <RedemptionPlanner fund={planFund} onClose={() => setPlanFund(null)} />}
      {txnDrawerFund && (
        <TransactionHistoryDrawer
          fund={txnDrawerFund}
          navHistory={navHistoryCache[navHistoryCacheKey(txnDrawerFund)]}
          onFetchNavHistory={() => fetchNavHistory(txnDrawerFund)}
          onClose={() => setTxnDrawerFund(null)}
        />
      )}

      <CasMemberMerge
        open={mergeOpen}
        onClose={() => setMergeOpen(false)}
        members={panKeys.map(pan => ({ pan, name: panPortfolios[pan].name, folioNos: panPortfolios[pan].folioNos || [] }))}
        overrides={activeOverrides}
        targetUserId={isViewingOther ? viewUserId : undefined}
        initialFromPan={mergeFromPan}
        onMerged={() => { setMergeOpen(false); setRefreshKey(k => k + 1); }}
      />

      {/* Shown here too (not just the logged-out gate and empty state above)
          so signed-in users viewing their actual dashboard see the same
          help content app/cas-tracker/page.js already shows unconditionally. */}
      <PortfolioFaqSection />

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
