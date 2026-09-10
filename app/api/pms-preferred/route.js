/**
 * app/api/pms-preferred/route.js
 *
 * GET /api/pms-preferred
 * Tells the client whether to render the Pro-gated sortable table on
 * /pms-preferred. The free grid/insights content is identical for every
 * visitor and is rendered server-side in app/pms-preferred/page.jsx
 * directly -- this route exists ONLY for the Pro/free boolean, same
 * composite isPro check as app/api/pms-detail/[id]/route.js.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserPlan } from '@/lib/plan';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  const isPro = Boolean(
    session?.user?.role === 'admin' ||
    session?.user?.plan === 'pro' ||
    session?.user?.plan === 'pro_lifetime' ||
    session?.user?.plan === 'lifetime' ||
    session?.user?.isPro ||
    (session?.user?.id && (await getUserPlan(session.user.id)) === 'pro')
  );
  return NextResponse.json({ isPro });
}
