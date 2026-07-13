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

  // Verify the payload came from Razorpay.
  // Use timingSafeEqual to prevent timing-based signature oracle attacks.
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(body)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'hex');
  let signatureBuf;
  try { signatureBuf = Buffer.from(signature, 'hex'); } catch { signatureBuf = Buffer.alloc(0); }

  const valid = expectedBuf.length === signatureBuf.length &&
                crypto.timingSafeEqual(expectedBuf, signatureBuf);

  if (!valid) {
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
    const plan    = payment?.notes?.plan === 'lifetime' ? 'lifetime' : 'annual';

    if (!userId) {
      console.error('[razorpay-webhook] payment.captured missing userId in notes', payment?.id);
      return Response.json({ ok: true }); // acknowledge to stop retries
    }

    // Validate amount, currency, and status — reject anything that doesn't
    // match the expected plan price to prevent replayed or manipulated events.
    const expectedAmount = plan === 'lifetime' ? 235882 : 58882;
    if (payment.amount !== expectedAmount || payment.currency !== 'INR' || payment.status !== 'captured') {
      console.warn('[razorpay-webhook] unexpected amount/currency/status', payment.id, payment.amount, payment.currency, payment.status);
      return Response.json({ ok: true });
    }

    // Cross-check order_id against what we stored at checkout time so a
    // payment from a different user's order cannot activate someone else's plan.
    const { rows: orderRows } = await pool.query(
      `SELECT id FROM users WHERE id = $1 AND razorpay_order_id = $2`,
      [userId, payment.order_id]
    );
    if (!orderRows[0]) {
      console.warn('[razorpay-webhook] order_id/user mismatch — ignoring', payment.id);
      return Response.json({ ok: true });
    }

    if (plan === 'lifetime') {
      await pool.query(
        `UPDATE users
            SET plan              = 'pro_lifetime',
                plan_expires_at   = NULL,
                razorpay_order_id = $1
          WHERE id = $2`,
        [payment.order_id, userId]
      );
      console.log(`[razorpay-webhook] Lifetime Pro activated for user ${userId}`);
    } else {
      // Grant Pro for 1 year from today
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      await pool.query(
        `UPDATE users
            SET plan              = 'pro',
                plan_expires_at   = $1,
                razorpay_order_id = $2
          WHERE id = $3`,
        [expiresAt, payment.order_id, userId]
      );
      console.log(`[razorpay-webhook] Pro activated for user ${userId} until ${expiresAt.toISOString()}`);
    }
  }

  return Response.json({ ok: true });
}
