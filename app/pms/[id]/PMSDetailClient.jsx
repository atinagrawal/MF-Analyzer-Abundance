'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProviderAvatar from '@/components/ProviderAvatar';
import { getPMSLogo } from '@/lib/providerLogos';
import { startCheckout } from '@/lib/checkoutClient';
import { buildPmsDetailFaq } from '@/lib/pmsDetailFaq';
import './pms-detail.css';

function fmtCr(v) {
  if (v == null) return '—';
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
}

function fmtInr(v) {
  if (v == null) return '—';
  return `₹${Number(v).toLocaleString('en-IN')}`;
}

export default function PMSDetailClient({ iaid }) {
  const { data: session } = useSession();
  const [state, setState] = useState({ loading: true, error: false, result: null });
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeErr, setUpgradeErr] = useState('');
  const [faqOpen, setFaqOpen] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: false, result: null });
    fetch(`/api/pms-detail/${iaid}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        setState({ loading: false, error: false, result: json });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ loading: false, error: true, result: null });
      });
    return () => { cancelled = true; };
  }, [iaid]);

  async function handleUpgrade() {
    if (!session?.user) { signIn(); return; }
    setUpgradeLoading(true);
    setUpgradeErr('');
    try {
      await startCheckout({
        plan: 'annual',
        session,
        onSuccess() { window.location.reload(); },
        onDismiss() { setUpgradeLoading(false); },
      });
    } catch (e) {
      setUpgradeErr(e.message);
      setUpgradeLoading(false);
    }
  }

  if (state.loading) {
    return (
      <>
        <Navbar />
        <main className="pmsd-page">
          <div className="pmsd-loading">Loading strategy details…</div>
        </main>
        <Footer />
      </>
    );
  }

  if (state.error || !state.result?.data) {
    return (
      <>
        <Navbar />
        <main className="pmsd-page">
          <div className="pmsd-loading">Could not load this strategy right now. Please try again shortly.</div>
        </main>
        <Footer />
      </>
    );
  }

  const { data: d, performance, history, quartile, isPro } = state.result;
  const faq = buildPmsDetailFaq(d);
  const displayName = d.iaName || d.strategyName;

  return (
    <>
      <Navbar />
      <main className="pmsd-page">

        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <div className="pmsd-hero">
          <div className="pmsd-hero-row">
            <div className="pmsd-hero-logo">
              <ProviderAvatar name={d.providerName} logoPath={getPMSLogo(d.providerName)} size={48} radius={10} />
            </div>
            <div className="pmsd-hero-info">
              <h1 className="pmsd-name">{displayName}</h1>
              <div className="pmsd-hero-tags">
                <span className="pmsd-tag">{d.providerName}</span>
                <span className="pmsd-tag green">{d.strategyName}</span>
                {d.benchmark && <span className="pmsd-tag">vs {d.benchmark}</span>}
              </div>
            </div>
          </div>

          <div className="pmsd-hero-stats">
            {d.aumCr != null && (
              <div className="pmsd-stat-item">
                <div className="pmsd-stat-label">AUM</div>
                <div className="pmsd-stat-val">{fmtCr(d.aumCr)}</div>
              </div>
            )}
            {d.inceptionDate && (
              <div className="pmsd-stat-item">
                <div className="pmsd-stat-label">Inception</div>
                <div className="pmsd-stat-val">{d.inceptionDate}</div>
                {d.age && <div className="pmsd-stat-sub">{d.age}</div>}
              </div>
            )}
            {d.minInvestment != null && (
              <div className="pmsd-stat-item">
                <div className="pmsd-stat-label">Min Investment</div>
                <div className="pmsd-stat-val">{fmtInr(d.minInvestment)}</div>
              </div>
            )}
          </div>
        </div>

        {/* ── FEE & TERMS (always free) ───────────────────────────────── */}
        <div className="pmsd-section">
          <div className="pmsd-section-head">
            <span className="pmsd-section-title">Fee &amp; Terms</span>
          </div>
          <div className="pmsd-facts-grid">
            <div className="pmsd-fact-card">
              <div className="pmsd-fact-label">Fixed Fees</div>
              <div className="pmsd-fact-val">{d.fixedFees || '—'}</div>
            </div>
            <div className="pmsd-fact-card">
              <div className="pmsd-fact-label">Variable Fees</div>
              <div className="pmsd-fact-val">{d.variableFees || '—'}</div>
            </div>
            <div className="pmsd-fact-card">
              <div className="pmsd-fact-label">Exit Load</div>
              <div className="pmsd-fact-val">{d.exitLoad || '—'}</div>
            </div>
            <div className="pmsd-fact-card">
              <div className="pmsd-fact-label">Purpose</div>
              <div className="pmsd-fact-val">{d.purpose || '—'}</div>
            </div>
          </div>
        </div>

        {/* ── ⑤ PRO SECTIONS + UPGRADE GATE — added in Task 7 ─────────── */}
        {/* PRO_SECTIONS_PLACEHOLDER */}

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <div className="pmsd-section pmsd-faq">
          <div className="pmsd-section-head">
            <span className="pmsd-section-title">Frequently Asked Questions</span>
          </div>
          {faq.map((item, i) => (
            <div key={i} className="pmsd-faq-item">
              <button className="pmsd-faq-q" onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                {item.q}
                <span className="pmsd-faq-caret">{faqOpen === i ? '−' : '+'}</span>
              </button>
              {faqOpen === i && <div className="pmsd-faq-a">{item.a}</div>}
            </div>
          ))}
        </div>

        <div className="pmsd-disclosure">
          Data sourced from APMI India (Association of Portfolio Managers in India).
          Min PMS investment ₹50L per SEBI. Past performance is not indicative of future results.
          Abundance Financial Services — Atin Kumar Agrawal · ARN-251838 · APRN04279 · APMI Registered PMS Distributor.
        </div>
      </main>
      <Footer />
    </>
  );
}
