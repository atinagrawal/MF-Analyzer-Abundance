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
 * POST body: { funds: [{ code, name, value }] }
 */

import pool from '@/lib/db';
import { matchCategory, isSectoralThematic, classifySectoralTheme } from '@/app/screener/screenerContent';

export const dynamic = 'force-dynamic';

const MIN_PEER_GROUP = 5; // below this, a percentile is noise, not signal

export async function POST(req) {
  try {
    const body = await req.json().catch(() => null);
    const heldFunds = Array.isArray(body?.funds) ? body.funds : [];
    if (!heldFunds.length) {
      return Response.json({ funds: [] });
    }

    const { rows: universe } = await pool.query(
      `SELECT code, name, category, ret_1y, ret_3y FROM mf_screener`
    ).catch(() => ({ rows: [] }));
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
