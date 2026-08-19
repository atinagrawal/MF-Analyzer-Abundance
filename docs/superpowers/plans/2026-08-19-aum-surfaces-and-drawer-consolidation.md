# AUM Surfaces + Drawer Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close three remaining gaps where AUM data already exists server-side but no UI reads it (SIF detail page, SIF Screener page, and Screener's own drawer), add a missing "View Full SIF Page" link on the SIF Screener page, and consolidate `ScreenerClient.jsx`'s own fund/SIF detail drawer with the shared `HoldingDetailDrawer.jsx` implementation so this class of gap can't recur.

**Architecture:** Two independent, small AUM-plumbing tasks (bulk SIF AUM into `/api/sif-nav`, then two UI reads of already-flowing AUM fields), followed by a structural split of `components/HoldingDetailDrawer.jsx`'s two drawers into presentational panels + thin fetch wrappers, then wiring `ScreenerClient.jsx`'s own `Detail`/`SifDetail` to render those same panels instead of a duplicate copy, finishing with a CSS cleanup pass once nothing in `ScreenerClient.jsx` depends on the old inline styles anymore.

**Tech Stack:** Next.js 16 App Router (client components + Route Handlers), Cloudflare R2 via `lib/r2.js`/`lib/r2JsonCache.js` for cached data, plain React function components (no new libraries).

## Global Constraints

- AUM fields are always `aumCr` (number or null) and `aumAsOf` (string or null) — this naming is already established by `lib/holdingsLookup.js`'s `getAumInfo()` and used identically everywhere AUM already appears (`app/api/fund-detail/[code]/route.js`, `app/api/sif-detail/[id]/route.js`, `app/fund/[code]/FundDetailClient.jsx`, `components/HoldingDetailDrawer.jsx`). Every new AUM field in this plan uses these exact names.
- `app/api/sif-nav/route.js`'s response change must be strictly additive — this route is also consumed by CAS Tracker and Portfolio for NAV lookups; no existing field may be renamed or removed.
- The `Detail`/`SifDetail` → `FundDetailPanel`/`SifDetailPanel` migration in `ScreenerClient.jsx` must not change any existing fetch logic, loading state, or error handling — only which JSX is rendered. Task-level review must confirm this by diffing behavior, not just confirming the build compiles.
- No CSS class is removed from `ScreenerClient.jsx` until it's been grepped across the *entire* file (not just the old `Detail`/`SifDetail` bodies) and confirmed unused elsewhere.
- Work directly on `main`, no feature branches. Stage only the exact files each task's commit touches — never a broad `git add -A`/`git add .` (this repo's working directory has had unrelated concurrent uncommitted work swept into a commit before).
- No Claude/AI co-author signature in any commit, ever.
- Testing convention: plain Node + `assert` where a pure-logic module exists; this plan has none, so verification is `npm run build` plus manual per-surface spot-checks.

---

### Task 1: SIF AUM in `/api/sif-nav`

**Files:**
- Modify: `lib/holdingsLookup.js`
- Modify: `app/api/sif-nav/route.js`

**Interfaces:**
- Produces: `getSifAumMap()`, exported from `lib/holdingsLookup.js` — returns the raw parsed `sif-aum.json` object (keys are `"SIF-XXX"` scheme IDs, values include `aumCr`/`asOf` among other fields — same shape `getAumInfo()` already reads internally via its own `getSifAum()` call).
- Produces: every scheme object in `GET /api/sif-nav`'s `schemes` array gains `aumCr`/`aumAsOf` fields. Consumed by Task 3 (`app/sifs/SifScreener.jsx`).

- [ ] **Step 1: Add `getSifAumMap()` to `lib/holdingsLookup.js`**

Read the file in full first. Find the existing `getAumInfo` export (added earlier this session, just above `getHoldingsData`):

```js
export async function getAumInfo(amfiCode) {
  const [amfiAum, sifAum] = await Promise.all([getAmfiAum(), getSifAum()]);
  const aumRecord = amfiAum?.[amfiCode] || sifAum?.[amfiCode] || null;
  return {
    aumCr: aumRecord?.aumCr ?? null,
    aumAsOf: aumRecord?.asOf ?? null,
  };
}
```

Add a new export immediately after it:

```js
/**
 * Bulk-friendly counterpart to getAumInfo() -- for a caller building a
 * whole LIST of SIF schemes (app/api/sif-nav/route.js), calling
 * getAumInfo() once per scheme would mean N redundant awaits (cheap
 * after the first, since getSifAum() is itself in-memory-cached, but
 * still N calls for no reason). Returns the raw sif-aum.json object
 * directly, keyed by "SIF-XXX" scheme_id, so the caller does one lookup
 * per scheme locally instead.
 */
export async function getSifAumMap() {
  return (await getSifAum()) || {};
}
```

- [ ] **Step 2: Merge AUM into `/api/sif-nav`'s response**

Read `app/api/sif-nav/route.js` in full first. Add the import:

```js
import { getSifAumMap } from '@/lib/holdingsLookup';
```

Find `fetchFromAMFI()`'s `return schemes;` line (the end of the function, after the nested loop that builds the `schemes` array). Change it to merge AUM in before returning:

```js
  const sifAumMap = await getSifAumMap();
  for (const scheme of schemes) {
    const aumRecord = sifAumMap[scheme.scheme_id] || null;
    scheme.aumCr = aumRecord?.aumCr ?? null;
    scheme.aumAsOf = aumRecord?.asOf ?? null;
  }

  return schemes;
```

(`fetchFromAMFI` is already `async`, so `await` here is valid without further changes to its signature.)

- [ ] **Step 3: Verify**

Run `node --check app/api/sif-nav/route.js` and `node --check lib/holdingsLookup.js` (syntax only — both files use `@/`-aliased imports, so they can't run standalone under plain Node; this matches every other file in `lib/` that imports `@/lib/db` etc.). Then start the dev server (`npm run dev`) and confirm `curl http://localhost:3000/api/sif-nav | head -c 2000` (or a browser visit) shows `aumCr`/`aumAsOf` on at least one scheme object, with real non-null values for schemes that have AMFI-published AUM data. Stop the dev server when done.

- [ ] **Step 4: Commit**

```bash
git add lib/holdingsLookup.js app/api/sif-nav/route.js
git commit -m "feat(aum): add SIF AUM to /api/sif-nav's response"
```

---

### Task 2: AUM on the SIF detail page

**Files:**
- Modify: `app/sif/[id]/SifDetailClient.jsx`

**Interfaces:**
- Consumes: `sif.aumCr`/`sif.aumAsOf` — already present in `GET /api/sif-detail/[id]`'s response (added in an earlier, already-shipped change this session — not part of this task).

- [ ] **Step 1: Add an AUM tile to the KPI grid**

Read the file in full first to confirm the current exact content of the `sif-kpi-grid` array (it may have shifted from the approximate line numbers below since other work may have touched this file). Find:

```js
        <div className="sif-kpi-grid">
          {[
            { lbl: 'Latest NAV',       val: sif.nav != null ? `₹${Number(sif.nav).toFixed(4)}` : '—', sub: `As of ${sif.nav_date || sif.asof}` },
            { lbl: '1M Return',        val: pct(sif.ret_1m),        sub: 'Absolute',      color: sif.ret_1m  },
```

Add a new entry immediately after the `'Latest NAV'` entry (before `'1M Return'`):

```js
            { lbl: 'AUM',              val: sif.aumCr != null ? `₹${Number(sif.aumCr).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr` : '—', sub: sif.aumAsOf ? `As of ${sif.aumAsOf}` : 'Fund size' },
```

Do not change any other entry in this array — just insert the one new object.

- [ ] **Step 2: Verify**

Run `npm run build` — must succeed. With the dev server running, visit `/sif/[any-real-scheme-id]` (e.g. `/sif/SIF-34`) and confirm an "AUM" tile now appears in the KPI grid, between Latest NAV and 1M Return, showing a real ₹X Cr value.

- [ ] **Step 3: Commit**

```bash
git add "app/sif/[id]/SifDetailClient.jsx"
git commit -m "feat(aum): show AUM on the SIF detail page"
```

---

### Task 3: AUM + "View Full SIF Page" link on the SIF Screener page

**Files:**
- Modify: `app/sifs/SifScreener.jsx`

**Interfaces:**
- Consumes: `scheme.aumCr`/`scheme.aumAsOf` from Task 1's `/api/sif-nav` change.

- [ ] **Step 1: Show AUM on `SifCard` (grid view)**

Read the file in full first — line numbers below are approximate and may have shifted. Find `SifCard`'s footer block:

```jsx
      {/* Footer: NAV + meta */}
      <div className="sif-card-foot">
        <div className="sif-nav-block">
          <span className="sif-nav-label">NAV</span>
          <span className="sif-nav-val">₹{scheme.nav.toFixed(4)}</span>
        </div>
        <div className="sif-meta-pills">
          <span className="sif-pill sif-type-pill">{scheme.type}</span>
          <span className="sif-pill sif-id-pill">{scheme.scheme_id}</span>
        </div>
      </div>
```

Add an AUM block right after the NAV block, inside the same `sif-card-foot` div:

```jsx
      {/* Footer: NAV + AUM + meta */}
      <div className="sif-card-foot">
        <div className="sif-nav-block">
          <span className="sif-nav-label">NAV</span>
          <span className="sif-nav-val">₹{scheme.nav.toFixed(4)}</span>
        </div>
        {scheme.aumCr != null && (
          <div className="sif-nav-block">
            <span className="sif-nav-label">AUM</span>
            <span className="sif-nav-val">₹{Number(scheme.aumCr).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr</span>
          </div>
        )}
        <div className="sif-meta-pills">
          <span className="sif-pill sif-type-pill">{scheme.type}</span>
          <span className="sif-pill sif-id-pill">{scheme.scheme_id}</span>
        </div>
      </div>
```

- [ ] **Step 2: Add a "View Full SIF Page" link to `SifCard`**

Find the existing "View History" trigger button at the end of `SifCard`'s JSX:

```jsx
      <button
        className="sif-hist-trigger"
        onClick={() => onViewHistory(scheme)}
        aria-label={`View NAV history for ${scheme.nav_name}`}
      >
        📈 View History
      </button>
    </div>
  );
}
```

Add a second link immediately after that button, still inside the outer `<div className="sif-card">`:

```jsx
      <button
        className="sif-hist-trigger"
        onClick={() => onViewHistory(scheme)}
        aria-label={`View NAV history for ${scheme.nav_name}`}
      >
        📈 View History
      </button>
      <a
        className="sif-hist-trigger"
        href={`/sif/${scheme.scheme_id}`}
        target="_blank"
        rel="noreferrer"
        style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: '6px' }}
      >
        📄 View Full SIF Page →
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Show AUM on `SifRow` (list view)**

Find `SifRow`'s NAV cell:

```jsx
      <td className="sif-td sif-td-nav mono">₹{scheme.nav.toFixed(4)}</td>
      <td className="sif-td sif-td-date mono">{fmtDate(scheme.nav_date)}</td>
```

Add an AUM cell right after it:

```jsx
      <td className="sif-td sif-td-nav mono">₹{scheme.nav.toFixed(4)}</td>
      <td className="sif-td sif-td-nav mono">{scheme.aumCr != null ? `₹${Number(scheme.aumCr).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr` : '—'}</td>
      <td className="sif-td sif-td-date mono">{fmtDate(scheme.nav_date)}</td>
```

Because this adds a new `<td>`, the LIST VIEW's table header row must gain a matching `<th>`. Search this same file for the `<thead>` that pairs with `SifRow`'s columns (it will have header cells in the same order: rank, name, strategy, type, NAV, date, actions) and add an "AUM" header cell in the corresponding position (immediately after the existing NAV header, before the date header) — read the surrounding header markup to match its exact existing cell style/class before inserting.

- [ ] **Step 4: Add a "View Full SIF Page" link to `SifRow`**

Find `SifRow`'s action cell:

```jsx
      <td className="sif-td sif-td-action" style={{ whiteSpace: 'nowrap' }}>
        <button
          className={`sif-star${watched ? ' active' : ''}`}
          onClick={() => onToggleWatch(scheme.scheme_id)}
          aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          {watched ? '★' : '☆'}
        </button>
        <button
          className="sif-hist-trigger-sm"
          onClick={() => onViewHistory(scheme)}
          title="View NAV history"
        >
          📈
        </button>
      </td>
```

Add a link button right after the history trigger:

```jsx
      <td className="sif-td sif-td-action" style={{ whiteSpace: 'nowrap' }}>
        <button
          className={`sif-star${watched ? ' active' : ''}`}
          onClick={() => onToggleWatch(scheme.scheme_id)}
          aria-label={watched ? 'Remove from watchlist' : 'Add to watchlist'}
        >
          {watched ? '★' : '☆'}
        </button>
        <button
          className="sif-hist-trigger-sm"
          onClick={() => onViewHistory(scheme)}
          title="View NAV history"
        >
          📈
        </button>
        <a
          className="sif-hist-trigger-sm"
          href={`/sif/${scheme.scheme_id}`}
          target="_blank"
          rel="noreferrer"
          title="View full SIF page"
          style={{ display: 'inline-flex', textDecoration: 'none' }}
        >
          📄
        </a>
      </td>
```

- [ ] **Step 5: Add AUM to `NavHistoryModal`'s stats row and a link in its header**

Find `NavHistoryModal`'s stats row:

```jsx
              {stats && (
                <div className="sif-hist-stats">
                  {[
                    ['Period Return', (isProfit ? '+' : '') + stats.ret.toFixed(2) + '%', isProfit ? '#69f0ae' : '#ef5350'],
                    ['Current NAV',   '₹' + stats.current.toFixed(4), 'rgba(255,255,255,.9)'],
                    ['Period High',   '₹' + stats.high.toFixed(4),    '#a5d6a7'],
                    ['Period Low',    '₹' + stats.low.toFixed(4),     '#ef9a9a'],
                    ['Data Points',   stats.points + ' days',          'rgba(255,255,255,.5)'],
                  ].map(([label, val, color]) => (
```

Insert an AUM entry into that same array, right after `'Current NAV'`:

```jsx
              {stats && (
                <div className="sif-hist-stats">
                  {[
                    ['Period Return', (isProfit ? '+' : '') + stats.ret.toFixed(2) + '%', isProfit ? '#69f0ae' : '#ef5350'],
                    ['Current NAV',   '₹' + stats.current.toFixed(4), 'rgba(255,255,255,.9)'],
                    ...(scheme.aumCr != null ? [['AUM', '₹' + Number(scheme.aumCr).toLocaleString('en-IN', { maximumFractionDigits: 0 }) + ' Cr', 'rgba(255,255,255,.9)']] : []),
                    ['Period High',   '₹' + stats.high.toFixed(4),    '#a5d6a7'],
                    ['Period Low',    '₹' + stats.low.toFixed(4),     '#ef9a9a'],
                    ['Data Points',   stats.points + ' days',          'rgba(255,255,255,.5)'],
                  ].map(([label, val, color]) => (
```

Then find `NavHistoryModal`'s header (the close button lives here):

```jsx
        <div className="sif-hist-header">
          <div className="sif-hist-header-left">
            <div className="sif-hist-eyebrow">NAV History</div>
            <div className="sif-hist-title">{scheme.nav_name}</div>
            <div className="sif-hist-sub">{scheme.sif_name} · {scheme.scheme_id}</div>
          </div>
          <button className="sif-hist-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
```

Add a link inside `sif-hist-header-left`, after the `sif-hist-sub` line:

```jsx
        <div className="sif-hist-header">
          <div className="sif-hist-header-left">
            <div className="sif-hist-eyebrow">NAV History</div>
            <div className="sif-hist-title">{scheme.nav_name}</div>
            <div className="sif-hist-sub">{scheme.sif_name} · {scheme.scheme_id}</div>
            <a
              href={`/sif/${scheme.scheme_id}`}
              target="_blank"
              rel="noreferrer"
              style={{ display: 'inline-block', marginTop: '6px', fontSize: '.75rem', color: 'rgba(255,255,255,.7)', textDecoration: 'underline' }}
            >
              View full SIF page →
            </a>
          </div>
          <button className="sif-hist-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
```

- [ ] **Step 6: Verify**

Run `npm run build` — must succeed. With the dev server running, visit `/sifs` and confirm: AUM shows on grid cards and on list-view rows (switch between the two view modes), a "View Full SIF Page" link/icon opens `/sif/[scheme_id]` in a new tab from both the card and the row, and clicking "View History" still opens the modal with an AUM stat now present and its own link to the full SIF page.

- [ ] **Step 7: Commit**

```bash
git add app/sifs/SifScreener.jsx
git commit -m "feat(aum): show AUM and add a Full SIF Page link on the SIF Screener page"
```

---

### Task 4: Extract `FundDetailPanel` from `HoldingDetailDrawer.jsx`

**Files:**
- Modify: `components/HoldingDetailDrawer.jsx`

**Interfaces:**
- Produces: `FundDetailPanel({ f, stress, holdings, nav, schemeFacts, onClose })`, a new named export — pure rendering, no fetching, no `useState`/`useEffect`. Consumed by this same task's refactored `FundDetailDrawer`, and later by Task 6 (`ScreenerClient.jsx`'s `Detail`).
- Consumes: nothing new — same imports the file already has (`ProviderAvatar`, `getMFLogo`, `normalizeSchemeName`, `shortCat`, `CompareGrowthChart`, `HoldingsSection`, the local `formatMonth`/`getLiquidityColor`/`cls`/`backtestLink` helpers).

Read the file in full first — this task moves existing JSX verbatim into a new function; the exact current content matters more than any line numbers quoted here.

- [ ] **Step 1: Add the new `FundDetailPanel` function**

Directly above `export function FundDetailDrawer({ code, onClose })`, add:

```jsx
// Pure rendering -- takes fully-resolved data as props, no fetching of its
// own. Used by FundDetailDrawer below (which fetches by code, for CAS
// Tracker/Portfolio) AND by app/screener/ScreenerClient.jsx's Detail
// (which already has f/stress from its own bulk row data, and only
// fetches holdings/nav/schemeFacts itself) -- previously each of those
// two callers inlined its own copy of this exact JSX; this is the single
// shared version. See docs/superpowers/specs/
// 2026-08-19-aum-surfaces-and-drawer-consolidation-design.md.
export function FundDetailPanel({ f, stress, holdings, nav, schemeFacts, onClose }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="scr-drawer-h">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
          <ProviderAvatar name={f.amc} logoPath={getMFLogo(f.amc)} size={36} radius={8} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="scr-drawer-name">{f.name}</div>
            <div className="scr-drawer-tags"><span className="scr-tag">{f.amc}</span><span className="scr-tag alt">{shortCat(f.category)}</span><span className="scr-tag alt">{f.structure}</span></div>
          </div>
        </div>
        <button className="scr-x" onClick={onClose} aria-label="Close">×</button>
      </div>
      {f.flag === 'check' && <div className="scr-warn">⚠ One or more returns look unusual for this fund — we're reviewing the source NAV. Treat with caution.</div>}
      {stress && stress.days_50pct > 20 && (
        <div className="scr-warn" style={{ backgroundColor: 'rgba(211, 47, 47, 0.08)', border: '1px solid rgba(211, 47, 47, 0.2)', color: '#d32f2f' }}>
          ⚠️ <b>Liquidity Alert:</b> This fund takes <b>{stress.days_50pct} days</b> to liquidate 50% of its portfolio under stress. High redemption volume could significantly impact portfolio values.
        </div>
      )}

      {!nav ? (
        <div className="scr-spark-load">Loading NAV history…</div>
      ) : nav.length < 2 ? null : (
        <CompareGrowthChart series={[{ name: f.name, color: nav[nav.length - 1].v >= nav[0].v ? '#2e7d32' : '#b71c1c', data: nav }]} showLegend={false} />
      )}

      <div className="scr-drawer-kpis">
        {[['1Y', f.ret_1y, '%'], ['3Y', f.ret_3y, '%'], ['5Y', f.ret_5y, '%'], ['Since inception', f.ret_inception, '%'], ['Volatility', f.vol, '%'], ['Max drawdown', f.max_dd, '%'], ['Return / risk', f.ret_per_risk, '']].map(([l, v, u]) => (
          <div className="scr-dk" key={l}><span>{l}</span><b className={u === '%' && l.includes('draw') ? 'scr-neg' : cls(typeof v === 'number' ? v : null)}>{v == null ? '—' : (u === '%' ? (v > 0 && !l.includes('draw') && !l.includes('Vol') ? '+' : '') + v.toFixed(1) + '%' : v.toFixed(2))}</b></div>
        ))}
      </div>

      {stress && (
        <div className="scr-stress-section">
          <div className="scr-stress-title">💧 Liquidity &amp; Stress Test Analysis</div>
          <div className="scr-stress-month">Data as of {formatMonth(stress.month)}</div>
          <div className="scr-stress-liquidity-grid">
            <div className="scr-stress-liq-card">
              <div className="scr-liq-label">Days to Liquidate 50%</div>
              <div className="scr-liq-val">{stress.days_50pct} days</div>
              <div className="scr-liq-meter"><div className="scr-liq-meter-fill" style={{ width: `${Math.min(100, (stress.days_50pct / 30) * 100)}%`, backgroundColor: getLiquidityColor(stress.days_50pct) }}></div></div>
            </div>
            <div className="scr-stress-liq-card">
              <div className="scr-liq-label">Days to Liquidate 25%</div>
              <div className="scr-liq-val">{stress.days_25pct} days</div>
              <div className="scr-liq-meter"><div className="scr-liq-meter-fill" style={{ width: `${Math.min(100, (stress.days_25pct / 15) * 100)}%`, backgroundColor: getLiquidityColor(stress.days_25pct * 2) }}></div></div>
            </div>
          </div>
          {stress.days_50pct >= 15 && stress.days_50pct <= 20 && (
            <div className="scr-warn-liquidity">⚠️ <b>Moderate Liquidity Risk:</b> Takes {stress.days_50pct} days to liquidate half of the portfolio under stress conditions.</div>
          )}
          <div className="scr-stress-kpis" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '12px' }}>
            <div className="scr-dk"><span>Top 10 Investors</span><b>{stress.top10_investors_pct ? `${stress.top10_investors_pct}%` : '—'}</b></div>
            <div className="scr-dk"><span>Turnover Ratio</span><b>{stress.turnover_ratio ? `${stress.turnover_ratio}%` : '—'}</b></div>
            <div className="scr-dk"><span>Portfolio Beta</span><b>{stress.beta ? stress.beta.toFixed(2) : '—'}</b></div>
          </div>
          <div className="scr-allocation-card">
            <div className="scr-alloc-title">Asset Allocation Breakdown</div>
            <div className="scr-alloc-bars">
              <div className="scr-alloc-item"><div className="scr-alloc-lbl">Large Cap ({stress.large_cap_pct}%)</div><div className="scr-alloc-bar-bg"><div className="scr-alloc-bar-fill large-cap" style={{ width: `${stress.large_cap_pct}%` }}></div></div></div>
              <div className="scr-alloc-item"><div className="scr-alloc-lbl">Mid Cap ({stress.mid_cap_pct}%)</div><div className="scr-alloc-bar-bg"><div className="scr-alloc-bar-fill mid-cap" style={{ width: `${stress.mid_cap_pct}%` }}></div></div></div>
              <div className="scr-alloc-item"><div className="scr-alloc-lbl">Small Cap ({stress.small_cap_pct}%)</div><div className="scr-alloc-bar-bg"><div className="scr-alloc-bar-fill small-cap" style={{ width: `${stress.small_cap_pct}%` }}></div></div></div>
              <div className="scr-alloc-item"><div className="scr-alloc-lbl">Cash ({stress.cash_pct}%)</div><div className="scr-alloc-bar-bg"><div className="scr-alloc-bar-fill cash" style={{ width: `${stress.cash_pct}%` }}></div></div></div>
            </div>
          </div>
          <div className="scr-valuation-card">
            <div className="scr-alloc-title">PE Valuation vs Benchmark</div>
            <div className="scr-pe-grid">
              <div className="scr-pe-item"><div className="scr-pe-label">Portfolio PE</div><div className="scr-pe-val">{stress.pe_portfolio ? stress.pe_portfolio.toFixed(1) : '—'}</div></div>
              <div className="scr-pe-item"><div className="scr-pe-label">Benchmark PE</div><div className="scr-pe-val">{stress.pe_benchmark ? stress.pe_benchmark.toFixed(1) : '—'}</div></div>
            </div>
            {stress.pe_benchmark_1ya && (
              <div className="scr-pe-history">Benchmark PE: 1Y ago <b>{stress.pe_benchmark_1ya.toFixed(1)}</b> {stress.pe_benchmark_2ya && <>| 2Y ago <b>{stress.pe_benchmark_2ya.toFixed(1)}</b></>}</div>
            )}
          </div>
        </div>
      )}

      <HoldingsSection holdingsData={holdings} loading={false} schemeName={f.name} />

      <div className="scr-drawer-meta">
        <span>Latest NAV ₹{f.nav}</span>
        {f.aumCr != null && <span>AUM ₹{Number(f.aumCr).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr</span>}
        {f.inception_date && <span>Since {new Date(f.inception_date + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>}
        <span>Age ~{f.age_years ?? '—'} yrs</span>
        <span>as of {f.asof}</span>
      </div>

      {(() => {
        if (!schemeFacts) return null;
        const masterRec = (f.isin && schemeFacts.byIsin?.[f.isin]) ||
          (f.code && schemeFacts.byAmfiCode?.[f.code]) || (() => {
            const norm = normalizeSchemeName(f.name);
            return norm ? schemeFacts.byNormName?.[norm] : null;
          })();
        if (!masterRec) return null;
        return (
          <div style={{ margin: '14px 0', padding: '14px 16px', background: 'var(--s2)', borderRadius: '12px', border: '1.5px solid var(--border)' }}>
            <div style={{ fontSize: '.68rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--muted)', marginBottom: '10px', fontFamily: "'JetBrains Mono', monospace" }}>📋 Key Operational Facts (BSE StAR)</div>
            {(masterRec.purchaseAllowed === false || masterRec.redemptionAllowed === false) && (
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: '#d32f2f', background: 'rgba(211,47,47,0.08)', border: '1px solid rgba(211,47,47,0.2)', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px' }}>
                ⚠️ {masterRec.purchaseAllowed === false && masterRec.redemptionAllowed === false ? 'Currently not accepting fresh purchases or redemptions via BSE' : masterRec.purchaseAllowed === false ? 'Currently not accepting fresh purchases via BSE' : 'Currently not accepting redemptions via BSE'}
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '10px' }}>
              <div><div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>🕒 Daily NAV Cutoff</div><div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text)' }}>{masterRec.redeemCutoff || masterRec.purchaseCutoff || masterRec.cutoff || '—'}</div></div>
              <div><div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>🏦 Settlement Cycle</div><div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text)' }}>{masterRec.settlement ? `${masterRec.settlement} Business Days` : '—'}</div></div>
              <div><div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>💰 Min Lumpsum</div><div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text)' }}>{masterRec.minPurchase != null ? `₹${masterRec.minPurchase.toLocaleString('en-IN')}` : '—'}</div></div>
              <div><div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>🏢 RTA Servicer</div><div style={{ fontSize: '.78rem', fontWeight: 700, color: masterRec.rta === 'CAMS' ? '#1565c0' : masterRec.rta === 'KFINTECH' ? '#6a1b9a' : 'var(--text)' }}>{masterRec.rta || '—'}</div></div>
            </div>
            {masterRec.exitLoadText && (
              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '.6rem', color: 'var(--muted)' }}>🚪 Exit Load {masterRec.exitLoadConfidence === 'low' && '(needs review)'}</div>
                {masterRec.exitLoadConfidence === 'high' && Array.isArray(masterRec.exitLoadTiers) ? (
                  <div style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--text)' }}>
                    {masterRec.exitLoadTiers.length === 0 ? '0% (No Load)' : masterRec.exitLoadTiers.map(t => `${(t.rate * 100).toFixed(2).replace(/\.00$/, '')}% (<${Math.round(t.days / 30.44)}mo)`).join(' / ')}
                    {masterRec.exitLoadFreePercent ? ` · ${masterRec.exitLoadFreePercent}% free` : ''}
                  </div>
                ) : (
                  <div style={{ fontSize: '.72rem', fontWeight: 600, color: 'var(--muted)', fontStyle: 'italic' }}>{masterRec.exitLoadText}</div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {masterRec.swp === true && <span style={{ fontSize: '.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--g-xlight)', color: 'var(--g1)', border: '1px solid var(--g-light)' }}>SWP Eligible</span>}
              {masterRec.sip === true && <span style={{ fontSize: '.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--g-xlight)', color: 'var(--g1)', border: '1px solid var(--g-light)' }}>SIP Available</span>}
              {masterRec.switchAllowed === true && <span style={{ fontSize: '.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--g-xlight)', color: 'var(--g1)', border: '1px solid var(--g-light)' }}>Switch Available</span>}
              {masterRec.divReinvest === true && <span style={{ fontSize: '.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--g-xlight)', color: 'var(--g1)', border: '1px solid var(--g-light)' }}>IDCW Reinvestment</span>}
              <span style={{ fontSize: '.55rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'var(--s3)', color: 'var(--muted)', border: '1px solid var(--border)' }}>Demat &amp; SOA</span>
            </div>
          </div>
        );
      })()}

      <div className="scr-drawer-cta">
        <a className="scr-btn primary" href={`/fund/${f.code}`} target="_blank" rel="noreferrer">📄 Full Fund Report →</a>
        <a className="scr-btn" href={backtestLink(f)}>⚗ Backtest this fund</a>
        <a className="scr-btn" href="/rolling">📉 Rolling returns</a>
      </div>
    </>
  );
}
```

Note the two differences from the CURRENT `FundDetailDrawer` JSX (both deliberate, both already true of the current file): the `<HoldingsSection loading={...}>` prop is now hardcoded `loading={false}` (the panel receives already-resolved `holdings`, so there is no separate loading state to pass through here — the WRAPPER below still tracks its own loading state and simply doesn't render the panel at all until `holdings` is settled), and the `<style>` injection is now inside this panel rather than the wrapper.

- [ ] **Step 2: Refactor `FundDetailDrawer` to render the new panel**

Find the current `FundDetailDrawer` function's return statement — everything from `return (` through the final `);` and `}`. It currently looks like (abbreviated — read the actual file for the exact current content):

```jsx
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="scr-drawer-wrap" onMouseDown={onClose}>
      <div className="scr-drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        {state.loading ? (
          <div className="scr-spark-load">Loading fund details…</div>
        ) : state.error || !f ? (
          <>
            <div className="scr-drawer-h">
              <div className="scr-drawer-name">Fund details unavailable</div>
              <button className="scr-x" onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="scr-warn">We couldn't load details for this fund right now.</div>
          </>
        ) : (
          <>
            {/* ... the full JSX now moved into FundDetailPanel above ... */}
          </>
        )}
      </div>
    </div>
    </>
  );
}
```

Replace the entire `return (...)` block with:

```jsx
  return (
    <div className="scr-drawer-wrap" onMouseDown={onClose}>
      <div className="scr-drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        {state.loading ? (
          <>
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
            <div className="scr-spark-load">Loading fund details…</div>
          </>
        ) : state.error || !f ? (
          <>
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
            <div className="scr-drawer-h">
              <div className="scr-drawer-name">Fund details unavailable</div>
              <button className="scr-x" onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="scr-warn">We couldn't load details for this fund right now.</div>
          </>
        ) : (
          <FundDetailPanel f={f} stress={stress} holdings={state.holdings} nav={nav} schemeFacts={schemeFacts} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
```

(The loading/error branches keep their own `<style>` injection since `FundDetailPanel` — the only other source of that CSS now — isn't rendered in those branches; without this, the drawer's own wrapper chrome like `.scr-drawer`/`.scr-spark-load`/`.scr-warn` would be unstyled while loading or on error.)

- [ ] **Step 3: Verify**

Run `npm run build` — must succeed. With the dev server running, open CAS Tracker or Portfolio, click a mutual fund holding, and confirm the drawer renders exactly as before (chart, KPIs, stress section if present, holdings, AUM in the meta line, operational facts, CTA buttons) — this must look and behave identically to before this task, since only the internal structure changed.

- [ ] **Step 4: Commit**

```bash
git add components/HoldingDetailDrawer.jsx
git commit -m "refactor(holding-drawer): extract FundDetailPanel as a pure presentational component"
```

---

### Task 5: Extract `SifDetailPanel` from `HoldingDetailDrawer.jsx`

**Files:**
- Modify: `components/HoldingDetailDrawer.jsx`

**Interfaces:**
- Produces: `SifDetailPanel({ s, holdings, pts, histLoading, onClose })`, a new named export — same pure-rendering contract as `FundDetailPanel`. Consumed by this task's refactored `SifDetailDrawer`, and later by Task 7 (`ScreenerClient.jsx`'s `SifDetail`).

Read the file in full first (it now includes Task 4's `FundDetailPanel`, committed just before this task).

- [ ] **Step 1: Add the new `SifDetailPanel` function**

Directly above `export function SifDetailDrawer({ schemeId, onClose })`, add:

```jsx
// Pure rendering counterpart to FundDetailPanel above, for SIFs. See that
// function's header comment for why this split exists.
export function SifDetailPanel({ s, holdings, pts, histLoading, onClose }) {
  const fam = s.category?.startsWith('Equity') ? 'Equity' : 'Hybrid';
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="scr-drawer-h">
        <div>
          <div className="scr-drawer-name">{s.nav_name.replace(/\s*-\s*(Regular Plan|Regular).*/i, '').trim()}</div>
          <div className="scr-drawer-tags">
            <span className="scr-tag">{s.sif_name}</span>
            <span className={`scr-sif-badge scr-sif-badge-${fam.toLowerCase()}`} style={{ fontSize: '10px', padding: '3px 8px' }}>{SIF_STRATEGY_LABELS[s.category] || sifStratShort(s.category)}</span>
            <span className="scr-tag alt">{s.scheme_id}</span>
          </div>
        </div>
        <button className="scr-x" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="scr-sif-notice">ⓘ SIFs are a new asset class (launched 2024–25) with limited NAV history — longer-horizon metrics (3Y+) will populate as funds mature. See the table for the return periods already available.</div>

      {histLoading ? (
        <div className="scr-spark-load">Loading NAV history…</div>
      ) : (!pts || pts.length < 2) ? (
        <div className="scr-spark-load">No NAV history available yet</div>
      ) : (
        <CompareGrowthChart series={[{ name: s.nav_name, color: pts[pts.length - 1].v >= pts[0].v ? '#2e7d32' : '#b71c1c', data: pts }]} showLegend={false} />
      )}

      <div className="scr-drawer-kpis">
        <div className="scr-dk"><span>Latest NAV</span><b>₹{s.nav.toFixed(4)}</b></div>
        <div className="scr-dk"><span>NAV Date</span><b style={{ fontSize: '13px' }}>{s.nav_date}</b></div>
        <div className="scr-dk"><span>Data points</span><b>{pts ? pts.length : '—'}</b></div>
        {s.aumCr != null && (
          <div className="scr-dk"><span>AUM</span><b style={{ fontSize: '13px' }}>₹{Number(s.aumCr).toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr</b></div>
        )}
      </div>

      <HoldingsSection holdingsData={holdings} loading={false} schemeName={s.nav_name} />

      <div className="scr-drawer-cta">
        <a className="scr-btn primary" href={`/sif/${s.scheme_id}`} target="_blank" rel="noreferrer">View Full SIF Page →</a>
        <a className="scr-btn" href={backtestSifLink(s)}>⚗ Backtest this SIF</a>
        <a className="scr-btn" href="/sifs">📋 Full SIF screener</a>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Refactor `SifDetailDrawer` to render the new panel**

Same pattern as Task 4 Step 2. Find `SifDetailDrawer`'s current return statement and replace it with:

```jsx
  return (
    <div className="scr-drawer-wrap" onMouseDown={onClose}>
      <div className="scr-drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        {state.loading ? (
          <>
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
            <div className="scr-spark-load">Loading SIF details…</div>
          </>
        ) : state.error || !s ? (
          <>
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
            <div className="scr-drawer-h">
              <div className="scr-drawer-name">SIF details unavailable</div>
              <button className="scr-x" onClick={onClose} aria-label="Close">×</button>
            </div>
            <div className="scr-warn">We couldn't load details for this SIF right now.</div>
          </>
        ) : (
          <SifDetailPanel s={s} holdings={state.holdings} pts={pts} histLoading={histLoading} onClose={onClose} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run `npm run build` — must succeed. With the dev server running, open CAS Tracker or Portfolio, click a SIF holding, and confirm the drawer renders exactly as before (chart, KPIs including AUM, holdings, CTA buttons).

- [ ] **Step 4: Commit**

```bash
git add components/HoldingDetailDrawer.jsx
git commit -m "refactor(holding-drawer): extract SifDetailPanel as a pure presentational component"
```

---

### Task 6: Wire `ScreenerClient.jsx`'s `Detail` to use `FundDetailPanel`

**Files:**
- Modify: `app/screener/ScreenerClient.jsx`

**Interfaces:**
- Consumes: `FundDetailPanel` from `@/components/HoldingDetailDrawer` (Task 4).

Read the file in full first — do not trust the line numbers below, they are approximate.

- [ ] **Step 1: Import the panel**

Near this file's other imports, add:

```js
import { FundDetailPanel } from '@/components/HoldingDetailDrawer';
```

- [ ] **Step 2: Replace `Detail`'s JSX with the panel**

Find the `Detail({ f, stress, onClose })` function. Its data-fetching (the three `useEffect` calls for `schemeFacts`, `holdingsData`/`holdingsLoading`, and `nav`) and its `const M = [...]` line stay EXACTLY as they are — do not touch them. Only the `return (...)` statement changes.

The current return statement renders a full `<div className="scr-drawer-wrap">...</div>` tree with the same JSX now living in `FundDetailPanel`. Replace the ENTIRE `return (...)` block (from `return (` through the matching closing `);`) with:

```jsx
  return (
    <div className="scr-drawer-wrap" onMouseDown={onClose}>
      <div className="scr-drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <FundDetailPanel f={f} stress={stress} holdings={holdingsData} nav={nav} schemeFacts={schemeFacts} onClose={onClose} />
      </div>
    </div>
  );
}
```

Unlike `HoldingDetailDrawer.jsx`'s own wrapper, `Detail` has no separate loading/error branch to preserve here — it already only ever gets called with a real, already-loaded `f` (Screener never opens this drawer for a fund it doesn't have data for), and `holdingsData`/`nav`/`schemeFacts` are all handled gracefully as `null` by `FundDetailPanel` itself (loading spinners / "no chart yet" states) exactly as they were before this change — confirm this by reading `FundDetailPanel`'s own null-handling for each of those three props (Task 4) before writing this step, since if that assumption is wrong, `Detail` needs to keep its own loading branch too.

- [ ] **Step 3: Verify**

Run `npm run build` — must succeed. With the dev server running, visit `/screener`, click a mutual fund row to open its drawer, and confirm it renders identically to before (chart, KPIs, stress section if present, holdings, **AUM now visible in the meta line — this was the actual originally-reported gap**, operational facts, CTA buttons).

- [ ] **Step 4: Commit**

```bash
git add app/screener/ScreenerClient.jsx
git commit -m "refactor(screener): render the shared FundDetailPanel instead of a duplicate copy"
```

---

### Task 7: Wire `ScreenerClient.jsx`'s `SifDetail` to use `SifDetailPanel`

**Files:**
- Modify: `app/screener/ScreenerClient.jsx`

**Interfaces:**
- Consumes: `SifDetailPanel` from `@/components/HoldingDetailDrawer` (Task 5).

Read the file in full first (it now includes Task 6's changes).

- [ ] **Step 1: Import the panel**

Add to the same import line Task 6 added, or a new line next to it:

```js
import { FundDetailPanel, SifDetailPanel } from '@/components/HoldingDetailDrawer';
```

(If Task 6's import already exists as a separate line, merge it into one import statement rather than having two separate `from '@/components/HoldingDetailDrawer'` lines.)

- [ ] **Step 2: Replace `SifDetail`'s JSX with the panel**

Find `SifDetail({ s, onClose })`. Its data-fetching (`holdingsData`/`holdingsLoading`, `pts`/`histLoading`) stays exactly as it is. Replace the entire `return (...)` block with:

```jsx
  return (
    <div className="scr-drawer-wrap" onMouseDown={onClose}>
      <div className="scr-drawer" onMouseDown={(e) => e.stopPropagation()} role="dialog">
        <SifDetailPanel s={s} holdings={holdingsData} pts={pts} histLoading={histLoading} onClose={onClose} />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run `npm run build` — must succeed. With the dev server running, visit `/screener`, switch to SIFs, click a SIF row to open its drawer, and confirm it renders identically to before (chart, KPIs including AUM now present, holdings, CTA buttons).

- [ ] **Step 4: Commit**

```bash
git add app/screener/ScreenerClient.jsx
git commit -m "refactor(screener): render the shared SifDetailPanel instead of a duplicate copy"
```

---

### Task 8: Remove now-redundant drawer CSS from `ScreenerClient.jsx`

**Files:**
- Modify: `app/screener/ScreenerClient.jsx`

Read the file in full first (it now includes Tasks 6-7's changes — neither `Detail` nor `SifDetail` render any of the old inline drawer JSX anymore, so this file's own copy of the drawer CSS is now fully unused, PROVIDED no other part of this file also uses these same class names — verify, don't assume).

- [ ] **Step 1: Remove the internal exact-duplicate block**

Confirmed this session: this file's single `const CSS = \`...\`` template string contains the ENTIRE drawer-related rule set (from `.scr-drawer-wrap{...}` through the `@media (prefers-reduced-motion...)` line, ending right before a `/* Table liquidity badge styles */` comment) TWICE, verbatim, back to back in effect — once starting at `.scr-drawer-wrap{position:fixed...}` and ending at `@media (prefers-reduced-motion: reduce){ .scr-drawer,.scr-drawer-wrap{animation:none} .scr-btn:hover{transform:none} }`, then the exact same block repeated again immediately before the next `/* Table liquidity badge styles */` comment. This is a pre-existing internal duplication, unrelated to this plan's other changes — confirm it's still present (re-run `grep -n "^\.scr-drawer-wrap{" app/screener/ScreenerClient.jsx` and `grep -n "Table liquidity badge styles" app/screener/ScreenerClient.jsx` yourself; if the file has changed enough that only one copy remains, skip to Step 2).

Delete ONE of the two identical copies in full (every line from its `.scr-drawer-wrap{...}` line through its own `@media (prefers-reduced-motion...)` line, inclusive) — keep the other copy for now; Step 2 decides what happens to what remains.

- [ ] **Step 2: Identify and remove classes now unused anywhere in the file**

For EACH of the following class names, run `grep -n "\.scr-drawer-wrap\b\|\.scr-drawer\b\|\.scr-drawer-h\b\|\.scr-drawer-name\b\|\.scr-drawer-tags\b\|\.scr-drawer-kpis\b\|\.scr-drawer-meta\b\|\.scr-drawer-cta\b\|\.scr-dk\b\|\.scr-warn\b\|\.scr-warn-liquidity\b\|\.scr-spark-load\b\|\.scr-stress-\|\.scr-alloc-\|\.scr-liq-\|\.scr-pe-\|\.scr-sif-badge\b\|\.scr-sif-notice\b" app/screener/ScreenerClient.jsx` against the WHOLE file (this single command covers all the drawer/stress/allocation/PE/liquidity/SIF-badge classes at once). For each class name reported:
  - If EVERY remaining match is inside the CSS definition itself (i.e., the class is never referenced in any JSX `className=` anywhere in the file anymore, since `Detail`/`SifDetail` no longer render it directly) — delete that class's CSS rule (the remaining single copy from Step 1).
  - If any match is a real JSX usage outside the CSS block, leave that class's rule in place.

Separately check these classes, which are more likely to be SHARED with the table/leaders/pager sections rather than drawer-exclusive — do NOT remove their rules without confirming, individually, that no JSX `className=` usage outside the old (now-deleted) `Detail`/`SifDetail` bodies references them: `.scr-tag`, `.scr-x`, `.scr-btn` (and `.scr-btn.primary`), `.scr-pos`, `.scr-neg`, `.scr-muted`. (Expectation, to verify rather than trust: `.scr-pos`/`.scr-neg`/`.scr-muted` are very likely used by the table's own return-coloring logic elsewhere in this file and must stay; the others need checking individually.)

- [ ] **Step 3: Verify**

Run `npm run build` — must succeed. With the dev server running, visit `/screener` and manually confirm the WHOLE page still looks correct: the search/filter controls, the leaders section, the main table (including any color-coded positive/negative return cells), the pager, and the FAQ section all still render and look exactly as they did before this task — not just the drawer. Then re-open both a fund and a SIF drawer and confirm they still look correct too (this confirms `FundDetailPanel`/`SifDetailPanel`'s own CSS, injected fresh by those components, is fully sufficient on its own with nothing missing that this file's now-removed rules were silently also providing).

- [ ] **Step 4: Commit**

```bash
git add app/screener/ScreenerClient.jsx
git commit -m "chore(screener): remove drawer CSS now fully owned by the shared HoldingDetailDrawer component"
```

---

## Self-Review Notes

- **Spec coverage**: Part 1 (three AUM-reading gaps + SIF Screener link) = Tasks 1-3. Part 2 (drawer consolidation) = Tasks 4-8. All covered.
- **Type/shape consistency**: `FundDetailPanel`'s and `SifDetailPanel`'s prop names (`f`/`stress`/`holdings`/`nav`/`schemeFacts`/`onClose` and `s`/`holdings`/`pts`/`histLoading`/`onClose` respectively) are used identically at every call site across Tasks 4-7 — no renamed field anywhere in the chain. `aumCr`/`aumAsOf` naming matches the Global Constraints section everywhere it's introduced (Tasks 1-3) and everywhere it was already present (Task 4/5's moved JSX, unchanged from the current file).
- **Sequencing risk called out explicitly**: Task 8 (CSS removal) is the only task in this plan that could visibly break something unrelated (the main screener table/page) if done carelessly or too early — it's deliberately last, after both Task 6 and Task 7 have already removed every JSX reference to the old inline drawer markup, and its own steps require verifying usage before deleting rather than assuming.
