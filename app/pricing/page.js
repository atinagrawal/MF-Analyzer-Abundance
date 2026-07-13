'use client';

import { useState, useEffect } from 'react';
import { useSession }          from 'next-auth/react';
import Navbar                  from '@/components/Navbar';
import Footer                  from '@/components/Footer';
import { startCheckout }       from '@/lib/checkoutClient';

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

const LIFETIME_FEATURES = [
  'Everything in Pro',
  'One-time payment — never renews',
  'Locked-in price, future price rises don’t apply to you',
];

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PricingPage() {
  const { data: session, status } = useSession();
  const [tier, setTier]         = useState(null); // 'free' | 'annual' | 'lifetime'
  const [expiresAt, setExpiresAt] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(null); // null | 'annual' | 'lifetime'
  const [error, setError]       = useState('');

  useEffect(() => {
    fetch('/api/user/plan')
      .then(r => r.json())
      .then(d => { setTier(d.tier || 'free'); setExpiresAt(d.expiresAt || null); })
      .catch(() => setTier('free'));
  }, []);

  async function handleUpgrade(plan) {
    if (status !== 'authenticated') {
      window.location.href = '/login?callbackUrl=/pricing';
      return;
    }

    setLoadingPlan(plan);
    setError('');

    try {
      await startCheckout({
        plan,
        session,
        onSuccess() {
          setLoadingPlan(null);
          setTier(plan);
          setExpiresAt(plan === 'annual' ? new Date(Date.now() + 365 * 864e5).toISOString() : null);
        },
        onDismiss() { setLoadingPlan(null); },
      });
    } catch (err) {
      setError(err.message);
      setLoadingPlan(null);
    }
  }

  const tierKnown = tier !== null;

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

        <div className="pricing-grid pricing-grid-3">
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

          {/* ── Pro Annual card ── */}
          <div className="pricing-card pricing-card-pro">
            <div className="pricing-badge">Most popular</div>
            <div className="pricing-tier pro-tier">Pro — Annual</div>
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
              {tier === 'lifetime' ? (
                <div className="pricing-pro-active">✓ Included in your Lifetime plan</div>
              ) : tier === 'annual' ? (
                <div className="pricing-pro-active">
                  ✓ You&apos;re on Pro{expiresAt && <> until {fmtDate(expiresAt)}</>}
                  <a href="/portfolio" className="pricing-btn pricing-btn-ghost" style={{ marginTop: 10 }}>
                    Open Portfolio →
                  </a>
                </div>
              ) : (
                <>
                  <button
                    className="pricing-btn pricing-btn-primary"
                    onClick={() => handleUpgrade('annual')}
                    disabled={!!loadingPlan || !tierKnown}
                  >
                    {loadingPlan === 'annual' ? 'Opening checkout…' : status !== 'authenticated' ? 'Sign in to upgrade' : 'Upgrade to Pro — ₹499 + GST'}
                  </button>
                  <p className="pricing-secure">🔒 Secured by Razorpay · UPI, Cards, Net Banking</p>
                </>
              )}
            </div>
          </div>

          {/* ── Pro Lifetime card ── */}
          <div className="pricing-card pricing-card-lifetime">
            <div className="pricing-badge pricing-badge-lifetime">Best long-term value</div>
            <div className="pricing-tier lifetime-tier">Pro — Lifetime</div>
            <div className="pricing-price">
              <span className="pricing-amount">₹1,999</span>
              <span className="pricing-period">one-time + 18% GST</span>
            </div>
            <p className="pricing-tagline">Total ₹2,358.82 · Pay once, Pro forever — no renewals, ever.</p>
            <ul className="pricing-features">
              {LIFETIME_FEATURES.map(f => (
                <li key={f}><span className="feat-check lifetime-check">✓</span>{f}</li>
              ))}
            </ul>

            <div className="pricing-cta">
              {tier === 'lifetime' ? (
                <div className="pricing-pro-active">
                  ✓ You&apos;re a Lifetime member
                  <a href="/portfolio" className="pricing-btn pricing-btn-ghost" style={{ marginTop: 10 }}>
                    Open Portfolio →
                  </a>
                </div>
              ) : (
                <>
                  <button
                    className="pricing-btn pricing-btn-lifetime"
                    onClick={() => handleUpgrade('lifetime')}
                    disabled={!!loadingPlan || !tierKnown}
                  >
                    {loadingPlan === 'lifetime' ? 'Opening checkout…' : status !== 'authenticated' ? 'Sign in to upgrade' : 'Get Lifetime — ₹1,999 + GST'}
                  </button>
                  <p className="pricing-secure">🔒 Secured by Razorpay · UPI, Cards, Net Banking</p>
                </>
              )}
            </div>
          </div>
        </div>

        {error && <p className="pricing-error" style={{ textAlign: 'center', marginTop: -24, marginBottom: 24 }}>{error}</p>}

        <div className="pricing-faq">
          <h3>Frequently asked questions</h3>
          <div className="faq-grid">
            <div className="faq-item">
              <strong>Is my payment secure?</strong>
              <p>Yes. Payments are processed by Razorpay, a PCI DSS-compliant gateway. We never store your card details.</p>
            </div>
            <div className="faq-item">
              <strong>How long does Pro last?</strong>
              <p>Annual Pro is valid for 1 year from payment — you&apos;ll see a reminder in your account menu as expiry approaches. Lifetime Pro never expires.</p>
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
