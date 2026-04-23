/**
 * app/api/holdings/route.js
 *
 * GET /api/holdings
 *
 * Returns the signed-in user's manual holdings from the manual_holdings table.
 * Each holding includes fund_name, amfi_code, fund_type, units, purchase_nav,
 * purchase_date, folio, notes.
 *
 * This is the client-facing route. Admins use /api/admin/holdings.
 * Authentication required — returns only the current user's holdings.
 */

import { auth } from '@/auth';
import pool      from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const result = await pool.query(
      `SELECT id, fund_name, amfi_code, fund_type, units, purchase_nav,
              purchase_date, folio, notes, created_at
       FROM   manual_holdings
       WHERE  user_id = $1
       ORDER  BY created_at DESC`,
      [session.user.id]
    );

    return Response.json({ holdings: result.rows });

  } catch (err) {
    console.error('[holdings GET]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
