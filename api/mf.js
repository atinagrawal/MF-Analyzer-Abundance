/**
 * /api/mf — Proxy for api.mfapi.in
 * Routes:
 *   /api/mf/search?q=HDFC        → https://api.mfapi.in/mf/search?q=HDFC
 *   /api/mf/[scheme_code]         → https://api.mfapi.in/mf/[scheme_code]
 *   /api/mf/[scheme_code]/latest  → https://api.mfapi.in/mf/[scheme_code]/latest
 *
 * Benefits: solves CORS, adds caching, insulates from mfapi.in availability
 * Cache: search = 5 min, NAV history = 4 hours, latest NAV = 15 min
 */

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  // Parse the path after /api/mf
  const url = new URL(req.url, 'https://x');
  // url.pathname will be like /api/mf/search or /api/mf/125497
  const afterMf = url.pathname.replace(/^\/api\/mf\/?/, '');
  const query   = url.search; // e.g. ?q=hdfc

  // Build upstream URL
  let upstream;
  if (afterMf === '' || afterMf === 'search') {
    upstream = `https://api.mfapi.in/mf${afterMf ? '/' + afterMf : ''}${query}`;
  } else {
    upstream = `https://api.mfapi.in/mf/${afterMf}${query}`;
  }

  // Cache headers based on endpoint type
  let cacheHeader;
  if (afterMf === 'search' || afterMf === '') {
    cacheHeader = 's-maxage=300, stale-while-revalidate=600';       // 5 min search
  } else if (afterMf.endsWith('/latest')) {
    cacheHeader = 's-maxage=900, stale-while-revalidate=1800';      // 15 min latest
  } else {
    cacheHeader = 's-maxage=14400, stale-while-revalidate=86400';   // 4 hr full history
  }

  try {
    const upstream_res = await fetch(upstream, {
      headers: {
        'User-Agent': 'MFCalc-Abundance/1.0 (https://mfcalc.getabundance.in)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!upstream_res.ok) {
      res.status(upstream_res.status).json({ error: `Upstream returned ${upstream_res.status}` });
      return;
    }

    const data = await upstream_res.json();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', cacheHeader);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.status(200).json(data);

  } catch (err) {
    res.status(502).json({ error: 'Proxy error: ' + err.message });
  }
}
