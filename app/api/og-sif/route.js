/**
 * app/api/og-sif/route.js
 *
 * OG image for the SIF Screener — edge-rendered PNG, 1200×630.
 *
 * Logo: embedded as base64 data URL — avoids self-referential fetch
 * (edge functions cannot reliably fetch their own deployment's static files).
 *
 * Fund count: fetched from /api/sif-nav at an external cache-friendly URL.
 */

import { ImageResponse } from '@vercel/og';

export const runtime = 'edge';

// Logo embedded at deploy time — no network dependency at runtime
const LOGO_DATA_URL = 'data:image/png;base64,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';

async function getLiveData() {
  try {
    const r = await fetch('https://mfcalc.getabundance.in/api/sif-nav', {
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) return { count: 29, navDate: '' };
    const d = await r.json();
    return { count: d.count ?? 29, navDate: d.nav_date ?? '' };
  } catch {
    return { count: 29, navDate: '' };
  }
}

export async function GET() {
  const { count, navDate } = await getLiveData();

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
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '5px',
          background: 'linear-gradient(90deg, #1b5e20, #43a047, #a5d6a7, #43a047, #1b5e20)',
          display: 'flex' }} />

        {/* Background circles */}
        <div style={{ position: 'absolute', top: -120, right: -60, width: 420, height: 420,
          borderRadius: '50%', background: 'rgba(67,160,71,.06)', display: 'flex' }} />
        <div style={{ position: 'absolute', bottom: -80, left: -40, width: 300, height: 300,
          borderRadius: '50%', background: 'rgba(46,125,50,.08)', display: 'flex' }} />

        {/* ── Header row ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10,
            background: 'rgba(67,160,71,.15)', border: '1.5px solid rgba(67,160,71,.4)',
            borderRadius: 30, padding: '8px 20px' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#69f0ae', display: 'flex' }} />
            <div style={{ color: '#a5d6a7', fontSize: 14, fontWeight: 700, letterSpacing: '1px', display: 'flex' }}>
              AMFI LIVE NAVs · {dateLabel}
            </div>
          </div>
          <div style={{ display: 'flex', background: 'rgba(255,255,255,.06)',
            border: '1px solid rgba(255,255,255,.12)', borderRadius: 20, padding: '8px 18px',
            color: 'rgba(255,255,255,.55)', fontSize: 13, fontWeight: 600, letterSpacing: '0.5px' }}>
            ARN-251838
          </div>
        </div>

        {/* ── Main headline ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', color: '#81c784', fontSize: 16, fontWeight: 700, letterSpacing: '2px' }}>
            SEBI Regulated · New Asset Class
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.0 }}>
            <div style={{ fontSize: 80, fontWeight: 900, color: '#fff', letterSpacing: '-3px', display: 'flex' }}>
              Specialised
            </div>
            <div style={{ fontSize: 80, fontWeight: 900, color: '#66bb6a', letterSpacing: '-3px', display: 'flex' }}>
              Investment Funds
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
            {['Equity Long-Short', 'Hybrid Long-Short', 'Active Allocator'].map(t => (
              <div key={t} style={{
                display: 'flex', background: 'rgba(255,255,255,.06)',
                border: '1px solid rgba(165,214,167,.2)',
                borderRadius: 8, padding: '7px 16px',
                color: '#c8e6c9', fontSize: 16, fontWeight: 600,
              }}>{t}</div>
            ))}
          </div>
        </div>

        {/* ── Footer: logo + stats ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Logo embedded as base64 — works reliably in edge runtime */}
            <img
              src={LOGO_DATA_URL}
              style={{ height: 84, objectFit: 'contain', objectPosition: 'left', marginBottom: 8 }}
            />
            <div style={{ color: '#fff', fontSize: 20, fontWeight: 800, display: 'flex', letterSpacing: '-0.3px' }}>
              Abundance Financial Services — Atin Kumar Agrawal
            </div>
            <div style={{ color: '#81c784', fontSize: 13, display: 'flex', marginTop: 1 }}>
              AMFI Registered Mutual Fund and SIF Distributor · ARN-251838
            </div>
          </div>

          {/* Stats strip */}
          <div style={{ display: 'flex', gap: 0, border: '1px solid rgba(255,255,255,.1)',
            borderRadius: 12, overflow: 'hidden' }}>
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
                <div style={{ color: '#fff', fontSize: 22, fontWeight: 900,
                  fontFamily: 'monospace', letterSpacing: '-0.5px', display: 'flex' }}>{val}</div>
                <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.8px', marginTop: 2, display: 'flex' }}>{label}</div>
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
