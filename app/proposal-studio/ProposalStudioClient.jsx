'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProviderAvatar from '@/components/ProviderAvatar';
import { startCheckout } from '@/lib/checkoutClient';
import { getMFLogoFromSchemeName } from '@/lib/providerLogos';
import { combineExposure, computeOverlap, computeMCapAllocation } from '@/lib/portfolioAnalysis';

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

        {status !== 'loading' && !isAuthed && <PfcSignInGate />}
        {status !== 'loading' && isAuthed && !isPro && <PfcProGate session={session} />}
        {isAuthed && isPro && <ProposalStudioTool />}
      </main>
      <Footer />
    </>
  );
}

function PfcSignInGate() {
  return (
    <div className="brd-gate">
      <div className="brd-gate-lock">🔒</div>
      <h2 className="brd-gate-title">Sign in to use Proposal Studio</h2>
      <p className="brd-gate-desc">
        Select multiple mutual funds and see combined sector/stock exposure, fund overlap,
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
        Select multiple mutual funds and see combined sector/stock exposure, fund overlap
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

function ProposalStudioTool() {
  const [selectedFunds, setSelectedFunds] = useState([]); // [{amfiCode, schemeName, amount, source: 'cas'|'manual'}]
  const [casFunds, setCasFunds] = useState([]);            // [{amfiCode, schemeName, value}] deduped from CAS
  const [casLoading, setCasLoading] = useState(true);
  const [holdingsByFund, setHoldingsByFund] = useState({}); // amfiCode -> holdings API response
  const [holdingsError, setHoldingsError] = useState({});   // amfiCode -> error message
  const [mCapIndex, setMCapIndex] = useState(null);         // Map<normalizedName, category>
  const [proposalType, setProposalType] = useState('lumpsum'); // 'lumpsum' | 'sip'
  const [sipFrequency, setSipFrequency] = useState('monthly');  // 'daily' | 'monthly'
  const [totalAmount, setTotalAmount] = useState(0);

  // Load the AMFI M-Cap categorization index once on mount.
  useEffect(() => {
    fetch('/data/amfi-cap-categorization.json')
      .then((r) => r.json())
      .then((d) => setMCapIndex(new Map(Object.entries(d.categories))))
      .catch(() => setMCapIndex(new Map()));
  }, []);

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

  // Recomputes every 'manual' fund's amount as an even split of whatever
  // portion of `total` isn't already claimed by 'cas' funds' real values.
  // 'cas' funds' amounts are untouched here -- they represent real money,
  // not a derived split.
  function redistributeManualAmounts(funds, total) {
    const casTotal = funds.filter((f) => f.source === 'cas').reduce((s, f) => s + f.amount, 0);
    const manualFunds = funds.filter((f) => f.source === 'manual');
    if (manualFunds.length === 0) return funds;
    const remaining = Math.max(0, total - casTotal);
    const share = Math.round((remaining / manualFunds.length) * 100) / 100;
    return funds.map((f) => (f.source === 'manual' ? { ...f, amount: share } : f));
  }

  function addCasFund(amfiCode, schemeName, value) {
    if (selectedFunds.some((f) => f.amfiCode === amfiCode)) return;
    setSelectedFunds((prev) => [...prev, { amfiCode, schemeName, amount: value, source: 'cas' }]);
    setTotalAmount((prev) => prev + value);
  }

  function addManualFund(amfiCode, schemeName) {
    if (selectedFunds.some((f) => f.amfiCode === amfiCode)) return;
    setSelectedFunds((prev) => redistributeManualAmounts(
      [...prev, { amfiCode, schemeName, amount: 0, source: 'manual' }],
      totalAmount,
    ));
  }

  function removeFund(amfiCode) {
    const removed = selectedFunds.find((f) => f.amfiCode === amfiCode);
    if (!removed) return;
    const next = selectedFunds.filter((f) => f.amfiCode !== amfiCode);
    if (removed.source === 'cas') {
      const newTotal = Math.max(0, totalAmount - removed.amount);
      setTotalAmount(newTotal);
      setSelectedFunds(redistributeManualAmounts(next, newTotal));
    } else {
      setSelectedFunds(redistributeManualAmounts(next, totalAmount));
    }
  }

  function setFundAmount(amfiCode, amount) {
    setSelectedFunds((prev) => prev.map((f) => (f.amfiCode === amfiCode ? { ...f, amount } : f)));
  }

  function handleTotalAmountChange(newTotal) {
    setTotalAmount(newTotal);
    setSelectedFunds((prev) => redistributeManualAmounts(prev, newTotal));
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
          }
        })
        .catch(() => setHoldingsError((prev) => ({ ...prev, [amfiCode]: 'Failed to load holdings' })));
    });
  }, [selectedFunds, holdingsByFund, holdingsError]);

  return (
    <div className="pfc-tool">
      <FundPicker
        selectedFunds={selectedFunds}
        casFunds={casFunds}
        casLoading={casLoading}
        proposalType={proposalType}
        setProposalType={setProposalType}
        sipFrequency={sipFrequency}
        setSipFrequency={setSipFrequency}
        totalAmount={totalAmount}
        onTotalAmountChange={handleTotalAmountChange}
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

            <ExposureTable title="Asset Allocation" rows={assetAllocation} />
            <ExposureTable title="Sector Exposure" rows={sectorExposure} />
            <ExposureTable title="Stock Exposure" rows={stockExposure} fullRows={fullStockExposure(readyFunds, allocations)} />

            <SchemeDetailsTable selectedFunds={selectedFunds} holdingsByFund={holdingsByFund} />

            {readyFunds.length >= 2 && (
              <OverlapGrid funds={readyFunds} selectedFunds={selectedFunds} />
            )}
            {readyFunds.length === 1 && (
              <div className="pfc-hint">Add another fund to see overlap analysis.</div>
            )}

            {mCapIndex && <MCapTable selectedFunds={selectedFunds} readyFunds={readyFunds} mCapIndex={mCapIndex} allocations={allocations} />}

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

// Same per-stock aggregation combineExposure uses internally, without the
// top-10 truncation -- scoped to this file since only the "show all
// holdings" expansion needs the untruncated list.
function fullStockExposure(funds, allocations) {
  const stock = new Map(); // normalizedName -> {name, pct}
  for (const fund of funds) {
    const fundWeight = (allocations[fund.amfiCode] || 0) / 100;
    for (const h of fund.holdings) {
      if (h.assetClass !== 'EQUITY') continue;
      const w = Math.max(0, h.weightagePct || 0) * fundWeight;
      const key = h.securityName.toLowerCase().replace(/\./g, '').replace(/\b(ltd|limited)\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
      const existing = stock.get(key) || { name: h.securityName, pct: 0 };
      existing.pct += w;
      stock.set(key, existing);
    }
  }
  return [...stock.values()]
    .map((r) => ({ name: r.name, pct: Math.round(r.pct * 100) / 100 }))
    .sort((a, b) => b.pct - a.pct);
}

function ExposureTable({ title, rows, fullRows }) {
  const [showAll, setShowAll] = useState(false);
  const displayRows = showAll && fullRows ? fullRows : rows;
  return (
    <CollapsibleSection title={title}>
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
      {fullRows && (
        <button className="pfc-show-all" onClick={() => setShowAll((s) => !s)}>
          {showAll ? 'Show top 10 only' : `Show all ${fullRows.length} holdings`}
        </button>
      )}
    </CollapsibleSection>
  );
}

// TODO: AUM and expense ratio removed from this table -- both are Direct-plan-only
// values from the underlying data source, misleading for a Regular-plan proposal.
// Re-add once a reliable per-plan (Direct vs Regular) source is found.
function SchemeDetailsTable({ selectedFunds, holdingsByFund }) {
  return (
    <CollapsibleSection title="Scheme Details">
      <table className="pfc-table pfc-table-wide">
        <thead>
          <tr>
            <th>Fund</th>
            <th>Category</th>
            <th>Risk</th>
            <th>Equity Holdings</th>
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
                <td>{d.risk || '—'}</td>
                <td className="pfc-table-pct">{equityCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </CollapsibleSection>
  );
}

function OverlapGrid({ funds, selectedFunds }) {
  const grid = computeOverlap(funds);
  const names = funds.map((f) => selectedFunds.find((s) => s.amfiCode === f.amfiCode)?.schemeName || f.amfiCode);

  return (
    <CollapsibleSection title="Portfolio Overlap (Equity Stocks Only)">
      <div className="pfc-overlap-wrap">
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
      <table className="pfc-table pfc-table-wide">
        <thead>
          <tr>
            <th>Fund</th>
            <th>Large Cap</th>
            <th>Mid Cap</th>
            <th>Small Cap</th>
            <th>Unclassified</th>
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
    </CollapsibleSection>
  );
}

function FundPicker({ selectedFunds, casFunds, casLoading, proposalType, setProposalType, sipFrequency, setSipFrequency, totalAmount, onTotalAmountChange, onAddCas, onAddManual, onRemove, onAmountChange }) {
  const [tab, setTab] = useState('cas');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [showIdcw, setShowIdcw] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (tab !== 'search') return;
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
  }, [query, tab, showIdcw]);

  const selectedCodes = new Set(selectedFunds.map((f) => f.amfiCode));
  const totalEntered = selectedFunds.reduce((s, f) => s + (f.amount || 0), 0);

  return (
    <section className="pfc-picker">
      <div className="pfc-proposal-type">
        <div className="pfc-picker-tabs">
          <button className={proposalType === 'lumpsum' ? 'on' : ''} onClick={() => setProposalType('lumpsum')}>Lumpsum</button>
          <button className={proposalType === 'sip' ? 'on' : ''} onClick={() => setProposalType('sip')}>SIP</button>
        </div>
        <label className="pfc-total-input">
          <span>Total {proposalType === 'sip' ? 'SIP' : 'Lumpsum'} Amount</span>
          <div className="pfc-inp"><i>₹</i>
            <input
              type="number"
              min="0"
              value={totalAmount}
              onChange={(e) => onTotalAmountChange(Math.max(0, +e.target.value || 0))}
            />
          </div>
        </label>
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
          <input
            className="pfc-search-input"
            placeholder="Type at least 3 letters, e.g. 'parag parikh flexi'…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="pfc-idcw-toggle">
            <input type="checkbox" checked={showIdcw} onChange={(e) => setShowIdcw(e.target.checked)} />
            Show IDCW/Dividend plans
          </label>
          {searching && <div className="pfc-hint">Searching…</div>}
          {!searching && query.trim().length >= 3 && results.length === 0 && <div className="pfc-hint">No funds matched. Try a simpler keyword.</div>}
          {results.map((s) => (
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
        </div>
      )}

      {selectedFunds.length > 0 && (
        <div className="pfc-selected">
          <h3>Selected funds ({selectedFunds.length})</h3>
          {selectedFunds.map((f) => (
            <div className="pfc-selected-item" key={f.amfiCode}>
              <div className="pfc-selected-row">
                <ProviderAvatar name={f.schemeName} logoPath={getMFLogoFromSchemeName(f.schemeName)} size={24} radius={6} />
                <span className="pfc-selected-name">{f.schemeName}</span>
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
              {f.amount <= 0 && (
                <div className="pfc-zero-hint">Raise Total Amount above, or reduce another fund's amount, to allocate to this fund.</div>
              )}
            </div>
          ))}
          <div className={`pfc-alloc-total ${Math.abs(totalEntered - totalAmount) > 1 ? 'pfc-alloc-warn' : ''}`}>
            Entered: ₹{totalEntered.toLocaleString('en-IN')} {Math.abs(totalEntered - totalAmount) > 1 && `(should sum to ₹${totalAmount.toLocaleString('en-IN')} total)`}
          </div>
        </div>
      )}
    </section>
  );
}
