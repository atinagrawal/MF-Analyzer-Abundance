/**
 * app/api/cas/default-pan/route.js
 *
 * GET  /api/cas/default-pan[?targetUserId=...]  → { defaultPan: 'ABCDE1234F' | null }
 * POST /api/cas/default-pan  { pan, targetUserId? }  → { ok: true, pan }
 *
 * Lets the CAS owner (or an admin setting it on their behalf, via
 * targetUserId) choose which PAN the CAS Tracker's multi-PAN family view
 * should default its active tab to -- the first PAN casparser happens to
 * list in a family CAS is not necessarily the person actually using the
 * tool. Stored on users.default_pan: a property of whose family CAS this
 * is (the owner's account), not of who's currently viewing it, so an
 * admin viewing a client always sees (and can set) THAT CLIENT's default,
 * never their own.
 *
 * Authorization mirrors app/api/cas/pan-name/route.js: a caller may only
 * set the default to a PAN that appears in cas_portfolios.pans for the
 * resolved owner's own saved uploads.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';
import { PAN_REGEX, resolveOwnerId, authorizedPans } from '@/lib/casAuth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const ownerId = resolveOwnerId(session, searchParams.get('targetUserId'));

  try {
    const { rows } = await pool.query(`SELECT default_pan FROM users WHERE id = $1`, [ownerId]);
    return Response.json({ defaultPan: rows[0]?.default_pan || null });
  } catch (err) {
    console.error('[cas/default-pan] GET error:', err.message);
    return Response.json({ defaultPan: null });
  }
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const pan  = (body.pan || '').trim().toUpperCase();
  const ownerId = resolveOwnerId(session, body.targetUserId);

  if (!PAN_REGEX.test(pan)) {
    return Response.json({ error: 'Invalid PAN' }, { status: 400 });
  }

  try {
    const allowed = await authorizedPans(ownerId, [pan]);
    if (!allowed.length) {
      return Response.json({ error: 'This PAN was not found in your saved CAS uploads' }, { status: 403 });
    }

    await pool.query(`UPDATE users SET default_pan = $1 WHERE id = $2`, [pan, ownerId]);
    return Response.json({ ok: true, pan });
  } catch (err) {
    console.error('[cas/default-pan] POST error:', err.message);
    return Response.json({ error: 'Could not save default' }, { status: 500 });
  }
}
