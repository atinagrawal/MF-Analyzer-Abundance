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
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

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
  too_many_attempts:   'Too many wrong attempts. Request a new code and try again.',
  wrong_code:          'That code is incorrect or has expired.',
  server_error:        'Something went wrong. Please try again.',
};

function errorMessage(code) {
  return ERROR_MESSAGES[code] || 'Something went wrong. Please try again.';
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
              <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderTop: '4px solid var(--g1)', borderRadius: 'var(--r)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 12 }}>✅</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--g1)' }}>Email verified</div>
                  <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: 6 }}>Loading your calendar…</div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      <Footer />
    </>
  );
}
