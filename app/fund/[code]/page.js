import { redirect, notFound } from 'next/navigation';
import fs from 'fs';
import path from 'path';
import pool from '@/lib/db';
import LINEAGE from '@/data/scheme-lineage.json';
import FundDetailClient from './FundDetailClient';

export const dynamic = 'force-dynamic';

/**
 * Robust fund record resolver with multi-layer fallback:
 * 1. PostgreSQL `mf_screener` table
 * 2. Local `data/screener.json` fallback (guarantees resilience during DB cold-starts)
 * 3. Lineage resolver for predecessor/merged scheme codes
 */
async function getFundMetadataRecord(code) {
  if (!code || isNaN(Number(code))) return null;
  const numCode = Number(code);
  const strCode = String(code);

  // 1. Try PostgreSQL database first
  try {
    const { rows } = await pool.query(
      `SELECT name, amc, category, structure, isin, nav, inception_date, age_years
       FROM mf_screener WHERE code = $1 LIMIT 1`,
      [numCode]
    );
    if (rows && rows.length > 0) {
      return { ...rows[0], code: strCode, isSuccessor: false };
    }
  } catch (err) {
    console.warn(`[getFundMetadataRecord] Database query failed for code ${code}:`, err.message);
  }

  // 2. Check local data/screener.json fallback
  try {
    const filePath = path.join(process.cwd(), 'data', 'screener.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const found = data.find((f) => String(f.code) === strCode);
      if (found) {
        return {
          name: found.name,
          amc: found.amc,
          category: found.category,
          structure: found.structure,
          isin: found.isin,
          nav: found.nav,
          inception_date: found.inception_date,
          age_years: found.age_years,
          code: strCode,
          isSuccessor: false,
        };
      }
    }
  } catch (err) {
    console.warn(`[getFundMetadataRecord] Local file fallback failed for code ${code}:`, err.message);
  }

  // 3. Check if it's a predecessor code in scheme-lineage.json
  const successorEntry = Object.entries(LINEAGE || {}).find(
    ([, entry]) => String(entry.pred) === strCode
  );
  if (successorEntry) {
    const succCode = successorEntry[0];
    const succRecord = await getFundMetadataRecord(succCode);
    if (succRecord) {
      return {
        ...succRecord,
        canonicalCode: succCode,
        isSuccessor: true,
      };
    }
  }

  return null;
}

export async function generateMetadata({ params }) {
  const { code } = await params;
  const f = await getFundMetadataRecord(code);

  if (!f) {
    return {
      title: 'Fund Not Found | Abundance',
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  // If this was a predecessor scheme code, point canonical URL directly to successor
  const targetCode = f.canonicalCode || code;
  const canonicalUrl = `https://mfcalc.getabundance.in/fund/${targetCode}`;

  const shortCat = (f.category || '')
    .replace(/^(Equity|Debt|Hybrid|Other|Solution Oriented).*? - /i, '')
    .replace(/ Fund$/i, '');
  const inceptionFormatted = f.inception_date
    ? new Date(f.inception_date + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : null;

  const title = `${f.name} — Fund Details, Holdings & Analytics | Abundance`;
  const description =
    `${f.name} is a ${shortCat} mutual fund by ${f.amc}.` +
    (f.isin ? ` ISIN: ${f.isin}.` : '') +
    (inceptionFormatted ? ` Launched ${inceptionFormatted}.` : '') +
    ` View minimum investment, exit load, portfolio holdings, stress test & full analytics on Abundance — ARN-251838.`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FinancialProduct',
        name: f.name,
        description,
        provider: { '@type': 'Organization', name: f.amc },
        url: canonicalUrl,
        category: f.category,
        identifier: f.isin || targetCode,
      },
      {
        '@type': 'FAQPage',
        mainEntity: buildFaqJsonLd(f, targetCode),
      },
    ],
  };

  return {
    title,
    description,
    keywords: `${f.name}, ${f.amc}, ${shortCat} mutual fund India, ISIN ${f.isin || ''}, portfolio holdings, exit load, NAV history`,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonicalUrl,
      images: [
        {
          url: `https://mfcalc.getabundance.in/api/og?code=${targetCode}&name=${encodeURIComponent(f.name)}`,
          width: 1200,
          height: 630,
          alt: f.name,
        },
      ],
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
    other: {
      'script:ld+json': JSON.stringify(jsonLd),
    },
  };
}

function buildFaqJsonLd(f, code) {
  const shortCat = (f.category || '')
    .replace(/^(Equity|Debt|Hybrid|Other|Solution Oriented).*? - /i, '')
    .replace(/ Fund$/i, '');
  const inceptionFormatted = f.inception_date
    ? new Date(f.inception_date + 'T00:00:00Z').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
    : 'its inception';

  return [
    {
      '@type': 'Question',
      name: `What is ${f.name}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${f.name} is an open-ended ${shortCat} mutual fund scheme managed by ${f.amc}. Launched in ${inceptionFormatted}, it is regulated by SEBI under the ${f.category} category. The fund is available for investment as a lumpsum or through a Systematic Investment Plan (SIP).`,
      },
    },
    {
      '@type': 'Question',
      name: `Who manages ${f.name}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${f.name} is managed by ${f.amc}. As a SEBI-regulated ${shortCat} fund, it follows the investment mandate defined for this category. For current fund manager details, refer to the scheme information document on the ${f.amc} website.`,
      },
    },
    {
      '@type': 'Question',
      name: `When was ${f.name} launched?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${f.name} was launched in ${inceptionFormatted}${f.age_years ? `, making it approximately ${Math.floor(f.age_years)} years old` : ''}. ISIN: ${f.isin || 'available in factsheet'}.`,
      },
    },
    {
      '@type': 'Question',
      name: `Is ${f.name} suitable for long-term goals?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${f.name} belongs to the ${f.category} category. Equity-oriented funds suit long-term wealth accumulation (5+ year horizon), while debt funds suit shorter horizons. Please consult a qualified financial adviser before investing.`,
      },
    },
    {
      '@type': 'Question',
      name: `How to invest in ${f.name}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `You can invest in ${f.name} through Abundance Financial Services (ARN-251838), an AMFI Registered Mutual Fund Distributor. Visit mfcalc.getabundance.in to analyse, compare and plan your investment. Minimum investment amounts and SIP eligibility details are available on this page.`,
      },
    },
    {
      '@type': 'Question',
      name: `What analytics are available for ${f.name} on Abundance?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `Abundance Pro members can view complete analytics for ${f.name} including returns across all time periods (1M to 10Y), interactive NAV history chart with benchmark comparison, SEBI stress test and liquidity analysis, complete portfolio holdings with sector breakdown, asset allocation (large/mid/small cap), PE valuation vs benchmark, and key operational facts including exit load, RTA, and minimum investment.`,
      },
    },
  ];
}

export default async function FundDetailPage({ params }) {
  const { code } = await params;

  if (!code || isNaN(Number(code))) {
    notFound();
  }

  const f = await getFundMetadataRecord(code);

  if (!f) {
    notFound();
  }

  if (f.isSuccessor && f.canonicalCode) {
    // 308 Permanent Redirect to successor scheme
    redirect(`/fund/${f.canonicalCode}`);
  }

  return <FundDetailClient code={code} />;
}
