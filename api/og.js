// api/og.js — Dynamic OG PNG image for SWP Backtester share links
// Logo loaded from local public/ file — fast, reliable, no external fetch

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams, origin } = new URL(req.url);

  const btName   = searchParams.get('btName')       || '';
  const corpus   = searchParams.get('btCorpus')     || '';
  const withdraw = searchParams.get('btWithdrawal') || '';
  const btSY     = searchParams.get('btSY')         || '';
  const btSM     = searchParams.get('btSM')         || '';
  const btEY     = searchParams.get('btEY')         || '';
  const btEM     = searchParams.get('btEM')         || '';
  const xirr     = searchParams.get('xirr')         || '';
  const survived = searchParams.get('survived')     || '';
  const finalC   = searchParams.get('finalC')       || '';
  const withdrawn= searchParams.get('withdrawn')    || '';
  const tab      = searchParams.get('tab')          || '';

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const isBT   = tab === 'swp' && !!btName;

  function fmtINR(val) {
    const n = Math.round(parseFloat(val) || 0);
    if (n >= 1e7) return (n / 1e7).toFixed(1) + ' Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(1) + ' L';
    return n.toLocaleString('en-IN');
  }

  const period = (btSY && btSM)
    ? `${MONTHS[parseInt(btSM)-1]} ${btSY} to ${(btEY && btEM) ? MONTHS[parseInt(btEM)-1]+' '+btEY : 'Today'}`
    : '';

  const fundShort = btName.length > 40 ? btName.slice(0, 40) + '...' : btName;
  const survives  = survived === '1';
  const depleted  = survived === '0';

  // Load logo from local public/ — served from CDN, zero latency, no external dependency
  // Falls back gracefully if file not found yet
  let logoData = null;
  try {
    const logoRes = await fetch(`${origin}/logo-og.png`);
    if (logoRes.ok) logoData = await logoRes.arrayBuffer();
  } catch (e) { /* fall back to text logo */ }

  // Stat rows — plain text labels, no emoji (Satori emoji rendering unreliable)
  const stats = [
    corpus    ? { label: 'Starting Corpus',   value: 'Rs ' + fmtINR(corpus),            color: '#ffffff' } : null,
    withdraw  ? { label: 'Monthly Withdrawal', value: 'Rs ' + fmtINR(withdraw) + '/mo',  color: '#80cbc4' } : null,
    xirr      ? { label: 'XIRR',              value: xirr + '% p.a.',                    color: parseFloat(xirr) > 0 ? '#a5d6a7' : '#ef9a9a' } : null,
    (finalC && survives) ? { label: 'Remaining Corpus', value: 'Rs ' + fmtINR(finalC),  color: '#a5d6a7' } : null,
    withdrawn ? { label: 'Total Withdrawn',   value: 'Rs ' + fmtINR(withdrawn),          color: '#ffcc80' } : null,
  ].filter(Boolean);

  const features = [
    'Fund Comparison (up to 5)',
    'SIP & Lumpsum Calculator',
    'Goal Planner',
    'SWP + NAV Backtester',
    'EMI & Loan Calculator',
  ];

  const el = {
    type: 'div',
    props: {
      style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: 'linear-gradient(135deg,#0a1f0a 0%,#1b3d1b 55%,#0d2b0d 100%)', fontFamily: 'sans-serif' },
      children: [

        // Top accent bar
        { type: 'div', props: { style: { width: '100%', height: 5, background: 'linear-gradient(90deg,#00897b,#2e7d32,#66bb6a)', flexShrink: 0, display: 'flex' } } },

        // Main row
        { type: 'div', props: {
          style: { display: 'flex', flex: 1, padding: '32px 52px', gap: 36, alignItems: 'center' },
          children: [

            // LEFT column
            { type: 'div', props: {
              style: { display: 'flex', flexDirection: 'column', flex: 1 },
              children: [

                // Brand: logo + name
                { type: 'div', props: {
                  style: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 },
                  children: [
                    logoData
                      ? {
                          type: 'img',
                          props: {
                            src: logoData,
                            width: 44,
                            height: 50,
                            style: { objectFit: 'contain', objectPosition: 'left center', mixBlendMode: 'screen' },
                          },
                        }
                      : {
                          // Text fallback if logo not uploaded yet
                          type: 'div',
                          props: {
                            style: { display: 'flex', flexDirection: 'column' },
                            children: [
                              { type: 'div', props: { style: { color: '#66bb6a', fontSize: 18, fontWeight: 800, letterSpacing: 1 }, children: 'ABUNDANCE' } },
                              { type: 'div', props: { style: { color: 'rgba(255,255,255,0.5)', fontSize: 10, letterSpacing: 1.5 }, children: 'FINANCIAL SERVICES' } },
                            ],
                          },
                        },
                    // Vertical divider + ARN
                    { type: 'div', props: {
                      style: { display: 'flex', flexDirection: 'column', borderLeft: '1px solid rgba(255,255,255,0.2)', paddingLeft: 14 },
                      children: [
                        { type: 'div', props: { style: { color: '#66bb6a', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }, children: 'AMFI Registered MFD' } },
                        { type: 'div', props: { style: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 2 }, children: 'ARN-251838' } },
                      ],
                    } },
                  ],
                } },

                // Headline
                { type: 'div', props: { style: { color: '#ffffff', fontSize: isBT ? 50 : 56, fontWeight: 800, lineHeight: 1.05, marginBottom: 8 }, children: isBT ? 'SWP Backtester' : 'MF Risk & Return' } },

                // Fund name / subtitle
                isBT && fundShort
                  ? { type: 'div', props: { style: { color: '#80cbc4', fontSize: 18, fontWeight: 600, lineHeight: 1.3, marginBottom: 12 }, children: fundShort } }
                  : { type: 'div', props: { style: { color: 'rgba(255,255,255,0.6)', fontSize: 19, marginBottom: 12 }, children: 'Fund Compare  SIP  SWP  Goal  EMI' } },

                // Period
                ...(isBT && period ? [{
                  type: 'div', props: {
                    style: { display: 'flex', alignItems: 'center', background: 'rgba(0,137,123,0.2)', border: '1px solid rgba(0,137,123,0.5)', borderRadius: 8, padding: '5px 12px', marginBottom: 8 },
                    children: { type: 'div', props: { style: { color: '#4db6ac', fontSize: 13, fontWeight: 700 }, children: period } },
                  },
                }] : []),

                // Survival status
                ...(isBT && (survives || depleted) ? [{
                  type: 'div', props: {
                    style: { display: 'flex', alignItems: 'center', background: survives ? 'rgba(0,137,123,0.18)' : 'rgba(239,83,80,0.18)', border: '1px solid ' + (survives ? 'rgba(0,137,123,0.5)' : 'rgba(239,83,80,0.5)'), borderRadius: 8, padding: '5px 12px', marginBottom: 8 },
                    children: { type: 'div', props: { style: { color: survives ? '#4db6ac' : '#ef5350', fontSize: 15, fontWeight: 800 }, children: survives ? 'CORPUS SURVIVED' : 'CORPUS DEPLETED' } },
                  },
                }] : []),

                // CTA button
                { type: 'div', props: {
                  style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 },
                  children: [
                    { type: 'div', props: { style: { background: '#2e7d32', borderRadius: 8, padding: '7px 16px', display: 'flex', alignItems: 'center' }, children: { type: 'div', props: { style: { color: '#fff', fontSize: 13, fontWeight: 800 }, children: 'View Full Backtest' } } } },
                    { type: 'div', props: { style: { color: 'rgba(255,255,255,0.4)', fontSize: 12 }, children: 'mfcalc.getabundance.in' } },
                  ],
                } },

              ],
            } },

            // RIGHT stats/features card
            { type: 'div', props: {
              style: { display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '20px 22px', width: 260, flexShrink: 0 },
              children: [
                { type: 'div', props: { style: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 7 }, children: isBT ? 'BACKTEST RESULTS' : 'FEATURES' } },

                ...(isBT ? stats.map(s => ({
                  type: 'div', props: {
                    style: { display: 'flex', flexDirection: 'column', marginBottom: 11 },
                    children: [
                      { type: 'div', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 1 }, children: s.label } },
                      { type: 'div', props: { style: { color: s.color, fontSize: 20, fontWeight: 800, lineHeight: 1.1 }, children: s.value } },
                    ],
                  },
                })) : features.map(f => ({
                  type: 'div', props: {
                    style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 },
                    children: [
                      { type: 'div', props: { style: { width: 5, height: 5, borderRadius: 3, background: '#66bb6a', flexShrink: 0 } } },
                      { type: 'div', props: { style: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 600 }, children: f } },
                    ],
                  },
                }))),
              ],
            } },

          ],
        } },

        // Bottom bar
        { type: 'div', props: {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 52px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 },
          children: [
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.55)', fontSize: 11 }, children: 'mfcalc.getabundance.in' } },
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.3)', fontSize: 10 }, children: 'MF investments are subject to market risks' } },
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.55)', fontSize: 11 }, children: 'Free  No Login Required' } },
          ],
        } },

      ],
    },
  };

  return new ImageResponse(el, {
    width: 1200,
    height: 630,
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
  });
}
