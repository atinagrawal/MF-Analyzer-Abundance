// api/og-report.js
// Dynamic OG image for the MF Industry Report Card.
// Runs on Vercel Edge Runtime — fetches live AMFI data on every request.
// Cached at edge for 12 hours; stale content served up to 24 hours while revalidating.
// Requires: @vercel/og in package.json

/** @jsxImportSource react */
import { ImageResponse } from '@vercel/og';

export const config = { runtime: 'edge' };

// ── helpers ────────────────────────────────────────────────
function fmtCr(v) {
  if (!v && v !== 0) return '—';
  const a = Math.abs(v);
  if (a >= 100000) return '₹' + (v / 100000).toFixed(2) + 'L Cr';
  if (a >= 1000)   return '₹' + (v / 1000).toFixed(1)   + 'K Cr';
  return '₹' + Math.round(v) + ' Cr';
}

function fmtPct(num, den) {
  return den > 0 ? (num / den * 100).toFixed(1) + '%' : '—';
}

function titleCase(str) {
  return str.replace(/\b\w/g, c => c.toUpperCase());
}

function monthLabel(mon, year) {
  const MAP = { jan:'January',feb:'February',mar:'March',apr:'April',
                may:'May',jun:'June',jul:'July',aug:'August',
                sep:'September',oct:'October',nov:'November',dec:'December' };
  return (MAP[mon] || mon.toUpperCase()) + ' ' + year;
}

// ── main handler ───────────────────────────────────────────
export default async function handler(req) {
  try {
    // 1. Fetch live industry data
    const baseUrl = new URL(req.url).origin;
    const res  = await fetch(`${baseUrl}/api/amfi-industry`);
    if (!res.ok) throw new Error('Industry API ' + res.status);
    const data = await res.json();

    const s     = data.summary    || {};
    const cats  = data.categories || {};
    const total = s.totalAum      || 1;
    const mon   = data.month      || '';
    const year  = data.year       || '';

    // 2. Top 6 net inflows (skip Liquid — institutional noise)
    const SKIP = new Set(['liquidFund','overnightFund']);
    const inflows = Object.entries(cats)
      .filter(([k, v]) => !SKIP.has(k) && (v.netFlow || 0) > 0)
      .sort(([, a], [, b]) => b.netFlow - a.netFlow)
      .slice(0, 6);

    const maxFlow = inflows[0]?.[1]?.netFlow || 1;

    // 3. Category breakdown percentages
    const catBreak = [
      { label: 'EQUITY',  val: s.equityAum,  pct: fmtPct(s.equityAum,  total), color: '#43a047' },
      { label: 'PASSIVE', val: s.passiveAum, pct: fmtPct(s.passiveAum, total), color: '#ff9800' },
      { label: 'HYBRID',  val: s.hybridAum,  pct: fmtPct(s.hybridAum,  total), color: '#ab47bc' },
      { label: 'DEBT',    val: s.debtAum,    pct: fmtPct(s.debtAum,    total), color: '#42a5f5' },
    ];

    // 4. Type colours for flow bars
    const TYPE_COLOR = { equity:'#43a047', hybrid:'#ab47bc', passive:'#ff9800',
                         debt:'#42a5f5', solution:'#f48fb1' };

    const eqShare = fmtPct(s.equityAum, total);

    // ── layout ────────────────────────────────────────────
    return new ImageResponse(
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'row',
        backgroundColor: '#0b1b0b',
        fontFamily: '"Inter", "Arial", sans-serif',
      }}>

        {/* ── Left panel ──────────────────────────────── */}
        <div style={{
          width: '400px', height: '630px', display: 'flex', flexDirection: 'column',
          padding: '36px 28px 28px 44px',
          borderRight: '1px solid rgba(255,255,255,0.07)',
        }}>
          {/* Accent stripe */}
          <div style={{
            position: 'absolute', left: '40px', top: '50px', bottom: '50px',
            width: '3px', background: 'linear-gradient(to bottom, #43a047, #66bb6a, #2e7d32)',
          }} />

          {/* Eyebrow */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
            <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#43a047' }} />
            <span style={{ fontSize: '11px', color: '#4caf50', letterSpacing: '1.5px', fontWeight: '600' }}>
              AMFI OFFICIAL DATA
            </span>
          </div>

          {/* Title */}
          <div style={{ fontSize: '40px', fontWeight: '800', color: '#c8e6c9', lineHeight: '1.1', marginBottom: '4px' }}>
            India MF
          </div>
          <div style={{ fontSize: '40px', fontWeight: '800', color: '#66bb6a', lineHeight: '1.1', marginBottom: '4px' }}>
            Industry
          </div>
          <div style={{ fontSize: '40px', fontWeight: '800', color: '#43a047', lineHeight: '1.1', marginBottom: '16px' }}>
            Report Card
          </div>

          {/* Month badge */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: '#1b4d1f', border: '1px solid #2e7d32',
            borderRadius: '20px', padding: '4px 14px', marginBottom: '20px',
            width: 'fit-content',
          }}>
            <span style={{ fontSize: '12px', fontWeight: '700', color: '#81c784', letterSpacing: '1px' }}>
              {monthLabel(mon, year).toUpperCase()}
            </span>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.07)', marginBottom: '18px' }} />

          {/* Total AUM */}
          <div style={{ fontSize: '11px', color: '#3a6a3e', letterSpacing: '1px', marginBottom: '6px', fontWeight: '600' }}>
            TOTAL INDUSTRY AUM
          </div>
          <div style={{ fontSize: '30px', fontWeight: '800', color: '#ffffff', marginBottom: '14px' }}>
            {fmtCr(total)}
          </div>

          {/* Sub stats */}
          <div style={{ display: 'flex', gap: '24px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px', color: '#3a6a3e', letterSpacing: '0.8px', fontWeight: '600' }}>EQUITY SHARE</span>
              <span style={{ fontSize: '20px', fontWeight: '800', color: '#81c784' }}>{eqShare}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px', color: '#3a6a3e', letterSpacing: '0.8px', fontWeight: '600' }}>CATEGORIES</span>
              <span style={{ fontSize: '20px', fontWeight: '800', color: '#81c784' }}>{data.parsedCategories || 39}</span>
            </div>
          </div>

          {/* Features list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
            {[
              'Download as PNG  |  Share anywhere',
              'LinkedIn  |  WhatsApp  |  X / Twitter',
              '39 AMFI categories  |  All months since 2014',
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#43a047', flexShrink: '0' }} />
                <span style={{ fontSize: '12px', color: i === 0 ? '#a5d6a7' : '#4a7a4a', fontWeight: '500' }}>{f}</span>
              </div>
            ))}
          </div>

          {/* Brand */}
          <div style={{ marginTop: '18px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#c8e6c9' }}>Abundance Financial Services®</div>
            <div style={{ fontSize: '10px', color: '#2e5e30', marginTop: '2px' }}>ARN-251838  |  mfcalc.getabundance.in/report</div>
          </div>
        </div>

        {/* ── Right panel ─────────────────────────────── */}
        <div style={{
          flex: '1', height: '630px', display: 'flex', flexDirection: 'column',
          padding: '28px 28px 20px 24px',
        }}>

          {/* Category tiles 2x2 */}
          <div style={{ fontSize: '10px', color: '#3a6a3e', letterSpacing: '1px', fontWeight: '700', marginBottom: '10px' }}>
            CATEGORY BREAKDOWN
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
            {catBreak.map((c, i) => (
              <div key={i} style={{
                width: '186px', height: '90px', display: 'flex', flexDirection: 'column',
                background: 'rgba(255,255,255,0.04)', borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.07)', padding: '10px 12px',
                position: 'relative',
              }}>
                <div style={{
                  position: 'absolute', left: '0', top: '12px', bottom: '12px',
                  width: '3px', borderRadius: '0 2px 2px 0', background: c.color,
                }} />
                <span style={{ fontSize: '10px', fontWeight: '700', color: c.color, letterSpacing: '0.8px', marginBottom: '4px' }}>
                  {c.label}
                </span>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#e8f5e9', lineHeight: '1' }}>
                  {fmtCr(c.val)}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: c.color }}>{c.pct}</span>
                  <div style={{ flex: '1', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px' }}>
                    <div style={{
                      width: c.pct, height: '4px', background: c.color, borderRadius: '2px',
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Stacked distribution bar */}
          <div style={{ display: 'flex', height: '14px', borderRadius: '7px', overflow: 'hidden', marginBottom: '10px' }}>
            {catBreak.map((c, i) => (
              <div key={i} style={{
                width: c.pct, height: '14px', background: c.color,
              }} />
            ))}
          </div>
          <div style={{ display: 'flex', gap: '14px', marginBottom: '16px' }}>
            {catBreak.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: c.color }} />
                <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: '600' }}>{c.label}</span>
              </div>
            ))}
          </div>

          {/* Divider */}
          <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', marginBottom: '12px' }} />

          {/* Net inflows */}
          <div style={{ fontSize: '10px', color: '#3a6a3e', letterSpacing: '1px', fontWeight: '700', marginBottom: '10px' }}>
            NET INFLOWS — TOP MOVERS
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1' }}>
            {inflows.map(([key, cat], i) => {
              const barPct = Math.round(cat.netFlow / maxFlow * 100);
              const col    = TYPE_COLOR[cat.type] || '#43a047';
              let label    = cat.label || key;
              if (label.length > 26) label = label.slice(0, 24) + '..';
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(200,230,201,0.75)', fontWeight: '500' }}>{label}</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: col }}>+{fmtCr(cat.netFlow)}</span>
                  </div>
                  <div style={{ height: '4px', background: 'rgba(255,255,255,0.05)', borderRadius: '2px' }}>
                    <div style={{ width: barPct + '%', height: '4px', background: col, borderRadius: '2px' }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Bottom bar ───────────────────────────────── */}
        <div style={{
          position: 'absolute', bottom: '0', left: '0', right: '0', height: '38px',
          background: '#090f09', borderTop: '2px solid #2e7d32',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 44px',
        }}>
          <span style={{ fontSize: '11px', color: 'rgba(100,160,100,0.6)', fontWeight: '600' }}>
            Abundance Financial Services® · ARN-251838 · AMFI Registered MF Distributor
          </span>
          <span style={{ fontSize: '11px', color: '#2e7d32', fontWeight: '600' }}>
            mfcalc.getabundance.in/report
          </span>
        </div>

      </div>,
      {
        width: 1200,
        height: 630,
        headers: {
          'Cache-Control': 'public, s-maxage=43200, stale-while-revalidate=86400',
        },
      }
    );

  } catch (err) {
    // Return a simple error image so og:image doesn't break
    return new ImageResponse(
      <div style={{
        width: '100%', height: '100%', display: 'flex', alignItems: 'center',
        justifyContent: 'center', backgroundColor: '#0b1b0b',
        fontFamily: 'Arial, sans-serif',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '48px', color: '#43a047' }}>📊</div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#c8e6c9' }}>India MF Industry Report Card</div>
          <div style={{ fontSize: '16px', color: '#4a7a4a' }}>mfcalc.getabundance.in/report</div>
        </div>
      </div>,
      { width: 1200, height: 630 }
    );
  }
}
