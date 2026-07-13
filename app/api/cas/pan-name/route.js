/**
 * app/api/cas/pan-name/route.js
 *
 * GET  /api/cas/pan-name?pans=PAN1,PAN2[&targetUserId=...]  → { names: { PAN1: 'Name', ... } }
 * POST /api/cas/pan-name  { pan, name, targetUserId? }      → { ok: true, pan, name }
 *
 * Lets the CAS owner (or an admin viewing on their behalf, via targetUserId)
 * label the investor name for a PAN in a multi-PAN family CAS statement.
 * Stored globally by PAN (not per-user) so the label carries over the next
 * time that PAN appears in any family CAS upload — disclosed in the CAS
 * Tracker page's FAQ ("Can I name each investor in a multi-PAN CAS?").
 *
 * Authorization: a caller may only read or set a name for a PAN that
 * appears in cas_portfolios.pans for their own account (or, for admin,
 * the impersonated targetUserId's account) — i.e. a PAN they've
 * legitimately seen via their own saved CAS upload. This is enforced
 * server-side against cas_portfolios, not just hidden behind the UI:
 * cas_portfolios.pans is populated server-side in /api/cas/save from the
 * parsed CAS itself, never from client-supplied PAN lists.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';

export const dynamic = 'force-dynamic';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** Resolves which account's saved uploads to authorize against. */
function resolveOwnerId(session, targetUserId) {
  return (session.user.role === 'admin' && targetUserId) ? targetUserId : session.user.id;
}

/** Narrows `pans` down to only those the owner has actually seen in a saved upload. */
async function authorizedPans(ownerId, pans) {
  if (!pans.length) return [];
  const { rows } = await pool.query(
    `SELECT DISTINCT p AS pan
       FROM cas_portfolios, unnest(pans) AS p
      WHERE user_id = $1 AND p = ANY($2)`,
    [ownerId, pans]
  );
  return rows.map(r => r.pan);
}

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Sign in required' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const pans = (searchParams.get('pans') || '')
    .split(',')
    .map(p => p.trim().toUpperCase())
    .filter(p => PAN_REGEX.test(p));
  const ownerId = resolveOwnerId(session, searchParams.get('targetUserId'));

  if (!pans.length) {
    return Response.json({ names: {} });
  }

  try {
    const allowed = await authorizedPans(ownerId, pans);
    if (!allowed.length) return Response.json({ names: {} });

    const { rows } = await pool.query(
      `SELECT pan, investor_name FROM pan_investor_names WHERE pan = ANY($1)`,
      [allowed]
    );
    const names = {};
    rows.forEach(r => { names[r.pan] = r.investor_name; });
    return Response.json({ names });
  } catch (err) {
    console.error('[cas/pan-name] GET error:', err.message);
    return Response.json({ names: {} });
  }
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: 'Sign in required' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const pan  = (body.pan || '').trim().toUpperCase();
  const name = (body.name || '').trim();
  const ownerId = resolveOwnerId(session, body.targetUserId);

  if (!PAN_REGEX.test(pan)) {
    return Response.json({ error: 'Invalid PAN' }, { status: 400 });
  }
  if (!name || name.length > 100) {
    return Response.json({ error: 'Name must be 1-100 characters' }, { status: 400 });
  }

  try {
    const allowed = await authorizedPans(ownerId, [pan]);
    if (!allowed.length) {
      return Response.json({ error: 'This PAN was not found in your saved CAS uploads' }, { status: 403 });
    }

    await pool.query(
      `INSERT INTO pan_investor_names (pan, investor_name, updated_by, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (pan) DO UPDATE SET
         investor_name = EXCLUDED.investor_name,
         updated_by    = EXCLUDED.updated_by,
         updated_at    = now()`,
      [pan, name, session.user.id]
    );
    return Response.json({ ok: true, pan, name });
  } catch (err) {
    console.error('[cas/pan-name] POST error:', err.message);
    return Response.json({ error: 'Could not save name' }, { status: 500 });
  }
}
