'use client';

import { useState, useEffect } from 'react';
import { useSession }          from 'next-auth/react';
import Navbar                  from '@/components/Navbar';
import Footer                  from '@/components/Footer';

const FREE_FEATURES = [
  'MF Calculator & SIP/SWP Backtester',
  'Rolling Returns Comparison',
  'Index Dashboard & Market Breadth',
  'MF Screener (500+ funds)',
  'PMS & SIF Screener',
  'Market Watch & Sector Heatmap',
  'Industry Pulse & Report Card',
];

const PRO_FEATURES = [
  'Everything in Free',
  'CAS Portfolio Tracker — upload & analyse',
  'Portfolio XIRR & Goal Tracking',
  'Stress Test your portfolio',
  'Unlimited CAS uploads',
  'Priority support',
];

export default function PricingPage() {
  const { data: session, status } = useSession();
  const [planStatus, setPlanStatus]   = useState(null); // 'free' | 'pro'
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState(false);

  useEffect(() => {
    fetch('/api/user/plan')
      .then(r => r.json())
      .then(d => setPlanStatus(d.plan))
      .catch(() => setPlanStatus('free'));
  }, []);

  async function handleUpgrade() {
    if (status !== 'authenticated') {
      window.location.href = '/login?callbackUrl=/pricing';
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/checkout', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not create order');

      const rzp = new window.Razorpay({
        key:         process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        order_id:    data.orderId,
        amount:      data.amount,
        currency:    data.currency,
        name:        'Abundance Financial Services',
        description: 'Pro Plan — 1 year',
        image:       '/logo-192.png',
        prefill: {
          name:  session?.user?.name  || '',
          email: session?.user?.email || '',
        },
        theme: { color: '#1a7a4a' },
        handler() {
          setSuccess(true);
          setLoading(false);
          setPlanStatus('pro');
        },
        modal: {
          ondismiss() { setLoading(false); },
        },
      });
      rzp.open();
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  const isPro     = planStatus === 'pro';
  const planKnown = planStatus !== null;

  return (
    <>
      <div className="container">
        <Navbar activePage="pricing" />

        <div className="page-header" style={{ textAlign: 'center', marginBottom: 40 }}>
          <div className="page-eyebrow" style={{ justifyContent: 'center' }}>
            <span className="eyebrow-text">Plans & Pricing</span>
          </div>
          <h1 className="page-title">
            Simple, <span>transparent</span> pricing
          </h1>
          <p className="page-subtitle" style={{ maxWidth: 480, margin: '0 auto' }}>
            Start free. Upgrade to Pro for portfolio tracking and advanced analytics.
          </p>
        </div>

        <div className="pricing-grid">
          {/* ── Free card ── */}
          <div className="pricing-card">
            <div className="pricing-tier">Free</div>
            <div className="pricing-price">
              <span className="pricing-amount">₹0</span>
              <span className="pricing-period">forever</span>
            </div>
            <p className="pricing-tagline">All market data & fund tools — no sign-in needed.</p>
            <ul className="pricing-features">
              {FREE_FEATURES.map(f => (
                <li key={f}><span className="feat-check free-check">✓</span>{f}</li>
              ))}
            </ul>
            <div className="pricing-cta">
              <a href="/" className="pricing-btn pricing-btn-ghost">Explore for free</a>
            </div>
          </div>

          {/* ── Pro card ── */}
          <div className="pricing-card pricing-card-pro">
            <div className="pricing-badge">Best value</div>
            <div className="pricing-tier pro-tier">Pro</div>
            <div className="pricing-price">
              <span className="pricing-amount">₹499</span>
              <span className="pricing-period">/yr + 18% GST</span>
            </div>
            <p className="pricing-tagline">Total ₹588.82 · Market Breadth, Stock Screener, Portfolio Tracker & more.</p>
            <ul className="pricing-features">
              {PRO_FEATURES.map(f => (
                <li key={f}><span className="feat-check pro-check">✓</span>{f}</li>
              ))}
            </ul>

            <div className="pricing-cta">
              {success || isPro ? (
                <div className="pricing-pro-active">
                  ✓ You&apos;re on Pro
                  <a href="/portfolio" className="pricing-btn pricing-btn-ghost" style={{ marginTop: 10 }}>
                    Open Portfolio →
                  </a>
                </div>
              ) : (
                <>
                  <button
                    className="pricing-btn pricing-btn-primary"
                    onClick={handleUpgrade}
                    disabled={loading || !planKnown}
                  >
                    {loading ? 'Opening checkout…' : status !== 'authenticated' ? 'Sign in to upgrade' : 'Upgrade to Pro — ₹499 + GST'}
                  </button>
                  {error && <p className="pricing-error">{error}</p>}
                  <p className="pricing-secure">🔒 Secured by Razorpay · UPI, Cards, Net Banking</p>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="pricing-faq">
          <h3>Frequently asked questions</h3>
          <div className="faq-grid">
            <div className="faq-item">
              <strong>Is my payment secure?</strong>
              <p>Yes. Payments are processed by Razorpay, a PCI DSS-compliant gateway. We never store your card details.</p>
            </div>
            <div className="faq-item">
              <strong>How long does Pro last?</strong>
              <p>Pro is valid for 1 year from the date of payment. Renewal reminders are sent before expiry.</p>
            </div>
            <div className="faq-item">
              <strong>What payment methods are accepted?</strong>
              <p>UPI, credit/debit cards, net banking, and wallets — all major Indian payment methods.</p>
            </div>
            <div className="faq-item">
              <strong>Can I get a refund?</strong>
              <p>Contact us within 7 days if you&apos;re not satisfied. We&apos;ll process a full refund.</p>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </>
  );
}
