/**
 * app/api/portfolio-peer-rank/route.js
 *
 * The Health Score's 4th component: for each held fund, where does its
 * historical return rank among its real peers -- not "is this a good
 * fund" (this site never rates funds), just a factual percentile on
 * already-published CAGR figures, same category of fact as the return
 * numbers already shown everywhere on the site.
 *
 * Free/instant, unlike Overlap Analysis: this is a plain mf_screener
 * query plus in-JS grouping, no external vendor fetch, so it isn't
 * Pro-gated or on-demand -- it can run automatically alongside the
 * Asset Mix / Fund House components.
 *
 * Peer group: for a Sectoral/Thematic holding, peers are funds sharing
 * the same classifySectoralTheme() sub-theme (AMFI files ALL sectoral
 * funds under one bucket regardless of sector -- a Banking fund and a
 * Pharma fund aren't comparable). For everything else, peers are funds
 * matching via the same matchCategory/normalizeCategory the screener's
 * own filter already uses.
 *
 * Caching note (this is the second attempt at this route -- the first
 * caused a real production incident, see git history on this file):
 * this route fires automatically on every portfolio page view, for
 * every user, unlike every other pool.query() call on this page, which
 * is one-time-per-session or on-demand. The first version cached the
 * universe query in a plain module-level variable, which does NOT
 * share across concurrent or cold serverless invocations -- it only
 * helps the narrow case of one warm instance serving back-to-back
 * requests, and did nothing under the real concurrent load that caused
 * the incident (the underlying database is Prisma Postgres, which
 * lib/rateLimit.js already documents as having an unresolved connection-
 * limit problem serious enough that this site's own rate limiter is
 * disabled because of it -- see that file's comment).
 *
 * This version uses unstable_cache instead: Next.js's persistent Data
 * Cache, backed by Vercel's infrastructure and shared across EVERY
 * instance, not per-instance memory -- the same class of fix
 * app/api/screener/route.js already uses for this exact table via
 * `export const revalidate`, just via the function-level primitive
 * since this route is a POST with a personalized body (a route-level
 * `revalidate` would incorrectly cache one user's held-fund results for
 * everyone else; unstable_cache only caches the shared, non-personalized
 * universe query, not this route's actual response).
 *
 * POST body: { funds: [{ code, name, value }] }
 */

import { unstable_cache } from 'next/cache';
import pool from '@/lib/db';
import { matchCategory, isSectoralThematic, classifySectoralTheme } from '@/app/screener/screenerContent';

export const dynamic = 'force-dynamic';

const MIN_PEER_GROUP = 5; // below this, a percentile is noise, not signal
const UNIVERSE_TTL_SECONDS = 21600; // 6h — matches /api/screener's own TTL for the same table (mf_screener only changes via the nightly build)

const getUniverse = unstable_cache(
  async () => {
    const { rows } = await pool.query(`SELECT code, name, category, ret_1y, ret_3y FROM mf_screener`);
    return rows;
  },
  ['portfolio-peer-rank-universe'],
  { revalidate: UNIVERSE_TTL_SECONDS }
);

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    const heldFunds = Array.isArray(body?.funds) ? body.funds : [];
    if (!heldFunds.length) {
      return Response.json({ funds: [] });
    }

    const universe = await getUniverse().catch(() => []);
    if (!universe.length) {
      return Response.json({ funds: [] });
    }

    const byCode = new Map(universe.map((r) => [String(r.code), r]));
    // Pre-classify sectoral sub-theme once per universe row, not per held
    // fund x universe row -- this loop is the expensive part otherwise.
    const themeByCode = new Map();
    universe.forEach((r) => {
      if (isSectoralThematic(r.category)) themeByCode.set(r.code, classifySectoralTheme(r.name));
    });

    const results = heldFunds.map((f) => {
      const code = String(f.code || '');
      const own = byCode.get(code);
      if (!own || !own.category) return { code, ranked: false };

      const ownIsSectoral = isSectoralThematic(own.category);
      const ownTheme = ownIsSectoral ? classifySectoralTheme(own.name) : null;

      const peers = universe.filter((r) => {
        if (r.code === code) return false;
        if (ownIsSectoral) return isSectoralThematic(r.category) && themeByCode.get(r.code) === ownTheme;
        return matchCategory(r.category, own.category);
      });

      const metric = own.ret_3y != null ? 'ret_3y' : own.ret_1y != null ? 'ret_1y' : null;
      if (!metric) return { code, ranked: false };
      const ownVal = parseFloat(own[metric]);
      if (!Number.isFinite(ownVal)) return { code, ranked: false };

      const peerVals = peers
        .map((p) => parseFloat(p[metric]))
        .filter((v) => Number.isFinite(v));
      if (peerVals.length < MIN_PEER_GROUP) return { code, ranked: false };

      const beaten = peerVals.filter((v) => v < ownVal).length;
      const percentile = Math.round((beaten / peerVals.length) * 100);

      return {
        code,
        ranked: true,
        category: ownIsSectoral ? ownTheme : own.category,
        metric,
        peerCount: peerVals.length,
        percentile,
      };
    });

    return Response.json({ funds: results });

  } catch (err) {
    console.error('[api/portfolio-peer-rank]', err.message);
    return Response.json({ error: 'Could not compute peer ranking' }, { status: 500 });
  }
}
