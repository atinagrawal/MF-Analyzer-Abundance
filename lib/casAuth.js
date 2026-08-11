/**
 * lib/casAuth.js
 *
 * Shared authorization helpers for CAS features keyed by PAN (investor
 * name labels, default-tab preference, ...) rather than by cas_portfolios
 * row -- a PAN can legitimately appear across multiple saved uploads for
 * the same account, and these features apply to the PAN itself, not to
 * one specific upload.
 *
 * Used by app/api/cas/pan-name/route.js and app/api/cas/default-pan/route.js.
 */

import pool from '@/lib/db';

export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/**
 * Resolves which account's saved uploads to authorize against: an admin
 * acting on behalf of a client (targetUserId) authorizes against that
 * CLIENT's own saved uploads, never the admin's own -- everyone else
 * authorizes against their own account.
 */
export function resolveOwnerId(session, targetUserId) {
  return (session.user.role === 'admin' && targetUserId) ? targetUserId : session.user.id;
}

/**
 * Narrows `pans` down to only those the owner has actually seen in one of
 * their own saved cas_portfolios uploads -- enforced server-side against
 * cas_portfolios.pans (populated server-side in /api/cas/save from the
 * parsed CAS itself), never trusted from client-supplied PAN lists.
 */
export async function authorizedPans(ownerId, pans) {
  if (!pans.length) return [];
  const { rows } = await pool.query(
    `SELECT DISTINCT p AS pan
       FROM cas_portfolios, unnest(pans) AS p
      WHERE user_id = $1 AND p = ANY($2)`,
    [ownerId, pans]
  );
  return rows.map(r => r.pan);
}
