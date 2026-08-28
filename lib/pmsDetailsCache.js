/**
 * lib/pmsDetailsCache.js
 *
 * Three-layer cache (in-memory Map -> R2 blob -> live scrape) around
 * lib/pmsScrapers.js's fetchPmsDetails(), same pattern as
 * app/api/pms-benchmark/route.js and lib/apmiProviderMap.js. Long TTL
 * (30d memory / 90d blob) since these fields (fees, inception date, etc.)
 * change rarely.
 *
 * Exported as a plain lib function (not left inline in the route file) so
 * both app/api/pms-details/route.js's own GET handler AND
 * app/api/pms-detail/[id]/route.js's composing, session-gated route
 * (Task 4) can call it directly, in-process -- avoiding an HTTP self-fetch
 * and any route-importing-route fragility.
 */

import { fetchPmsDetails } from '@/lib/pmsScrapers';
import { r2Get, r2Put } from '@/lib/r2';

const MEM_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days
const BLOB_TTL_MS = 90 * 24 * 60 * 60 * 1000;  // 90 days
const BLOB_BASE = 'pms-details-cache';

/** @type {Map<string, { data: object, ts: number }>} */
const memCache = new Map();
/** @type {Map<string, Promise<object|null>>} */
const inflight = new Map();

function isFresh(ts, ttlMs) {
  return ts && Date.now() - ts < ttlMs;
}

async function readFromBlob(iaid) {
  try {
    const payload = await r2Get(`${BLOB_BASE}/${iaid}.json`);
    if (!payload) return null;
    if (!isFresh(payload.ts, BLOB_TTL_MS)) return null;
    return payload;
  } catch (err) {
    console.warn('[pmsDetailsCache] Blob read error:', err.message);
    return null;
  }
}

async function writeToBlob(iaid, data) {
  try {
    await r2Put(`${BLOB_BASE}/${iaid}.json`, JSON.stringify({ data, ts: Date.now() }));
  } catch (err) {
    console.warn('[pmsDetailsCache] Blob write error:', err.message);
  }
}

export async function getPmsDetailsCached(iaid) {
  const key = String(iaid);

  const mem = memCache.get(key);
  if (isFresh(mem?.ts, MEM_TTL_MS)) return mem.data;

  const blob = await readFromBlob(key);
  if (blob) {
    memCache.set(key, { data: blob.data, ts: Date.now() });
    return blob.data;
  }

  if (inflight.has(key)) return inflight.get(key);

  const fetchPromise = (async () => {
    const data = await fetchPmsDetails(key);
    const ts = Date.now();
    memCache.set(key, { data, ts });
    if (data) writeToBlob(key, data); // fire-and-forget, only cache real hits
    inflight.delete(key);
    return data;
  })();
  inflight.set(key, fetchPromise);
  fetchPromise.catch(() => inflight.delete(key));

  return fetchPromise;
}

/** Exposed for the route's stale-on-error fallback (Step 2 below). */
export async function getStalePmsDetails(iaid) {
  const mem = memCache.get(String(iaid));
  if (mem) return mem.data;
  const blobStale = await r2Get(`${BLOB_BASE}/${iaid}.json`).catch(() => null);
  return blobStale ? blobStale.data : null;
}
