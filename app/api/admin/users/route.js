/**
 * app/api/admin/users/route.js
 *
 * GET /api/admin/users
 * Admin: returns every user. Distributor: returns only clients assigned to
 * or created by them (distributor_id/created_by), and an empty
 * `distributors` list — the "Assigned MFD" reassignment control is
 * admin-only, so there's no reason to hand a distributor the full roster.
 * Sorted by most recent sign-in first.
 */

import { auth } from '@/auth';
import pool      from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorised' }, { status: 401 });
    const role = session.user.role;
    if (role !== 'admin' && role !== 'distributor') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    const isAdmin = role === 'admin';

    const result = await pool.query(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.image,
        u.role,
        u.plan,
        u.distributor_id,
        d.name AS distributor_name,
        u.created_at,
        u.last_active_at,
        COUNT(DISTINCT cp.id)::int AS portfolio_count,
        MAX(cp.uploaded_at) AS last_upload,
        COUNT(DISTINCT p.id)::int AS proposal_count
      FROM users u
      LEFT JOIN cas_portfolios cp ON cp.user_id = u.id
      LEFT JOIN proposals p ON p.user_id = u.id
      LEFT JOIN users d ON d.id = u.distributor_id
      ${isAdmin ? '' : 'WHERE u.distributor_id = $1 OR u.created_by = $1'}
      GROUP BY u.id, d.name
      ORDER BY u.created_at DESC
    `, isAdmin ? [] : [session.user.id]);

    const dists = isAdmin ? await pool.query(`
      SELECT id, name, email FROM users
      WHERE role = 'distributor' OR role = 'admin'
      ORDER BY name ASC
    `) : { rows: [] };

    return Response.json({ users: result.rows, distributors: dists.rows, isAdmin });

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

    const { userId, role, plan, distributorId } = await req.json();
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

    if (distributorId !== undefined) {
      const targetDistributor = distributorId ? distributorId : null;
      await pool.query('UPDATE users SET distributor_id = $1 WHERE id = $2', [targetDistributor, userId]);
    }

    return Response.json({ ok: true, userId, role, plan, distributorId });

  } catch (err) {
    console.error('[admin/users PATCH]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
