/**
 * app/api/user/plan/route.js
 *
 * GET /api/user/plan
 * Returns the current user's plan status.
 * Used by the pricing page to show the correct CTA.
 */

import { auth }        from '@/auth';
import { getUserPlan } from '@/lib/plan';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ plan: 'free', loggedIn: false });
  }
  const plan = await getUserPlan(session.user.id);
  return Response.json({ plan, loggedIn: true });
}
