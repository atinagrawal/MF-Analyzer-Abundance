/**
 * lib/pmsFactsheetsCache.js
 *
 * Read side for scripts/sync_pms_factsheets.js's R2 document -- strategy
 * factsheet/presentation PDFs scraped from AMC-owned websites (NOT APMI;
 * that's lib/pmsScrapers.js's concern). Same createR2JsonCache pattern as
 * lib/nfoData.js.
 *
 * matchProvider() maps APMI's own `providerName` field (from
 * getPmsDetailsCached(), e.g. "Carnelian Capital Advisors LLP") to one of
 * the small number of providers this sync covers, via a plain
 * case-insensitive substring check against each provider's
 * `matchFragments` -- deliberately simple rather than a fuzzy matcher,
 * since there are only 4 entries to keep in sync and a wrong match here
 * would misattach one AMC's factsheets to another's page.
 */

import { createR2JsonCache } from './r2JsonCache.js';

const getPmsFactsheetsCached = createR2JsonCache('pms-factsheets.json', 60 * 60 * 1000);

/**
 * @returns {Promise<{syncedAt: string|null, providers: object}>}
 */
export async function getPmsFactsheetsData() {
  const data = await getPmsFactsheetsCached();
  return data || { syncedAt: null, providers: {} };
}

/**
 * @param {string} providerName e.g. "Carnelian Capital Advisors LLP" (APMI's own field)
 * @returns {Promise<Array<{strategyName: string, docType: string, period: string|null, title: string, url: string}>|null>}
 *   null when no known provider matches -- callers must treat this as
 *   "no factsheets section for this page", not an error.
 */
export async function getFactsheetsForProvider(providerName) {
  if (!providerName) return null;
  const data = await getPmsFactsheetsData();
  const name = providerName.toLowerCase();

  for (const provider of Object.values(data.providers || {})) {
    const fragments = provider.matchFragments || [];
    if (fragments.some((f) => name.includes(f.toLowerCase()))) {
      return provider.documents || [];
    }
  }
  return null;
}
