/**
 * app/api/og-diagnostic/[share_token]/route.js
 *
 * Dynamic OpenGraph PNG for CAS Portfolio Diagnostics (/portfolio/diagnostic/[share_token]).
 * Uses @vercel/og (Satori + Resvg) to render a 1200×630 branded card.
 *
 * Visual spec:
 * - Abundance dark-green theme with emerald/teal accents.
 * - AMFI distributor header & ARN-251838 disclosure.
 * - Factual portfolio metrics: schemes count, weighted overlap %, AMFI quartile standing,
 *   and market-cap allocation split.
 * - Strictly zero subjective ratings or letter grades.
 */

import { ImageResponse } from '@vercel/og';
import pool from '@/lib/db';
import { OG_LOGO_MARK_URL } from '@/lib/ogAssets';

export async function GET(req, { params }) {
  try {
    const { share_token } = await params;
    const { searchParams } = new URL(req.url);

    // Allow query param overrides for testing/previews, falling back to database
    let title = searchParams.get('title') || '';
    let schemesCount = searchParams.get('count') ? parseInt(searchParams.get('count'), 10) : null;
    let weightedOverlapPct = searchParams.get('overlap') ? parseFloat(searchParams.get('overlap')) : null;
    let q1EquityPct = searchParams.get('q1') ? parseFloat(searchParams.get('q1')) : null;
    let largeCapPct = searchParams.get('large') ? parseFloat(searchParams.get('large')) : null;
    let midCapPct = searchParams.get('mid') ? parseFloat(searchParams.get('mid')) : null;
    let smallCapPct = searchParams.get('small') ? parseFloat(searchParams.get('small')) : null;

    // Fetch from Postgres if share_token is provided and not 'preview'
    if (share_token && share_token !== 'preview') {
      const dbResult = await pool.query(
        `SELECT title, schemes_count, weighted_overlap_pct, q1_equity_pct, payload, revoked, expires_at
         FROM portfolio_diagnostics
         WHERE share_token = $1`,
        [share_token]
      );

      if (dbResult.rows.length === 0) {
        return new Response('Diagnostic report not found', { status: 404 });
      }

      const row = dbResult.rows[0];
      if (row.revoked || new Date(row.expires_at) <= new Date()) {
        return new Response('Diagnostic report has expired or was revoked', { status: 404 });
      }

      title = title || row.title;
      schemesCount = schemesCount ?? row.schemes_count;
      weightedOverlapPct = weightedOverlapPct ?? (row.weighted_overlap_pct != null ? Number(row.weighted_overlap_pct) : null);
      q1EquityPct = q1EquityPct ?? (row.q1_equity_pct != null ? Number(row.q1_equity_pct) : null);

      const payload = row.payload || {};
      const mCap = payload.metrics?.mCapAllocation;
      if (mCap) {
        largeCapPct = largeCapPct ?? (mCap.large != null ? Math.round(mCap.large) : null);
        midCapPct = midCapPct ?? (mCap.mid != null ? Math.round(mCap.mid) : null);
        smallCapPct = smallCapPct ?? (mCap.small != null ? Math.round(mCap.small) : null);
      }
    }

    const cleanTitle = (title || 'Mutual Fund Portfolio Diagnostic')
      .replace(/[^a-zA-Z0-9\s\-()]/g, '')
      .slice(0, 50)
      .trim();

    const countDisplay = schemesCount != null ? `${schemesCount} Scheme${schemesCount === 1 ? '' : 's'}` : 'Portfolio';
    const overlapDisplay = weightedOverlapPct != null ? `${weightedOverlapPct.toFixed(1)}%` : (schemesCount === 1 ? 'N/A (Single Fund)' : 'Calculated');
    const q1Display = q1EquityPct != null ? `${q1EquityPct.toFixed(0)}%` : null;

    const hasMcap = largeCapPct != null || midCapPct != null || smallCapPct != null;
    const mcapDisplay = hasMcap
      ? `${largeCapPct || 0}% Large · ${midCapPct || 0}% Mid · ${smallCapPct || 0}% Small`
      : 'Diversified Allocation';

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

          {/* Ambient Glows */}
          <div
            style={{
              position: 'absolute',
              top: -60,
              left: -60,
              width: 380,
              height: 380,
              borderRadius: '50%',
              background: 'rgba(102, 187, 106, 0.08)',
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: -60,
              right: -60,
              width: 420,
              height: 420,
              borderRadius: '50%',
              background: 'rgba(0, 137, 123, 0.1)',
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
                CAS Portfolio Diagnostic
              </span>
            </div>
          </div>

          {/* Main Content Area */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 56px',
              gap: 24,
              marginTop: 10,
              marginBottom: 10,
            }}
          >
            {/* Left Box: Diagnostic Overview */}
            <div
              style={{
                width: '630px',
                height: '340px',
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1.5px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 20,
                padding: '30px 28px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    color: '#81c784',
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                    marginBottom: 8,
                    display: 'flex',
                  }}
                >
                  Factual Portfolio Snapshot
                </div>
                <div
                  style={{
                    color: '#ffffff',
                    fontSize: 32,
                    fontWeight: 900,
                    lineHeight: 1.2,
                    maxHeight: '80px',
                    overflow: 'hidden',
                    display: 'flex',
                  }}
                >
                  {cleanTitle}
                </div>
              </div>

              {/* Metrics Grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: 12,
                    padding: '10px 16px',
                  }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 600 }}>
                    Portfolio Scope
                  </span>
                  <span style={{ color: '#ffffff', fontSize: 15, fontWeight: 800 }}>
                    {countDisplay}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: 12,
                    padding: '10px 16px',
                  }}
                >
                  <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 600 }}>
                    Market Cap Exposure
                  </span>
                  <span style={{ color: '#a5d6a7', fontSize: 14, fontWeight: 700 }}>
                    {mcapDisplay}
                  </span>
                </div>

                {q1Display && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: 12,
                      padding: '10px 16px',
                    }}
                  >
                    <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: 600 }}>
                      AMFI Top Quartile (Q1)
                    </span>
                    <span style={{ color: '#80cbc4', fontSize: 15, fontWeight: 800 }}>
                      {q1Display} of Equity Funds
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Box: Weighted Overlap Hero */}
            <div
              style={{
                width: '434px',
                height: '340px',
                background: 'rgba(0, 137, 123, 0.12)',
                border: '2px solid rgba(0, 137, 123, 0.45)',
                borderRadius: 20,
                padding: '30px 24px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'space-between',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  color: '#80cbc4',
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1.5,
                  textTransform: 'uppercase',
                  display: 'flex',
                }}
              >
                PORTFOLIO OVERLAP
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div
                  style={{
                    color: '#4db6ac',
                    fontSize: 64,
                    fontWeight: 900,
                    lineHeight: 1,
                    display: 'flex',
                  }}
                >
                  {overlapDisplay}
                </div>
                <div
                  style={{
                    color: 'rgba(255, 255, 255, 0.75)',
                    fontSize: 13,
                    fontWeight: 700,
                    marginTop: 8,
                    display: 'flex',
                  }}
                >
                  Weighted Holdings Overlap
                </div>
              </div>

              <div
                style={{
                  color: 'rgba(255, 255, 255, 0.45)',
                  fontSize: 11,
                  lineHeight: 1.4,
                  maxWidth: '360px',
                  display: 'flex',
                  textAlign: 'center',
                }}
              >
                Product-weighted common stock overlap across all pairs. 0% represents zero duplication.
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
                fontSize: 11,
                display: 'flex',
              }}
            >
              Factual AMFI Benchmark · No Subjective Health Scores · Redacted PII
            </div>
            <div
              style={{
                color: '#66bb6a',
                fontSize: 12,
                fontWeight: 600,
                display: 'flex',
              }}
            >
              mfcalc.getabundance.in/portfolio/diagnostic
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
        headers: {
          'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
        },
      }
    );
  } catch (err) {
    console.error('[og-diagnostic]', err);
    return new Response('Failed to generate diagnostic preview image', { status: 500 });
  }
}
