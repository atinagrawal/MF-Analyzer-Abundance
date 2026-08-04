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

function barRankingSvg(rows, { width = 320, barHeight = 16, gap = 8, labelWidth = 130 } = {}) {
  const maxPct = Math.max(1, ...rows.map((r) => r.pct || 0));
  const trackWidth = width - labelWidth;
  const height = rows.length * (barHeight + gap);
  const bars = rows.map((row, i) => {
    const y = i * (barHeight + gap);
    const w = Math.max(2, (trackWidth * (row.pct || 0)) / maxPct);
    const color = PALETTE[i % PALETTE.length];
    return `
      <text x="0" y="${y + barHeight - 3}" font-size="11" fill="#444">${esc(row.name)}</text>
      <rect x="${labelWidth}" y="${y}" width="${trackWidth}" height="${barHeight}" rx="3" fill="#eef3ee" />
      <rect x="${labelWidth}" y="${y}" width="${w.toFixed(1)}" height="${barHeight}" rx="3" fill="${color}" />
      <text x="${width}" y="${y + barHeight - 3}" font-size="11" fill="#333" text-anchor="end">${row.pct.toFixed(1)}%</text>`;
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

function overlapHeatmapSvg(names, grid, { cell = 70, labelWidth = 140 } = {}) {
  const n = names.length;
  const width = labelWidth + n * cell;
  const height = labelWidth * 0 + (n + 1) * cell; // header row + n data rows, same cell height as width for square cells
  const headerH = cell;
  const rows = [];

  // Column headers (rotated would be nicer for long names, but kept
  // horizontal here for reliable cross-browser print rendering).
  names.forEach((name, j) => {
    rows.push(`<text x="${labelWidth + j * cell + cell / 2}" y="${headerH / 2}" font-size="9" fill="#444" text-anchor="middle">${esc(name.length > 14 ? name.slice(0, 13) + '…' : name)}</text>`);
  });

  grid.forEach((row, i) => {
    rows.push(`<text x="4" y="${headerH + i * cell + cell / 2 + 4}" font-size="10" fill="#333">${esc(names[i].length > 20 ? names[i].slice(0, 19) + '…' : names[i])}</text>`);
    row.forEach((v, j) => {
      const x = labelWidth + j * cell;
      const y = headerH + i * cell;
      const color = i === j ? '#c8e6c9' : heatColor(v);
      rows.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="${color}" stroke="#fff" stroke-width="2" />`);
      rows.push(`<text x="${x + cell / 2}" y="${y + cell / 2 + 4}" font-size="12" font-weight="${i === j ? 700 : 500}" fill="#1b1b1b" text-anchor="middle">${v.toFixed(1)}%</text>`);
    });
  });

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">${rows.join('')}</svg>`;
}

function stackedBarSvg(rows, { width = 360, barHeight = 22, gap = 10, labelWidth = 140 } = {}) {
  const trackWidth = width - labelWidth;
  const height = rows.length * (barHeight + gap);
  const colors = { large: '#1b5e20', mid: '#43a047', small: '#a5d6a7', unclassified: '#bdbdbd' };
  const bars = rows.map((row, i) => {
    const y = i * (barHeight + gap);
    let x = labelWidth;
    const segs = ['large', 'mid', 'small', 'unclassified'].map((key) => {
      const w = (trackWidth * (row[key] || 0)) / 100;
      const rect = `<rect x="${x.toFixed(1)}" y="${y}" width="${w.toFixed(1)}" height="${barHeight}" fill="${colors[key]}" />`;
      x += w;
      return rect;
    });
    return `<text x="0" y="${y + barHeight / 2 + 4}" font-size="11" fill="#444">${esc(row.name.length > 22 ? row.name.slice(0, 21) + '…' : row.name)}</text>${segs.join('')}`;
  });
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif">${bars.join('')}</svg>`;
}

module.exports = { donutChartSvg, barRankingSvg, overlapHeatmapSvg, stackedBarSvg, PALETTE };
