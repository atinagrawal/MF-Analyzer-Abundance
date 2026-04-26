/**
 * app/api/og-sif/route.js
 *
 * Dynamic OG image for the SIF Screener page.
 *
 * Referenced in:
 *   - app/sifs/page.js
 *
 * Usage:
 *   https://mfcalc.getabundance.in/api/og-sif
 */

import { ImageResponse } from '@vercel/og';

export const runtime = 'edge';

export async function GET() {
  const currentMonth = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });

  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #071507 0%, #0d2b0d 55%, #122b14 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '58px 70px',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative top border strip */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '5px',
          background: 'linear-gradient(90deg, #1b5e20, #43a047, #a5d6a7, #43a047, #1b5e20)',
          display: 'flex',
        }} />

        {/* Top row: data badge + category pill */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{
            background: 'rgba(67,160,71,0.18)',
            border: '1.5px solid #2e7d32',
            color: '#a5d6a7',
            padding: '7px 20px',
            borderRadius: '30px',
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '1.2px',
            display: 'flex',
          }}>
            ● AMFI LIVE NAVS · {currentMonth.toUpperCase()}
          </div>

          <div style={{
            background: '#1b5e20',
            color: '#c8e6c9',
            padding: '7px 20px',
            borderRadius: '30px',
            fontSize: '15px',
            fontWeight: 800,
            letterSpacing: '0.5px',
            display: 'flex',
          }}>
            SIFs
          </div>
        </div>

        {/* Centre: main headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{
            fontSize: '76px',
            fontWeight: 900,
            color: 'white',
            lineHeight: 1.05,
            letterSpacing: '-2px',
            display: 'flex',
          }}>
            Specialised<br />
            <span style={{ color: '#66bb6a', display: 'flex' }}>Investment Funds</span>
          </div>

          <div style={{
            fontSize: '26px',
            color: '#a5d6a7',
            fontWeight: 400,
            display: 'flex',
          }}>
            Equity Long-Short · Hybrid Long-Short · Active Asset Allocator
          </div>

          {/* Three stat pills */}
          <div style={{ display: 'flex', gap: '14px', marginTop: '10px' }}>
            {['Live Daily NAVs', 'Min. ₹10 Lakh', 'Free · No Login'].map((t) => (
              <div
                key={t}
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(165,214,167,0.2)',
                  color: '#c8e6c9',
                  padding: '8px 20px',
                  borderRadius: '10px',
                  fontSize: '17px',
                  fontWeight: 600,
                  display: 'flex',
                }}
              >
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom row: Abundance branding */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <img
              src="https://mfcalc.getabundance.in/logo-og.png"
              alt="Abundance Logo"
              style={{ height: '84px', objectFit: 'contain', marginBottom: '12px' }}
            />
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'white', display: 'flex' }}>
              Abundance Financial Services - Atin Kumar Agrawal
            </div>
            <div style={{ fontSize: '15px', color: '#81c784', display: 'flex' }}>
              AMFI Registered Mutual Fund and SIF Distributor · ARN-251838
            </div>
          </div>

          <div style={{
            fontSize: '15px',
            color: '#4caf50',
            background: 'rgba(76,175,80,0.1)',
            border: '1px solid #2e7d32',
            padding: '10px 22px',
            borderRadius: '10px',
            fontWeight: 700,
            display: 'flex',
          }}>
            mfcalc.getabundance.in/sifs
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
