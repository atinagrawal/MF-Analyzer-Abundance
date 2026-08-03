# Proposal Studio Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the shipped Portfolio Creator page into Proposal Studio: rename it, replace the raw-% allocation input with a proposal-type (Lumpsum/SIP) + amount model that pre-fills real CAS values, filter fund search to Growth-only with an IDCW toggle, drop misleading Direct-plan-only Scheme Details fields, and add collapsible sections, fund logos, a full-holdings view, and a visual polish pass.

**Architecture:** This is a rename-then-modify sequence on a single existing client component (`app/portfolio-creator/PortfolioCreatorClient.jsx` → `app/proposal-studio/ProposalStudioClient.jsx`) and its API route, with no changes to `lib/portfolioAnalysis.js` — that library only ever needs an `{amfiCode: pct}` allocations map, which is now *derived* from ₹ amounts at render time instead of typed directly.

**Tech Stack:** Next.js 16 App Router, plain React state, existing `ProviderAvatar`/`getMFLogoFromSchemeName` components (no new dependencies).

## Global Constraints

- Each proposal is either Lumpsum or SIP, never mixed — no unit-conversion logic between the two is needed anywhere.
- The IDCW/Dividend toggle applies **only** to the manual-search tab. CAS-imported holdings are never filtered — they reflect what the user actually owns.
- `lib/portfolioAnalysis.js` is not modified by this plan — every task derives the `{amfiCode: pct}` map it already expects.
- AUM and expense ratio are removed from the rendered Scheme Details table (both are Direct-plan-only values from the underlying data source) — the API route may keep returning them, this is a rendering-only change, marked with a `TODO` comment.
- CSS class prefix stays `pfc-` throughout (an internal naming detail, not worth a purely-cosmetic rename risk) — only the feature name, route, and component name change.

---

### Task 1: Rename Portfolio Creator → Proposal Studio

**Files:**
- Rename: `app/portfolio-creator/layout.js` → `app/proposal-studio/layout.js`
- Rename: `app/portfolio-creator/page.jsx` → `app/proposal-studio/page.jsx`
- Rename: `app/portfolio-creator/PortfolioCreatorClient.jsx` → `app/proposal-studio/ProposalStudioClient.jsx`
- Rename: `app/portfolio-creator/portfolio-creator.css` → `app/proposal-studio/proposal-studio.css`
- Rename: `app/api/portfolio-creator/holdings/route.js` → `app/api/proposal-studio/holdings/route.js`
- Modify: `components/Navbar.jsx:37`

**Interfaces:**
- Produces: the route `/proposal-studio` and API route `/api/proposal-studio/holdings`, which every later task in this plan uses.

- [ ] **Step 1: Move the files with git, preserving history**

```bash
git mv app/portfolio-creator app/proposal-studio-tmp
mkdir -p app/proposal-studio
git mv app/proposal-studio-tmp/layout.js app/proposal-studio/layout.js
git mv app/proposal-studio-tmp/page.jsx app/proposal-studio/page.jsx
git mv app/proposal-studio-tmp/PortfolioCreatorClient.jsx app/proposal-studio/ProposalStudioClient.jsx
git mv app/proposal-studio-tmp/portfolio-creator.css app/proposal-studio/proposal-studio.css
rmdir app/proposal-studio-tmp
git mv app/api/portfolio-creator app/api/proposal-studio
```

- [ ] **Step 2: Update `app/proposal-studio/layout.js`**

Replace the whole file:

```js
export const metadata = {
  title: 'Proposal Studio — Multi-Fund Overlap & Exposure Analysis | Abundance Financial Services',
  description: 'Select your mutual funds and see combined sector/stock exposure, fund overlap, and M-Cap allocation in one view. A Pro feature for clients of Abundance Financial Services (ARN-251838).',
  robots: { index: false, follow: false }, // personalized tool behind a paywall -- not a crawlable landing page (SEO work deferred separately)
};

export default function ProposalStudioLayout({ children }) {
  return children;
}
```

- [ ] **Step 3: Update `app/proposal-studio/page.jsx`**

Replace the whole file:

```jsx
import ProposalStudioClient from './ProposalStudioClient';
import './proposal-studio.css';

export default function ProposalStudioPage() {
  return <ProposalStudioClient />;
}
```

- [ ] **Step 4: Update the renamed `ProposalStudioClient.jsx`'s self-references**

Find and replace exactly these strings (nothing else in the file changes in this task):

```
export default function PortfolioCreatorClient() {
```
→
```
export default function ProposalStudioClient() {
```

```
        <h1 className="pfc-title">Portfolio Creator</h1>
```
→
```
        <h1 className="pfc-title">Proposal Studio</h1>
```

```
        <h2 className="brd-gate-title">Sign in to use Portfolio Creator</h2>
```
→
```
        <h2 className="brd-gate-title">Sign in to use Proposal Studio</h2>
```

```
        <h2 className="brd-gate-title">Portfolio Creator is a Pro feature</h2>
```
→
```
        <h2 className="brd-gate-title">Proposal Studio is a Pro feature</h2>
```

```
function PortfolioCreatorTool() {
```
→
```
function ProposalStudioTool() {
```

```
      {isAuthed && isPro && <PortfolioCreatorTool />}
```
→
```
      {isAuthed && isPro && <ProposalStudioTool />}
```

```
      fetch(`/api/portfolio-creator/holdings?amfiCode=${encodeURIComponent(amfiCode)}&schemeName=${encodeURIComponent(schemeName)}`)
```
→
```
      fetch(`/api/proposal-studio/holdings?amfiCode=${encodeURIComponent(amfiCode)}&schemeName=${encodeURIComponent(schemeName)}`)
```

- [ ] **Step 5: Update the Navbar entry**

In `components/Navbar.jsx`, find:
```js
  { key: 'portfolio-creator', label: '🧩 Portfolio Creator', href: '/portfolio-creator' },
```
Replace with:
```js
  { key: 'proposal-studio', label: '🧩 Proposal Studio', href: '/proposal-studio' },
```

- [ ] **Step 6: Update the page's own `activePage` prop**

In `ProposalStudioClient.jsx`, find:
```jsx
      <Navbar activePage="portfolio-creator" />
```
Replace with:
```jsx
      <Navbar activePage="proposal-studio" />
```

- [ ] **Step 7: Build and verify**

Run: `npm run build`
Expected: build succeeds, `/proposal-studio` appears in the route manifest, `/portfolio-creator` no longer does.

- [ ] **Step 8: Commit**

```bash
git add -A app/proposal-studio app/api/proposal-studio components/Navbar.jsx
git commit -m "refactor(proposal-studio): rename Portfolio Creator to Proposal Studio"
```

---

### Task 2: Proposal type & amount input model

**Files:**
- Modify: `app/proposal-studio/ProposalStudioClient.jsx`
- Modify: `app/proposal-studio/proposal-studio.css`

**Interfaces:**
- Consumes: `combineExposure`, `computeOverlap`, `computeMCapAllocation` from `lib/portfolioAnalysis.js` (unchanged, still expects `{amfiCode: pct}`).
- Produces: `selectedFunds` shape becomes `[{amfiCode, schemeName, amount, source: 'cas'|'manual'}]`; `allocations` (derived `{amfiCode: pct}` map, `pct = totalAmount > 0 ? (amount/totalAmount)*100 : 0`) is computed once per render and passed to `combineExposure`/`MCapTable`. Later tasks (3, 4, 5, 6, 7, 8) all build on this file's state shape.

- [ ] **Step 1: Replace `ProposalStudioTool`'s state and handlers**

In `ProposalStudioClient.jsx`, replace the whole `function ProposalStudioTool() { ... }` block (from `function ProposalStudioTool() {` through the line right before `function ExposureTable`) with:

```jsx
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
            <ExposureTable title="Stock Exposure" rows={stockExposure} />

            <SchemeDetailsTable selectedFunds={selectedFunds} holdingsByFund={holdingsByFund} />

            {readyFunds.length >= 2 && (
              <OverlapGrid funds={readyFunds} selectedFunds={selectedFunds} />
            )}
            {readyFunds.length === 1 && (
              <div className="pfc-hint">Add another fund to see overlap analysis.</div>
            )}

            {mCapIndex && <MCapTable selectedFunds={selectedFunds} readyFunds={readyFunds} mCapIndex={mCapIndex} allocations={allocations} />}
          </>
        );
      })()}
    </div>
  );
}
```

- [ ] **Step 2: Update `MCapTable` to use the derived `allocations` map**

Find:
```jsx
function MCapTable({ selectedFunds, readyFunds, mCapIndex }) {
  const rows = readyFunds.map((f) => {
    const selected = selectedFunds.find((s) => s.amfiCode === f.amfiCode);
    const name = selected?.schemeName || f.amfiCode;
    const allocationPct = selected?.allocationPct || 0;
    return { name, allocationPct, ...computeMCapAllocation(f, mCapIndex) };
  });
```
Replace with:
```jsx
function MCapTable({ selectedFunds, readyFunds, mCapIndex, allocations }) {
  const rows = readyFunds.map((f) => {
    const selected = selectedFunds.find((s) => s.amfiCode === f.amfiCode);
    const name = selected?.schemeName || f.amfiCode;
    const allocationPct = allocations[f.amfiCode] || 0;
    return { name, allocationPct, ...computeMCapAllocation(f, mCapIndex) };
  });
```
(The rest of `MCapTable` — the weighted-average computation and JSX — is unchanged; it already only reads `r.allocationPct` off the rows this produces.)

- [ ] **Step 3: Replace `FundPicker` entirely**

Find the whole `function FundPicker({ selectedFunds, casFunds, casLoading, onAdd, onRemove, onAllocationChange }) { ... }` block (through its closing `}`) and replace it with:

```jsx
function FundPicker({ selectedFunds, casFunds, casLoading, proposalType, setProposalType, sipFrequency, setSipFrequency, totalAmount, onTotalAmountChange, onAddCas, onAddManual, onRemove, onAmountChange }) {
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
            <div className="pfc-selected-row" key={f.amfiCode}>
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
          ))}
          <div className={`pfc-alloc-total ${Math.abs(totalEntered - totalAmount) > 1 ? 'pfc-alloc-warn' : ''}`}>
            Entered: ₹{totalEntered.toLocaleString('en-IN')} {Math.abs(totalEntered - totalAmount) > 1 && `(should sum to ₹${totalAmount.toLocaleString('en-IN')} total)`}
          </div>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Update CSS**

In `app/proposal-studio/proposal-studio.css`, replace this block:
```css
.pfc-selected { margin-top: 20px; border-top: 1px solid var(--border); padding-top: 16px; }
.pfc-selected h3 { font: 600 14px Raleway, sans-serif; margin-bottom: 10px; }
.pfc-selected-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.pfc-selected-name { flex: 1; font: 500 13px Raleway, sans-serif; }
.pfc-alloc-input { width: 64px; padding: 4px 6px; border-radius: 6px; border: 1px solid var(--border); font: 500 13px JetBrains Mono, monospace; text-align: right; }
.pfc-alloc-pct { font: 500 13px Raleway, sans-serif; color: var(--muted); }
.pfc-remove { border: none; background: transparent; color: var(--neg); cursor: pointer; font: 500 12px Raleway, sans-serif; }
.pfc-alloc-total { margin-top: 10px; font: 600 12px JetBrains Mono, monospace; color: var(--muted); }
.pfc-alloc-warn { color: var(--warn); }
```
with:
```css
.pfc-proposal-type { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
.pfc-total-input { display: flex; align-items: center; gap: 8px; font: 500 13px Raleway, sans-serif; }
.pfc-inp, .pfc-amount-input { display: flex; align-items: center; border: 1px solid var(--border); border-radius: 8px; padding: 4px 8px; gap: 4px; }
.pfc-inp i, .pfc-amount-input i { font-style: normal; color: var(--muted); font: 500 13px JetBrains Mono, monospace; }
.pfc-inp input, .pfc-amount-input input { border: none; outline: none; width: 110px; font: 500 13px JetBrains Mono, monospace; text-align: right; }
.pfc-freq-tabs button { padding: 6px 12px; font-size: 12px; }

.pfc-selected { margin-top: 20px; border-top: 1px solid var(--border); padding-top: 16px; }
.pfc-selected h3 { font: 600 14px Raleway, sans-serif; margin-bottom: 10px; }
.pfc-selected-row { display: flex; align-items: center; gap: 10px; padding: 6px 0; }
.pfc-selected-name { flex: 1; font: 500 13px Raleway, sans-serif; }
.pfc-amount-input input { width: 90px; }
.pfc-remove { border: none; background: transparent; color: var(--neg); cursor: pointer; font: 500 12px Raleway, sans-serif; }
.pfc-alloc-total { margin-top: 10px; font: 600 12px JetBrains Mono, monospace; color: var(--muted); }
.pfc-alloc-warn { color: var(--warn); }
```

- [ ] **Step 5: Build and manually verify**

Run: `npm run build`
Expected: build succeeds.

Manual check: add a CAS-imported fund, confirm its amount pre-fills with a real ₹ value (not 0) and the total updates; add a manually-searched fund, confirm it gets an even share of whatever's left of the total; edit the total amount, confirm manually-added funds' amounts re-split while the CAS fund's amount is untouched; remove the CAS fund, confirm the total decreases by its amount.

- [ ] **Step 6: Commit**

```bash
git add app/proposal-studio/ProposalStudioClient.jsx app/proposal-studio/proposal-studio.css
git commit -m "feat(proposal-studio): replace % allocation with proposal-type + amount model"
```

---

### Task 3: Growth-only fund search with IDCW toggle

**Files:**
- Modify: `app/proposal-studio/ProposalStudioClient.jsx`
- Modify: `app/proposal-studio/proposal-studio.css`

**Interfaces:**
- Consumes: `FundPicker`'s search-tab logic from Task 2 (unchanged shape otherwise).

- [ ] **Step 1: Add the `showIdcw` toggle to `FundPicker`**

In `FundPicker` (added in Task 2), find:
```jsx
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
```
Replace with:
```jsx
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
```

- [ ] **Step 2: Add the toggle checkbox to the search tab's JSX**

Find:
```jsx
      {tab === 'search' && (
        <div className="pfc-picker-list">
          <input
            className="pfc-search-input"
            placeholder="Type at least 3 letters, e.g. 'parag parikh flexi'…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching && <div className="pfc-hint">Searching…</div>}
```
Replace with:
```jsx
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
```

- [ ] **Step 3: Add CSS for the toggle**

Append to `app/proposal-studio/proposal-studio.css`:
```css
.pfc-idcw-toggle { display: flex; align-items: center; gap: 6px; font: 500 12px Raleway, sans-serif; color: var(--muted); margin-bottom: 10px; cursor: pointer; }
```

- [ ] **Step 4: Build and manually verify**

Run: `npm run build`
Expected: build succeeds.

Manual check: search for a fund known to have IDCW variants (e.g. "HDFC Balanced Advantage"), confirm IDCW/Dividend results are hidden by default and appear when the toggle is checked; confirm the CAS-import tab is completely unaffected by this toggle.

- [ ] **Step 5: Commit**

```bash
git add app/proposal-studio/ProposalStudioClient.jsx app/proposal-studio/proposal-studio.css
git commit -m "feat(proposal-studio): default fund search to Growth plans, add IDCW toggle"
```

---

### Task 4: Remove Direct-plan-only AUM and expense ratio from Scheme Details

**Files:**
- Modify: `app/proposal-studio/ProposalStudioClient.jsx`

**Interfaces:**
- No interface changes — this only removes two rendered columns.

- [ ] **Step 1: Update `SchemeDetailsTable`**

Find:
```jsx
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
```
Replace with:
```jsx
// TODO: AUM and expense ratio removed from this table -- both are Direct-plan-only
// values from the underlying data source, misleading for a Regular-plan proposal.
// Re-add once a reliable per-plan (Direct vs Regular) source is found.
function SchemeDetailsTable({ selectedFunds, holdingsByFund }) {
  return (
    <section className="pfc-section">
      <h2 className="pfc-section-title">Scheme Details</h2>
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
    </section>
  );
}
```

- [ ] **Step 2: Build and manually verify**

Run: `npm run build`
Expected: build succeeds. Confirm the Scheme Details table no longer shows AUM/Expense Ratio columns.

- [ ] **Step 3: Commit**

```bash
git add app/proposal-studio/ProposalStudioClient.jsx
git commit -m "fix(proposal-studio): remove misleading Direct-plan-only AUM/expense ratio"
```

---

### Task 5: Collapsible sections

**Files:**
- Modify: `app/proposal-studio/ProposalStudioClient.jsx`
- Modify: `app/proposal-studio/proposal-studio.css`

**Interfaces:**
- Produces: `CollapsibleSection({title, children, defaultOpen})` — a new shared component. Consumed by `ExposureTable`, `SchemeDetailsTable`, `OverlapGrid`, `MCapTable`, each replacing their own `<section className="pfc-section">...</section>` wrapper.

- [ ] **Step 1: Add the `CollapsibleSection` component**

Add this new component to `ProposalStudioClient.jsx`, right before `function ExposureTable`:

```jsx
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
```

- [ ] **Step 2: Wrap `ExposureTable` in `CollapsibleSection`**

Find:
```jsx
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
```
Replace with:
```jsx
function ExposureTable({ title, rows }) {
  return (
    <CollapsibleSection title={title}>
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
    </CollapsibleSection>
  );
}
```

- [ ] **Step 3: Wrap `SchemeDetailsTable` in `CollapsibleSection`**

Find (from Task 4's version):
```jsx
function SchemeDetailsTable({ selectedFunds, holdingsByFund }) {
  return (
    <section className="pfc-section">
      <h2 className="pfc-section-title">Scheme Details</h2>
      <table className="pfc-table pfc-table-wide">
```
Replace with:
```jsx
function SchemeDetailsTable({ selectedFunds, holdingsByFund }) {
  return (
    <CollapsibleSection title="Scheme Details">
      <table className="pfc-table pfc-table-wide">
```
And find the matching closing tags at the end of that function:
```jsx
      </table>
    </section>
  );
}
```
(this exact closing appears once for `SchemeDetailsTable` — the one immediately following its `</tbody>`) replace with:
```jsx
      </table>
    </CollapsibleSection>
  );
}
```

- [ ] **Step 4: Wrap `OverlapGrid` in `CollapsibleSection`**

Find:
```jsx
function OverlapGrid({ funds, selectedFunds }) {
  const grid = computeOverlap(funds);
  const names = funds.map((f) => selectedFunds.find((s) => s.amfiCode === f.amfiCode)?.schemeName || f.amfiCode);

  return (
    <section className="pfc-section">
      <h2 className="pfc-section-title">Portfolio Overlap (Equity Stocks Only)</h2>
      <div className="pfc-overlap-wrap">
```
Replace with:
```jsx
function OverlapGrid({ funds, selectedFunds }) {
  const grid = computeOverlap(funds);
  const names = funds.map((f) => selectedFunds.find((s) => s.amfiCode === f.amfiCode)?.schemeName || f.amfiCode);

  return (
    <CollapsibleSection title="Portfolio Overlap (Equity Stocks Only)">
      <div className="pfc-overlap-wrap">
```
And find its closing:
```jsx
      </div>
    </section>
  );
}

function MCapTable
```
Replace with:
```jsx
      </div>
    </CollapsibleSection>
  );
}

function MCapTable
```

- [ ] **Step 5: Wrap `MCapTable` in `CollapsibleSection`**

Find:
```jsx
  return (
    <section className="pfc-section">
      <h2 className="pfc-section-title">Scheme M-Cap Allocation</h2>
      <table className="pfc-table pfc-table-wide">
        <thead>
          <tr>
            <th>Fund</th>
```
Replace with:
```jsx
  return (
    <CollapsibleSection title="Scheme M-Cap Allocation">
      <table className="pfc-table pfc-table-wide">
        <thead>
          <tr>
            <th>Fund</th>
```
And find its closing (immediately followed by `function FundPicker`):
```jsx
      </table>
    </section>
  );
}

function FundPicker
```
Replace with:
```jsx
      </table>
    </CollapsibleSection>
  );
}

function FundPicker
```

- [ ] **Step 6: Add CSS for the collapsible header**

In `app/proposal-studio/proposal-studio.css`, replace:
```css
.pfc-section { background: var(--surface, #fff); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
.pfc-section-title { font: 600 16px Raleway, sans-serif; color: var(--g1); margin-bottom: 12px; }
```
with:
```css
.pfc-section { background: var(--surface, #fff); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; }
.pfc-section-header { display: flex; align-items: center; justify-content: space-between; width: 100%; background: none; border: none; padding: 0; cursor: pointer; text-align: left; }
.pfc-section-title { font: 600 16px Raleway, sans-serif; color: var(--g1); margin: 0; }
.pfc-chevron { font-size: 14px; color: var(--muted); transition: transform 0.2s; transform: rotate(-90deg); }
.pfc-chevron-open { transform: rotate(0deg); }
.pfc-section-body { margin-top: 12px; }
```

- [ ] **Step 7: Build and manually verify**

Run: `npm run build`
Expected: build succeeds. Confirm every section (Asset Allocation, Sector Exposure, Stock Exposure, Scheme Details, Portfolio Overlap, M-Cap Allocation) has a working collapse/expand chevron, defaulting open.

- [ ] **Step 8: Commit**

```bash
git add app/proposal-studio/ProposalStudioClient.jsx app/proposal-studio/proposal-studio.css
git commit -m "feat(proposal-studio): add collapsible sections"
```

---

### Task 6: AMC logos in the selected-funds list

**Files:**
- Modify: `app/proposal-studio/ProposalStudioClient.jsx`

**Interfaces:**
- Consumes: `ProviderAvatar` (default export from `@/components/ProviderAvatar`, props `{name, logoPath, size, radius}`) and `getMFLogoFromSchemeName` (named export from `@/lib/providerLogos`) — both already used by `app/portfolio/page.jsx` and `app/backtest/page.js`, no changes to either.

- [ ] **Step 1: Import the logo components**

At the top of `ProposalStudioClient.jsx`, add:
```jsx
import ProviderAvatar from '@/components/ProviderAvatar';
import { getMFLogoFromSchemeName } from '@/lib/providerLogos';
```

- [ ] **Step 2: Add the logo to each selected-fund row**

Find (inside `FundPicker`'s "Selected funds" block):
```jsx
            <div className="pfc-selected-row" key={f.amfiCode}>
              <span className="pfc-selected-name">{f.schemeName}</span>
```
Replace with:
```jsx
            <div className="pfc-selected-row" key={f.amfiCode}>
              <ProviderAvatar name={f.schemeName} logoPath={getMFLogoFromSchemeName(f.schemeName)} size={24} radius={6} />
              <span className="pfc-selected-name">{f.schemeName}</span>
```

- [ ] **Step 3: Build and manually verify**

Run: `npm run build`
Expected: build succeeds. Confirm a recognizable AMC logo (or a sensible fallback avatar, matching `ProviderAvatar`'s existing no-logo behavior) appears next to each selected fund.

- [ ] **Step 4: Commit**

```bash
git add app/proposal-studio/ProposalStudioClient.jsx
git commit -m "feat(proposal-studio): show AMC logos in the selected-funds list"
```

---

### Task 7: Full holdings view for Stock Exposure

**Files:**
- Modify: `app/proposal-studio/ProposalStudioClient.jsx`
- Modify: `app/proposal-studio/proposal-studio.css`

**Interfaces:**
- Consumes: `combineExposure`'s full (untruncated) per-fund holdings are already available in `readyFunds` at the call site — this task needs the *untruncated* combined stock list, not just the top-10-plus-Other `stockExposure` array `combineExposure` already returns. Rather than changing `combineExposure`'s return shape (which Task 1/plan-1's tests depend on), this task computes the full list separately using the same combining logic inline, scoped to this one table.

- [ ] **Step 1: Add a full-stock-list helper and wire it into `ExposureTable`**

`combineExposure` (in `lib/portfolioAnalysis.js`) already truncates to top-10-plus-Other by design — reused correctly by Asset/Sector Exposure, which should stay truncated. Only Stock Exposure needs an optional "see everything" expansion, so this task adds a small local helper in `ProposalStudioClient.jsx` (not in the shared library) that mirrors the same per-stock aggregation without truncating, used only here.

Add this function to `ProposalStudioClient.jsx`, right before `function ExposureTable`:

```jsx
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
```

- [ ] **Step 2: Add the expand toggle to `ExposureTable`, only for Stock Exposure**

Find (the Task 5 collapsible version):
```jsx
function ExposureTable({ title, rows }) {
  return (
    <CollapsibleSection title={title}>
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
    </CollapsibleSection>
  );
}
```
Replace with:
```jsx
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
```

- [ ] **Step 3: Pass `fullRows` only for the Stock Exposure table**

In `ProposalStudioTool`, find:
```jsx
            <ExposureTable title="Asset Allocation" rows={assetAllocation} />
            <ExposureTable title="Sector Exposure" rows={sectorExposure} />
            <ExposureTable title="Stock Exposure" rows={stockExposure} />
```
Replace with:
```jsx
            <ExposureTable title="Asset Allocation" rows={assetAllocation} />
            <ExposureTable title="Sector Exposure" rows={sectorExposure} />
            <ExposureTable title="Stock Exposure" rows={stockExposure} fullRows={fullStockExposure(readyFunds, allocations)} />
```

- [ ] **Step 4: Add CSS for the expand link**

Append to `app/proposal-studio/proposal-studio.css`:
```css
.pfc-show-all { display: block; margin-top: 10px; border: none; background: none; color: var(--g2); font: 600 12px Raleway, sans-serif; cursor: pointer; padding: 0; }
.pfc-show-all:hover { color: var(--g1); text-decoration: underline; }
```

- [ ] **Step 5: Build and manually verify**

Run: `npm run build`
Expected: build succeeds. In Stock Exposure, confirm "Show all N holdings" expands to the full combined list and "Show top 10 only" collapses it back; confirm Asset Allocation and Sector Exposure have no such link (they don't receive `fullRows`).

- [ ] **Step 6: Commit**

```bash
git add app/proposal-studio/ProposalStudioClient.jsx app/proposal-studio/proposal-studio.css
git commit -m "feat(proposal-studio): add full-holdings expand view to Stock Exposure"
```

---

### Task 8: Visual polish pass

**Files:**
- Modify: `app/proposal-studio/proposal-studio.css`

**Interfaces:**
- No interface changes — CSS only, matching `app/screener/mf-compare.css`'s established conventions (subtle shadows, hover transitions, consistent card treatment).

- [ ] **Step 1: Add card depth, hover states, and spacing polish**

Replace the whole contents of `app/proposal-studio/proposal-studio.css` with:

```css
/* app/proposal-studio/proposal-studio.css */

.pfc-page { max-width: 1100px; margin: 0 auto; padding: 32px 20px 64px; }
.pfc-title { font: 700 32px Raleway, sans-serif; color: var(--g1); margin-bottom: 6px; }
.pfc-subtitle { font: 400 15px Raleway, sans-serif; color: var(--muted); margin-bottom: 28px; }

.pfc-picker { background: var(--surface, #fff); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 24px; box-shadow: 0 2px 10px rgba(0,0,0,0.04); }

.pfc-proposal-type { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
.pfc-total-input { display: flex; align-items: center; gap: 8px; font: 500 13px Raleway, sans-serif; }
.pfc-inp, .pfc-amount-input { display: flex; align-items: center; border: 1px solid var(--border); border-radius: 8px; padding: 4px 8px; gap: 4px; transition: border-color 0.15s; }
.pfc-inp:focus-within, .pfc-amount-input:focus-within { border-color: var(--g3); }
.pfc-inp i, .pfc-amount-input i { font-style: normal; color: var(--muted); font: 500 13px JetBrains Mono, monospace; }
.pfc-inp input, .pfc-amount-input input { border: none; outline: none; width: 110px; font: 500 13px JetBrains Mono, monospace; text-align: right; }
.pfc-freq-tabs button { padding: 6px 12px; font-size: 12px; }

.pfc-picker-tabs { display: flex; gap: 8px; margin-bottom: 16px; }
.pfc-picker-tabs button { padding: 8px 16px; border-radius: 8px; border: 1px solid var(--border); background: transparent; cursor: pointer; font: 500 13px Raleway, sans-serif; transition: background 0.15s, border-color 0.15s; }
.pfc-picker-tabs button:hover { border-color: var(--g3); }
.pfc-picker-tabs button.on { background: var(--g2); color: #fff; border-color: var(--g2); }

.pfc-picker-list { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; }
.pfc-picker-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); background: transparent; cursor: pointer; text-align: left; font: 500 13px Raleway, sans-serif; transition: border-color 0.15s, background 0.15s; }
.pfc-picker-item:hover:not(:disabled) { border-color: var(--g3); background: var(--surface2, #edf6ed); }
.pfc-picker-item:disabled { opacity: 0.55; cursor: default; }
.pfc-add { font: 600 11px JetBrains Mono, monospace; color: var(--g2); }
.pfc-search-input { width: 100%; padding: 10px 12px; border-radius: 8px; border: 1px solid var(--border); margin-bottom: 10px; font: 400 14px Raleway, sans-serif; transition: border-color 0.15s; }
.pfc-search-input:focus { outline: none; border-color: var(--g3); }
.pfc-idcw-toggle { display: flex; align-items: center; gap: 6px; font: 500 12px Raleway, sans-serif; color: var(--muted); margin-bottom: 10px; cursor: pointer; }
.pfc-hint { font: 400 13px Raleway, sans-serif; color: var(--muted); padding: 12px 0; }

.pfc-selected { margin-top: 20px; border-top: 1px solid var(--border); padding-top: 16px; }
.pfc-selected h3 { font: 600 14px Raleway, sans-serif; margin-bottom: 10px; }
.pfc-selected-row { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.pfc-selected-row:last-of-type { border-bottom: none; }
.pfc-selected-name { flex: 1; font: 500 13px Raleway, sans-serif; }
.pfc-amount-input input { width: 90px; }
.pfc-remove { border: none; background: transparent; color: var(--neg); cursor: pointer; font: 500 12px Raleway, sans-serif; padding: 4px 8px; border-radius: 6px; transition: background 0.15s; }
.pfc-remove:hover { background: var(--neg-bg); }
.pfc-alloc-total { margin-top: 10px; font: 600 12px JetBrains Mono, monospace; color: var(--muted); }
.pfc-alloc-warn { color: var(--warn); }

.pfc-section { background: var(--surface, #fff); border: 1px solid var(--border); border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.04); transition: box-shadow 0.2s; }
.pfc-section:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.07); }
.pfc-section-header { display: flex; align-items: center; justify-content: space-between; width: 100%; background: none; border: none; padding: 0; cursor: pointer; text-align: left; }
.pfc-section-title { font: 600 16px Raleway, sans-serif; color: var(--g1); margin: 0; }
.pfc-chevron { font-size: 14px; color: var(--muted); transition: transform 0.2s; transform: rotate(-90deg); }
.pfc-chevron-open { transform: rotate(0deg); }
.pfc-section-body { margin-top: 12px; }

.pfc-table { width: 100%; border-collapse: collapse; font: 500 13px Raleway, sans-serif; }
.pfc-table td, .pfc-table th { padding: 9px 6px; border-bottom: 1px solid var(--border); text-align: left; }
.pfc-table tr:last-child td { border-bottom: none; }
.pfc-table-pct { font: 500 13px JetBrains Mono, monospace; text-align: right !important; }
.pfc-table-wide th { font: 600 11px Raleway, sans-serif; color: var(--muted); text-transform: uppercase; letter-spacing: 0.03em; }

.pfc-show-all { display: block; margin-top: 10px; border: none; background: none; color: var(--g2); font: 600 12px Raleway, sans-serif; cursor: pointer; padding: 0; }
.pfc-show-all:hover { color: var(--g1); text-decoration: underline; }

.pfc-fund-errors { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.pfc-error-hint { font: 500 13px Raleway, sans-serif; color: var(--neg); background: var(--neg-bg); border: 1px solid #ffcdd2; border-radius: 8px; padding: 10px 12px; }

.pfc-overlap-wrap { overflow-x: auto; }
.pfc-overlap-table th, .pfc-overlap-table td { min-width: 90px; text-align: center; }
.pfc-overlap-diag { background: var(--surface2, #edf6ed); font-weight: 700; }

.pfc-mcap-avg td { background: var(--surface2, #edf6ed); font-weight: 700; }
```

- [ ] **Step 2: Build and manually verify**

Run: `npm run build`
Expected: build succeeds.

Manual check: confirm sections have a subtle shadow that deepens slightly on hover, buttons/inputs have visible hover/focus states, and the overall page reads as polished rather than plain tables — comparable to `/screener`'s comparison modal.

- [ ] **Step 3: Commit**

```bash
git add app/proposal-studio/proposal-studio.css
git commit -m "style(proposal-studio): visual polish pass matching site design conventions"
```
