# PMS Wealth Simulation Redesign + 7Y/10Y Returns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the "Wealth Creation Simulation" (1Y-only today) into a 3-stop "Growth Journey Strip" (1Y → 3Y → 5Y) in both the PMS Compare modal and the single-fund detail drawer, and add 7Y/10Y return periods to both locations' Returns sections, sourced from the existing `/api/pms-quartile` endpoint.

**Architecture:** `PMSCompareModal` gains a derived `enrichedFunds` array (each fund merged with `ret7Y`/`ret10Y` looked up from the quartile data it already fetches) that feeds the Returns section and the weighted-verdict scoring; the single-fund drawer in `page.jsx` gains a new `drawerQuartile` fetch (mirroring its existing `drawerBenchmark` fetch-on-select pattern) to source the same two fields. The Growth Journey Strip is a shared visual pattern implemented independently in each file's own CSS/JSX (no shared component — the two files already use different class-naming conventions and neither currently shares components).

**Tech Stack:** React (existing `PMSCompareModal`, `page.jsx`), CSS (existing `pms-compare.css`, `pms-screener.css`), the already-shipped `/api/pms-quartile` route (no backend changes in this plan).

## Global Constraints

- **Main screener table is out of scope.** Per the design spec's scope decision, 7Y/10Y appears ONLY in the Compare modal (≤3 funds) and the single-fund drawer (1 fund) — never in the main `~1,189`-fund table. Do not touch `RETURN_COLUMNS`/`OPTIONAL_RETURN_COLUMNS` in `page.jsx`.
- **No new caching/storage pipeline.** Confirmed in the design spec: the existing `/api/pms-quartile` 3-layer cache (6h memory / 30-day Vercel Blob) already covers this scope. Do not add a database table, script, or GitHub Action for this plan.
- **Responsive breakpoint:** collapse the Growth Journey Strip to stacked rows (no arrows) below `480px` — matches the existing convention already used elsewhere in both `pms-screener.css` (`@media (max-width: 480px)` at line 1361) and is consistent with `pms-compare.css`'s existing `@media (max-width: 700px)` mobile block.
- **No test runner configured** (`package.json` has no `"test"` script, established in the prior quartile-integration plan). Verification is `npm run build` for a clean compile, plus manual dev-server checks described in each task.
- **Graceful degradation always.** Every new field (`ret7Y`, `ret10Y`, `drawerQuartile.ret7Y/ret10Y`) must default to `null` and render as "—" or be skipped entirely (never throw, never show `undefined`/`NaN`) — matches the existing pattern already used throughout both files (`fmtRet`, `fmtWealth`, the Returns section's `allNull` check).

---

### Task 1: Compare modal — 7Y/10Y data pipeline, Returns section, and weighted verdict

**Files:**
- Modify: `app/pms-screener/PMSCompare.jsx:85-105` (PERIODS, PERIOD_WEIGHTS)
- Modify: `app/pms-screener/PMSCompare.jsx:264-323` (winners, winCount, scores, overallWinner)
- Modify: `app/pms-screener/PMSCompare.jsx:378-397` (Returns section rendering)
- Modify: `app/pms-screener/PMSCompare.jsx:~528` (verdict banner parenthetical text)

**Interfaces:**
- Consumes: the existing `quartileData` state (already populated by the `useEffect` at `PMSCompare.jsx:175-202`) — shape `{ [fundId]: Array<{period, iaTwrr, ...}> | null }`, where `period` is `'1Y'|'2Y'|'3Y'|'5Y'|'7Y'|'10Y'`.
- Produces: `enrichedFunds` (a local `useMemo`, not exported) — an array shaped exactly like `funds` plus two extra fields `ret7Y: number|null` and `ret10Y: number|null`. Task 2 does not depend on this (Wealth Simulation uses `ret1Y`/`ret3Y`/`ret5Y`, already present on raw `funds`), but Task 2's verdict-banner edit assumes `PERIODS`/`PERIOD_WEIGHTS` already include the 7Y/10Y entries this task adds.

- [ ] **Step 1: Add the two new periods to `PERIODS`**

Find (`PMSCompare.jsx:85-94`):

```js
const PERIODS = [
  { label: '1 Month', key: 'ret1M' },
  { label: '3 Months', key: 'ret3M' },
  { label: '6 Months', key: 'ret6M' },
  { label: '1 Year', key: 'ret1Y' },
  { label: '2 Years', key: 'ret2Y' },
  { label: '3 Years', key: 'ret3Y' },
  { label: '5 Years', key: 'ret5Y' },
  { label: 'Inception', key: 'retInception' },
];
```

Replace with:

```js
const PERIODS = [
  { label: '1 Month', key: 'ret1M' },
  { label: '3 Months', key: 'ret3M' },
  { label: '6 Months', key: 'ret6M' },
  { label: '1 Year', key: 'ret1Y' },
  { label: '2 Years', key: 'ret2Y' },
  { label: '3 Years', key: 'ret3Y' },
  { label: '5 Years', key: 'ret5Y' },
  { label: '7 Years', key: 'ret7Y' },
  { label: '10 Years', key: 'ret10Y' },
  { label: 'Inception', key: 'retInception' },
];
```

- [ ] **Step 2: Add weights for the two new periods**

Find (`PMSCompare.jsx:96-105`):

```js
// How much each period counts toward the "Overall Leader" verdict — longer,
// more established horizons carry more weight since they say more about
// sustained skill than short-term noise. Inception sits below 5Y despite
// being "full history" because it isn't a fixed, comparable length across
// funds of different ages (a 1-year-old fund's inception return isn't
// measuring the same thing as a 10-year-old fund's).
const PERIOD_WEIGHTS = {
  ret1M: 0.5, ret3M: 0.75, ret6M: 1, ret1Y: 1.5,
  ret2Y: 2, ret3Y: 2.5, ret5Y: 3, retInception: 2,
};
```

Replace with:

```js
// How much each period counts toward the "Overall Leader" verdict — longer,
// more established horizons carry more weight since they say more about
// sustained skill than short-term noise. Inception sits below 5Y despite
// being "full history" because it isn't a fixed, comparable length across
// funds of different ages (a 1-year-old fund's inception return isn't
// measuring the same thing as a 10-year-old fund's). 7Y/10Y continue the
// same +0.5-per-step progression already established from 3Y (2.5) to 5Y (3).
const PERIOD_WEIGHTS = {
  ret1M: 0.5, ret3M: 0.75, ret6M: 1, ret1Y: 1.5,
  ret2Y: 2, ret3Y: 2.5, ret5Y: 3, ret7Y: 3.5, ret10Y: 4, retInception: 2,
};
```

- [ ] **Step 3: Add the `enrichedFunds` derived array**

Find (`PMSCompare.jsx:264-268`, immediately before the `winners` useMemo):

```js
  // Per-period "best cell" index, for highlighting the table — kept as a
  // simple raw max, separate from the weighted verdict score below. `aum`
  // is included here purely to highlight the biggest AUM cell in its own
  // row; it does NOT feed the verdict (size isn't a performance metric).
  const winners = useMemo(() => {
```

Replace with:

```js
  // 7Y/10Y come from the quartile fetch above (quartileData), not the bulk
  // /api/pms-data scrape that populates every other field on `funds` — merge
  // them onto a derived array so the Returns section, winners, and scores
  // below can treat ret7Y/ret10Y exactly like any other period field. Only
  // these two fields differ from `funds`; everything else passes through
  // unchanged, so this array is safe to use anywhere `funds` was used for
  // period-driven computation.
  const enrichedFunds = useMemo(() => funds.map(f => {
    const rows = quartileData[f.id];
    const find = (period) => rows?.find(r => r.period === period)?.iaTwrr ?? null;
    return { ...f, ret7Y: find('7Y'), ret10Y: find('10Y') };
  }), [funds, quartileData]);

  // Per-period "best cell" index, for highlighting the table — kept as a
  // simple raw max, separate from the weighted verdict score below. `aum`
  // is included here purely to highlight the biggest AUM cell in its own
  // row; it does NOT feed the verdict (size isn't a performance metric).
  const winners = useMemo(() => {
```

- [ ] **Step 4: Switch `winners`, `scores`, and `overallWinner` to `enrichedFunds`**

Find (`PMSCompare.jsx`, the `winners` useMemo body, now a few lines further down after Step 3's insertion):

```js
  const winners = useMemo(() => {
    const w = {};
    PERIODS.forEach(({ key }) => {
      const vals = funds.map(f => f[key] ?? -Infinity);
      const maxV = Math.max(...vals);
      w[key] = vals.map((v, i) => v === maxV && v !== -Infinity ? i : -1);
    });
    const aumVals = funds.map(f => f.aum ?? 0);
    const maxAum = Math.max(...aumVals);
    w['aum'] = aumVals.map((v, i) => v === maxAum ? i : -1);
    return w;
  }, [funds]);
```

Replace with:

```js
  const winners = useMemo(() => {
    const w = {};
    PERIODS.forEach(({ key }) => {
      const vals = enrichedFunds.map(f => f[key] ?? -Infinity);
      const maxV = Math.max(...vals);
      w[key] = vals.map((v, i) => v === maxV && v !== -Infinity ? i : -1);
    });
    const aumVals = enrichedFunds.map(f => f.aum ?? 0);
    const maxAum = Math.max(...aumVals);
    w['aum'] = aumVals.map((v, i) => v === maxAum ? i : -1);
    return w;
  }, [enrichedFunds]);
```

Find (`scores` useMemo):

```js
  const scores = useMemo(() => {
    const totals = Array(n).fill(0);
    const weightSums = Array(n).fill(0);
    PERIODS.forEach(({ key }) => {
      const weight = PERIOD_WEIGHTS[key];
      const participants = funds
        .map((f, i) => ({ i, v: f[key] }))
        .filter(p => p.v !== null && p.v !== undefined);
      if (participants.length < 2) return;
      const ranked = [...participants].sort((a, b) => b.v - a.v);
      const m = ranked.length;
      ranked.forEach((p, rankIdx) => {
        const share = (m - rankIdx) / m; // 1st place = full weight, last place = weight/m
        totals[p.i] += weight * share;
        weightSums[p.i] += weight;
      });
    });
    return totals.map((t, i) => (weightSums[i] > 0 ? t / weightSums[i] : 0));
  }, [funds, n]);
```

Replace with:

```js
  const scores = useMemo(() => {
    const totals = Array(n).fill(0);
    const weightSums = Array(n).fill(0);
    PERIODS.forEach(({ key }) => {
      const weight = PERIOD_WEIGHTS[key];
      const participants = enrichedFunds
        .map((f, i) => ({ i, v: f[key] }))
        .filter(p => p.v !== null && p.v !== undefined);
      if (participants.length < 2) return;
      const ranked = [...participants].sort((a, b) => b.v - a.v);
      const m = ranked.length;
      ranked.forEach((p, rankIdx) => {
        const share = (m - rankIdx) / m; // 1st place = full weight, last place = weight/m
        totals[p.i] += weight * share;
        weightSums[p.i] += weight;
      });
    });
    return totals.map((t, i) => (weightSums[i] > 0 ? t / weightSums[i] : 0));
  }, [enrichedFunds, n]);
```

Find (`overallWinner` useMemo):

```js
  const overallWinner = useMemo(() => {
    const maxScore = Math.max(...scores);
    const idx = scores.indexOf(maxScore);
    return { idx, score: maxScore, fund: funds[idx] };
  }, [scores, funds]);
```

Replace with:

```js
  const overallWinner = useMemo(() => {
    const maxScore = Math.max(...scores);
    const idx = scores.indexOf(maxScore);
    return { idx, score: maxScore, fund: enrichedFunds[idx] };
  }, [scores, enrichedFunds]);
```

- [ ] **Step 5: Switch the Returns section's rendering to `enrichedFunds`**

Find (`PMSCompare.jsx:378-397`):

```jsx
            {PERIODS.map(({ label, key }) => {
              const vals = funds.map(f => f[key]);
              const allNull = vals.every(v => v === null || v === undefined);
              if (allNull) return null;
              return (
                <div key={key} className="cmp-row">
                  <div className="cmp-cell" style={{ fontWeight: 700 }}>{label}</div>
                  {funds.map((f, i) => {
                    const v = f[key];
                    const isBest = winners[key]?.[i] === i;
                    return (
                      <div key={f.id} className={`cmp-cell${isBest ? ' cmp-ret-best' : ''}`}>
                        <span className={`cmp-ret ${rc(v)}`}>{fmtRet(v)}</span>
                        {isBest && n > 1 && <span style={{ fontSize: '.55rem', marginLeft: 4, color: 'var(--g3)' }}>↑ best</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
```

Replace with:

```jsx
            {PERIODS.map(({ label, key }) => {
              const vals = enrichedFunds.map(f => f[key]);
              const allNull = vals.every(v => v === null || v === undefined);
              if (allNull) return null;
              return (
                <div key={key} className="cmp-row">
                  <div className="cmp-cell" style={{ fontWeight: 700 }}>{label}</div>
                  {enrichedFunds.map((f, i) => {
                    const v = f[key];
                    const isBest = winners[key]?.[i] === i;
                    return (
                      <div key={f.id} className={`cmp-cell${isBest ? ' cmp-ret-best' : ''}`}>
                        <span className={`cmp-ret ${rc(v)}`}>{fmtRet(v)}</span>
                        {isBest && n > 1 && <span style={{ fontSize: '.55rem', marginLeft: 4, color: 'var(--g3)' }}>↑ best</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
```

- [ ] **Step 6: Update the verdict banner's weight-ordering text**

Find:

```jsx
                  winning {winCount[overallWinner.idx]} of {PERIODS.length} return periods outright, weighted
                  toward long-term consistency (3Y/5Y count most, 1M/3M count least; AUM isn't a factor) —
```

Replace with:

```jsx
                  winning {winCount[overallWinner.idx]} of {PERIODS.length} return periods outright, weighted
                  toward long-term consistency (5Y/7Y/10Y count most, 1M/3M count least; AUM isn't a factor) —
```

- [ ] **Step 7: Run the build**

Run: `npm run build` (from repo root)
Expected: build succeeds, no type/lint errors.

- [ ] **Step 8: Manual verification**

Start the dev server (`npm run dev`) if not already running, open `/pms-screener`, select 2 Equity funds for comparison (ideally include an older fund likely to have 7Y/10Y data — e.g. search for a fund whose `strategyName` suggests a long-running strategy), open Compare, and confirm:
- "7 Years" and "10 Years" rows appear in the Returns section when at least one fund has data for them.
- The "Overall Leader" verdict banner still renders correctly and its parenthetical now reads "5Y/7Y/10Y count most, 1M/3M count least".
- No console errors; the existing Quartile Ranking / Alpha / AUM / Wealth sections still render exactly as before (unchanged by this task).

- [ ] **Step 9: Commit**

```bash
git add app/pms-screener/PMSCompare.jsx
git commit -m "feat(pms-compare): add 7Y/10Y return periods to Compare's Returns section and verdict scoring"
```

---

### Task 2: Compare modal — Wealth Simulation "Growth Journey Strip" redesign

**Files:**
- Modify: `app/pms-screener/PMSCompare.jsx` (add `WEALTH_STOPS`, `bestWealthMention`; replace Wealth section JSX; update verdict banner's wealth clause)
- Modify: `app/pms-screener/pms-compare.css` (replace `.cmp-wealth-num`/`.cmp-wealth-gain` with the new strip classes)

**Interfaces:**
- Consumes: `PERIODS`/`winners` from Task 1 (must be completed first — this task's `winners[key]` lookups for `key` in `WEALTH_STOPS` rely on `winners` already being populated, which it is regardless of Task 1 since `ret1Y`/`ret3Y`/`ret5Y` were always in `PERIODS`).
- Produces: `WEALTH_STOPS` (const array `[{key, label}]` for 1Y/3Y/5Y) and `bestWealthMention(fund)` (function) — not consumed elsewhere in this plan, but named distinctly from Task 3's drawer versions since the two files don't share modules.

- [ ] **Step 1: Add `WEALTH_STOPS` and `bestWealthMention` helper**

Find (`PMSCompare.jsx`, immediately after the `PERIOD_WEIGHTS` block from Task 1, before `// ── Compare Bar ──`):

```js
const PERIOD_WEIGHTS = {
  ret1M: 0.5, ret3M: 0.75, ret6M: 1, ret1Y: 1.5,
  ret2Y: 2, ret3Y: 2.5, ret5Y: 3, ret7Y: 3.5, ret10Y: 4, retInception: 2,
};

// ── Compare Bar ───────────────────────────────────────────────────────────
```

Replace with:

```js
const PERIOD_WEIGHTS = {
  ret1M: 0.5, ret3M: 0.75, ret6M: 1, ret1Y: 1.5,
  ret2Y: 2, ret3Y: 2.5, ret5Y: 3, ret7Y: 3.5, ret10Y: 4, retInception: 2,
};

// Wealth Creation Simulation's three "stops" — deliberately just 1Y/3Y/5Y
// (not 7Y/10Y): these three are already on every fund via the bulk
// /api/pms-data scrape, so the simulation never needs the quartile fetch.
const WEALTH_STOPS = [
  { key: 'ret1Y', label: '1Y' },
  { key: 'ret3Y', label: '3Y' },
  { key: 'ret5Y', label: '5Y' },
];

/** Picks the longest available wealth-simulation period (5Y > 3Y > 1Y) for the verdict banner's one-line summary. */
function bestWealthMention(fund) {
  const candidates = [
    { key: 'ret5Y', years: '5 years' },
    { key: 'ret3Y', years: '3 years' },
    { key: 'ret1Y', years: '1 year' },
  ];
  const found = candidates.find(c => fund[c.key] !== null && fund[c.key] !== undefined);
  if (!found) return { text: '' };
  const w = fmtWealth(fund[found.key]);
  return { text: `${w.gain} gain on a ₹50L basis over ${found.years}.` };
}

// ── Compare Bar ───────────────────────────────────────────────────────────
```

- [ ] **Step 2: Replace the Wealth Simulation section JSX**

Find (`PMSCompare.jsx:482-499`):

```jsx
            {/* Wealth simulation */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              💰 Wealth Creation Simulation · ₹50 Lakh Invested 1 Year Ago
            </div>
            <div className="cmp-row">
              <div className="cmp-cell" style={{ fontWeight: 700 }}>Value Today</div>
              {funds.map((f, i) => {
                const w = fmtWealth(f.ret1Y);
                const isBest = winners['ret1Y']?.[i] === i; // wealth is just ret1Y framed in rupees
                return (
                  <div key={f.id} className={`cmp-cell${isBest ? ' cmp-ret-best' : ''}`}>
                    <div className="cmp-wealth-num" style={{ color: w.isPos ? 'var(--g2)' : 'var(--neg)' }}>{w.value}</div>
                    <div className="cmp-wealth-gain" style={{ color: w.isPos ? 'var(--g3)' : 'var(--neg)' }}>{w.gain}</div>
                    {isBest && n > 1 && <div style={{ fontSize: '.55rem', color: 'var(--g3)', marginTop: 2 }}>↑ best outcome</div>}
                  </div>
                );
              })}
            </div>
```

Replace with:

```jsx
            {/* Wealth simulation — Growth Journey Strip: 1Y -> 3Y -> 5Y */}
            <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
              💰 Wealth Creation Simulation · ₹50 Lakh Invested
            </div>
            <div className="cmp-row">
              <div className="cmp-cell" style={{ fontWeight: 700 }}>Growth Journey</div>
              {funds.map((f, i) => (
                <div key={f.id} className="cmp-cell">
                  <div className="cmp-wealth-strip">
                    {WEALTH_STOPS.map(({ key, label }, idx) => {
                      const w = fmtWealth(f[key]);
                      const isBest = n > 1 && winners[key]?.[i] === i;
                      return (
                        <div key={key} style={{ display: 'contents' }}>
                          <div className={`cmp-wealth-stop${isBest ? ' cmp-wealth-stop-best' : ''}`}>
                            <div className="cmp-wealth-stop-period">{label}</div>
                            <div className="cmp-wealth-stop-val" style={{ color: w.isPos ? 'var(--g2)' : 'var(--neg)' }}>{w.value}</div>
                            <div className="cmp-wealth-stop-gain" style={{ color: w.isPos ? 'var(--g3)' : 'var(--neg)' }}>{w.gain}</div>
                          </div>
                          {idx < WEALTH_STOPS.length - 1 && <div className="cmp-wealth-arrow">→</div>}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
```

- [ ] **Step 3: Update the verdict banner's wealth clause**

Find (the verdict banner block, after Task 1's Step 6 edit — note the parenthetical below already reads "5Y/7Y/10Y"):

```jsx
          {/* Verdict banner */}
          {n > 1 && overallWinner.fund && (
            <div className="cmp-verdict">
              <div className="cmp-verdict-icon">🏆</div>
              <div>
                <div className="cmp-verdict-title">Overall Leader: {overallWinner.fund.strategyName}</div>
                <div className="cmp-verdict-body">
                  <strong>{overallWinner.fund.strategyName}</strong> by{' '}
                  <strong>{overallWinner.fund.portfolioManager}</strong> ranks highest across time horizons —
                  winning {winCount[overallWinner.idx]} of {PERIODS.length} return periods outright, weighted
                  toward long-term consistency (5Y/7Y/10Y count most, 1M/3M count least; AUM isn't a factor) —
                  including a {fmtWealth(overallWinner.fund.ret1Y).gain} gain on a ₹50L basis over 1 year.{' '}
                  {overallWinner.fund.apmiLink && (
                    <a href={overallWinner.fund.apmiLink.startsWith('http') ? overallWinner.fund.apmiLink : `https://www.apmiindia.org${overallWinner.fund.apmiLink}`}
                      target="_blank" rel="noopener noreferrer"
                      style={{ color: 'var(--g2)', fontWeight: 700, textDecoration: 'none' }}>
                      View on APMI ↗
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
```

Replace with:

```jsx
          {/* Verdict banner */}
          {n > 1 && overallWinner.fund && (() => {
            const wealthMention = bestWealthMention(overallWinner.fund);
            return (
              <div className="cmp-verdict">
                <div className="cmp-verdict-icon">🏆</div>
                <div>
                  <div className="cmp-verdict-title">Overall Leader: {overallWinner.fund.strategyName}</div>
                  <div className="cmp-verdict-body">
                    <strong>{overallWinner.fund.strategyName}</strong> by{' '}
                    <strong>{overallWinner.fund.portfolioManager}</strong> ranks highest across time horizons —
                    winning {winCount[overallWinner.idx]} of {PERIODS.length} return periods outright, weighted
                    toward long-term consistency (5Y/7Y/10Y count most, 1M/3M count least; AUM isn't a factor)
                    {wealthMention.text && <>{' '}— including a {wealthMention.text}</>}{' '}
                    {overallWinner.fund.apmiLink && (
                      <a href={overallWinner.fund.apmiLink.startsWith('http') ? overallWinner.fund.apmiLink : `https://www.apmiindia.org${overallWinner.fund.apmiLink}`}
                        target="_blank" rel="noopener noreferrer"
                        style={{ color: 'var(--g2)', fontWeight: 700, textDecoration: 'none' }}>
                        View on APMI ↗
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
```

- [ ] **Step 4: Replace the Wealth CSS classes**

Find (`pms-compare.css:311-321`):

```css
/* Wealth sim row */
.cmp-wealth-num {
  font-size: 1rem;
  font-weight: 800;
  font-family: 'JetBrains Mono', monospace;
}
.cmp-wealth-gain {
  font-size: .7rem;
  font-family: 'JetBrains Mono', monospace;
  margin-top: 2px;
}
```

Replace with:

```css
/* Wealth sim — Growth Journey Strip (1Y -> 3Y -> 5Y) */
.cmp-wealth-strip {
  display: flex;
  align-items: stretch;
  gap: 4px;
}
.cmp-wealth-stop {
  flex: 1;
  min-width: 0;
  text-align: center;
  padding: 8px 4px;
  background: var(--s2);
  border-radius: 7px;
  border: 1.5px solid transparent;
}
.cmp-wealth-stop-best {
  border-color: var(--g3);
  background: var(--g-xlight);
}
.cmp-wealth-stop-period {
  font-size: .58rem;
  font-weight: 800;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .3px;
}
.cmp-wealth-stop-val {
  font-size: .78rem;
  font-weight: 800;
  font-family: 'JetBrains Mono', monospace;
  margin: 3px 0 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cmp-wealth-stop-gain {
  font-size: .6rem;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
}
.cmp-wealth-arrow {
  display: flex;
  align-items: center;
  color: var(--g3);
  font-size: .8rem;
  flex-shrink: 0;
}

@media (max-width: 480px) {
  .cmp-wealth-strip {
    flex-direction: column;
    gap: 5px;
  }
  .cmp-wealth-arrow {
    display: none;
  }
  .cmp-wealth-stop {
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-align: left;
    padding: 6px 9px;
  }
  .cmp-wealth-stop-period {
    width: 28px;
    flex-shrink: 0;
  }
  .cmp-wealth-stop-val {
    margin: 0;
    flex: 1;
    text-align: left;
    padding-left: 8px;
  }
  .cmp-wealth-stop-gain {
    flex-shrink: 0;
  }
}
```

- [ ] **Step 5: Run the build**

Run: `npm run build` (from repo root)
Expected: build succeeds, no type/lint errors.

- [ ] **Step 6: Manual verification — desktop and mobile widths**

With the dev server running, open Compare on 2-3 funds and confirm:
- The Wealth section shows three connected stops (1Y → 3Y → 5Y) with arrows, per fund column.
- The best-performing fund's stop is highlighted (bordered/tinted) independently per period — e.g. Fund A's 1Y stop can be highlighted while Fund B's 3Y stop is highlighted, if that's what the data shows.
- The verdict banner's final sentence cites the longest available period (5Y if present, else 3Y, else 1Y) — e.g. "...including a +₹47,90,000 gain on a ₹50L basis over 5 years."
- Resize the browser (or use dev tools device emulation) to below 480px width: the strip collapses to stacked rows, arrows disappear, all three numbers remain fully legible with no horizontal overflow or clipped text.

- [ ] **Step 7: Commit**

```bash
git add app/pms-screener/PMSCompare.jsx app/pms-screener/pms-compare.css
git commit -m "feat(pms-compare): redesign Wealth Simulation as a 1Y/3Y/5Y Growth Journey Strip"
```

---

### Task 3: Single-fund drawer — 7Y/10Y returns + Wealth Simulation redesign

**Files:**
- Modify: `app/pms-screener/page.jsx:73-80` (add `fmtWealth` helper, near existing `fmtAum`)
- Modify: `app/pms-screener/page.jsx:51` (add `WEALTH_STOPS` const, near `OPTIONAL_RETURN_COLUMNS`)
- Modify: `app/pms-screener/page.jsx:175` (add `drawerQuartile` state, near `drawerBenchmark`)
- Modify: `app/pms-screener/page.jsx:296-321` (add a new `drawerQuartile`-fetching `useEffect`, mirroring the existing `drawerBenchmark` one)
- Modify: `app/pms-screener/page.jsx:435-445` (extend `retPeriods` with 7Y/10Y)
- Modify: `app/pms-screener/page.jsx:1009-1020` (replace the Wealth Simulation card JSX)
- Modify: `app/pms-screener/pms-screener.css:1042-1076` (replace `.sim-result`/`.sim-gain` with the new strip classes)

**Interfaces:**
- Consumes: `/api/pms-quartile` (same route Task 1/2 already use in `PMSCompare.jsx`) — request shape `{iaid, provider, strategy, year, month}`, response `{status, data: Array<{period, iaTwrr, ...}> | null}`.
- Consumes: `dataMonths` (component-level `useMemo` at `page.jsx:128`, from `lib/pmsDate.js`'s `getPmsDataMonths()`) and `strategy` (component state) — both already in scope throughout `page.jsx`.
- Produces: nothing consumed elsewhere in this plan — this is the final task.

- [ ] **Step 1: Add `fmtWealth` helper and `WEALTH_STOPS` const**

Find (`page.jsx:73-77`):

```js
function fmtAum(v) {
    if (v === null || v === undefined) return '—';
    if (v >= 10000) return '₹' + (v / 1000).toFixed(1) + 'K Cr';
    return '₹' + v.toLocaleString('en-IN') + ' Cr';
}
```

Replace with:

```js
function fmtAum(v) {
    if (v === null || v === undefined) return '—';
    if (v >= 10000) return '₹' + (v / 1000).toFixed(1) + 'K Cr';
    return '₹' + v.toLocaleString('en-IN') + ' Cr';
}
function fmtWealth(ret) {
    if (ret === null || ret === undefined) return { value: '—', gain: '—', isPos: true };
    const val = 5000000 * (1 + ret / 100);
    const gain = val - 5000000;
    return {
        value: '₹' + Math.round(val).toLocaleString('en-IN'),
        gain: (gain >= 0 ? '+' : '') + '₹' + Math.abs(Math.round(gain)).toLocaleString('en-IN'),
        isPos: gain >= 0,
    };
}
```

Find (`page.jsx:50-51`):

```js
const OPTIONAL_RETURN_COLUMNS = RETURN_COLUMNS.filter(c => c.optional);
```

Replace with:

```js
const OPTIONAL_RETURN_COLUMNS = RETURN_COLUMNS.filter(c => c.optional);

// Wealth Creation Simulation's three "stops" — 1Y/3Y/5Y are already on every
// fund via the bulk /api/pms-data scrape, so this needs no extra fetch.
const WEALTH_STOPS = [
    { key: 'ret1Y', label: '1Y' },
    { key: 'ret3Y', label: '3Y' },
    { key: 'ret5Y', label: '5Y' },
];
```

- [ ] **Step 2: Add `drawerQuartile` state**

Find (`page.jsx:175`):

```js
    const [drawerBenchmark, setDrawerBenchmark] = useState({ loading: false, value: null });
```

Replace with:

```js
    const [drawerBenchmark, setDrawerBenchmark] = useState({ loading: false, value: null });
    const [drawerQuartile, setDrawerQuartile] = useState({ loading: false, ret7Y: null, ret10Y: null });
```

- [ ] **Step 3: Add the `drawerQuartile`-fetching effect**

Find (`page.jsx:296-321`, the existing `drawerBenchmark` effect — insert the new effect immediately after its closing, leaving the existing one untouched):

```js
    useEffect(() => {
        if (!selected?.apmiLink) {
            setDrawerBenchmark({ loading: false, value: null });
            return;
        }
        let iaid;
        try {
            iaid = new URL(selected.apmiLink).searchParams.get('IAID');
        } catch {
            iaid = null;
        }
        if (!iaid) {
            setDrawerBenchmark({ loading: false, value: null });
            return;
        }
        let cancelled = false;
        setDrawerBenchmark({ loading: true, value: null });
        fetch(`/api/pms-benchmark?iaid=${encodeURIComponent(iaid)}`)
            .then(r => r.json())
            .then(json => {
                if (cancelled) return;
                setDrawerBenchmark({ loading: false, value: json.status === 'success' ? json.benchmark : null });
            })
            .catch(() => { if (!cancelled) setDrawerBenchmark({ loading: false, value: null }); });
        return () => { cancelled = true; };
    }, [selected]);
```

Insert immediately after it:

```js

    // 7Y/10Y aren't on `selected` (the bulk /api/pms-data scrape only goes to
    // 5Y + Inception) — fetch them from the same quartile endpoint the
    // Compare modal uses, lazily, only when a fund's drawer is open. Mirrors
    // the drawerBenchmark effect above: fetch-on-select, not fetch-for-every-row.
    useEffect(() => {
        if (!selected?.apmiLink || !selected?.portfolioManager) {
            setDrawerQuartile({ loading: false, ret7Y: null, ret10Y: null });
            return;
        }
        let iaid;
        try {
            iaid = new URL(selected.apmiLink).searchParams.get('IAID');
        } catch {
            iaid = null;
        }
        if (!iaid) {
            setDrawerQuartile({ loading: false, ret7Y: null, ret10Y: null });
            return;
        }
        let cancelled = false;
        setDrawerQuartile({ loading: true, ret7Y: null, ret10Y: null });
        const monthInfo = selected.dataMonth === 'prev' ? dataMonths.prev : dataMonths.latest;
        const params = new URLSearchParams({
            iaid,
            provider: selected.portfolioManager,
            strategy,
            year: String(monthInfo.year),
            month: String(monthInfo.month),
        });
        fetch(`/api/pms-quartile?${params}`)
            .then(r => r.json())
            .then(json => {
                if (cancelled) return;
                const rows = json.status === 'success' ? json.data : null;
                const find = (period) => rows?.find(r => r.period === period)?.iaTwrr ?? null;
                setDrawerQuartile({ loading: false, ret7Y: find('7Y'), ret10Y: find('10Y') });
            })
            .catch(() => { if (!cancelled) setDrawerQuartile({ loading: false, ret7Y: null, ret10Y: null }); });
        return () => { cancelled = true; };
    }, [selected, dataMonths, strategy]);
```

- [ ] **Step 4: Extend `retPeriods` with 7Y/10Y**

Find (`page.jsx:435-445`):

```js
    const retPeriods = selected ? [
        { label: '1M', val: selected.ret1M },
        { label: '3M', val: selected.ret3M },
        { label: '6M', val: selected.ret6M },
        { label: '1 Year', val: selected.ret1Y },
        { label: '2 Years', val: selected.ret2Y },
        { label: '3 Years', val: selected.ret3Y },
        { label: '5 Years', val: selected.ret5Y },
        { label: 'Inception', val: selected.retInception },
    // Use != null (loose) to also exclude undefined coming from missing API fields
    ].filter(r => r.val != null) : [];
```

Replace with:

```js
    const retPeriods = selected ? [
        { label: '1M', val: selected.ret1M },
        { label: '3M', val: selected.ret3M },
        { label: '6M', val: selected.ret6M },
        { label: '1 Year', val: selected.ret1Y },
        { label: '2 Years', val: selected.ret2Y },
        { label: '3 Years', val: selected.ret3Y },
        { label: '5 Years', val: selected.ret5Y },
        { label: '7 Years', val: drawerQuartile.ret7Y },
        { label: '10 Years', val: drawerQuartile.ret10Y },
        { label: 'Inception', val: selected.retInception },
    // Use != null (loose) to also exclude undefined coming from missing API fields
    ].filter(r => r.val != null) : [];
```

- [ ] **Step 5: Replace the Wealth Simulation card JSX**

Find (`page.jsx:1009-1020`):

```jsx
                            {selected.ret1Y !== null && (
                                <>
                                    <div className="pd-section-head">Wealth Creation Simulation · ₹50 Lakh</div>
                                    <div className="sim-card">
                                        <div className="sim-label">₹50,00,000 invested 1 year ago is today worth:</div>
                                        <div className="sim-result">₹{(5000000 * (1 + selected.ret1Y / 100)).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                                        <div className={`sim-gain${selected.ret1Y < 0 ? ' neg' : ''}`}>
                                            {selected.ret1Y >= 0 ? '+' : ''}₹{Math.abs(Math.round(5000000 * selected.ret1Y / 100)).toLocaleString('en-IN')} gain
                                        </div>
                                    </div>
                                </>
                            )}
```

Replace with:

```jsx
                            {(selected.ret1Y !== null || selected.ret3Y !== null || selected.ret5Y !== null) && (
                                <>
                                    <div className="pd-section-head">Wealth Creation Simulation · ₹50 Lakh</div>
                                    <div className="sim-card">
                                        <div className="sim-label">₹50,00,000 invested — growth over time:</div>
                                        <div className="sim-strip">
                                            {WEALTH_STOPS.map(({ key, label }, idx) => {
                                                const w = fmtWealth(selected[key]);
                                                return (
                                                    <div key={key} style={{ display: 'contents' }}>
                                                        <div className="sim-stop">
                                                            <div className="sim-stop-period">{label}</div>
                                                            <div className="sim-stop-val" style={{ color: w.isPos ? 'var(--g1)' : 'var(--neg)' }}>{w.value}</div>
                                                            <div className={`sim-stop-gain${w.isPos ? '' : ' neg'}`}>{w.gain}</div>
                                                        </div>
                                                        {idx < WEALTH_STOPS.length - 1 && <div className="sim-arrow">→</div>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </>
                            )}
```

- [ ] **Step 6: Replace the Wealth Simulation CSS classes**

Find (`pms-screener.css:1041-1076`):

```css
/* Wealth simulation card in drawer */
.sim-card {
  background: var(--g-xlight);
  border: 1.5px solid var(--border2);
  border-radius: var(--r);
  padding: 20px;
  text-align: center;
  margin-top: 4px;
}

.sim-label {
  font-size: .72rem;
  color: var(--pms-muted);
  margin-bottom: 6px;
  line-height: 1.5;
  font-family: var(--pms-sans);
}

.sim-result {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--g1);
  margin-bottom: 4px;
}

.sim-gain {
  font-family: 'JetBrains Mono', monospace;
  font-size: .8rem;
  color: var(--g2);
  font-weight: 700;
}

.sim-gain.neg {
  color: var(--neg);
}
```

Replace with:

```css
/* Wealth simulation card in drawer — Growth Journey Strip (1Y -> 3Y -> 5Y) */
.sim-card {
  background: var(--g-xlight);
  border: 1.5px solid var(--border2);
  border-radius: var(--r);
  padding: 20px;
  text-align: center;
  margin-top: 4px;
}

.sim-label {
  font-size: .72rem;
  color: var(--pms-muted);
  margin-bottom: 10px;
  line-height: 1.5;
  font-family: var(--pms-sans);
}

.sim-strip {
  display: flex;
  align-items: stretch;
  gap: 6px;
}

.sim-stop {
  flex: 1;
  min-width: 0;
  text-align: center;
  padding: 10px 6px;
  background: var(--s3);
  border-radius: 8px;
}

.sim-stop-period {
  font-size: .62rem;
  font-weight: 700;
  color: var(--pms-muted);
  text-transform: uppercase;
  letter-spacing: .3px;
}

.sim-stop-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1rem;
  font-weight: 700;
  margin: 4px 0 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sim-stop-gain {
  font-family: 'JetBrains Mono', monospace;
  font-size: .68rem;
  font-weight: 700;
  color: var(--g2);
}

.sim-stop-gain.neg {
  color: var(--neg);
}

.sim-arrow {
  display: flex;
  align-items: center;
  color: var(--g3);
  font-size: .95rem;
  flex-shrink: 0;
}

@media (max-width: 480px) {
  .sim-strip {
    flex-direction: column;
    gap: 6px;
  }
  .sim-arrow {
    display: none;
  }
  .sim-stop {
    display: flex;
    align-items: center;
    justify-content: space-between;
    text-align: left;
    padding: 8px 12px;
  }
  .sim-stop-period {
    width: 30px;
    flex-shrink: 0;
  }
  .sim-stop-val {
    margin: 0;
    flex: 1;
    text-align: left;
    padding-left: 10px;
  }
}
```

- [ ] **Step 7: Run the build**

Run: `npm run build` (from repo root)
Expected: build succeeds, no type/lint errors.

- [ ] **Step 8: Manual verification — desktop and mobile widths**

With the dev server running, open `/pms-screener`, click a row to open the detail drawer, and confirm:
- The Returns bars now include "7 Years"/"10 Years" rows once `drawerQuartile` resolves (there may be a brief moment before they appear — this is expected, matching the existing `drawerBenchmark` loading behavior).
- The Wealth Creation Simulation card shows the 1Y → 3Y → 5Y strip with arrows.
- Resize below 480px width: the strip collapses to stacked rows with no arrows, all values remain fully legible.
- Open a different fund's drawer immediately after — confirm the quartile fetch cancels/replaces cleanly (no stale data flash from the previous fund), matching the existing `cancelled` guard pattern already used for `drawerBenchmark`.

- [ ] **Step 9: Commit**

```bash
git add app/pms-screener/page.jsx app/pms-screener/pms-screener.css
git commit -m "feat(pms-screener): add 7Y/10Y returns and Growth Journey Strip wealth simulation to the fund detail drawer"
```
