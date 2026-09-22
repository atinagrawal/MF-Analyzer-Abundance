import { getAllIndexSlugs } from '@/lib/indexConstituentsConfig';

export const revalidate = 86400; // 24 hours

export async function GET() {
  const BASE = 'https://mfcalc.getabundance.in';
  try {
    const slugs = getAllIndexSlugs();
    const today = new Date().toISOString().split('T')[0];

    const directoryUrl = `  <url>
    <loc>${BASE}/indices</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.85</priority>
  </url>`;

    const indexUrls = slugs
      .map((slug) => {
        return `  <url>
    <loc>${BASE}/indices/${slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.75</priority>
  </url>`;
      })
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${directoryUrl}
${indexUrls}
</urlset>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err) {
    console.error('[sitemap-indices.xml]', err.message);
    const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;
    return new Response(emptyXml, {
      headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
  }
}
