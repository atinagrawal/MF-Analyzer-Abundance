import { notFound } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import IndexDetailClient from './IndexDetailClient';
import { getAllIndexSlugs, getIndexConfigBySlug } from '@/lib/indexConstituentsConfig';
import { getIndexDetail } from '@/lib/indexConstituents';

export const revalidate = 21600; // 6 hours

export async function generateStaticParams() {
  const slugs = getAllIndexSlugs();
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }) {
  const resolvedParams = await params;
  const slug = (resolvedParams?.slug || '').toLowerCase();
  const detail = await getIndexDetail(slug);

  if (!detail) {
    return {
      title: 'Index Not Found | Abundance',
      description: 'The requested market benchmark index could not be found.',
    };
  }

  const peText = detail.val?.pe ? `at ${detail.val.pe}x P/E` : '';
  const title = `${detail.name} Constituents, Weightage & Stock List (${detail.exchange}) | Abundance`;
  const description = `Complete list of ${detail.count} constituent stocks in ${detail.name} on ${detail.exchange} ${peText}. View P/E valuation multiples, trailing TRI returns, sector breakdown, and institutional mutual fund ownership. Abundance Financial Services (ARN-251838) · Atin Kumar Agrawal (APRN04279).`;
  const url = `https://mfcalc.getabundance.in/indices/${slug}`;

  return {
    title,
    description,
    alternates: {
      canonical: url,
      types: {
        'text/markdown': `${url}?format=md`,
      },
    },
    openGraph: {
      title,
      description,
      url,
      siteName: 'Abundance',
      locale: 'en_IN',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function IndexDetailPage({ params }) {
  const resolvedParams = await params;
  const slug = (resolvedParams?.slug || '').toLowerCase();
  const detail = await getIndexDetail(slug);

  if (!detail) {
    notFound();
  }

  const {
    name,
    exchange,
    category,
    description,
    asOf,
    count,
    returns,
    val,
    valuationStatus,
    sectorBreakdown,
  } = detail;

  // JSON-LD Structured Data
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.getabundance.in' },
      { '@type': 'ListItem', position: 2, name: 'Tools', item: 'https://mfcalc.getabundance.in' },
      { '@type': 'ListItem', position: 3, name: 'Index Dashboard', item: 'https://mfcalc.getabundance.in/indices' },
      { '@type': 'ListItem', position: 4, name: name, item: `https://mfcalc.getabundance.in/indices/${slug}` },
    ],
  };

  const financialProductSchema = {
    '@context': 'https://schema.org',
    '@type': 'FinancialProduct',
    name: `${name} Index`,
    description: description,
    category: category,
    exchange: exchange,
    provider: {
      '@type': 'FinancialService',
      name: 'Abundance Financial Services',
      url: 'https://www.getabundance.in',
      identifier: 'ARN-251838',
    },
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'INR',
    },
  };

  const datasetSchema = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${name} Index Constituents and Stock Roster`,
    description: `Complete constituent table for ${name} (${exchange}) containing ${count} listed equity securities, ISIN codes, sector classifications, and reverse mutual fund ownership links.`,
    url: `https://mfcalc.getabundance.in/indices/${slug}#constituents`,
    creator: {
      '@type': 'FinancialService',
      name: 'Abundance Financial Services',
      url: 'https://www.getabundance.in',
      identifier: 'ARN-251838',
    },
    distribution: [
      {
        '@type': 'DataDownload',
        encodingFormat: 'text/markdown',
        contentUrl: `https://mfcalc.getabundance.in/indices/${slug}?format=md`,
      },
      {
        '@type': 'DataDownload',
        encodingFormat: 'application/json',
        contentUrl: `https://mfcalc.getabundance.in/api/indices/${slug}`,
      },
    ],
    spatialCoverage: 'IN',
  };

  const faqItems = [
    {
      q: `How many constituent stocks are in the ${name} index?`,
      a: `As of ${asOf || 'the latest disclosure'}, the ${name} consists of exactly ${count} listed equity constituents on the ${exchange}. The portfolio is reconstituted semi-annually based on predefined methodology rules.`,
    },
    {
      q: `What is the current P/E ratio and valuation zone of ${name}?`,
      a: val.pe
        ? `The current trailing Price-to-Earnings (P/E) ratio of ${name} is ${val.pe.toFixed(2)}x (P/B: ${val.pb ? val.pb.toFixed(2) + 'x' : 'N/A'}, Dividend Yield: ${val.dy ? val.dy.toFixed(2) + '%' : 'N/A'}). Historically, this places the index in the ${valuationStatus?.label || 'historical'} valuation band.`
        : `Official valuation multiples for ${name} are tracked against exchange publications and updated regularly on this dashboard.`,
    },
    {
      q: `Which mutual funds and PMS strategies hold stocks of ${name}?`,
      a: `You can view institutional mutual fund ownership and portfolio weights for every constituent by clicking the "View Fund Holdings ➔" link next to any stock symbol in the table below. This deep-links directly into our Reverse Stock Holdings Engine (/stocks-in-funds).`,
    },
    {
      q: `What is the difference between Total Return Index (TRI) and Price Return for ${name}?`,
      a: `The Price Return (PR) version of ${name} measures only stock price changes. Under SEBI regulations, mutual funds benchmark against the Total Return Index (TRI) variant, which reinvests all gross dividend payouts back into the portfolio. Over a 5-to-10 year horizon, dividend reinvestment typically generates an additional 1.2% to 1.8% in annualised returns.`,
    },
  ];

  const faqPageSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };

  const fmtRet = (v) => (v !== null && v !== undefined ? `${v > 0 ? '+' : ''}${v.toFixed(2)}%` : '—');
  const retCls = (v) => (v > 0 ? 'ret-pos' : v < 0 ? 'ret-neg' : 'ret-neu');

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(financialProductSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema) }}
      />

      <div className="container" style={{ maxWidth: 1200, margin: '0 auto', padding: '0 16px' }}>
        <Navbar activePage="indices" />

        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" style={{ margin: '16px 0 8px', fontSize: '.78rem', color: 'var(--muted)' }}>
          <ol style={{ listStyle: 'none', display: 'flex', gap: '8px', padding: 0, margin: 0, alignItems: 'center', flexWrap: 'wrap' }}>
            <li><a href="https://www.getabundance.in" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Home</a></li>
            <li aria-hidden="true" style={{ color: 'var(--border2)' }}>/</li>
            <li><Link href="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Tools</Link></li>
            <li aria-hidden="true" style={{ color: 'var(--border2)' }}>/</li>
            <li><Link href="/indices" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Indices</Link></li>
            <li aria-hidden="true" style={{ color: 'var(--border2)' }}>/</li>
            <li aria-current="page" style={{ color: 'var(--text)', fontWeight: 700 }}>{name}</li>
          </ol>
        </nav>

        {/* Page Header */}
        <header className="page-header" style={{ marginBottom: 28 }}>
          <div className="page-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div className="live-dot" />
            <span className="eyebrow-text" style={{ fontSize: '.76rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--g1)' }}>
              {exchange} · {category}
            </span>
          </div>

          <h1 className="page-title" style={{ fontSize: '2.1rem', fontWeight: 900, color: 'var(--text)', margin: '0 0 10px' }}>
            {name} <span>Constituents</span> & Stock Roster
          </h1>

          <p className="page-subtitle" style={{ maxWidth: 840, fontSize: '.92rem', color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>
            {description}
          </p>
        </header>

        {/* Trailing Performance & Valuation Scorecard */}
        <section aria-label="Index Metrics Overview" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px' }}>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>P/E Ratio</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)' }}>
              {val.pe ? `${val.pe.toFixed(2)}x` : '—'}
            </div>
            {valuationStatus && (
              <span style={{ fontSize: '.68rem', fontWeight: 700, color: valuationStatus.color, display: 'inline-block', marginTop: 3 }}>
                ● {valuationStatus.label}
              </span>
            )}
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px' }}>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>P/B Ratio</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)' }}>
              {val.pb ? `${val.pb.toFixed(2)}x` : '—'}
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px' }}>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Div. Yield</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)' }}>
              {val.dy ? `${val.dy.toFixed(2)}%` : '—'}
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px' }}>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>1Y Return (TRI)</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800 }} className={retCls(returns.r1y)}>
              {fmtRet(returns.r1y)}
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px' }}>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>3Y CAGR (TRI)</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800 }} className={retCls(returns.r3y)}>
              {fmtRet(returns.r3y)}
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px' }}>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>5Y CAGR (TRI)</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800 }} className={retCls(returns.r5y)}>
              {fmtRet(returns.r5y)}
            </div>
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: '14px 16px' }}>
            <div style={{ fontSize: '.72rem', color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Constituents</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--g1)' }}>
              {count}
            </div>
            <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 3 }}>Stocks listed</div>
          </div>
        </section>

        {/* Interactive Client Surface: Instant Search, Sector Pills, Valuation Gauge, Pro Export */}
        <IndexDetailClient detail={detail} />

        {/* Crawlable Methodology Guide Section */}
        <section style={{ marginTop: 48, paddingTop: 32, borderTop: '1.5px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>
              📘 Index Construction & Methodology
            </h2>
            <span style={{ fontSize: '.75rem', fontWeight: 700, background: 'var(--s2)', color: 'var(--g1)', padding: '3px 8px', borderRadius: 4 }}>
              DISCLOSURE STANDARD
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 32 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 18 }}>
              <h3 style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--g1)', margin: '0 0 6px' }}>
                ⚖️ Weighting & Rebalancing Mechanism
              </h3>
              <p style={{ fontSize: '.84rem', color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>
                {exchange === 'NSE'
                  ? `${name} is reconstituted semi-annually in March and September using average data over a six-month observation window. Stock weightings are calculated based on free-float market capitalization with regulatory single-stock concentration caps where applicable.`
                  : `${name} is maintained by BSE India and reconstituted periodically. Constituents are selected based on size, liquidity, and trading frequency on the Bombay Stock Exchange.`}
              </p>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 18 }}>
              <h3 style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--g1)', margin: '0 0 6px' }}>
                🔄 Total Return Index (TRI) Mandate
              </h3>
              <p style={{ fontSize: '.84rem', color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>
                SEBI guidelines require all Indian active and passive mutual fund schemes to measure alpha against Total Return Indices (TRI). Unlike Price Return indices, TRI accounts for gross dividend reinvestment, providing an authentic benchmark for performance attribution.
              </p>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--r)', padding: 18 }}>
              <h3 style={{ fontSize: '.95rem', fontWeight: 800, color: 'var(--g1)', margin: '0 0 6px' }}>
                🔍 Institutional Reverse Ownership
              </h3>
              <p style={{ fontSize: '.84rem', color: 'var(--text2)', lineHeight: 1.6, margin: 0 }}>
                Every stock in this constituent list is integrated with the Abundance Reverse Stock Holdings Engine. Click &quot;View Fund Holdings ➔&quot; to inspect which mutual funds, PMS managers, and schemes have built active positions in that equity.
              </p>
            </div>
          </div>

          {/* Crawlable Accessible FAQ Accordion */}
          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text)', marginBottom: 14 }}>
              Frequently Asked Questions: {name}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {faqItems.map((faq, idx) => (
                <details
                  key={idx}
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--r)',
                    padding: '14px 16px',
                    cursor: 'pointer',
                  }}
                >
                  <summary style={{ fontSize: '.92rem', fontWeight: 700, color: 'var(--text)', outline: 'none' }}>
                    {faq.q}
                  </summary>
                  <p style={{ fontSize: '.84rem', color: 'var(--text2)', lineHeight: 1.65, margin: '10px 0 0' }}>
                    {faq.a}
                  </p>
                </details>
              ))}
            </div>
          </div>

          {/* Mandatory Regulatory Attribution */}
          <div style={{
            marginTop: 32,
            padding: '16px 20px',
            background: 'var(--s2)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            fontSize: '.75rem',
            color: 'var(--muted)',
            lineHeight: 1.6,
          }}>
            <strong>Source Attribution & Regulatory Disclosures:</strong> Constituent data sourced from official index publications (NSE Indices Limited and BSE Limited). Trailing returns and valuation multiples calculated on Total Return Index (TRI) and Price Return bases. Published by Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor). Market index returns are presented for factual benchmarking and investor education.
          </div>
        </section>
      </div>

      <Footer />
    </>
  );
}
