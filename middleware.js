// middleware.js — Edge Middleware for server-side OG meta injection
// Handles both SWP Backtester (?btMode=1) and SIP Backtester (?sipBTMode=1)
// Only intercepts bot crawlers — regular browsers pass through unchanged

export const config = { matcher: '/' };

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

  const isSWPBT = !!p.get('btMode');
  const isSIPBT = !!p.get('sipBTMode');

  if (!isSWPBT && !isSIPBT) return; // pass through

  const ua = request.headers.get('user-agent') || '';
  if (!isBot(ua)) return; // let browser handle it via injectBTShareMeta()

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  let titleText, descText, ogImageURL;
  const pageURL = url.href;

  if (isSIPBT) {
    // ── SIP Backtester ──
    const sipBTName   = p.get('sipBTName') || 'SIP Backtest';
    const sipBTAmount = p.get('sipBTAmount') || '';
    const sipBTSY     = p.get('sipBTSY') || '';
    const sipBTSM     = p.get('sipBTSM') || '';
    const sipBTEY     = p.get('sipBTEY') || '';
    const sipBTEM     = p.get('sipBTEM') || '';
    const sipXirr     = p.get('sipXirr') || '';
    const sipCorpus   = p.get('sipCorpus') || '';
    const sipInvested = p.get('sipInvested') || '';
    const sipGain     = p.get('sipGain') || '';

    const startLabel = (sipBTSY && sipBTSM) ? `${MONTHS[parseInt(sipBTSM)-1]} ${sipBTSY}` : '';
    const endLabel   = (sipBTEY && sipBTEM) ? `${MONTHS[parseInt(sipBTEM)-1]} ${sipBTEY}` : 'Today';

    const ogParams = new URLSearchParams({ sipBTMode:'1', sipBTName, sipBTAmount, sipBTSY, sipBTSM, sipBTEY, sipBTEM, sipXirr, sipCorpus, sipInvested, sipGain });
    ogImageURL = `https://mfcalc.getabundance.in/api/og?${ogParams}`;

    const shortName = sipBTName.length > 32 ? sipBTName.slice(0, 32) + '...' : sipBTName;
    titleText = `SIP Backtest: ${shortName} | Abundance`;

    const parts = [
      `SIP backtest: ${sipBTName}`,
      startLabel ? `${startLabel} to ${endLabel}` : '',
      sipBTAmount ? `SIP Rs${fmtINR(sipBTAmount)}/mo` : '',
      sipXirr    ? `XIRR ${sipXirr}% p.a.` : '',
      sipCorpus  ? `Corpus Rs${fmtINR(sipCorpus)}` : '',
    ].filter(Boolean).slice(0, 4).join(' | ');
    descText = (parts + ' — Abundance ARN-251838').slice(0, 160);

  } else {
    // ── SWP Backtester ──
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

    const ogParams = new URLSearchParams({ tab:'swp', btName, btCorpus:corpus, btWithdrawal:withdraw, btSY, btSM, btEY, btEM, xirr, survived, finalC, withdrawn });
    ogImageURL = `https://mfcalc.getabundance.in/api/og?${ogParams}`;

    const shortName = btName.length > 32 ? btName.slice(0, 32) + '...' : btName;
    titleText = `SWP Backtester: ${shortName} | Abundance`;

    const parts = [
      `SWP backtest: ${btName}`,
      startLabel ? `${startLabel} to ${endLabel}` : '',
      corpus   ? `Corpus Rs${fmtINR(corpus)}` : '',
      xirr     ? `XIRR ${xirr}% p.a.` : '',
      survived === '1' ? 'Corpus survived' : survived === '0' ? 'Corpus depleted' : '',
    ].filter(Boolean).slice(0, 4).join(' | ');
    descText = (parts + ' — Abundance ARN-251838').slice(0, 160);
  }

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
<body><p>Loading...</p></body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
      'X-OG-Injected': isSIPBT ? 'sipbt' : 'swpbt',
    },
  });
}
