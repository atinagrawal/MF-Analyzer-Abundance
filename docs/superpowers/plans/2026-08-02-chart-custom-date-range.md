# Chart Custom Date Range Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add From/To date inputs to `CompareGrowthChart.jsx` that zoom the chart to a filtered window of its already-loaded data, with the existing drag-select interaction continuing to work within the zoomed view.

**Architecture:** Entirely self-contained inside `app/screener/CompareGrowthChart.jsx`. A `useMemo`-derived `filteredSeries` becomes the single source every existing rendering computation reads from, replacing the raw `series` prop everywhere except where the full range's own bounds are computed. No new data fetching, no changes to any of the 3 caller files.

**Tech Stack:** React (Next.js App Router client component), plain `<input type="date">` — no new dependencies.

## Global Constraints

- No changes needed in `app/screener/MFCompare.jsx` or `app/screener/ScreenerClient.jsx` — they keep passing `series`/`showLegend` exactly as today; the new behavior is entirely internal to `CompareGrowthChart.jsx`.
- Only `app/screener/mf-compare.css` needs new CSS — confirmed via a repo-wide grep that `CompareGrowthChart` is never imported by anything in `app/pms-screener/`, so `pms-compare.css` is untouched.
- The existing default-range `if (n < 2) return null` behavior (no custom range active) must be preserved exactly — only a *user-initiated* custom range that results in <2 points gets the new "No data available" message.
- No new dependencies — plain `<input type="date">`, matching this codebase's existing no-heavy-UI-library convention.

---

### Task 1: Custom date range zoom in `CompareGrowthChart.jsx`

**Files:**
- Modify: `app/screener/CompareGrowthChart.jsx`
- Modify: `app/screener/mf-compare.css`

**Interfaces:**
- No exported interface changes — `CompareGrowthChart({ series, showLegend = true })`'s public props are unchanged; all three existing call sites need zero changes.

- [ ] **Step 1: Add the date/input conversion helpers**

Find (near the top of the file, after the existing `fmtDate`/`fmtDateShort` functions):
```js
function fmtVal(v, compact) {
  return compact ? '₹' + Math.round(v).toLocaleString('en-IN') : '₹' + v.toFixed(2);
}
```

Add immediately after it:
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

- [ ] **Step 2: Add the new state, defaults, and filtered series**

Find:
```js
  const n = series[0]?.data.length || 0;
  const { vMin, vMax } = useMemo(() => {
    const all = series.flatMap((s) => s.data.map((p) => p.v));
    return { vMin: Math.min(...all), vMax: Math.max(...all) };
  }, [series]);

  if (n < 2) return null;
```

Replace with:
```js
  const [customFrom, setCustomFrom] = useState(null);
  const [customTo, setCustomTo] = useState(null);

  const defaultFrom = series[0]?.data[0]?.t ?? null;
  const defaultTo = series[0]?.data[series[0]?.data.length - 1]?.t ?? null;
  const effectiveFrom = customFrom ?? defaultFrom;
  const effectiveTo = customTo ?? defaultTo;
  const hasCustomRange = customFrom != null || customTo != null;

  const filteredSeries = useMemo(
    () => series.map((s) => ({ ...s, data: s.data.filter((p) => p.t >= effectiveFrom && p.t <= effectiveTo) })),
    [series, effectiveFrom, effectiveTo]
  );

  // A stale selection index (computed against a previous, differently-sized
  // filteredSeries) would point at the wrong data point once the range
  // changes -- clear it whenever the effective range changes.
  useEffect(() => {
    setSelection(null);
  }, [effectiveFrom, effectiveTo]);

  const n = filteredSeries[0]?.data.length || 0;
  const { vMin, vMax } = useMemo(() => {
    const all = filteredSeries.flatMap((s) => s.data.map((p) => p.v));
    return { vMin: Math.min(...all), vMax: Math.max(...all) };
  }, [filteredSeries]);

  if (n < 2) {
    if (hasCustomRange) {
      return (
        <div className="cmp-chart-wrap">
          {renderRangePicker()}
          <div className="cmp-range-empty">No data available in the selected date range.</div>
        </div>
      );
    }
    return null;
  }
```

This introduces a call to a `renderRangePicker()` helper defined in Step 5, used both in this early-return branch and in the main return — declare it as a plain function (not a hook) inside the component body, defined once before this early-return block is reached. Since Step 2's code references it before its Step 5 definition appears textually further down, and JS function declarations (`function renderRangePicker() {...}`) are hoisted within their enclosing scope, define it as a `function` declaration (not an arrow function assigned to `const`) so the hoisting makes the ordering work regardless of where it's textually placed in the component body.

- [ ] **Step 3: Switch all remaining `series` reads (except the two default-range computations above) to `filteredSeries`**

The rest of the component body currently reads `series` in these places — each becomes `filteredSeries`:

Find:
```js
  const iw = W - PAD_L - PAD_R, ih = H - PAD_T - PAD_B;
  const X = (i) => PAD_L + (i / (n - 1)) * iw;
  const Y = (v) => PAD_T + (1 - (v - vMin) / (vMax - vMin || 1)) * ih;
  const pathFor = (s) => s.data.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');
```
This block doesn't reference `series` directly — no change needed here, leave as-is.

Find:
```js
  const rangeRows = selection
    ? series.map((s) => {
        const pct = pctChange(s.data[selection.lo].v, s.data[selection.hi].v);
        return { name: s.name, color: s.color, pct, pos: +pct >= 0 };
      })
    : null;
```
Replace with:
```js
  const rangeRows = selection
    ? filteredSeries.map((s) => {
        const pct = pctChange(s.data[selection.lo].v, s.data[selection.hi].v);
        return { name: s.name, color: s.color, pct, pos: +pct >= 0 };
      })
    : null;
```

Find (the legend block):
```jsx
      {showLegend && (
        <div className="cmp-chart-legend">
          {series.map((s) => (
            <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>
          ))}
        </div>
      )}
```
Replace with:
```jsx
      {showLegend && (
        <div className="cmp-chart-legend">
          {filteredSeries.map((s) => (
            <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>
          ))}
        </div>
      )}
```

Find (path drawing):
```jsx
          {series.map((s) => <path key={s.name} d={pathFor(s)} fill="none" stroke={s.color} strokeWidth="2" />)}
```
Replace with:
```jsx
          {filteredSeries.map((s) => <path key={s.name} d={pathFor(s)} fill="none" stroke={s.color} strokeWidth="2" />)}
```

Find (selection end-dots):
```jsx
          {selection && series.map((s) => (
            <circle key={s.name} cx={X(selection.hi)} cy={Y(s.data[selection.hi].v)} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
          ))}
```
Replace with:
```jsx
          {selection && filteredSeries.map((s) => (
            <circle key={s.name} cx={X(selection.hi)} cy={Y(s.data[selection.hi].v)} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
          ))}
```

Find (hover crosshair dots):
```jsx
          {hoverIdx != null && !dragState && !selection && (
            <g>
              <line x1={X(hoverIdx)} y1={PAD_T} x2={X(hoverIdx)} y2={H - PAD_B} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" />
              {series.map((s) => <circle key={s.name} cx={X(hoverIdx)} cy={Y(s.data[hoverIdx].v)} r="3.5" fill={s.color} />)}
            </g>
          )}
```
Replace with:
```jsx
          {hoverIdx != null && !dragState && !selection && (
            <g>
              <line x1={X(hoverIdx)} y1={PAD_T} x2={X(hoverIdx)} y2={H - PAD_B} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" />
              {filteredSeries.map((s) => <circle key={s.name} cx={X(hoverIdx)} cy={Y(s.data[hoverIdx].v)} r="3.5" fill={s.color} />)}
            </g>
          )}
```

Find (tooltip date + rows):
```jsx
            <div style={{ marginBottom: 4, opacity: 0.7 }}>{fmtDate(series[0].data[hoverIdx].t)}</div>
            {series.map((s) => (
              <div key={s.name} className="cmp-tip-row"><span>{s.name}</span><b style={{ color: s.color }}>{fmtVal(s.data[hoverIdx].v, vMax >= 1000)}</b></div>
            ))}
```
Replace with:
```jsx
            <div style={{ marginBottom: 4, opacity: 0.7 }}>{fmtDate(filteredSeries[0].data[hoverIdx].t)}</div>
            {filteredSeries.map((s) => (
              <div key={s.name} className="cmp-tip-row"><span>{s.name}</span><b style={{ color: s.color }}>{fmtVal(s.data[hoverIdx].v, vMax >= 1000)}</b></div>
            ))}
```

Find (drag-date labels, both occurrences of `series[0].data`):
```jsx
            <div className="cmp-drag-date start" style={{ left: `${(X(dragState.startIdx) / W) * 100}%` }}>
              {fmtDateShort(series[0].data[dragState.startIdx].t)}
            </div>
            <div className="cmp-drag-date end" style={{
              left: `${(X(dragState.curIdx) / W) * 100}%`,
              top: Math.abs(X(dragState.curIdx) - X(dragState.startIdx)) < 70 ? 18 : -2,
            }}>
              {fmtDateShort(series[0].data[dragState.curIdx].t)}
            </div>
```
Replace with:
```jsx
            <div className="cmp-drag-date start" style={{ left: `${(X(dragState.startIdx) / W) * 100}%` }}>
              {fmtDateShort(filteredSeries[0].data[dragState.startIdx].t)}
            </div>
            <div className="cmp-drag-date end" style={{
              left: `${(X(dragState.curIdx) / W) * 100}%`,
              top: Math.abs(X(dragState.curIdx) - X(dragState.startIdx)) < 70 ? 18 : -2,
            }}>
              {fmtDateShort(filteredSeries[0].data[dragState.curIdx].t)}
            </div>
```

Find (on-chart summary date range, both `series[0].data` references):
```jsx
            <div style={{ marginBottom: 3, opacity: 0.6, fontSize: 9 }}>{fmtDate(series[0].data[selection.lo].t)} → {fmtDate(series[0].data[selection.hi].t)}</div>
```
Replace with:
```jsx
            <div style={{ marginBottom: 3, opacity: 0.6, fontSize: 9 }}>{fmtDate(filteredSeries[0].data[selection.lo].t)} → {fmtDate(filteredSeries[0].data[selection.hi].t)}</div>
```

Find (below-chart range summary header, both `series[0].data` references):
```jsx
            <span>{fmtDate(series[0].data[selection.lo].t)} → {fmtDate(series[0].data[selection.hi].t)}</span>
```
Replace with:
```jsx
            <span>{fmtDate(filteredSeries[0].data[selection.lo].t)} → {fmtDate(filteredSeries[0].data[selection.hi].t)}</span>
```

- [ ] **Step 4: Add the `renderRangePicker` function and render it above the chart**

Add this function declaration inside the component body, anywhere before the component's final `return` (e.g. immediately after the `onLeave` function definition):
```js
  function renderRangePicker() {
    return (
      <div className="cmp-range-picker">
        <label>From <input
          type="date"
          value={toDateInputValue(effectiveFrom)}
          min={toDateInputValue(defaultFrom)}
          max={toDateInputValue(effectiveTo)}
          onChange={(e) => setCustomFrom(fromDateInputValue(e.target.value))}
        /></label>
        <label>To <input
          type="date"
          value={toDateInputValue(effectiveTo)}
          min={toDateInputValue(effectiveFrom)}
          max={toDateInputValue(defaultTo)}
          onChange={(e) => setCustomTo(fromDateInputValue(e.target.value))}
        /></label>
        {hasCustomRange && (
          <span className="cmp-range-picker-reset" onClick={() => { setCustomFrom(null); setCustomTo(null); }}>↺ Reset to full range</span>
        )}
      </div>
    );
  }
```

Find the main return's opening:
```jsx
  return (
    <div className="cmp-chart-wrap">
      {showLegend && (
```
Replace with:
```jsx
  return (
    <div className="cmp-chart-wrap">
      {renderRangePicker()}
      {showLegend && (
```

- [ ] **Step 5: Add the new CSS rules to `app/screener/mf-compare.css`**

Find:
```css
.cmp-hint { font-size: 10px; color: var(--muted); margin-top: 6px; text-align: center; }
```

Add immediately after it:
```css
.cmp-range-picker { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; font-size: 12px; font-family: 'Raleway', sans-serif; color: var(--text2); }
.cmp-range-picker label { display: flex; align-items: center; gap: 6px; font-weight: 600; }
.cmp-range-picker input[type="date"] { padding: 4px 6px; border: 1px solid var(--border); border-radius: 6px; font: 600 12px 'JetBrains Mono', monospace; background: var(--surface); color: var(--text); }
.cmp-range-picker-reset { font-weight: 700; color: var(--muted); cursor: pointer; font-size: 11px; }
.cmp-range-picker-reset:hover { color: var(--g1); }
.cmp-range-empty { padding: 40px 20px; text-align: center; color: var(--muted); font-size: 13px; }
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 7: Manual verification (browser automation isn't available in this environment)**

Note for the user to check after this ships: open the MF/SIF comparison modal with 2-3 funds selected — confirm the From/To inputs appear above the chart, default to the full loaded date range, and the chart looks unchanged from before. Narrow the range using the date inputs and confirm the chart visibly zooms to that window (gridlines/tooltip values still look sane at the new scale). Drag-select within the zoomed view and confirm the % summary reflects only the zoomed sub-range, not the full history. Click "Reset to full range" and confirm it returns to the original view. Repeat the same check for a single fund in the MF detail drawer (`/screener`, click a fund row) and the SIF detail drawer (switch to the SIF tab, click a scheme row). Also try picking an extremely narrow range (e.g. two adjacent days for a fund with sparse history) and confirm the "No data available in the selected date range." message appears instead of a blank chart.

- [ ] **Step 8: Commit**

```bash
git add app/screener/CompareGrowthChart.jsx app/screener/mf-compare.css
git commit -m "feat(screener): add custom date range zoom to the interactive comparison chart"
```
