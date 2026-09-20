import { notFound, permanentRedirect } from 'next/navigation';
import pool from '@/lib/db';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import StockHoldersClient from './StockHoldersClient';

export const dynamic = 'force-dynamic';

async function getStockHoldingsData(rawParam) {
  const decoded = decodeURIComponent(rawParam || '').trim();
  if (!decoded) return null;

  try {
    // 1. Query stock_fund_holdings by uppercase ticker OR lowercase slug
    const holdingsRes = await pool.query(
      `
      SELECT
        id,
        stock_slug,
        ticker,
        isin,
        company_name,
        sector,
        holder_type,
        scheme_code,
        scheme_name,
        provider_name,
        category,
        weight_pct,
        market_value_cr,
        as_of_date,
        match_confidence
      FROM stock_fund_holdings
      WHERE UPPER(ticker) = UPPER($1) OR LOWER(stock_slug) = LOWER($1)
      ORDER BY weight_pct DESC
      `,
      [decoded]
    );

    if (holdingsRes.rows.length > 0) {
      const rows = holdingsRes.rows;
      const first = rows[0];
      const canonicalTicker = first.ticker ? first.ticker.toUpperCase().trim() : null;
      const canonicalSlug = first.stock_slug;
      const canonicalCode = canonicalTicker || canonicalSlug;

      return {
        canonicalCode,
        canonicalTicker,
        canonicalSlug,
        stockMeta: {
          companyName: first.company_name,
          ticker: canonicalTicker,
          slug: canonicalSlug,
          sector: first.sector,
          isin: first.isin,
          asOfDate: first.as_of_date,
        },
        holdings: rows,
      };
    }

    // 2. If not found in holdings, check stock_signals for graceful zero-holder state
    const signalRes = await pool.query(
      `
      SELECT symbol, name, sector, isin
      FROM stock_signals
      WHERE UPPER(symbol) = UPPER($1) OR LOWER(symbol) = LOWER($1)
      LIMIT 1
      `,
      [decoded]
    );

    if (signalRes.rows.length > 0) {
      const s = signalRes.rows[0];
      const canonicalTicker = s.symbol.toUpperCase().trim();
      return {
        canonicalCode: canonicalTicker,
        canonicalTicker,
        canonicalSlug: canonicalTicker.toLowerCase(),
        stockMeta: {
          companyName: s.name,
          ticker: canonicalTicker,
          slug: canonicalTicker.toLowerCase(),
          sector: s.sector || 'Equities',
          isin: s.isin,
          asOfDate: null,
        },
        holdings: [],
      };
    }
  } catch (err) {
    console.error('[StocksInFundsDetailPage] DB error:', err.message);
  }

  return null;
}

export async function generateMetadata({ params }) {
  const { ticker } = await params;
  const rawParam = decodeURIComponent(ticker || '').trim();
  const data = await getStockHoldingsData(rawParam);

  if (!data) {
    return {
      title: 'Stock Not Found | Abundance',
      description: 'The requested stock was not found in our institutional holdings database.',
      robots: { index: false, follow: false },
    };
  }

  const { stockMeta, canonicalCode } = data;
  const sym = stockMeta.ticker || stockMeta.slug;
  const title = `Who Owns ${stockMeta.companyName}? Top Mutual Funds & PMS Holding ${sym} | Abundance`;
  const description = `Discover which mutual funds and PMS strategies hold ${stockMeta.companyName} (${sym}). View complete portfolio weights, market values, and top institutional holders. Abundance Financial Services (ARN-251838) · Atin Kumar Agrawal (APRN04279).`;
  const canonicalUrl = `https://mfcalc.getabundance.in/stocks-in-funds/${canonicalCode}`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'Abundance',
      locale: 'en_IN',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  };
}

export default async function StocksInFundsDetailPage({ params }) {
  const { ticker } = await params;
  const rawParam = decodeURIComponent(ticker || '').trim();
  const data = await getStockHoldingsData(rawParam);

  if (!data) {
    notFound();
  }

  // Enforce Canonical 308 Permanent Redirect:
  // e.g., /stocks-in-funds/hdfc-bank-ltd or /stocks-in-funds/hdfcbank -> /stocks-in-funds/HDFCBANK
  if (rawParam !== data.canonicalCode) {
    permanentRedirect(`/stocks-in-funds/${data.canonicalCode}`);
  }

  const { stockMeta, holdings, canonicalCode } = data;
  const canonicalUrl = `https://mfcalc.getabundance.in/stocks-in-funds/${canonicalCode}`;

  // Structured Data (JSON-LD)
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
          {
            '@type': 'ListItem',
            position: 3,
            name: `${stockMeta.companyName} (${stockMeta.ticker || stockMeta.slug})`,
            item: canonicalUrl,
          },
        ],
      },
      {
        '@type': 'FinancialProduct',
        name: `${stockMeta.companyName} (${stockMeta.ticker || stockMeta.slug})`,
        description: `Institutional mutual fund and PMS ownership profile for ${stockMeta.companyName} across Indian institutional portfolios.`,
        category: stockMeta.sector || 'Equities',
        provider: {
          '@type': 'FinancialService',
          name: 'Abundance Financial Services',
          identifier: 'ARN-251838',
        },
      },
      ...(holdings.length > 0
        ? [
            {
              '@type': 'ItemList',
              name: `Top Mutual Funds and PMS Strategies Holding ${stockMeta.companyName}`,
              numberOfItems: Math.min(holdings.length, 10),
              itemListElement: holdings.slice(0, 10).map((h, idx) => ({
                '@type': 'ListItem',
                position: idx + 1,
                name: `${h.scheme_name} (${parseFloat(h.weight_pct).toFixed(2)}%)`,
                url:
                  h.holder_type === 'MF'
                    ? `https://mfcalc.getabundance.in/fund/${h.scheme_code}`
                    : canonicalUrl,
              })),
            },
          ]
        : []),
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
        <StockHoldersClient stock={stockMeta} holdings={holdings} />
      </main>
      <Footer />
    </>
  );
}
