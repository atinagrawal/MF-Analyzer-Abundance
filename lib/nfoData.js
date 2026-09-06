/**
 * lib/nfoData.js
 *
 * Read side for the NFO tracker's R2-cached document written by
 * scripts/sync_amfi_nfo.js. Mirrors the createR2JsonCache pattern already
 * used for amfi-aum.json/sif-aum.json -- in-memory cached, R2-backed, no
 * Postgres involved. See docs/superpowers/specs/
 * 2026-09-06-nfo-tracker-design.md.
 */

import { createR2JsonCache } from './r2JsonCache.js';

const getNfoDataCached = createR2JsonCache('amfi-nfo.json', 60 * 60 * 1000);

/**
 * @returns {Promise<{syncedAt: string|null, mf: object[], sif: object[]}>}
 */
export async function getNfoData() {
  const data = await getNfoDataCached();
  return data || { syncedAt: null, mf: [], sif: [] };
}

/**
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
export async function getNfoBySlug(slug) {
  if (!slug) return null;
  const data = await getNfoData();
  const all = [...(data.mf || []), ...(data.sif || [])];
  return all.find((e) => e.slug === slug) || null;
}
