import pool from '@/lib/db';

/**
 * Returns true if the session user is a paid user (Admin, Distributor, or Pro plan subscriber).
 */
export function isPaidUser(session) {
  if (!session?.user) return false;
  const { role, plan, isPro } = session.user;
  return Boolean(
    role === 'admin' ||
    role === 'distributor' ||
    plan === 'pro' ||
    plan === 'pro_lifetime' ||
    plan === 'lifetime' ||
    isPro
  );
}

/**
 * Returns true if session.user has permission to manage targetUserId's CAS/portfolio data.
 * - Self access: true
 * - Admin role: true (access to all users)
 * - Distributor role: true IF targetUser was created by or allocated to this distributor
 */
export async function canManageUser(session, targetUserId) {
  if (!session?.user?.id || !targetUserId) return false;

  const currentUserId = session.user.id;
  const currentRole = session.user.role;

  // 1. Self access
  if (currentUserId === targetUserId) return true;

  // 2. Admin role has global access
  if (currentRole === 'admin') return true;

  // 3. Distributor role: only if allocated to or created by this distributor
  if (currentRole === 'distributor') {
    try {
      const res = await pool.query(
        'SELECT id FROM users WHERE id = $1 AND (distributor_id = $2 OR created_by = $2) LIMIT 1',
        [targetUserId, currentUserId]
      );
      return res.rows.length > 0;
    } catch (err) {
      console.error('[permissions] canManageUser check error:', err.message);
      return false;
    }
  }

  return false;
}
