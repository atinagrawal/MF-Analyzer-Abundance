import { redirect, notFound } from 'next/navigation';
import pool from '@/lib/db';
import LINEAGE from '@/data/scheme-lineage.json';
import FundDetailClient from './FundDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { code } = await params;

  if (!code || isNaN(Number(code))) {
    return {
      title: 'Fund Not Found | Abundance',
      robots: { index: false, follow: false },
    };
  }

  const { rows } = await pool.query(
    `SELECT name, amc, category, structure, isin, nav, inception_date, age_years
     FROM mf_screener WHERE code = $1`,
    [Number(code)]
  ).catch(() => ({ rows: [] }));

  if (!rows.length) {
    return {
      title: 'Fund Not Found | Abundance',
      robots: { index: false, follow: false },
    };
  }

  const f = rows[0];
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

  const url = `https://mfcalc.getabundance.in/fund/${code}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FinancialProduct',
        name: f.name,
        description,
        provider: { '@type': 'Organization', name: f.amc },
        url,
        category: f.category,
        identifier: f.isin || code,
      },
      {
        '@type': 'FAQPage',
        mainEntity: buildFaqJsonLd(f, code),
      },
    ],
  };

  return {
    title,
    description,
    keywords: `${f.name}, ${f.amc}, ${shortCat} mutual fund India, ISIN ${f.isin || ''}, portfolio holdings, exit load, NAV history`,
    alternates: { canonical: url },
    openGraph: { title, description, type: 'website', url },
    twitter: { card: 'summary', title, description },
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

  const { rows } = await pool.query(
    'SELECT code FROM mf_screener WHERE code = $1',
    [Number(code)]
  ).catch(() => ({ rows: [] }));

  if (!rows.length) {
    // Check if it's a merged scheme in lineage mapping
    const successorEntry = Object.entries(LINEAGE || {}).find(
      ([, entry]) => String(entry.pred) === String(code)
    );
    if (successorEntry) {
      redirect(`/fund/${successorEntry[0]}`); // 301 Redirect
    }
    notFound(); // 404
  }

  return <FundDetailClient code={code} />;
}
