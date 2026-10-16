/**
 * lib/investLinksCache.js
 *
 * Read side for the R2-cached document written by scripts/sync_invest_links.js
 * -- AMC-provided "direct invest" deep links, keyed by ISIN and by normalized
 * scheme name. Mirrors the createR2JsonCache pattern used throughout (see
 * lib/nfoData.js, lib/pmsFactsheetsCache.js).
 *
 * Two lookups because the two callers key differently:
 *   - MF screener rows (lib/screenerData.js) carry a real ISIN from AMFI's
 *     NAVAll feed -- byIsin is the exact, unambiguous match.
 *   - A brand-new NFO (app/nfo/[slug]/page.jsx) has no ISIN at all (AMFI's
 *     NFO feed doesn't carry one) until the scheme is allotted and shows up
 *     in mf_screener -- which can be AFTER its NFO window closes. The AMC's
 *     own provider fetch (scripts/sync_invest_links.js) already resolved
 *     each scheme's ISIN+name together while it was still an NFO, so
 *     bySchemeName (normalized, exact) is what makes an invest link appear
 *     during the window it's actually useful.
 */

import { createR2JsonCache } from './r2JsonCache.js';
import { getNfoInvestLink } from './nfoInvestLinks.js';

const getInvestLinksCached = createR2JsonCache('amc-invest-links.json', 60 * 60 * 1000);

function normaliseSchemeName(name) {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Flattened { isin: link } map across every AMC -- for a caller (the MF
 * screener dataset) that's about to look up hundreds of funds at once and
 * shouldn't pay a per-fund async R2-cache round trip for each one.
 * @returns {Promise<Record<string,string>>}
 */
export async function getAllInvestLinksByIsin() {
  const doc = await getInvestLinksCached();
  if (!doc?.amcs) return {};
  const merged = {};
  for (const amc of Object.values(doc.amcs)) {
    Object.assign(merged, amc.byIsin || {});
  }
  return merged;
}

/**
 * @param {string} isin
 * @returns {Promise<string|null>}
 */
export async function getInvestLinkByIsin(isin) {
  if (!isin) return null;
  const all = await getAllInvestLinksByIsin();
  return all[isin] || null;
}

/**
 * @param {string} schemeName
 * @returns {Promise<string|null>}
 */
export async function getInvestLinkBySchemeName(schemeName) {
  if (!schemeName) return null;
  const doc = await getInvestLinksCached();
  if (!doc?.amcs) return null;
  const n = normaliseSchemeName(schemeName);
  for (const amc of Object.values(doc.amcs)) {
    if (amc.bySchemeName?.[n]) return amc.bySchemeName[n];
  }
  return null;
}

/**
 * Resolver for an NFO entry (shape from lib/nfoData.js): tries the
 * automated per-AMC sync first (covers any provider in
 * scripts/sync_invest_links.js's PROVIDERS list, present or future), then
 * falls back to the hand-maintained lib/nfoInvestLinks.js slug map -- kept
 * for AMCs with no such API, or to pin a specific curated link.
 * @param {{slug: string, schemeName: string}} entry
 * @returns {Promise<string|null>}
 */
export async function getInvestLinkForNfo(entry) {
  if (!entry) return null;
  const auto = await getInvestLinkBySchemeName(entry.schemeName);
  if (auto) return auto;
  return getNfoInvestLink(entry.slug);
}

/**
 * Every open NFO (mf + sif) that currently has a resolvable invest link --
 * what a homepage/landing promo surfaces, so it never needs manual upkeep
 * beyond scripts/sync_invest_links.js picking up a new AMC or scheme.
 * @param {object[]} openEntries  entries with status 'open' from getNfoData()
 * @returns {Promise<Array<object & {investLink: string}>>}
 */
export async function getPromotableOpenNfos(openEntries) {
  const results = [];
  for (const entry of openEntries || []) {
    const investLink = await getInvestLinkForNfo(entry);
    if (investLink) results.push({ ...entry, investLink });
  }
  return results;
}
