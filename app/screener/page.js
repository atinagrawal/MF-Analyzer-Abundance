import { getPageMeta } from '@/lib/metadata';
import { CURATED_CATEGORIES, slugToCategory, matchCategory } from './screenerContent';
import ScreenerClient from './ScreenerClient';
import { getScreenerDataset } from '@/lib/screenerData';

// Note: ScreenerPage reads searchParams, so Next.js renders it dynamically per-request (ƒ).
// Database overhead is eliminated by getScreenerDataset()'s 1-hour in-process memory cache.
export const revalidate = 21600;

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams;
  const slug = sp?.category;
  const curated = slug ? CURATED_CATEGORIES.find((c) => c.slug === slug) : null;

  return curated
    ? getPageMeta('screener', {
        title: `Best ${curated.label} Mutual Funds in India — Compare Returns vs Benchmark | Abundance`,
        description: `Compare ${curated.label} mutual funds in India by 1M to 10Y returns, benchmark performance, volatility, and SEBI stress tests on real AMFI NAVs. ${curated.metaBlurb} Free tool by Abundance Financial Services.`,
        canonicalPath: `/screener?category=${curated.slug}`,
      })
    : getPageMeta('screener', {
        title: 'Mutual Fund Screener & Performance Comparator — 1,700+ Schemes vs Benchmarks | Abundance',
        description: 'Screen and compare 1,700+ Indian mutual funds by 1M to 10-year returns, category benchmarks (BSE 500, BSE 100), volatility, SEBI stress test liquidity, and portfolio holdings. AMFI Registered Distributor ARN-251838.',
        canonicalPath: '/screener',
      });
}

export default async function ScreenerPage({ searchParams }) {
  const sp = await searchParams;
  const slug = sp?.category;
  const initialCategory = slug ? slugToCategory(slug) : null;

  let initialData = null;
  try {
    initialData = await getScreenerDataset();
  } catch (err) {
    console.error('[ScreenerPage] Failed to fetch screener data for SSR:', err);
  }

  // Pre-filter top funds for the initial category to generate ItemList schema
  const curated = slug ? CURATED_CATEGORIES.find((c) => c.slug === slug) : null;
  const targetCat = curated ? curated.category : (initialCategory || 'Equity Scheme - Flexi Cap Fund');
  const topFunds = (initialData?.funds || [])
    .filter((f) => /open/i.test(f.structure || ''))
    .filter((f) => matchCategory(f.category, targetCat))
    .slice(0, 10);

  const itemListSchema = topFunds.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: curated ? `Best ${curated.label} Mutual Funds in India` : 'Best Mutual Funds in India',
    numberOfItems: topFunds.length,
    itemListElement: topFunds.map((f, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: f.name,
      url: `https://mfcalc.getabundance.in/fund/${f.code}`,
    })),
  } : null;

  return (
    <>
      {itemListSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
        />
      )}
      <ScreenerClient initialCategory={initialCategory} initialData={initialData} />
    </>
  );
}
