/**
 * /api/amfi-pdf
 * Proxies AMFI monthly report PDF to bypass CORS.
 * Client uses pdf.js to parse the returned PDF.
 *
 * Query: ?month=feb&year=2026
 * Cached 24h on CDN.
 */

export const config = { runtime: 'edge' };

function getLatestMonth() {
  const now = new Date();
  const day = now.getUTCDate();
  const offset = day < 10 ? 2 : 1;
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const mon = d.toLocaleString('en-US', { month: 'short' }).toLowerCase();
  return { mon, year: d.getFullYear() };
}

export default async function handler(req) {
  const url = new URL(req.url);
  let mon  = url.searchParams.get('month');
  let year = url.searchParams.get('year');

  if (!mon || !year) {
    const latest = getLatestMonth();
    mon  = latest.mon;
    year = latest.year;
  }

  mon = mon.toLowerCase();

  const pdfUrl = `https://portal.amfiindia.com/spages/am${mon}${year}repo.pdf`;

  try {
    const res = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AbundanceMFCalc/1.0)' }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ error: 'PDF not found', url: pdfUrl }), {
        status: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const pdf = await res.arrayBuffer();

    return new Response(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800',
        'X-Source-URL': pdfUrl
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
