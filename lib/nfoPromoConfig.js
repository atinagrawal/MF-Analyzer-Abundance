/**
 * lib/nfoPromoConfig.js
 *
 * Read side for the admin-controlled homepage NFO promo banner setting
 * (R2 key nfo-promo-config.json, written by app/api/admin/nfo-promo/route.js
 * from app/admin/NfoPromoTab.jsx).
 *
 * Shape: { mode: 'auto'|'manual'|'off', slug: string|null, updatedAt, updatedBy }
 *   - 'auto'   (default, and the fallback when no config has been set yet):
 *     app/page.js picks the soonest-closing open NFO that has a resolvable
 *     invest link (see lib/investLinksCache.js).
 *   - 'manual': feature exactly the NFO named by `slug`. If that NFO is no
 *     longer open or has lost its invest link, app/page.js falls back to
 *     'auto' behaviour rather than showing nothing or a broken banner.
 *   - 'off': never show the banner, regardless of what's open.
 *
 * Short TTL (vs. the 1h default most R2JsonCache callers use) so an admin's
 * change is reflected on the live site within a couple of minutes, not up
 * to an hour.
 */

import { createR2JsonCache } from './r2JsonCache.js';

const getConfigCached = createR2JsonCache('nfo-promo-config.json', 2 * 60 * 1000);

const DEFAULT_CONFIG = { mode: 'auto', slug: null, updatedAt: null, updatedBy: null };

/**
 * @returns {Promise<{mode: 'auto'|'manual'|'off', slug: string|null, updatedAt: string|null, updatedBy: string|null}>}
 */
export async function getNfoPromoConfig() {
  const doc = await getConfigCached();
  return doc || DEFAULT_CONFIG;
}
