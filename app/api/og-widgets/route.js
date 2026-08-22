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
          background: 'linear-gradient(135deg, #051405 0%, #0d280d 50%, #153818 100%)',
          fontFamily: 'sans-serif',
          position: 'relative',
        }}
      >
        {/* Top Accent Line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #1b5e20, #4ade80, #86efac, #4ade80, #1b5e20)',
            display: 'flex',
          }}
        />

        {/* Header Row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src={OG_LOGO_MARK_URL} width={46} height={46} style={{ borderRadius: 10 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', color: '#ffffff', fontSize: 24, fontWeight: 800 }}>
                Abundance&nbsp;<span style={{ color: '#4ade80' }}>Widgets</span>
              </div>
              <div style={{ display: 'flex', color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: 600 }}>
                Desktop Tools Suite · Windows 10 &amp; 11
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(74,222,128,0.12)',
              border: '1.5px solid rgba(74,222,128,0.3)',
              borderRadius: 30,
              padding: '8px 18px',
            }}
          >
            <div style={{ width: 9, height: 9, borderRadius: '50%', background: '#4ade80', display: 'flex' }} />
            <span style={{ color: '#86efac', fontSize: 13, fontWeight: 700, letterSpacing: '0.8px' }}>
              LIVE MARKET &amp; PORTFOLIO
            </span>
          </div>
        </div>

        {/* Hero Title & Subtitle */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '14px 0' }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#ffffff', fontSize: 42, fontWeight: 900, lineHeight: 1.15 }}>
              Indian Market &amp; Portfolio
            </span>
            <span style={{ color: '#4ade80', fontSize: 42, fontWeight: 900, lineHeight: 1.15 }}>
              Desktop Widgets for Windows
            </span>
          </div>
          <div style={{ display: 'flex', color: 'rgba(255,255,255,0.7)', fontSize: 18, fontWeight: 500, maxWidth: 850 }}>
            Live Nifty 50, Sensex, Sector Heatmap, real-time CAS portfolio tracker, and top mutual funds in a dockable mini-window.
          </div>
        </div>

        {/* Feature Cards Showcase */}
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
            <span style={{ fontSize: 12, color: '#86efac', fontWeight: 800 }}>📈 LIVE MARKET</span>
            <span style={{ fontSize: 16, color: '#ffffff', fontWeight: 700 }}>Nifty, Sensex &amp; Sectors</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Advances/Declines &amp; Heatmap</span>
          </div>

          <div
            style={{
              flex: 1,
              background: 'rgba(74,222,128,0.08)',
              border: '1px solid rgba(74,222,128,0.25)',
              borderRadius: 14,
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            <span style={{ fontSize: 12, color: '#86efac', fontWeight: 800 }}>💼 LIVE CAS PORTFOLIO</span>
            <span style={{ fontSize: 16, color: '#ffffff', fontWeight: 700 }}>Real-time AMFI NAVs</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Day&apos;s Gain &amp; Top Holdings</span>
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
            <span style={{ fontSize: 12, color: '#86efac', fontWeight: 800 }}>🏆 TOP FUNDS TODAY</span>
            <span style={{ fontSize: 16, color: '#ffffff', fontWeight: 700 }}>9 Performance Horizons</span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>1M to Since Inception</span>
          </div>
        </div>

        {/* Footer Meta */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 14 }}>
          <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600 }}>
            mfcalc.getabundance.in/widgets · Free PWA Companion Tool
          </span>
          <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, fontWeight: 600 }}>
            ARN-251838 · AMFI Registered Distributor
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
