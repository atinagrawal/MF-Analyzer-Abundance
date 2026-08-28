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

import * as cheerio from 'cheerio';

const STRATEGIES = ['Equity', 'Debt', 'Multi Asset', 'Hybrid'];
const AUM_THRESHOLD = { Equity: 50, Debt: 10, 'Multi Asset': 10, Hybrid: 10 };

export const revalidate = 86400; // 24 hours

function parseVal(str) {
  if (!str || str.trim() === '-' || str.trim() === '') return 0;
  return parseFloat(str.trim().replace(/[₹,]/g, '')) || 0;
}

async function fetchLeaderboard(strategy) {
  const now = new Date();
  // Use previous month's data (same logic as app/pms-screener/page.jsx's getPmsDataMonths)
  let month = now.getMonth(); // 0-indexed (0=Jan, 7=Aug)
  let year = now.getFullYear();
  if (month === 0) {
    month = 12;
    year--;
  }
  // month is now 1-indexed (1=Jan, 12=Dec) for APMI submission
  const asOnDate = `${year}-${month}-${new Date(year, month, 0).getDate()}`;

  const params = new URLSearchParams();
  params.append('strategyname', strategy);
  params.append('servicetype', 'D');
  params.append('', '');
  params.append('', '');
  params.append('fromMonth', String(month));
  params.append('fromYears', String(year));
  params.append('asOnDate', asOnDate);

  const res = await fetch('https://www.apmiindia.org/apmi/welcomeiaperformance.htm?action=loadIAReport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://www.apmiindia.org/' },
    body: params.toString(),
    cache: 'no-store',
  });
  if (!res.ok) {
    console.error(`[sitemap-pms] ${strategy}: APMI fetch failed ${res.status}`);
    return [];
  }
  const html = await res.text();

  // Use cheerio for reliable field extraction, matching app/api/pms-data/route.js's scrapeAPMI pattern.
  // Field indices: tds[0]=portfolioManager, tds[1]=strategyName+apmiLink, tds[2]=aum
  const $ = cheerio.load(html);
  const rows = [];

  // Parse rows, skipping header (which has only th elements)
  $('table tr').each((index, element) => {
    const tds = $(element).find('td');
    if (tds.length < 12) {
      return; // Skip header and malformed rows
    }

    const href = $(tds[1]).find('a').attr('href');
    const iaidMatch = href ? href.match(/IAID=(\d+)/) : null;
    if (!iaidMatch) {
      return;
    }

    const aum = parseVal($(tds[2]).text());
    rows.push({
      iaid: iaidMatch[1],
      aum: aum,
    });
  });

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
