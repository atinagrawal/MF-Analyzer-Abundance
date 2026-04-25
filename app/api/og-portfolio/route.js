/**
 * app/api/og-portfolio/route.js
 *
 * OG image for /portfolio — returned as PNG via @vercel/og
 * Size: 1200×630 (standard OG)
 *
 * Design: dark green hero with logo, tagline, and feature pills.
 * No dynamic data — this is a static branded image for social sharing.
 */

import { ImageResponse } from '@vercel/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '80px 100px',
          background: 'linear-gradient(135deg, #0a2e0a 0%, #1b5e20 50%, #2e7d32 100%)',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Background decorative circles */}
        <div style={{
          position: 'absolute', top: -80, right: -80,
          width: 400, height: 400,
          borderRadius: '50%',
          background: 'rgba(100,187,106,.08)',
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', bottom: -120, right: 120,
          width: 320, height: 320,
          borderRadius: '50%',
          background: 'rgba(46,125,50,.12)',
          display: 'flex',
        }} />
        {/* Grid texture lines */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,.025) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,.025) 40px)',
          display: 'flex',
        }} />

        {/* ARN badge top right */}
        <div style={{
          position: 'absolute', top: 48, right: 100,
          padding: '6px 14px', borderRadius: 20,
          border: '1px solid rgba(255,255,255,.2)',
          background: 'rgba(255,255,255,.08)',
          color: 'rgba(255,255,255,.7)',
          fontSize: 13, fontWeight: 700,
          letterSpacing: 1,
          display: 'flex',
        }}>
          ARN-251838
        </div>

        {/* Logo area */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
          <div style={{
            width: 56, height: 56,
            borderRadius: 14,
            background: 'rgba(255,255,255,.12)',
            border: '2px solid rgba(255,255,255,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, fontWeight: 900, color: '#fff',
          }}>A</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 900, letterSpacing: -0.5 }}>
              Abundance Financial Services
            </div>
            <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, fontWeight: 600, marginTop: 2 }}>
              AMFI Registered Mutual Fund Distributor
            </div>
          </div>
        </div>

        {/* Main headline */}
        <div style={{
          color: '#fff',
          fontSize: 58,
          fontWeight: 900,
          letterSpacing: -2,
          lineHeight: 1.05,
          marginBottom: 20,
          display: 'flex',
          flexDirection: 'column',
        }}>
          <span>Your Wealth,</span>
          <span style={{ color: '#a5d6a7' }}>Beautifully Organised</span>
        </div>

        {/* Subline */}
        <div style={{
          color: 'rgba(255,255,255,.65)',
          fontSize: 20,
          fontWeight: 500,
          lineHeight: 1.5,
          marginBottom: 36,
          maxWidth: 640,
          display: 'flex',
        }}>
          Track your mutual fund portfolio with live AMFI NAVs, FIFO capital gains,
          ELSS lock-in status, and SIF holdings — all in one secure dashboard.
        </div>

        {/* Feature pills */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {['Live NAVs', 'FIFO Gains', 'ELSS Lock-in', 'SIF Holdings', 'Redemption Planner'].map(f => (
            <div key={f} style={{
              padding: '8px 16px', borderRadius: 100,
              background: 'rgba(255,255,255,.1)',
              border: '1px solid rgba(255,255,255,.2)',
              color: 'rgba(255,255,255,.85)',
              fontSize: 14, fontWeight: 700,
              display: 'flex',
            }}>
              ✓ {f}
            </div>
          ))}
        </div>

        {/* Bottom URL */}
        <div style={{
          position: 'absolute', bottom: 48, right: 100,
          color: 'rgba(255,255,255,.4)',
          fontSize: 16, fontWeight: 600,
          fontFamily: 'monospace',
          display: 'flex',
        }}>
          mfcalc.getabundance.in/portfolio
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
