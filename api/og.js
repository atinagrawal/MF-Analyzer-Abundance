// api/og.js — Dynamic OG PNG image for SWP Backtester share links
// Uses @vercel/og ImageResponse — returns actual PNG (not SVG)
// Plain JS object tree — no JSX, no build step needed

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

  const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const isBT     = tab === 'swp' && !!btName;

  function fmtINR(val) {
    const n = Math.round(parseFloat(val) || 0);
    if (n >= 1e7) return (n / 1e7).toFixed(1) + ' Cr';
    if (n >= 1e5) return (n / 1e5).toFixed(1) + ' L';
    return n.toLocaleString('en-IN');
  }

  const periodLabel = (btSY && btSM && btEY && btEM)
    ? `${MONTHS[parseInt(btSM)-1]} ${btSY} – ${MONTHS[parseInt(btEM)-1]} ${btEY}`
    : btSY ? `From ${MONTHS[(parseInt(btSM)||1)-1]} ${btSY}` : '';

  const fundShort  = btName.length > 44 ? btName.slice(0, 44) + '…' : btName;
  const survives   = survived === '1';
  const depleted   = survived === '0';

  // Stat rows for right panel
  const stats = [
    corpus   ? { label: 'Corpus',      value: '₹' + fmtINR(corpus),          accent: '#fff' }     : null,
    withdraw ? { label: 'Withdrawal',  value: '₹' + fmtINR(withdraw) + '/mo', accent: '#80cbc4' }  : null,
    xirr     ? { label: 'XIRR',        value: xirr + '% p.a.',                accent: parseFloat(xirr) > 0 ? '#66bb6a' : '#ef5350' } : null,
    (finalC && survives) ? { label: 'Remaining', value: '₹' + fmtINR(finalC), accent: '#66bb6a' }  : null,
  ].filter(Boolean);

  // ── React element tree (plain objects, no JSX) ──
  const h = (type, props, ...children) => ({ type, props: { ...props, children: children.flat().filter(Boolean) } });

  const statItems = stats.map(s =>
    h('div', { style: { display: 'flex', flexDirection: 'column', marginBottom: '16px' } },
      h('div', { style: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: '3px' } }, s.label),
      h('div', { style: { color: s.accent, fontSize: 26, fontWeight: 800, lineHeight: 1.1, fontFamily: 'monospace' } }, s.value)
    )
  );

  const genericItems = ['📈 Fund Comparison', '🧮 SIP & Lumpsum', '🎯 Goal Planner', '💸 SWP Backtester', '🏦 EMI & Loans'].map(f =>
    h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' } },
      h('div', { style: { width: 6, height: 6, borderRadius: '50%', background: '#66bb6a', flexShrink: 0 } }),
      h('div', { style: { color: 'rgba(255,255,255,0.88)', fontSize: 16, fontWeight: 600 } }, f)
    )
  );

  const el = h('div', {
    style: { width: 1200, height: 630, display: 'flex', flexDirection: 'column',
             background: 'linear-gradient(135deg, #0a1f0a 0%, #1b3d1b 55%, #0d2b0d 100%)',
             fontFamily: 'sans-serif', overflow: 'hidden' }
  },
    // Top bar
    h('div', { style: { width: '100%', height: 5, background: 'linear-gradient(90deg, #00897b, #2e7d32, #66bb6a)', flexShrink: 0, display: 'flex' } }),

    // Main row
    h('div', { style: { display: 'flex', flex: 1, padding: '36px 56px', gap: 40, alignItems: 'center' } },

      // ── Left ──
      h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, gap: 0 } },

        // Brand
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 } },
          h('div', { style: { width: 40, height: 40, borderRadius: 10, background: 'rgba(46,125,50,0.4)', border: '1.5px solid rgba(102,187,106,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 } }, '📊'),
          h('div', { style: { display: 'flex', flexDirection: 'column' } },
            h('div', { style: { color: '#66bb6a', fontSize: 11, fontWeight: 700, letterSpacing: '1.8px', textTransform: 'uppercase' } }, 'ABUNDANCE FINANCIAL SERVICES'),
            h('div', { style: { color: 'rgba(255,255,255,0.45)', fontSize: 10, marginTop: 1 } }, 'ARN-251838 · AMFI Registered MFD')
          )
        ),

        // HEADLINE — large, dominant, clear at thumbnail size
        h('div', { style: { color: '#ffffff', fontSize: isBT ? 52 : 58, fontWeight: 800, lineHeight: 1.05, marginBottom: 10 } },
          isBT ? 'SWP Backtester' : 'MF Risk & Return'
        ),

        // Fund name or subtitle
        isBT && fundShort
          ? h('div', { style: { color: '#80cbc4', fontSize: 20, fontWeight: 600, lineHeight: 1.3, marginBottom: 14 } }, fundShort)
          : h('div', { style: { color: 'rgba(255,255,255,0.6)', fontSize: 20, marginBottom: 14 } }, 'Fund Compare · SIP · SWP · EMI'),

        // Period badge
        isBT && periodLabel
          ? h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,137,123,0.2)', border: '1px solid rgba(0,137,123,0.5)', borderRadius: 8, padding: '6px 14px', width: 'fit-content', marginBottom: 10 } },
              h('div', { style: { color: '#4db6ac', fontSize: 14, fontWeight: 700 } }, `📅 ${periodLabel}`)
            )
          : null,

        // Survival status
        (isBT && (survives || depleted))
          ? h('div', { style: { display: 'flex', alignItems: 'center', background: survives ? 'rgba(0,137,123,0.18)' : 'rgba(239,83,80,0.18)', border: `1px solid ${survives ? 'rgba(0,137,123,0.5)' : 'rgba(239,83,80,0.5)'}`, borderRadius: 8, padding: '6px 14px', width: 'fit-content', marginBottom: 10 } },
              h('div', { style: { color: survives ? '#4db6ac' : '#ef5350', fontSize: 16, fontWeight: 800 } },
                survives ? '✅  Corpus Survived' : '⚠️  Corpus Depleted'
              )
            )
          : null,

        // CTA
        h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 } },
          h('div', { style: { background: '#2e7d32', borderRadius: 8, padding: '8px 18px', display: 'flex', alignItems: 'center', gap: 6 } },
            h('div', { style: { color: '#fff', fontSize: 14, fontWeight: 800 } }, 'View Full Backtest →')
          ),
          h('div', { style: { color: 'rgba(255,255,255,0.4)', fontSize: 13 } }, 'mfcalc.getabundance.in')
        )
      ),

      // ── Right card ──
      h('div', {
        style: { display: 'flex', flexDirection: 'column',
                 background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.12)',
                 borderRadius: 16, padding: '26px 28px', minWidth: 260, flexShrink: 0 }
      },
        h('div', { style: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: 18, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 10 } },
          isBT ? 'BACKTEST RESULTS' : 'FEATURES'
        ),
        ...(isBT ? statItems : genericItems),
        !isBT ? h('div', { style: { marginTop: 8, background: 'rgba(46,125,50,0.3)', borderRadius: 7, padding: '7px 12px', display: 'flex' } },
          h('div', { style: { color: '#66bb6a', fontSize: 13, fontWeight: 700 } }, 'Free · No Login Required')
        ) : null
      )
    ),

    // Bottom bar
    h('div', {
      style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between',
               padding: '11px 56px', background: 'rgba(0,0,0,0.4)',
               borderTop: '1px solid rgba(255,255,255,0.08)', flexShrink: 0 }
    },
      h('div', { style: { color: 'rgba(255,255,255,0.55)', fontSize: 12 } }, 'mfcalc.getabundance.in'),
      h('div', { style: { color: 'rgba(255,255,255,0.3)', fontSize: 10 } }, 'MF investments are subject to market risks'),
      h('div', { style: { color: 'rgba(255,255,255,0.55)', fontSize: 12 } }, 'Free · No Login Required')
    )
  );

  return new ImageResponse(el, {
    width: 1200,
    height: 630,
    headers: {
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
