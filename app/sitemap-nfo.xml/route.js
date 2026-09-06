// app/sitemap-nfo.xml/route.js — dedicated sitemap for the NFO tracker.
// Reads the R2-cached NFO document (no Postgres), same pattern as
// sitemap-funds.xml but sourced from lib/nfoData.js instead of mf_screener.

import { getNfoData } from '@/lib/nfoData';

export const revalidate = 86400;

export async function GET() {
  const BASE = 'https://mfcalc.getabundance.in';
  try {
    const data = await getNfoData();
    const all = [...(data.mf || []), ...(data.sif || [])];
    const today = new Date().toISOString().split('T')[0];

    const entryUrls = all
      .map(
        (e) => `  <url>
    <loc>${BASE}/nfo/${e.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${e.status === 'open' ? 0.7 : 0.3}</priority>
  </url>`
      )
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE}/nfo</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.75</priority>
  </url>
${entryUrls}
</urlset>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err) {
    console.error('[sitemap-nfo.xml]', err.message);
    const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;
    return new Response(emptyXml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
  }
}
