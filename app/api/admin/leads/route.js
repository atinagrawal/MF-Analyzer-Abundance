/**
 * app/api/admin/leads/route.js
 *
 * GET /api/admin/leads
 * Admin: every user who has uploaded at least one CAS, one row per user
 * (their most recent upload), sorted newest-first. Distributor: scoped to
 * their own clients only, same WHERE clause as app/api/admin/users/route.js.
 *
 * Exists because cas_email/cas_mobile (see
 * docs/superpowers/specs/2026-10-14-admin-client-outreach-design.md and
 * scripts/migrate-cas-mobile.mjs) were only ever visible by clicking into
 * one user at a time in the Users tab -- this is a single scannable list
 * for personal outreach, not a new data source.
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
        u.id, u.name, u.email,
        latest.cas_email, latest.cas_mobile,
        latest.uploaded_at AS last_upload,
        COUNT(cp.id)::int AS upload_count
      FROM users u
      JOIN cas_portfolios cp ON cp.user_id = u.id
      JOIN LATERAL (
        SELECT cas_email, cas_mobile, uploaded_at
        FROM cas_portfolios
        WHERE user_id = u.id
        ORDER BY uploaded_at DESC
        LIMIT 1
      ) latest ON true
      ${isAdmin ? '' : 'WHERE u.distributor_id = $1 OR u.created_by = $1'}
      GROUP BY u.id, u.name, u.email, latest.cas_email, latest.cas_mobile, latest.uploaded_at
      ORDER BY latest.uploaded_at DESC
    `, isAdmin ? [] : [session.user.id]);

    return Response.json({ leads: result.rows });

  } catch (err) {
    console.error('[admin/leads]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
