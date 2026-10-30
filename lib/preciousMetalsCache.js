/**
 * lib/preciousMetalsCache.js
 *
 * Server-side cache for live precious metals rates, shared by the
 * /gold-silver-rates page (SSR first paint) and its polling API route.
 * Visitors' browsers never call the upstream refinery endpoint directly
 * -- only this cache does, on a short TTL -- so thousands of concurrent
 * page views never translate into thousands of upstream requests (the
 * same reasoning lib/bseIndex.js documents for BSE).
 *
 * Layers: in-memory (per warm serverless instance) -> R2 blob (shared
 * across instances / cold starts) -> live fetch. A live-fetch failure
 * falls back to the last-known-good value from either layer rather than
 * throwing -- "stale-over-wrong", same convention as everywhere else in
 * this app that depends on a third-party feed.
 */

import { r2Get, r2Put } from './r2.js';
import { fetchLiveRates, deriveConversions } from './preciousMetalsRates.js';

const R2_KEY = 'precious-metals/live-rates.json';
const TTL_MS = 3 * 60 * 1000; // 3 min -- short enough to stay close to live, long enough that a page full of concurrent visitors shares one upstream hit

let memCache = null; // { rates, conversions, ts }

async function readR2Fallback() {
  try {
    const blob = await r2Get(R2_KEY);
    return blob || null;
  } catch (err) {
    console.warn('[preciousMetalsCache] R2 read failed:', err.message);
    return null;
  }
}

async function writeR2(payload) {
  try {
    await r2Put(R2_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('[preciousMetalsCache] R2 write failed:', err.message);
  }
}

/** Returns { rates, conversions, ts, stale }. Never throws. */
export async function getCachedPreciousMetalsRates() {
  const now = Date.now();
  if (memCache && now - memCache.ts < TTL_MS) {
    return { ...memCache, stale: false };
  }

  try {
    const rates = await fetchLiveRates();
    const conversions = deriveConversions(rates);
    const payload = { rates, conversions, ts: Date.now() };
    memCache = payload;
    await writeR2(payload);
    return { ...payload, stale: false };
  } catch (err) {
    console.warn('[preciousMetalsCache] Live fetch failed, falling back:', err.message);
    if (memCache) return { ...memCache, stale: true };
    const blob = await readR2Fallback();
    if (blob) {
      memCache = blob;
      return { ...blob, stale: true };
    }
    throw err; // nothing cached anywhere and the live fetch failed -- genuinely nothing to serve
  }
}
