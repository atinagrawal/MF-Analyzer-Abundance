'use client';
// app/screener/CompareGrowthChart.jsx
//
// Interactive multi-line growth chart for the fund comparison modal.
// Hover shows a crosshair + tooltip; click-and-drag selects a date range,
// showing live start/end date labels while dragging, and — once released —
// each series' % change over that exact window, both in a floating on-chart
// panel and a panel below the chart. The shaded selection and both summary
// panels persist until the user taps/clicks elsewhere on the chart. Touch-
// friendly: touch-action:pan-y lets normal vertical page scroll work while
// a horizontal drag is captured here for range selection.
//
// This exact interaction was prototyped and approved live during
// brainstorming — see docs/superpowers/specs/2026-07-29-mf-sif-comparison-design.md.
import { useRef, useState, useMemo, useEffect } from 'react';

const W = 760, H = 260, PAD_L = 44, PAD_R = 12, PAD_T = 10, PAD_B = 26;

function fmtDate(t) {
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtDateShort(t) {
  return new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
function fmtVal(v) {
  return '₹' + Math.round(v).toLocaleString('en-IN');
}
function pctChange(a, b) {
  return (((b - a) / a) * 100).toFixed(1);
}

/**
 * @param {Array<{ name: string, color: string, data: Array<{t:number, v:number}> }>} series
 *   All series must share the same length/x-axis (the caller aligns them —
 *   see Task 10 for how the modal builds this array).
 */
export default function CompareGrowthChart({ series, showLegend = true }) {
  const svgRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  const [dragState, setDragState] = useState(null); // { startIdx, curIdx } while actively dragging
  const [selection, setSelection] = useState(null); // { lo, hi } once a range is committed
  const dragRef = useRef({ dragging: false, startIdx: null, moved: false });
  const activeDragHandlersRef = useRef(null);

  useEffect(() => {
    return () => {
      const h = activeDragHandlersRef.current;
      if (h) {
        window.removeEventListener('mouseup', h.up);
        window.removeEventListener('touchend', h.up);
        window.removeEventListener('touchcancel', h.cancel);
      }
    };
  }, []);

  const n = series[0]?.data.length || 0;
  const { vMin, vMax } = useMemo(() => {
    const all = series.flatMap((s) => s.data.map((p) => p.v));
    return { vMin: Math.min(...all), vMax: Math.max(...all) };
  }, [series]);

  if (n < 2) return null;

  const iw = W - PAD_L - PAD_R, ih = H - PAD_T - PAD_B;
  const X = (i) => PAD_L + (i / (n - 1)) * iw;
  const Y = (v) => PAD_T + (1 - (v - vMin) / (vMax - vMin || 1)) * ih;
  const pathFor = (s) => s.data.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.v).toFixed(1)}`).join(' ');

  function clientXFromEvent(e) {
    if (e.touches && e.touches.length) return e.touches[0].clientX;
    if (e.changedTouches && e.changedTouches.length) return e.changedTouches[0].clientX;
    return e.clientX;
  }
  function idxFromEvent(e) {
    const r = svgRef.current.getBoundingClientRect();
    const cx = ((clientXFromEvent(e) - r.left) / r.width) * W;
    const i = Math.round(((cx - PAD_L) / iw) * (n - 1));
    return Math.max(0, Math.min(n - 1, i));
  }

  function onDown(e) {
    dragRef.current = { dragging: true, startIdx: idxFromEvent(e), moved: false };
    activeDragHandlersRef.current = { up: onUp, cancel: onCancelDrag };
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchend', onUp);
    window.addEventListener('touchcancel', onCancelDrag);
  }
  function onMove(e) {
    const d = dragRef.current;
    if (!d.dragging) {
      if (!selection) setHoverIdx(idxFromEvent(e));
      return;
    }
    const i = idxFromEvent(e);
    if (i !== d.startIdx) d.moved = true;
    if (d.moved) {
      if (e.cancelable) e.preventDefault();
      setHoverIdx(null);
      setDragState({ startIdx: d.startIdx, curIdx: i });
    }
  }
  function onUp(e) {
    const d = dragRef.current;
    if (d.dragging) {
      const endIdx = idxFromEvent(e);
      if (d.moved && Math.abs(endIdx - d.startIdx) > 2) {
        setSelection({ lo: Math.min(d.startIdx, endIdx), hi: Math.max(d.startIdx, endIdx) });
      } else {
        setSelection(null);
      }
    }
    dragRef.current = { dragging: false, startIdx: null, moved: false };
    setDragState(null);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchend', onUp);
    window.removeEventListener('touchcancel', onCancelDrag);
    activeDragHandlersRef.current = null;
  }
  function onCancelDrag() {
    dragRef.current = { dragging: false, startIdx: null, moved: false };
    setDragState(null);
    window.removeEventListener('mouseup', onUp);
    window.removeEventListener('touchend', onUp);
    window.removeEventListener('touchcancel', onCancelDrag);
    activeDragHandlersRef.current = null;
  }
  function onLeave() {
    if (!dragRef.current.dragging) setHoverIdx(null);
  }

  const rangeRows = selection
    ? series.map((s) => {
        const pct = pctChange(s.data[selection.lo].v, s.data[selection.hi].v);
        return { name: s.name, color: s.color, pct, pos: +pct >= 0 };
      })
    : null;

  return (
    <div className="cmp-chart-wrap">
      {showLegend && (
        <div className="cmp-chart-legend">
          {series.map((s) => (
            <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>
          ))}
        </div>
      )}
      <div style={{ position: 'relative' }}>
        <svg
          ref={svgRef}
          className="cmp-chart-svg"
          viewBox={`0 0 ${W} ${H}`}
          onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onMouseLeave={onLeave}
          onTouchStart={onDown} onTouchMove={onMove} onTouchEnd={onUp}
        >
          {[0, 1, 2, 3, 4].map((g) => {
            const v = vMin + (vMax - vMin) * (g / 4);
            return (
              <g key={g}>
                <line x1={PAD_L} y1={Y(v)} x2={W - PAD_R} y2={Y(v)} stroke="var(--border)" strokeWidth="0.6" />
                <text x={2} y={Y(v) + 3} fontSize="8" fill="var(--muted)" fontFamily="monospace">{(v / 1000).toFixed(0)}k</text>
              </g>
            );
          })}
          {series.map((s) => <path key={s.name} d={pathFor(s)} fill="none" stroke={s.color} strokeWidth="2" />)}

          {(selection || dragState) && (() => {
            const lo = selection ? selection.lo : Math.min(dragState.startIdx, dragState.curIdx);
            const hi = selection ? selection.hi : Math.max(dragState.startIdx, dragState.curIdx);
            return <rect x={X(lo)} y={PAD_T} width={Math.max(1, X(hi) - X(lo))} height={ih}
              fill="var(--g1)" opacity="0.1" stroke="var(--g1)" strokeWidth="1" strokeDasharray="4 3" />;
          })()}

          {selection && series.map((s) => (
            <circle key={s.name} cx={X(selection.hi)} cy={Y(s.data[selection.hi].v)} r="4" fill={s.color} stroke="#fff" strokeWidth="2" />
          ))}

          {hoverIdx != null && !dragState && !selection && (
            <g>
              <line x1={X(hoverIdx)} y1={PAD_T} x2={X(hoverIdx)} y2={H - PAD_B} stroke="var(--muted)" strokeWidth="1" strokeDasharray="3 3" />
              {series.map((s) => <circle key={s.name} cx={X(hoverIdx)} cy={Y(s.data[hoverIdx].v)} r="3.5" fill={s.color} />)}
            </g>
          )}
        </svg>

        {hoverIdx != null && !dragState && !selection && (
          <div className="cmp-tip" style={{ left: X(hoverIdx) / W > 0.6 ? `calc(${(X(hoverIdx) / W) * 100}% - 190px)` : `calc(${(X(hoverIdx) / W) * 100}% + 14px)` }}>
            <div style={{ marginBottom: 4, opacity: 0.7 }}>{fmtDate(series[0].data[hoverIdx].t)}</div>
            {series.map((s) => (
              <div key={s.name} className="cmp-tip-row"><span>{s.name}</span><b style={{ color: s.color }}>{fmtVal(s.data[hoverIdx].v)}</b></div>
            ))}
          </div>
        )}

        {dragState && (
          <>
            <div className="cmp-drag-date start" style={{ left: `${(X(dragState.startIdx) / W) * 100}%` }}>
              {fmtDateShort(series[0].data[dragState.startIdx].t)}
            </div>
            <div className="cmp-drag-date end" style={{
              left: `${(X(dragState.curIdx) / W) * 100}%`,
              top: Math.abs(X(dragState.curIdx) - X(dragState.startIdx)) < 70 ? 18 : -2,
            }}>
              {fmtDateShort(series[0].data[dragState.curIdx].t)}
            </div>
          </>
        )}

        {selection && rangeRows && (
          <div className="cmp-onchart-summary show" style={{ left: `${((X(selection.lo) + X(selection.hi)) / 2 / W) * 100}%`, transform: 'translateX(-50%)' }}>
            <div style={{ marginBottom: 3, opacity: 0.6, fontSize: 9 }}>{fmtDate(series[0].data[selection.lo].t)} → {fmtDate(series[0].data[selection.hi].t)}</div>
            {rangeRows.map((r) => (
              <div key={r.name} className="cmp-onchart-row"><span>{r.name}</span><b style={{ color: r.color }}>{r.pos ? '+' : ''}{r.pct}%</b></div>
            ))}
          </div>
        )}
      </div>
      <div className="cmp-hint">Drag left→right to select a range · tap anywhere to clear</div>
      {selection && rangeRows && (
        <div className="cmp-range-summary show">
          <div className="cmp-range-summary-h">
            <span>{fmtDate(series[0].data[selection.lo].t)} → {fmtDate(series[0].data[selection.hi].t)}</span>
            <span className="cmp-range-clear" onClick={() => setSelection(null)}>✕ Clear</span>
          </div>
          {rangeRows.map((r) => (
            <div key={r.name} className="cmp-range-row"><span>{r.name}</span><span style={{ color: r.pos ? 'var(--g1)' : 'var(--neg)' }}>{r.pos ? '+' : ''}{r.pct}%</span></div>
          ))}
        </div>
      )}
    </div>
  );
}
