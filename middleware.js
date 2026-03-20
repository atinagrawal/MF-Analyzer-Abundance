// middleware.js — Edge Middleware for server-side OG meta injection
// Intercepts ALL requests with ?btMode=1 (not just bots)
// Returns a fast minimal HTML page with correct OG tags — no self-fetch, no recursion

export const config = {
  matcher: '/',
};

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

export default function middleware(request) {
  const url = new URL(request.url);
  const p   = url.searchParams;

  // Only activate for backtester share links
  if (!p.get('btMode')) return; // pass through to static file

  // ── Build dynamic values ──
  const btName   = p.get('btName') || 'SWP Backtest';
  const corpus   = p.get('btCorpus') || '';
  const withdraw = p.get('btWithdrawal') || '';
  const btSY     = p.get('btSY') || '';
  const btSM     = p.get('btSM') || '';
  const btEY     = p.get('btEY') || '';
  const btEM     = p.get('btEM') || '';
  const xirr     = p.get('xirr') || '';
  const survived = p.get('survived') || '';
  const finalC   = p.get('finalC') || '';

  const startLabel = (btSY && btSM) ? `${MONTHS[parseInt(btSM)-1]} ${btSY}` : '';
  const endLabel   = (btEY && btEM) ? `${MONTHS[parseInt(btEM)-1]} ${btEY}` : 'Today';

  const ogParams = new URLSearchParams({
    tab: 'swp', btName, btCorpus: corpus, btWithdrawal: withdraw,
    btSY, btSM, btEY, btEM, xirr, survived, finalC,
  });
  const ogImageURL = `https://mfcalc.getabundance.in/api/og?${ogParams}`;
  const pageURL    = url.href;

  const shortName = btName.length > 50 ? btName.slice(0, 50) + '…' : btName;
  const titleText = `SWP Backtester — ${shortName} | Abundance`;

  const descParts = [
    `SWP backtest: ${btName}`,
    startLabel ? `${startLabel} → ${endLabel}` : '',
    corpus   ? `Corpus ₹${fmtINR(corpus)}` : '',
    withdraw ? `Withdrawal ₹${fmtINR(withdraw)}/mo` : '',
    xirr     ? `XIRR ${xirr}% p.a.` : '',
    survived === '1' ? '✅ Corpus survived' : survived === '0' ? '⚠️ Corpus depleted' : '',
  ].filter(Boolean).join(' · ');
  const descText = `${descParts} | Abundance Financial Services ARN-251838`;

  // ── Return a minimal HTML page with correct OG tags ──
  // Bots read <head> only. A <meta http-equiv="refresh"> sends real users
  // to the actual app immediately (before JS even loads).
  // This approach is fast (no origin fetch), no recursion, no timeout risk.

  const html = `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(titleText)}</title>
<meta name="description" content="${esc(descText)}">
<meta name="robots" content="noindex">

<!-- Open Graph -->
<meta property="og:type" content="website">
<meta property="og:site_name" content="Abundance Financial Services">
<meta property="og:title" content="${esc(titleText)}">
<meta property="og:description" content="${esc(descText)}">
<meta property="og:url" content="${esc(pageURL)}">
<meta property="og:image" content="${esc(ogImageURL)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/svg+xml">
<meta property="og:locale" content="en_IN">

<!-- Twitter / X -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@abundancefinsvs">
<meta name="twitter:title" content="${esc(titleText)}">
<meta name="twitter:description" content="${esc(descText)}">
<meta name="twitter:image" content="${esc(ogImageURL)}">

<!-- Redirect real users to the actual app instantly -->
<meta http-equiv="refresh" content="0; url=${esc(pageURL)}">
<link rel="canonical" href="${esc(pageURL)}">
<link rel="icon" type="image/x-icon" href="https://www.getabundance.in/favicon.ico">
</head>
<body>
<p>Loading SWP Backtest... <a href="${esc(pageURL)}">Click here if not redirected</a></p>
<script>window.location.replace("${pageURL.replace(/"/g, '\\"')}");</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Cache this response so WhatsApp's crawler gets it fast on repeat fetches
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'X-OG-Injected': '1',
    },
  });
}
