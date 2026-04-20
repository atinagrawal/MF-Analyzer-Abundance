'use client';

/**
 * app/login/page.jsx — Login page
 *
 * Shows a Google sign-in button. On success, NextAuth creates a session,
 * stores it in Postgres, and redirects back to the page the user came from
 * (via the `from` query param) or to the homepage.
 *
 * Extensible: adding email+password or magic link only requires adding
 * new <button> elements calling signIn('credentials') or signIn('resend').
 */

import { signIn, useSession } from 'next-auth/react';
import { useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

function LoginContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') || '/';

  // If already signed in, redirect immediately
  useEffect(() => {
    if (status === 'authenticated') {
      router.replace(from);
    }
  }, [status, router, from]);

  const handleGoogle = () => {
    signIn('google', { callbackUrl: from });
  };

  if (status === 'loading' || status === 'authenticated') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="sk" style={{ width: 120, height: 16, borderRadius: 8 }} />
      </div>
    );
  }

  return (
    <>
      <div className="container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />

        <main style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 20px',
        }}>
          <div style={{
            background: 'var(--surface)',
            border: '1.5px solid var(--border)',
            borderTop: '4px solid var(--g1)',
            borderRadius: 'var(--r)',
            padding: '40px',
            maxWidth: '400px',
            width: '100%',
            boxShadow: 'var(--shadow)',
            textAlign: 'center',
          }}>
            {/* Logo / brand */}
            <div style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              background: 'var(--s2)',
              border: '1.5px solid var(--border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.5rem',
              margin: '0 auto 20px',
            }}>
              📊
            </div>

            <h1 style={{
              fontSize: '1.25rem',
              fontWeight: 900,
              color: 'var(--text)',
              letterSpacing: '-.4px',
              marginBottom: '6px',
            }}>
              Sign in to Abundance
            </h1>

            <p style={{
              fontSize: '.8rem',
              color: 'var(--muted)',
              lineHeight: 1.6,
              marginBottom: '28px',
            }}>
              Access your CAS portfolio tracker and saved data.
              Your sign-in is secured via Google.
            </p>

            {/* Google Sign-in button */}
            <button
              onClick={handleGoogle}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '12px 20px',
                background: '#fff',
                border: '1.5px solid var(--border)',
                borderRadius: '10px',
                fontSize: '.85rem',
                fontWeight: 700,
                color: '#1a1a1a',
                cursor: 'pointer',
                transition: 'box-shadow .15s, border-color .15s',
                fontFamily: 'Raleway, sans-serif',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.boxShadow = 'var(--shadow)';
                e.currentTarget.style.borderColor = 'var(--border2)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.borderColor = 'var(--border)';
              }}
            >
              {/* Google SVG icon */}
              <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                <path d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z" fill="#FBBC05"/>
                <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>

            {/* Divider for future providers */}
            <div style={{
              margin: '20px 0 0',
              fontSize: '.62rem',
              color: 'var(--muted)',
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: '.3px',
            }}>
              More sign-in options coming soon
            </div>
          </div>

          <p style={{
            fontSize: '.62rem',
            color: 'var(--muted)',
            textAlign: 'center',
            marginTop: '20px',
            maxWidth: '380px',
            lineHeight: 1.7,
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            By signing in you agree to our terms. We only use your Google account
            for authentication — we never post on your behalf or access your emails.
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
