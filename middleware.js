// middleware.js — Edge Middleware for dynamic OG meta injection
// Runs BEFORE the HTML is served — bots and crawlers see the injected tags
// Only activates for requests with ?btMode=1 (SWP Backtester share links)

export const config = {
  matcher: '/',  // only intercept root page requests
};

// Known social media / link preview crawlers
const BOT_PATTERNS = [
  'twitterbot', 'facebookexternalhit', 'linkedinbot', 'whatsapp',
  'telegrambot', 'slackbot', 'discordbot', 'googlebot', 'bingbot',
  'applebot', 'pinterest', 'vkshare', 'w3c_validator', 'curl', 'wget',
  'python-requests', 'go-http-client', 'opengraph',
];

function isBot(userAgent) {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some(p => ua.includes(p));
}

function fmtINR(val) {
  const n = Math.round(parseFloat(val) || 0);
  if (n >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
  if (n >= 1e5) return (n / 1e5).toFixed(2) + ' L';
  return n.toLocaleString('en-IN');
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const p   = url.searchParams;

  // Only activate for backtester share links
  if (!p.get('btMode')) {
    return; // pass through normally
  }

  const ua = request.headers.get('user-agent') || '';

  // For non-bots: pass through — JS will handle meta injection client-side
  // For bots: inject meta tags server-side
  if (!isBot(ua)) {
    return; // pass through, injectBTShareMeta() handles it in browser
  }

  // ── Build dynamic values ──
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

  const startLabel = (btSY && btSM) ? `${MONTHS[parseInt(btSM)-1]} ${btSY}` : '';
  const endLabel   = (btEY && btEM) ? `${MONTHS[parseInt(btEM)-1]} ${btEY}` : 'Today';

  const pageURL  = url.href;
  const ogParams = new URLSearchParams({
    tab: 'swp', btName, btCorpus: corpus, btWithdrawal: withdraw,
    btSY, btSM, btEY, btEM, xirr, survived, finalC,
  });
  const ogImageURL = `https://mfcalc.getabundance.in/api/og?${ogParams}`;

  const shortName = btName.length > 50 ? btName.slice(0, 50) + '…' : btName;
  const titleText = `SWP Backtester — ${shortName} | Abundance`;
  const descParts = [
    `SWP backtest on ${btName}`,
    startLabel ? `${startLabel} → ${endLabel}` : '',
    corpus   ? `Corpus ₹${fmtINR(corpus)}` : '',
    withdraw ? `Withdrawal ₹${fmtINR(withdraw)}/mo` : '',
    xirr     ? `XIRR ${xirr}% p.a.` : '',
    survived === '1' ? 'Corpus survived' : survived === '0' ? 'Corpus depleted' : '',
  ].filter(Boolean).join(' · ');
  const descText = descParts + ' | Abundance Financial Services ARN-251838';

  // ── Fetch the static HTML and inject tags ──
  const staticRes  = await fetch(`https://mfcalc.getabundance.in/`);
  let   html       = await staticRes.text();

  function replaceMeta(prop, val, isName = false) {
    const attr = isName ? 'name' : 'property';
    const re = new RegExp(`<meta ${attr}="${prop}"[^>]*>`, 'gi');
    const escaped = val.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return html.replace(re, `<meta ${attr}="${prop}" content="${escaped}">`);
  }

  // Replace title
  html = html.replace(
    /<title>[^<]*<\/title>/,
    `<title>${titleText.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</title>`
  );
  // Replace OG/Twitter tags
  html = replaceMeta('og:title',       titleText);
  html = replaceMeta('og:description', descText);
  html = replaceMeta('og:url',         pageURL);
  html = replaceMeta('og:image',       ogImageURL);
  html = replaceMeta('og:image:width', '1200');
  html = replaceMeta('og:image:height','630');
  html = replaceMeta('og:image:type',  'image/svg+xml');
  html = replaceMeta('twitter:title',       titleText,  true);
  html = replaceMeta('twitter:description', descText,   true);
  html = replaceMeta('twitter:image',       ogImageURL, true);
  // Also fix canonical to include the share params
  html = html.replace(
    /<link rel="canonical"[^>]*>/,
    `<link rel="canonical" href="${pageURL.replace(/"/g, '&quot;')}">`
  );

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store', // don't cache bot-specific injected HTML
      'X-OG-Injected': '1',
    },
  });
}
