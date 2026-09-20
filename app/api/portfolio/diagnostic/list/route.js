/**
 * app/api/portfolio/diagnostic/list/route.js
 *
 * GET /api/portfolio/diagnostic/list
 *
 * Authenticated endpoint: returns all portfolio diagnostics created by the
 * logged-in user, including active, expired, and revoked items.
 */

import { auth } from '@/auth';
import pool from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const queryResult = await pool.query(
      `SELECT id, share_token, title, schemes_count, weighted_overlap_pct, q1_equity_pct, created_at, expires_at, revoked
       FROM portfolio_diagnostics
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [session.user.id]
    );

    const diagnostics = queryResult.rows.map((row) => ({
      id: row.id,
      shareToken: row.share_token,
      title: row.title,
      schemesCount: row.schemes_count,
      weightedOverlapPct: row.weighted_overlap_pct != null ? Number(row.weighted_overlap_pct) : null,
      q1EquityPct: row.q1_equity_pct != null ? Number(row.q1_equity_pct) : null,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      revoked: row.revoked,
      isExpired: new Date(row.expires_at) <= new Date(),
    }));

    return Response.json({ ok: true, diagnostics });
  } catch (err) {
    console.error('[portfolio/diagnostic/list]', err);
    return Response.json({ error: 'Failed to list diagnostics' }, { status: 500 });
  }
}
