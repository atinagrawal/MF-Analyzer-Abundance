/**
 * app/sitemap-pms.xml/route.js
 *
 * PMS has no Postgres table to SELECT from (see docs/superpowers/specs/
 * 2026-08-28-pms-detail-pages-design.md's Storage section) -- this sitemap
 * instead re-fetches the live leaderboard for all four strategies and
 * emits only the "curated" set (providers NOT excluded by the screener's
 * own small-AUM filter), matching scripts/backfill-pms-detail-pages.mjs's
 * (Task 9) eager pre-warm scope. Long-tail strategies below that threshold
 * still resolve as real pages via the screener's "All Funds" toggle and
 * internal links -- they're just not proactively pushed into the sitemap.
 */

const STRATEGIES = ['Equity', 'Debt', 'Multi Asset', 'Hybrid'];
const AUM_THRESHOLD = { Equity: 50, Debt: 10, 'Multi Asset': 10, Hybrid: 10 };

export const revalidate = 86400; // 24 hours

async function fetchLeaderboard(strategy) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const params = new URLSearchParams();
  params.append('strategyname', strategy);
  params.append('servicetype', 'D');
  params.append('', '');
  params.append('', '');
  params.append('fromMonth', String(month));
  params.append('fromYears', String(year));
  params.append('asOnDate', `${year}-${month}-${new Date(year, month, 0).getDate()}`);

  const res = await fetch('https://www.apmiindia.org/apmi/welcomeiaperformance.htm?action=loadIAReport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://www.apmiindia.org/' },
    body: params.toString(),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const html = await res.text();

  // Lightweight extraction -- only need portfolioManager, aum, and IAID per
  // row (full field parsing already lives in app/api/pms-data/route.js;
  // duplicating cheerio here isn't worth it for a sitemap that only needs
  // three fields and tolerates missing rows silently).
  const rows = [];
  const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html))) {
    const row = m[1];
    const hrefMatch = row.match(/IaInsight\.htm\?IAID=(\d+)/);
    const aumMatch = row.match(/<td[^>]*>\s*([\d,.]+)\s*<\/td>\s*<td/); // best-effort; AUM is the 3rd <td>
    if (!hrefMatch) continue;
    rows.push({ iaid: hrefMatch[1], aum: aumMatch ? parseFloat(aumMatch[1].replace(/,/g, '')) : 0 });
  }
  return rows;
}

export async function GET() {
  const BASE = 'https://mfcalc.getabundance.in';
  try {
    const results = await Promise.all(STRATEGIES.map((s) => fetchLeaderboard(s)));
    const today = new Date().toISOString().split('T')[0];

    const urls = STRATEGIES.flatMap((strategy, i) => {
      const threshold = AUM_THRESHOLD[strategy];
      return results[i]
        .filter((r) => r.aum >= threshold)
        .map((r) => `  <url>
    <loc>${BASE}/pms/${r.iaid}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`);
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err) {
    console.error('[sitemap-pms.xml]', err.message);
    const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;
    return new Response(emptyXml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
  }
}
