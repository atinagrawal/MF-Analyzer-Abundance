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
    if (!session?.user?.id)            return Response.json({ error: 'Unauthorised' }, { status: 401 });
    if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden' },     { status: 403 });

    const { email, name } = await req.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return Response.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const normalised = email.trim().toLowerCase();

    // Check if user already exists
    const existing = await pool.query(
      'SELECT id, name, role FROM users WHERE email = $1 LIMIT 1',
      [normalised]
    );

    if (existing.rows.length > 0) {
      return Response.json({
        userId:  existing.rows[0].id,
        created: false,
        role:    existing.rows[0].role,
      });
    }

    // Create pending user — no image, no emailVerified (they haven't signed in yet).
    // role defaults to 'client'. When they sign in with Google, NextAuth finds this
    // row by email and updates name/image/emailVerified automatically.
    const result = await pool.query(
      `INSERT INTO users (name, email, role, created_at)
       VALUES ($1, $2, 'client', NOW())
       RETURNING id`,
      [name?.trim() || null, normalised]
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
