// api/og.js — Dynamic OG PNG image for SIP & SWP Backtester share links
// Uses @vercel/og — returns image/png via plain JS object tree (no JSX)

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams, origin } = new URL(req.url);

  const tab      = searchParams.get('tab') || '';
  // SWP backtester params
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
  const withdrawn= searchParams.get('withdrawn') || '';
  // SIP backtester params
  const sipBTMode   = searchParams.get('sipBTMode') || '';
  const sipBTName   = searchParams.get('sipBTName') || '';
  const sipBTAmount = searchParams.get('sipBTAmount') || '';
  const sipBTStepup = searchParams.get('sipBTStepup') || '';
  const sipBTSY     = searchParams.get('sipBTSY') || '';
  const sipBTSM     = searchParams.get('sipBTSM') || '';
  const sipBTEY     = searchParams.get('sipBTEY') || '';
  const sipBTEM     = searchParams.get('sipBTEM') || '';
  const sipXirr     = searchParams.get('sipXirr') || '';
  const sipCorpus   = searchParams.get('sipCorpus') || '';
  const sipInvested = searchParams.get('sipInvested') || '';
  const sipGain     = searchParams.get('sipGain') || '';

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function fmtINR(val) {
    const n = Math.round(parseFloat(val) || 0);
    if (n >= 1e7) return (n / 1e7).toFixed(1) + ' Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(1) + ' L';
    return n.toLocaleString('en-IN');
  }

  // Determine mode
  const isSIPBT = sipBTMode === '1' && !!sipBTName;
  const isSWPBT = tab === 'swp' && !!btName;
  const isGeneric = !isSIPBT && !isSWPBT;

  // Period labels
  const sipPeriod = (sipBTSY && sipBTSM)
    ? `${MONTHS[parseInt(sipBTSM)-1]} ${sipBTSY} to ${(sipBTEY && sipBTEM) ? MONTHS[parseInt(sipBTEM)-1]+' '+sipBTEY : 'Today'}`
    : '';
  const swpPeriod = (btSY && btSM)
    ? `${MONTHS[parseInt(btSM)-1]} ${btSY} to ${(btEY && btEM) ? MONTHS[parseInt(btEM)-1]+' '+btEY : 'Today'}`
    : '';

  const fundShort = (isSIPBT ? sipBTName : btName).length > 42
    ? (isSIPBT ? sipBTName : btName).slice(0, 42) + '...'
    : (isSIPBT ? sipBTName : btName);

  const survives = survived === '1';
  const depleted = survived === '0';

  // Load logo
  let logoData = null;
  try {
    const r = await fetch(`${origin}/logo-og.png`);
    if (r.ok) logoData = await r.arrayBuffer();
  } catch(e) {}

  // ── Stats for right panel ──
  const sipStats = [
    sipBTAmount ? { label: 'Monthly SIP',     value: 'Rs ' + fmtINR(sipBTAmount) + '/mo', color: '#80cbc4' } : null,
    sipXirr     ? { label: 'XIRR',            value: sipXirr + '% p.a.',                  color: parseFloat(sipXirr) > 0 ? '#a5d6a7' : '#ef9a9a' } : null,
    sipCorpus   ? { label: 'Final Corpus',     value: 'Rs ' + fmtINR(sipCorpus),           color: '#ffffff' } : null,
    sipInvested ? { label: 'Total Invested',   value: 'Rs ' + fmtINR(sipInvested),         color: 'rgba(255,255,255,0.7)' } : null,
    sipGain     ? { label: 'Gain',             value: 'Rs ' + fmtINR(sipGain),             color: '#a5d6a7' } : null,
  ].filter(Boolean);

  const swpStats = [
    corpus    ? { label: 'Starting Corpus',   value: 'Rs ' + fmtINR(corpus),             color: '#ffffff' } : null,
    withdraw  ? { label: 'Monthly Withdrawal', value: 'Rs ' + fmtINR(withdraw) + '/mo',  color: '#80cbc4' } : null,
    xirr      ? { label: 'XIRR',              value: xirr + '% p.a.',                    color: parseFloat(xirr) > 0 ? '#a5d6a7' : '#ef9a9a' } : null,
    (finalC && survives) ? { label: 'Remaining', value: 'Rs ' + fmtINR(finalC),          color: '#a5d6a7' } : null,
    withdrawn ? { label: 'Total Withdrawn',   value: 'Rs ' + fmtINR(withdrawn),          color: '#ffcc80' } : null,
  ].filter(Boolean);

  const activeStats = isSIPBT ? sipStats : isSWPBT ? swpStats : [];
  const features = ['Fund Comparison (up to 5)','SIP NAV Backtester','SWP NAV Backtester','Goal Planner','EMI & Loans'];

  // ── Headline text ──
  const headline = isSIPBT ? 'SIP NAV Backtester' : isSWPBT ? 'SWP Backtester' : 'MF Risk & Return';
  const subtext  = isSIPBT ? fundShort : isSWPBT ? fundShort : 'Fund Compare · SIP · SWP · EMI';
  const period   = isSIPBT ? sipPeriod : isSWPBT ? swpPeriod : '';
  const ctaText  = isSIPBT ? 'View SIP Backtest' : isSWPBT ? 'View SWP Backtest' : 'Open Free Tool';
  const accentColor = isSIPBT ? '#80cbc4' : '#80cbc4';

  const el = {
    type: 'div',
    props: {
      style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
               background: 'linear-gradient(135deg,#0a1f0a 0%,#1b3d1b 55%,#0d2b0d 100%)',
               fontFamily: 'sans-serif' },
      children: [
        // Top bar
        { type: 'div', props: { style: { width: '100%', height: 5, background: 'linear-gradient(90deg,#00897b,#2e7d32,#66bb6a)', flexShrink: 0, display: 'flex' } } },

        // Main row
        { type: 'div', props: {
          style: { display: 'flex', flex: 1, padding: '32px 52px', gap: 36, alignItems: 'center' },
          children: [

            // LEFT
            { type: 'div', props: {
              style: { display: 'flex', flexDirection: 'column', flex: 1 },
              children: [

                // Brand
                { type: 'div', props: {
                  style: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 },
                  children: [
                    logoData
                      ? { type: 'img', props: { src: logoData, style: { height: 44, width: 44, objectFit: 'contain' } } }
                      : { type: 'div', props: { style: { height: 44, display:'flex', alignItems:'center'}, children: { type:'div', props: { style: { color:'#66bb6a', fontSize:18, fontWeight:800 }, children:'Abundance' } } } },
                    { type: 'div', props: {
                      style: { display: 'flex', flexDirection: 'column' },
                      children: [
                        { type: 'div', props: { style: { color: '#66bb6a', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase' }, children: 'ABUNDANCE FINANCIAL SERVICES' } },
                        { type: 'div', props: { style: { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 1 }, children: 'ARN-251838  AMFI Registered MFD' } },
                      ]
                    } },
                  ]
                } },

                // Headline
                { type: 'div', props: { style: { color: '#ffffff', fontSize: isGeneric ? 56 : 50, fontWeight: 800, lineHeight: 1.05, marginBottom: 8 }, children: headline } },

                // Subtext
                (subtext && (isSIPBT || isSWPBT))
                  ? { type: 'div', props: { style: { color: accentColor, fontSize: 18, fontWeight: 600, lineHeight: 1.3, marginBottom: 12 }, children: subtext } }
                  : { type: 'div', props: { style: { color: 'rgba(255,255,255,0.6)', fontSize: 19, marginBottom: 12 }, children: subtext } },

                // Period badge
                ...(period ? [{
                  type: 'div', props: {
                    style: { display: 'flex', alignItems: 'center', background: 'rgba(0,137,123,0.2)', border: '1px solid rgba(0,137,123,0.5)', borderRadius: 8, padding: '5px 12px', marginBottom: 8 },
                    children: { type: 'div', props: { style: { color: '#4db6ac', fontSize: 13, fontWeight: 700 }, children: period } }
                  }
                }] : []),

                // SWP survival badge
                ...(isSWPBT && (survives || depleted) ? [{
                  type: 'div', props: {
                    style: { display: 'flex', alignItems: 'center', background: survives ? 'rgba(0,137,123,0.18)' : 'rgba(239,83,80,0.18)', border: '1px solid ' + (survives ? 'rgba(0,137,123,0.5)' : 'rgba(239,83,80,0.5)'), borderRadius: 8, padding: '5px 12px', marginBottom: 8 },
                    children: { type: 'div', props: { style: { color: survives ? '#4db6ac' : '#ef5350', fontSize: 15, fontWeight: 800 }, children: survives ? 'CORPUS SURVIVED' : 'CORPUS DEPLETED' } }
                  }
                }] : []),

                // CTA
                { type: 'div', props: {
                  style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 },
                  children: [
                    { type: 'div', props: { style: { background: '#2e7d32', borderRadius: 8, padding: '7px 16px', display: 'flex', alignItems: 'center' }, children: { type: 'div', props: { style: { color: '#fff', fontSize: 13, fontWeight: 800 }, children: ctaText } } } },
                    { type: 'div', props: { style: { color: 'rgba(255,255,255,0.4)', fontSize: 12 }, children: 'mfcalc.getabundance.in' } },
                  ]
                } },
              ]
            } },

            // RIGHT CARD
            { type: 'div', props: {
              style: { display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '20px 22px', width: 260, flexShrink: 0 },
              children: [
                { type: 'div', props: { style: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 14, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 7 },
                  children: isSIPBT ? 'SIP BACKTEST RESULTS' : isSWPBT ? 'BACKTEST RESULTS' : 'FEATURES' } },

                ...(activeStats.length > 0
                  ? activeStats.map(s => ({
                      type: 'div', props: {
                        style: { display: 'flex', flexDirection: 'column', marginBottom: 11 },
                        children: [
                          { type: 'div', props: { style: { color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 1 }, children: s.label } },
                          { type: 'div', props: { style: { color: s.color, fontSize: 20, fontWeight: 800, lineHeight: 1.1 }, children: s.value } },
                        ]
                      }
                    }))
                  : features.map(f => ({
                      type: 'div', props: {
                        style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 },
                        children: [
                          { type: 'div', props: { style: { width: 5, height: 5, borderRadius: 3, background: '#66bb6a', flexShrink: 0 } } },
                          { type: 'div', props: { style: { color: 'rgba(255,255,255,0.85)', fontSize: 14, fontWeight: 600 }, children: f } },
                        ]
                      }
                    }))
                ),
              ]
            } },
          ]
        } },

        // Bottom bar
        { type: 'div', props: {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 52px', background: 'rgba(0,0,0,0.4)', borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 },
          children: [
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.55)', fontSize: 11 }, children: 'mfcalc.getabundance.in' } },
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.3)', fontSize: 10 }, children: 'MF investments are subject to market risks' } },
            { type: 'div', props: { style: { color: 'rgba(255,255,255,0.55)', fontSize: 11 }, children: 'Free  No Login Required' } },
          ]
        } },
      ]
    }
  };

  return new ImageResponse(el, {
    width: 1200,
    height: 630,
    headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' }
  });
}
