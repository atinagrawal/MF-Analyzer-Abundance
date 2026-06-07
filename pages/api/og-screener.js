// pages/api/og-screener.js — Dynamic OG PNG for the MF Screener. 1200x630.
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { origin } = new URL(req.url);
  let logoData = null;
  try { const r = await fetch(`${origin}/logo-og.png`); if (r.ok) logoData = await r.arrayBuffer(); } catch (e) {}

  // little ranked-bars motif (decorative)
  const bars = [88, 72, 60, 50, 40].map((w, i) => ({
    type: 'div',
    props: {
      style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 },
      children: [
        { type: 'div', props: { style: { width: 26, height: 9, borderRadius: 3, background: 'rgba(255,255,255,0.25)', display: 'flex' } } },
        { type: 'div', props: { style: { width: `${w}%`, height: 9, borderRadius: 3, background: i === 0 ? 'linear-gradient(90deg,#66bb6a,#2e7d32)' : 'linear-gradient(90deg,#43a047,#1b5e20)', display: 'flex' } } },
      ],
    },
  }));
  const pills = ['Returns', 'Volatility', 'Drawdown'].map((p) => ({
    type: 'div',
    props: {
      style: { display: 'flex', background: 'rgba(0,137,123,0.18)', border: '1px solid rgba(0,137,123,0.5)', borderRadius: 999, padding: '6px 16px' },
      children: { type: 'div', props: { style: { color: '#4db6ac', fontSize: 16, fontWeight: 700 }, children: p } },
    },
  }));

  const el = {
    type: 'div',
    props: {
      style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg,#0a1f0a 0%,#1b3d1b 55%,#0d2b0d 100%)', fontFamily: 'sans-serif' },
      children: [
        { type: 'div', props: { style: { width: '100%', height: 5, background: 'linear-gradient(90deg,#00897b,#2e7d32,#66bb6a)', display: 'flex' } } },
        { type: 'div', props: {
          style: { display: 'flex', flex: 1, padding: '34px 52px', gap: 40, alignItems: 'center' },
          children: [
            { type: 'div', props: {
              style: { display: 'flex', flexDirection: 'column', flex: 1 },
              children: [
                { type: 'div', props: {
                  style: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 },
                  children: [
                    logoData ? { type: 'img', props: { src: logoData, style: { height: 44, width: 44, objectFit: 'contain' } } }
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
                { type: 'div', props: { style: { color: '#fff', fontSize: 56, fontWeight: 800, lineHeight: 1.05, marginBottom: 10, display: 'flex' }, children: 'Mutual Fund Screener' } },
                { type: 'div', props: { style: { color: 'rgba(255,255,255,0.66)', fontSize: 21, lineHeight: 1.3, marginBottom: 18, display: 'flex' }, children: 'Filter 2,500+ regular funds by return, risk & category' } },
                { type: 'div', props: { style: { display: 'flex', gap: 10, marginBottom: 18 }, children: pills } },
                { type: 'div', props: {
                  style: { display: 'flex', alignItems: 'center', gap: 12 },
                  children: [
                    { type: 'div', props: { style: { background: '#2e7d32', borderRadius: 9, padding: '9px 18px', display: 'flex' }, children: { type: 'div', props: { style: { color: '#fff', fontSize: 14, fontWeight: 800 }, children: 'Explore Funds' } } } },
                    { type: 'div', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 13 }, children: 'mfcalc.getabundance.in/screener' } },
                  ],
                } },
              ],
            } },
            { type: 'div', props: {
              style: { display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '22px 24px', width: 300 },
              children: [
                { type: 'div', props: { style: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8, display: 'flex' }, children: 'Ranked by 3-yr return' } },
                ...bars,
                { type: 'div', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 8, display: 'flex' }, children: 'Real AMFI NAVs · updated daily' } },
              ],
            } },
          ],
        } },
        { type: 'div', props: {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 52px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.08)' },
          children: [
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.55)', fontSize: 11, display: 'flex' }, children: 'Past performance is not indicative of future results' } },
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.55)', fontSize: 11, display: 'flex' }, children: 'Regular plans · Free' } },
          ],
        } },
      ],
    },
  };
  return new ImageResponse(el, { width: 1200, height: 630, headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' } });
}
