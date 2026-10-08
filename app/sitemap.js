import { getSitemapEntries, getHomeSitemapEntries, getScreenerCategorySitemapEntries, getArticlesSitemapEntries, getSifReportsCategorySitemapEntries } from '@/lib/metadata';
import { CURATED_CATEGORIES } from './screener/screenerContent';
import { ARTICLES } from '@/lib/articles';
import { listSifCategories } from '@/lib/sifReports';

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
  // entry here is static/sync, only the SIF category list needs a query.
  const sifCategories = await listSifCategories().catch(() => []);
  return [
    ...getSitemapEntries(),
    ...getHomeSitemapEntries(),
    ...getScreenerCategorySitemapEntries(CURATED_CATEGORIES),
    ...getArticlesSitemapEntries(ARTICLES),
    ...getSifReportsCategorySitemapEntries(sifCategories),
  ];
}
