/**
 * app/not-found.js — Custom 404 page
 *
 * This is the first page rendered through the Next.js App Router,
 * validating that layout.js, globals.css, Navbar, and Footer all work.
 *
 * NOTE: The current public/404.html has an elaborate stock ticker + fund cards.
 * That full version will be ported in a later phase. This is a clean
 * version using the shared design system.
 */

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const metadata = {
  title: 'Page Not Found — Scheme Wound Up | Abundance',
  robots: { index: false, follow: false },
};

export default function NotFound() {
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
          {/* Wound-up notice card */}
          <div style={{
            background: 'var(--surface)',
            border: '2px solid #ef9a9a',
            borderTop: '4px solid #e53935',
            borderRadius: 'var(--r)',
            padding: '36px 40px',
            maxWidth: '560px',
            width: '100%',
            boxShadow: 'var(--shadow)',
            textAlign: 'center',
          }}>
            {/* Status badge */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: '#ffebee',
              border: '1.5px solid #ef9a9a',
              borderRadius: '6px',
              padding: '4px 12px',
              fontSize: '.62rem',
              fontWeight: 800,
              color: '#e53935',
              letterSpacing: '1.2px',
              textTransform: 'uppercase',
              fontFamily: "'JetBrains Mono', monospace",
              marginBottom: '20px',
            }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: '#e53935',
                animation: 'pulse 1.4s ease infinite',
              }} />
              SCHEME WOUND UP
            </div>

            {/* Error code */}
            <div className="mono" style={{
              fontSize: '4.5rem',
              fontWeight: 700,
              lineHeight: 1,
              color: '#e53935',
              letterSpacing: '-2px',
              marginBottom: '8px',
            }}>
              404
            </div>

            <h1 style={{
              fontSize: '1.3rem',
              fontWeight: 900,
              color: 'var(--text)',
              letterSpacing: '-.5px',
              marginBottom: '8px',
            }}>
              This scheme has been wound up
            </h1>

            <p style={{
              fontSize: '.82rem',
              color: 'var(--muted)',
              lineHeight: 1.6,
              marginBottom: '24px',
            }}>
              The page you&apos;re looking for doesn&apos;t exist or has been moved.
              Much like a wound-up scheme, your units here have zero NAV.
            </p>

            {/* Navigation links */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '8px',
            }}>
              <a href="/" style={{
                display: 'block',
                padding: '12px 16px',
                background: 'var(--g1)',
                color: '#fff',
                borderRadius: '10px',
                fontSize: '.78rem',
                fontWeight: 700,
                transition: '.15s',
              }}>
                📊 MF Calculator
              </a>
              <a href="/rolling" style={{
                display: 'block',
                padding: '12px 16px',
                background: 'var(--s2)',
                border: '1.5px solid var(--border)',
                color: 'var(--g2)',
                borderRadius: '10px',
                fontSize: '.78rem',
                fontWeight: 700,
                transition: '.15s',
              }}>
                📉 Rolling Returns
              </a>
              <a href="/industry" style={{
                display: 'block',
                padding: '12px 16px',
                background: 'var(--s2)',
                border: '1.5px solid var(--border)',
                color: 'var(--g2)',
                borderRadius: '10px',
                fontSize: '.78rem',
                fontWeight: 700,
                transition: '.15s',
              }}>
                📈 Industry Pulse
              </a>
              <a href="/cas-tracker" style={{
                display: 'block',
                padding: '12px 16px',
                background: 'var(--s2)',
                border: '1.5px solid var(--border)',
                color: 'var(--g2)',
                borderRadius: '10px',
                fontSize: '.78rem',
                fontWeight: 700,
                transition: '.15s',
              }}>
                📋 CAS Tracker
              </a>
            </div>
          </div>

          {/* Disclaimer */}
          <p className="mono" style={{
            fontSize: '.56rem',
            color: 'var(--muted)',
            textAlign: 'center',
            marginTop: '24px',
            maxWidth: '500px',
            lineHeight: 1.7,
          }}>
            <strong style={{ color: 'var(--text2)' }}>Mutual fund investments are subject to market risks.</strong>{' '}
            Read all scheme-related documents carefully. This 404 page does not constitute financial advice.
            Past URLs are not indicative of future page availability.
          </p>
        </main>
      </div>

      <Footer />
    </>
  );
}
