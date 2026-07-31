import { getPageMeta } from '@/lib/metadata';
import { CURATED_CATEGORIES, slugToCategory } from './screenerContent';
import ScreenerClient from './ScreenerClient';

export async function generateMetadata({ searchParams }) {
  const sp = await searchParams;
  const slug = sp?.category;
  const curated = slug ? CURATED_CATEGORIES.find((c) => c.slug === slug) : null;
  if (!curated) return getPageMeta('screener');
  return getPageMeta('screener', {
    title: `Best ${curated.label} Mutual Funds in India — Compare Returns & Risk | Abundance`,
    description: `Compare ${curated.label} mutual funds in India by 1/3/5-year returns, volatility and drawdown on real AMFI NAVs. ${curated.metaBlurb} Free tool by Abundance Financial Services.`,
    canonicalPath: `/screener?category=${curated.slug}`,
  });
}

export default async function ScreenerPage({ searchParams }) {
  const sp = await searchParams;
  const slug = sp?.category;
  const initialCategory = slug ? slugToCategory(slug) : null;
  return <ScreenerClient initialCategory={initialCategory} />;
}
