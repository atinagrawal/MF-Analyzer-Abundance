/**
 * app/api/sif-nav/route.js
 *
 * GET /api/sif-nav
 *
 * Returns all SIF schemes with latest NAV, flattened from AMFI's nested format.
 * Cached in Vercel Blob for 4 hours (SIF NAVs update end-of-day).
 *
 * Response shape:
 *   { schemes: [...], count: N, nav_date: "22-Apr-2026", cached_at: ISO }
 *
 * Each scheme:
 *   { sif_name, sif_id, scheme_id, nav_name, isin_po, isin_ri,
 *     type, category, nav, nav_date }
 */

import { r2Get, r2Put } from '@/lib/r2';
import { getSifAumMap } from '@/lib/holdingsLookup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BLOB_KEY = 'sif-nav/latest.json';
const TTL_MS   = 4 * 60 * 60 * 1000;  // 4 hours

// ── Fetch from AMFI and flatten ──────────────────────────────────────────────

async function fetchFromAMFI() {
  const res = await fetch('https://www.amfiindia.com/api/sif-latest-nav', {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MFCalc/2.0)' },
    signal:  AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`AMFI SIF endpoint returned ${res.status}`);
  const data = await res.json();

  const schemes = [];
  for (const typeGroup of data.data ?? []) {
    for (const cat of typeGroup.categories ?? []) {
      for (const grp of cat.groups ?? []) {
        for (const s of grp.schemes ?? []) {
          // Filter out Direct plans — screener shows Regular plans only
          if (/direct/i.test(s.NavName)) continue;
          schemes.push({
            sif_name:  s.SIFName,
            sif_id:    s.sifId,
            scheme_id: s.Sd_Id,
            nav_name:  s.NavName,
            isin_po:   s.ISINPO   || null,
            isin_ri:   s.ISINRI   || null,
            type:      s.type,
            category:  s.category,
            nav:       parseFloat(s.NetAssetValue),
            nav_date:  s.Date,
          });
        }
      }
    }
  }

  const sifAumMap = await getSifAumMap();
  for (const scheme of schemes) {
    const aumRecord = sifAumMap[scheme.scheme_id] || null;
    scheme.aumCr = aumRecord?.aumCr ?? null;
    scheme.aumAsOf = aumRecord?.asOf ?? null;
  }

  return schemes;
}

// ── Blob helpers ─────────────────────────────────────────────────────────────

async function blobGet() {
  try {
    return await r2Get(BLOB_KEY);
  } catch { return null; }
}

async function blobPut(payload) {
  try {
    await r2Put(BLOB_KEY, JSON.stringify(payload));
  } catch { /* fire-and-forget */ }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export async function GET() {
  // 1. Try cache
  const cached = await blobGet();
  if (cached?.cached_at) {
    const age = Date.now() - new Date(cached.cached_at).getTime();
    if (age < TTL_MS) {
      return Response.json(cached, {
        headers: {
          'X-Cache':       'HIT',
          'Cache-Control': `max-age=${Math.floor((TTL_MS - age) / 1000)}`,
        },
      });
    }
  }

  // 2. Fetch fresh
  try {
    const schemes = await fetchFromAMFI();
    const payload = {
      schemes,
      count:     schemes.length,
      nav_date:  schemes[0]?.nav_date ?? null,
      cached_at: new Date().toISOString(),
    };

    blobPut(payload); // fire-and-forget

    return Response.json(payload, {
      headers: {
        'X-Cache':       'MISS',
        'Cache-Control': `max-age=${TTL_MS / 1000}`,
      },
    });
  } catch (err) {
    console.error('[sif-nav]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 502 });
  }
}
