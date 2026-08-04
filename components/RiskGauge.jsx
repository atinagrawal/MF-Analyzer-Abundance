'use client';

/* ── Riskometer SVG gauge ──────────────────────────────────────────────────
 * Renders the same semicircular meter as NSE's official riskometer image.
 * Score range: 1 (Low) – 7 (Very High) mapped to 0°–180° arc.
 * Colours match the NSE palette exactly.
 * No images, no extra requests — pure inline SVG.
 * Shared between app/indices/page.js and Proposal Studio's Scheme Details.
 */
// Score range: 1 (Low) → 7 (Very High) per NSE riskometer methodology.
// Colour palette matches NSE's printed riskometer exactly.
// No fallback scores — the needle position is always the PDF-parsed riskScore value.
const RISK_CONFIG = {
  'Low':              { color: '#1b5e20', bg: '#e8f5e9', short: 'Low'      },
  'Low To Moderate':  { color: '#388e3c', bg: '#f1f8e9', short: 'Low–Mod'  },
  'Moderate':         { color: '#f57f17', bg: '#fffde7', short: 'Moderate' },
  'Moderately High':  { color: '#e65100', bg: '#fff3e0', short: 'Mod–High' },
  'High':             { color: '#c62828', bg: '#ffebee', short: 'High'     },
  'Very High':        { color: '#b71c1c', bg: '#ffebee', short: 'Very High'},
};

export default function RiskGauge({ label, score }) {
  if (!label || label === '—') {
    return <span className="risk-gauge-empty">—</span>;
  }

  const cfg = RISK_CONFIG[label] || { color: '#9e9e9e', bg: '#f5f5f5', short: label };
  // If score is unavailable (shouldn't happen after regex fix, but guard anyway)
  if (typeof score !== 'number') {
    return <span className="risk-gauge-empty" style={{ color: cfg.color }}>{cfg.short}</span>;
  }
  const actualScore = score;

  // Map score 1–7 → angle 0°–180° on a semicircle
  // 0° = left end (low risk), 180° = right end (very high risk)
  const pct = Math.min(1, Math.max(0, (actualScore - 1) / 6));
  const angleDeg = pct * 180;
  const angleRad = (angleDeg - 90) * (Math.PI / 180); // offset: 0° at left, 180° at right

  // Needle tip position on arc (r=26, cx=34, cy=34)
  const cx = 34, cy = 36, r = 26;
  const nx = cx + r * Math.cos((angleDeg - 180) * Math.PI / 180);
  const ny = cy + r * Math.sin((angleDeg - 180) * Math.PI / 180);

  // 6 arc segments (Low → Very High), each 30°
  const SEG_COLORS = ['#1b5e20','#388e3c','#f9a825','#f57f17','#e65100','#b71c1c'];
  const arcSegs = SEG_COLORS.map((c, i) => {
    const startAngle = (i * 30 - 180) * Math.PI / 180;
    const endAngle   = ((i + 1) * 30 - 180) * Math.PI / 180;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    return { x1, y1, x2, y2, color: c };
  });

  const scoreDisplay = typeof score === 'number' ? score.toFixed(2) : '';

  return (
    <div
      className="risk-gauge"
      title={`${label}${scoreDisplay ? ' · Score: ' + scoreDisplay : ''}`}
      style={{ '--gauge-color': cfg.color, '--gauge-bg': cfg.bg }}
    >
      <svg
        width="68" height="40"
        viewBox="0 0 68 40"
        aria-hidden="true"
        className="risk-gauge-svg"
      >
        {/* Arc segments */}
        {arcSegs.map((seg, i) => (
          <line
            key={i}
            x1={seg.x1} y1={seg.y1}
            x2={seg.x2} y2={seg.y2}
            stroke={seg.color}
            strokeWidth="8"
            strokeLinecap="butt"
          />
        ))}
        {/* White track behind for separation */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="1"
        />
        {/* Needle */}
        <line
          x1={cx} y1={cy}
          x2={nx} y2={ny}
          stroke="#1a1a1a"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        {/* Needle pivot */}
        <circle cx={cx} cy={cy} r="2.5" fill="#1a1a1a" />
      </svg>
      <span className="risk-gauge-label" style={{ color: cfg.color }}>
        {cfg.short}
      </span>
    </div>
  );
}

export { RISK_CONFIG };
