'use client';

/**
 * app/complete-profile/page.jsx
 *
 * Required first step for an account with no name (always an email/OTP
 * signup -- Google always provides one). See
 * components/ProfileCompletionGate.jsx for why this happens here instead
 * of before account creation.
 */

import { useState, Suspense } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
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

function CompleteProfileContent() {
  const { status, update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/';

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="sk" style={{ width: 120, height: 16, borderRadius: 8 }} />
      </div>
    );
  }

  if (status === 'unauthenticated') {
    router.replace('/login');
    return null;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please enter your name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/account/complete-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong.');
      await update(); // refetch session so session.user.name picks up the new value
      // Hard navigate so the freshly-updated session is picked up cleanly,
      // matching app/login/page.jsx's own pattern after a session change.
      window.location.href = from;
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  }

  return (
    <>
      <div className="container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 20px' }}>
          <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderTop: '4px solid var(--g1)', borderRadius: 'var(--r)', padding: '40px', maxWidth: '400px', width: '100%', boxShadow: 'var(--shadow)', textAlign: 'center' }}>
            <div style={{ margin: '0 auto 20px' }}>
              <img src="/logo-navbar.png" alt="Abundance Financial Services"
                style={{ height: 52, width: 'auto', objectFit: 'contain', display: 'block', margin: '0 auto' }} />
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-.4px', marginBottom: '6px' }}>
              One last step
            </h1>
            <p style={{ fontSize: '.8rem', color: 'var(--muted)', lineHeight: 1.6, marginBottom: '28px' }}>
              What's your name? We'll use it on your proposals and account.
            </p>
            <form onSubmit={handleSubmit}>
              <input type="text" required value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                style={{ ...S.input, marginBottom: 10 }}
                onFocus={(e) => { e.target.style.borderColor = 'var(--g2)'; }}
                onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; }}
                disabled={saving}
                autoFocus
              />
              {error && (
                <div style={{ padding: '10px 12px', background: 'var(--neg-bg)', border: '1.5px solid #ffcdd2', borderRadius: 9, marginBottom: 10, fontSize: '.72rem', color: 'var(--neg)', textAlign: 'left' }}>
                  ⚠ {error}
                </div>
              )}
              <button type="submit"
                style={{ ...S.btnGreen, opacity: saving ? .65 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
                disabled={saving}
                onMouseEnter={(e) => { if (!saving) e.currentTarget.style.background = 'var(--g2)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--g1)'; }}
              >
                {saving ? 'Saving…' : 'Continue'}
              </button>
            </form>
          </div>
        </main>
      </div>
      <Footer />
    </>
  );
}

export default function CompleteProfilePage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="sk" style={{ width: 120, height: 16, borderRadius: 8 }} />
      </div>
    }>
      <CompleteProfileContent />
    </Suspense>
  );
}
