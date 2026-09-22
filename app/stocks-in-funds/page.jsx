import { redirect } from 'next/navigation';
import pool from '@/lib/db';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import StocksInFundsHubClient from './StocksInFundsHubClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Who Owns This Stock? Mutual Fund & PMS Holdings Screener | Abundance',
  description:
    'Discover which mutual funds and PMS strategies hold any Indian stock. View complete institutional ownership, portfolio weights, aggregate holding values, and fund comparison tools. Abundance Financial Services (ARN-251838) · Atin Kumar Agrawal (APRN04279).',
  alternates: {
    canonical: 'https://mfcalc.getabundance.in/stocks-in-funds',
  },
  openGraph: {
    title: 'Who Owns This Stock? Mutual Fund & PMS Holdings Screener',
    description:
      'Search any NSE stock to see which mutual funds and PMS strategies hold it. View portfolio weights and institutional holdings breakdown.',
    url: 'https://mfcalc.getabundance.in/stocks-in-funds',
    siteName: 'Abundance',
    locale: 'en_IN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Who Owns This Stock? Mutual Fund & PMS Holdings Screener',
    description:
      'Search any NSE stock to see which mutual funds and PMS strategies hold it. View portfolio weights and institutional holdings breakdown.',
  },
};

export default async function StocksInFundsHubPage(props) {
  const resolvedSearchParams = await props?.searchParams;
  if (resolvedSearchParams?.stock) {
    redirect(`/stocks-in-funds/${encodeURIComponent(resolvedSearchParams.stock.trim().toLowerCase())}`);
  }
  let topStocks = [];
  let stats = { uniqueStocks: 0, totalHoldings: 0, totalValueCr: 0 };

  try {
    const topRes = await pool.query(`
      SELECT
        COALESCE(ticker, stock_slug) as symbol,
        MAX(ticker) as ticker,
        (ARRAY_AGG(stock_slug ORDER BY market_value_cr DESC NULLS LAST, weight_pct DESC NULLS LAST))[1] as stock_slug,
        (ARRAY_AGG(company_name ORDER BY market_value_cr DESC NULLS LAST, weight_pct DESC NULLS LAST))[1] as company_name,
        COALESCE((ARRAY_AGG(sector) FILTER (WHERE sector IS NOT NULL AND sector != 'Unknown' AND sector != 'Diversified'))[1], MAX(sector), 'Diversified') as sector,
        count(*) as total_holders,
        count(*) FILTER (WHERE holder_type = 'MF') as mf_count,
        count(*) FILTER (WHERE holder_type = 'PMS') as pms_count,
        COALESCE(sum(market_value_cr), 0) as total_val_cr,
        round(avg(weight_pct), 2) as avg_weight_pct,
        max(weight_pct) as max_weight_pct
      FROM stock_fund_holdings
      GROUP BY COALESCE(ticker, stock_slug)
      ORDER BY total_holders DESC, total_val_cr DESC
      LIMIT 50;
    `);
    topStocks = topRes.rows;

    const statsRes = await pool.query(`
      SELECT
        count(DISTINCT COALESCE(ticker, stock_slug)) as unique_stocks,
        count(*) as total_holdings,
        COALESCE(sum(market_value_cr), 0) as total_val_cr
      FROM stock_fund_holdings;
    `);
    if (statsRes.rows.length) {
      stats = {
        uniqueStocks: parseInt(statsRes.rows[0].unique_stocks, 10) || 0,
        totalHoldings: parseInt(statsRes.rows[0].total_holdings, 10) || 0,
        totalValueCr: parseFloat(statsRes.rows[0].total_val_cr) || 0,
      };
    }
  } catch (err) {
    console.error('[StocksInFundsHubPage] DB Query Error:', err.message);
  }

  // Structured Data JSON-LD
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: 'https://mfcalc.getabundance.in',
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'Stocks in Funds',
            item: 'https://mfcalc.getabundance.in/stocks-in-funds',
          },
        ],
      },
      {
        '@type': 'ItemList',
        name: 'Most Widely Held Indian Stocks in Mutual Funds & PMS',
        description:
          'Top 50 listed Indian stocks ranked by mutual fund and PMS strategy institutional ownership.',
        numberOfItems: topStocks.length,
        itemListElement: topStocks.slice(0, 20).map((s, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: s.company_name,
          url: `https://mfcalc.getabundance.in/stocks-in-funds/${s.ticker || s.stock_slug}`,
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Navbar />
      <main style={{ minHeight: 'calc(100vh - 200px)', paddingBottom: '40px' }}>
        <StocksInFundsHubClient initialTopStocks={topStocks} stats={stats} />
      </main>
      <Footer />
    </>
  );
}
