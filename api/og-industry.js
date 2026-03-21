// api/og-industry.js — Dynamic OG image for Industry Pulse page
// Shows month, total AUM, key stats pulled from URL params
// Returns PNG via @vercel/og

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);

  const month     = searchParams.get('month') || '';
  const year      = searchParams.get('year')  || '';
  const totalAum  = searchParams.get('aum')   || '';
  const folios    = searchParams.get('folios')|| '';
  const eqAum     = searchParams.get('eq')    || '';
  const debtAum   = searchParams.get('debt')  || '';
  const sipInflow = searchParams.get('sip')   || '';

  const MONTH_LABELS = ['January','February','March','April','May','June',
                        'July','August','September','October','November','December'];
  const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const monthLabel = month ? (MONTH_LABELS[MONTHS.indexOf(month.toLowerCase())] || month) : '';
  const periodLabel = monthLabel && year ? `${monthLabel} ${year}` : 'Latest Data';

  function fmtCr(val) {
    const n = parseFloat(val) || 0;
    if (n >= 100000) return (n / 100000).toFixed(2) + 'L Cr';
    if (n >= 1000)   return (n / 1000).toFixed(2) + 'K Cr';
    return n.toFixed(0) + ' Cr';
  }
  function fmtFolios(val) {
    const n = parseFloat(val) || 0;
    if (n >= 10000000) return (n / 10000000).toFixed(2) + ' Cr';
    if (n >= 100000)   return (n / 100000).toFixed(2) + ' L';
    return n.toLocaleString('en-IN');
  }

  // Load logo
  let logoData = null;
  try {
    const logoRes = await fetch(`${new URL(req.url).origin}/logo-og.png`);
    if (logoRes.ok) logoData = await logoRes.arrayBuffer();
  } catch(e) {}

  const stats = [
    totalAum  ? { label: 'Total Industry AUM', value: '₹' + fmtCr(totalAum),  color: '#ffffff' } : null,
    folios    ? { label: 'Total Folios',        value: fmtFolios(folios),       color: '#80cbc4' } : null,
    eqAum     ? { label: 'Equity AUM',          value: '₹' + fmtCr(eqAum),     color: '#a5d6a7' } : null,
    debtAum   ? { label: 'Debt AUM',            value: '₹' + fmtCr(debtAum),   color: '#ffcc80' } : null,
  ].filter(Boolean);

  const el = {
    type: 'div',
    props: {
      style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
               background: 'linear-gradient(135deg,#0a1f0a 0%,#1b3d1b 55%,#0d2b0d 100%)',
               fontFamily: 'sans-serif' },
      children: [
        // Top bar
        { type: 'div', props: { style: { width:'100%',height:5,background:'linear-gradient(90deg,#00897b,#2e7d32,#66bb6a)',flexShrink:0,display:'flex' } } },

        // Main
        { type: 'div', props: {
          style: { display:'flex',flex:1,padding:'32px 52px',gap:36,alignItems:'center' },
          children: [
            // Left
            { type: 'div', props: {
              style: { display:'flex',flexDirection:'column',flex:1 },
              children: [
                // Brand
                { type: 'div', props: {
                  style: { display:'flex',alignItems:'center',gap:14,marginBottom:18 },
                  children: [
                    logoData
                      ? { type:'img', props:{ src:logoData, style:{ height:44,width:44,objectFit:'contain' } } }
                      : { type:'div', props:{ style:{ height:44,display:'flex',alignItems:'center' }, children:{ type:'div', props:{ style:{ color:'#66bb6a',fontSize:18,fontWeight:800 }, children:'Abundance' } } } },
                    { type:'div', props:{ style:{ display:'flex',flexDirection:'column' }, children:[
                      { type:'div', props:{ style:{ color:'#66bb6a',fontSize:11,fontWeight:700,letterSpacing:2,textTransform:'uppercase' }, children:'ABUNDANCE FINANCIAL SERVICES' } },
                      { type:'div', props:{ style:{ color:'rgba(255,255,255,0.45)',fontSize:10,marginTop:1 }, children:'ARN-251838  AMFI Registered MFD' } },
                    ] } },
                  ]
                } },

                // Eyebrow
                { type:'div', props:{ style:{ display:'flex',alignItems:'center',gap:8,marginBottom:8 }, children:[
                  { type:'div', props:{ style:{ width:7,height:7,borderRadius:'50%',background:'#66bb6a' } } },
                  { type:'div', props:{ style:{ color:'rgba(255,255,255,0.5)',fontSize:11,fontWeight:700,letterSpacing:2,textTransform:'uppercase' }, children:'AMFI OFFICIAL DATA' } },
                ] } },

                // Headline
                { type:'div', props:{ style:{ color:'#ffffff',fontSize:52,fontWeight:800,lineHeight:1.05,marginBottom:8 }, children:'MF Industry Pulse' } },

                // Period badge
                { type:'div', props:{
                  style:{ display:'flex',alignItems:'center',background:'rgba(0,137,123,0.2)',border:'1px solid rgba(0,137,123,0.5)',borderRadius:8,padding:'5px 14px',marginBottom:12 },
                  children:{ type:'div', props:{ style:{ color:'#4db6ac',fontSize:14,fontWeight:700 }, children:`📅 ${periodLabel}` } }
                } },

                // CTA
                { type:'div', props:{
                  style:{ display:'flex',alignItems:'center',gap:10,marginTop:10 },
                  children:[
                    { type:'div', props:{ style:{ background:'#2e7d32',borderRadius:8,padding:'7px 16px',display:'flex',alignItems:'center' },
                      children:{ type:'div', props:{ style:{ color:'#fff',fontSize:13,fontWeight:800 }, children:'View Full Dashboard' } } } },
                    { type:'div', props:{ style:{ color:'rgba(255,255,255,0.4)',fontSize:12 }, children:'mfcalc.getabundance.in/industry' } },
                  ]
                } },
              ]
            } },

            // Right card
            { type:'div', props:{
              style:{ display:'flex',flexDirection:'column',background:'rgba(255,255,255,0.06)',
                      border:'1.5px solid rgba(255,255,255,0.12)',borderRadius:14,padding:'20px 22px',width:260,flexShrink:0 },
              children:[
                { type:'div', props:{ style:{ color:'rgba(255,255,255,0.4)',fontSize:10,fontWeight:700,letterSpacing:1.2,textTransform:'uppercase',marginBottom:14,borderBottom:'1px solid rgba(255,255,255,0.1)',paddingBottom:7 }, children:'INDUSTRY SNAPSHOT' } },
                ...(stats.length ? stats.map(s=>({
                  type:'div', props:{ style:{ display:'flex',flexDirection:'column',marginBottom:12 }, children:[
                    { type:'div', props:{ style:{ color:'rgba(255,255,255,0.5)',fontSize:10,fontWeight:700,letterSpacing:0.8,textTransform:'uppercase',marginBottom:1 }, children:s.label } },
                    { type:'div', props:{ style:{ color:s.color,fontSize:20,fontWeight:800,lineHeight:1.1 }, children:s.value } },
                  ] }
                })) : [
                  { type:'div', props:{ style:{ color:'rgba(255,255,255,0.5)',fontSize:14 }, children:'AUM  Flows  Folios' } },
                  { type:'div', props:{ style:{ color:'rgba(255,255,255,0.3)',fontSize:11,marginTop:4 }, children:'By category type' } },
                ])
              ]
            } },
          ]
        } },

        // Bottom bar
        { type:'div', props:{
          style:{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 52px',background:'rgba(0,0,0,0.4)',borderTop:'1px solid rgba(255,255,255,0.08)',flexShrink:0 },
          children:[
            { type:'div', props:{ style:{ color:'rgba(255,255,255,0.55)',fontSize:11 }, children:'mfcalc.getabundance.in/industry' } },
            { type:'div', props:{ style:{ color:'rgba(255,255,255,0.3)',fontSize:10 }, children:'Data source: AMFI Official Monthly Report' } },
            { type:'div', props:{ style:{ color:'rgba(255,255,255,0.55)',fontSize:11 }, children:'Free  No Login' } },
          ]
        } },
      ]
    }
  };

  return new ImageResponse(el, {
    width: 1200, height: 630,
    headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800' },
  });
}
