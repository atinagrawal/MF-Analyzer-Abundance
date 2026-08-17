/**
 * app/api/proposal-studio/holdings/route.js
 *
 * GET /api/proposal-studio/holdings?amfiCode=118955&schemeName=HDFC%20Flexi%20Cap%20Fund
 *
 * Public, unauthenticated wrapper around lib/holdingsLookup.js's
 * getHoldingsData() -- always returns FULL holdings, deliberately. This
 * route is used by Proposal Studio's editor (owner-only, needs full data)
 * and its public share-link viewers (gated by link possession, not by the
 * viewer's own plan status), neither of which should be limited by the
 * requesting browser's personal Pro entitlement.
 *
 * Server-rendered pages that DO need to gate holdings by the viewer's own
 * plan (the Fund and SIF detail pages) call getHoldingsData() directly
 * in-process instead of hitting this route, so they can apply
 * truncateHoldingsForFreeTier() before anything reaches a non-Pro browser.
 */

import { getHoldingsData } from '@/lib/holdingsLookup';
import { checkRateLimitSafe, rateLimitResponse, getClientIp } from '@/lib/rateLimit';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const amfiCode = searchParams.get('amfiCode');
  const schemeName = searchParams.get('schemeName');

  if (!amfiCode || !schemeName) {
    return Response.json({ error: 'amfiCode and schemeName are required' }, { status: 400 });
  }

  // Public, unauthenticated route (see the file header comment) -- keyed
  // by IP rather than a user id, since there's often no signed-in user at
  // all (a share-link viewer). See
  // docs/superpowers/plans/2026-08-17-per-user-rate-limiter.md's
  // mid-planning scope correction for why this route differs from
  // app/api/distributor/route.js's user-keyed check.
  const ip = getClientIp(request);
  const rl = await checkRateLimitSafe(`ip:${ip}`, 'proposal-holdings-lookup');
  if (rl.limited) return rateLimitResponse(rl);

  try {
    const data = await getHoldingsData(amfiCode, schemeName);
    if (!data) return Response.json({ error: 'No holdings data found for this fund' }, { status: 404 });
    return Response.json(data);
  } catch (err) {
    console.error('[proposal-studio/holdings]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
