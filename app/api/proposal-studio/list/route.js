/**
 * app/api/proposal-studio/list/route.js
 *
 * GET /api/proposal-studio/list
 *
 * Lists the current user's saved proposals, newest first. No admin
 * on-behalf-of override (unlike CAS) -- proposals are per-distributor
 * work product, not client data an admin needs to inspect on demand.
 * Capped higher than CAS's list (200 not 20) since the UI adds a search
 * box specifically to handle a long-running list.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const result = await pool.query(
      `SELECT id, client_name, client_email, client_phone, proposal_type, total_amount, fund_count, created_at
       FROM proposals
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 200`,
      [session.user.id]
    );

    return Response.json({ proposals: result.rows });

  } catch (err) {
    console.error('[proposal-studio/list]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
