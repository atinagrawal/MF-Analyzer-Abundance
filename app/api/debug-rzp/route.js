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
    key_id:     kid || '(not set)',        // public value — safe to expose
    key_secret: { present: ks.length > 0, length: ks.length }, // no secret material
  });
}
