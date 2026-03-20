// middleware.js — Edge Middleware for server-side OG meta injection
// Only intercepts ?btMode=1 requests from known social crawlers.
// Regular browser users pass through to the static HTML unchanged.

export const config = {
  matcher: '/',
};

const BOT_UA = [
  'twitterbot','facebookexternalhit','facebot','linkedinbot','whatsapp',
  'telegrambot','slackbot','discordbot','googlebot','bingbot','applebot',
  'pinterest','curl','wget','python-requests','go-http-client','opengraph',
  'iframely','embedly','rogerbot','outbrain','w3c_validator',
];

function isBot(ua) {
  if (!ua) return false;
  const s = ua.toLowerCase();
  return BOT_UA.some(b => s.includes(b));
}

function fmtINR(val) {
  const n = Math.round(parseFloat(val) || 0);
  if (n >= 1e7) return (n / 1e7).toFixed(1) + ' Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(1) + ' L';
  return n.toLocaleString('en-IN');
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default function middleware(request) {
  const url = new URL(request.url);
  const p   = url.searchParams;

  // Only activate for backtester share links
  if (!p.get('btMode')) return; // pass through to static file

  // For regular browsers — pass through, injectBTShareMeta() handles it in JS
  const ua = request.headers.get('user-agent') || '';
  if (!isBot(ua)) return; // pass through unchanged

  // ── Bot detected + btMode=1 → return minimal HTML with injected OG tags ──
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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
  const withdrawn= p.get('withdrawn') || '';

  const startLabel = (btSY && btSM) ? `${MONTHS[parseInt(btSM)-1]} ${btSY}` : '';
  const endLabel   = (btEY && btEM) ? `${MONTHS[parseInt(btEM)-1]} ${btEY}` : 'Today';

  const ogParams = new URLSearchParams({
    tab: 'swp', btName, btCorpus: corpus, btWithdrawal: withdraw,
    btSY, btSM, btEY, btEM, xirr, survived, finalC, withdrawn,
  });
  const ogImageURL = `https://mfcalc.getabundance.in/api/og?${ogParams}`;
  const pageURL    = url.href;

  const shortName = btName.length > 32 ? btName.slice(0, 32) + '...' : btName;
  const titleText = `SWP Backtester: ${shortName} | Abundance`;

  const descParts = [
    `SWP backtest: ${btName}`,
    startLabel ? `${startLabel} to ${endLabel}` : '',
    corpus   ? `Corpus Rs${fmtINR(corpus)}` : '',
    withdraw ? `Withdrawal Rs${fmtINR(withdraw)}/mo` : '',
    xirr     ? `XIRR ${xirr}% p.a.` : '',
    survived === '1' ? 'Corpus survived' : survived === '0' ? 'Corpus depleted' : '',
  ].filter(Boolean).slice(0, 4).join(' | ');
  const descText = (descParts + ' — Abundance ARN-251838').slice(0, 160);

  // Return minimal HTML — bots only read <head>, no redirect needed
  const html = `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titleText)}</title>
<meta name="description" content="${esc(descText)}">
<meta name="robots" content="noindex">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Abundance Financial Services">
<meta property="og:title" content="${esc(titleText)}">
<meta property="og:description" content="${esc(descText)}">
<meta property="og:url" content="${esc(pageURL)}">
<meta property="og:image" content="${esc(ogImageURL)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:type" content="image/png">
<meta property="og:locale" content="en_IN">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@abundancefinsvs">
<meta name="twitter:title" content="${esc(titleText)}">
<meta name="twitter:description" content="${esc(descText)}">
<meta name="twitter:image" content="${esc(ogImageURL)}">
<link rel="canonical" href="${esc(pageURL)}">
</head>
<body>
<p>Loading...</p>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'X-OG-Injected': '1',
    },
  });
}
