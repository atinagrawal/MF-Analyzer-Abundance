/**
 * app/api/og-gold-silver/route.jsx
 *
 * OG image for /gold-silver-rates — edge-rendered PNG, 1200×630.
 * Dynamically displays today's live 24K & 22K gold prices, silver rate,
 * and USD/INR exchange rate on social previews (WhatsApp, Twitter/X, LinkedIn).
 */

import { ImageResponse } from '@vercel/og';
import { OG_LOGO_FULL_URL } from '@/lib/ogAssets';

export const runtime = 'edge';

async function getLiveRates() {
  try {
    const r = await fetch('https://mfcalc.getabundance.in/api/precious-metals-rates', {
      signal: AbortSignal.timeout(3000),
      next: { revalidate: 180 },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

function fmt(n, decimals = 0) {
  if (n == null || !isFinite(n)) return '—';
  return '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: decimals });
}

export async function GET() {
  const data = await getLiveRates();
  const conversions = data?.conversions;

  const g24kGram = conversions?.gold?.['24k']?.perGram?.ask ?? 8050;
  const g22kGram = conversions?.gold?.['22k']?.perGram?.ask ?? Math.round(g24kGram * 0.91667);
  const silverKg = (conversions?.silver?.perGram?.ask ?? 100) * 1000;
  const usdInr = conversions?.usdInr?.ask ?? 84.15;

  const g24k10g = g24kGram * 10;
  const g22k10g = g22kGram * 10;

  const todayStr = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });

  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #120e04 0%, #241a05 50%, #0d0a02 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '50px 65px',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top gold accent line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '6px',
            background: 'linear-gradient(90deg, #d4af37, #ffd700, #fff275, #ffd700, #b8860b)',
            display: 'flex',
          }}
        />

        {/* Ambient gold glow */}
        <div
          style={{
            position: 'absolute',
            top: -100,
            right: -60,
            width: 440,
            height: 440,
            borderRadius: '50%',
            background: 'rgba(255, 215, 0, 0.08)',
            display: 'flex',
          }}
        />

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: 'rgba(255, 215, 0, 0.12)',
              border: '1.5px solid rgba(255, 215, 0, 0.35)',
              borderRadius: 30,
              padding: '8px 18px',
            }}
          >
            <div
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: '#ffd700',
                display: 'flex',
              }}
            />
            <div
              style={{
                color: '#fff275',
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '1px',
                display: 'flex',
              }}
            >
              LIVE INDICATIVE RATES · {todayStr.toUpperCase()}
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'monospace',
            }}
          >
            ARN-251838 · AMFI REGISTERED
          </div>
        </div>

        {/* Main Titles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div
            style={{
              color: '#d4af37',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '2px',
              display: 'flex',
            }}
          >
            PRECIOUS METALS TICKER · INDIA
          </div>
          <div
            style={{
              color: '#ffffff',
              fontSize: 44,
              fontWeight: 900,
              letterSpacing: '-1px',
              display: 'flex',
            }}
          >
            Today&apos;s Gold Rate &amp; Silver Price in India
          </div>
          <div
            style={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: 18,
              display: 'flex',
            }}
          >
            Live 24K (999) &amp; 22K (916) bullion rates per 10g/gram, Silver per kg, and USD/INR.
          </div>
        </div>

        {/* KPI Rate Cards */}
        <div style={{ display: 'flex', gap: 18 }}>
          {/* 24K Gold */}
          <div
            style={{
              flex: 1,
              background: 'rgba(255, 215, 0, 0.08)',
              border: '1.5px solid rgba(255, 215, 0, 0.3)',
              borderRadius: 16,
              padding: '18px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ color: '#ffd700', fontSize: 13, fontWeight: 700, letterSpacing: '1px', display: 'flex' }}>
              24K GOLD (999 FINE)
            </div>
            <div style={{ color: '#ffffff', fontSize: 32, fontWeight: 900, fontFamily: 'monospace', display: 'flex' }}>
              {fmt(g24k10g)}
            </div>
            <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 13, display: 'flex' }}>
              per 10 gram · {fmt(g24kGram)}/g
            </div>
          </div>

          {/* 22K Gold */}
          <div
            style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1.5px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 16,
              padding: '18px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ color: '#ffe082', fontSize: 13, fontWeight: 700, letterSpacing: '1px', display: 'flex' }}>
              22K GOLD (916 JEWELLERY)
            </div>
            <div style={{ color: '#ffffff', fontSize: 32, fontWeight: 900, fontFamily: 'monospace', display: 'flex' }}>
              {fmt(g22k10g)}
            </div>
            <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 13, display: 'flex' }}>
              per 10 gram · {fmt(g22kGram)}/g
            </div>
          </div>

          {/* Silver 1kg */}
          <div
            style={{
              flex: 1,
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1.5px solid rgba(255, 255, 255, 0.15)',
              borderRadius: 16,
              padding: '18px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            <div style={{ color: '#cfd8dc', fontSize: 13, fontWeight: 700, letterSpacing: '1px', display: 'flex' }}>
              SILVER (999 FINE)
            </div>
            <div style={{ color: '#ffffff', fontSize: 32, fontWeight: 900, fontFamily: 'monospace', display: 'flex' }}>
              {fmt(silverKg)}
            </div>
            <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 13, display: 'flex' }}>
              per 1 kg · {fmt(silverKg / 1000)}/g
            </div>
          </div>
        </div>

        {/* Footer brand strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            paddingTop: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={OG_LOGO_FULL_URL} alt="Abundance" width={140} height={32} style={{ objectFit: 'contain' }} />
            <div style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: 13, display: 'flex' }}>
              mfcalc.getabundance.in/gold-silver-rates
            </div>
          </div>

          <div style={{ display: 'flex', gap: 20 }}>
            <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: 13, display: 'flex' }}>
              USD/INR: <strong style={{ color: '#fff', marginLeft: 5 }}>₹{usdInr.toFixed(2)}</strong>
            </div>
            <div style={{ color: '#81c784', fontSize: 13, fontWeight: 700, display: 'flex' }}>
              Track Gold ETFs &amp; Multi-Asset Funds →
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
