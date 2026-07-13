'use client';

/**
 * lib/checkoutClient.js — shared Razorpay checkout trigger for the Pro upgrade
 * flow, used by both app/pricing/page.js and app/market-breadth/page.js's
 * ProGate. Centralizing this avoids the two call sites drifting (they used
 * to duplicate the same ~20 lines) and gives one place to guard against
 * window.Razorpay not being loaded yet — checkout.js loads via
 * strategy="afterInteractive" in app/layout.js, but a fast click or slow
 * network can still beat it, which used to throw a cryptic
 * "window.Razorpay is not a constructor" instead of a clean message.
 */

const PLAN_LABELS = {
    annual: 'Pro Plan — 1 year',
    lifetime: 'Pro Plan — Lifetime',
};

/**
 * @param {Object} opts
 * @param {'annual'|'lifetime'} opts.plan
 * @param {Object} opts.session - NextAuth session (for prefill name/email)
 * @param {Function} opts.onSuccess - called when Razorpay's handler fires
 * @param {Function} opts.onDismiss - called when the popup is closed without paying
 */
export async function startCheckout({ plan, session, onSuccess, onDismiss }) {
    if (typeof window === 'undefined' || typeof window.Razorpay !== 'function') {
        throw new Error('Payment gateway is still loading — please try again in a moment.');
    }

    const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not create order');

    const rzp = new window.Razorpay({
        key: data.keyId,
        order_id: data.orderId,
        amount: data.amount,
        currency: data.currency,
        name: 'Abundance Financial Services',
        description: PLAN_LABELS[plan] || 'Pro Plan',
        image: '/logo-192.png',
        prefill: {
            name: session?.user?.name || '',
            email: session?.user?.email || '',
        },
        theme: { color: '#1a7a4a' },
        handler: onSuccess,
        modal: { ondismiss: onDismiss },
    });
    rzp.open();
}
