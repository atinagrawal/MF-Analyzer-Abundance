/**
 * app/api/proposal-studio/shared/[token]/route.js
 *
 * GET /api/proposal-studio/shared/[token]
 *
 * Public, unauthenticated lookup for a shared proposal -- no auth() call at
 * all, since a share link is meant to be opened by anyone holding it,
 * including someone who has never signed in (see
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md).
 * A revoked link and a link that never existed return the SAME generic 404
 * on purpose -- they must be indistinguishable to a caller. Never returns
 * id, user_id, or blob_key -- only the fields ProposalReadOnlyView needs.
 */

import pool     from '@/lib/db';
import { r2Get } from '@/lib/r2';

export async function GET(req, { params }) {
  try {
    const { token } = await params;
    if (!token) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const result = await pool.query(
      `SELECT blob_key FROM proposals WHERE share_token = $1`,
      [token]
    );
    const row = result.rows[0];
    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const payload = await r2Get(row.blob_key);
    if (!payload) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    return Response.json({
      clientName: payload.clientName,
      clientEmail: payload.clientEmail,
      clientPhone: payload.clientPhone,
      advisorName: payload.advisorName,
      advisorPhone: payload.advisorPhone,
      advisorEmail: payload.advisorEmail,
      advisorArn: payload.advisorArn,
      advisorEuin: payload.advisorEuin,
      advisorArnVerified: payload.advisorArnVerified,
      proposalType: payload.proposalType,
      sipFrequency: payload.sipFrequency,
      selectedFunds: payload.selectedFunds,
    });

  } catch (err) {
    console.error('[proposal-studio/shared]', err.name, err.message);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
