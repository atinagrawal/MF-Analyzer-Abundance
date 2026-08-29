'use client';

/**
 * app/book-consultation/page.jsx — Book a Consultation
 *
 * Flow: name+email form -> email a 6-digit code (anti-spam gate, no sign-in
 * required) -> on verification, reveal the Cal.com booking embed prefilled
 * with the verified name/email. See docs/superpowers/specs/
 * 2026-07-27-book-consultation-design.md for the full design rationale.
 */

import { useState } from 'react';
import Cal from '@calcom/embed-react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { BOOK_CONSULTATION_FAQ } from './faqData';

const S = {
  input: {
    width: '100%', padding: '12px 14px',
    border: '1.5px solid var(--border)', borderRadius: '10px',
    fontSize: '.85rem', fontWeight: 600, fontFamily: 'Raleway, sans-serif',
    background: 'var(--s2)', color: 'var(--text)', outline: 'none',
    boxSizing: 'border-box', transition: 'border-color .15s',
  },
  btnGreen: {
    width: '100%', padding: '12px 20px',
    background: 'var(--g1)', border: 'none', borderRadius: '10px',
    fontSize: '.85rem', fontWeight: 800, color: '#fff',
    cursor: 'pointer', fontFamily: 'Raleway, sans-serif',
    letterSpacing: '-.2px', transition: 'background .15s',
  },
};

const ERROR_MESSAGES = {
  invalid_name:        'Please enter your name.',
  invalid_email:       'Please enter a valid email address.',
  invalid_code_format: 'Enter the 6-digit code from your email.',
  too_many_attempts:   'Too many wrong attempts. Please wait about 15 minutes before trying again.',
  wrong_code:          'That code is incorrect or has expired.',
  server_error:        'Something went wrong. Please try again.',
  too_many_requests:   'Please wait a moment before requesting another code.',
};

function errorMessage(code) {
  return ERROR_MESSAGES[code] || 'Something went wrong. Please try again.';
}

const TRUST_STATS = [
  { val: '15+', label: 'Years Experience' },
  { val: '350+', label: 'Clients' },
  { val: '₹250Cr+', label: 'AUM' },
  { val: 'ARN-251838', label: 'AMFI Registered' },
];

const TOPICS = [
  { icon: '📈', title: 'Mutual Funds & SIP', desc: 'Fund selection, SIP/SWP planning, and portfolio review' },
  { icon: '🧾', title: 'Tax-Efficient Investing', desc: 'ELSS, capital gains planning, and holding-period strategy' },
  { icon: '🎯', title: 'Goal-Based Planning', desc: 'Retirement, a home, education, or any specific target' },
  { icon: '💼', title: 'SIF & PMS', desc: 'Specialised Investment Funds and Portfolio Management Services for larger portfolios' },
];

function BookConsultationFaqSection() {
  return (
    <section style={{ padding: '64px 0 0', borderTop: '1px solid var(--border)', marginTop: 64 }}>
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '0 20px' }}>
        <div className="page-eyebrow" style={{ marginBottom: 10 }}>
          <span className="eyebrow-text">Before You Book</span>
        </div>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-.4px', marginBottom: 28 }}>
          Frequently Asked Questions
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {BOOK_CONSULTATION_FAQ.map(({ q, a }, i, arr) => (
            <details key={i} style={{
              borderTop: '1px solid var(--border)',
              borderBottom: i === arr.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <summary style={{
                padding: '16px 4px', cursor: 'pointer', listStyle: 'none',
                fontSize: '.82rem', fontWeight: 800, color: 'var(--text)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                {q}
                <span style={{ fontSize: '1rem', color: 'var(--muted)', flexShrink: 0, marginLeft: 12 }}>+</span>
              </summary>
              <div style={{ padding: '0 4px 16px', fontSize: '.78rem', color: 'var(--text2)', lineHeight: 1.7 }}>
                {a}
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function BookConsultationPage() {
  const [step, setStep]     = useState('form'); // 'form' | 'verify' | 'booking'
  const [name, setName]     = useState('');
  const [email, setEmail]   = useState('');
  const [code, setCode]     = useState('');
  const [busy, setBusy]     = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const handleSendCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrMsg('');
    try {
      const res = await fetch('/api/consultation/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (data.ok) {
        setCode('');
        setStep('verify');
      } else {
        setErrMsg(errorMessage(data.error));
      }
    } catch {
      setErrMsg(errorMessage('server_error'));
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setErrMsg(errorMessage('invalid_code_format'));
      return;
    }
    setBusy(true);
    setErrMsg('');
    try {
      const res = await fetch('/api/consultation/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code }),
      });
      const data = await res.json();
      if (data.ok) {
        setStep('booking');
      } else {
        setErrMsg(errorMessage(data.error));
      }
    } catch {
      setErrMsg(errorMessage('server_error'));
    } finally {
      setBusy(false);
    }
  };

  const handleResend = (e) => handleSendCode(e);

  return (
    <>
      <div className="container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px' }}>

          <div style={{ maxWidth: step === 'booking' ? 720 : 420, width: '100%' }}>

            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-.4px', marginBottom: 8 }}>
                📅 Book a Free Consultation
              </h1>
              <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                30 minutes, no obligation. We'll walk through your goals and how mutual funds, SIPs, SWPs, SIF or PMS can fit your plan.
              </p>
            </div>

            {step === 'form' && (
              <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 24 }}>
                {TRUST_STATS.map(({ val, label }) => (
                  <div key={label} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                    padding: '8px 16px', borderRadius: 10,
                    background: 'var(--s2)', border: '1px solid var(--border)',
                  }}>
                    <span style={{ fontSize: '.85rem', fontWeight: 900, color: 'var(--g1)', fontFamily: "'JetBrains Mono', monospace" }}>{val}</span>
                    <span style={{ fontSize: '.6rem', fontWeight: 700, color: 'var(--muted)', letterSpacing: '.3px' }}>{label}</span>
                  </div>
                ))}
              </div>
            )}

            {step !== 'booking' && (
              <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderTop: '4px solid var(--g1)', borderRadius: 'var(--r)', padding: '32px', boxShadow: 'var(--shadow)' }}>

                {step === 'form' && (
                  <form onSubmit={handleSendCode}>
                    <input type="text" required value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                      style={{ ...S.input, marginBottom: 10 }}
                      disabled={busy}
                    />
                    <input type="email" required value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      style={{ ...S.input, marginBottom: 14 }}
                      disabled={busy}
                    />
                    {errMsg && (
                      <div style={{ padding: '10px 12px', background: 'var(--neg-bg)', border: '1.5px solid #ffcdd2', borderRadius: 9, marginBottom: 14, fontSize: '.75rem', color: 'var(--neg)' }}>
                        ⚠ {errMsg}
                      </div>
                    )}
                    <button type="submit" disabled={busy}
                      style={{ ...S.btnGreen, opacity: busy ? .65 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
                    >
                      {busy ? 'Sending…' : 'Send verification code'}
                    </button>
                    <p style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 12, lineHeight: 1.5, textAlign: 'center' }}>
                      We'll email you a 6-digit code to confirm it's really you — this just keeps spam bookings out.
                    </p>
                  </form>
                )}

                {step === 'verify' && (
                  <form onSubmit={handleVerifyCode}>
                    <div style={{ fontSize: '.8rem', color: 'var(--text)', lineHeight: 1.6, marginBottom: 14 }}>
                      A 6-digit code was sent to{' '}
                      <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{email}</strong>.
                    </div>
                    <input type="text" inputMode="numeric" pattern="\d{6}" maxLength={6} required
                      value={code}
                      onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      style={{ ...S.input, marginBottom: 10, textAlign: 'center', fontSize: '1.3rem', fontWeight: 800, letterSpacing: '6px', fontFamily: "'JetBrains Mono', monospace" }}
                      disabled={busy}
                      autoFocus
                    />
                    {errMsg && (
                      <div style={{ padding: '10px 12px', background: 'var(--neg-bg)', border: '1.5px solid #ffcdd2', borderRadius: 9, marginBottom: 10, fontSize: '.75rem', color: 'var(--neg)' }}>
                        ⚠ {errMsg}
                      </div>
                    )}
                    <button type="submit" disabled={busy}
                      style={{ ...S.btnGreen, opacity: busy ? .65 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
                    >
                      {busy ? 'Verifying…' : 'Verify & continue'}
                    </button>
                    <button type="button" onClick={handleResend} disabled={busy}
                      style={{ background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '.72rem', color: 'var(--g2)', fontWeight: 700, fontFamily: 'Raleway, sans-serif', marginTop: 10, padding: '4px 0' }}
                    >
                      Resend code
                    </button>
                  </form>
                )}
              </div>
            )}

            {step === 'booking' && (
              <>
                <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderTop: '4px solid var(--g1)', borderRadius: 'var(--r)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                  <Cal
                    calLink={`abundance/consultation?name=${encodeURIComponent(name.trim())}&email=${encodeURIComponent(email.trim().toLowerCase())}`}
                    calOrigin="https://cal.eu"
                    embedJsUrl="https://cal.eu/embed/embed.js"
                    config={{ theme: 'light' }}
                    style={{ width: '100%', height: '100%', minHeight: '700px' }}
                  />
                </div>
                <p style={{ fontSize: '.72rem', color: 'var(--muted)', textAlign: 'center', marginTop: 14 }}>
                  Having trouble loading the calendar? Call{' '}
                  <a href="tel:+919808105923" style={{ color: 'var(--g2)', fontWeight: 700 }}>+91 98081 05923</a>
                  {' '}or{' '}
                  <a href="https://wa.me/919808105923" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--g2)', fontWeight: 700 }}>WhatsApp us</a>.
                </p>
              </>
            )}
          </div>

          {step === 'form' && (
            <section style={{ width: '100%', maxWidth: 800, marginTop: 56 }}>
              <div className="page-eyebrow" style={{ marginBottom: 10, justifyContent: 'center', display: 'flex' }}>
                <span className="eyebrow-text">On The Call</span>
              </div>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-.4px', marginBottom: 24, textAlign: 'center' }}>
                What We'll Cover
              </h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
                {TOPICS.map(({ icon, title, desc }) => (
                  <div key={title} style={{
                    background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)',
                    padding: '18px 20px',
                  }}>
                    <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>{icon}</div>
                    <div style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--text)', marginBottom: 4 }}>{title}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--muted)', lineHeight: 1.5 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>

      {step === 'form' && <BookConsultationFaqSection />}

      <Footer />
    </>
  );
}
