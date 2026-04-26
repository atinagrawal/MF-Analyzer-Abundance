/**
 * app/api/og-sif/route.js
 *
 * OG image for /sifs — edge-rendered PNG, 1200×630
 * Dark green terminal aesthetic matching the SIF hero.
 */

import { ImageResponse } from '@vercel/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div style={{
        width: '1200px', height: '630px',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'flex-start',
        padding: '80px 100px',
        background: 'linear-gradient(135deg, #0a2e0a 0%, #1b5e20 50%, #2e7d32 100%)',
        fontFamily: 'sans-serif',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Grid texture */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(255,255,255,.025) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(255,255,255,.025) 40px)',
          display: 'flex',
        }} />
        {/* Radial glow */}
        <div style={{
          position: 'absolute', top: -100, right: -100,
          width: 500, height: 500, borderRadius: '50%',
          background: 'rgba(100,187,106,.07)',
          display: 'flex',
        }} />

        {/* ARN badge */}
        <div style={{
          position: 'absolute', top: 48, right: 100,
          padding: '6px 14px', borderRadius: 20,
          border: '1px solid rgba(255,255,255,.2)',
          background: 'rgba(255,255,255,.08)',
          color: 'rgba(255,255,255,.7)',
          fontSize: 13, fontWeight: 700, letterSpacing: 1,
          display: 'flex',
        }}>
          ARN-251838 · AMFI Registered
        </div>

        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 13,
            background: 'rgba(255,255,255,.1)',
            border: '2px solid rgba(255,255,255,.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, fontWeight: 900, color: '#fff',
          }}>A</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#fff', fontSize: 18, fontWeight: 900, letterSpacing: -0.5 }}>
              Abundance Financial Services
            </div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 12, fontWeight: 600, marginTop: 2 }}>
              Specialised Investment Fund Screener
            </div>
          </div>
        </div>

        {/* Live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#69f0ae', display: 'flex' }} />
          <div style={{ color: 'rgba(255,255,255,.55)', fontSize: 13, fontWeight: 700, letterSpacing: 1, fontFamily: 'monospace' }}>
            AMFI · LIVE DAILY NAVs
          </div>
        </div>

        {/* Headline */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          marginBottom: 20,
        }}>
          <div style={{ color: '#fff', fontSize: 60, fontWeight: 900, letterSpacing: -2, lineHeight: 1.0 }}>
            Specialised
          </div>
          <div style={{ color: '#a5d6a7', fontSize: 60, fontWeight: 900, letterSpacing: -2, lineHeight: 1.0 }}>
            Investment Funds
          </div>
        </div>

        {/* Subline */}
        <div style={{
          color: 'rgba(255,255,255,.6)', fontSize: 19, fontWeight: 500,
          lineHeight: 1.55, marginBottom: 32, maxWidth: 600,
          display: 'flex',
        }}>
          India's newest SEBI-regulated category. Equity and Hybrid Long-Short strategies with daily NAV tracking. Minimum ₹10 lakh.
        </div>

        {/* Stats strip */}
        <div style={{
          display: 'flex', gap: 0,
          background: 'rgba(255,255,255,.07)',
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 14,
          overflow: 'hidden',
        }}>
          {[['57', 'Funds Tracked'], ['4', 'Strategies'], ['9', 'Fund Houses'], ['Daily', 'NAV Update']].map(([val, label]) => (
            <div key={label} style={{
              padding: '14px 24px',
              borderRight: '1px solid rgba(255,255,255,.1)',
              display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
              <div style={{ color: '#fff', fontSize: 26, fontWeight: 900, fontFamily: 'monospace', letterSpacing: -1 }}>{val}</div>
              <div style={{ color: 'rgba(255,255,255,.45)', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginTop: 3 }}>{label}</div>
            </div>
          ))}
        </div>

        {/* URL */}
        <div style={{
          position: 'absolute', bottom: 48, right: 100,
          color: 'rgba(255,255,255,.35)', fontSize: 15,
          fontFamily: 'monospace', fontWeight: 600, display: 'flex',
        }}>
          mfcalc.getabundance.in/sifs
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
