// pages/api/og-breadth.js — Dynamic OG PNG for the Market Breadth dashboard. 1200x630.
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { origin } = new URL(req.url);
  let logoData = null;
  try { const r = await fetch(`${origin}/logo-og.png`); if (r.ok) logoData = await r.arrayBuffer(); } catch (e) {}

  const dmaBars = [['20D', 44], ['50D', 54], ['100D', 59], ['150D', 51], ['200D', 47]].map(([l, v]) => ({
    type: 'div',
    props: {
      style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 },
      children: [
        { type: 'div', props: { style: { display: 'flex', alignItems: 'flex-end', height: 120, width: 30, background: 'rgba(255,255,255,0.07)', borderRadius: 5 },
          children: { type: 'div', props: { style: { width: 30, height: Math.round(120 * v / 100), background: v >= 50 ? 'linear-gradient(180deg,#66bb6a,#2e7d32)' : 'linear-gradient(180deg,#ffb74d,#e65100)', borderRadius: 5, display: 'flex' } } } } },
        { type: 'div', props: { style: { color: '#fff', fontSize: 16, fontWeight: 800, display: 'flex' }, children: v + '%' } },
        { type: 'div', props: { style: { color: 'rgba(255,255,255,0.5)', fontSize: 12, display: 'flex' }, children: l } },
      ],
    },
  }));

  const el = {
    type: 'div',
    props: {
      style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg,#0a1f0a 0%,#1b3d1b 55%,#0d2b0d 100%)', fontFamily: 'sans-serif' },
      children: [
        { type: 'div', props: { style: { width: '100%', height: 5, background: 'linear-gradient(90deg,#00897b,#2e7d32,#66bb6a)', display: 'flex' } } },
        { type: 'div', props: {
          style: { display: 'flex', flex: 1, padding: '34px 52px', gap: 44, alignItems: 'center' },
          children: [
            { type: 'div', props: {
              style: { display: 'flex', flexDirection: 'column', flex: 1 },
              children: [
                { type: 'div', props: { style: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 },
                  children: [
                    logoData ? { type: 'img', props: { src: logoData, style: { height: 42, width: 42 } } } : { type: 'div', props: { style: { color: '#66bb6a', fontSize: 18, fontWeight: 800, display: 'flex' }, children: 'Abundance' } },
                    { type: 'div', props: { style: { display: 'flex', flexDirection: 'column' }, children: [
                      { type: 'div', props: { style: { color: '#66bb6a', fontSize: 11, fontWeight: 700, letterSpacing: 2, display: 'flex' }, children: 'ABUNDANCE · PREMIUM' } },
                      { type: 'div', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 10, display: 'flex' }, children: 'ARN-251838 · AMFI Registered MFD & SIF Distributor' } },
                    ] } },
                  ] } },
                { type: 'div', props: { style: { color: '#fff', fontSize: 54, fontWeight: 800, lineHeight: 1.05, marginBottom: 12, display: 'flex' }, children: 'Market Breadth' } },
                { type: 'div', props: { style: { color: 'rgba(255,255,255,0.66)', fontSize: 20, lineHeight: 1.3, marginBottom: 16, display: 'flex' }, children: '% of stocks above key moving averages · advance-decline · new highs/lows' } },
                { type: 'div', props: { style: { display: 'flex', gap: 10, alignItems: 'center' },
                  children: [
                    { type: 'div', props: { style: { background: 'rgba(255,183,77,0.16)', border: '1px solid rgba(255,183,77,0.5)', borderRadius: 999, padding: '7px 18px', display: 'flex' }, children: { type: 'div', props: { style: { color: '#ffb74d', fontSize: 17, fontWeight: 800 }, children: 'Regime: Mixed / neutral' } } } },
                    { type: 'div', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 13, display: 'flex' }, children: 'mfcalc.getabundance.in/market-breadth' } },
                  ] } },
              ],
            } },
            { type: 'div', props: {
              style: { display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '20px 22px', width: 320 },
              children: [
                { type: 'div', props: { style: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700, letterSpacing: 1, marginBottom: 16, display: 'flex' }, children: 'STOCKS ABOVE EACH DMA' } },
                { type: 'div', props: { style: { display: 'flex', gap: 8, alignItems: 'flex-end' }, children: dmaBars } },
              ],
            } },
          ],
        } },
        { type: 'div', props: { style: { display: 'flex', justifyContent: 'space-between', padding: '11px 52px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.08)' },
          children: [
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.55)', fontSize: 11, display: 'flex' }, children: 'Educational market context — not investment advice' } },
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.55)', fontSize: 11, display: 'flex' }, children: 'Updated daily' } },
          ] } },
      ],
    },
  };
  return new ImageResponse(el, { width: 1200, height: 630, headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
}
