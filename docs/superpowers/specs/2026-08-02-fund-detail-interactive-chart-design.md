# Fund Detail Interactive Chart Design

## Goal

Replace the static NAV sparkline (`Spark` component) in both the MF `Detail` drawer and the `SifDetail` drawer (`app/screener/ScreenerClient.jsx`) with the interactive drag-to-select-range chart already built for the MF/SIF comparison feature (`app/screener/CompareGrowthChart.jsx`) — hover crosshair, click-drag range selection with live date pills, on-chart + below-chart % summary, touch-friendly.

## Why this is a clean reuse, not a rebuild

- `CompareGrowthChart` takes `series: Array<{ name, color, data: Array<{t, v}> }>` and has no logic that special-cases "more than one series" — a single-entry array renders correctly today (legend shows one label, tooltip shows one row, range summary shows one row).
- Both `Detail` and `SifDetail` already fetch NAV history into the exact `{t, v}` point shape `CompareGrowthChart` expects (the same shape `Spark` currently consumes) — no data reshaping needed.
- The `.cmp-*` CSS classes `CompareGrowthChart` depends on (defined in `app/screener/mf-compare.css`) are already loaded on this page transitively, since `ScreenerClient.jsx` already imports `MFCompareBar`/`MFCompareModal` from `./MFCompare.jsx`, which itself does `import './mf-compare.css'`. No new CSS wiring required.
- `.cmp-chart-svg { width: 100%; height: auto; }` confirms the chart is fully responsive — no hardcoded pixel width that would misbehave in the narrower ~460px drawer vs. the wider comparison modal.

## Changes

### 1. `CompareGrowthChart.jsx` — one small, backward-compatible addition

Add an optional `showLegend = true` prop. The comparison modal's existing usage is unaffected (multiple funds still need the legend to tell lines apart). The detail drawers pass `showLegend={false}`, since the fund's name is already shown prominently in the drawer header directly above the chart — repeating it as a single-entry legend would be redundant.

```jsx
export default function CompareGrowthChart({ series, showLegend = true }) {
  ...
  return (
    <div className="cmp-chart-wrap">
      {showLegend && (
        <div className="cmp-chart-legend">
          {series.map((s) => (
            <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>
          ))}
        </div>
      )}
      ...
```

### 2. `Detail` component (MF drawer) — swap `Spark` for `CompareGrowthChart`

Currently: `<Spark nav={nav} />`, where `nav` is `Array<{t, v}> | null`, populated via the existing `/api/mf?code=X` fetch already in place.

New: compute a single-entry `series` array once `nav` has ≥2 points, choosing the line/fill color by direction (matching `Spark`'s existing convention — green if the shown history is net up, red if net down):

```jsx
const growthSeries = useMemo(() => {
  if (!nav || nav.length < 2) return null;
  const up = nav[nav.length - 1].v >= nav[0].v;
  return [{ name: f.name, color: up ? '#2e7d32' : '#b71c1c', data: nav }];
}, [nav, f.name]);
```

Rendering: preserve the exact same loading/empty-state messages `Spark` shows today (`"Loading NAV history…"`, `"No NAV history available yet"`), only changing what renders once data is ready:

```jsx
{!nav ? <div className="scr-spark-load">Loading NAV history…</div>
  : growthSeries ? <CompareGrowthChart series={growthSeries} showLegend={false} />
  : <div className="scr-spark-load">No NAV history available yet</div>}
```

### 3. `SifDetail` component — identical swap

Same pattern, using that component's existing `pts`/`histLoading` state and its own existing loading/empty messages (`"Loading NAV history…"` / `"No NAV history available yet"`), substituting `pts` for `nav` and the SIF fund's own name field for `f.name`.

### 4. Remove `Spark`

`ScreenerClient.jsx`'s `Spark` function is local to that file (not exported/imported elsewhere — confirmed by searching the codebase; the only other `Spark`-named components are unrelated, separately-scoped components local to `app/market-breadth/page.js` and `app/portfolio/page.jsx`). Once both call sites are migrated, `Spark` has no remaining callers and is deleted (dead code) along with its now-unused `.scr-spark`/`.scr-spark-lbl` CSS rules.

## Trade-off worth naming

The interactive chart defaults to 260px tall (`CompareGrowthChart`'s fixed `H = 260` viewBox height) vs. `Spark`'s current 110px — noticeably taller. Since both drawers are scrollable side panels rather than fixed-height views, this trades some vertical density for the much richer interaction (crosshair, drag-select range %, exact date tooltips) — a good trade, but a real change to the drawers' proportions worth being aware of.

## Testing

- `npm run build` to confirm no regressions.
- Manual check (browser automation isn't available in this environment): open a fund's detail drawer on `/screener`, confirm the chart renders, hover shows the crosshair/tooltip, drag-select shows the range summary (on-chart and below-chart), and the legend is correctly hidden. Repeat for a SIF scheme's detail drawer.
- Confirm the loading and empty-history states still display correctly (e.g. a fund with clearly less than 2 NAV points must not attempt to render the chart).
