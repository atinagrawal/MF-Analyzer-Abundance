/**
 * /api/mf — Proxy for api.mfapi.in
 * 
 * Client calls:
 *   /api/mf?q=hdfc          → search: https://api.mfapi.in/mf/search?q=hdfc
 *   /api/mf?code=125497      → NAV history: https://api.mfapi.in/mf/125497
 *   /api/mf?code=125497&latest=1 → latest NAV only
 */

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  const url  = new URL(req.url, 'https://x');
  const q    = url.searchParams.get('q');
  const code = url.searchParams.get('code');
  const latest = url.searchParams.get('latest');

  let upstream, cache;

  if (q !== null) {
    // Search
    upstream = `https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`;
    cache    = 's-maxage=300, stale-while-revalidate=600';
  } else if (code) {
    // NAV history or latest
    upstream = latest
      ? `https://api.mfapi.in/mf/${code}/latest`
      : `https://api.mfapi.in/mf/${code}`;
    cache = latest
      ? 's-maxage=900, stale-while-revalidate=1800'
      : 's-maxage=14400, stale-while-revalidate=86400';
  } else {
    res.status(400).json({ error: 'Provide ?q= for search or ?code= for NAV data' });
    return;
  }

  try {
    const r = await fetch(upstream, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) { res.status(r.status).json({ error: `Upstream ${r.status}` }); return; }
    const data = await r.json();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', cache);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(data);
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
}
