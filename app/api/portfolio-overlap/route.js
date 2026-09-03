/**
 * app/api/portfolio-overlap/route.js
 *
 * On-demand (button-click-triggered, never auto-fetched) pairwise stock
 * overlap analysis across a user's own portfolio holdings. Pro-gated --
 * free users never reach this route (the client shows a paywall instead),
 * but the check is enforced server-side too since this does the same
 * "expensive external call" work as app/api/fund-detail/[code]/route.js's
 * Pro branch (one Groww fetch per fund via getHoldingsData).
 *
 * POST body: { funds: [{ code, name }, ...] } -- the caller's own already-
 * loaded portfolio holdings (see app/portfolio/page.jsx's displayHoldings).
 * Overlap = sum of min(weightInFundA, weightInFundB) per shared stock,
 * matched by Groww's stockSlug (falls back to a lowercased security name
 * when a slug is missing) -- the standard weighted-overlap metric.
 */

import { auth } from '@/auth';
import { getUserPlan } from '@/lib/plan';
import { getHoldingsData } from '@/lib/holdingsLookup';
import { checkRateLimitSafe, rateLimitResponse } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// Caps the O(n^2) pair count and the number of parallel Groww fetches a
// single click can trigger -- a household with more distinct equity/hybrid
// funds than this gets the largest-by-value ones (client sorts before
// sending), which is also the more useful answer for a real portfolio.
const MAX_FUNDS = 15;

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: 'Sign in required' }, { status: 401 });
    }

    const isPro = Boolean(
      session.user.role === 'admin' ||
      session.user.plan === 'pro' ||
      session.user.plan === 'pro_lifetime' ||
      session.user.plan === 'lifetime' ||
      session.user.isPro ||
      (session.user.id && (await getUserPlan(session.user.id)) === 'pro')
    );
    if (!isPro) {
      return Response.json({ error: 'Pro plan required for overlap analysis' }, { status: 403 });
    }

    if (session.user.role !== 'admin' && session.user.role !== 'distributor') {
      const rl = await checkRateLimitSafe(`user:${session.user.id}`, 'portfolio-overlap');
      if (rl.limited) return rateLimitResponse(rl);
    }

    const body = await req.json().catch(() => null);
    const inputFunds = Array.isArray(body?.funds) ? body.funds : [];

    const seen = new Set();
    const targets = [];
    let droppedNoCode = 0;
    for (const f of inputFunds) {
      if (!f?.code || !f?.name) { droppedNoCode++; continue; }
      const code = String(f.code);
      if (seen.has(code)) continue;
      seen.add(code);
      targets.push({ code, name: f.name });
      if (targets.length >= MAX_FUNDS) break;
    }

    if (targets.length < 2) {
      return Response.json({
        pairs: [],
        fundsAnalyzed: 0,
        fundsSkipped: droppedNoCode,
        error: targets.length === 0
          ? 'No holdings with a resolvable fund code to compare'
          : 'Need at least 2 comparable funds to check overlap',
      });
    }

    const capped = inputFunds.length - droppedNoCode - targets.length;

    const results = await Promise.all(targets.map(async (f) => {
      try {
        const data = await getHoldingsData(f.code, f.name);
        return { code: f.code, name: f.name, holdings: data?.holdings || [] };
      } catch (err) {
        console.error('[api/portfolio-overlap] holdings lookup failed for', f.code, err.message);
        return { code: f.code, name: f.name, holdings: [] };
      }
    }));

    const withHoldings = results.filter((r) => r.holdings.length > 0);
    const noHoldingsCount = results.length - withHoldings.length;

    const pairs = [];
    for (let i = 0; i < withHoldings.length; i++) {
      for (let j = i + 1; j < withHoldings.length; j++) {
        const a = withHoldings[i], b = withHoldings[j];
        const bMap = new Map(
          b.holdings.map((h) => [h.stockSlug || h.securityName.toLowerCase(), h.weightagePct])
        );
        let overlapPct = 0;
        const shared = [];
        for (const h of a.holdings) {
          const key = h.stockSlug || h.securityName.toLowerCase();
          const bWeight = bMap.get(key);
          if (bWeight != null) {
            const ov = Math.min(h.weightagePct, bWeight);
            overlapPct += ov;
            shared.push({ name: h.securityName, weightA: h.weightagePct, weightB: bWeight });
          }
        }
        if (shared.length === 0) continue; // zero-overlap pairs add noise, not signal
        shared.sort((x, y) => Math.min(y.weightA, y.weightB) - Math.min(x.weightA, x.weightB));
        pairs.push({
          fundA: a.name,
          fundB: b.name,
          overlapPct: +overlapPct.toFixed(1),
          sharedCount: shared.length,
          topShared: shared.slice(0, 6),
        });
      }
    }
    pairs.sort((x, y) => y.overlapPct - x.overlapPct);

    return Response.json({
      pairs,
      fundsAnalyzed: withHoldings.length,
      fundsSkipped: droppedNoCode + Math.max(0, capped) + noHoldingsCount,
      asOf: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[api/portfolio-overlap]', err.message);
    return Response.json({ error: 'Could not analyze overlap right now' }, { status: 500 });
  }
}
