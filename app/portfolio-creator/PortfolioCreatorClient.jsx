'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { startCheckout } from '@/lib/checkoutClient';

export default function PortfolioCreatorClient() {
  const { data: session, status } = useSession();
  const isAuthed = status === 'authenticated';
  const isPro = session?.user?.plan === 'pro';

  return (
    <>
      <Navbar activePage="portfolio-creator" />
      <main className="pfc-page">
        <h1 className="pfc-title">Portfolio Creator</h1>
        <p className="pfc-subtitle">Combine funds to see overlap, exposure, and benchmark comparison in one view.</p>

        {status !== 'loading' && !isAuthed && <PfcSignInGate />}
        {status !== 'loading' && isAuthed && !isPro && <PfcProGate session={session} />}
        {isAuthed && isPro && <PortfolioCreatorTool />}
      </main>
      <Footer />
    </>
  );
}

function PfcSignInGate() {
  return (
    <div className="brd-gate">
      <div className="brd-gate-lock">🔒</div>
      <h2 className="brd-gate-title">Sign in to use Portfolio Creator</h2>
      <p className="brd-gate-desc">
        Select multiple mutual funds and see combined sector/stock exposure, fund overlap,
        M-Cap allocation, and benchmark comparison — everything a real investment proposal covers.
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
      <h2 className="brd-gate-title">Portfolio Creator is a Pro feature</h2>
      <p className="brd-gate-desc">
        Select multiple mutual funds and see combined sector/stock exposure, fund overlap
        detection, M-Cap allocation, and benchmark comparison — everything a real investment
        proposal covers, in one view.
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

function PortfolioCreatorTool() {
  const [selectedFunds, setSelectedFunds] = useState([]); // [{amfiCode, schemeName, allocationPct}]
  const [casFunds, setCasFunds] = useState([]);            // [{amfiCode, schemeName}] deduped from CAS
  const [casLoading, setCasLoading] = useState(true);
  const [holdingsByFund, setHoldingsByFund] = useState({}); // amfiCode -> holdings API response
  const [holdingsError, setHoldingsError] = useState({});   // amfiCode -> error message

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
      fetch(`/api/portfolio-creator/holdings?amfiCode=${encodeURIComponent(amfiCode)}&schemeName=${encodeURIComponent(schemeName)}`)
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
      {/* Sections 2-8 render here once funds are selected -- added in Tasks 5 and 6 */}
    </div>
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
