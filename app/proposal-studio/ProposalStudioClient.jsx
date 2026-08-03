'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { startCheckout } from '@/lib/checkoutClient';
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
  const [selectedFunds, setSelectedFunds] = useState([]); // [{amfiCode, schemeName, allocationPct}]
  const [casFunds, setCasFunds] = useState([]);            // [{amfiCode, schemeName}] deduped from CAS
  const [casLoading, setCasLoading] = useState(true);
  const [holdingsByFund, setHoldingsByFund] = useState({}); // amfiCode -> holdings API response
  const [holdingsError, setHoldingsError] = useState({});   // amfiCode -> error message
  const [mCapIndex, setMCapIndex] = useState(null); // Map<normalizedName, category>

  // Load the AMFI M-Cap categorization index once on mount.
  useEffect(() => {
    fetch('/data/amfi-cap-categorization.json')
      .then((r) => r.json())
      .then((d) => setMCapIndex(new Map(Object.entries(d.categories))))
      .catch(() => setMCapIndex(new Map()));
  }, []);

  // Load the user's CAS-derived fund list once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const listRes = await fetch('/api/cas/list').then((r) => r.json());
        const portfolios = listRes.portfolios || [];
        const seen = new Map(); // amfiCode -> schemeName
        for (const p of portfolios) {
          const data = await fetch(`/api/cas/load?key=${encodeURIComponent(p.blob_key)}`).then((r) => r.json());
          for (const folio of data.folios || []) {
            for (const scheme of folio.schemes || []) {
              if (scheme.amfi && parseFloat(scheme.close) > 0.001) {
                seen.set(scheme.amfi, scheme.scheme);
              }
            }
          }
        }
        if (!cancelled) setCasFunds([...seen.entries()].map(([amfiCode, schemeName]) => ({ amfiCode, schemeName })));
      } catch {
        if (!cancelled) setCasFunds([]);
      } finally {
        if (!cancelled) setCasLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const addFund = useCallback((amfiCode, schemeName) => {
    setSelectedFunds((prev) => {
      if (prev.some((f) => f.amfiCode === amfiCode)) return prev;
      const next = [...prev, { amfiCode, schemeName, allocationPct: 0 }];
      const equalPct = Math.round((100 / next.length) * 100) / 100;
      return next.map((f) => ({ ...f, allocationPct: equalPct }));
    });
  }, []);

  const removeFund = useCallback((amfiCode) => {
    setSelectedFunds((prev) => {
      const next = prev.filter((f) => f.amfiCode !== amfiCode);
      if (next.length === 0) return next;
      const equalPct = Math.round((100 / next.length) * 100) / 100;
      return next.map((f) => ({ ...f, allocationPct: equalPct }));
    });
  }, []);

  const setAllocation = useCallback((amfiCode, pct) => {
    setSelectedFunds((prev) => prev.map((f) => (f.amfiCode === amfiCode ? { ...f, allocationPct: pct } : f)));
  }, []);

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
        onAdd={addFund}
        onRemove={removeFund}
        onAllocationChange={setAllocation}
      />
      {selectedFunds.length > 0 && (() => {
        const readyFunds = selectedFunds
          .filter((f) => holdingsByFund[f.amfiCode])
          .map((f) => ({ amfiCode: f.amfiCode, holdings: holdingsByFund[f.amfiCode].holdings }));
        const erroredFunds = selectedFunds.filter((f) => holdingsError[f.amfiCode]);
        const allocations = Object.fromEntries(selectedFunds.map((f) => [f.amfiCode, f.allocationPct]));
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
            <ExposureTable title="Stock Exposure" rows={stockExposure} />

            <SchemeDetailsTable selectedFunds={selectedFunds} holdingsByFund={holdingsByFund} />

            {readyFunds.length >= 2 && (
              <OverlapGrid funds={readyFunds} selectedFunds={selectedFunds} />
            )}
            {readyFunds.length === 1 && (
              <div className="pfc-hint">Add another fund to see overlap analysis.</div>
            )}

            {mCapIndex && <MCapTable selectedFunds={selectedFunds} readyFunds={readyFunds} mCapIndex={mCapIndex} />}

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

function ExposureTable({ title, rows }) {
  return (
    <section className="pfc-section">
      <h2 className="pfc-section-title">{title}</h2>
      <table className="pfc-table">
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="pfc-table-pct">{r.pct.toFixed(2)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SchemeDetailsTable({ selectedFunds, holdingsByFund }) {
  return (
    <section className="pfc-section">
      <h2 className="pfc-section-title">Scheme Details</h2>
      <table className="pfc-table pfc-table-wide">
        <thead>
          <tr>
            <th>Fund</th>
            <th>Category</th>
            <th>AUM (₹ Cr)</th>
            <th>Expense Ratio</th>
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
                <td className="pfc-table-pct">{d.aum != null ? d.aum.toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'}</td>
                <td className="pfc-table-pct">{d.expenseRatio != null ? `${d.expenseRatio}%` : '—'}</td>
                <td>{d.risk || '—'}</td>
                <td className="pfc-table-pct">{equityCount}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function OverlapGrid({ funds, selectedFunds }) {
  const grid = computeOverlap(funds);
  const names = funds.map((f) => selectedFunds.find((s) => s.amfiCode === f.amfiCode)?.schemeName || f.amfiCode);

  return (
    <section className="pfc-section">
      <h2 className="pfc-section-title">Portfolio Overlap (Equity Stocks Only)</h2>
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
    </section>
  );
}

function MCapTable({ selectedFunds, readyFunds, mCapIndex }) {
  const rows = readyFunds.map((f) => {
    const selected = selectedFunds.find((s) => s.amfiCode === f.amfiCode);
    const name = selected?.schemeName || f.amfiCode;
    const allocationPct = selected?.allocationPct || 0;
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
    <section className="pfc-section">
      <h2 className="pfc-section-title">Scheme M-Cap Allocation</h2>
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
    </section>
  );
}

function FundPicker({ selectedFunds, casFunds, casLoading, onAdd, onRemove, onAllocationChange }) {
  const [tab, setTab] = useState('cas');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    if (tab !== 'search') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.trim().length < 3) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const data = await fetch(`/api/mf?q=${encodeURIComponent(query.trim())}`).then((r) => r.json());
        const regular = (Array.isArray(data) ? data : []).filter((s) => !/\bdirect\b/i.test(s.schemeName));
        setResults(regular.slice(0, 40));
      } catch {
        setResults([]);
      }
      setSearching(false);
    }, 280);
    return () => timerRef.current && clearTimeout(timerRef.current);
  }, [query, tab]);

  const selectedCodes = new Set(selectedFunds.map((f) => f.amfiCode));
  const totalAllocation = selectedFunds.reduce((s, f) => s + (f.allocationPct || 0), 0);

  return (
    <section className="pfc-picker">
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
              onClick={() => onAdd(f.amfiCode, f.schemeName)}
            >
              {f.schemeName}
              <span className="pfc-add">{selectedCodes.has(f.amfiCode) ? 'Added' : 'Add'}</span>
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
          {searching && <div className="pfc-hint">Searching…</div>}
          {!searching && query.trim().length >= 3 && results.length === 0 && <div className="pfc-hint">No funds matched. Try a simpler keyword.</div>}
          {results.map((s) => (
            <button
              key={s.schemeCode}
              className="pfc-picker-item"
              disabled={selectedCodes.has(s.schemeCode)}
              onClick={() => onAdd(s.schemeCode, s.schemeName)}
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
            <div className="pfc-selected-row" key={f.amfiCode}>
              <span className="pfc-selected-name">{f.schemeName}</span>
              <input
                type="number"
                className="pfc-alloc-input"
                min="0"
                max="100"
                step="0.1"
                value={f.allocationPct}
                onChange={(e) => onAllocationChange(f.amfiCode, parseFloat(e.target.value) || 0)}
              />
              <span className="pfc-alloc-pct">%</span>
              <button className="pfc-remove" onClick={() => onRemove(f.amfiCode)}>Remove</button>
            </div>
          ))}
          <div className={`pfc-alloc-total ${Math.abs(totalAllocation - 100) > 0.5 ? 'pfc-alloc-warn' : ''}`}>
            Total allocation: {Math.round(totalAllocation * 100) / 100}% {Math.abs(totalAllocation - 100) > 0.5 && '(should sum to 100%)'}
          </div>
        </div>
      )}
    </section>
  );
}
