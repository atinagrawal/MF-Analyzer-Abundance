/**
 * app/api/cas/merge-member/route.js
 *
 * POST   /api/cas/merge-member   { folioNos, targetPan, targetUserId? }
 *   Manually attributes each given folio number to targetPan -- the
 *   "merge member A into member B" action. Always overwrites any
 *   existing override for a folio (a later manual decision supersedes an
 *   earlier one).
 *
 * DELETE /api/cas/merge-member   { folioNos, targetUserId? }
 *   Removes the override for each given folio number, letting it fall
 *   back through the normal resolution order (a prior CAS statement's
 *   history, then the sole-PAN-in-statement auto-fix, then Shared/
 *   Unknown). A folio with no override row is a no-op, not an error.
 *
 * Authorization matches app/api/cas/resolve-folios/route.js exactly --
 * see docs/superpowers/plans/2026-08-18-cas-member-merge.md's Global
 * Constraints for why this uses canManageUser rather than
 * lib/casAuth.js's resolveOwnerId (which is admin-only).
 *
 * See docs/superpowers/specs/2026-08-18-cas-member-merge-design.md.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';
import { canManageUser } from '@/lib/permissions';
import { PAN_REGEX, authorizedPans } from '@/lib/casAuth';

export const dynamic = 'force-dynamic';

async function resolveAndAuthorizeOwner(session, targetUserId) {
  const ownerId = (targetUserId && targetUserId !== session.user.id) ? targetUserId : session.user.id;
  if (ownerId !== session.user.id && !(await canManageUser(session, ownerId))) {
    return null;
  }
  return ownerId;
}

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const folioNos  = Array.isArray(body.folioNos) ? body.folioNos.map(f => String(f).trim()).filter(Boolean) : [];
    const targetPan = (body.targetPan || '').trim().toUpperCase();

    if (!folioNos.length) {
      return Response.json({ error: 'folioNos must be a non-empty array' }, { status: 400 });
    }
    if (!PAN_REGEX.test(targetPan)) {
      return Response.json({ error: 'Invalid targetPan' }, { status: 400 });
    }

    const ownerId = await resolveAndAuthorizeOwner(session, body.targetUserId);
    if (!ownerId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const allowed = await authorizedPans(ownerId, [targetPan]);
    if (!allowed.length) {
      return Response.json({ error: 'This PAN was not found in your saved CAS uploads' }, { status: 403 });
    }

    for (const folioNo of folioNos) {
      await pool.query(
        `INSERT INTO folio_pan_overrides (user_id, folio_no, pan, updated_by, updated_at)
         VALUES ($1, $2, $3, $4, now())
         ON CONFLICT (user_id, folio_no) DO UPDATE SET
           pan        = EXCLUDED.pan,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
        [ownerId, folioNo, targetPan, session.user.id]
      );
    }

    return Response.json({ ok: true, folioNos, targetPan });
  } catch (err) {
    console.error('[cas/merge-member] POST error:', err.message);
    return Response.json({ error: 'Could not save merge' }, { status: 500 });
  }
}

export async function DELETE(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const folioNos = Array.isArray(body.folioNos) ? body.folioNos.map(f => String(f).trim()).filter(Boolean) : [];

    if (!folioNos.length) {
      return Response.json({ error: 'folioNos must be a non-empty array' }, { status: 400 });
    }

    const ownerId = await resolveAndAuthorizeOwner(session, body.targetUserId);
    if (!ownerId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const result = await pool.query(
      `DELETE FROM folio_pan_overrides WHERE user_id = $1 AND folio_no = ANY($2)`,
      [ownerId, folioNos]
    );

    return Response.json({ ok: true, removed: result.rowCount });
  } catch (err) {
    console.error('[cas/merge-member] DELETE error:', err.message);
    return Response.json({ error: 'Could not undo merge' }, { status: 500 });
  }
}
