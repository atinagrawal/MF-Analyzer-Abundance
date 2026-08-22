import { ImageResponse } from '@vercel/og';
import { OG_LOGO_MARK_URL } from '@/lib/ogAssets';

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
          justifyContent: 'space-between',
          padding: '50px 70px',
          background: 'linear-gradient(135deg, #091a0c 0%, #112d16 50%, #1e4d26 100%)',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Top Gold Accent Bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #d97706, #fbbf24, #fef08a, #fbbf24, #d97706)',
            display: 'flex',
          }}
        />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src={OG_LOGO_MARK_URL} width={46} height={46} style={{ borderRadius: 10 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', color: '#ffffff', fontSize: 24, fontWeight: 800 }}>
                Abundance&nbsp;<span style={{ color: '#fbbf24' }}>Pioneers</span>
              </div>
              <div style={{ display: 'flex', color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: 600 }}>
                30+ Year Mutual Fund History · India
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(251,191,36,0.12)',
              border: '1.5px solid rgba(251,191,36,0.3)',
              borderRadius: 30,
              padding: '8px 18px',
            }}
          >
            <span style={{ color: '#fbbf24', fontSize: 13, fontWeight: 700, letterSpacing: '0.8px' }}>
              ⏳ 3 DECADES OF COMPOUNDING
            </span>
          </div>
        </div>

        {/* Main Title */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '14px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#ffffff', fontSize: 42, fontWeight: 900, lineHeight: 1.15 }}>
              The 30+ Year Pioneers of
            </span>
            <span style={{ color: '#fbbf24', fontSize: 42, fontWeight: 900, lineHeight: 1.15 }}>
              Indian Mutual Funds
            </span>
          </div>
          <div style={{ display: 'flex', color: 'rgba(255,255,255,0.7)', fontSize: 18, fontWeight: 500, maxWidth: 850 }}>
            How legendary veteran funds like UTI Mastershare, Franklin Bluechip, HDFC Flexi Cap &amp; Nippon Growth turned ₹10,000 into ₹1 Crore+.
          </div>
        </div>

        {/* Milestone Cards */}
        <div style={{ display: 'flex', gap: 16 }}>
          <div
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14,
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 12, color: '#fbbf24', fontWeight: 800 }}>UTI MASTERSHARE</span>
            <span style={{ fontSize: 16, color: '#ffffff', fontWeight: 700 }}>Inception 1986</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>India&apos;s First Equity Scheme</span>
          </div>

          <div
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14,
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 12, color: '#fbbf24', fontWeight: 800 }}>FRANKLIN BLUECHIP</span>
            <span style={{ fontSize: 16, color: '#ffffff', fontWeight: 700 }}>Inception 1993</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>First Private Sector Fund</span>
          </div>

          <div
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14,
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 12, color: '#fbbf24', fontWeight: 800 }}>HDFC FLEXI CAP</span>
            <span style={{ fontSize: 16, color: '#ffffff', fontWeight: 700 }}>Inception 1994</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>19%+ 30Y Annualized CAGR</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 14 }}>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600 }}>
            mfcalc.getabundance.in/pioneers · Compounding Time Machine
          </span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 600 }}>
            ARN-251838 · Abundance Financial Services
          </span>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
