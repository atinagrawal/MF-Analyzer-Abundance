import pool from '@/lib/db';

export const revalidate = 86400; // 24 hours

export async function GET() {
  const BASE = 'https://mfcalc.getabundance.in';
  try {
    const { rows: mfRows } = await pool.query('SELECT code FROM mf_screener ORDER BY code');
    const { rows: sifRows } = await pool.query('SELECT scheme_id FROM sif_screener ORDER BY scheme_id');

    const today = new Date().toISOString().split('T')[0];

    const mfUrls = mfRows
      .map(
        (r) => `  <url>
    <loc>${BASE}/fund/${r.code}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`
      )
      .join('\n');

    const sifUrls = sifRows
      .map(
        (r) => `  <url>
    <loc>${BASE}/sif/${r.scheme_id}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`
      )
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${mfUrls}
${sifUrls}
</urlset>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err) {
    console.error('[sitemap-funds.xml]', err.message);
    const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;
    return new Response(emptyXml, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }
}
