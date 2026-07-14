/**
 * app/api/cas/delete/route.js
 *
 * DELETE /api/cas/delete   { id }
 *
 * Deletes a saved CAS upload — its Vercel Blob object and its
 * cas_portfolios row. Allowed for the CAS's own owner, or an admin
 * deleting on behalf of any user (same ownership pattern as
 * app/api/cas/load/route.js).
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';

export async function DELETE(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const id = body.id;
    if (!id) {
      return Response.json({ error: 'Missing id' }, { status: 400 });
    }

    const { rows } = await pool.query(
      `SELECT user_id, blob_key FROM cas_portfolios WHERE id = $1 LIMIT 1`,
      [id]
    );
    if (!rows.length) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const { user_id: owner, blob_key: blobKey } = rows[0];
    const isAdmin = session.user.role === 'admin';
    if (owner !== session.user.id && !isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Non-admin self-service deletes must leave at least 1 CAS on file —
    // admins are exempt (e.g. cleaning up a client's bad upload).
    if (!isAdmin) {
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM cas_portfolios WHERE user_id = $1`,
        [owner]
      );
      if (countRows[0].n <= 1) {
        return Response.json(
          { error: 'You must keep at least one CAS on file. Upload a replacement before deleting this one.' },
          { status: 409 }
        );
      }
    }

    // Delete the Blob object first — if this fails, the DB row is left
    // intact so the entry (and a retry) is still visible instead of
    // silently leaking storage.
    try {
      const { list, del } = await import('@vercel/blob');
      const token = process.env.BLOB_READ_WRITE_TOKEN;
      const { blobs } = await list({ prefix: blobKey, limit: 1, token });
      if (blobs.length) {
        await del(blobs[0].url, { token });
      }
    } catch (err) {
      console.error('[cas/delete] blob delete failed:', err.message);
      return Response.json({ error: 'Could not delete stored file' }, { status: 502 });
    }

    await pool.query(`DELETE FROM cas_portfolios WHERE id = $1`, [id]);

    return Response.json({ ok: true });

  } catch (err) {
    console.error('[cas/delete]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
