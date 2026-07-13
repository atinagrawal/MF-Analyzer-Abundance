/**
 * app/api/user/plan/route.js
 *
 * GET /api/user/plan
 * Returns the current user's plan status.
 * Used by the pricing page to show the correct CTA.
 */

import { auth }              from '@/auth';
import { getUserPlan, getUserPlanDetail } from '@/lib/plan';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ plan: 'free', tier: 'free', expiresAt: null, loggedIn: false });
  }
  const [plan, detail] = await Promise.all([
    getUserPlan(session.user.id),
    getUserPlanDetail(session.user.id),
  ]);
  return Response.json({ plan, tier: detail.tier, expiresAt: detail.expiresAt, loggedIn: true });
}
