/**
 * /api/mf — Proxy for api.mfapi.in
 *
 * Routes (via vercel.json rewrite /api/mf/:path* → /api/mf?_path=:path*):
 *   /api/mf/search?q=HDFC     → https://api.mfapi.in/mf/search?q=HDFC
 *   /api/mf/125497             → https://api.mfapi.in/mf/125497
 *   /api/mf/125497/latest      → https://api.mfapi.in/mf/125497/latest
 */

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const url  = new URL(req.url, 'https://x');
  const path = url.searchParams.get('_path') || '';  // from rewrite
  const q    = url.searchParams.get('q')    || '';

  // Rebuild the upstream URL
  let upstream;
  if (path === 'search' || path.startsWith('search')) {
    upstream = `https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`;
  } else if (path) {
    // scheme code, maybe with /latest suffix
    upstream = `https://api.mfapi.in/mf/${path}`;
    if (q) upstream += `?${url.searchParams.toString().replace(`_path=${encodeURIComponent(path)}&`,'')}`;
  } else {
    // Direct call like /api/mf?q=xxx — treat as search
    upstream = q
      ? `https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`
      : `https://api.mfapi.in/mf`;
  }

  // Cache TTL
  const isSearch = path === 'search' || path.startsWith('search') || (!path && q);
  const isLatest = path.endsWith('/latest');
  const cache    = isSearch ? 's-maxage=300, stale-while-revalidate=600'
                 : isLatest ? 's-maxage=900, stale-while-revalidate=1800'
                 :             's-maxage=14400, stale-while-revalidate=86400';

  try {
    const r = await fetch(upstream, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) {
      res.status(r.status).json({ error: `Upstream ${r.status}` });
      return;
    }
    const data = await r.json();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', cache);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
