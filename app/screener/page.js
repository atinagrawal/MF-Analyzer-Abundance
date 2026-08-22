import { getPageMeta } from '@/lib/metadata';
import { CURATED_CATEGORIES, FAQ_ITEMS, slugToCategory } from './screenerContent';
import ScreenerClient from './ScreenerClient';

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams;
  const slug = sp?.category;
  const curated = slug ? CURATED_CATEGORIES.find((c) => c.slug === slug) : null;

  const baseMeta = curated
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

  // Inject FAQPage Schema for Google Search rich snippets
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.slice(0, 10).map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: f.a,
      },
    })),
  };

  return {
    ...baseMeta,
    other: {
      ...(baseMeta.other || {}),
      'script:ld+json': JSON.stringify(faqSchema),
    },
  };
}

export default async function ScreenerPage({ searchParams }) {
  const sp = await searchParams;
  const slug = sp?.category;
  const initialCategory = slug ? slugToCategory(slug) : null;
  return <ScreenerClient initialCategory={initialCategory} />;
}
