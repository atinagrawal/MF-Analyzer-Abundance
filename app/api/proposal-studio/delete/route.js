/**
 * app/api/proposal-studio/delete/route.js
 *
 * DELETE /api/proposal-studio/delete
 * Body (JSON): { id }
 *
 * Ownership-checked delete. Unlike CAS, there is no "keep at least one"
 * restriction -- a distributor may freely delete every saved proposal.
 * The R2 object is deleted before the DB row, so a failed R2 delete
 * leaves the DB row (and thus the ability to retry) intact rather than
 * silently leaking storage.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';
import { r2Delete } from '@/lib/r2';

export async function DELETE(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await req.json();
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

    // Same fail-safe ordering as app/api/cas/delete/route.js: delete the
    // R2 object first, and if that fails, leave the DB row intact instead
    // of silently leaking storage.
    try {
      await r2Delete(row.blob_key);
    } catch (err) {
      console.error('[proposal-studio/delete] R2 delete failed:', err.message);
      return Response.json({ error: 'Could not delete stored file' }, { status: 502 });
    }

    await pool.query(`DELETE FROM proposals WHERE id = $1`, [id]);

    return Response.json({ ok: true });

  } catch (err) {
    console.error('[proposal-studio/delete]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
