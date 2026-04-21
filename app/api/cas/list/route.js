/**
 * app/api/cas/list/route.js
 *
 * GET /api/cas/list              → current user's portfolios
 * GET /api/cas/list?userId=xxx   → admin only: another user's portfolios
 *
 * Returns: [{ id, file_name, pan_count, uploaded_at, blob_key }]
 * sorted newest first.
 */

import { auth } from '@/auth';
import pool      from '@/lib/db';

export async function GET(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get('userId');

    // Only admin can query other users
    if (targetUserId && session.user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userId = targetUserId || session.user.id;

    const result = await pool.query(
      `SELECT id, file_name, pan_count, uploaded_at, blob_key
       FROM cas_portfolios
       WHERE user_id = $1
       ORDER BY uploaded_at DESC
       LIMIT 20`,
      [userId]
    );

    return Response.json({ portfolios: result.rows });

  } catch (err) {
    console.error('[cas/list]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
