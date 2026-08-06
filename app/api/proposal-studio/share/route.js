/**
 * app/api/proposal-studio/share/route.js
 *
 * POST /api/proposal-studio/share
 * Body (JSON): { id }
 *
 * Turns on public sharing for a saved proposal: generates (or reuses) a
 * random share token, stored in proposals.share_token, and returns the
 * public URL anyone can open without signing in
 * (/proposal-studio/view/[token], see
 * app/api/proposal-studio/shared/[token]/route.js). Same ownership-check
 * shape as /delete and /load. Idempotent: re-clicking Share on an
 * already-shared proposal returns the SAME token rather than invalidating a
 * link that may already have been sent out.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';
import { ensureShareToken } from '@/lib/proposalShareToken';

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

    const shareToken = await ensureShareToken(pool, id);
    const origin = new URL(req.url).origin;

    return Response.json({ ok: true, shareToken, shareUrl: `${origin}/proposal-studio/view/${shareToken}` });

  } catch (err) {
    console.error('[proposal-studio/share]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
