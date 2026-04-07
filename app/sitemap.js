import { getSitemapEntries, getHomeSitemapEntries } from '@/lib/metadata';

/**
 * app/sitemap.js — Dynamic sitemap generation
 *
 * Next.js automatically serves this at /sitemap.xml
 * All page entries come from lib/metadata.js, so adding a new page
 * only requires adding it to PAGE_META — the sitemap updates automatically.
 */
export default function sitemap() {
  return [
    ...getSitemapEntries(),
    ...getHomeSitemapEntries(),
  ];
}
