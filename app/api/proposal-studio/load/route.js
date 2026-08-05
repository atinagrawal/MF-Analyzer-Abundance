/**
 * app/api/proposal-studio/load/route.js
 *
 * GET /api/proposal-studio/load?id=<proposal id>
 *
 * Ownership-checked fetch of the full saved proposal payload from R2.
 * Mirrors app/api/cas/load/route.js's ownership-then-fetch pattern.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';
import { r2Get } from '@/lib/r2';

export async function GET(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return Response.json({ error: 'Missing id' }, { status: 400 });
    }

    const result = await pool.query(
      `SELECT user_id, blob_key FROM proposals WHERE id = $1`,
      [id]
    );
    const row = result.rows[0];
    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (row.user_id !== session.user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = await r2Get(row.blob_key);
    if (!payload) {
      return Response.json({ error: 'Saved payload missing from storage' }, { status: 404 });
    }

    return Response.json({ id, ...payload });

  } catch (err) {
    console.error('[proposal-studio/load]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
