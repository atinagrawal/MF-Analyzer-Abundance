/**
 * app/api/distributor/route.js
 *
 * GET /api/distributor?arn=251838
 *
 * Looks up an AMFI-registered mutual fund distributor by ARN via AMFI's own
 * (undocumented) distributor-agent search API, cached per-ARN in R2 for 30
 * days -- registration data barely changes; KYD/expiry status is the only
 * field that can shift meaningfully, and a month is an accepted staleness
 * bound for that (product decision, not a technical limit) in exchange for
 * far fewer AMFI calls and much lower latency for callers.
 *
 * Response shape: { found: boolean, distributor: {...} | null, cachedAt: ISO }
 * On upstream failure: serves a stale cache if one exists (a temporary AMFI
 * outage shouldn't make a caller treat a known-good distributor as
 * unverifiable); 502 only when there's no cache at all, fresh or stale.
 *
 * See docs/superpowers/specs/2026-08-16-amfi-distributor-proposal-studio-design.md.
 */

import { auth } from '@/auth';
import { r2Get, r2Put } from '@/lib/r2';
import { extractArnDigits, fetchDistributorByArn } from '@/lib/amfiDistributor';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const cacheKeyFor = (arn) => `distributor-arn/${arn}.json`;

async function blobGet(key) {
  try {
    return await r2Get(key);
  } catch {
    return null;
  }
}

async function blobPut(key, payload) {
  try {
    await r2Put(key, JSON.stringify(payload));
  } catch {
    /* fire-and-forget */
  }
}

export async function GET(req) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const arn = extractArnDigits(searchParams.get('arn') || '');
  if (!arn) {
    return Response.json({ error: 'Missing or malformed arn parameter' }, { status: 400 });
  }

  const key = cacheKeyFor(arn);
  const cached = await blobGet(key);

  // 1. Fresh cache hit
  if (cached?.cachedAt) {
    const age = Date.now() - new Date(cached.cachedAt).getTime();
    if (age < TTL_MS) {
      return Response.json(cached, {
        headers: {
          'X-Cache':       'HIT',
          'Cache-Control': `max-age=${Math.floor((TTL_MS - age) / 1000)}`,
        },
      });
    }
  }

  // 2. Cache miss or stale -- fetch fresh
  try {
    const distributor = await fetchDistributorByArn(arn);
    const payload = {
      found:     distributor !== null,
      distributor,
      cachedAt:  new Date().toISOString(),
    };

    blobPut(key, payload); // fire-and-forget

    return Response.json(payload, {
      headers: {
        'X-Cache':       'MISS',
        'Cache-Control': `max-age=${TTL_MS / 1000}`,
      },
    });
  } catch (err) {
    console.error('[distributor]', err.name, err.message);
    // A stale cache is still better than a hard failure.
    if (cached) {
      return Response.json(cached, { headers: { 'X-Cache': 'STALE' } });
    }
    return Response.json({ error: err.message }, { status: 502 });
  }
}
