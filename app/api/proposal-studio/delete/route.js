/**
 * app/api/proposal-studio/delete/route.js
 *
 * DELETE /api/proposal-studio/delete
 * Body (JSON): { id }
 *
 * Ownership-checked delete. Unlike CAS, there is no "keep at least one"
 * restriction -- a distributor may freely delete every saved proposal.
 * Blob object is deleted before the DB row, so a failed blob delete
 * leaves the DB row (and thus the ability to retry) intact rather than
 * silently leaking storage.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';
import { list, del } from '@vercel/blob';

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

    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const { blobs } = await list({ prefix: row.blob_key, limit: 1, token });
    if (blobs.length) {
      await del(blobs[0].url, { token });
    }

    await pool.query(`DELETE FROM proposals WHERE id = $1`, [id]);

    return Response.json({ ok: true });

  } catch (err) {
    console.error('[proposal-studio/delete]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
