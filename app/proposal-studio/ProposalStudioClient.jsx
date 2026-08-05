'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProviderAvatar from '@/components/ProviderAvatar';
import RiskGauge from '@/components/RiskGauge';
import { startCheckout } from '@/lib/checkoutClient';
import { getMFLogoFromSchemeName } from '@/lib/providerLogos';
import { combineExposure, computeOverlap, computeMCapAllocation, normalizeName, isComparableHolding } from '@/lib/portfolioAnalysis';
import { PROPOSAL_STUDIO_FAQ } from '@/lib/proposalStudioFaq';
import { donutChartSvg, barRankingSvg, overlapHeatmapSvg, stackedBarSvg } from '@/lib/chartSvg';
import { blendedRate, buildProjectionTable, ASSUMED_CAGR } from '@/lib/growthProjection';

export default function ProposalStudioClient() {
  const { data: session, status } = useSession();
  const isAuthed = status === 'authenticated';
  const isPro = session?.user?.plan === 'pro';

  return (
    <>
      <Navbar activePage="proposal-studio" />
      <main className="pfc-page">
        <h1 className="pfc-title">Proposal Studio</h1>
        <p className="pfc-subtitle">Combine funds to see overlap, exposure, and scheme details in one view.</p>

        <PfcExplainer />

        {status !== 'loading' && !isAuthed && <PfcSignInGate />}
        {status !== 'loading' && isAuthed && !isPro && <PfcProGate session={session} />}
        {isAuthed && isPro && <ProposalStudioTool />}

        <PfcFaq />
      </main>
      <Footer />
    </>
  );
}

function PfcExplainer() {
  return (
    <section className="pfc-explainer">
      <p>
        Proposal Studio combines the mutual funds and SIFs you choose — either your real
        holdings imported from a CAS statement, or a new investment plan you're building —
        into a single combined view: how your money is spread across asset classes and
        sectors, which holdings — stocks, bonds, gold or other ETFs — show up in more than
        one fund (overlap), and how much sits in Large, Mid, and Small-cap companies.
      </p>
      <ul className="pfc-explainer-list">
        <li>Combined asset allocation and sector exposure across every fund you add</li>
        <li>Security-level exposure, with a full-holdings view beyond just the top 10</li>
        <li>Pairwise fund overlap — how much of every named holding (stocks, bonds, gold/other ETFs) is duplicated between funds</li>
        <li>M-Cap allocation using AMFI's official Large/Mid/Small-cap categorization</li>
        <li>Works for a Lumpsum or a SIP proposal, with mutual funds and SIFs both supported</li>
      </ul>
    </section>
  );
}

function PfcFaq() {
  return (
    <section className="pfc-faq">
      <h2 className="pfc-faq-title">Frequently Asked Questions</h2>
      {PROPOSAL_STUDIO_FAQ.map((f) => (
        <PfcFaqItem key={f.q} q={f.q} a={f.a} />
      ))}
    </section>
  );
}

// Deliberately does NOT reuse CollapsibleSection: that component conditionally
// *mounts* its body ({open && <div>...}), so a closed FAQ item's answer text
// never reaches the DOM at all -- invisible to crawlers even though the page
// is otherwise indexable, and inconsistent with the FAQPage JSON-LD (layout.js)
// which does carry the full answer text. This keeps the answer always in the
// DOM and only toggles visibility, matching app/pms-screener/page.jsx's
// existing `hidden={!open}` FAQ pattern.
function PfcFaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="pfc-faq-item">
      <button className="pfc-section-header" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <h3 className="pfc-faq-q">{q}</h3>
        <span className={`pfc-chevron ${open ? 'pfc-chevron-open' : ''}`}>▾</span>
      </button>
      <div className="pfc-faq-a" hidden={!open}>
        <p>{a}</p>
      </div>
    </div>
  );
}

function PfcSignInGate() {
  return (
    <div className="brd-gate">
      <div className="brd-gate-lock">🔒</div>
      <h2 className="brd-gate-title">Sign in to use Proposal Studio</h2>
      <p className="brd-gate-desc">
        Select multiple mutual funds and see combined sector/security exposure, fund overlap,
        and M-Cap allocation — everything a real investment proposal covers.
      </p>
      <div className="brd-gate-actions">
        <button className="brd-gate-btn" onClick={() => signIn()}>Sign in to continue →</button>
      </div>
    </div>
  );
}

function PfcProGate({ session }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleUpgrade() {
    setLoading(true);
    setError('');
    try {
      await startCheckout({
        plan: 'annual',
        session,
        onSuccess() { window.location.reload(); },
        onDismiss() { setLoading(false); },
      });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="brd-gate">
      <div className="brd-gate-lock">⭐</div>
      <h2 className="brd-gate-title">Proposal Studio is a Pro feature</h2>
      <p className="brd-gate-desc">
        Select multiple mutual funds and see combined sector/security exposure, fund overlap
        detection, and M-Cap allocation — everything a real investment proposal covers, in
        one view.
      </p>
      <div className="brd-gate-pricing">
        <span className="brd-gate-amount">₹499</span>
        <span className="brd-gate-period">/yr + 18% GST</span>
        <span className="brd-gate-total">· Total ₹588.82</span>
      </div>
      <div className="brd-gate-actions">
        <button className="brd-gate-btn brd-gate-btn-pro" onClick={handleUpgrade} disabled={loading}>
          {loading ? 'Opening checkout…' : 'Upgrade to Pro →'}
        </button>
        <a className="brd-gate-faq" href="/pricing">See all Pro features · Lifetime plan available</a>
      </div>
      {error && <p className="brd-gate-error">{error}</p>}
    </div>
  );
}

function ClientDetailsCard({ clientName, setClientName, clientEmail, setClientEmail, clientPhone, setClientPhone, onTouched }) {
  const handleChange = (setter) => (e) => { onTouched(); setter(e.target.value); };
  return (
    <section className="pfc-client-details">
      <h3>Client Details</h3>
      <div className="pfc-client-fields">
        <input className="pfc-client-input" placeholder="Client name" value={clientName} onChange={handleChange(setClientName)} />
        <input className="pfc-client-input" type="email" placeholder="Client email" value={clientEmail} onChange={handleChange(setClientEmail)} />
        <input className="pfc-client-input" type="tel" placeholder="Client phone" value={clientPhone} onChange={handleChange(setClientPhone)} />
      </div>
    </section>
  );
}

function ProposalStudioTool() {
  const { data: session } = useSession();
  const [selectedFunds, setSelectedFunds] = useState([]); // [{amfiCode, schemeName, amount, source: 'cas'|'manual', amountTouched}]
  const [casFunds, setCasFunds] = useState([]);            // [{amfiCode, schemeName, value}] deduped from CAS
  const [casLoading, setCasLoading] = useState(true);
  const [holdingsByFund, setHoldingsByFund] = useState({}); // amfiCode -> holdings API response
  const [holdingsError, setHoldingsError] = useState({});   // amfiCode -> error message
  const [mCapIndex, setMCapIndex] = useState(null);         // Map<normalizedName, category>
  const [proposalType, setProposalType] = useState('lumpsum'); // 'lumpsum' | 'sip'
  const [sipFrequency, setSipFrequency] = useState('monthly');  // 'daily' | 'monthly'
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientFieldsTouched, setClientFieldsTouched] = useState(false);

  // Total is a derived sum of every selected fund's amount, not a separate
  // target you set first -- add funds, type an amount for each, the total
  // just adds up. Requiring a total upfront blocked basic use.
  const totalAmount = selectedFunds.reduce((s, f) => s + (f.amount || 0), 0);

  // Load the AMFI M-Cap categorization index once on mount.
  useEffect(() => {
    fetch('/data/amfi-cap-categorization.json')
      .then((r) => r.json())
      .then((d) => setMCapIndex(new Map(Object.entries(d.categories))))
      .catch(() => setMCapIndex(new Map()));
  }, []);

  // Prefill client details from session, only until the user edits
  useEffect(() => {
    if (clientFieldsTouched) return;
    if (session?.user?.name) setClientName(session.user.name);
    if (session?.user?.email) setClientEmail(session.user.email);
  }, [session, clientFieldsTouched]);

  // Load the user's CAS-derived fund list once on mount, including each
  // fund's real current value (units x NAV, same computation app/portfolio/page.jsx
  // already does) so it can pre-fill an accurate amount instead of an even split.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const listRes = await fetch('/api/cas/list').then((r) => r.json());
        const portfolios = listRes.portfolios || [];
        const seen = new Map(); // amfiCode -> {schemeName, value}
        for (const p of portfolios) {
          const data = await fetch(`/api/cas/load?key=${encodeURIComponent(p.blob_key)}`).then((r) => r.json());
          for (const folio of data.folios || []) {
            for (const scheme of folio.schemes || []) {
              const units = parseFloat(scheme.close) || 0;
              if (scheme.amfi && units > 0.001) {
                const nav = parseFloat(scheme.valuation?.nav || 0);
                seen.set(scheme.amfi, { schemeName: scheme.scheme, value: Math.round(units * nav * 100) / 100 });
              }
            }
          }
        }
        if (!cancelled) {
          setCasFunds([...seen.entries()].map(([amfiCode, v]) => ({ amfiCode, schemeName: v.schemeName, value: v.value })));
        }
      } catch {
        if (!cancelled) setCasFunds([]);
      } finally {
        if (!cancelled) setCasLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function addCasFund(amfiCode, schemeName, value) {
    if (selectedFunds.some((f) => f.amfiCode === amfiCode)) return;
    // CAS funds already carry their real invested value -- nothing to fill in later.
    setSelectedFunds((prev) => [...prev, { amfiCode, schemeName, amount: value, source: 'cas', amountTouched: true }]);
  }

  function addManualFund(amfiCode, schemeName) {
    if (selectedFunds.some((f) => f.amfiCode === amfiCode)) return;
    // Starts at 0; the holdings-fetch effect below fills in the fund's real
    // minimum investment amount once its data arrives, unless the user has
    // already typed their own amount in the meantime (amountTouched).
    setSelectedFunds((prev) => [...prev, { amfiCode, schemeName, amount: 0, source: 'manual', amountTouched: false }]);
  }

  function removeFund(amfiCode) {
    setSelectedFunds((prev) => prev.filter((f) => f.amfiCode !== amfiCode));
  }

  function setFundAmount(amfiCode, amount) {
    setSelectedFunds((prev) => prev.map((f) => (f.amfiCode === amfiCode ? { ...f, amount, amountTouched: true } : f)));
  }

  // Fetch holdings for any selected fund not yet loaded.
  useEffect(() => {
    selectedFunds.forEach(({ amfiCode, schemeName }) => {
      if (holdingsByFund[amfiCode] || holdingsError[amfiCode]) return;
      fetch(`/api/proposal-studio/holdings?amfiCode=${encodeURIComponent(amfiCode)}&schemeName=${encodeURIComponent(schemeName)}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.error) {
            setHoldingsError((prev) => ({ ...prev, [amfiCode]: data.error }));
          } else {
            setHoldingsByFund((prev) => ({ ...prev, [amfiCode]: data }));
            // Default a just-added manual fund's amount to its real minimum
            // investment (matching the current proposal type) instead of
            // leaving it at 0 -- but only if the user hasn't already typed
            // their own amount in the meantime.
            setSelectedFunds((prev) => prev.map((f) => {
              if (f.amfiCode !== amfiCode || f.source !== 'manual' || f.amountTouched) return f;
              const min = proposalType === 'sip' ? data.minSipInvestment : data.minInvestment;
              return min > 0 ? { ...f, amount: min } : f;
            }));
          }
        })
        .catch(() => setHoldingsError((prev) => ({ ...prev, [amfiCode]: 'Failed to load holdings' })));
    });
  }, [selectedFunds, holdingsByFund, holdingsError, proposalType]);

  // The effect above only sets a fund's minimum-investment default at the
  // moment its holdings first arrive. If the user switches Lumpsum <-> SIP
  // AFTER that (for a fund whose amount was never manually edited), this
  // keeps the amount synced to the newly-relevant minimum instead of
  // silently staying at the old proposal type's figure. amountTouched is
  // deliberately never set by auto-fill (see addManualFund/the effect
  // above) specifically so this can keep tracking it.
  useEffect(() => {
    setSelectedFunds((prev) => prev.map((f) => {
      if (f.source !== 'manual' || f.amountTouched) return f;
      const data = holdingsByFund[f.amfiCode];
      if (!data) return f; // still loading -- the fetch effect will set it on arrival
      const min = proposalType === 'sip' ? data.minSipInvestment : data.minInvestment;
      return min > 0 && f.amount !== min ? { ...f, amount: min } : f;
    }));
  }, [proposalType, holdingsByFund]);

  return (
    <div className="pfc-tool">
      <ClientDetailsCard
        clientName={clientName} setClientName={setClientName}
        clientEmail={clientEmail} setClientEmail={setClientEmail}
        clientPhone={clientPhone} setClientPhone={setClientPhone}
        onTouched={() => setClientFieldsTouched(true)}
      />
      <FundPicker
        selectedFunds={selectedFunds}
        casFunds={casFunds}
        casLoading={casLoading}
        proposalType={proposalType}
        setProposalType={setProposalType}
        sipFrequency={sipFrequency}
        setSipFrequency={setSipFrequency}
        totalAmount={totalAmount}
        onAddCas={addCasFund}
        onAddManual={addManualFund}
        onRemove={removeFund}
        onAmountChange={setFundAmount}
      />
      {selectedFunds.length > 0 && (() => {
        const readyFunds = selectedFunds
          .filter((f) => holdingsByFund[f.amfiCode])
          .map((f) => ({ amfiCode: f.amfiCode, holdings: holdingsByFund[f.amfiCode].holdings }));
        const erroredFunds = selectedFunds.filter((f) => holdingsError[f.amfiCode]);
        const allocations = Object.fromEntries(
          selectedFunds.map((f) => [f.amfiCode, totalAmount > 0 ? (f.amount / totalAmount) * 100 : 0]),
        );
        const pendingCount = selectedFunds.length - readyFunds.length - erroredFunds.length;

        const errorNotices = erroredFunds.length > 0 && (
          <div className="pfc-fund-errors">
            {erroredFunds.map((f) => (
              <div className="pfc-error-hint" key={f.amfiCode}>
                Couldn't load holdings for {f.schemeName}: {holdingsError[f.amfiCode]}
              </div>
            ))}
          </div>
        );

        if (readyFunds.length === 0) {
          if (erroredFunds.length === selectedFunds.length) {
            return errorNotices;
          }
          return (
            <>
              {errorNotices}
              <div className="pfc-hint">Loading holdings…</div>
            </>
          );
        }

        const { assetAllocation, sectorExposure, stockExposure } = combineExposure(readyFunds, allocations);

        return (
          <>
            {errorNotices}
            {pendingCount > 0 && <div className="pfc-hint">Loading holdings for {pendingCount} more fund(s)…</div>}

            <div className="pfc-actions">
              <button
                className="pfc-export-btn"
                disabled={pendingCount > 0}
                title={pendingCount > 0 ? 'Wait for all fund holdings to finish loading before exporting' : undefined}
                onClick={() => exportProposalPDF({
                  proposalType, sipFrequency, totalAmount, selectedFunds,
                  assetAllocation, sectorExposure, stockExposure, readyFunds, allocations, mCapIndex,
                  erroredFunds, clientName, clientEmail, clientPhone, holdingsByFund,
                })}
              >
                {pendingCount > 0 ? 'Export / Print Proposal (loading…)' : 'Export / Print Proposal'}
              </button>
            </div>

            <ExposureTable title="Asset Allocation" rows={assetAllocation} chart="donut" />
            <ExposureTable title="Sector Exposure" rows={sectorExposure} chart="bars" />
            <ExposureTable title="Security Exposure" rows={stockExposure} fullRows={fullSecurityExposure(readyFunds, allocations)} chart="bars" />

            <SchemeDetailsTable selectedFunds={selectedFunds} holdingsByFund={holdingsByFund} />

            {readyFunds.length >= 2 && (
              <OverlapGrid funds={readyFunds} selectedFunds={selectedFunds} />
            )}
            {readyFunds.length === 1 && (
              <div className="pfc-hint">Add another fund to see overlap analysis.</div>
            )}

            {mCapIndex && <MCapTable selectedFunds={selectedFunds} readyFunds={readyFunds} mCapIndex={mCapIndex} allocations={allocations} />}

            <GrowthProjectionTable proposalType={proposalType} totalAmount={totalAmount} sipFrequency={sipFrequency} assetAllocation={assetAllocation} />

            <ClosingSection />

            {/* BenchmarkSection hidden for launch: it only matches funds benchmarked
                directly to a BSE index, which excludes most real funds. Revisit once
                AMFI's official FundCategory -> NSE/BSE index mapping
                (https://www.amfiindia.com/otherdata/listofbenchmarkindices) is wired up
                with NSE-first (pages/api/index-dashboard.js) / BSE-fallback matching. */}
          </>
        );
      })()}
    </div>
  );
}

// `svg` is always our own generated string from lib/chartSvg.js (never
// user-controlled raw HTML/markup) -- the same trust boundary already
// relied on elsewhere in this file for scheme logos.
function InlineSvg({ svg, className }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: svg }} />;
}

function CollapsibleSection({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="pfc-section">
      <button className="pfc-section-header" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <h2 className="pfc-section-title">{title}</h2>
        <span className={`pfc-chevron ${open ? 'pfc-chevron-open' : ''}`}>▾</span>
      </button>
      {open && <div className="pfc-section-body">{children}</div>}
    </section>
  );
}

// Same per-security aggregation combineExposure uses internally, without the
// top-10 truncation -- scoped to this file since only the "show all
// holdings" expansion needs the untruncated list. Named holdings of any
// asset class (equity stocks, specific bonds, REITs, gold/other ETFs) are
// included, matching combineExposure's isComparableHolding filter; generic
// cash-equivalent bucket names (Repo, Net Current Assets, etc.) are excluded.
function fullSecurityExposure(funds, allocations) {
  const security = new Map(); // normalizedName -> {name, pct}
  for (const fund of funds) {
    const fundWeight = (allocations[fund.amfiCode] || 0) / 100;
    for (const h of fund.holdings) {
      if (!isComparableHolding(h)) continue;
      const w = Math.max(0, h.weightagePct || 0) * fundWeight;
      const key = normalizeName(h.securityName);
      const existing = security.get(key) || { name: h.securityName, pct: 0 };
      existing.pct += w;
      security.set(key, existing);
    }
  }
  return [...security.values()]
    .map((r) => ({ name: r.name, pct: Math.round(r.pct * 100) / 100 }))
    .sort((a, b) => b.pct - a.pct);
}

// Branded print/PDF export -- opens a self-contained HTML document in a new
// window and triggers the browser's print dialog (Save as PDF), matching the
// pattern already established in app/backtest/page.js's doExport(). Recomputes
// overlap/M-Cap from the same lib/portfolioAnalysis functions the live tables
// use, rather than threading pre-built rows through, so this stays correct if
// those functions change.
function exportProposalPDF({
  proposalType, sipFrequency, totalAmount, selectedFunds,
  assetAllocation, sectorExposure, stockExposure, readyFunds, allocations, mCapIndex,
  erroredFunds, clientName, clientEmail, clientPhone, holdingsByFund,
}) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const typeLabel = proposalType === 'sip' ? `SIP (${sipFrequency === 'daily' ? 'Daily' : 'Monthly'})` : 'Lumpsum';

  const kpi = (l, v) => `<div class="banner-cell"><div class="banner-lbl">${l}</div><div class="banner-val">${v}</div></div>`;
  const banner = [
    kpi(`Total ${proposalType === 'sip' ? 'SIP' : 'Lumpsum'}`, inr(totalAmount)),
    kpi('Funds', String(selectedFunds.length)),
    kpi('Type', typeLabel),
  ].join('');

  const fundRows = selectedFunds.map((f) => {
    const logo = getMFLogoFromSchemeName(f.schemeName);
    const logoImg = logo
      ? `<img src="${logo}" alt="" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:6px;border-radius:3px;border:1px solid #d7e7d8" onerror="this.style.display='none'">`
      : '';
    const pct = totalAmount > 0 ? (f.amount / totalAmount) * 100 : 0;
    return `<tr><td>${logoImg}${esc(f.schemeName)}</td><td class="num">${inr(f.amount)}</td><td class="num">${pct.toFixed(1)}%</td></tr>`;
  }).join('');

  const pctRows = (rows) => rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${r.pct.toFixed(2)}%</td></tr>`).join('');
  const exposureSection = (title, rows, chartType) => rows.length === 0 ? '' : `
    <div class="sec-block">
    <div class="sec">${title}</div>
    ${chartType === 'donut' ? `<div class="chart-center">${donutChartSvg(rows)}</div>` : chartType === 'bars' ? barRankingSvg(rows.slice(0, 10)) : ''}
    <table class="ptable"><tbody>${pctRows(rows)}</tbody></table>
    </div>`;

  // The "Selected Funds" table below lists every fund with its amount, but
  // the analysis sections (allocation/exposure/overlap/M-Cap) only cover
  // readyFunds -- a fund whose holdings failed to load is silently absent
  // from those percentages. Call that out explicitly rather than letting
  // the numbers look complete when they aren't.
  const erroredNoteHTML = erroredFunds && erroredFunds.length > 0
    ? `<div class="meta" style="margin-top:10px">&#9888;&#65039; Excluded from Asset Allocation, Sector/Security Exposure, Overlap, and M-Cap Allocation below (holdings data unavailable): ${erroredFunds.map((f) => esc(f.schemeName)).join('; ')}.</div>`
    : '';

  let overlapHTML = '';
  if (readyFunds.length >= 2) {
    const grid = computeOverlap(readyFunds);
    const names = readyFunds.map((f) => selectedFunds.find((s) => s.amfiCode === f.amfiCode)?.schemeName || f.amfiCode);
    overlapHTML = `
      <div class="sec-block">
      <div class="sec">Portfolio Overlap (Named Holdings)</div>
      ${overlapHeatmapSvg(names, grid)}
      <table class="ptable"><thead><tr><th></th>${names.map((n) => `<th class="num">${esc(n)}</th>`).join('')}</tr></thead>
      <tbody>${grid.map((row, i) => `<tr><th style="text-align:left">${esc(names[i])}</th>${row.map((v, j) => `<td class="num${i === j ? ' diag' : ''}">${v.toFixed(1)}%</td>`).join('')}</tr>`).join('')}</tbody></table>
      </div>`;
  }

  let mcapHTML = '';
  if (mCapIndex && readyFunds.length > 0) {
    const rows = readyFunds.map((f) => {
      const name = selectedFunds.find((s) => s.amfiCode === f.amfiCode)?.schemeName || f.amfiCode;
      const allocationPct = allocations[f.amfiCode] || 0;
      return { name, allocationPct, ...computeMCapAllocation(f, mCapIndex) };
    });
    const totalAllocation = rows.reduce((s, r) => s + r.allocationPct, 0);
    const weightedAvg = totalAllocation > 0
      ? {
          large: rows.reduce((s, r) => s + r.large * r.allocationPct, 0) / totalAllocation,
          mid: rows.reduce((s, r) => s + r.mid * r.allocationPct, 0) / totalAllocation,
          small: rows.reduce((s, r) => s + r.small * r.allocationPct, 0) / totalAllocation,
          unclassified: rows.reduce((s, r) => s + r.unclassified * r.allocationPct, 0) / totalAllocation,
        }
      : { large: 0, mid: 0, small: 0, unclassified: 0 };
    mcapHTML = `
      <div class="sec-block">
      <div class="sec">Scheme M-Cap Allocation</div>
      ${stackedBarSvg(rows)}
      <table class="ptable"><thead><tr><th style="text-align:left">Fund</th><th class="num">Large Cap</th><th class="num">Mid Cap</th><th class="num">Small Cap</th><th class="num">Unclassified</th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${r.large.toFixed(1)}%</td><td class="num">${r.mid.toFixed(1)}%</td><td class="num">${r.small.toFixed(1)}%</td><td class="num">${r.unclassified.toFixed(1)}%</td></tr>`).join('')}
      <tr class="avg"><td>Portfolio (weighted avg)</td><td class="num">${weightedAvg.large.toFixed(1)}%</td><td class="num">${weightedAvg.mid.toFixed(1)}%</td><td class="num">${weightedAvg.small.toFixed(1)}%</td><td class="num">${weightedAvg.unclassified.toFixed(1)}%</td></tr>
      </tbody></table>
      </div>`;
  }

  const projectionRate = blendedRate(assetAllocation);
  const projectionRows = buildProjectionTable({ proposalType, totalAmount, sipFrequency, blendedRate: projectionRate });
  const projectionHTML = `
    <div class="sec-block">
    <div class="sec">Growth Projection</div>
    <p style="font-size:.62rem;color:#5e8a5e;margin-bottom:8px;line-height:1.5;">
      Assumed return: <b>${(projectionRate * 100).toFixed(2)}% p.a.</b>, blended from this portfolio's asset mix per AMFI Best Practices Guidelines Circular No. 109 (Equity ${(ASSUMED_CAGR.EQUITY * 100).toFixed(2)}%, Debt ${(ASSUMED_CAGR.DEBT * 100).toFixed(2)}%, Gold ${(ASSUMED_CAGR.GOLD * 100).toFixed(2)}%).
    </p>
    <table class="ptable"><thead><tr><th style="text-align:left">Year</th><th class="num">Total Invested</th><th class="num">Projected Value</th></tr></thead>
    <tbody>${projectionRows.map((r) => `<tr><td>${r.year}</td><td class="num">${inr(r.totalInvested)}</td><td class="num">${inr(r.projectedValue)}</td></tr>`).join('')}</tbody></table>
    <p style="font-size:.55rem;color:#5e8a5e;margin-top:6px;">Past performance may or may not be sustained in future and is not a guarantee of any future returns. This is an illustration using AMFI's prescribed assumed rates, not a projection specific to the funds in this proposal.</p>
    </div>`;

  const schemeDetailRows = selectedFunds.map((f) => {
    const d = holdingsByFund[f.amfiCode];
    if (!d) return '';
    const aum = d.aumCr != null ? d.aumCr.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—';
    const aumWithAsOf = d.aumCr != null && d.aumAsOf ? `${aum}<br/><span style="font-size:.7em;font-weight:400;color:#8fae8f">${esc(d.aumAsOf)}</span>` : aum;
    const riskLabel = d.risk ? esc(d.risk) + (d.riskSource === 'benchmark' ? ' (benchmark)' : '') : '—';
    return `<tr><td>${esc(f.schemeName)}</td><td>${esc(d.category || '—')}</td><td>${riskLabel}</td><td class="num">${aumWithAsOf}</td><td>${esc(d.launchDate || '—')}</td></tr>`;
  }).join('');
  const schemeDetailsHTML = `
    <div class="sec-block">
    <div class="sec">Scheme Details</div>
    <table class="ptable"><thead><tr><th style="text-align:left">Fund</th><th style="text-align:left">Category</th><th style="text-align:left">Risk</th><th class="num">AUM (Cr)</th><th style="text-align:left">Inception</th></tr></thead>
    <tbody>${schemeDetailRows}</tbody></table>
    </div>`;

  const win = window.open('', '_blank', 'width=960,height=760');
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Investment Proposal${clientName ? ' - ' + esc(clientName) : ''} | Abundance Financial Services</title>
<link href="https://fonts.googleapis.com/css2?family=Raleway:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:"Raleway",sans-serif;background:#fff;color:#162616;padding:30px 36px}
.ph{display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:2.5px solid #2e7d32;margin-bottom:18px}
.pt{font-size:1.05rem;font-weight:800;color:#2e7d32}.pa{font-size:.6rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;margin-top:2px}
.logo{height:44px;object-fit:contain;mix-blend-mode:multiply}
.sec{font-size:.56rem;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:#5e8a5e;margin:16px 0 8px;display:flex;align-items:center;gap:7px}
.sec::after{content:"";flex:1;height:1px;background:#c2dfc2}
.banner-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px}
.banner-cell{background:#edf6ed;border:1.5px solid #c2dfc2;border-radius:8px;padding:10px 12px;text-align:center}
.banner-lbl{font-size:.52rem;font-weight:800;text-transform:uppercase;letter-spacing:.8px;color:#5e8a5e;margin-bottom:3px}
.banner-val{font-family:"JetBrains Mono",monospace;font-size:.9rem;font-weight:700;color:#1b5e20}
.ptable{width:100%;border-collapse:collapse;font-size:.62rem;margin-bottom:4px}
.ptable th{background:#1e4d20;color:#fff;font-size:.58rem;font-weight:700;letter-spacing:.5px;padding:6px 8px;text-align:right}
.ptable th:first-child{text-align:left}
.ptable td{padding:5px 8px;border-bottom:1px solid #e8f5e9;text-align:right;font-family:"JetBrains Mono",monospace;font-size:.65rem;font-weight:600}
.ptable td:first-child{text-align:left;font-family:"Raleway",sans-serif;font-weight:700;max-width:220px}
.ptable tr:nth-child(even) td{background:#f5fbf5}
.ptable .diag{background:#dcedc8;font-weight:800}
.ptable tr.avg td{background:#edf6ed;font-weight:800}
.num{text-align:right}
svg{max-width:100%;height:auto;display:block;margin-bottom:8px}
.chart-center{display:flex;justify-content:center}
.dis{padding:9px 13px;border-radius:7px;background:#fffde7;border-left:3px solid #f9a825;font-size:.6rem;color:#5d4037;line-height:1.65;font-family:"JetBrains Mono",monospace;margin-top:14px}
.closing-cols{display:flex;gap:28px;margin-bottom:6px}
.closing-col{flex:1}
.closing-h{font-size:.62rem;font-weight:800;color:#1b5e20;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.closing-list{margin:0;padding-left:16px;font-size:.62rem;line-height:1.6;color:#333}
.closing-list li{margin-bottom:4px}
.meta{font-size:.55rem;color:#5e8a5e;font-family:"JetBrains Mono",monospace;margin-top:6px}
@media print{body{padding:16px 20px;-webkit-print-color-adjust:exact;print-color-adjust:exact}@page{margin:.8cm;size:A4 portrait}}
.cover { min-height: 700px; display: flex; flex-direction: column; justify-content: center; background: linear-gradient(135deg, #0a2e0a 0%, #1b5e20 50%, #2e7d32 100%); color: #fff; padding: 60px 50px; margin: -30px -36px 0; }
.cover-logo img { height: 48px; object-fit: contain; margin-bottom: 30px; }
.cover-title { font-size: 2.2rem; font-weight: 800; margin-bottom: 30px; }
.cover-blocks { display: flex; gap: 40px; margin-bottom: 30px; }
.cover-label { font-size: .6rem; letter-spacing: 1.5px; text-transform: uppercase; opacity: .65; margin-bottom: 4px; }
.cover-name { font-size: 1.1rem; font-weight: 700; }
.cover-detail { font-size: .8rem; opacity: .8; margin-top: 2px; }
.cover-stats { margin-bottom: 20px; }
.cover-date { opacity: .55; font-size: .75rem; }
.page-break { page-break-after: always; }
.running-header { display: none; }
@media print {
  .running-header { display: flex; align-items: center; gap: 8px; position: fixed; top: 0; left: 0; right: 0; padding: 8px 36px; background: #fff; border-bottom: 1px solid #e8f5e9; font-size: .6rem; color: #5e8a5e; font-weight: 700; z-index: 10; }
  .running-header img { height: 16px; }
  body { padding-top: 34px; }
  .cover { margin: -16px -20px 0; }
}
.sec-block { page-break-inside: avoid; }
</style></head><body>
<div class="running-header"><img src="/logo-og.png" onerror="this.style.display='none'">Abundance Financial Services</div>
<div class="cover">
  <div class="cover-logo"><img src="/logo-mark-white.png" onerror="this.style.display='none'"></div>
  <div class="cover-title">Investment Proposal</div>
  <div class="cover-blocks">
    <div class="cover-block">
      <div class="cover-label">Prepared For</div>
      <div class="cover-name">${esc(clientName || 'Client')}</div>
      ${clientEmail ? `<div class="cover-detail">${esc(clientEmail)}</div>` : ''}
      ${clientPhone ? `<div class="cover-detail">${esc(clientPhone)}</div>` : ''}
    </div>
    <div class="cover-block">
      <div class="cover-label">Prepared By</div>
      <div class="cover-name">Atin Kumar Agrawal</div>
      <div class="cover-detail">ARN-251838</div>
    </div>
  </div>
  <div class="cover-stats banner-grid">${banner}</div>
  <div class="cover-date">${esc(dateStr)}</div>
</div>
<div class="page-break"></div>
<div class="ph">
  <div><div class="pt">Investment Proposal — ${esc(typeLabel)}</div>
  <div class="pa">Abundance Financial Services® · ARN-251838 · AMFI Registered Mutual Fund &amp; SIF Distributor</div></div>
  <img class="logo" src="/logo-og.png" onerror="this.style.display='none'">
</div>
<div class="sec-block">
<div class="sec">Selected Funds</div>
<table class="ptable"><thead><tr><th style="text-align:left">Fund</th><th class="num">Amount</th><th class="num">% of Total</th></tr></thead><tbody>${fundRows}</tbody></table>
</div>
${erroredNoteHTML}
${schemeDetailsHTML}
${exposureSection('Asset Allocation', assetAllocation, 'donut')}
${exposureSection('Sector Exposure', sectorExposure, 'bars')}
${exposureSection('Security Exposure (Top Holdings)', stockExposure, 'bars')}
${overlapHTML}
${mcapHTML}
${projectionHTML}
<div class="sec-block">
  <div class="sec">Expectations, Next Steps &amp; Disclaimer</div>
  <div class="closing-cols">
    <div class="closing-col">
      <div class="closing-h">Expectations From You</div>
      <ul class="closing-list">
        <li>Confirm the investment amount and Lumpsum/SIP type above reflect what you actually intend to invest.</li>
        <li>Review the asset allocation and satisfy yourself it matches your risk appetite and time horizon.</li>
        <li>Review the funds/SIFs selected, their allocation, and the overlap and M-Cap figures shown above.</li>
        <li>Review each fund's category, risk rating, AUM, and inception date in Scheme Details.</li>
        <li>Read the disclaimer below in full before proceeding.</li>
      </ul>
    </div>
    <div class="closing-col">
      <div class="closing-h">Next Steps</div>
      <ul class="closing-list">
        <li>Get in touch with any questions or changes before we proceed.</li>
        <li>Confirm your go-ahead so we can help you execute this plan.</li>
        <li>Complete any KYC/account requirements needed for the funds involved.</li>
        <li>We'll share the actual transaction/application forms once you confirm.</li>
      </ul>
    </div>
  </div>
  <div class="dis">&#9888;&#65039; <strong style="color:#e65100">Disclaimer:</strong> This investment proposal has been prepared by Atin Kumar Agrawal, an AMFI-registered Mutual Fund and SIF Distributor, based on the information and preferences you've shared with us. It illustrates a possible portfolio for your reference — it is not investment advice, a recommendation, or a solicitation to invest in any specific fund, and there is no assurance the allocation or funds shown will achieve any particular outcome. Mutual fund and SIF investments are subject to market risks, including possible loss of principal; past performance is not indicative of future results, and the Growth Projection above uses AMFI's own prescribed assumed rates, not a fund-specific forecast. Please read the Scheme Information Document, Statement of Additional Information, and Key Information Memorandum of each scheme carefully before investing. This proposal is non-binding — you are under no obligation to act on it, and we encourage you to seek independent financial, tax, or legal advice where needed. Figures are based on each fund's most recently disclosed portfolio and AMFI's own Large/Mid/Small-cap categorization. | ARN-251838 | Abundance Financial Services | EUIN: E334718</div>
</div>
<div class="meta">Generated ${esc(dateStr)} · mfcalc.getabundance.in/proposal-studio</div>
</body></html>`);
  win.document.close();
  win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 600);
  setTimeout(() => { try { win.focus(); win.print(); } catch (e) {} }, 1400);
}

function ExposureTable({ title, rows, fullRows, chart }) {
  const [showAll, setShowAll] = useState(false);
  const displayRows = showAll && fullRows ? fullRows : rows;
  return (
    <CollapsibleSection title={title}>
      {chart === 'donut' && <InlineSvg className="pfc-chart pfc-chart-center" svg={donutChartSvg(rows)} />}
      {chart === 'bars' && <InlineSvg className="pfc-chart" svg={barRankingSvg(rows.slice(0, 10))} />}
      <div className="pfc-table-wrap">
        <table className="pfc-table">
          <tbody>
            {displayRows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="pfc-table-pct">{r.pct.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fullRows && (
        <button className="pfc-show-all" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show top 10 only' : `Show all ${fullRows.length} holdings`}
        </button>
      )}
    </CollapsibleSection>
  );
}

// TODO: Expense ratio still not shown here -- it's a Direct-plan-only value
// from the underlying data source, misleading for a Regular-plan proposal.
// Re-add once a reliable per-plan (Direct vs Regular) source is found. AUM
// and Inception Date below come from data/amfi-aum.json instead (AMFI's own
// scheme-level AUM disclosure), which is plan-agnostic, so no such caveat
// applies to those two columns.
//
// RISK_SCORE_BY_LABEL: RiskGauge needs a numeric score (1-7) to position the
// needle, but /api/proposal-studio/holdings only returns the label (from the
// underlying data source's own "risk" field, or the benchmark fallback's
// label) -- map label back to the same score scale RiskGauge already uses
// via RISK_CONFIG's ordering.
const RISK_SCORE_BY_LABEL = { 'Low': 1, 'Low To Moderate': 2, 'Moderate': 3, 'Moderately High': 4, 'High': 5, 'Very High': 6 };

function SchemeDetailsTable({ selectedFunds, holdingsByFund }) {
  return (
    <CollapsibleSection title="Scheme Details">
      <div className="pfc-table-wrap">
        <table className="pfc-table pfc-table-wide">
          <thead>
            <tr>
              <th>Fund</th>
              <th>Category</th>
              <th>Risk</th>
              <th className="pfc-table-pct">AUM (Cr)</th>
              <th>Inception</th>
              <th className="pfc-table-pct">Equity Holdings</th>
            </tr>
          </thead>
          <tbody>
            {selectedFunds.map((f) => {
              const d = holdingsByFund[f.amfiCode];
              if (!d) return null;
              const equityCount = d.holdings.filter((h) => h.assetClass === 'EQUITY').length;
              return (
                <tr key={f.amfiCode}>
                  <td>{f.schemeName}</td>
                  <td>{d.category}{d.subCategory ? ` · ${d.subCategory}` : ''}</td>
                  <td>
                    {d.risk ? <RiskGauge label={d.risk} score={RISK_SCORE_BY_LABEL[d.risk] || 3} /> : '—'}
                    {d.riskSource === 'benchmark' && <span className="pfc-risk-benchmark-note"> (benchmark)</span>}
                  </td>
                  <td className="pfc-table-pct">
                    <div className="pfc-aum-cell">
                      <span>{d.aumCr != null ? d.aumCr.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}</span>
                      {d.aumCr != null && d.aumAsOf && <span className="pfc-aum-asof">{d.aumAsOf}</span>}
                    </div>
                  </td>
                  <td>{d.launchDate || '—'}</td>
                  <td className="pfc-table-pct">{equityCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

function OverlapGrid({ funds, selectedFunds }) {
  const grid = computeOverlap(funds);
  const names = funds.map((f) => selectedFunds.find((s) => s.amfiCode === f.amfiCode)?.schemeName || f.amfiCode);

  return (
    <CollapsibleSection title="Portfolio Overlap (Named Holdings)">
      <InlineSvg className="pfc-chart pfc-chart-scroll" svg={overlapHeatmapSvg(names, grid)} />
      <div className="pfc-table-wrap">
        <table className="pfc-table pfc-overlap-table">
          <thead>
            <tr>
              <th></th>
              {names.map((n, i) => <th key={i}>{n}</th>)}
            </tr>
          </thead>
          <tbody>
            {grid.map((row, i) => (
              <tr key={i}>
                <th>{names[i]}</th>
                {row.map((v, j) => (
                  <td key={j} className={`pfc-table-pct ${i === j ? 'pfc-overlap-diag' : ''}`}>{v.toFixed(1)}%</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

function GrowthProjectionTable({ proposalType, totalAmount, sipFrequency, assetAllocation }) {
  const rate = blendedRate(assetAllocation);
  const rows = buildProjectionTable({ proposalType, totalAmount, sipFrequency, blendedRate: rate });
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');

  return (
    <CollapsibleSection title="Growth Projection">
      <p className="pfc-projection-note">
        Assumed return: <b>{(rate * 100).toFixed(2)}% p.a.</b>, blended from your portfolio's actual asset mix using AMFI's own fixed illustration rates
        (Equity {(ASSUMED_CAGR.EQUITY * 100).toFixed(2)}%, Debt {(ASSUMED_CAGR.DEBT * 100).toFixed(2)}%, Gold {(ASSUMED_CAGR.GOLD * 100).toFixed(2)}% — AMFI Best Practices Guidelines Circular No. 109).
      </p>
      <div className="pfc-table-wrap">
        <table className="pfc-table">
          <thead>
            <tr>
              <th>Year</th>
              <th className="pfc-table-pct">Total Invested</th>
              <th className="pfc-table-pct">Projected Value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year}>
                <td>{r.year}</td>
                <td className="pfc-table-pct">{inr(r.totalInvested)}</td>
                <td className="pfc-table-pct">{inr(r.projectedValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pfc-projection-disclaimer">
        Past performance may or may not be sustained in future and is not a guarantee of any future returns. This is an illustration using AMFI's prescribed assumed rates, not a projection specific to the funds in this proposal.
      </p>
    </CollapsibleSection>
  );
}

function ClosingSection() {
  return (
    <CollapsibleSection title="Expectations, Next Steps & Disclaimer">
      <div className="pfc-closing-cols">
        <div className="pfc-closing-col">
          <h4>Expectations From You</h4>
          <ul>
            <li>Confirm the investment amount and Lumpsum/SIP type reflect what you actually intend to invest.</li>
            <li>Review the asset allocation and satisfy yourself it matches your risk appetite and time horizon.</li>
            <li>Review the funds/SIFs selected, their allocation, and the overlap and M-Cap figures above.</li>
            <li>Review each fund's category, risk rating, AUM, and inception date in Scheme Details.</li>
            <li>Read the disclaimer below in full before proceeding.</li>
          </ul>
        </div>
        <div className="pfc-closing-col">
          <h4>Next Steps</h4>
          <ul>
            <li>Get in touch with any questions or changes before we proceed.</li>
            <li>Confirm your go-ahead so we can help you execute this plan.</li>
            <li>Complete any KYC/account requirements needed for the funds involved.</li>
            <li>We'll share the actual transaction/application forms once you confirm.</li>
          </ul>
        </div>
      </div>
      <p className="pfc-closing-disclaimer">
        This investment proposal has been prepared by Atin Kumar Agrawal, an AMFI-registered Mutual Fund and SIF Distributor, based on the information and preferences you've shared with us. It illustrates a possible portfolio for your reference — it is not investment advice, a recommendation, or a solicitation to invest in any specific fund, and there is no assurance the allocation or funds shown will achieve any particular outcome. Mutual fund and SIF investments are subject to market risks, including possible loss of principal; past performance is not indicative of future results, and the Growth Projection above uses AMFI's own prescribed assumed rates, not a fund-specific forecast. Please read the Scheme Information Document, Statement of Additional Information, and Key Information Memorandum of each scheme carefully before investing. This proposal is non-binding — you are under no obligation to act on it, and we encourage you to seek independent financial, tax, or legal advice where needed. Figures are based on each fund's most recently disclosed portfolio and AMFI's own Large/Mid/Small-cap categorization. | ARN-251838 | Abundance Financial Services | EUIN: E334718
      </p>
    </CollapsibleSection>
  );
}

function MCapTable({ selectedFunds, readyFunds, mCapIndex, allocations }) {
  const rows = readyFunds.map((f) => {
    const selected = selectedFunds.find((s) => s.amfiCode === f.amfiCode);
    const name = selected?.schemeName || f.amfiCode;
    const allocationPct = allocations[f.amfiCode] || 0;
    return { name, allocationPct, ...computeMCapAllocation(f, mCapIndex) };
  });

  // Portfolio-weighted average row: weight each fund's Large/Mid/Small/
  // Unclassified % by that fund's allocation %, summed and divided by the
  // total allocation actually represented by readyFunds (not a hardcoded
  // 100, since some selected funds may still be loading).
  const totalAllocation = rows.reduce((s, r) => s + r.allocationPct, 0);
  const weightedAvg = totalAllocation > 0
    ? {
        large: rows.reduce((s, r) => s + r.large * r.allocationPct, 0) / totalAllocation,
        mid: rows.reduce((s, r) => s + r.mid * r.allocationPct, 0) / totalAllocation,
        small: rows.reduce((s, r) => s + r.small * r.allocationPct, 0) / totalAllocation,
        unclassified: rows.reduce((s, r) => s + r.unclassified * r.allocationPct, 0) / totalAllocation,
      }
    : { large: 0, mid: 0, small: 0, unclassified: 0 };

  return (
    <CollapsibleSection title="Scheme M-Cap Allocation">
      <InlineSvg className="pfc-chart pfc-chart-scroll" svg={stackedBarSvg(rows)} />
      <div className="pfc-table-wrap">
        <table className="pfc-table pfc-table-wide">
          <thead>
            <tr>
              <th>Fund</th>
              <th className="pfc-table-pct">Large Cap</th>
              <th className="pfc-table-pct">Mid Cap</th>
              <th className="pfc-table-pct">Small Cap</th>
              <th className="pfc-table-pct">Unclassified</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td className="pfc-table-pct">{r.large.toFixed(1)}%</td>
                <td className="pfc-table-pct">{r.mid.toFixed(1)}%</td>
                <td className="pfc-table-pct">{r.small.toFixed(1)}%</td>
                <td className="pfc-table-pct">{r.unclassified.toFixed(1)}%</td>
              </tr>
            ))}
            <tr className="pfc-mcap-avg">
              <td>Portfolio (weighted avg)</td>
              <td className="pfc-table-pct">{weightedAvg.large.toFixed(1)}%</td>
              <td className="pfc-table-pct">{weightedAvg.mid.toFixed(1)}%</td>
              <td className="pfc-table-pct">{weightedAvg.small.toFixed(1)}%</td>
              <td className="pfc-table-pct">{weightedAvg.unclassified.toFixed(1)}%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </CollapsibleSection>
  );
}

function FundPicker({ selectedFunds, casFunds, casLoading, proposalType, setProposalType, sipFrequency, setSipFrequency, totalAmount, onAddCas, onAddManual, onRemove, onAmountChange }) {
  const [tab, setTab] = useState('cas');
  const [searchKind, setSearchKind] = useState('mf'); // 'mf' | 'sif'
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showIdcw, setShowIdcw] = useState(false);
  const [sifList, setSifList] = useState([]);
  const [sifLoading, setSifLoading] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    if (tab !== 'search' || searchKind !== 'mf') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.trim().length < 3) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await fetch(`/api/mf?q=${encodeURIComponent(query.trim())}`).then((r) => r.json());
        let filtered = (Array.isArray(data) ? data : []).filter((s) => !/\bdirect\b/i.test(s.schemeName));
        if (!showIdcw) {
          filtered = filtered.filter((s) => !/\b(idcw|dividend|bonus|payout|reinvest)\b/i.test(s.schemeName));
        }
        setResults(filtered.slice(0, 40));
      } catch {
        setResults([]);
      }
      setSearching(false);
    }, 280);
    return () => timerRef.current && clearTimeout(timerRef.current);
  }, [query, tab, showIdcw, searchKind]);

  // SIF list is small and static per session -- fetch once, filter client-side
  // as the user types (same pattern app/backtest/page.js's Picker already uses).
  useEffect(() => {
    fetch('/api/sif-nav')
      .then((r) => r.json())
      .then((d) => setSifList(d.schemes || []))
      .catch(() => setSifList([]))
      .finally(() => setSifLoading(false));
  }, []);

  const sifFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sifList.filter((s) => !q || (s.nav_name || '').toLowerCase().includes(q) || (s.category || '').toLowerCase().includes(q));
  }, [query, sifList]);

  const selectedCodes = new Set(selectedFunds.map((f) => f.amfiCode));

  return (
    <section className="pfc-picker">
      <div className="pfc-proposal-type">
        <div className="pfc-picker-tabs">
          <button className={proposalType === 'lumpsum' ? 'on' : ''} onClick={() => setProposalType('lumpsum')}>Lumpsum</button>
          <button className={proposalType === 'sip' ? 'on' : ''} onClick={() => setProposalType('sip')}>SIP</button>
        </div>
        <div className="pfc-total-input">
          <span>Total {proposalType === 'sip' ? 'SIP' : 'Lumpsum'} Amount</span>
          <div className="pfc-total-readout">₹{totalAmount.toLocaleString('en-IN')}</div>
        </div>
        {proposalType === 'sip' && (
          <div className="pfc-picker-tabs pfc-freq-tabs">
            <button className={sipFrequency === 'monthly' ? 'on' : ''} onClick={() => setSipFrequency('monthly')}>Monthly</button>
            <button className={sipFrequency === 'daily' ? 'on' : ''} onClick={() => setSipFrequency('daily')}>Daily</button>
          </div>
        )}
      </div>

      <div className="pfc-picker-tabs">
        <button className={tab === 'cas' ? 'on' : ''} onClick={() => setTab('cas')}>From your CAS holdings</button>
        <button className={tab === 'search' ? 'on' : ''} onClick={() => setTab('search')}>Search any fund</button>
      </div>

      {tab === 'cas' && (
        <div className="pfc-picker-list">
          {casLoading && <div className="pfc-hint">Loading your CAS holdings…</div>}
          {!casLoading && casFunds.length === 0 && <div className="pfc-hint">No CAS statement found. Upload one on the CAS Tracker page, or search for a fund manually.</div>}
          {casFunds.map((f) => (
            <button
              key={f.amfiCode}
              className="pfc-picker-item"
              disabled={selectedCodes.has(f.amfiCode)}
              onClick={() => onAddCas(f.amfiCode, f.schemeName, f.value)}
            >
              {f.schemeName}
              <span className="pfc-add">{selectedCodes.has(f.amfiCode) ? 'Added' : `Add · ₹${f.value.toLocaleString('en-IN')}`}</span>
            </button>
          ))}
        </div>
      )}

      {tab === 'search' && (
        <div className="pfc-picker-list">
          <div className="pfc-picker-tabs pfc-search-kind-tabs">
            <button className={searchKind === 'mf' ? 'on' : ''} onClick={() => setSearchKind('mf')}>Mutual Funds</button>
            <button className={searchKind === 'sif' ? 'on' : ''} onClick={() => setSearchKind('sif')}>SIFs</button>
          </div>
          <input
            className="pfc-search-input"
            placeholder={searchKind === 'sif' ? "Filter SIFs by name or category…" : "Type at least 3 letters, e.g. 'parag parikh flexi'…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searchKind === 'mf' && (
            <label className="pfc-idcw-toggle">
              <input type="checkbox" checked={showIdcw} onChange={(e) => setShowIdcw(e.target.checked)} />
              Show IDCW/Dividend plans
            </label>
          )}
          {searchKind === 'mf' && searching && <div className="pfc-hint">Searching…</div>}
          {searchKind === 'mf' && !searching && query.trim().length >= 3 && results.length === 0 && <div className="pfc-hint">No funds matched. Try a simpler keyword.</div>}
          {searchKind === 'mf' && results.map((s) => (
            <button
              key={s.schemeCode}
              className="pfc-picker-item"
              disabled={selectedCodes.has(s.schemeCode)}
              onClick={() => onAddManual(s.schemeCode, s.schemeName)}
            >
              {s.schemeName}
              <span className="pfc-add">{selectedCodes.has(s.schemeCode) ? 'Added' : 'Add'}</span>
            </button>
          ))}
          {searchKind === 'sif' && sifLoading && <div className="pfc-hint">Loading SIFs…</div>}
          {searchKind === 'sif' && !sifLoading && sifFiltered.length === 0 && <div className="pfc-hint">No SIFs matched.</div>}
          {searchKind === 'sif' && sifFiltered.map((s) => (
            <button
              key={s.scheme_id}
              className="pfc-picker-item"
              disabled={selectedCodes.has(s.scheme_id)}
              onClick={() => onAddManual(s.scheme_id, s.nav_name)}
            >
              {s.nav_name}
              <span className="pfc-add">{selectedCodes.has(s.scheme_id) ? 'Added' : 'Add'}</span>
            </button>
          ))}
        </div>
      )}

      {selectedFunds.length > 0 && (
        <div className="pfc-selected">
          <h3>Selected funds ({selectedFunds.length})</h3>
          {selectedFunds.map((f) => (
            <div className="pfc-selected-item" key={f.amfiCode}>
              <div className="pfc-selected-row">
                <div className="pfc-selected-main">
                  <ProviderAvatar name={f.schemeName} logoPath={getMFLogoFromSchemeName(f.schemeName)} size={24} radius={6} />
                  <span className="pfc-selected-name">{f.schemeName}</span>
                </div>
                <div className="pfc-selected-controls">
                  <div className="pfc-amount-input"><i>₹</i>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={f.amount}
                      onChange={(e) => onAmountChange(f.amfiCode, Math.max(0, +e.target.value || 0))}
                    />
                  </div>
                  <button className="pfc-remove" onClick={() => onRemove(f.amfiCode)}>Remove</button>
                </div>
              </div>
              {f.amount <= 0 && (
                <div className="pfc-zero-hint">This fund has no amount yet — set one to include it in the analysis.</div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
