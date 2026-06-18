/**
 * app/api/webhooks/razorpay/route.js
 *
 * POST /api/webhooks/razorpay
 *
 * Razorpay sends events here after each payment.
 * We verify the webhook signature using RAZORPAY_WEBHOOK_SECRET
 * (set in Razorpay Dashboard → Settings → Webhooks).
 *
 * Handled events:
 *   payment.captured  → activate Pro plan for 1 year
 *   payment.failed    → no action (user can retry)
 *
 * Configure in Razorpay Dashboard:
 *   URL: https://mfcalc.getabundance.in/api/webhooks/razorpay
 *   Active events: payment.captured
 */

import crypto from 'crypto';
import pool   from '@/lib/db';

export const runtime = 'nodejs';

export async function POST(req) {
  const body      = await req.text();
  const signature = req.headers.get('x-razorpay-signature');

  if (!signature) {
    return Response.json({ error: 'Missing signature' }, { status: 400 });
  }

  // Verify the payload came from Razorpay
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  if (expected !== signature) {
    console.warn('[razorpay-webhook] invalid signature');
    return Response.json({ error: 'Invalid signature' }, { status: 400 });
  }

  let event;
  try {
    event = JSON.parse(body);
  } catch {
    return Response.json({ error: 'Bad JSON' }, { status: 400 });
  }

  if (event.event === 'payment.captured') {
    const payment = event.payload?.payment?.entity;
    const userId  = payment?.notes?.userId;

    if (!userId) {
      console.error('[razorpay-webhook] payment.captured missing userId in notes', payment?.id);
      return Response.json({ ok: true }); // acknowledge to stop retries
    }

    // Grant Pro for 1 year from today
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await pool.query(
      `UPDATE users
          SET plan              = 'pro',
              plan_expires_at   = $1,
              razorpay_order_id = $2
        WHERE id = $3`,
      [expiresAt, payment.order_id ?? null, userId]
    );

    console.log(`[razorpay-webhook] Pro activated for user ${userId} until ${expiresAt.toISOString()}`);
  }

  return Response.json({ ok: true });
}
