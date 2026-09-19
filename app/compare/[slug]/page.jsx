/**
 * app/compare/[slug]/page.jsx
 *
 * Dedicated Server-Side Rendered (SSR) fund comparison page.
 * Route: /compare/[fundA]-vs-[fundB]
 *
 * Supports:
 * - Dynamic SSR backed by getScreenerDataset() in-memory cache
 * - Canonical slug enforcement (permanentRedirect 308 for reversed order or AMFI numeric pairs)
 * - Server-side prefetch of fund holdings (timeout-guarded) for Portfolio Overlap % in raw SSR HTML
 * - Full JSON-LD structured data (BreadcrumbList, FinancialProduct, FAQPage)
 * - Universal Markdown Feed (?format=md) for GEO / AI crawler ingestion
 */

import { notFound, permanentRedirect } from 'next/navigation';
import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import { getScreenerDataset } from '@/lib/screenerData';
import { resolveCompareFunds } from '@/lib/compareSlug';
import { getHoldingsData } from '@/lib/holdingsLookup';
import { computeOverlap } from '@/lib/portfolioAnalysis';
import { MFCompareView } from '@/app/screener/MFCompare';
import Footer from '@/components/Footer';
import '@/app/screener/mf-compare.css';

export const dynamic = 'force-dynamic';

let cachedMasterSchemes = null;
function getMasterSchemeList() {
  if (cachedMasterSchemes) return cachedMasterSchemes;
  try {
    const filePath = path.join(process.cwd(), 'data', 'mf-scheme-list.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      cachedMasterSchemes = data.schemes || null;
      return cachedMasterSchemes;
    }
  } catch (err) {
    console.warn('[compare] Failed to load master scheme list:', err.message);
  }
  return null;
}

let cachedCapCategories = null;
function getMarketCapCategories() {
  if (cachedCapCategories) return cachedCapCategories;
  try {
    const filePath = path.join(process.cwd(), 'public', 'data', 'amfi-cap-categorization.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      cachedCapCategories = data.categories || null;
      return cachedCapCategories;
    }
  } catch (err) {
    console.warn('[compare] Failed to load market cap categorization:', err.message);
  }
  return null;
}

async function fetchFundHoldingsSafe(code, name, timeoutMs = 2000) {
  try {
    return await Promise.race([
      getHoldingsData(code, name),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), timeoutMs)),
    ]);
  } catch (err) {
    console.warn(`[compare] Holdings prefetch skipped for ${code}:`, err.message);
    return null;
  }
}

function buildFaqJsonLd(funds) {
  const [f1, f2] = funds;
  return [
    {
      '@type': 'Question',
      name: `How do ${f1.name} and ${f2.name} compare on returns?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `Over a 3-year horizon, ${f1.name} has delivered ${f1.ret_3y != null ? f1.ret_3y.toFixed(1) + '%' : 'N/A'} CAGR vs ${f2.name}'s ${f2.ret_3y != null ? f2.ret_3y.toFixed(1) + '%' : 'N/A'} CAGR. Over 5 years, returns stand at ${f1.ret_5y != null ? f1.ret_5y.toFixed(1) + '%' : 'N/A'} vs ${f2.ret_5y != null ? f2.ret_5y.toFixed(1) + '%' : 'N/A'}. Past performance is not indicative of future results.`,
      },
    },
    {
      '@type': 'Question',
      name: `What is the risk difference between ${f1.name} and ${f2.name}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${f1.name} shows an annualized volatility of ${f1.vol != null ? f1.vol.toFixed(1) + '%' : 'N/A'} and max drawdown of ${f1.max_dd != null ? f1.max_dd.toFixed(1) + '%' : 'N/A'}, compared to ${f2.name}'s volatility of ${f2.vol != null ? f2.vol.toFixed(1) + '%' : 'N/A'} and max drawdown of ${f2.max_dd != null ? f2.max_dd.toFixed(1) + '%' : 'N/A'}.`,
      },
    },
    {
      '@type': 'Question',
      name: `How can I invest in ${f1.name} or ${f2.name}?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `You can invest in both funds through Abundance Financial Services (AMFI Registered Mutual Fund Distributor ARN-251838) via lump sum or Systematic Investment Plan (SIP). Analyze risk, portfolio overlap, and category peer ranks on Abundance before investing.`,
      },
    },
  ];
}

function buildComparisonJsonLd(funds, canonicalUrl) {
  const names = funds.map((f) => f.name).join(' vs ');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://www.getabundance.in' },
          { '@type': 'ListItem', position: 2, name: 'Mutual Fund Screener', item: 'https://mfcalc.getabundance.in/screener' },
          { '@type': 'ListItem', position: 3, name: 'Compare Hub', item: 'https://mfcalc.getabundance.in/compare' },
          { '@type': 'ListItem', position: 4, name: names, item: canonicalUrl },
        ],
      },
      ...funds.map((f) => ({
        '@type': 'FinancialProduct',
        name: f.name,
        provider: { '@type': 'Organization', name: f.amc },
        url: `https://mfcalc.getabundance.in/fund/${f.code}`,
        category: f.category,
        identifier: f.isin || String(f.code),
      })),
      {
        '@type': 'FAQPage',
        mainEntity: buildFaqJsonLd(funds),
      },
    ],
  };
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  let dataset = null;
  try {
    dataset = await getScreenerDataset();
  } catch {
    return { title: 'Fund Comparison | Abundance', robots: { index: false, follow: false } };
  }

  const masterSchemes = getMasterSchemeList();
  const res = resolveCompareFunds(slug, dataset?.funds || [], masterSchemes);

  if (!res || !res.funds || res.funds.length < 2) {
    return {
      title: 'Comparison Not Found | Abundance',
      robots: { index: false, follow: false },
    };
  }

  const { funds, canonicalSlug } = res;
  const [f1, f2] = funds;
  const names = funds.map((f) => f.name).join(' vs ');
  const canonicalUrl = `https://mfcalc.getabundance.in/compare/${canonicalSlug}`;

  // Attempt to pre-calculate overlap if holdings are warm/cached (1.5s timeout)
  let overlapPct = null;
  try {
    const [h1, h2] = await Promise.all([
      fetchFundHoldingsSafe(f1.code, f1.name, 1500),
      fetchFundHoldingsSafe(f2.code, f2.name, 1500),
    ]);
    if (h1?.holdings && h2?.holdings) {
      const grid = computeOverlap([
        { amfiCode: f1.code, holdings: h1.holdings },
        { amfiCode: f2.code, holdings: h2.holdings },
      ]);
      overlapPct = grid[0][1];
    }
  } catch {
    // Non-blocking fallback for metadata
  }

  const ogParams = new URLSearchParams();
  ogParams.set('c1', String(f1.code));
  ogParams.set('c2', String(f2.code));
  ogParams.set('name1', f1.name);
  ogParams.set('name2', f2.name);
  if (f1.category) ogParams.set('cat1', f1.category);
  if (f2.category) ogParams.set('cat2', f2.category);
  if (f1.ret_3y != null) ogParams.set('r1', f1.ret_3y.toFixed(1));
  if (f2.ret_3y != null) ogParams.set('r2', f2.ret_3y.toFixed(1));
  if (overlapPct != null) ogParams.set('overlap', String(Math.round(overlapPct)));
  ogParams.set('slug', canonicalSlug);
  const ogImageUrl = `https://mfcalc.getabundance.in/api/og-compare?${ogParams.toString()}`;

  const title = `${names} Comparison — Returns, Risk & Overlap | Abundance`;
  const description = `Compare ${names} side-by-side. Check 1M to 10Y CAGR returns, volatility, portfolio overlap, market cap allocation, and peer rankings on real AMFI NAVs. Abundance ARN-251838.`;

  const jsonLd = buildComparisonJsonLd(funds, canonicalUrl);

  return {
    title,
    description,
    keywords: `${names}, mutual fund comparison, portfolio overlap, returns, risk metrics, expense ratio, Abundance`,
    alternates: { canonical: canonicalUrl },
    openGraph: {
      title,
      description,
      type: 'website',
      url: canonicalUrl,
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${f1.name} vs ${f2.name}`,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
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

export default async function CompareDetailPage({ params, searchParams }) {
  const { slug } = await params;
  const sp = await searchParams;

  let dataset = null;
  try {
    dataset = await getScreenerDataset();
  } catch (err) {
    console.error('[CompareDetailPage] Failed to fetch screener dataset:', err.message);
  }

  if (!dataset?.funds?.length) {
    notFound();
  }

  const masterSchemes = getMasterSchemeList();
  const res = resolveCompareFunds(slug, dataset.funds, masterSchemes);

  if (!res || !res.funds || res.funds.length < 2) {
    notFound();
  }

  // Canonical redirection: If slug order is reversed or numeric codes are used, redirect permanently (308)
  if (!res.isCanonical) {
    permanentRedirect(`/compare/${res.canonicalSlug}`);
  }

  const { funds } = res;
  const names = funds.map((f) => f.name).join(' vs ');

  // Prefetch holdings server-side with 2s timeout guard so overlap renders in SSR
  const holdingsResults = await Promise.all(
    funds.map(async (f) => {
      const h = await fetchFundHoldingsSafe(f.code, f.name, 2000);
      return { id: 'mf-' + f.code, data: h };
    })
  );

  const initialHoldings = {};
  for (const item of holdingsResults) {
    if (item.data) initialHoldings[item.id] = item.data;
  }
  const initialMCapMap = getMarketCapCategories();

  const canonicalUrl = `https://mfcalc.getabundance.in/compare/${res.canonicalSlug}`;
  const jsonLd = buildComparisonJsonLd(funds, canonicalUrl);

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
        <Link href="/compare">Compare</Link>
        <span className="cmp-breadcrumbs-sep">/</span>
        <span className="cmp-breadcrumbs-current">{names}</span>
      </nav>

      <div className="cmp-top-nav-bar">
        <Link href="/compare" className="cmp-back-link">
          ← Comparison Hub
        </Link>
        <Link href="/screener" className="cmp-back-link">
          Open Full Screener ↗
        </Link>
      </div>

      <MFCompareView
        funds={funds.map((f) => ({ type: 'mf', ...f }))}
        allMfFunds={dataset.funds}
        isModal={false}
        initialHoldings={initialHoldings}
        initialMCapMap={initialMCapMap}
      />

      <Footer activePage="screener" />
    </div>
  );
}
