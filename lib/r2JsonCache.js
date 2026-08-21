/**
 * lib/r2JsonCache.js
 *
 * Factory for a small in-memory-cached getter over a single R2-stored JSON
 * object -- the pattern used by scripts/sync_amfi_aum.js, sync_sif_aum.js,
 * and sync_scheme_riskometer.js's synced files (previously statically
 * imported from data/*.json, committed to git and bundled at build time;
 * see the R2 migration notes in those sync scripts). Only overwrites the
 * cached value on a SUCCESSFUL r2Get -- a transient R2 failure serves the
 * last-known-good value (or null if nothing has ever succeeded on this
 * warm instance yet) rather than throwing or caching an empty result.
 */

import { r2Get } from './r2.js';

export function createR2JsonCache(key, ttlMs = 60 * 60 * 1000) {
  let cache = null;
  let cacheTime = 0;

  return async function get() {
    const now = Date.now();
    if (cache && (now - cacheTime) < ttlMs) return cache;
    try {
      const data = await r2Get(key);
      if (data != null) {
        cache = data;
        cacheTime = now;
      }
    } catch (e) {
      console.warn(`[r2JsonCache] Warning fetching ${key} from R2:`, e.message);
    }
    return cache;
  };
}
