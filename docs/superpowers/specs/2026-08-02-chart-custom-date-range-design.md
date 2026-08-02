# Chart Custom Date Range Design

## Goal

Add a precise custom date range (zoom) control to `app/screener/CompareGrowthChart.jsx`, so the existing drag-select comparison chart — used in the MF/SIF fund comparison modal and both the MF and SIF fund detail drawers — can be narrowed to an exact From/To window for closer analysis, while the existing drag-select interaction keeps working *within* that narrowed window.

## Why this lives entirely inside `CompareGrowthChart.jsx`

All three current usages (`app/screener/MFCompare.jsx`'s comparison modal, and both drawers in `app/screener/ScreenerClient.jsx`) already load each fund's full available NAV history upfront before ever handing it to this component. Building the zoom/filter logic inside the component itself — rather than in each of the three callers — means every consumer gets the feature automatically, with no new data fetching and no per-page wiring.

## Behavior

### New state and defaults

Two new pieces of state, both `null` by default (meaning "use the full loaded range"):
```js
const [customFrom, setCustomFrom] = useState(null); // epoch ms, or null
const [customTo, setCustomTo] = useState(null);
```

The full default range comes directly from the already-aligned data (per the component's existing doc comment, all series share the same length/x-axis, so `series[0]`'s own extremes are the shared extremes):
```js
const defaultFrom = series[0]?.data[0]?.t ?? null;
const defaultTo = series[0]?.data[series[0].data.length - 1]?.t ?? null;
const effectiveFrom = customFrom ?? defaultFrom;
const effectiveTo = customTo ?? defaultTo;
```

### Filtering

All existing rendering logic (path drawing, `vMin`/`vMax`, gridlines, tooltip, drag-select index math) currently operates on the `series` prop directly. That logic is unchanged, but it now operates on a filtered view computed once per render:
```js
const filteredSeries = useMemo(
  () => series.map((s) => ({ ...s, data: s.data.filter((p) => p.t >= effectiveFrom && p.t <= effectiveTo) })),
  [series, effectiveFrom, effectiveTo]
);
```
Every place the component currently reads `series` for rendering (not for computing the defaults above) switches to `filteredSeries`.

### Date/input conversion helpers

`<input type="date">` reads/writes `"YYYY-MM-DD"` strings, while the chart's internal values are epoch ms (`t`). Two small helpers, added alongside the existing `fmtDate`/`fmtDateShort`/`fmtVal` functions at the top of the file:
```js
function toDateInputValue(t) {
  if (t == null) return '';
  return new Date(t).toISOString().slice(0, 10);
}
function fromDateInputValue(str) {
  if (!str) return null;
  return Date.parse(str + 'T00:00:00Z');
}
```

### Resetting a stale drag-selection when the zoom changes

A `useEffect` clears any active drag-selection whenever the effective range changes, so `selection.lo`/`selection.hi` (indices into `filteredSeries[0].data`) never point at a stale position after the underlying array shrinks or shifts:
```js
useEffect(() => {
  setSelection(null);
}, [effectiveFrom, effectiveTo]);
```

### UI

Two `<input type="date">` elements above the chart, plus a conditionally-shown reset link:
```jsx
<div className="cmp-range-picker">
  <label>From <input type="date" value={toDateInputValue(effectiveFrom)} min={toDateInputValue(defaultFrom)} max={toDateInputValue(effectiveTo)} onChange={(e) => setCustomFrom(fromDateInputValue(e.target.value))} /></label>
  <label>To <input type="date" value={toDateInputValue(effectiveTo)} min={toDateInputValue(effectiveFrom)} max={toDateInputValue(defaultTo)} onChange={(e) => setCustomTo(fromDateInputValue(e.target.value))} /></label>
  {(customFrom != null || customTo != null) && (
    <span className="cmp-range-picker-reset" onClick={() => { setCustomFrom(null); setCustomTo(null); }}>↺ Reset to full range</span>
  )}
</div>
```
`min`/`max` on each input are wired to each other (From's max is the current To, To's min is the current From) so the browser's own date picker UI prevents selecting an invalid inverted range in the first place, in addition to the overall `defaultFrom`/`defaultTo` bounds preventing dates outside the actually-loaded data.

### Interaction with existing drag-select

Unchanged in spirit — the drag-select, hover-crosshair, and tooltip all continue to work exactly as today, just operating on `filteredSeries` (and its own recomputed `n`, `X`, `Y` scale functions) instead of the full `series`. A drag-selection is cleared exactly as today (tap elsewhere) and is independent of the zoom — changing the date range does not need to explicitly clear an active drag-selection, since recomputing `filteredSeries` naturally invalidates stale `lo`/`hi` indices; the selection state should be reset to `null` whenever `effectiveFrom`/`effectiveTo` change, to avoid a stale index pointing at the wrong data point after the underlying array shrinks or shifts.

### Edge case: too little data in a custom range

The component's existing guard (`if (n < 2) return null`) silently renders nothing when there's insufficient data — acceptable for the *default* range (an essentially-empty comparison), but not for a range the user explicitly picked. When `filteredSeries[0].data.length < 2` **and** a custom range is active (`customFrom != null || customTo != null`), render a small message instead of nothing:
```jsx
if (n < 2) {
  if (customFrom != null || customTo != null) {
    return (
      <div className="cmp-chart-wrap">
        <div className="cmp-range-empty">No data available in the selected date range.</div>
      </div>
    );
  }
  return null;
}
```

## Scope

Applies only to `CompareGrowthChart.jsx`'s existing 3 usages (comparison modal, MF drawer, SIF drawer). Does not extend to the separate, hover-only charts on `market-breadth`/`backtest`/`rolling` pages — a distinct, previously-deferred rollout the user wants asked about separately rather than bundled into this change.

## Testing

- `npm run build`.
- Manual verification (browser automation isn't available in this environment) — checklist for the user: open the comparison modal with 2-3 funds, confirm the From/To inputs default to the full loaded range, narrow the range and confirm the chart zooms and the gridlines/tooltip values still look sane at the new scale, drag-select within the zoomed view and confirm the % summary reflects only the zoomed sub-range, then reset and confirm it returns to the original full-range view. Repeat for a single fund in the MF detail drawer and the SIF detail drawer.
