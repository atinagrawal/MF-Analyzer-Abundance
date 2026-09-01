/**
 * app/api/arn-overrides/route.js
 *
 * GET    /api/arn-overrides?pans=PAN1,PAN2   -- any authenticated user; returns
 *        every admin-set ARN correction for the given PANs, so a client or
 *        distributor viewing their own cas-tracker gets the same corrected
 *        "who sold this" attribution the admin curated, not just the admin.
 * POST   /api/arn-overrides  { pan, folio, real_arn }  -- admin only, upserts.
 * DELETE /api/arn-overrides  { pan, folio }             -- admin only, removes.
 *
 * Corrects a folio's CAS-reported advisor ARN when it's actually a shared/
 * national-distributor umbrella ARN (NJ IndiaInvest, Centricity, etc.) that
 * doesn't identify which of its many affiliated sub-advisors actually
 * services the folio -- CAS carries no EUIN/sub-broker field that could
 * answer this on its own, so it's an explicit admin correction, keyed by
 * (pan, folio) since that's the most granular identity CAS gives us. The
 * corrected ARN then flows through the exact same AMFI-lookup pipeline any
 * other ARN uses (lib/distributorResolution.js's resolveDistributors) --
 * no separate display logic needed.
 *
 * See scripts/schema.sql's arn_overrides table and the PRADEEP GOYAL/NJ
 * national-distributor bug report this addresses.
 */

import { auth } from '@/auth';
import pool from '@/lib/db';
import { normalizeArn } from '@/lib/amfiDistributor';

export async function GET(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorised' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const pans = (searchParams.get('pans') || '').split(',').map(p => p.trim()).filter(Boolean);
    if (pans.length === 0) return Response.json({ overrides: {} });

    const { rows } = await pool.query(
      `SELECT pan, folio_no, real_arn FROM arn_overrides WHERE pan = ANY($1)`,
      [pans]
    );

    const overrides = {};
    rows.forEach(r => { overrides[`${r.pan}::${r.folio_no}`] = r.real_arn; });
    return Response.json({ overrides });

  } catch (err) {
    console.error('[arn-overrides GET]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorised' }, { status: 401 });
    if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { pan, folio, real_arn } = await req.json();
    if (!pan || !folio) return Response.json({ error: 'pan and folio are required' }, { status: 400 });

    const arn = normalizeArn(real_arn);
    if (!arn) return Response.json({ error: 'real_arn is not a valid ARN' }, { status: 400 });

    await pool.query(
      `INSERT INTO arn_overrides (pan, folio_no, real_arn, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (pan, folio_no)
       DO UPDATE SET real_arn = $3, updated_by = $4, updated_at = NOW()`,
      [pan, folio, arn, session.user.id]
    );

    return Response.json({ pan, folio, real_arn: arn });

  } catch (err) {
    console.error('[arn-overrides POST]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorised' }, { status: 401 });
    if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { pan, folio } = await req.json();
    if (!pan || !folio) return Response.json({ error: 'pan and folio are required' }, { status: 400 });

    await pool.query(`DELETE FROM arn_overrides WHERE pan = $1 AND folio_no = $2`, [pan, folio]);
    return Response.json({ ok: true });

  } catch (err) {
    console.error('[arn-overrides DELETE]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
