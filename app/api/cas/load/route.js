/**
 * app/api/cas/load/route.js
 *
 * GET /api/cas/load?key=cas/{userId}/{file}.json
 *
 * Verifies the session, confirms the requested blob key belongs to
 * the current user (or that the user can manage that user — admin, or
 * their assigned distributor, per canManageUser), fetches the object from
 * R2 with the server-side credentials, and streams the JSON back to the
 * client. The client never sees the R2 access keys.
 */

import { auth } from '@/auth';
import pool      from '@/lib/db';
import { r2Get } from '@/lib/r2';
import { canManageUser } from '@/lib/permissions';

export async function GET(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const blobKey = searchParams.get('key');

    if (!blobKey) {
      return Response.json({ error: 'Missing key' }, { status: 400 });
    }

    // Confirm this blob key belongs to the user (security check)
    const ownership = await pool.query(
      `SELECT user_id FROM cas_portfolios WHERE blob_key = $1 LIMIT 1`,
      [blobKey]
    );

    if (ownership.rows.length === 0) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const owner = ownership.rows[0].user_id;

    if (owner !== session.user.id && !(await canManageUser(session, owner))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const data = await r2Get(blobKey);
    if (!data) {
      return Response.json({ error: 'Blob not found' }, { status: 404 });
    }
    return Response.json(data);

  } catch (err) {
    console.error('[cas/load]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
