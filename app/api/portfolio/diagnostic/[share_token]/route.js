/**
 * app/api/portfolio/diagnostic/[share_token]/route.js
 *
 * GET /api/portfolio/diagnostic/[share_token]
 *
 * Public read-only endpoint: fetches a non-revoked, unexpired portfolio
 * diagnostic snapshot by its high-entropy share_token.
 *
 * Security:
 * - Publicly accessible without session authentication.
 * - Never returns user_id, database UUID, or raw CAS storage keys.
 * - Revoked or expired tokens return a standard 404.
 */

import pool from '@/lib/db';

export async function GET(req, { params }) {
  try {
    const { share_token } = await params;
    if (!share_token || typeof share_token !== 'string' || share_token.length < 16) {
      return Response.json({ error: 'Invalid share token' }, { status: 400 });
    }

    const queryResult = await pool.query(
      `SELECT title, schemes_count, weighted_overlap_pct, q1_equity_pct, payload, created_at, expires_at
       FROM portfolio_diagnostics
       WHERE share_token = $1
         AND NOT revoked
         AND expires_at > NOW()`,
      [share_token]
    );

    if (queryResult.rows.length === 0) {
      return Response.json(
        { error: 'Diagnostic report not found or link has expired' },
        { status: 404 }
      );
    }

    const row = queryResult.rows[0];

    return Response.json(
      {
        ok: true,
        title: row.title,
        schemesCount: row.schemes_count,
        weightedOverlapPct: row.weighted_overlap_pct != null ? Number(row.weighted_overlap_pct) : null,
        q1EquityPct: row.q1_equity_pct != null ? Number(row.q1_equity_pct) : null,
        payload: row.payload,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    console.error('[portfolio/diagnostic/get]', err);
    return Response.json({ error: 'Failed to retrieve diagnostic' }, { status: 500 });
  }
}
