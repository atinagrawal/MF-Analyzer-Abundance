/**
 * lib/chartSvg.js
 *
 * Pure functions returning complete inline-SVG markup strings for Proposal
 * Studio's charts. No chart library, no CDN dependency, no React --
 * consumed identically by the live page (wrapped in
 * dangerouslySetInnerHTML, since this is entirely our own generated
 * content, never user-controlled) and the PDF exporter (interpolated
 * directly into its HTML template literal). Keeping this rendering-context
 * agnostic is what lets both places share one implementation.
 */

const PALETTE = ['#2e7d32', '#66bb6a', '#8bc34a', '#ffb74d', '#43a047', '#a5d6a7', '#c62828', '#5e8a5e'];

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Polar-to-cartesian helper for donut arc endpoints.
function polarPoint(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function donutChartSvg(segments, { size = 160, strokeWidth = 26 } = {}) {
  const total = segments.reduce((s, r) => s + (r.pct || 0), 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;

  if (total <= 0 || segments.length === 0) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e0e0e0" stroke-width="${strokeWidth}" /></svg>`;
  }

  // A single 100% segment can't be drawn as an SVG arc (start === end path
  // degenerates) -- draw a full ring via two semicircle arcs instead.
  if (segments.length === 1 && Math.abs(segments[0].pct - total) < 1e-9) {
    const color = segments[0].color || PALETTE[0];
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" />
    </svg>`;
  }

  let angle = 0;
  const arcs = segments.map((seg, i) => {
    const pct = (seg.pct || 0) / total;
    const startAngle = angle;
    const endAngle = angle + pct * 360;
    angle = endAngle;
    const start = polarPoint(cx, cy, r, startAngle);
    const end = polarPoint(cx, cy, r, endAngle);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    const color = seg.color || PALETTE[i % PALETTE.length];
    return `<path d="M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}" fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="butt" />`;
  });

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${arcs.join('')}</svg>`;
}

// truncateLabel: shared ellipsis-truncation so a long name never overflows
// into the space reserved for the bar/chart next to it. maxChars is tuned
// per label-column width, not a single global constant, since columns of
// different widths (this file has several) need different cutoffs.
function truncateLabel(name, maxChars) {
  const s = String(name || '');
  return s.length > maxChars ? s.slice(0, maxChars - 1) + '…' : s;
}

// The percentage label sits just past the bar's OWN end (not at a fixed
// far-right edge) so it stays visually attached to its bar regardless of
// how short that bar is -- a short bar (e.g. a 0.7% row) no longer strands
// its label in the empty track space to the right.
function barRankingSvg(rows, { width = 460, barHeight = 18, gap = 10, labelWidth = 160 } = {}) {
  const maxPct = Math.max(1, ...rows.map((r) => r.pct || 0));
  const trackWidth = width - labelWidth - 50; // reserve space so a full-width bar's label still fits before the right edge
  const maxLabelChars = Math.max(8, Math.floor(labelWidth / 6.2));
  const height = rows.length * (barHeight + gap);
  const bars = rows.map((row, i) => {
    const y = i * (barHeight + gap);
    const w = Math.max(3, (trackWidth * (row.pct || 0)) / maxPct);
    const color = PALETTE[i % PALETTE.length];
    const pctX = labelWidth + w + 8;
    return `
      <text x="0" y="${y + barHeight - 4}" font-size="12" fill="#444">${esc(truncateLabel(row.name, maxLabelChars))}</text>
      <rect x="${labelWidth}" y="${y}" width="${trackWidth}" height="${barHeight}" rx="4" fill="#eef3ee" />
      <rect x="${labelWidth}" y="${y}" width="${w.toFixed(1)}" height="${barHeight}" rx="4" fill="${color}" />
      <text x="${pctX.toFixed(1)}" y="${y + barHeight - 4}" font-size="12" font-weight="600" fill="#2e4d2e">${row.pct.toFixed(1)}%</text>`;
  });
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">${bars.join('')}</svg>`;
}

// Overlap % (0-100) -> a green-to-red intensity scale: low overlap reads as
// pale/neutral, high overlap reads as increasingly alarming, matching the
// mental model "high overlap = bad diversification".
function heatColor(pct) {
  if (pct >= 80) return '#b71c1c';
  if (pct >= 60) return '#e65100';
  if (pct >= 40) return '#f57f17';
  if (pct >= 20) return '#aed581';
  return '#e8f5e9';
}

function overlapHeatmapSvg(names, grid, { cell = 84, labelWidth = 150 } = {}) {
  const n = names.length;
  const width = labelWidth + n * cell;
  const headerH = cell;
  const height = (n + 1) * cell; // header row + n data rows, same cell height as width for square cells
  const rows = [];

  // Column headers (rotated would be nicer for long names, but kept
  // horizontal here for reliable cross-browser print rendering).
  names.forEach((name, j) => {
    rows.push(`<text x="${labelWidth + j * cell + cell / 2}" y="${headerH / 2}" font-size="10" fill="#444" text-anchor="middle">${esc(truncateLabel(name, 15))}</text>`);
  });

  grid.forEach((row, i) => {
    rows.push(`<text x="6" y="${headerH + i * cell + cell / 2 + 4}" font-size="11" fill="#333">${esc(truncateLabel(names[i], 22))}</text>`);
    row.forEach((v, j) => {
      const x = labelWidth + j * cell;
      const y = headerH + i * cell;
      const color = i === j ? '#c8e6c9' : heatColor(v);
      rows.push(`<rect x="${x + 2}" y="${y + 2}" width="${cell - 4}" height="${cell - 4}" rx="8" fill="${color}" />`);
      rows.push(`<text x="${x + cell / 2}" y="${y + cell / 2 + 5}" font-size="13" font-weight="${i === j ? 700 : 500}" fill="#1b1b1b" text-anchor="middle">${v.toFixed(1)}%</text>`);
    });
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">${rows.join('')}</svg>`;
}

const MCAP_COLORS = { large: '#1b5e20', mid: '#43a047', small: '#a5d6a7', unclassified: '#bdbdbd' };
const MCAP_LABELS = { large: 'Large Cap', mid: 'Mid Cap', small: 'Small Cap', unclassified: 'Unclassified' };

function stackedBarSvg(rows, { width = 460, barHeight = 26, gap = 14, labelWidth = 170 } = {}) {
  const trackWidth = width - labelWidth;
  const legendH = 26;
  const height = legendH + rows.length * (barHeight + gap);
  const keys = ['large', 'mid', 'small', 'unclassified'];

  // A small legend row so the four segment colors are self-explanatory --
  // a stacked bar with no key is otherwise unreadable at a glance.
  let legendX = 0;
  const legend = keys.map((key) => {
    const swatch = `<rect x="${legendX}" y="0" width="10" height="10" rx="2" fill="${MCAP_COLORS[key]}" />`;
    const label = `<text x="${legendX + 14}" y="9" font-size="10" fill="#555">${MCAP_LABELS[key]}</text>`;
    legendX += MCAP_LABELS[key].length * 5.6 + 26;
    return swatch + label;
  }).join('');

  const bars = rows.map((row, i) => {
    const y = legendH + i * (barHeight + gap);
    let x = labelWidth;
    const segs = keys.map((key) => {
      const w = (trackWidth * (row[key] || 0)) / 100;
      const rect = `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${barHeight}" fill="${MCAP_COLORS[key]}" />`;
      x += w;
      return rect;
    });
    return `<rect x="${labelWidth}" y="${y}" width="${trackWidth}" height="${barHeight}" rx="5" fill="#eef3ee" />
      <text x="0" y="${y + barHeight / 2 + 4}" font-size="12" fill="#444">${esc(truncateLabel(row.name, 26))}</text>${segs.join('')}`;
  });
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">${legend}${bars.join('')}</svg>`;
}

module.exports = { donutChartSvg, barRankingSvg, overlapHeatmapSvg, stackedBarSvg, PALETTE };
