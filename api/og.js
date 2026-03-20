// api/og.js — Dynamic OG image via SVG → PNG
// Zero external dependencies — uses only built-in Node.js
// Returns an SVG (social crawlers and most previews accept image/svg+xml)

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);

  const tab      = searchParams.get('tab') || '';
  const btName   = searchParams.get('btName') || '';
  const corpus   = searchParams.get('btCorpus') || '';
  const withdraw = searchParams.get('btWithdrawal') || '';
  const btSY     = searchParams.get('btSY') || '';
  const btSM     = searchParams.get('btSM') || '';
  const btEY     = searchParams.get('btEY') || '';
  const btEM     = searchParams.get('btEM') || '';
  const xirr     = searchParams.get('xirr') || '';
  const survived = searchParams.get('survived') || '';
  const finalC   = searchParams.get('finalC') || '';

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function fmtINR(val) {
    const n = Math.round(parseFloat(val) || 0);
    if (n >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(2) + ' L';
    return n.toLocaleString('en-IN');
  }

  function esc(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const startLabel = (btSY && btSM) ? `${MONTHS[parseInt(btSM) - 1]} ${btSY}` : '';
  const endLabel   = (btEY && btEM) ? `${MONTHS[parseInt(btEM) - 1]} ${btEY}` : 'Today';
  const isBT       = tab === 'swp' && !!btName;
  const fundShort  = btName.length > 52 ? btName.slice(0, 52) + '…' : btName;

  const surviveColor = survived === '1' ? '#00897b' : survived === '0' ? '#ef5350' : '#2e7d32';
  const surviveText  = survived === '1' ? '✅  Corpus Survived' : survived === '0' ? '⚠️  Corpus Depleted' : '';
  const surviveBg    = survived === '1' ? 'rgba(0,137,123,0.22)' : 'rgba(239,83,80,0.18)';
  const surviveBorder= survived === '1' ? 'rgba(0,137,123,0.5)' : 'rgba(239,83,80,0.5)';

  // ── Stats on the right card ──
  const statsRows = [
    corpus   ? { label: 'Starting Corpus',   value: '₹' + fmtINR(corpus),          color: '#ffffff' } : null,
    withdraw ? { label: 'Monthly Withdrawal', value: '₹' + fmtINR(withdraw) + '/mo', color: '#80cbc4' } : null,
    xirr     ? { label: 'XIRR',              value: xirr + '% p.a.',                color: parseFloat(xirr) > 0 ? '#66bb6a' : '#ef5350' } : null,
    (finalC && survived === '1') ? { label: 'Remaining Corpus', value: '₹' + fmtINR(finalC), color: '#66bb6a' } : null,
  ].filter(Boolean);

  const genericFeatures = ['📈  Fund Comparison', '🧮  SIP & Lumpsum', '🎯  Goal Planner', '💸  SWP + Backtester', '🏦  EMI & Loans'];

  // Build right card SVG content
  let rightCardContent = '';
  if (isBT && statsRows.length) {
    let yPos = 56;
    statsRows.forEach(row => {
      rightCardContent += `
        <text x="28" y="${yPos}" font-family="sans-serif" font-size="11" font-weight="700" fill="rgba(255,255,255,0.5)" letter-spacing="1">${esc(row.label.toUpperCase())}</text>
        <text x="28" y="${yPos + 28}" font-family="monospace" font-size="22" font-weight="800" fill="${row.color}">${esc(row.value)}</text>`;
      yPos += 62;
    });
  } else if (!isBT) {
    genericFeatures.forEach((f, i) => {
      rightCardContent += `
        <circle cx="20" cy="${46 + i * 38}" r="4" fill="#66bb6a"/>
        <text x="34" y="${52 + i * 38}" font-family="sans-serif" font-size="15" font-weight="600" fill="rgba(255,255,255,0.88)">${esc(f)}</text>`;
    });
    rightCardContent += `
      <rect x="8" y="${46 + genericFeatures.length * 38 + 8}" width="230" height="32" rx="7" fill="rgba(46,125,50,0.3)"/>
      <text x="20" y="${46 + genericFeatures.length * 38 + 29}" font-family="sans-serif" font-size="13" font-weight="700" fill="#66bb6a">mfcalc.getabundance.in</text>`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a1f0a"/>
      <stop offset="55%" style="stop-color:#1a3a1a"/>
      <stop offset="100%" style="stop-color:#0d2b0d"/>
    </linearGradient>
    <linearGradient id="topbar" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:#00897b"/>
      <stop offset="50%" style="stop-color:#2e7d32"/>
      <stop offset="100%" style="stop-color:#66bb6a"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>

  <!-- Grid dots -->
  <pattern id="dots" x="0" y="0" width="40" height="40" patternUnits="userSpaceOnUse">
    <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.04)"/>
  </pattern>
  <rect width="1200" height="630" fill="url(#dots)"/>

  <!-- Top accent bar -->
  <rect width="1200" height="5" fill="url(#topbar)"/>

  <!-- ── Brand block ── -->
  <!-- Icon box -->
  <rect x="60" y="44" width="46" height="46" rx="11" fill="rgba(46,125,50,0.35)" stroke="rgba(102,187,106,0.4)" stroke-width="1.5"/>
  <text x="83" y="75" text-anchor="middle" font-size="22">📊</text>
  <!-- Brand name -->
  <text x="118" y="63" font-family="sans-serif" font-size="12" font-weight="700" fill="#66bb6a" letter-spacing="1.5">ABUNDANCE FINANCIAL SERVICES</text>
  <text x="118" y="80" font-family="sans-serif" font-size="11" fill="rgba(255,255,255,0.5)">ARN-251838 · AMFI Registered MFD</text>

  <!-- ── Main title ── -->
  <text x="60" y="${isBT ? 148 : 158}" font-family="sans-serif" font-size="${isBT ? 46 : 52}" font-weight="800" fill="#ffffff">${isBT ? 'SWP Backtester' : 'MF Risk &amp; Return Analyzer'}</text>

  ${isBT && fundShort ? `<text x="60" y="192" font-family="sans-serif" font-size="19" font-weight="600" fill="#80cbc4">${esc(fundShort)}</text>` : ''}
  ${!isBT ? `<text x="60" y="196" font-family="sans-serif" font-size="20" fill="rgba(255,255,255,0.6)">Fund Compare · SIP · Goal Planner · SWP · EMI</text>` : ''}

  <!-- ── Period badge (backtest) ── -->
  ${isBT && startLabel ? `
  <rect x="60" y="${isBT && fundShort ? 214 : 210}" width="${esc(String((startLabel + ' → ' + endLabel).length * 9 + 56))}" height="36" rx="8" fill="rgba(0,137,123,0.22)" stroke="rgba(0,137,123,0.5)" stroke-width="1"/>
  <text x="78" y="${isBT && fundShort ? 237 : 233}" font-family="sans-serif" font-size="14" font-weight="700" fill="#4db6ac">📅  ${esc(startLabel)} → ${esc(endLabel)}</text>
  ` : ''}

  <!-- ── Survival badge (backtest) ── -->
  ${isBT && surviveText ? `
  <rect x="60" y="${isBT && fundShort ? 264 : 260}" width="${esc(String(surviveText.length * 9 + 40))}" height="36" rx="8" fill="${surviveBg}" stroke="${surviveBorder}" stroke-width="1"/>
  <text x="78" y="${isBT && fundShort ? 287 : 283}" font-family="sans-serif" font-size="15" font-weight="800" fill="${surviveColor}">${esc(surviveText)}</text>
  ` : ''}

  <!-- ── Right card ── -->
  <rect x="${isBT ? 780 : 820}" y="60" width="${isBT ? 360 : 320}" height="${isBT ? Math.min(statsRows.length * 62 + 72, 440) : genericFeatures.length * 38 + 130}" rx="14" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>

  <!-- Card header bar -->
  <rect x="${isBT ? 780 : 820}" y="60" width="${isBT ? 360 : 320}" height="42" rx="14" fill="rgba(255,255,255,0.04)"/>
  <rect x="${isBT ? 780 : 820}" y="88" width="${isBT ? 360 : 320}" height="14" fill="rgba(255,255,255,0.04)"/>
  <text x="${isBT ? 800 : 840}" y="88" font-family="sans-serif" font-size="11" font-weight="700" fill="rgba(255,255,255,0.4)" letter-spacing="1">${isBT ? 'BACKTEST RESULTS' : 'FEATURES'}</text>

  <!-- Card inner content (translated) -->
  <g transform="translate(${isBT ? 780 : 820}, 60)">
    ${rightCardContent}
  </g>

  <!-- ── Bottom bar ── -->
  <rect x="0" y="592" width="1200" height="38" fill="rgba(0,0,0,0.38)"/>
  <line x1="0" y1="592" x2="1200" y2="592" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  <text x="60" y="616" font-family="sans-serif" font-size="12" fill="rgba(255,255,255,0.5)">mfcalc.getabundance.in</text>
  <text x="600" y="616" text-anchor="middle" font-family="sans-serif" font-size="10" fill="rgba(255,255,255,0.3)">MF investments are subject to market risks · Data: AMFI / mfapi.in</text>
  <text x="1140" y="616" text-anchor="end" font-family="sans-serif" font-size="12" fill="rgba(255,255,255,0.5)">Free · No Login Required</text>
</svg>`;

  return new Response(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
