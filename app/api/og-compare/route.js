/**
 * app/api/og-compare/route.js
 *
 * Dynamic OpenGraph PNG for mutual fund comparison pages (/compare/[fundA]-vs-[fundB]).
 * Uses @vercel/og (Satori + Resvg) on Edge runtime.
 * Dimensions: 1200×630.
 *
 * Query Parameters:
 *   ?name1=...   Scheme A display name
 *   ?name2=...   Scheme B display name
 *   ?c1=...      Scheme A AMFI code
 *   ?c2=...      Scheme B AMFI code
 *   ?cat1=...    Scheme A category (e.g., "Flexi Cap")
 *   ?cat2=...    Scheme B category
 *   ?r1=...      Scheme A 3Y CAGR return (e.g., "21.4")
 *   ?r2=...      Scheme B 3Y CAGR return (e.g., "18.2")
 *   ?overlap=... Pairwise portfolio overlap % (e.g., "28")
 *   ?slug=...    Canonical comparison slug (fallback parser)
 */

import { ImageResponse } from '@vercel/og';
import { OG_LOGO_MARK_URL } from '@/lib/ogAssets';

export const runtime = 'edge';

function cleanSchemeName(name) {
  if (!name) return '';
  return name
    .replace(/\s*\([^)]*formerly known as[^)]*\)/gi, '')
    .replace(/\s*-\s*(regular plan|direct plan|growth option|idcw option|regular|direct|growth|dividend|idcw|plan).*/i, '')
    .trim();
}

function cleanCategory(cat) {
  if (!cat) return '';
  return cat
    .replace(/^(equity|debt|hybrid|other|solution oriented)\s+scheme\s*-\s*/i, '')
    .trim();
}

function formatReturn(val) {
  if (!val) return null;
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  return (n > 0 ? '+' : '') + n.toFixed(1) + '% p.a.';
}

export async function GET(req) {
  const { searchParams } = new URL(req.url);

  const name1 = searchParams.get('name1') || '';
  const name2 = searchParams.get('name2') || '';
  const c1 = searchParams.get('c1') || '';
  const c2 = searchParams.get('c2') || '';
  const cat1 = searchParams.get('cat1') || '';
  const cat2 = searchParams.get('cat2') || '';
  const r1 = searchParams.get('r1') || '';
  const r2 = searchParams.get('r2') || '';
  const overlap = searchParams.get('overlap') || '';
  const slug = searchParams.get('slug') || '';

  let fundNameA = cleanSchemeName(name1);
  let fundNameB = cleanSchemeName(name2);

  // Fallback parsing from slug if names are not explicitly provided
  if (!fundNameA && slug) {
    const parts = slug.split('-vs-');
    if (parts[0]) {
      fundNameA = parts[0]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  if (!fundNameB && slug) {
    const parts = slug.split('-vs-');
    if (parts[1]) {
      fundNameB = parts[1]
        .replace(/-/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }

  if (!fundNameA) fundNameA = c1 ? `Scheme ${c1}` : 'Scheme A';
  if (!fundNameB) fundNameB = c2 ? `Scheme ${c2}` : 'Scheme B';

  const ret1Text = formatReturn(r1);
  const ret2Text = formatReturn(r2);

  const overlapNum = overlap ? parseInt(overlap, 10) : null;
  const hasOverlap = overlapNum != null && !isNaN(overlapNum) && overlapNum >= 0 && overlapNum <= 100;

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #071708 0%, #0d2b0d 50%, #153b17 100%)',
          fontFamily: 'sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top Accent Bar */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '5px',
            background: 'linear-gradient(90deg, #00897b, #2e7d32, #66bb6a)',
            display: 'flex',
          }}
        />

        {/* Ambient background glows */}
        <div
          style={{
            position: 'absolute',
            top: -60,
            left: -60,
            width: 360,
            height: 360,
            borderRadius: '50%',
            background: 'rgba(102, 187, 106, 0.07)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -60,
            right: -60,
            width: 400,
            height: 400,
            borderRadius: '50%',
            background: 'rgba(0, 137, 123, 0.09)',
            display: 'flex',
          }}
        />

        {/* Header Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '36px 56px 0 56px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img
              src={OG_LOGO_MARK_URL}
              width={44}
              height={44}
              style={{ objectFit: 'contain' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  color: '#66bb6a',
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 2,
                  textTransform: 'uppercase',
                  display: 'flex',
                }}
              >
                ABUNDANCE FINANCIAL SERVICES
              </div>
              <div
                style={{
                  color: 'rgba(255,255,255,0.45)',
                  fontSize: 10,
                  marginTop: 2,
                  display: 'flex',
                }}
              >
                ARN-251838 · AMFI Registered MFD
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              background: 'rgba(0,137,123,0.18)',
              border: '1px solid rgba(0,137,123,0.45)',
              borderRadius: 20,
              padding: '6px 16px',
            }}
          >
            <span
              style={{
                color: '#4db6ac',
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: 1,
                textTransform: 'uppercase',
              }}
            >
              Mutual Fund Comparison
            </span>
          </div>
        </div>

        {/* Comparison Hero Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 56px',
            gap: 16,
            marginTop: 14,
            marginBottom: 14,
          }}
        >
          {/* Card A */}
          <div
            style={{
              width: '462px',
              height: '320px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1.5px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 18,
              padding: '26px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  color: '#81c784',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                  display: 'flex',
                }}
              >
                {cleanCategory(cat1) || 'Scheme A'}
              </div>
              <div
                style={{
                  color: '#ffffff',
                  fontSize: 25,
                  fontWeight: 800,
                  lineHeight: 1.25,
                  maxHeight: '130px',
                  overflow: 'hidden',
                  display: 'flex',
                }}
              >
                {fundNameA}
              </div>
            </div>

            {/* 3Y CAGR Pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(0, 0, 0, 0.28)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 12,
                padding: '12px 18px',
              }}
            >
              <div
                style={{
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  display: 'flex',
                }}
              >
                3Y CAGR Return
              </div>
              <div
                style={{
                  color: ret1Text ? '#a5d6a7' : 'rgba(255,255,255,0.4)',
                  fontSize: 20,
                  fontWeight: 900,
                  display: 'flex',
                }}
              >
                {ret1Text || 'N/A'}
              </div>
            </div>
          </div>

          {/* Center Connector / Overlap Badge */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              width: '136px',
            }}
          >
            {hasOverlap ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(0, 137, 123, 0.22)',
                  border: '2px solid rgba(0, 137, 123, 0.65)',
                  borderRadius: 22,
                  padding: '16px 12px',
                  width: '132px',
                }}
              >
                <div
                  style={{
                    color: '#4db6ac',
                    fontSize: 34,
                    fontWeight: 900,
                    lineHeight: 1,
                    display: 'flex',
                  }}
                >
                  {overlapNum}%
                </div>
                <div
                  style={{
                    color: '#80cbc4',
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: 1.1,
                    marginTop: 6,
                    textAlign: 'center',
                    display: 'flex',
                  }}
                >
                  PORTFOLIO OVERLAP
                </div>
              </div>
            ) : (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1.5px solid rgba(255, 255, 255, 0.18)',
                  borderRadius: 22,
                  padding: '16px 12px',
                  width: '116px',
                }}
              >
                <div
                  style={{
                    color: '#66bb6a',
                    fontSize: 28,
                    fontWeight: 900,
                    lineHeight: 1,
                    display: 'flex',
                  }}
                >
                  VS
                </div>
                <div
                  style={{
                    color: 'rgba(255, 255, 255, 0.45)',
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: 1,
                    marginTop: 4,
                    display: 'flex',
                  }}
                >
                  COMPARE
                </div>
              </div>
            )}
          </div>

          {/* Card B */}
          <div
            style={{
              width: '462px',
              height: '320px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1.5px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 18,
              padding: '26px 24px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div
                style={{
                  color: '#81c784',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  marginBottom: 8,
                  display: 'flex',
                }}
              >
                {cleanCategory(cat2) || 'Scheme B'}
              </div>
              <div
                style={{
                  color: '#ffffff',
                  fontSize: 25,
                  fontWeight: 800,
                  lineHeight: 1.25,
                  maxHeight: '130px',
                  overflow: 'hidden',
                  display: 'flex',
                }}
              >
                {fundNameB}
              </div>
            </div>

            {/* 3Y CAGR Pill */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(0, 0, 0, 0.28)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: 12,
                padding: '12px 18px',
              }}
            >
              <div
                style={{
                  color: 'rgba(255,255,255,0.6)',
                  fontSize: 13,
                  fontWeight: 700,
                  letterSpacing: 0.5,
                  display: 'flex',
                }}
              >
                3Y CAGR Return
              </div>
              <div
                style={{
                  color: ret2Text ? '#a5d6a7' : 'rgba(255,255,255,0.4)',
                  fontSize: 20,
                  fontWeight: 900,
                  display: 'flex',
                }}
              >
                {ret2Text || 'N/A'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer Row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 56px',
            background: 'rgba(0, 0, 0, 0.4)',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div
            style={{
              color: 'rgba(255, 255, 255, 0.55)',
              fontSize: 12,
              display: 'flex',
            }}
          >
            Real AMFI NAVs · Factual Portfolio Overlap · Regular Plans
          </div>
          <div
            style={{
              color: '#66bb6a',
              fontSize: 12,
              fontWeight: 600,
              display: 'flex',
            }}
          >
            {slug ? `mfcalc.getabundance.in/compare/${slug}` : 'mfcalc.getabundance.in/compare'}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    }
  );
}
