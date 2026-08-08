/**
 * app/api/admin/users/route.js
 *
 * GET /api/admin/users
 * Admin only. Returns all users with their portfolio upload count,
 * sorted by most recent sign-in first.
 */

import { auth } from '@/auth';
import pool      from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id)               return Response.json({ error: 'Unauthorised' }, { status: 401 });
    if (session.user.role !== 'admin')    return Response.json({ error: 'Forbidden' },     { status: 403 });

    const result = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.image,
        u.role,
        u.plan,
        u.created_at,
        COUNT(cp.id)::int AS portfolio_count,
        MAX(cp.uploaded_at) AS last_upload
      FROM users u
      LEFT JOIN cas_portfolios cp ON cp.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    return Response.json({ users: result.rows });

  } catch (err) {
    console.error('[admin/users]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/users
 * Body: { userId, role }
 * Updates a user's role.
 */
export async function PATCH(req) {
  try {
    const session = await auth();
    if (!session?.user?.id)            return Response.json({ error: 'Unauthorised' }, { status: 401 });
    if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden' },     { status: 403 });

    const { userId, role, plan } = await req.json();
    const VALID_ROLES = ['client', 'distributor', 'admin'];
    const VALID_PLANS = ['free', 'pro', 'pro_lifetime', 'lifetime'];

    if (!userId) {
      return Response.json({ error: 'userId is required' }, { status: 400 });
    }

    if (role) {
      if (!VALID_ROLES.includes(role)) {
        return Response.json({ error: 'Invalid role' }, { status: 400 });
      }
      // Prevent removing your own admin role
      if (userId === session.user.id && role !== 'admin') {
        return Response.json({ error: 'Cannot demote yourself' }, { status: 400 });
      }
      await pool.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
    }

    if (plan !== undefined) {
      if (plan !== null && !VALID_PLANS.includes(plan)) {
        return Response.json({ error: 'Invalid plan' }, { status: 400 });
      }
      await pool.query('UPDATE users SET plan = $1 WHERE id = $2', [plan, userId]);
    }

    return Response.json({ ok: true, userId, role, plan });

  } catch (err) {
    console.error('[admin/users PATCH]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
