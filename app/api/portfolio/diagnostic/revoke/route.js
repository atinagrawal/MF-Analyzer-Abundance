/**
 * app/api/portfolio/diagnostic/revoke/route.js
 *
 * POST /api/portfolio/diagnostic/revoke
 * Body (JSON): { shareToken }
 *
 * Authenticated endpoint: allows the owning user to immediately revoke public
 * access to a shared diagnostic report. Once revoked, the public link and its
 * OpenGraph preview card return 404 immediately.
 */

import { auth } from '@/auth';
import pool from '@/lib/db';

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { shareToken, id } = await req.json();
    if (!shareToken && !id) {
      return Response.json({ error: 'Missing shareToken or id' }, { status: 400 });
    }

    const queryResult = await pool.query(
      `UPDATE portfolio_diagnostics
       SET revoked = TRUE, revoked_at = NOW()
       WHERE (share_token = $1 OR id = $1)
         AND user_id = $2
       RETURNING id, share_token`,
      [shareToken || id, session.user.id]
    );

    if (queryResult.rows.length === 0) {
      return Response.json({ error: 'Diagnostic not found or unauthorized' }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[portfolio/diagnostic/revoke]', err);
    return Response.json({ error: 'Failed to revoke diagnostic' }, { status: 500 });
  }
}
