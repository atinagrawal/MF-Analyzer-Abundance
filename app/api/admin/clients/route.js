/**
 * app/api/admin/clients/route.js
 *
 * POST /api/admin/clients
 * Body: { email, name? }
 *
 * Creates a pending user record if the email doesn't exist yet.
 * If it already exists, returns the existing user ID.
 * Pending users can later sign in with Google using the same email —
 * NextAuth's pg-adapter matches on email and links the Google account.
 *
 * Admin only.
 */

import { auth } from '@/auth';
import pool      from '@/lib/db';

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorised' }, { status: 401 });
    const isAllowed = session.user.role === 'admin' || session.user.role === 'distributor';
    if (!isAllowed) return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { email, name } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const normalised = email.trim().toLowerCase();

    // Check if user already exists
    const existing = await pool.query(
      'SELECT id, name, role, distributor_id FROM users WHERE email = $1 LIMIT 1',
      [normalised]
    );

    if (existing.rows.length > 0) {
      const u = existing.rows[0];
      // If client doesn't have a distributor yet and created by distributor, link them
      if (!u.distributor_id && session.user.role === 'distributor') {
        await pool.query(
          'UPDATE users SET distributor_id = $1, created_by = COALESCE(created_by, $1) WHERE id = $2',
          [session.user.id, u.id]
        );
      }
      return Response.json({
        userId:  u.id,
        created: false,
        role:    u.role,
      });
    }

    // Create pending user — defaults to role 'client'
    const distributorId = session.user.role === 'distributor' ? session.user.id : null;
    const result = await pool.query(
      `INSERT INTO users (name, email, role, distributor_id, created_by, created_at)
       VALUES ($1, $2, 'client', $3, $4, NOW())
       RETURNING id`,
      [name?.trim() || null, normalised, distributorId, session.user.id]
    );

    return Response.json({
      userId:  result.rows[0].id,
      created: true,
      role:    'client',
    });

  } catch (err) {
    console.error('[admin/clients]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
