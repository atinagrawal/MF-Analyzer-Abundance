# Fund Detail Interactive Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `Spark` sparkline in both the MF `Detail` drawer and the `SifDetail` drawer with the existing interactive `CompareGrowthChart` component (hover crosshair, drag-select range with live % summary), reusing it as-is with one small backward-compatible addition.

**Architecture:** `CompareGrowthChart` already accepts a `series` array and works correctly with a single entry — no changes to its core interactive logic. Both drawers already fetch NAV history into the exact `{t, v}` point shape the chart expects. This is a rendering swap plus one new optional prop, not a rebuild.

**Tech Stack:** React (Next.js App Router client components), no new dependencies.

## Global Constraints

- `CompareGrowthChart`'s existing usage in the comparison modal (`app/screener/MFCompare.jsx`) must be unaffected — the new `showLegend` prop must default to `true`.
- Direction-based chart color must match `Spark`'s existing exact hex values: `#2e7d32` (up) / `#b71c1c` (down) — not a different green/red.
- Each drawer's existing loading/empty-state messages must be preserved exactly as they read today (see Task 1 for the exact current strings per drawer — they differ between `Detail` and `SifDetail`).
- No new files, no new CSS, no new data fetching.

---

### Task 1: Add `showLegend` prop, swap both drawers, remove `Spark`

**Files:**
- Modify: `app/screener/CompareGrowthChart.jsx`
- Modify: `app/screener/ScreenerClient.jsx`

**Interfaces:**
- Modifies: `CompareGrowthChart({ series, showLegend = true })` — new optional second prop, defaults preserve all existing callers' behavior unchanged.
- Consumes: nothing new — uses `nav`/`f.name` (already in scope in `Detail`) and `pts`/`s.nav_name` (already in scope in `SifDetail`), both already in the `Array<{t, v}>` shape `CompareGrowthChart`'s `series[].data` expects.

- [ ] **Step 1: Add the `showLegend` prop to `CompareGrowthChart.jsx`**

Current (line 37 and the legend block starting at line 140):
```jsx
export default function CompareGrowthChart({ series }) {
```
```jsx
      <div className="cmp-chart-legend">
        {series.map((s) => (
          <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>
        ))}
      </div>
```

Change to:
```jsx
export default function CompareGrowthChart({ series, showLegend = true }) {
```
```jsx
      {showLegend && (
        <div className="cmp-chart-legend">
          {series.map((s) => (
            <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>
          ))}
        </div>
      )}
```

Every other call site inside this file (`series[0].data`, `series.map(...)` for paths/tooltips/etc.) is unchanged — only this one legend block is conditionally wrapped.

- [ ] **Step 2: Import `CompareGrowthChart` in `ScreenerClient.jsx`**

`CompareGrowthChart` is currently only imported inside `MFCompare.jsx`. Add it to `ScreenerClient.jsx`'s own imports — find:
```js
import { MFCompareBar, MFCompareModal } from './MFCompare';
```
Add immediately after it:
```js
import CompareGrowthChart from './CompareGrowthChart';
```

- [ ] **Step 3: Swap `Spark` for `CompareGrowthChart` in the `Detail` component**

Current (inside `function Detail({ f, stress, onClose })`):
```jsx
        <Spark nav={nav} />
```

Replace with:
```jsx
        {!nav ? (
          <div className="scr-spark-load">Loading NAV history…</div>
        ) : nav.length < 2 ? null : (
          <CompareGrowthChart
            series={[{ name: f.name, color: nav[nav.length - 1].v >= nav[0].v ? '#2e7d32' : '#b71c1c', data: nav }]}
            showLegend={false}
          />
        )}
```

This preserves `Detail`'s exact current behavior: shows "Loading NAV history…" while `nav` is `null`, renders nothing (matching the old `Spark`'s implicit `emptyMsg` being `undefined` → returns `null`) when fewer than 2 points are available, and renders the chart otherwise.

- [ ] **Step 4: Swap `Spark` for `CompareGrowthChart` in the `SifDetail` component**

Current (inside `function SifDetail({ s, onClose })`):
```jsx
        <Spark nav={pts} loadingMsg={histLoading ? 'Loading NAV history…' : null} emptyMsg="No NAV history available yet" />
```

Replace with:
```jsx
        {histLoading ? (
          <div className="scr-spark-load">Loading NAV history…</div>
        ) : (!pts || pts.length < 2) ? (
          <div className="scr-spark-load">No NAV history available yet</div>
        ) : (
          <CompareGrowthChart
            series={[{ name: s.nav_name, color: pts[pts.length - 1].v >= pts[0].v ? '#2e7d32' : '#b71c1c', data: pts }]}
            showLegend={false}
          />
        )}
```

This preserves `SifDetail`'s exact current behavior: the "Loading NAV history…" message while `histLoading` is true, the explicit "No NAV history available yet" message when data resolves to fewer than 2 points, and the chart otherwise.

- [ ] **Step 5: Remove the now-dead `Spark` function and its CSS**

Verified during spec self-review (repo-wide grep) that `ScreenerClient.jsx`'s `Spark` function is local to this file only — no other file imports it. After Steps 3-4, it has no remaining callers.

Delete the function (currently right after both drawer components):
```jsx
function Spark({ nav, loadingMsg, emptyMsg }) {

  if (loadingMsg || (!nav && loadingMsg !== null)) return <div className="scr-spark-load">{loadingMsg || 'Loading NAV history…'}</div>;
  if (!nav || nav.length < 2) return emptyMsg ? <div className="scr-spark-load">{emptyMsg}</div> : null;
  const W = 480, H = 110, pad = 4;
  const xs = nav.map((p) => p.t), minX = xs[0], maxX = xs[xs.length - 1];
  const vs = nav.map((p) => p.v), minV = Math.min(...vs), maxV = Math.max(...vs);
  const X = (t) => pad + ((t - minX) / (maxX - minX || 1)) * (W - pad * 2);
  const Y = (v) => pad + (1 - (v - minV) / (maxV - minV || 1)) * (H - pad * 2);
  const d = nav.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
  const up = vs[vs.length - 1] >= vs[0];
  return (
    <div className="scr-spark">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
        <path d={`${d} L${X(maxX)},${H} L${X(minX)},${H} Z`} fill={up ? '#2e7d3214' : '#b71c1c14'} />
        <path d={d} fill="none" stroke={up ? '#2e7d32' : '#b71c1c'} strokeWidth="2" />
      </svg>
      <div className="scr-spark-lbl">NAV since {new Date(minX).getFullYear()}</div>
    </div>
  );
}
```

Then remove its now-unused CSS rules from the `CSS` template string in the same file — find and delete:
```css
.scr-spark{margin-bottom:16px}
.scr-spark svg{width:100%;height:110px;display:block;background:var(--s2);border:1px solid var(--border);border-radius:10px}
.scr-spark-lbl,.scr-spark-load{font:500 11px JetBrains Mono,monospace;color:var(--muted);margin-top:5px}
.scr-spark-load{padding:34px 0;text-align:center}
```

**Do not** remove `.scr-spark-load` — it's still used by the new inline loading/empty-state `<div className="scr-spark-load">` elements in Steps 3-4. Only remove `.scr-spark` and `.scr-spark-lbl` (the container/label rules the deleted `Spark` function's own JSX used), keeping the `.scr-spark-lbl,.scr-spark-load{...}` combined-selector rule's `.scr-spark-load` half — i.e. change:
```css
.scr-spark-lbl,.scr-spark-load{font:500 11px JetBrains Mono,monospace;color:var(--muted);margin-top:5px}
```
to:
```css
.scr-spark-load{font:500 11px JetBrains Mono,monospace;color:var(--muted);margin-top:5px}
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build succeeds with no errors (confirms no remaining references to the deleted `Spark` function or removed CSS selectors cause issues, and `CompareGrowthChart`'s new prop doesn't break its existing comparison-modal usage).

- [ ] **Step 7: Manual verification (browser automation isn't available in this environment)**

Note for the user to check after this ships: open `/screener`, click a mutual fund row to open its detail drawer — confirm the interactive chart renders (not the old static sparkline), hovering shows the crosshair/tooltip, dragging left-to-right shows the range selection with a % summary both on-chart and below the chart, and no legend is shown. Switch to the SIF tab, click a SIF scheme row, and confirm the same for its detail drawer. Also spot-check a fund that's very new (little NAV history) to confirm the loading/"no history yet" messages still display correctly instead of a broken or empty chart. Finally, open the MF/SIF comparison feature (unrelated to this change) and confirm its chart still shows its legend as before — proving the `showLegend` default didn't regress the existing feature.

- [ ] **Step 8: Commit**

```bash
git add app/screener/CompareGrowthChart.jsx app/screener/ScreenerClient.jsx
git commit -m "feat(screener): replace static NAV sparkline with interactive drag-select chart in fund detail drawers"
```
