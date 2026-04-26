/**
 * app/api/og-sif/route.js
 *
 * OG image for the SIF Screener — edge-rendered PNG, 1200×630.
 *
 * Fix: removed <img src="https://..."> which caused 503 in edge runtime.
 * @vercel/og can't fetch external images via <img> tag — use text/SVG logo instead.
 *
 * Improvement: fetches live fund count from /api/sif-nav and shows it dynamically.
 * Falls back to static count if fetch fails (edge functions have 25ms network budget).
 */

import { ImageResponse } from '@vercel/og';

export const runtime = 'edge';

// Fetch live count — very fast (Blob-cached, <50ms)
async function getLiveCount() {
  try {
    const r = await fetch('https://mfcalc.getabundance.in/api/sif-nav', {
      signal: AbortSignal.timeout(3000),
      headers: { 'Cache-Control': 'no-store' },
    });
    if (!r.ok) return { count: 29, navDate: '' };
    const d = await r.json();
    return { count: d.count ?? 29, navDate: d.nav_date ?? '' };
  } catch {
    return { count: 29, navDate: '' };
  }
}

export async function GET() {
  const { count, navDate } = await getLiveCount();
  const dateLabel = navDate
    ? navDate.toUpperCase()
    : new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase();

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
          padding: '52px 70px',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top accent bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: '5px',
          background: 'linear-gradient(90deg, #1b5e20, #43a047, #a5d6a7, #43a047, #1b5e20)',
          display: 'flex',
        }} />

        {/* Background decorative circles */}
        <div style={{
          position: 'absolute', top: -120, right: -60,
          width: 420, height: 420, borderRadius: '50%',
          background: 'rgba(67,160,71,.06)',
          display: 'flex',
        }} />
        <div style={{
          position: 'absolute', bottom: -80, left: -40,
          width: 300, height: 300, borderRadius: '50%',
          background: 'rgba(46,125,50,.08)',
          display: 'flex',
        }} />

        {/* ── Header row ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Live NAV badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(67,160,71,.15)',
            border: '1.5px solid rgba(67,160,71,.4)',
            borderRadius: 30,
            padding: '8px 20px',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#69f0ae',
              display: 'flex',
            }} />
            <div style={{
              color: '#a5d6a7', fontSize: 14, fontWeight: 700,
              letterSpacing: '1px', display: 'flex',
            }}>
              AMFI LIVE NAVs · {dateLabel}
            </div>
          </div>

          {/* ARN badge */}
          <div style={{
            display: 'flex',
            background: 'rgba(255,255,255,.06)',
            border: '1px solid rgba(255,255,255,.12)',
            borderRadius: 20,
            padding: '8px 18px',
            color: 'rgba(255,255,255,.55)',
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: '0.5px',
          }}>
            ARN-251838
          </div>
        </div>

        {/* ── Main content ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Category label */}
          <div style={{
            display: 'flex',
            color: '#81c784', fontSize: 16, fontWeight: 700,
            letterSpacing: '2px', textTransform: 'uppercase',
          }}>
            SEBI Regulated · New Asset Class
          </div>

          {/* Headline */}
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.0 }}>
            <div style={{
              fontSize: 80, fontWeight: 900, color: '#fff',
              letterSpacing: '-3px', display: 'flex',
            }}>
              Specialised
            </div>
            <div style={{
              fontSize: 80, fontWeight: 900, color: '#66bb6a',
              letterSpacing: '-3px', display: 'flex',
            }}>
              Investment Funds
            </div>
          </div>

          {/* Strategy pills */}
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {['Equity Long-Short', 'Hybrid Long-Short', 'Active Allocator'].map(t => (
              <div key={t} style={{
                display: 'flex',
                background: 'rgba(255,255,255,.06)',
                border: '1px solid rgba(165,214,167,.2)',
                borderRadius: 8,
                padding: '7px 16px',
                color: '#c8e6c9',
                fontSize: 16,
                fontWeight: 600,
              }}>
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* ── Footer row ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>

          {/* Brand — text only (no external img) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {/* Logo mark — geometric A */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 12,
                background: 'linear-gradient(135deg, #1b5e20, #2e7d32)',
                border: '2px solid rgba(165,214,167,.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 900, color: '#fff',
              }}>
                A
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ color: '#fff', fontSize: 20, fontWeight: 800, display: 'flex', letterSpacing: '-0.3px' }}>
                  Abundance Financial Services
                </div>
                <div style={{ color: '#81c784', fontSize: 13, display: 'flex', marginTop: 1 }}>
                  Atin Kumar Agrawal · AMFI Registered SIF Distributor
                </div>
              </div>
            </div>
          </div>

          {/* Stats strip */}
          <div style={{ display: 'flex', gap: 0, border: '1px solid rgba(255,255,255,.1)', borderRadius: 12, overflow: 'hidden' }}>
            {[
              [String(count), 'Funds'],
              ['9', 'AMCs'],
              ['₹10L+', 'Min. Inv.'],
              ['Daily', 'NAV Update'],
            ].map(([val, label], i) => (
              <div key={label} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '12px 20px',
                borderRight: i < 3 ? '1px solid rgba(255,255,255,.08)' : 'none',
                background: 'rgba(255,255,255,.04)',
              }}>
                <div style={{ color: '#fff', fontSize: 22, fontWeight: 900, fontFamily: 'monospace', letterSpacing: '-0.5px', display: 'flex' }}>{val}</div>
                <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', marginTop: 2, display: 'flex' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* URL watermark */}
        <div style={{
          position: 'absolute', bottom: 20, right: 70,
          color: 'rgba(255,255,255,.2)', fontSize: 13,
          fontFamily: 'monospace', fontWeight: 600, display: 'flex',
        }}>
          mfcalc.getabundance.in/sifs
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
