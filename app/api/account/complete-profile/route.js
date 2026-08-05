/**
 * app/api/account/complete-profile/route.js
 *
 * POST /api/account/complete-profile
 * Body: { name }
 *
 * Sets a signed-in user's name -- used by app/complete-profile/page.jsx,
 * the required first step for an account that signed up via email/OTP
 * (which never provides a name, unlike Google). See
 * components/ProfileCompletionGate.jsx for why this happens after account
 * creation rather than before it.
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { name } = await req.json();
    const trimmed = (name || '').trim();
    if (!trimmed || trimmed.length > 100) {
      return Response.json({ error: 'Enter a valid name (1-100 characters).' }, { status: 400 });
    }

    await pool.query('UPDATE users SET name = $1 WHERE id = $2', [trimmed, session.user.id]);

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[account/complete-profile]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
