/**
 * lib/plan.js — Helpers for checking Pro plan status in API routes.
 *
 * Usage in an API route:
 *   const guard = await requirePro(session.user.id);
 *   if (guard) return guard; // 403 response
 *   // ... proceed with pro-only logic
 */

import pool from '@/lib/db';

export async function getUserPlan(userId) {
  const { rows } = await pool.query(
    `SELECT plan, plan_expires_at FROM users WHERE id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return 'free';
  if (row.plan === 'pro_lifetime') return 'pro';
  if (row.plan !== 'pro') return 'free';
  if (row.plan_expires_at && new Date(row.plan_expires_at) < new Date()) return 'free';
  return 'pro';
}

/**
 * Granular plan info for display purposes (account dropdown, pricing page,
 * renewal reminders) — getUserPlan() above stays a simple 'free'|'pro' for
 * all existing access-gating checks across the site.
 * @returns {Promise<{ tier: 'free'|'annual'|'lifetime', expiresAt: string|null }>}
 */
export async function getUserPlanDetail(userId) {
  const { rows } = await pool.query(
    `SELECT plan, plan_expires_at FROM users WHERE id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return { tier: 'free', expiresAt: null };
  if (row.plan === 'pro_lifetime') return { tier: 'lifetime', expiresAt: null };
  if (row.plan === 'pro' && row.plan_expires_at && new Date(row.plan_expires_at) > new Date()) {
    return { tier: 'annual', expiresAt: row.plan_expires_at };
  }
  return { tier: 'free', expiresAt: null };
}

export async function requirePro(userId) {
  const plan = await getUserPlan(userId);
  if (plan !== 'pro') {
    return Response.json(
      { error: 'Pro plan required', upgrade: '/pricing' },
      { status: 403 }
    );
  }
  return null;
}
