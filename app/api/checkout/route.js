/**
 * app/api/checkout/route.js
 *
 * POST /api/checkout
 * Creates a Razorpay order for the Pro plan upgrade.
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

const PLAN_PRICE_PAISE = 99900; // ₹999 in paise

export async function POST() {
  // Instantiate inside the handler so env vars are available at runtime
  const rz = new Razorpay({
    key_id:     process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Sign in to continue' }, { status: 401 });
    }

    const userId = session.user.id;

    // Check if already on Pro
    const { rows } = await pool.query(
      `SELECT plan, plan_expires_at FROM users WHERE id = $1`,
      [userId]
    );
    const user = rows[0];
    if (user?.plan === 'pro' && user.plan_expires_at && new Date(user.plan_expires_at) > new Date()) {
      return Response.json({ error: 'Already on Pro plan' }, { status: 400 });
    }

    const order = await rz.orders.create({
      amount:   PLAN_PRICE_PAISE,
      currency: 'INR',
      receipt:  `pro_${userId.slice(0, 8)}_${Date.now()}`,
      notes:    { userId, plan: 'pro' },
    });

    // Persist order ID so webhook can cross-reference
    await pool.query(
      `UPDATE users SET razorpay_order_id = $1 WHERE id = $2`,
      [order.id, userId]
    );

    return Response.json({ orderId: order.id, amount: PLAN_PRICE_PAISE, currency: 'INR' });

  } catch (err) {
    console.error('[checkout]', err.message);
    return Response.json({ error: 'Could not create order. Try again.' }, { status: 500 });
  }
}
