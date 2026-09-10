/**
 * app/api/og-nfo/route.js
 *
 * OG image for the NFO Tracker — edge-rendered PNG, 1200×630.
 * Features live counts of open Mutual Fund and SIF NFOs.
 */

import { ImageResponse } from '@vercel/og';

export const runtime = 'edge';

async function getNfoCount() {
  try {
    const res = await fetch('https://mfcalc.getabundance.in/api/nfo', {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { total: 11, mf: 10, sif: 1 };
    const data = await res.json();
    const mf = (data.mf || []).filter((e) => e.status === 'open').length;
    const sif = (data.sif || []).filter((e) => e.status === 'open').length;
    return { total: mf + sif, mf, sif };
  } catch {
    return { total: 11, mf: 10, sif: 1 };
  }
}

export async function GET() {
  const { total, mf, sif } = await getNfoCount();

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
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '5px',
            background: 'linear-gradient(90deg, #1b5e20, #43a047, #a5d6a7, #43a047, #1b5e20)',
            display: 'flex',
          }}
        />

        {/* Ambient background glows */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            right: -50,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'rgba(67,160,71,.08)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -60,
            left: -30,
            width: 320,
            height: 320,
            borderRadius: '50%',
            background: 'rgba(46,125,50,.10)',
            display: 'flex',
          }}
        />

        {/* ── Header row ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(67,160,71,.15)',
              border: '1.5px solid rgba(67,160,71,.4)',
              borderRadius: 30,
              padding: '8px 20px',
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#69f0ae', display: 'flex' }} />
            <div style={{ color: '#a5d6a7', fontSize: 14, fontWeight: 700, letterSpacing: '1px', display: 'flex' }}>
              AMFI LIVE DATA · UPDATED DAILY
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              background: 'rgba(255,255,255,.06)',
              border: '1px solid rgba(255,255,255,.12)',
              borderRadius: 20,
              padding: '8px 18px',
              color: 'rgba(255,255,255,.65)',
              fontSize: 13,
              fontWeight: 600,
              letterSpacing: '0.5px',
            }}
          >
            ARN-251838
          </div>
        </div>

        {/* ── Main headline ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', color: '#81c784', fontSize: 16, fontWeight: 700, letterSpacing: '2px' }}>
            SEBI REGULATED · LIVE TRACKER
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.0 }}>
            <div style={{ fontSize: 72, fontWeight: 900, color: '#fff', letterSpacing: '-2px', display: 'flex' }}>
              New Fund Offers
            </div>
            <div style={{ fontSize: 72, fontWeight: 900, color: '#66bb6a', letterSpacing: '-2px', display: 'flex' }}>
              Mutual Funds & SIFs
            </div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
            <div
              style={{
                display: 'flex',
                background: 'rgba(255,255,255,.08)',
                border: '1px solid rgba(165,214,167,.25)',
                borderRadius: 8,
                padding: '8px 18px',
                color: '#c8e6c9',
                fontSize: 18,
                fontWeight: 700,
              }}
            >
              {total} Live Open NFOs
            </div>
            <div
              style={{
                display: 'flex',
                background: 'rgba(255,255,255,.05)',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 8,
                padding: '8px 18px',
                color: 'rgba(255,255,255,.8)',
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              {mf} Mutual Funds · {sif} SIF
            </div>
            <div
              style={{
                display: 'flex',
                background: 'rgba(255,255,255,.05)',
                border: '1px solid rgba(255,255,255,.12)',
                borderRadius: 8,
                padding: '8px 18px',
                color: 'rgba(255,255,255,.8)',
                fontSize: 18,
                fontWeight: 600,
              }}
            >
              Par Value ₹10
            </div>
          </div>
        </div>

        {/* ── Footer row ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(255,255,255,.1)',
            paddingTop: 20,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ color: '#ffffff', fontSize: 18, fontWeight: 700, display: 'flex' }}>
              Abundance Financial Services
            </div>
            <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 13, display: 'flex' }}>
              AMFI Registered Mutual Funds & SIF Distributor
            </div>
          </div>
          <div
            style={{
              color: '#81c784',
              fontSize: 15,
              fontWeight: 600,
              display: 'flex',
            }}
          >
            mfcalc.getabundance.in/nfo
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
