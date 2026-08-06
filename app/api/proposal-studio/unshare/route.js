/**
 * app/api/proposal-studio/unshare/route.js
 *
 * POST /api/proposal-studio/unshare
 * Body (JSON): { id }
 *
 * Turns off public sharing: clears proposals.share_token so the old link
 * 404s (app/api/proposal-studio/shared/[token]/route.js can no longer find
 * a matching row). Same ownership-check shape as /share.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await req.json();
    if (!id) {
      return Response.json({ error: 'Missing id' }, { status: 400 });
    }

    const result = await pool.query(`SELECT user_id FROM proposals WHERE id = $1`, [id]);
    const row = result.rows[0];
    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (row.user_id !== session.user.id) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    await pool.query(`UPDATE proposals SET share_token = NULL WHERE id = $1`, [id]);

    return Response.json({ ok: true });

  } catch (err) {
    console.error('[proposal-studio/unshare]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
