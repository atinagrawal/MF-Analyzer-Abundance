/**
 * GET /api/picks
 * Returns all popular fund names in a single response.
 * Server fetches from the proxy, browser makes just 1 call.
 */
export const config = { runtime: 'nodejs' };

const CODES = [125494, 113177, 122640, 101762, 140225, 105758, 103131, 101072, 108466, 103504];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  const base = `https://${req.headers.host}`;
  const results = await Promise.all(CODES.map(async code => {
    try {
      const r = await fetch(`${base}/api/mf?code=${code}&latest=1`);
      if (!r.ok) return null;
      const data = await r.json();
      const name = data && data.meta && data.meta.scheme_name;
      return name ? { code, name } : null;
    } catch(e) { return null; }
  }));

  const funds = results.filter(Boolean);
  res.status(200).json({ funds });
}
