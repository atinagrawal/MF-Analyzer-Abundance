/**
 * app/compare/page.jsx
 *
 * Mutual Fund Comparison Hub.
 * Route: /compare
 *
 * Provides:
 * - Curated head-to-head comparisons across high-traffic AMFI categories
 * - Interactive fund launcher to compare any two mutual funds
 * - Breadcrumbs, Schema.org CollectionPage and FAQPage structured data
 * - AMFI ARN-251838 distributor disclosure
 */

import Link from 'next/link';
import { getScreenerDataset } from '@/lib/screenerData';
import { POPULAR_COMPARISONS } from '@/lib/compareSlug';
import CompareLauncher from './CompareLauncher';
import Footer from '@/components/Footer';
import '@/app/screener/mf-compare.css';

export const dynamic = 'force-dynamic';

function buildHubJsonLd() {
  const canonicalUrl = 'https://mfcalc.getabundance.in/compare';
  const title = 'Mutual Fund Comparison Hub — Compare Top Schemes Side-by-Side | Abundance';
  const description =
    'Compare India’s top mutual funds side-by-side across Flexi Cap, Large Cap, Mid Cap, Small Cap, and Hybrid categories. Analyze 1M to 10Y returns, portfolio overlap %, market cap breakdown, and risk metrics on real AMFI NAVs.';

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.getabundance.in' },
          { '@type': 'ListItem', position: 2, name: 'Mutual Fund Screener', item: 'https://mfcalc.getabundance.in/screener' },
          { '@type': 'ListItem', position: 3, name: 'Compare Hub', item: canonicalUrl },
        ],
      },
      {
        '@type': 'CollectionPage',
        name: title,
        description,
        url: canonicalUrl,
        publisher: {
          '@type': 'FinancialService',
          name: 'Abundance Financial Services',
          url: 'https://www.getabundance.in',
        },
      },
    ],
  };
}

export async function generateMetadata() {
  const canonicalUrl = 'https://mfcalc.getabundance.in/compare';
  const title = 'Mutual Fund Comparison Hub — Compare Top Schemes Side-by-Side | Abundance';
  const description =
    'Compare India’s top mutual funds side-by-side across Flexi Cap, Large Cap, Mid Cap, Small Cap, and Hybrid categories. Analyze 1M to 10Y returns, portfolio overlap %, market cap breakdown, and risk metrics on real AMFI NAVs.';

  const jsonLd = buildHubJsonLd();

  return {
    title,
    description,
    keywords:
      'compare mutual funds India, mutual fund comparison tool, portfolio overlap calculator, flexi cap fund comparison, large cap vs mid cap, small cap returns comparison, Abundance ARN-251838',
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonicalUrl,
      images: [
        {
          url: 'https://mfcalc.getabundance.in/og-mfcalc.png',
          width: 1200,
          height: 630,
          alt: 'Mutual Fund Comparison Hub — Abundance',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function CompareHubPage() {
  let dataset = null;
  try {
    dataset = await getScreenerDataset();
  } catch (err) {
    console.error('[CompareHubPage] Failed to fetch screener dataset:', err.message);
  }

  // Pre-sort funds by 3Y returns for the interactive launcher dropdown
  const topFunds = (dataset?.funds || [])
    .filter((f) => /open/i.test(f.structure || ''))
    .slice(0, 300);

  const jsonLd = buildHubJsonLd();

  return (
    <div className="cmp-page-container">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav className="cmp-breadcrumbs" aria-label="Breadcrumbs">
        <Link href="https://www.getabundance.in">Home</Link>
        <span className="cmp-breadcrumbs-sep">/</span>
        <Link href="/screener">Mutual Funds</Link>
        <span className="cmp-breadcrumbs-sep">/</span>
        <span className="cmp-breadcrumbs-current">Compare Hub</span>
      </nav>

      <div className="cmp-hub-hero">
        <h1 className="cmp-hub-title">⚖ Mutual Fund Comparison Hub</h1>
        <p className="cmp-hub-sub">
          Compare India’s leading mutual fund schemes side-by-side on real AMFI NAVs.
          Analyze rolling returns across 9 horizons, portfolio overlap %, market cap allocation,
          volatility, and SEBI liquidity stress tests.
        </p>

        <CompareLauncher funds={topFunds} />
      </div>

      <div className="cmp-hub-content" style={{ maxWidth: 1280, margin: '0 auto' }}>
        {POPULAR_COMPARISONS.map((group) => (
          <section key={group.category} className="cmp-category-group">
            <div className="cmp-category-header">
              <h2 className="cmp-category-title">{group.category} Comparisons</h2>
              <p className="cmp-category-desc">{group.description}</p>
            </div>

            <div className="cmp-cards-grid">
              {group.pairs.map((p) => {
                const parts = p.title.split(' vs ');
                return (
                  <Link key={p.slug} href={`/compare/${p.slug}`} className="cmp-card">
                    <div>
                      <div className="cmp-card-names">
                        <span className="cmp-card-fund">{parts[0]}</span>
                        <span className="cmp-card-vs">VS</span>
                        <span className="cmp-card-fund" style={{ textAlign: 'right' }}>{parts[1]}</span>
                      </div>
                      <p className="cmp-card-highlight">{p.highlight}</p>
                    </div>
                    <div className="cmp-card-footer">
                      Compare Analysis →
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        {/* Informational Guidance Section for SEO and Investors */}
        <section style={{ marginTop: 50, marginBottom: 50, padding: '24px 28px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16 }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--g1)', marginBottom: 12 }}>
            How to Evaluate Mutual Funds Side-by-Side
          </h3>
          <div style={{ fontSize: '.84rem', color: 'var(--text)', lineHeight: 1.65, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p>
              <strong>1. Portfolio Overlap Matters:</strong> Investing in two funds that hold the same underlying stocks (e.g. 40%+ portfolio overlap) creates redundant fees without meaningful diversification. Always check pairwise holdings overlap before adding a second fund in the same category.
            </p>
            <p>
              <strong>2. Return Consistency Over Point-to-Point Peaks:</strong> Short-term outperformance over 1 month or 3 months often reflects transient sector rotation. Long-term CAGR across 3, 5, and 7 years paired with lower maximum drawdown is a far more reliable indicator of risk-adjusted consistency.
            </p>
            <p>
              <strong>3. Return per Unit of Risk:</strong> Look beyond raw CAGR to volatility and return-per-risk ratios (Sharpe metric). A fund generating 18% CAGR with 12% annualized volatility creates a smoother investor compounding experience than one delivering 19% CAGR with 22% wild swings.
            </p>
          </div>
        </section>

        {/* Cross-Link Tools Navigation */}
        <section style={{ marginTop: 30, marginBottom: 40, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Link href="/sip-calculator" style={{ flex: '1 1 240px', padding: '16px 20px', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 12, textDecoration: 'none' }}>
            <span style={{ fontSize: '.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '.6px', display: 'block', marginBottom: 4 }}>Calculator</span>
            <strong style={{ fontSize: '1rem', color: 'var(--g1)', display: 'block', marginBottom: 4 }}>🧮 SIP &amp; Step-Up Calculator →</strong>
            <span style={{ fontSize: '.78rem', color: 'var(--text2)' }}>Project monthly SIP, Step-Up %, and backtest on real AMFI NAVs.</span>
          </Link>
          <Link href="/swp-calculator" style={{ flex: '1 1 240px', padding: '16px 20px', background: '#fff', border: '1.5px solid var(--border)', borderRadius: 12, textDecoration: 'none' }}>
            <span style={{ fontSize: '.68rem', fontWeight: 800, textTransform: 'uppercase', color: 'var(--muted)', letterSpacing: '.6px', display: 'block', marginBottom: 4 }}>Calculator</span>
            <strong style={{ fontSize: '1rem', color: 'var(--g1)', display: 'block', marginBottom: 4 }}>💸 SWP Retirement Modeller →</strong>
            <span style={{ fontSize: '.78rem', color: 'var(--text2)' }}>Model monthly retirement cashflows &amp; replay actual fund NAVs.</span>
          </Link>
        </section>
      </div>

      <Footer activePage="screener" />
    </div>
  );
}
