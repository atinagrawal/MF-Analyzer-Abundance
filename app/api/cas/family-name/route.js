/**
 * app/api/cas/family-name/route.js
 *
 * GET  /api/cas/family-name[?targetUserId=...]  → { familyName: 'The Agarwal Family' | null }
 * POST /api/cas/family-name  { name, targetUserId? }  → { ok: true, name }
 *
 * Lets the CAS owner (or an admin setting it on their behalf, via
 * targetUserId) label their multi-PAN family CAS -- the CAS Tracker's
 * combined/pooled family view otherwise falls back to a generic
 * "N Family Members" string with nothing the user can set. Stored on
 * users.family_name: a property of whose family CAS this is (the owner's
 * account), not of who's currently viewing it -- same ownership model as
 * app/api/cas/default-pan/route.js, which this route is a direct copy of.
 *
 * Unlike pan-name (keyed by PAN, checked against cas_portfolios.pans),
 * this is keyed by the owner account itself, so no per-PAN authorization
 * check is needed -- resolveOwnerId already scopes every read/write to
 * either the caller's own account or, for admin, the impersonated client's.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';
import { resolveOwnerId } from '@/lib/casAuth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ownerId = resolveOwnerId(session, searchParams.get('targetUserId'));

  try {
    const { rows } = await pool.query(`SELECT family_name FROM users WHERE id = $1`, [ownerId]);
    return Response.json({ familyName: rows[0]?.family_name || null });
  } catch (err) {
    console.error('[cas/family-name] GET error:', err.message);
    return Response.json({ familyName: null });
  }
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const name = (body.name || '').trim();
  const ownerId = resolveOwnerId(session, body.targetUserId);

  if (!name || name.length > 100) {
    return Response.json({ error: 'Name must be 1-100 characters' }, { status: 400 });
  }

  try {
    await pool.query(`UPDATE users SET family_name = $1 WHERE id = $2`, [name, ownerId]);
    return Response.json({ ok: true, name });
  } catch (err) {
    console.error('[cas/family-name] POST error:', err.message);
    return Response.json({ error: 'Could not save this name' }, { status: 500 });
  }
}
