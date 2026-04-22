// middleware.js — Edge Middleware
//
// Two responsibilities:
// 1. AUTH GUARD: Protected paths redirect to /login if no session cookie found.
//    (Lightweight cookie-presence check — full session validation happens
//    server-side in each page/API route via auth() from @/auth.)
//
// 2. OG INJECTION: For bot crawlers hitting / with share params (?btMode / ?sipBTMode),
//    inject pre-rendered OG meta tags so social previews work without JS.

import { NextResponse } from 'next/server';

// ── Protected paths ────────────────────────────────────────────────────────
// Add/remove paths here to change what requires login.
// No other code needs to change.
const PROTECTED_PATHS = [
  '/admin',   // cas-tracker is intentionally public for SEO — auth gate is in-page
];

// ── Bot UA list (for OG injection) ────────────────────────────────────────
const BOT_UA = [
  'twitterbot','facebookexternalhit','facebot','linkedinbot','whatsapp',
  'telegrambot','slackbot','discordbot','googlebot','bingbot','applebot',
  'pinterest','curl','wget','python-requests','go-http-client','opengraph',
  'iframely','embedly','rogerbot','outbrain','w3c_validator',
];

export const config = {
  matcher: [
    '/',             // OG injection for share links
    '/admin',        // admin auth guard
    '/admin/:path*',
  ],
};

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
  const pathname = url.pathname;
  const p = url.searchParams;

  // ── 1. AUTH GUARD ────────────────────────────────────────────────────────
  const isProtected = PROTECTED_PATHS.some(path => pathname.startsWith(path));
  if (isProtected) {
    // Auth.js v5 cookie name: authjs.session-token (dev) or __Secure-authjs.session-token (prod)
    const sessionToken =
      request.cookies.get('__Secure-authjs.session-token') ||
      request.cookies.get('authjs.session-token');

    if (!sessionToken) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
    // /admin requires admin role — validated server-side in the page itself.
    // Middleware only checks session presence; role check is in app/admin/page.jsx.
    return NextResponse.next();
  }

  // ── 2. OG INJECTION (/ only) ─────────────────────────────────────────────
  const isSWPBT = !!p.get('btMode');
  const isSIPBT = !!p.get('sipBTMode');

  if (!isSWPBT && !isSIPBT) return NextResponse.next();

  const ua = request.headers.get('user-agent') || '';
  if (!isBot(ua)) return NextResponse.next();

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
