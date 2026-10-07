/**
 * app/sifs/reports/page.jsx
 *
 * Hub for the shareable SIF report series: the AUM leaderboard and one
 * performance-comparison report per AMFI category. Each links to its own
 * page (real crawlable HTML) and its own downloadable branded PNG --
 * app/api/og-sif-aum renders live, app/api/og-sif-performance serves a
 * pre-generated image from R2 (see that route's header comment for why).
 * See lib/sifReports.js's header comment for scope/data-coverage notes.
 */

import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { getSifAumLeaderboard, listSifCategories, getSifCategoryPerformance } from '@/lib/sifReports';
import './sif-reports.css';

export const revalidate = 21600;

const SITE = 'https://mfcalc.getabundance.in';
const PAGE_URL = `${SITE}/sifs/reports`;

export async function generateMetadata() {
  const title = 'SIF Reports: AUM Leaderboard & Performance Comparisons | Abundance';
  const description = 'Shareable, data-backed reports on India’s Specialized Investment Funds (SIFs) — AMC-wise AUM leaderboard and category-wise performance comparisons. Free to view and download. Abundance Financial Services (ARN-251838) · Atin Kumar Agrawal (APRN04279).';
  return {
    title,
    description,
    alternates: { canonical: PAGE_URL },
    openGraph: { title, description, url: PAGE_URL, siteName: 'Abundance', locale: 'en_IN', type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function SifReportsHubPage() {
  // Graceful degradation, not a throw -- this is a listing/hub page (same
  // class as app/compare/page.jsx, app/stocks-in-funds/page.jsx), so a
  // transient DB error should render a reduced page, not take down the
  // whole route. (Detail pages one level down intentionally do the
  // opposite -- see aum-leaderboard/page.jsx's comment.)
  const board = await getSifAumLeaderboard().catch((err) => {
    console.error('[SifReportsHubPage] AUM leaderboard fetch failed:', err.message);
    return null;
  });
  const allCategories = await listSifCategories();
  const categoryResults = await Promise.allSettled(
    allCategories.map(async (c) => {
      const perf = await getSifCategoryPerformance(c.slug);
      return { ...c, count: perf?.schemes.length || 0 };
    })
  );
  const categories = categoryResults.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { ...allCategories[i], count: 0 }
  );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'SIF Reports',
    url: PAGE_URL,
    description: 'Shareable reports on Specialized Investment Funds in India: AUM leaderboard and category performance comparisons.',
    provider: { '@type': 'FinancialService', name: 'Abundance Financial Services', identifier: 'ARN-251838' },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar />
      <main className="sifr-wrap">
        <div className="sifr-eyebrow">Specialized Investment Funds &middot; India</div>
        <h1 className="sifr-title">SIF Reports</h1>
        <p className="sifr-sub">
          Data-backed, downloadable reports on India&rsquo;s SIF industry &mdash; AMC-wise AUM leaderboard and
          category-wise performance comparisons. Free to view, free to download, free to share.
        </p>

        <div className="sifr-grid">
          <a className="sifr-card" href="/sifs/reports/aum-leaderboard">
            <div className="sifr-card-label">AUM Leaderboard</div>
            <div className="sifr-card-title">India&rsquo;s SIF AUM Leaderboard</div>
            <div className="sifr-card-meta">
              {board ? `₹${board.totalAumCr.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr across ${board.sifCount} SIFs · as of ${board.asOf}` : 'Data unavailable'}
            </div>
          </a>

          {categories.map((c) => (
            <a key={c.slug} className="sifr-card" href={`/sifs/reports/performance/${c.slug}`}>
              <div className="sifr-card-label">Performance Comparison</div>
              <div className="sifr-card-title">{c.label} SIFs</div>
              <div className="sifr-card-meta">{c.count} tracked {c.count === 1 ? 'strategy' : 'strategies'}</div>
            </a>
          ))}
        </div>

        <p className="sifr-disclaimer">
          Source: AMFI (quarterly SIF Average AUM disclosure; daily NAV history). Investments in Specialized
          Investment Funds involve relatively higher risk including potential loss of capital, liquidity risk
          and market volatility. Please read all investment strategy related documents carefully before making
          an investment decision. This page is for informational purposes only and does not constitute
          investment advice. Abundance Financial Services (ARN-251838, AMFI Registered Mutual Fund Distributor)
          &middot; Atin Kumar Agrawal (APRN04279, APMI Registered PMS Distributor).
        </p>
      </main>
      <Footer />
    </>
  );
}
