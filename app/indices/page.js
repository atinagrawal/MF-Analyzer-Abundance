import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import IndicesClient from './IndicesClient';
import { getCombinedIndicesData } from '@/lib/indicesData';
import { INDICES_FAQ } from './faqData';
import Link from 'next/link';

export const revalidate = 21600; // 6 hours — data refreshed with NSE monthly / BSE daily cycles

function ordinal(n) {
  const v = n % 100;
  return n + (['th','st','nd','rd'][(v - 20) % 10] || ['th','st','nd','rd'][v] || 'th');
}

export default async function IndicesPage() {
  let data = null;
  try {
    data = await getCombinedIndicesData();
  } catch (err) {
    console.error('[IndicesPage] Server-side data fetch error:', err);
    data = {
      allData: [],
      benchmarks: [],
      metadata: { count: 0, bseCount: 0, totalCount: 0, month: '', year: '', asOf: '' },
    };
  }

  const { metadata } = data;
  const day = metadata.asOf ? ordinal(parseInt(metadata.asOf.split('-')[2], 10)) : '';
  const dateStr = day ? `${day} ${metadata.month} ${metadata.year}` : `${metadata.month} ${metadata.year}`;
  const nsePart = metadata.count > 0 ? `${metadata.count} NSE indices (TRI basis as of ${dateStr})` : '';
  const bsePart = metadata.bseCount > 0 ? `${metadata.bseCount} BSE indices` : '';
  const subtitle = [nsePart, bsePart].filter(Boolean).join(' + ') + ' — returns, P/E, P/B, Beta, and Volatility.';

  return (
    <>
      <div className="container">
        <Navbar activePage="indices" />

        {/* Breadcrumbs Navigation */}
        <nav aria-label="Breadcrumb" style={{ margin: '16px 0 8px', fontSize: '.78rem', color: 'var(--muted)' }}>
          <ol style={{ listStyle: 'none', display: 'flex', gap: '8px', padding: 0, margin: 0, alignItems: 'center' }}>
            <li><a href="https://www.getabundance.in" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Home</a></li>
            <li aria-hidden="true" style={{ color: 'var(--border2)' }}>/</li>
            <li><Link href="/" style={{ color: 'var(--muted)', textDecoration: 'none' }}>Tools</Link></li>
            <li aria-hidden="true" style={{ color: 'var(--border2)' }}>/</li>
            <li aria-current="page" style={{ color: 'var(--text)', fontWeight: 700 }}>Index Dashboard</li>
          </ol>
        </nav>

        {/* Page Header */}
        <div className="page-header" style={{ marginBottom: 24 }}>
          <div className="page-eyebrow">
            <div className="live-dot" />
            <span className="eyebrow-text">NSE + BSE Indian Market Indices</span>
          </div>
          <h1 className="page-title">
            Index <span>Returns</span> & Valuation Dashboard
          </h1>
          <p className="page-subtitle" style={{ maxWidth: 840 }}>
            {metadata.totalCount > 0 ? subtitle : 'Real-time performance, P/E valuation multiples, and risk profiles across 270+ Indian equity and debt benchmarks.'}
          </p>
        </div>

        {/* Interactive Client Surface with pre-populated SSR data */}
        <IndicesClient initialData={data} />

        {/* In-Depth Educational Guide & Macro Methodology (Crawlable Semantic Content) */}
        <section className="idx-guide-section" style={{ marginTop: 48, paddingTop: 36, borderTop: '1.5px solid var(--border)' }}>
          <div className="section-head" style={{ marginBottom: 20 }}>
            <div className="section-title" style={{ fontSize: '1.3rem', fontWeight: 900 }}>
              📘 Market Valuation & Index Methodology Guide
            </div>
            <div className="section-badge">ESSENTIAL INVESTOR CONTEXT</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 32 }}>
            <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', padding: 22 }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--g1)', marginBottom: 8 }}>
                🌡 Understanding Nifty 50 P/E Bands
              </h3>
              <p style={{ fontSize: '.84rem', color: 'var(--text2)', lineHeight: 1.65, margin: 0 }}>
                Historically, the Nifty 50 Index has traded in three recognizable valuation bands: <strong>Undervalued (&lt;18x P/E)</strong>, <strong>Fair Value (18x–24x P/E)</strong>, and <strong>Expensive (&gt;24x P/E)</strong>. Forward 3-to-5 year CAGR for Indian equities has historically been highest when entry points occur during sub-18 P/E regimes. Note that since early 2021, NSE computes P/E using <em>consolidated</em> corporate earnings, which structurally lowered trailing multiples by ~2.5 to 3 points compared to historical standalone metrics.
              </p>
            </div>

            <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', padding: 22 }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--g1)', marginBottom: 8 }}>
                📊 Total Return Index (TRI) vs Price Return
              </h3>
              <p style={{ fontSize: '.84rem', color: 'var(--text2)', lineHeight: 1.65, margin: 0 }}>
                Standard Price Return (PR) indices only track capital appreciation from stock price movements, omitting dividends. Under SEBI regulations, all Indian mutual funds are mandated to benchmark against <strong>Total Return Indices (TRI)</strong>, which incorporate the immediate reinvestment of gross dividends. Over 5-to-10 year horizons, dividend reinvestment adds approximately <strong>1.2% to 1.8% annualised return</strong> to headline broad market benchmarks like Nifty 50 and BSE 500.
              </p>
            </div>

            <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', padding: 22 }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--g1)', marginBottom: 8 }}>
                🎯 Broad, Factor & Sectoral Dynamics
              </h3>
              <p style={{ fontSize: '.84rem', color: 'var(--text2)', lineHeight: 1.65, margin: 0 }}>
                This dashboard categorizes 270+ indices into <strong>Broad Market</strong> (core capitalization tiers from Large to Microcap), <strong>Sectoral</strong> (pure industry exposures like Bank, IT, Pharma), <strong>Factor / Smart-Beta</strong> (rules-based alpha strategies including Momentum, Value 50, Quality 30, and Low Volatility), and <strong>Thematic</strong> (multi-industry trends like Defence, Manufacturing, and Consumption).
              </p>
            </div>
          </div>

          {/* Accessible FAQ Section matching FAQPage JSON-LD */}
          <div style={{ marginTop: 28, background: 'var(--surface)', border: '1.5px solid var(--border)', borderRadius: 'var(--r)', padding: '24px 28px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--text)', marginBottom: 18 }}>
              Frequently Asked Questions (FAQ)
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {INDICES_FAQ.map(({ q, a }, i, arr) => (
                <details key={i} style={{
                  borderTop: i === 0 ? 'none' : '1px solid var(--border)',
                  paddingTop: i === 0 ? 0 : 14,
                  paddingBottom: 14,
                }}>
                  <summary style={{
                    cursor: 'pointer', listStyle: 'none', fontSize: '.88rem',
                    fontWeight: 800, color: 'var(--text)', display: 'flex',
                    justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    {q}
                    <span style={{ fontSize: '1.1rem', color: 'var(--muted)', flexShrink: 0, marginLeft: 16 }}>+</span>
                  </summary>
                  <div style={{ padding: '10px 0 4px', fontSize: '.82rem', color: 'var(--text2)', lineHeight: 1.7 }}>
                    {a}
                  </div>
                </details>
              ))}
            </div>
          </div>

          {/* Dual Regulatory Disclosure */}
          <div style={{
            marginTop: 28,
            padding: '16px 20px',
            background: 'var(--s2)',
            border: '1px solid var(--border)',
            borderRadius: '10px',
            fontSize: '.75rem',
            color: 'var(--muted)',
            lineHeight: 1.6,
          }}>
            <strong>Regulatory Attribution & Disclaimers:</strong> Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) · Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor). Market index returns and valuation ratios are published for factual benchmarking, research, and comparative analytics. Index performance does not represent guaranteed future returns of any mutual fund scheme or portfolio strategy.
          </div>
        </section>
      </div>

      <Footer />
    </>
  );
}

