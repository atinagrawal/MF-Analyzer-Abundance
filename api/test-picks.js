/**
 * GET /api/test-picks
 * Server-side test: fetches all 10 popular fund codes via the same
 * proxy logic as the browser, returns names + any errors.
 */
export const config = { runtime: 'nodejs' };

const CODES = [125494, 113177, 122640, 101762, 140225, 105758, 103131, 101072, 108466, 103504];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const base = `https://${req.headers.host}`;
  const results = await Promise.all(CODES.map(async code => {
    try {
      const r = await fetch(`${base}/api/mf?code=${code}&latest=1`);
      if (!r.ok) return { code, error: `HTTP ${r.status}` };
      const data = await r.json();
      const name = data && data.meta && data.meta.scheme_name;
      return { code, name: name || null, error: name ? null : 'no scheme_name' };
    } catch(e) {
      return { code, error: e.message };
    }
  }));

  res.status(200).json({
    ok: results.every(r => r.name),
    results
  });
}
