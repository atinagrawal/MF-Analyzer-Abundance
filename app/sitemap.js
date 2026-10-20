import { getSitemapEntries, getHomeSitemapEntries, getScreenerCategorySitemapEntries, getArticlesSitemapEntries, getSifReportsCategorySitemapEntries, getCompareSitemapEntries, getFundsCategorySitemapEntries, getStocksInFundsSitemapEntries } from '@/lib/metadata';
import { CURATED_CATEGORIES } from './screener/screenerContent';
import { ARTICLES } from '@/lib/articles';
import { listSifCategories } from '@/lib/sifReports';
import { POPULAR_COMPARISONS } from '@/lib/compareSlug';
import pool from '@/lib/db';

// One row per distinct stock -- MAX(ticker) picks a non-null ticker if any
// row for that stock_slug has one (aggregates skip NULLs), falling back to
// the slug itself otherwise. Mirrors (closely enough for a sitemap URL,
// not byte-identical) app/stocks-in-funds/[ticker]/page.jsx's own
// canonicalTicker-else-canonicalSlug tie-break.
async function listStockInFundsCodes() {
  const { rows } = await pool.query(`
    SELECT COALESCE(MAX(ticker), stock_slug) AS code
    FROM stock_fund_holdings
    WHERE stock_slug IS NOT NULL
    GROUP BY stock_slug
  `);
  return rows.map((r) => r.code).filter(Boolean);
}

/**
 * app/sitemap.js — Dynamic sitemap generation
 *
 * Next.js automatically serves this at /sitemap.xml
 * All page entries come from lib/metadata.js, so adding a new page
 * only requires adding it to PAGE_META — the sitemap updates automatically.
 *
 * revalidate: search-engine crawlers hit /sitemap.xml often, and this
 * route only became async (a real DB query via listSifCategories) in
 * this change -- without ISR it would become force-dynamic by default,
 * re-querying on every crawl. Same CPU-limit reasoning as this
 * session's earlier force-dynamic -> ISR sweep.
 */
export const revalidate = 3600;

export default async function sitemap() {
  // Never let a DB hiccup take down the whole sitemap -- every other
  // entry here is static/sync, only the SIF category list and the stock
  // codes need a query.
  const sifCategories = await listSifCategories().catch(() => []);
  const stockCodes = await listStockInFundsCodes().catch(() => []);
  return [
    ...getSitemapEntries(),
    ...getHomeSitemapEntries(),
    ...getScreenerCategorySitemapEntries(CURATED_CATEGORIES),
    ...getArticlesSitemapEntries(ARTICLES),
    ...getSifReportsCategorySitemapEntries(sifCategories),
    ...getCompareSitemapEntries(POPULAR_COMPARISONS),
    ...getFundsCategorySitemapEntries(CURATED_CATEGORIES),
    ...getStocksInFundsSitemapEntries(stockCodes),
  ];
}
