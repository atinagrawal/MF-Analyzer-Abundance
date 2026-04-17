/**
 * app/api/og-pms/route.js
 *
 * Dynamic OG image for the PMS Screener page.
 * Accepts optional query params:
 *   ?strategy=Equity   (default "Equity")
 *   ?month=March+2026  (default computed from current date)
 *
 * Referenced in:
 *   - app/pms-screener/layout.jsx   (JSON-LD primaryImageOfPage)
 *   - lib/metadata.js               (og:image for pms-screener key)
 *
 * Usage:
 *   https://mfcalc.getabundance.in/api/og-pms
 *   https://mfcalc.getabundance.in/api/og-pms?strategy=Debt&month=March+2026
 */

import { ImageResponse } from '@vercel/og';
import { getLatestPmsDataDate } from '@/lib/pmsDate';

export const runtime = 'edge';

const STRATEGY_TAGLINES = {
  Equity: 'Large Cap · Mid Cap · Multi Cap · Flexi Cap · Thematic',
  Debt: 'Fixed Income · Credit Risk · Duration Strategies',
  'Multi Asset': 'Equity + Debt + Alternatives under one manager',
  Hybrid: 'Balanced · Aggressive Hybrid · Dynamic Asset Allocation',
};

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const pmsDate = getLatestPmsDataDate();

  const strategy = searchParams.get('strategy') || 'Equity';
  const month = searchParams.get('month') || pmsDate.label;
  const tagline = STRATEGY_TAGLINES[strategy] || STRATEGY_TAGLINES.Equity;

  return new ImageResponse(
    (
      <div
        style={{
          background: 'linear-gradient(135deg, #071507 0%, #0d2b0d 55%, #122b14 100%)',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '58px 70px',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative top border strip */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '5px',
          background: 'linear-gradient(90deg, #1b5e20, #43a047, #a5d6a7, #43a047, #1b5e20)',
          display: 'flex',
        }} />

        {/* Top row: data badge + category pill */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{
            background: 'rgba(67,160,71,0.18)',
            border: '1.5px solid #2e7d32',
            color: '#a5d6a7',
            padding: '7px 20px',
            borderRadius: '30px',
            fontSize: '15px',
            fontWeight: 700,
            letterSpacing: '1.2px',
            display: 'flex',
          }}>
            ● APMI OFFICIAL DATA · {month.toUpperCase()}
          </div>

          <div style={{
            background: '#1b5e20',
            color: '#c8e6c9',
            padding: '7px 20px',
            borderRadius: '30px',
            fontSize: '15px',
            fontWeight: 800,
            letterSpacing: '0.5px',
            display: 'flex',
          }}>
            {strategy.toUpperCase()}
          </div>
        </div>

        {/* Centre: main headline */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div style={{
            fontSize: '76px',
            fontWeight: 900,
            color: 'white',
            lineHeight: 1.05,
            letterSpacing: '-2px',
            display: 'flex',
          }}>
            PMS{' '}
            <span style={{ color: '#66bb6a', marginLeft: '18px', display: 'flex' }}>Screener</span>
          </div>

          <div style={{
            fontSize: '26px',
            color: '#a5d6a7',
            fontWeight: 400,
            display: 'flex',
          }}>
            {tagline}
          </div>

          {/* Three stat pills */}
          <div style={{ display: 'flex', gap: '14px', marginTop: '10px' }}>
            {['1,176+ Strategies', 'All Time Horizons', 'Free · No Login'].map((t) => (
              <div
                key={t}
                style={{
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(165,214,167,0.2)',
                  color: '#c8e6c9',
                  padding: '8px 20px',
                  borderRadius: '10px',
                  fontSize: '17px',
                  fontWeight: 600,
                  display: 'flex',
                }}
              >
                {t}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom row: Abundance branding */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ fontSize: '22px', fontWeight: 800, color: 'white', display: 'flex' }}>
              Atin Kumar Agrawal
            </div>
            <div style={{ fontSize: '15px', color: '#81c784', display: 'flex' }}>
              APMI Registered PMS Distributor · APRN04279 · ARN-251838
            </div>
          </div>

          <div style={{
            fontSize: '15px',
            color: '#4caf50',
            background: 'rgba(76,175,80,0.1)',
            border: '1px solid #2e7d32',
            padding: '10px 22px',
            borderRadius: '10px',
            fontWeight: 700,
            display: 'flex',
          }}>
            mfcalc.getabundance.in/pms-screener
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 },
  );
}
