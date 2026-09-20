/**
 * app/portfolio/diagnostic/[share_token]/page.jsx
 *
 * Public view page for a redacted CAS Portfolio Diagnostic snapshot.
 * Accessible via /portfolio/diagnostic/[share_token].
 *
 * Security & Compliance:
 * - Publicly accessible without session authentication.
 * - Displays ONLY redacted, PII-free data from the database payload.
 * - Dynamic OpenGraph metadata wiring linking /api/og-diagnostic/[share_token].
 * - Mandatory ARN-251838 distributor disclosure and SEBI RIA boundary compliance.
 */

import { notFound } from 'next/navigation';
import Link from 'next/link';
import pool from '@/lib/db';
import { OG_LOGO_MARK_URL } from '@/lib/ogAssets';

const SITE_URL = process.env.NEXTAUTH_URL || 'https://mfcalc.getabundance.in';

export async function generateMetadata({ params }) {
  const { share_token } = await params;
  if (!share_token) return {};

  try {
    const res = await pool.query(
      `SELECT title, schemes_count, weighted_overlap_pct, q1_equity_pct
       FROM portfolio_diagnostics
       WHERE share_token = $1
         AND NOT revoked
         AND expires_at > NOW()`,
      [share_token]
    );

    if (res.rows.length === 0) {
      return {
        title: 'Diagnostic Not Found | Abundance',
        description: 'The requested mutual fund portfolio diagnostic link has expired or was revoked.',
      };
    }

    const row = res.rows[0];
    const pageTitle = `${row.title} · CAS Portfolio Diagnostic`;
    const desc = `Factual diagnostic of ${row.schemes_count} mutual fund schemes: ${
      row.weighted_overlap_pct != null ? `${row.weighted_overlap_pct}% weighted overlap` : 'portfolio analysis'
    }, AMFI category quartile ranking, and market cap allocation.`;
    const ogImageUrl = `${SITE_URL}/api/og-diagnostic/${share_token}`;

    return {
      title: `${pageTitle} | Abundance`,
      description: desc,
      alternates: {
        canonical: `${SITE_URL}/portfolio/diagnostic/${share_token}`,
      },
      openGraph: {
        title: pageTitle,
        description: desc,
        url: `${SITE_URL}/portfolio/diagnostic/${share_token}`,
        siteName: 'Abundance Financial Services',
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: pageTitle,
          },
        ],
        type: 'website',
      },
      twitter: {
        card: 'summary_large_image',
        title: pageTitle,
        description: desc,
        images: [ogImageUrl],
      },
    };
  } catch (err) {
    console.error('[diagnostic/metadata]', err);
    return {};
  }
}

export default async function DiagnosticPage({ params }) {
  const { share_token } = await params;
  if (!share_token) notFound();

  let diagnostic = null;
  try {
    const res = await pool.query(
      `SELECT title, schemes_count, weighted_overlap_pct, q1_equity_pct, payload, created_at, expires_at
       FROM portfolio_diagnostics
       WHERE share_token = $1
         AND NOT revoked
         AND expires_at > NOW()`,
      [share_token]
    );

    if (res.rows.length === 0) {
      notFound();
    }
    diagnostic = res.rows[0];
  } catch (err) {
    console.error('[diagnostic/page]', err);
    notFound();
  }

  const payload = diagnostic.payload || {};
  const metrics = payload.metrics || {};
  const schemes = Array.isArray(payload.schemes) ? payload.schemes : [];
  const qDist = metrics.quartileDistribution || {};
  const mCap = metrics.mCapAllocation || {};
  const topPairs = Array.isArray(metrics.topOverlapPairs) ? metrics.topOverlapPairs : [];

  const createdDate = new Date(diagnostic.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const formattedOverlap =
    diagnostic.weighted_overlap_pct != null
      ? `${Number(diagnostic.weighted_overlap_pct).toFixed(1)}%`
      : schemes.length <= 1
      ? 'Single Scheme'
      : 'N/A';

  const q1Count = qDist.q1Count || 0;
  const q2Count = qDist.q2Count || 0;
  const q3Count = qDist.q3Count || 0;
  const q4Count = qDist.q4Count || 0;
  const unrankedCount = qDist.unrankedCount || 0;
  const totalRanked = q1Count + q2Count + q3Count + q4Count;

  return (
    <div style={{ minHeight: '100vh', background: '#0a140d', color: '#e0e6ed', fontFamily: 'sans-serif' }}>
      {/* Top Banner & Header */}
      <header
        style={{
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(10, 20, 13, 0.85)',
          backdropFilter: 'blur(10px)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div
          style={{
            maxWidth: '1100px',
            margin: '0 auto',
            padding: '16px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <img src={OG_LOGO_MARK_URL} width={38} height={38} alt="Abundance Logo" style={{ objectFit: 'contain' }} />
            <div>
              <div style={{ color: '#ffffff', fontSize: '1.05rem', fontWeight: 800, letterSpacing: '-0.3px' }}>
                Abundance Financial Services
              </div>
              <div style={{ color: '#81c784', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.5px' }}>
                ARN-251838 · AMFI Registered Mutual Fund Distributor
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 20,
                background: 'rgba(0, 137, 123, 0.15)',
                border: '1px solid rgba(0, 137, 123, 0.35)',
                color: '#4db6ac',
                fontSize: '0.75rem',
                fontWeight: 700,
              }}
            >
              🔒 Redacted Snapshot · Zero PII
            </span>
            <Link
              href="/cas-tracker?utm_source=diagnostic_share&utm_medium=nav_cta&utm_campaign=cas_plg"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '8px 16px',
                borderRadius: 8,
                background: '#2e7d32',
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: 700,
                textDecoration: 'none',
                transition: 'background 0.2s',
              }}
            >
              Analyze Your Portfolio →
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ maxWidth: '1100px', margin: '0 auto', padding: '36px 24px 80px' }}>
        {/* Title & Metadata */}
        <div style={{ marginBottom: 32 }}>
          <div
            style={{
              color: '#81c784',
              fontSize: '0.8rem',
              fontWeight: 800,
              letterSpacing: '1.5px',
              textTransform: 'uppercase',
              marginBottom: 8,
            }}
          >
            Factual CAS Portfolio Diagnostic
          </div>
          <h1
            style={{
              color: '#ffffff',
              fontSize: '2.4rem',
              fontWeight: 900,
              letterSpacing: '-0.8px',
              margin: '0 0 10px',
              lineHeight: 1.2,
            }}
          >
            {diagnostic.title}
          </h1>
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.85rem' }}>
            Generated on {createdDate} · Verified PII-Free Projection
          </div>
        </div>

        {/* Hero Metrics Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 18,
            marginBottom: 36,
          }}
        >
          {/* Card 1: Overlap */}
          <div
            style={{
              background: 'rgba(0, 137, 123, 0.1)',
              border: '1.5px solid rgba(0, 137, 123, 0.35)',
              borderRadius: 16,
              padding: '24px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ color: '#80cbc4', fontSize: '0.78rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }}>
              Weighted Portfolio Overlap
            </div>
            <div style={{ color: '#4db6ac', fontSize: '2.6rem', fontWeight: 900, margin: '14px 0 6px', lineHeight: 1 }}>
              {formattedOverlap}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', lineHeight: 1.4 }}>
              Product-weighted common stock overlap across all scheme pairs.
            </div>
          </div>

          {/* Card 2: Schemes Count */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1.5px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
              padding: '24px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ color: '#a5d6a7', fontSize: '0.78rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }}>
              Schemes Analyzed
            </div>
            <div style={{ color: '#ffffff', fontSize: '2.6rem', fontWeight: 900, margin: '14px 0 6px', lineHeight: 1 }}>
              {diagnostic.schemes_count}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', lineHeight: 1.4 }}>
              Active mutual fund schemes in verified portfolio snapshot.
            </div>
          </div>

          {/* Card 3: Top Quartile Equity */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1.5px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
              padding: '24px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ color: '#a5d6a7', fontSize: '0.78rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }}>
              AMFI Top Quartile (Q1)
            </div>
            <div style={{ color: '#ffffff', fontSize: '2.6rem', fontWeight: 900, margin: '14px 0 6px', lineHeight: 1 }}>
              {diagnostic.q1_equity_pct != null ? `${Number(diagnostic.q1_equity_pct).toFixed(0)}%` : '—'}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', lineHeight: 1.4 }}>
              {q1Count} of {totalRanked} ranked funds in the top 25% of their category peers.
            </div>
          </div>

          {/* Card 4: Market Cap Allocation */}
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1.5px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 16,
              padding: '24px 20px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ color: '#a5d6a7', fontSize: '0.78rem', fontWeight: 800, letterSpacing: '1px', textTransform: 'uppercase' }}>
              Market Cap Split
            </div>
            <div style={{ color: '#ffffff', fontSize: '1.4rem', fontWeight: 900, margin: '16px 0 8px', lineHeight: 1.2 }}>
              {Math.round(mCap.large || 0)}% <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Large</span> ·{' '}
              {Math.round(mCap.mid || 0)}% <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Mid</span> ·{' '}
              {Math.round(mCap.small || 0)}% <span style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>Small</span>
            </div>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem', lineHeight: 1.4 }}>
              Equity cap distribution based on official AMFI categorization.
            </div>
          </div>
        </div>

        {/* Section 1: AMFI Peer Quartile Distribution */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 18,
            padding: '28px',
            marginBottom: 36,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
            <div>
              <h2 style={{ color: '#ffffff', fontSize: '1.25rem', fontWeight: 800, margin: '0 0 6px' }}>
                AMFI Category Peer Quartile Distribution
              </h2>
              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.8rem' }}>
                Each scheme is ranked against every other Regular-Growth peer in its exact SEBI category.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ fontSize: '0.75rem', color: '#66bb6a', background: 'rgba(102, 187, 106, 0.1)', padding: '4px 10px', borderRadius: 6 }}>
                Q1: Top 25% ({q1Count})
              </span>
              <span style={{ fontSize: '0.75rem', color: '#fbc02d', background: 'rgba(251, 192, 45, 0.1)', padding: '4px 10px', borderRadius: 6 }}>
                Q2: Above Median ({q2Count})
              </span>
              <span style={{ fontSize: '0.75rem', color: '#fb8c00', background: 'rgba(251, 140, 0, 0.1)', padding: '4px 10px', borderRadius: 6 }}>
                Q3: Below Median ({q3Count})
              </span>
              <span style={{ fontSize: '0.75rem', color: '#e53935', background: 'rgba(229, 57, 53, 0.1)', padding: '4px 10px', borderRadius: 6 }}>
                Q4: Bottom 25% ({q4Count})
              </span>
            </div>
          </div>

          {/* Visual Stacked Bar */}
          {totalRanked > 0 ? (
            <div
              style={{
                display: 'flex',
                height: '24px',
                borderRadius: 8,
                overflow: 'hidden',
                background: 'rgba(255, 255, 255, 0.05)',
                margin: '18px 0',
              }}
            >
              {q1Count > 0 && <div style={{ width: `${(q1Count / totalRanked) * 100}%`, background: '#2e7d32' }} title={`Q1: ${q1Count}`} />}
              {q2Count > 0 && <div style={{ width: `${(q2Count / totalRanked) * 100}%`, background: '#f9a825' }} title={`Q2: ${q2Count}`} />}
              {q3Count > 0 && <div style={{ width: `${(q3Count / totalRanked) * 100}%`, background: '#e65100' }} title={`Q3: ${q3Count}`} />}
              {q4Count > 0 && <div style={{ width: `${(q4Count / totalRanked) * 100}%`, background: '#c62828' }} title={`Q4: ${q4Count}`} />}
            </div>
          ) : (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', padding: '16px 0' }}>
              Category benchmark data currently pending for selected schemes.
            </div>
          )}

          {unrankedCount > 0 && (
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.45)', marginTop: 8 }}>
              Note: {unrankedCount} fund{unrankedCount > 1 ? 's are' : ' is'} unranked (thematic, index, or track record &lt; 1 year).
            </div>
          )}
        </div>

        {/* Section 2: Portfolio Scheme Allocation Table */}
        <div
          style={{
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: 18,
            padding: '28px',
            marginBottom: 36,
          }}
        >
          <h2 style={{ color: '#ffffff', fontSize: '1.25rem', fontWeight: 800, margin: '0 0 16px' }}>
            Portfolio Scheme Allocation
          </h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)', color: 'rgba(255, 255, 255, 0.6)' }}>
                  <th style={{ padding: '12px 14px', fontWeight: 700 }}>Scheme Name</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700 }}>Category</th>
                  <th style={{ padding: '12px 14px', fontWeight: 700, textAlign: 'right' }}>Portfolio Weight</th>
                </tr>
              </thead>
              <tbody>
                {schemes.map((s, idx) => (
                  <tr
                    key={idx}
                    style={{
                      borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                      color: 'rgba(255, 255, 255, 0.9)',
                    }}
                  >
                    <td style={{ padding: '14px', fontWeight: 700, color: '#ffffff' }}>
                      {s.name}
                    </td>
                    <td style={{ padding: '14px', color: '#a5d6a7', fontSize: '0.8rem' }}>
                      {s.category || 'Equity Scheme'}
                    </td>
                    <td style={{ padding: '14px', textAlign: 'right', fontWeight: 800, color: '#ffffff' }}>
                      {Number(s.weightPct).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 3: High Overlap Pairs (if available) */}
        {topPairs.length > 0 && (
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 18,
              padding: '28px',
              marginBottom: 36,
            }}
          >
            <h2 style={{ color: '#ffffff', fontSize: '1.25rem', fontWeight: 800, margin: '0 0 6px' }}>
              Top Common Holdings Overlap Pairs
            </h2>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.8rem', marginBottom: 20 }}>
              Pairs with significant duplication in underlying stock holdings.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {topPairs.map((pair, idx) => {
                const schemeA = schemes.find((s) => s.amfiCode === pair.amfiCodeA);
                const schemeB = schemes.find((s) => s.amfiCode === pair.amfiCodeB);
                const nameA = schemeA?.name || `Scheme ${pair.amfiCodeA}`;
                const nameB = schemeB?.name || `Scheme ${pair.amfiCodeB}`;

                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'rgba(0, 0, 0, 0.25)',
                      border: '1px solid rgba(255, 255, 255, 0.06)',
                      borderRadius: 12,
                      padding: '14px 18px',
                      flexWrap: 'wrap',
                      gap: 12,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', fontWeight: 700 }}>
                      <span style={{ color: '#ffffff' }}>{nameA}</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}>vs</span>
                      <span style={{ color: '#ffffff' }}>{nameB}</span>
                    </div>
                    <div
                      style={{
                        padding: '4px 12px',
                        borderRadius: 12,
                        background: 'rgba(0, 137, 123, 0.2)',
                        border: '1px solid rgba(0, 137, 123, 0.4)',
                        color: '#4db6ac',
                        fontSize: '0.85rem',
                        fontWeight: 900,
                      }}
                    >
                      {Number(pair.overlapPct).toFixed(1)}% Overlap
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Growth Call to Action Banner */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(0, 137, 123, 0.2) 0%, rgba(46, 125, 50, 0.2) 100%)',
            border: '2px solid rgba(0, 137, 123, 0.4)',
            borderRadius: 22,
            padding: '40px 32px',
            textAlign: 'center',
            marginBottom: 40,
          }}
        >
          <div style={{ color: '#80cbc4', fontSize: '0.8rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
            Private · Secure · Zero-Commission Regular & Direct Support
          </div>
          <h2 style={{ color: '#ffffff', fontSize: '1.8rem', fontWeight: 900, margin: '0 0 14px', letterSpacing: '-0.5px' }}>
            Analyze & Track Your Own Mutual Fund Portfolio
          </h2>
          <p style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.95rem', maxWidth: '640px', margin: '0 auto 24px', lineHeight: 1.5 }}>
            Upload your CAS statement to uncover hidden overlap, calculate accurate FIFO capital gains, evaluate distributor fees, and rank your portfolio against category peers.
          </p>
          <Link
            href="/cas-tracker?utm_source=diagnostic_share&utm_medium=card_cta&utm_campaign=cas_plg"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '14px 28px',
              borderRadius: 12,
              background: '#2e7d32',
              color: '#ffffff',
              fontSize: '0.95rem',
              fontWeight: 800,
              textDecoration: 'none',
              boxShadow: '0 4px 14px rgba(46, 125, 50, 0.4)',
              transition: 'transform 0.2s, background 0.2s',
            }}
          >
            Open Abundance CAS Tracker (Free & Private) →
          </Link>
        </div>

        {/* Mandatory Regulatory Footer */}
        <footer
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            paddingTop: '24px',
            color: 'rgba(255, 255, 255, 0.45)',
            fontSize: '0.72rem',
            lineHeight: 1.6,
          }}
        >
          <div style={{ fontWeight: 700, color: 'rgba(255, 255, 255, 0.65)', marginBottom: 6 }}>
            Regulatory Disclosure & Distributor Notice
          </div>
          <p style={{ margin: '0 0 8px' }}>
            Abundance Financial Services is an AMFI-registered Mutual Fund Distributor (ARN-251838). Mutual fund investments are subject to market risks, read all scheme related documents carefully.
          </p>
          <p style={{ margin: 0 }}>
            This diagnostic report is computed strictly from public AMFI categorization guidelines, historical NAV returns, and disclosed mutual fund portfolio holdings. It does not provide subjective ratings, scorecards, or prescriptive buy/sell recommendations, and does not constitute investment advice under SEBI (Investment Advisers) Regulations, 2013. All personal identification tokens (PAN, folios, rupee balances) are mathematically stripped before public link generation.
          </p>
        </footer>
      </main>
    </div>
  );
}
