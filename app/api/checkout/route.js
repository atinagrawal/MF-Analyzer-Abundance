/**
 * app/api/checkout/route.js
 *
 * POST /api/checkout  { plan: 'annual' | 'lifetime' }
 * Creates a Razorpay order for the requested Pro plan tier.
 * Returns { orderId, amount, currency } to the client.
 *
 * The client then opens the Razorpay popup with the orderId,
 * completes payment, and our webhook confirms the transaction.
 */

import Razorpay from 'razorpay';
import pool     from '@/lib/db';
import { auth } from '@/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ₹499 + 18% GST = ₹588.82 · ₹1999 + 18% GST = ₹2358.82
const PLANS = {
  annual:   { amountPaise: 58882,  receipt: 'pro' },
  lifetime: { amountPaise: 235882, receipt: 'life' },
};

export async function POST(request) {
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('[checkout] Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET env vars');
      return Response.json({ error: 'Payment not configured. Try again later.' }, { status: 503 });
    }

    const body = await request.json().catch(() => ({}));
    const plan = PLANS[body.plan] ? body.plan : 'annual';
    const { amountPaise, receipt } = PLANS[plan];

    const rz = new Razorpay({
      key_id:     process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Sign in to continue' }, { status: 401 });
    }

    const userId = session.user.id;

    // Check if already on this plan (or better)
    const { rows } = await pool.query(
      `SELECT plan, plan_expires_at FROM users WHERE id = $1`,
      [userId]
    );
    const user = rows[0];
    if (user?.plan === 'pro_lifetime') {
      return Response.json({ error: 'You already have Lifetime access.' }, { status: 400 });
    }
    if (plan === 'annual' && user?.plan === 'pro' && user.plan_expires_at && new Date(user.plan_expires_at) > new Date()) {
      return Response.json({ error: 'Already on Pro plan' }, { status: 400 });
    }

    const order = await rz.orders.create({
      amount:   amountPaise,
      currency: 'INR',
      receipt:  `${receipt}_${userId.slice(0, 8)}_${Date.now()}`,
      notes:    { userId, plan },
    });

    // Persist order ID so webhook can cross-reference
    await pool.query(
      `UPDATE users SET razorpay_order_id = $1 WHERE id = $2`,
      [order.id, userId]
    );

    return Response.json({ orderId: order.id, amount: amountPaise, currency: 'INR', keyId: process.env.RAZORPAY_KEY_ID });

  } catch (err) {
    // Razorpay SDK throws plain objects, not Error instances
    const msg = err?.message || err?.error?.description || JSON.stringify(err);
    console.error('[checkout]', msg);
    return Response.json({ error: 'Could not create order. Try again.' }, { status: 500 });
  }
}
