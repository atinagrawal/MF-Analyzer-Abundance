'use client';

/**
 * app/login/page.jsx — Login page
 *
 * Sign-in methods:
 *   1. Email magic link — enter email → receive one-click sign-in link
 *   2. Google OAuth     — for users with Google accounts
 *
 * After sending a magic link, a confirmation state is shown.
 * ?verify=1 (set by NextAuth verifyRequest redirect) also shows it.
 */

import { signIn, useSession } from 'next-auth/react';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

// ── Styles ────────────────────────────────────────────────────────────────────

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
  btnOutline: {
    width: '100%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', gap: '10px', padding: '12px 20px',
    background: '#fff', border: '1.5px solid var(--border)',
    borderRadius: '10px', fontSize: '.85rem', fontWeight: 700,
    color: '#1a1a1a', cursor: 'pointer', fontFamily: 'Raleway, sans-serif',
    transition: 'box-shadow .15s, border-color .15s',
  },
};

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

// ── Login content ─────────────────────────────────────────────────────────────

function LoginContent() {
  const { data: session, status } = useSession();
  const router       = useRouter();
  const searchParams = useSearchParams();
  const from         = searchParams.get('from')   || '/';
  const verify       = searchParams.get('verify') === '1';

  const [email,     setEmail]     = useState('');
  const [emailStep, setEmailStep] = useState(verify ? 'sent' : 'idle');
  // 'idle' | 'sending' | 'sent' | 'error'
  const [sentTo,    setSentTo]    = useState('');
  const [errMsg,    setErrMsg]    = useState('');

  useEffect(() => {
    if (status === 'authenticated') router.replace(from);
  }, [status, router, from]);

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="sk" style={{ width: 120, height: 16, borderRadius: 8 }} />
      </div>
    );
  }

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setEmailStep('sending');
    setErrMsg('');
    try {
      const res = await signIn('nodemailer', { email: trimmed, callbackUrl: from, redirect: false });
      if (res?.error) {
        setEmailStep('error');
        setErrMsg(res.error === 'EmailSignin'
          ? 'Could not send the email. Please check the address and try again.'
          : `Error: ${res.error}`);
      } else {
        setSentTo(trimmed);
        setEmailStep('sent');
      }
    } catch {
      setEmailStep('error');
      setErrMsg('Something went wrong. Please try again.');
    }
  };

  const reset = () => { setEmailStep('idle'); setEmail(''); setSentTo(''); setErrMsg(''); };

  return (
    <>
      <div className="container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 20px' }}>

          <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderTop: '4px solid var(--g1)', borderRadius: 'var(--r)', padding: '40px', maxWidth: '400px', width: '100%', boxShadow: 'var(--shadow)', textAlign: 'center' }}>

            {/* Logo */}
            <div style={{ margin: '0 auto 20px' }}>
              <img src="/logo-navbar.png" alt="Abundance Financial Services"
                style={{ height: 52, width: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
            </div>

            <h1 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-.4px', marginBottom: '6px' }}>
              Sign in to Abundance
            </h1>

            {emailStep !== 'sent' && (
              <p style={{ fontSize: '.8rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '28px' }}>
                Access your CAS portfolio tracker and saved data.
              </p>
            )}

            {/* ── Sent state ── */}
            {emailStep === 'sent' && (
              <div style={{ padding: '20px 16px', background: 'var(--g-xlight)', border: '1.5px solid var(--g-light)', borderRadius: 12, marginBottom: 20, textAlign: 'left' }}>
                <div style={{ fontSize: '1.6rem', marginBottom: 10 }}>📬</div>
                <div style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--g1)', marginBottom: 6 }}>Check your email</div>
                <div style={{ fontSize: '.78rem', color: 'var(--text)', lineHeight: 1.6 }}>
                  A sign-in link was sent to{' '}
                  <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{sentTo || email}</strong>.
                  Click the link in that email to sign in.
                </div>
                <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
                  The link expires in 24 hours. Check your spam folder if you don't see it.
                </div>
              </div>
            )}

            {/* ── Error state ── */}
            {emailStep === 'error' && (
              <div style={{ padding: '12px 14px', background: 'var(--neg-bg)', border: '1.5px solid #ffcdd2', borderRadius: 10, marginBottom: 16, fontSize: '.78rem', color: 'var(--neg)', textAlign: 'left' }}>
                ⚠ {errMsg}
              </div>
            )}

            {/* ── Email form ── */}
            {emailStep !== 'sent' && (
              <form onSubmit={handleEmailSubmit} style={{ marginBottom: 16 }}>
                <input type="email" required value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{ ...S.input, marginBottom: 10 }}
                  onFocus={e => e.target.style.borderColor = 'var(--g2)'}
                  onBlur={e  => e.target.style.borderColor = 'var(--border)'}
                  disabled={emailStep === 'sending'}
                />
                <button type="submit"
                  style={{ ...S.btnGreen, opacity: emailStep === 'sending' ? .65 : 1, cursor: emailStep === 'sending' ? 'not-allowed' : 'pointer' }}
                  disabled={emailStep === 'sending'}
                  onMouseEnter={e => { if (emailStep !== 'sending') e.currentTarget.style.background = 'var(--g2)'; }}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--g1)'}
                >
                  {emailStep === 'sending' ? 'Sending…' : '✉ Send sign-in link'}
                </button>
              </form>
            )}

            {/* ── Try different email ── */}
            {emailStep === 'sent' && (
              <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.75rem', color: 'var(--g2)', fontWeight: 700, fontFamily: 'Raleway, sans-serif', marginBottom: 16, padding: '4px 0' }}>
                Use a different email
              </button>
            )}

            {/* ── Divider ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 16px' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              <span style={{ fontSize: '.65rem', color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>or</span>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            {/* ── Google button ── */}
            <button onClick={() => signIn('google', { callbackUrl: from })} style={S.btnOutline}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = 'var(--shadow)'; e.currentTarget.style.borderColor = 'var(--border2)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <GoogleIcon /> Continue with Google
            </button>
          </div>

          <p style={{ fontSize: '.62rem', color: 'var(--muted)', textAlign: 'center', marginTop: '20px', maxWidth: '380px', lineHeight: 1.7, fontFamily: "'JetBrains Mono', monospace" }}>
            By signing in you agree to our terms. We only use your account for authentication —
            we never access your inbox or post on your behalf.
          </p>
        </main>
      </div>
      <Footer />
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="sk" style={{ width: 120, height: 16, borderRadius: 8 }} />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
