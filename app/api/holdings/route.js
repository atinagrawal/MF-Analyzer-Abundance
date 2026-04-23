/**
 * app/api/holdings/route.js
 *
 * GET /api/holdings
 * GET /api/holdings?userId={id}   — admin only: returns another user's holdings
 *
 * Returns manual holdings from the manual_holdings table.
 * Non-admins can only fetch their own holdings.
 * Admins can pass ?userId= to fetch any user's holdings (for CAS tracker view).
 */

import { auth } from '@/auth';
import pool      from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const requestedUserId  = searchParams.get('userId');

    // Non-admins cannot request other users' holdings
    if (requestedUserId && requestedUserId !== session.user.id) {
      if (session.user.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    const userId = requestedUserId || session.user.id;

    const result = await pool.query(
      `SELECT id, fund_name, amfi_code, fund_type, units, purchase_nav,
              purchase_date, folio, notes, created_at
       FROM   manual_holdings
       WHERE  user_id = $1
       ORDER  BY created_at DESC`,
      [userId]
    );

    return Response.json({ holdings: result.rows });

  } catch (err) {
    console.error('[holdings GET]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
