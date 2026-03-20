// api/og.js — Dynamic OG PNG image
// Uses @vercel/og — returns image/png, no fit-content, no unsupported CSS

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);

  const btName   = searchParams.get('btName') || '';
  const corpus   = searchParams.get('btCorpus') || '';
  const withdraw = searchParams.get('btWithdrawal') || '';
  const btSY     = searchParams.get('btSY') || '';
  const btSM     = searchParams.get('btSM') || '';
  const btEY     = searchParams.get('btEY') || '';
  const btEM     = searchParams.get('btEM') || '';
  const xirr     = searchParams.get('xirr') || '';
  const survived = searchParams.get('survived') || '';
  const finalC   = searchParams.get('finalC') || '';
  const tab      = searchParams.get('tab') || '';

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const isBT   = tab === 'swp' && !!btName;

  function fmtINR(val) {
    const n = Math.round(parseFloat(val) || 0);
    if (n >= 1e7) return (n / 1e7).toFixed(1) + ' Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(1) + ' L';
    return n.toLocaleString('en-IN');
  }

  const period = (btSY && btSM)
    ? `${MONTHS[parseInt(btSM)-1]} ${btSY} – ${(btEY && btEM) ? MONTHS[parseInt(btEM)-1]+' '+btEY : 'Today'}`
    : '';

  const fundShort = btName.length > 42 ? btName.slice(0, 42) + '…' : btName;
  const survives  = survived === '1';
  const depleted  = survived === '0';

  // Build stat rows for right panel
  const stats = [
    corpus   ? { label: 'Corpus',      value: '₹' + fmtINR(corpus),            color: '#ffffff' } : null,
    withdraw ? { label: 'Withdrawal',  value: '₹' + fmtINR(withdraw) + '/mo',  color: '#80cbc4' } : null,
    xirr     ? { label: 'XIRR',        value: xirr + '% p.a.',                  color: parseFloat(xirr) > 0 ? '#a5d6a7' : '#ef9a9a' } : null,
    (finalC && survives) ? { label: 'Remaining', value: '₹' + fmtINR(finalC),  color: '#a5d6a7' } : null,
  ].filter(Boolean);

  const features = ['📈 Fund Comparison', '🧮 SIP & Lumpsum', '🎯 Goal Planner', '💸 SWP + Backtester', '🏦 EMI & Loans'];

  return new ImageResponse(
    {
      type: 'div',
      props: {
        style: {
          width: '100%', height: '100%',
          display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(135deg, #0a1f0a 0%, #1b3d1b 55%, #0d2b0d 100%)',
          fontFamily: 'sans-serif',
        },
        children: [

          // Top accent bar
          { type: 'div', props: { style: { width: '100%', height: 5, background: 'linear-gradient(90deg,#00897b,#2e7d32,#66bb6a)', flexShrink: 0, display: 'flex' } } },

          // Main content row
          { type: 'div', props: {
            style: { display: 'flex', flex: 1, padding: '36px 56px', gap: 40, alignItems: 'center' },
            children: [

              // LEFT column
              { type: 'div', props: {
                style: { display: 'flex', flexDirection: 'column', flex: 1 },
                children: [

                  // Brand row
                  { type: 'div', props: {
                    style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 },
                    children: [
                      { type: 'div', props: { style: { width: 40, height: 40, borderRadius: 10, background: 'rgba(46,125,50,0.4)', border: '1.5px solid rgba(102,187,106,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }, children: '📊' } },
                      { type: 'div', props: {
                        style: { display: 'flex', flexDirection: 'column' },
                        children: [
                          { type: 'div', props: { style: { color: '#66bb6a', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }, children: 'ABUNDANCE FINANCIAL SERVICES' } },
                          { type: 'div', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 1 }, children: 'ARN-251838 · AMFI Registered MFD' } },
                        ],
                      } },
                    ],
                  } },

                  // Headline
                  { type: 'div', props: { style: { color: '#ffffff', fontSize: isBT ? 52 : 58, fontWeight: 800, lineHeight: 1.05, marginBottom: 10 }, children: isBT ? 'SWP Backtester' : 'MF Risk & Return' } },

                  // Fund name or subtitle
                  isBT && fundShort
                    ? { type: 'div', props: { style: { color: '#80cbc4', fontSize: 19, fontWeight: 600, lineHeight: 1.3, marginBottom: 14 }, children: fundShort } }
                    : { type: 'div', props: { style: { color: 'rgba(255,255,255,0.6)', fontSize: 20, marginBottom: 14 }, children: 'Fund Compare · SIP · SWP · EMI' } },

                  // Period badge
                  ...(isBT && period ? [
                    { type: 'div', props: {
                      style: { display: 'flex', alignItems: 'center', background: 'rgba(0,137,123,0.2)', border: '1px solid rgba(0,137,123,0.5)', borderRadius: 8, padding: '6px 14px', marginBottom: 10 },
                      children: { type: 'div', props: { style: { color: '#4db6ac', fontSize: 14, fontWeight: 700 }, children: '📅 ' + period } },
                    } },
                  ] : []),

                  // Survival badge
                  ...(isBT && (survives || depleted) ? [
                    { type: 'div', props: {
                      style: { display: 'flex', alignItems: 'center', background: survives ? 'rgba(0,137,123,0.18)' : 'rgba(239,83,80,0.18)', border: '1px solid ' + (survives ? 'rgba(0,137,123,0.5)' : 'rgba(239,83,80,0.5)'), borderRadius: 8, padding: '6px 14px', marginBottom: 10 },
                      children: { type: 'div', props: { style: { color: survives ? '#4db6ac' : '#ef5350', fontSize: 15, fontWeight: 800 }, children: survives ? '✅  Corpus Survived' : '⚠️  Corpus Depleted' } },
                    } },
                  ] : []),

                  // CTA
                  { type: 'div', props: {
                    style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 },
                    children: [
                      { type: 'div', props: { style: { background: '#2e7d32', borderRadius: 8, padding: '8px 18px', display: 'flex', alignItems: 'center' }, children: { type: 'div', props: { style: { color: '#fff', fontSize: 14, fontWeight: 800 }, children: 'View Full Backtest →' } } } },
                      { type: 'div', props: { style: { color: 'rgba(255,255,255,0.4)', fontSize: 13 }, children: 'mfcalc.getabundance.in' } },
                    ],
                  } },

                ],
              } },

              // RIGHT card
              { type: 'div', props: {
                style: { display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 16, padding: '24px 26px', width: 270, flexShrink: 0 },
                children: [
                  { type: 'div', props: { style: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 8 }, children: isBT ? 'BACKTEST RESULTS' : 'FEATURES' } },

                  // Stats (backtest) or features (generic)
                  ...(isBT ? stats.map(s =>
                    ({ type: 'div', props: {
                      style: { display: 'flex', flexDirection: 'column', marginBottom: 14 },
                      children: [
                        { type: 'div', props: { style: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }, children: s.label } },
                        { type: 'div', props: { style: { color: s.color, fontSize: 24, fontWeight: 800, lineHeight: 1.1 }, children: s.value } },
                      ],
                    } })
                  ) : features.map(f =>
                    ({ type: 'div', props: {
                      style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 },
                      children: [
                        { type: 'div', props: { style: { width: 6, height: 6, borderRadius: 3, background: '#66bb6a', flexShrink: 0 } } },
                        { type: 'div', props: { style: { color: 'rgba(255,255,255,0.88)', fontSize: 15, fontWeight: 600 }, children: f } },
                      ],
                    } })
                  )),
                ],
              } },

            ],
          } },

          // Bottom bar
          { type: 'div', props: {
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 56px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 },
            children: [
              { type: 'div', props: { style: { color: 'rgba(255,255,255,0.55)', fontSize: 12 }, children: 'mfcalc.getabundance.in' } },
              { type: 'div', props: { style: { color: 'rgba(255,255,255,0.3)', fontSize: 10 }, children: 'MF investments are subject to market risks · AMFI registered' } },
              { type: 'div', props: { style: { color: 'rgba(255,255,255,0.55)', fontSize: 12 }, children: 'Free · No Login Required' } },
            ],
          } },

        ],
      },
    },
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    }
  );
}
