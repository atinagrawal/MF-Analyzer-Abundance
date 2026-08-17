/**
 * GET /api/picks
 * Returns all popular fund names in a single response.
 * Server fetches from the proxy, browser makes just 1 call.
 *
 * Uses /api/mf's ?codes= batch path (one request for all 10 codes) rather
 * than one ?code= request each: the per-code path is IP rate limited, and
 * these server-to-self calls all share one bucket, so a cold-cache fan-out
 * could trip the burst tier on this route's own internal traffic. The
 * ?codes= batch path is deliberately exempt from rate limiting.
 */
export const config = { runtime: 'nodejs' };

const CODES = [125494, 113177, 122640, 101762, 140225, 105758, 103131, 101072, 108466, 103504];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');

  const base = `https://${req.headers.host}`;
  let funds = [];
  try {
    const r = await fetch(`${base}/api/mf?codes=${CODES.join(',')}&latest=1`);
    if (r.ok) {
      const data = await r.json();
      funds = CODES
        .filter((code) => data?.navs?.[code] != null && data?.names?.[code])
        .map((code) => ({ code, name: data.names[code] }));
    }
  } catch (e) { /* funds stays [] */ }

  res.status(200).json({ funds });
}
