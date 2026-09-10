/**
 * lib/pmsPreferredCache.js
 *
 * Read side for scripts/compute_preferred_pms.js's R2 document -- see
 * docs/superpowers/specs/2026-09-09-pms-preferred-strategies-design.md.
 * Same createR2JsonCache pattern as lib/pmsFactsheetsCache.js and
 * lib/nfoData.js. 24h TTL: the underlying doc only changes once a month
 * via the script, but a short TTL means a manual re-run during testing is
 * picked up promptly rather than waiting out a long cache.
 */

import { createR2JsonCache } from './r2JsonCache.js';

const getPmsPreferredCached = createR2JsonCache('pms-preferred-strategies.json', 24 * 60 * 60 * 1000);

/**
 * @returns {Promise<{
 *   computedAt: string,
 *   asOnMonth: string|null,
 *   factsheetAsOfRange: {earliest: string, latest: string}|null,
 *   criteria: {quartilePeriodPrimary: string, fallbackRule: string, dataSources: string},
 *   strategies: Array<object>,
 *   insights: object
 * }|null>}
 *   null only when the script has genuinely never run / written successfully
 *   -- callers must render a "coming soon" state for that case, never a 404.
 */
export async function getPreferredStrategies() {
  return getPmsPreferredCached();
}
