// api/og.js — Dynamic OG image for SWP Backtester shared links
// Uses @vercel/og with plain JS (no JSX) — compatible with no-build projects

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);

    const btName   = searchParams.get('btName')   || '';
    const corpus   = searchParams.get('btCorpus') || '';
    const withdraw = searchParams.get('btWithdrawal') || '';
    const btSY     = searchParams.get('btSY')     || '';
    const btSM     = searchParams.get('btSM')     || '';
    const btEY     = searchParams.get('btEY')     || '';
    const btEM     = searchParams.get('btEM')     || '';
    const xirr     = searchParams.get('xirr')     || '';
    const survived = searchParams.get('survived') || '';
    const finalC   = searchParams.get('finalC')   || '';
    const isBT     = !!btName;

    // Format to Indian number system
    function fmtINR(n) {
      n = Math.round(parseFloat(n) || 0);
      if (n >= 10000000) return (n / 10000000).toFixed(2) + ' Cr';
      if (n >= 100000)   return (n / 100000).toFixed(2) + ' L';
      return n.toLocaleString('en-IN');
    }

    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const startLabel = (btSY && btSM) ? `${MONTHS[parseInt(btSM)-1]} ${btSY}` : '';
    const endLabel   = (btEY && btEM) ? `${MONTHS[parseInt(btEM)-1]} ${btEY}` : 'Today';
    const periodLabel = startLabel ? `${startLabel} → ${endLabel}` : '';

    const survivalOK  = survived === '1';
    const survivalBad = survived === '0';
    const survivalBg  = survivalOK  ? 'rgba(0,137,123,.2)'  : survivalBad ? 'rgba(183,28,28,.2)'  : 'transparent';
    const survivalBdr = survivalOK  ? 'rgba(0,137,123,.5)'  : survivalBad ? 'rgba(183,28,28,.5)'  : 'transparent';
    const survivalClr = survivalOK  ? '#4db6ac'              : survivalBad ? '#ef9a9a'              : '#fff';
    const survivalTxt = survivalOK  ? '✅ Corpus Survived'   : survivalBad ? '⚠️ Corpus Depleted'  : '';

    const shortName = btName.length > 52 ? btName.slice(0, 52) + '…' : btName;
    const xirrNum = parseFloat(xirr);
    const xirrColor = xirr ? (xirrNum > 0 ? '#66bb6a' : '#ef5350') : '#e0f2f1';

    return new ImageResponse(
      {
        type: 'div',
        props: {
          style: {
            width: '1200px', height: '630px',
            display: 'flex', flexDirection: 'column',
            background: 'linear-gradient(135deg,#071a07 0%,#0f2d0f 50%,#081a08 100%)',
            fontFamily: 'sans-serif', overflow: 'hidden', position: 'relative',
          },
          children: [
            // Top accent line
            { type: 'div', props: { style: { width: '100%', height: '5px', background: 'linear-gradient(90deg,#00897b,#2e7d32,#66bb6a)', flexShrink: 0, display: 'flex' } } },

            // Main content row
            { type: 'div', props: {
              style: { display: 'flex', flex: 1, padding: '36px 60px', gap: '40px', alignItems: 'center' },
              children: [
                // Left column
                { type: 'div', props: {
                  style: { display: 'flex', flexDirection: 'column', flex: 1, gap: '14px' },
                  children: [
                    // Brand
                    { type: 'div', props: {
                      style: { display: 'flex', alignItems: 'center', gap: '10px' },
                      children: [
                        { type: 'div', props: { style: { fontSize: '28px', display: 'flex' }, children: '📊' } },
                        { type: 'div', props: {
                          style: { display: 'flex', flexDirection: 'column' },
                          children: [
                            { type: 'span', props: { style: { color: '#66bb6a', fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }, children: 'Abundance Financial Services' } },
                            { type: 'span', props: { style: { color: 'rgba(255,255,255,.4)', fontSize: '10px', marginTop: '1px' }, children: 'ARN-251838 · AMFI Registered MFD' } },
                          ]
                        } }
                      ]
                    } },
                    // Title
                    { type: 'span', props: { style: { color: '#fff', fontSize: isBT ? '38px' : '46px', fontWeight: 800, lineHeight: 1.1 }, children: isBT ? 'SWP Backtester' : 'MF Risk & Return Analyzer' } },
                    // Fund name
                    ...(isBT && shortName ? [{ type: 'span', props: { style: { color: '#80cbc4', fontSize: '20px', fontWeight: 600, lineHeight: 1.3 }, children: shortName } }] : []),
                    // Not BT subtitle
                    ...(!isBT ? [{ type: 'span', props: { style: { color: 'rgba(255,255,255,.55)', fontSize: '20px' }, children: 'Fund Compare · SIP · Goal Planner · SWP · EMI' } }] : []),
                    // Period badge
                    ...(periodLabel ? [{
                      type: 'div', props: {
                        style: { display: 'flex', background: 'rgba(0,137,123,.2)', border: '1px solid rgba(0,137,123,.4)', borderRadius: '8px', padding: '6px 14px', width: 'fit-content' },
                        children: { type: 'span', props: { style: { color: '#4db6ac', fontSize: '13px', fontWeight: 700 }, children: `📅 ${periodLabel}` } }
                      }
                    }] : []),
                    // Survival badge
                    ...(survivalTxt ? [{
                      type: 'div', props: {
                        style: { display: 'flex', background: survivalBg, border: `1px solid ${survivalBdr}`, borderRadius: '8px', padding: '6px 14px', width: 'fit-content' },
                        children: { type: 'span', props: { style: { color: survivalClr, fontSize: '14px', fontWeight: 800 }, children: survivalTxt } }
                      }
                    }] : []),
                  ]
                } },

                // Right: stats card (BT) or feature list (generic)
                { type: 'div', props: {
                  style: {
                    display: 'flex', flexDirection: 'column', gap: '14px',
                    background: 'rgba(255,255,255,.06)', border: '1.5px solid rgba(255,255,255,.1)',
                    borderRadius: '16px', padding: '26px 30px', minWidth: '260px',
                  },
                  children: isBT ? [
                    ...(corpus ? [{
                      type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '2px' },
                        children: [
                          { type: 'span', props: { style: { color: 'rgba(255,255,255,.45)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }, children: 'Starting Corpus' } },
                          { type: 'span', props: { style: { color: '#fff', fontSize: '26px', fontWeight: 800 }, children: `₹${fmtINR(corpus)}` } },
                        ]
                      }
                    }] : []),
                    ...(withdraw ? [{
                      type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '2px' },
                        children: [
                          { type: 'span', props: { style: { color: 'rgba(255,255,255,.45)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }, children: 'Monthly Withdrawal' } },
                          { type: 'span', props: { style: { color: '#80cbc4', fontSize: '20px', fontWeight: 800 }, children: `₹${fmtINR(withdraw)}/mo` } },
                        ]
                      }
                    }] : []),
                    ...(xirr ? [{
                      type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '2px' },
                        children: [
                          { type: 'span', props: { style: { color: 'rgba(255,255,255,.45)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }, children: 'XIRR' } },
                          { type: 'span', props: { style: { color: xirrColor, fontSize: '20px', fontWeight: 800 }, children: `${xirr}% p.a.` } },
                        ]
                      }
                    }] : []),
                    ...(finalC && survivalOK ? [{
                      type: 'div', props: { style: { display: 'flex', flexDirection: 'column', gap: '2px' },
                        children: [
                          { type: 'span', props: { style: { color: 'rgba(255,255,255,.45)', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }, children: 'Remaining Corpus' } },
                          { type: 'span', props: { style: { color: '#66bb6a', fontSize: '20px', fontWeight: 800 }, children: `₹${fmtINR(finalC)}` } },
                        ]
                      }
                    }] : []),
                  ] : [
                    ...['📈 Fund Comparison','🧮 SIP & Lumpsum','🎯 Goal Planner','💸 SWP + Backtester','🏦 EMI & Loans'].map(f => ({
                      type: 'div', props: {
                        style: { display: 'flex', alignItems: 'center', gap: '8px' },
                        children: [
                          { type: 'div', props: { style: { width: '5px', height: '5px', borderRadius: '50%', background: '#66bb6a', flexShrink: 0, display: 'flex' } } },
                          { type: 'span', props: { style: { color: 'rgba(255,255,255,.8)', fontSize: '14px', fontWeight: 600 }, children: f } },
                        ]
                      }
                    })),
                    { type: 'div', props: {
                      style: { marginTop: '6px', padding: '7px 12px', background: 'rgba(46,125,50,.2)', borderRadius: '8px', display: 'flex' },
                      children: { type: 'span', props: { style: { color: '#66bb6a', fontSize: '11px', fontWeight: 700 }, children: 'mfcalc.getabundance.in' } }
                    } },
                  ]
                } },
              ]
            } },

            // Bottom bar
            { type: 'div', props: {
              style: {
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 60px', background: 'rgba(0,0,0,.35)',
                borderTop: '1px solid rgba(255,255,255,.07)', flexShrink: 0,
              },
              children: [
                { type: 'span', props: { style: { color: 'rgba(255,255,255,.45)', fontSize: '11px' }, children: 'mfcalc.getabundance.in' } },
                { type: 'span', props: { style: { color: 'rgba(255,255,255,.25)', fontSize: '10px' }, children: 'MF investments are subject to market risks · Data: AMFI / mfapi.in' } },
                { type: 'span', props: { style: { color: 'rgba(255,255,255,.45)', fontSize: '11px' }, children: 'Free · No Login Required' } },
              ]
            } },
          ]
        }
      },
      { width: 1200, height: 630 }
    );
  } catch (e) {
    return new Response(`OG image error: ${e.message}`, { status: 500 });
  }
}
