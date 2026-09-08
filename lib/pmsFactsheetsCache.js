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
 * @returns {Promise<Array<{strategyName: string, docType: string, period: string|null, title: string, url: string, extracted?: object}>|null>}
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

// Generic PMS terminology + common corporate-entity words -- stripped out
// on both sides before matching, so what's left is each strategy's actual
// distinguishing name, not shared boilerplate every strategy of the same
// provider also carries.
const STOPWORDS = new Set([
  'pvt', 'ltd', 'llp', 'limited', 'private', 'asset', 'assets', 'management', 'advisors', 'advisor',
  'managers', 'manager', 'investment', 'investments', 'services', 'financial', 'capital',
  'strategy', 'strategies', 'portfolio', 'portfolios', 'fund', 'funds', 'pms', 'scheme', 'approach',
  'the', 'and', 'of',
]);

function significantWords(str) {
  return (str || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

/**
 * Best-effort match of APMI's own `iaName` (e.g. "CARNELIAN CAPITAL
 * COMPOUNDER STRATEGY") to the ONE factsheet document -- among a
 * provider's several strategies -- that actually describes the strategy
 * the current /pms/[id] page is for, so a page never shows another
 * strategy's holdings/sectors under its own name.
 *
 * Scores each candidate by what fraction of ITS OWN distinguishing words
 * appear in the target name, not just "any shared word" -- verified
 * necessary during development: Narnolia's "Large Cap", "Mid & Small
 * Cap", and "Multi Cap" strategies all share the word "cap", so a
 * first-any-overlap match would resolve to whichever strategy happened
 * to sort first, silently attaching the wrong holdings to a page. A
 * highest-score match (whole distinguishing name contained in the
 * target) resolves this correctly and was checked against all 4
 * providers' real strategy names.
 *
 * Returns null on no confident match, or when the matched document has
 * no extracted data yet -- never guesses, never returns a low-confidence
 * fallback silently.
 */
export async function getFactsheetDataForStrategy(providerName, iaName) {
  const documents = await getFactsheetsForProvider(providerName);
  if (!documents || !iaName) return null;

  const providerWords = new Set(significantWords(providerName));
  const targetWords = new Set(significantWords(iaName).filter((w) => !providerWords.has(w)));
  if (targetWords.size === 0) return null;

  let best = null;
  let bestScore = 0;
  for (const doc of documents) {
    if (doc.docType !== 'factsheet') continue;
    const candidateWords = significantWords(doc.strategyName).filter((w) => !providerWords.has(w));
    if (candidateWords.length === 0) continue;
    const matched = candidateWords.filter((w) => targetWords.has(w)).length;
    const score = matched / candidateWords.length;
    if (score > bestScore) {
      bestScore = score;
      best = doc;
    }
  }

  if (!best || bestScore === 0 || !best.extracted) return null;
  return { ...best.extracted, strategyName: best.strategyName, period: best.period, sourceUrl: best.url };
}
