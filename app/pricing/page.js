'use client';

import { useState, useEffect } from 'react';
import { useSession }          from 'next-auth/react';
import Navbar                  from '@/components/Navbar';
import Footer                  from '@/components/Footer';
import { startCheckout }       from '@/lib/checkoutClient';
import { PRICING_FAQ }         from './pricingFaq';

const FREE_FEATURES = [
  'MF & SIF Screener (2,500+ funds on live AMFI NAVs)',
  'Top 10 Portfolio Holdings disclosure per scheme',
  'MF Calculator & SIP / SWP Backtester',
  'Rolling Returns Consistency Analyser (1Y–10Y)',
  'NSE Index Dashboard & Market Watch',
  'Sector Heatmap & Market Breadth overview',
  'SEBI Stress Test & Liquidity metrics (days to liquidate)',
  'Industry AUM Pulse & Monthly Report Card',
];

const PRO_FEATURES = [
  'Everything included in Free',
  'Full Portfolio Holdings Disclosure (complete 30–100+ stocks beyond Top 10)',
  'Proposal Studio — multi-fund proposal builder with PDF & link sharing',
  'Pairwise Fund Overlap Analyzer — detect stock duplication across funds',
  'AMFI Market-Cap Allocation — official Large, Mid & Small Cap split',
  'CAS Portfolio Tracker — upload CAMS & KFintech PDFs for XIRR & Goal Tracking',
  'Market Breadth Pro — Nifty 500 breadth, 200 DMA indicators & market regime',
  'Priority support & unlimited data tools',
];

const LIFETIME_FEATURES = [
  'Everything in Pro',
  'One-time payment — never renews or expires',
  'Locked-in price — future price increases never apply to you',
  'Permanent access to all upcoming Pro tools & disclosures',
];

const MATRIX_ROWS = [
  { feat: 'MF & SIF Screener', desc: 'Screen 2,500+ mutual funds and SIFs with live AMFI NAVs', free: '✅ 2,500+ Funds', pro: '✅ 2,500+ Funds' },
  { feat: 'Top 10 Portfolio Holdings', desc: 'View top 10 stocks, concentration & top sector exposure', free: '✅ Included', pro: '✅ Included' },
  { feat: 'Complete Portfolio Holdings', desc: 'Unlock full 30–100+ stock holdings with exact weightages', free: '🔒 Top 10 Only', pro: '✅ Full Holdings Disclosure' },
  { feat: 'Proposal Studio & Proposal Builder', desc: 'Combine funds into professional proposals with PDF/share links', free: '🔒 Gated', pro: '✅ Unlimited Proposals' },
  { feat: 'Pairwise Fund Overlap Analyzer', desc: 'Calculate stock duplication % across portfolio funds', free: '🔒 Gated', pro: '✅ Full Overlap Engine' },
  { feat: 'AMFI Market-Cap Breakdown', desc: 'Official Large, Mid, Small Cap split based on AMFI list', free: '🔒 Gated', pro: '✅ Exact M-Cap Split' },
  { feat: 'CAS Portfolio Tracker & XIRR', desc: 'Upload CAMS & KFintech statements for XIRR & Goal tracking', free: '🔒 Gated', pro: '✅ Unlimited Uploads' },
  { feat: 'Market Breadth Pro', desc: 'Nifty 500 stocks above 200 DMA & advance-decline signals', free: '🔒 Basic Overview', pro: '✅ Full Pro Dashboard' },
  { feat: 'SEBI Stress Test & Liquidity', desc: 'Days to liquidate 25%/50% portfolio under market stress', free: '✅ Included', pro: '✅ Included' },
  { feat: 'SIP & SWP Backtester', desc: 'Backtest strategy returns on real historical NAV data', free: '✅ Included', pro: '✅ Included' },
  { feat: 'Rolling Returns Analyser', desc: 'Evaluate 1Y–10Y consistency vs 100+ NSE benchmarks', free: '✅ Included', pro: '✅ Included' },
];

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PricingPage() {
  const { data: session, status } = useSession();
  const [tier, setTier]           = useState(null); // 'free' | 'annual' | 'lifetime'
  const [expiresAt, setExpiresAt] = useState(null);
  const [loadingPlan, setLoadingPlan] = useState(null); // null | 'annual' | 'lifetime'
  const [error, setError]         = useState('');
  const [faqOpen, setFaqOpen]     = useState(-1);

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
            <span className="eyebrow-text">Plans &amp; Pricing</span>
          </div>
          <h1 className="page-title">
            Simple, <span>transparent</span> pricing for serious investors
          </h1>
          <p className="page-subtitle" style={{ maxWidth: 580, margin: '0 auto' }}>
            Explore all market screeners &amp; calculators for free. Upgrade to <strong>Abundance Pro</strong> for Proposal Studio, Fund Overlap, Complete Portfolio Holdings, and CAS Portfolio Tracking.
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
            <p className="pricing-tagline">Essential fund screeners &amp; backtesting tools — no sign-in required.</p>
            <ul className="pricing-features">
              {FREE_FEATURES.map(f => (
                <li key={f}><span className="feat-check free-check">✓</span>{f}</li>
              ))}
            </ul>
            <div className="pricing-cta">
              <a href="/screener" className="pricing-btn pricing-btn-ghost">Explore Free Tools →</a>
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
            <p className="pricing-tagline">Total ₹588.82 · Proposal Studio, Overlap Analyzer, Full Holdings &amp; CAS Tracker.</p>
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
            <p className="pricing-tagline">Total ₹2,358.82 · Pay once, Pro forever — no renewals or hidden fees, ever.</p>
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

        {/* ── Side-by-side Feature Comparison Matrix ── */}
        <section className="pricing-matrix-wrap" aria-labelledby="matrix-heading">
          <h2 id="matrix-heading" className="pricing-matrix-title">Detailed Feature Comparison</h2>
          <p className="pricing-matrix-sub">Compare what is included in the Free tier versus Abundance Pro</p>
          
          <div className="pricing-matrix-table-wrap">
            <table className="pricing-matrix-table">
              <thead>
                <tr>
                  <th>Platform Feature</th>
                  <th className="col-free">Free Tier</th>
                  <th className="col-pro">Abundance Pro ⭐</th>
                </tr>
              </thead>
              <tbody>
                {MATRIX_ROWS.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <span className="pricing-matrix-feat">{r.feat}</span>
                      <span className="pricing-matrix-desc">{r.desc}</span>
                    </td>
                    <td className="col-free">{r.free}</td>
                    <td className="col-pro">{r.pro}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── SEO Rich FAQ Section ── */}
        <section className="pricing-faq" aria-labelledby="pricing-faq-heading">
          <h2 id="pricing-faq-heading" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', textAlign: 'center', marginBottom: 24 }}>
            Frequently Asked Questions
          </h2>
          <div className="faq-grid">
            {PRICING_FAQ.map((item, idx) => (
              <div className="faq-item" key={idx}>
                <h3>{item.q}</h3>
                <p>{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <Footer />
    </>
  );
}
