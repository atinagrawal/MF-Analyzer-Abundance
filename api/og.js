// api/og.js — Dynamic OG image for SWP Backtester shared links
// Uses @vercel/og (Edge runtime, no Node.js APIs)

import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const { searchParams } = new URL(req.url);

  const tab      = searchParams.get('tab') || 'tool';
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

  // Format numbers to Indian style
  function fmtINR(n) {
    n = Math.round(parseFloat(n) || 0);
    if (n >= 1e7) return (n / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(2) + ' L';
    return n.toLocaleString('en-IN');
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const startLabel = btSY && btSM ? `${MONTHS[parseInt(btSM)-1]} ${btSY}` : '';
  const endLabel   = btEY && btEM ? `${MONTHS[parseInt(btEM)-1]} ${btEY}` : 'Today';

  const isBT = tab === 'swp' && btName;
  const survivalColor = survived === '1' ? '#00897b' : survived === '0' ? '#b71c1c' : '#2e7d32';
  const survivalText  = survived === '1' ? '✅ Corpus Survived' : survived === '0' ? '⚠️ Corpus Depleted' : '';

  return new ImageResponse(
    <div
      style={{
        width: '1200px',
        height: '630px',
        display: 'flex',
        flexDirection: 'column',
        background: 'linear-gradient(135deg, #0a1f0a 0%, #1a3a1a 50%, #0d2b0d 100%)',
        fontFamily: 'sans-serif',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top accent bar */}
      <div style={{ display: 'flex', width: '100%', height: '6px', background: 'linear-gradient(90deg, #00897b, #2e7d32, #66bb6a)', flexShrink: 0 }} />

      {/* Grid pattern overlay */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(255,255,255,.04) 1px, transparent 0)',
        backgroundSize: '40px 40px',
        display: 'flex',
      }} />

      {/* Main content */}
      <div style={{ display: 'flex', flex: 1, padding: '40px 64px', gap: '48px', alignItems: 'center' }}>

        {/* Left: Branding + description */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '16px' }}>
          {/* Logo area */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '48px', height: '48px', borderRadius: '12px',
              background: 'rgba(46,125,50,.3)', border: '1.5px solid rgba(102,187,106,.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '24px',
            }}>📊</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: '#66bb6a', fontSize: '13px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }}>Abundance Financial Services</span>
              <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '11px', marginTop: '1px' }}>ARN-251838 · AMFI Registered MFD</span>
            </div>
          </div>

          {/* Title */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            <span style={{ color: '#fff', fontSize: isBT ? '36px' : '44px', fontWeight: 800, lineHeight: 1.1 }}>
              {isBT ? 'SWP Backtester' : 'MF Risk & Return Analyzer'}
            </span>
            {isBT && btName && (
              <span style={{ color: '#80cbc4', fontSize: '18px', fontWeight: 600, lineHeight: 1.3 }}>
                {btName.length > 55 ? btName.slice(0, 55) + '…' : btName}
              </span>
            )}
            {!isBT && (
              <span style={{ color: 'rgba(255,255,255,.6)', fontSize: '20px', fontWeight: 400 }}>
                Compare funds · SIP · Goal Planner · SWP · EMI
              </span>
            )}
          </div>

          {/* Period badge */}
          {isBT && startLabel && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'rgba(0,137,123,.2)', border: '1px solid rgba(0,137,123,.4)',
              borderRadius: '8px', padding: '8px 16px', width: 'fit-content', marginTop: '4px',
            }}>
              <span style={{ color: '#4db6ac', fontSize: '14px', fontWeight: 700 }}>
                📅 {startLabel} → {endLabel}
              </span>
            </div>
          )}

          {/* Survival status */}
          {survivalText && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: survived === '1' ? 'rgba(0,137,123,.15)' : 'rgba(183,28,28,.15)',
              border: `1px solid ${survived === '1' ? 'rgba(0,137,123,.4)' : 'rgba(183,28,28,.4)'}`,
              borderRadius: '8px', padding: '8px 16px', width: 'fit-content',
            }}>
              <span style={{ color: survivalColor, fontSize: '15px', fontWeight: 800 }}>{survivalText}</span>
            </div>
          )}
        </div>

        {/* Right: Stats card (backtester only) */}
        {isBT && (corpus || withdraw || xirr || finalC) && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '12px',
            background: 'rgba(255,255,255,.05)', border: '1.5px solid rgba(255,255,255,.1)',
            borderRadius: '16px', padding: '28px 32px', minWidth: '280px',
          }}>
            {corpus && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Starting Corpus</span>
                <span style={{ color: '#fff', fontSize: '28px', fontWeight: 800, fontFamily: 'monospace' }}>₹{fmtINR(corpus)}</span>
              </div>
            )}
            {withdraw && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Monthly Withdrawal</span>
                <span style={{ color: '#80cbc4', fontSize: '22px', fontWeight: 800, fontFamily: 'monospace' }}>₹{fmtINR(withdraw)}/mo</span>
              </div>
            )}
            {xirr && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>XIRR</span>
                <span style={{ color: parseFloat(xirr) > 0 ? '#66bb6a' : '#ef5350', fontSize: '22px', fontWeight: 800, fontFamily: 'monospace' }}>{xirr}% p.a.</span>
              </div>
            )}
            {finalC && survived === '1' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>Remaining Corpus</span>
                <span style={{ color: '#66bb6a', fontSize: '22px', fontWeight: 800, fontFamily: 'monospace' }}>₹{fmtINR(finalC)}</span>
              </div>
            )}
          </div>
        )}

        {/* Right: generic tool features (non-backtest) */}
        {!isBT && (
          <div style={{
            display: 'flex', flexDirection: 'column', gap: '10px',
            background: 'rgba(255,255,255,.05)', border: '1.5px solid rgba(255,255,255,.1)',
            borderRadius: '16px', padding: '28px 32px', minWidth: '260px',
          }}>
            {['📈 Fund Comparison', '🧮 SIP & Lumpsum', '🎯 Goal Planner', '💸 SWP + Backtester', '🏦 EMI & Loans'].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#66bb6a', flexShrink: 0 }} />
                <span style={{ color: 'rgba(255,255,255,.85)', fontSize: '15px', fontWeight: 600 }}>{f}</span>
              </div>
            ))}
            <div style={{ marginTop: '8px', padding: '8px 12px', background: 'rgba(46,125,50,.2)', borderRadius: '8px', display: 'flex' }}>
              <span style={{ color: '#66bb6a', fontSize: '12px', fontWeight: 700 }}>mfcalc.getabundance.in</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 64px', background: 'rgba(0,0,0,.3)',
        borderTop: '1px solid rgba(255,255,255,.08)', flexShrink: 0,
      }}>
        <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '12px' }}>mfcalc.getabundance.in</span>
        <span style={{ color: 'rgba(255,255,255,.35)', fontSize: '11px' }}>Mutual Fund investments are subject to market risks. Data: AMFI / mfapi.in</span>
        <span style={{ color: 'rgba(255,255,255,.5)', fontSize: '12px' }}>Free · No Login Required</span>
      </div>
    </div>,
    { width: 1200, height: 630 }
  );
}
