/**
 * app/api/sif-detail/[id]/route.js
 *
 * GET /api/sif-detail/[id]
 * Fetches complete detail for a single Specialised Investment Fund (SIF)
 * by scheme_id (e.g. SIF-01) or numeric ID, plus its holdings -- gated the
 * same way app/api/fund-detail/[code]/route.js gates mutual fund holdings:
 * non-Pro visitors get a top-10 preview (matching HoldingsSection.jsx's
 * existing free-tier UI) with a true total count, never the full list.
 */

import { auth } from '@/auth';
import { getUserPlan } from '@/lib/plan';
import pool from '@/lib/db';
import { getHoldingsData, truncateHoldingsForFreeTier } from '@/lib/holdingsLookup';

export const dynamic = 'force-dynamic';

const COLS = 'scheme_id,nav_name,sif_name,category,nav,nav_date,ret_1m,ret_3m,ret_6m,ret_1y,ret_3y,ret_5y,ret_7y,ret_10y,vol,max_dd,ret_per_risk,age_years,inception_date,ret_inception,ret_inception_annualized,asof';

export async function GET(req, { params }) {
  const { id } = await params;
  if (!id) {
    return Response.json({ error: 'Missing SIF scheme ID' }, { status: 400 });
  }

  const rawId = String(id).trim();
  const normalizedId = rawId.startsWith('SIF-') ? rawId : !isNaN(Number(rawId)) ? `SIF-${String(rawId).padStart(2, '0')}` : rawId;

  try {
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM sif_screener WHERE UPPER(scheme_id) = UPPER($1) OR UPPER(scheme_id) = UPPER($2) LIMIT 1`,
      [rawId, normalizedId]
    );

    if (!rows.length) {
      return Response.json({ error: 'SIF scheme not found' }, { status: 404 });
    }

    const r = rows[0];
    const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));
    const scheme = {
      scheme_id: r.scheme_id,
      nav_name: r.nav_name,
      sif_name: r.sif_name,
      category: r.category,
      nav: num(r.nav),
      nav_date: r.nav_date,
      ret_1m: num(r.ret_1m),
      ret_3m: num(r.ret_3m),
      ret_6m: num(r.ret_6m),
      ret_1y: num(r.ret_1y),
      ret_3y: num(r.ret_3y),
      ret_5y: num(r.ret_5y),
      ret_7y: num(r.ret_7y),
      ret_10y: num(r.ret_10y),
      vol: num(r.vol),
      max_dd: num(r.max_dd),
      ret_per_risk: num(r.ret_per_risk),
      age_years: num(r.age_years),
      inception_date: r.inception_date || null,
      ret_inception: num(r.ret_inception),
      ret_inception_annualized: r.ret_inception_annualized,
      asof: r.asof,
    };

    const session = await auth();
    const isPro = Boolean(
      session?.user?.role === 'admin' ||
      session?.user?.role === 'distributor' ||
      session?.user?.plan === 'pro' ||
      session?.user?.plan === 'pro_lifetime' ||
      session?.user?.plan === 'lifetime' ||
      session?.user?.isPro ||
      (session?.user?.id && (await getUserPlan(session.user.id)) === 'pro')
    );

    let holdings = null;
    try {
      const raw = await getHoldingsData(scheme.scheme_id, scheme.nav_name);
      holdings = isPro || !raw ? raw : truncateHoldingsForFreeTier(raw);
    } catch (err) {
      console.error('[api/sif-detail] holdings lookup failed:', err.message);
    }

    return Response.json({ scheme, holdings, isPro }, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (e) {
    console.error('[sif-detail API]', e.message);
    return Response.json({ error: 'Failed to fetch SIF detail', detail: String(e.message) }, { status: 500 });
  }
}
