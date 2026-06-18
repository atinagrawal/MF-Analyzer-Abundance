/**
 * TEMPORARY — delete after confirming Razorpay keys are working
 * GET /api/debug-rzp
 */
import { auth } from '@/auth';

export const runtime  = 'nodejs';
export const dynamic  = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const kid = process.env.RAZORPAY_KEY_ID     ?? '';
  const ks  = process.env.RAZORPAY_KEY_SECRET ?? '';

  return Response.json({
    key_id:     { present: kid.length > 0, prefix: kid.slice(0, 12), length: kid.length },
    key_secret: { present: ks.length  > 0, prefix: ks.slice(0, 4),  length: ks.length  },
  });
}
