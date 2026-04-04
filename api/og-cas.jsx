// api/og-cas.jsx
import { ImageResponse } from '@vercel/og';

export const config = {
  runtime: 'edge',
};

export default function handler(req) {
  try {
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#f4f7f6',
            backgroundImage: 'radial-gradient(circle at 25px 25px, #dff0df 2%, transparent 0%), radial-gradient(circle at 75px 75px, #dff0df 2%, transparent 0%)',
            backgroundSize: '100px 100px',
            fontFamily: 'sans-serif',
          }}
        >
          {/* Top Green Accent Bar */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '12px', background: 'linear-gradient(90deg, #1b5e20, #43a047, #66bb6a)' }} />

          {/* Abundance Logo / Brand Box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: 'white',
              padding: '24px 48px',
              borderRadius: '24px',
              boxShadow: '0 12px 32px rgba(46, 125, 50, 0.1)',
              marginBottom: '60px',
              border: '2px solid #e8f5e9'
            }}
          >
            <div
              style={{
                width: '70px',
                height: '70px',
                backgroundColor: '#1b5e20',
                borderRadius: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontSize: '44px',
                fontWeight: 800,
                boxShadow: '0 8px 16px rgba(27, 94, 32, 0.3)',
              }}
            >
              A
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', marginLeft: '24px' }}>
              <span style={{ fontSize: '46px', fontWeight: 900, color: '#1b5e20', lineHeight: 1 }}>Abundance</span>
              <span style={{ fontSize: '18px', fontWeight: 700, color: '#5e8a5e', textTransform: 'uppercase', letterSpacing: '3px', marginTop: '4px' }}>Financial Services</span>
            </div>
          </div>

          {/* Hero Text */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              maxWidth: '900px',
            }}
          >
            <h1
              style={{
                fontSize: '84px',
                fontWeight: 900,
                color: '#162616',
                lineHeight: 1.1,
                marginBottom: '20px',
                letterSpacing: '-2px'
              }}
            >
              CAS Portfolio <span style={{ color: '#2e7d32', marginLeft: '16px' }}>Analyzer</span>
            </h1>
            
            <p
              style={{
                fontSize: '34px',
                fontWeight: 500,
                color: '#475569',
                marginTop: 0,
                marginBottom: '40px'
              }}
            >
              Upload Statement. Track Live NAVs.
            </p>

            {/* Feature Pills */}
            <div style={{ display: 'flex', gap: '20px' }}>
              <span style={{ background: '#e8f5e9', color: '#1b5e20', padding: '12px 28px', borderRadius: '40px', fontSize: '24px', fontWeight: 700, border: '2px solid #a5d6a7' }}>Multi-PAN Ready</span>
              <span style={{ background: '#e8f5e9', color: '#1b5e20', padding: '12px 28px', borderRadius: '40px', fontSize: '24px', fontWeight: 700, border: '2px solid #a5d6a7' }}>FIFO Accounting</span>
              <span style={{ background: '#e8f5e9', color: '#1b5e20', padding: '12px 28px', borderRadius: '40px', fontSize: '24px', fontWeight: 700, border: '2px solid #a5d6a7' }}>100% Local Parsing</span>
            </div>
          </div>
          
          {/* Bottom subtle watermark */}
          <div style={{ position: 'absolute', bottom: '40px', color: '#94a3b8', fontSize: '24px', fontWeight: 600 }}>
            mfcalc.getabundance.in
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: {
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      }
    );
  } catch (e) {
    return new Response(`Failed to generate the image`, { status: 500 });
  }
}
