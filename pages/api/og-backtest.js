// pages/api/og-backtest.js — Dynamic OG PNG for the Portfolio Backtester
// @vercel/og (Satori) — plain JS object tree, no JSX. 1200x630.

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { origin } = new URL(req.url);

  // Brand logo (embedded as bytes; never a self-referential fetch at render time)
  let logoData = null;
  try {
    const r = await fetch(`${origin}/logo-og.png`);
    if (r.ok) logoData = await r.arrayBuffer();
  } catch (e) {}

  // Ascending "hypothetical growth" bars (purely decorative — no figures implied)
  const barHeights = [34, 46, 42, 60, 72, 66, 88, 104, 124];
  const bars = barHeights.map((h, i) => ({
    type: 'div',
    props: {
      style: {
        width: 16,
        height: h,
        borderRadius: '4px 4px 0 0',
        background: i >= barHeights.length - 3
          ? 'linear-gradient(180deg,#66bb6a,#2e7d32)'
          : 'linear-gradient(180deg,#43a047,#1b5e20)',
        opacity: 0.55 + (i / barHeights.length) * 0.45,
        display: 'flex',
      },
    },
  }));

  const pills = ['SIP', 'Lumpsum', 'Combination'].map((p) => ({
    type: 'div',
    props: {
      style: {
        display: 'flex', alignItems: 'center',
        background: 'rgba(0,137,123,0.18)', border: '1px solid rgba(0,137,123,0.5)',
        borderRadius: 999, padding: '6px 16px',
      },
      children: { type: 'div', props: { style: { color: '#4db6ac', fontSize: 16, fontWeight: 700 }, children: p } },
    },
  }));

  const features = ['Per-fund strategy & start date', 'Pre-merger history, return-linked', 'XIRR, benchmark & PDF export'];

  const el = {
    type: 'div',
    props: {
      style: {
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        background: 'linear-gradient(135deg,#0a1f0a 0%,#1b3d1b 55%,#0d2b0d 100%)',
        fontFamily: 'sans-serif',
      },
      children: [
        { type: 'div', props: { style: { width: '100%', height: 5, background: 'linear-gradient(90deg,#00897b,#2e7d32,#66bb6a)', flexShrink: 0, display: 'flex' } } },

        { type: 'div', props: {
          style: { display: 'flex', flex: 1, padding: '34px 52px', gap: 36, alignItems: 'center' },
          children: [

            // LEFT
            { type: 'div', props: {
              style: { display: 'flex', flexDirection: 'column', flex: 1 },
              children: [
                { type: 'div', props: {
                  style: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 },
                  children: [
                    logoData
                      ? { type: 'img', props: { src: logoData, style: { height: 44, width: 44, objectFit: 'contain' } } }
                      : { type: 'div', props: { style: { color: '#66bb6a', fontSize: 18, fontWeight: 800, display: 'flex' }, children: 'Abundance' } },
                    { type: 'div', props: {
                      style: { display: 'flex', flexDirection: 'column' },
                      children: [
                        { type: 'div', props: { style: { color: '#66bb6a', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }, children: 'ABUNDANCE FINANCIAL SERVICES' } },
                        { type: 'div', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 1 }, children: 'ARN-251838  AMFI Registered MFD & SIF Distributor' } },
                      ],
                    } },
                  ],
                } },

                { type: 'div', props: { style: { color: '#ffffff', fontSize: 58, fontWeight: 800, lineHeight: 1.04, marginBottom: 10, display: 'flex' }, children: 'Portfolio Backtester' } },
                { type: 'div', props: { style: { color: 'rgba(255,255,255,0.66)', fontSize: 21, lineHeight: 1.3, marginBottom: 18, display: 'flex' }, children: 'Mutual funds + SIFs, replayed through real historical NAVs' } },

                { type: 'div', props: { style: { display: 'flex', gap: 10, marginBottom: 18 }, children: pills } },

                { type: 'div', props: {
                  style: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 },
                  children: [
                    { type: 'div', props: { style: { background: '#2e7d32', borderRadius: 9, padding: '9px 18px', display: 'flex', alignItems: 'center' }, children: { type: 'div', props: { style: { color: '#fff', fontSize: 14, fontWeight: 800 }, children: 'Build a Portfolio' } } } },
                    { type: 'div', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 13 }, children: 'mfcalc.getabundance.in/backtest' } },
                  ],
                } },
              ],
            } },

            // RIGHT CARD
            { type: 'div', props: {
              style: { display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '22px 24px', width: 320, flexShrink: 0 },
              children: [
                { type: 'div', props: { style: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8, display: 'flex' }, children: 'Hypothetical Growth' } },
                { type: 'div', props: { style: { display: 'flex', alignItems: 'flex-end', gap: 9, height: 130, marginBottom: 18 }, children: bars } },
                ...features.map((f) => ({
                  type: 'div', props: {
                    style: { display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 },
                    children: [
                      { type: 'div', props: { style: { width: 6, height: 6, borderRadius: 3, background: '#66bb6a', flexShrink: 0, display: 'flex' } } },
                      { type: 'div', props: { style: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 600, display: 'flex' }, children: f } },
                    ],
                  },
                })),
              ],
            } },
          ],
        } },

        { type: 'div', props: {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 52px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 },
          children: [
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.55)', fontSize: 11 }, children: 'Past performance is not indicative of future results' } },
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.55)', fontSize: 11 }, children: 'Free  No Login Required' } },
          ],
        } },
      ],
    },
  };

  return new ImageResponse(el, {
    width: 1200,
    height: 630,
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
  });
}
