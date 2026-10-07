/**
 * app/sifs/reports/performance/[category]/page.jsx
 *
 * Category-wise SIF performance comparison -- real HTML rendering of the
 * same data app/api/og-sif-performance/route.js turns into a downloadable
 * branded PNG heatmap. Data layer: lib/sifReports.js.
 */

import { notFound } from 'next/navigation';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getSifCategoryPerformance, listSifCategories } from '@/lib/sifReports';
import PerformanceTable from './PerformanceTable';
import '../../sif-reports.css';

export const revalidate = 21600;

const SITE = 'https://mfcalc.getabundance.in';

function safeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

// No generateStaticParams -- on-demand ISR instead, matching every other
// dynamic-segment page in this app except /indices/[slug]. Pre-rendering
// all 5 categories at build time would mean a single transient DB hiccup
// during the build fails the entire deploy, not just one page view.
export async function generateMetadata({ params }) {
  const { category } = await params;
  const report = await getSifCategoryPerformance(category).catch(() => null);
  if (!report) {
    return { title: 'SIF Category Not Found | Abundance', robots: { index: false, follow: false } };
  }
  const title = `${report.label} SIFs — Performance Comparison | Abundance`;
  const description = `Returns and volatility comparison across ${report.schemes.length} ${report.label} Specialized Investment Funds in India, as of ${report.asOf || 'latest NAV'}. Free report, downloadable and shareable. Abundance Financial Services (ARN-251838).`;
  const pageUrl = `${SITE}/sifs/reports/performance/${report.slug}`;
  const ogImage = `${SITE}/api/og-sif-performance?category=${report.slug}`;
  return {
    title,
    description,
    alternates: { canonical: pageUrl },
    openGraph: { title, description, url: pageUrl, siteName: 'Abundance', locale: 'en_IN', type: 'website', images: [{ url: ogImage, width: 1600, height: 900 }] },
    twitter: { card: 'summary_large_image', title, description, images: [ogImage] },
  };
}

export default async function SifCategoryPerformancePage({ params }) {
  const { category } = await params;
  const allCategories = await listSifCategories();
  if (!allCategories.some((c) => c.slug === category)) {
    notFound();
  }

  // No try/catch: a genuine DB error should surface as a real error, not
  // get cached as a false "category not found" under ISR -- same
  // reasoning as app/fund/[code]/page.js's fix this session.
  const report = await getSifCategoryPerformance(category);
  if (!report) {
    notFound();
  }

  const pageUrl = `${SITE}/sifs/reports/performance/${report.slug}`;
  const ogImage = `${SITE}/api/og-sif-performance?category=${report.slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Dataset',
    name: `${report.label} SIFs — Performance Comparison`,
    description: `Returns and volatility across ${report.schemes.length} ${report.label} Specialized Investment Funds in India.`,
    url: pageUrl,
    license: 'https://www.amfiindia.com',
    creator: { '@type': 'FinancialService', name: 'Abundance Financial Services', identifier: 'ARN-251838' },
    variableMeasured: ['1M Return', '3M Return', '6M Return', '1Y Return', '3Y Annualized Return', 'Volatility'],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <Navbar />
      <main className="sifr-wrap">
        <div className="sifr-eyebrow"><a href="/sifs/reports">SIF Reports</a> &middot; Performance Comparison</div>
        <h1 className="sifr-title">{report.label} SIFs</h1>
        <p className="sifr-sub">
          {report.schemes.length} tracked strategies in this category &middot; absolute returns to 1 year,
          annualized for 3-year &middot; as of {report.asOf || 'latest NAV'}
        </p>

        <div className="sifr-cat-tabs">
          {allCategories.map((c) => (
            <a key={c.slug} href={`/sifs/reports/performance/${c.slug}`} className={`sifr-cat-tab${c.slug === report.slug ? ' active' : ''}`}>
              {c.label}
            </a>
          ))}
        </div>

        <div className="sifr-download-row">
          <a className="sifr-download-btn" href={ogImage} target="_blank" rel="noopener noreferrer">
            &#8681; Download shareable image
          </a>
          <span className="sifr-asof">Image regenerates daily &middot; table updates every 6 hours from AMFI NAV history</span>
        </div>

        {report.schemes.length === 0 ? (
          <p>No live SIFs are currently tracked in this category.</p>
        ) : (
          <PerformanceTable schemes={report.schemes} />
        )}

        <p className="sifr-disclaimer">
          Source: AMFI NAV history. 1M/3M/6M/1Y are absolute trailing returns; 3Y is annualized (CAGR).
          Past performance may or may not be sustained in the future. Investments in Specialized Investment
          Funds involve relatively higher risk including potential loss of capital, liquidity risk and market
          volatility. This report is for informational purposes only and does not constitute investment
          advice. Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor) &middot;
          Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor).
        </p>
      </main>
      <Footer />
    </>
  );
}
