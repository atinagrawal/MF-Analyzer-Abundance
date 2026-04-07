
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
            backgroundColor: '#0a0f0a',
            fontFamily: 'sans-serif',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* â”€â”€ Background grid â”€â”€ */}
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage:
              'linear-gradient(rgba(34,197,94,0.06) 1px, transparent 1px),' +
              'linear-gradient(90deg, rgba(34,197,94,0.06) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }} />

          {/* â”€â”€ Green radial glow â”€â”€ */}
          <div style={{
            position: 'absolute', top: '-160px', left: '-160px',
            width: '600px', height: '600px',
            background: 'radial-gradient(circle, rgba(34,197,94,0.18) 0%, transparent 65%)',
          }} />
          <div style={{
            position: 'absolute', bottom: '-120px', right: '-80px',
            width: '500px', height: '500px',
            background: 'radial-gradient(circle, rgba(22,163,74,0.14) 0%, transparent 65%)',
          }} />

          {/* â”€â”€ Top accent bar â”€â”€ */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '4px',
            background: 'linear-gradient(90deg, #14532d, #22c55e, #86efac, #22c55e, #14532d)',
          }} />

          {/* â”€â”€ Content wrapper â”€â”€ */}
          <div style={{ display: 'flex', flex: 1, padding: '56px 72px', position: 'relative', zIndex: 10 }}>

            {/* â”€â”€ LEFT COLUMN â”€â”€ */}
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>

              {/* Brand */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '52px', height: '52px', borderRadius: '14px',
                  background: 'linear-gradient(135deg, #16a34a, #166534)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontSize: '28px', fontWeight: 900,
                  boxShadow: '0 0 24px rgba(34,197,94,0.35)',
                }}>A</div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ color: '#f0fdf4', fontSize: '22px', fontWeight: 800, lineHeight: 1 }}>Abundance</span>
                  <span style={{ color: '#4ade80', fontSize: '11px', fontWeight: 700, letterSpacing: '3px', textTransform: 'uppercase', marginTop: '4px' }}>Financial Services</span>
                </div>
              </div>

              {/* Hero headline */}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px',
                }}>
                  <div style={{
                    background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)',
                    borderRadius: '6px', padding: '5px 14px',
                    color: '#4ade80', fontSize: '13px', fontWeight: 700, letterSpacing: '2px',
                    textTransform: 'uppercase',
                  }}>Free Tool</div>
                </div>

                <h1 style={{
                  fontSize: '76px', fontWeight: 900, lineHeight: 1.0,
                  color: '#f0fdf4', margin: 0, letterSpacing: '-2px',
                }}>CAS Portfolio<br />
                  <span style={{ color: '#22c55e' }}>Analyzer</span>
                </h1>

                <p style={{
                  fontSize: '24px', color: '#94a3b8', marginTop: '20px', fontWeight: 400,
                  lineHeight: 1.4,
                }}>
                  Upload your CAMS / KFintech statement.<br />Get live NAVs, FIFO gains & ELSS lock-ins instantly.
                </p>
              </div>

              {/* Feature pills */}
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                {['Multi-PAN Family', 'Live AMFI NAVs', 'FIFO Accounting', '100% Local'].map(label => (
                  <div key={label} style={{
                    background: 'rgba(20,83,45,0.5)', border: '1px solid rgba(34,197,94,0.25)',
                    borderRadius: '30px', padding: '10px 22px',
                    color: '#86efac', fontSize: '16px', fontWeight: 700,
                  }}>{label}</div>
                ))}
              </div>
            </div>

            {/* â”€â”€ RIGHT COLUMN â€“ mock dashboard card â”€â”€ */}
            <div style={{
              display: 'flex', flexDirection: 'column', width: '360px',
              marginLeft: '64px', gap: '14px',
            }}>

              {/* Portfolio summary card */}
              <div style={{
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '16px', padding: '22px 24px',
              }}>
                <div style={{ color: '#64748b', fontSize: '12px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '8px' }}>Current Value</div>
                <div style={{ color: '#f0fdf4', fontSize: '36px', fontWeight: 900, fontFamily: 'monospace' }}>â‚¹42,18,350</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                  <span style={{ color: '#4ade80', fontSize: '14px', fontWeight: 700 }}>â†‘ +â‚¹11,43,200</span>
                  <span style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', padding: '2px 10px', borderRadius: '20px', fontSize: '13px', fontWeight: 700 }}>+37.2%</span>
                </div>
              </div>

              {/* Mini fund rows */}
              {[
                { name: 'Mirae Asset Large Cap', nav: '108.42', gain: '+18.3%', pos: true },
                { name: 'Parag Parikh Flexi Cap', nav: '76.91', gain: '+42.1%', pos: true },
                { name: 'Axis ELSS Tax Saver ðŸ”’', nav: '91.05', gain: '-4.2%', pos: false },
              ].map(f => (
                <div key={f.name} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '12px', padding: '14px 16px',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ color: '#cbd5e1', fontSize: '13px', fontWeight: 700, maxWidth: '200px' }}>{f.name}</span>
                    <span style={{ color: '#64748b', fontSize: '12px', fontFamily: 'monospace' }}>NAV â‚¹{f.nav}</span>
                  </div>
                  <span style={{
                    color: f.pos ? '#4ade80' : '#f87171',
                    background: f.pos ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)',
                    padding: '4px 12px', borderRadius: '20px',
                    fontSize: '13px', fontWeight: 800,
                  }}>{f.gain}</span>
                </div>
              ))}

              {/* Multi-PAN tag */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                border: '1px solid rgba(34,197,94,0.2)', borderRadius: '12px', padding: '12px',
                background: 'rgba(34,197,94,0.05)',
              }}>
                <span style={{ color: '#22c55e', fontSize: '20px' }}>ðŸ‘¨â€ðŸ‘©â€ðŸ‘§</span>
                <span style={{ color: '#86efac', fontSize: '13px', fontWeight: 700 }}>3 PANs detected Â· Family CAS</span>
              </div>
            </div>
          </div>

          {/* â”€â”€ Bottom watermark â”€â”€ */}
          <div style={{
            position: 'absolute', bottom: '28px', left: 0, right: 0,
            display: 'flex', justifyContent: 'center',
            color: '#334155', fontSize: '15px', fontWeight: 600, letterSpacing: '1px',
          }}>
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
    console.error(e);
    return new Response(`Failed to generate image: ${e.message}`, { status: 500 });
  }
}

