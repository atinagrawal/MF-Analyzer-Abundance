/**
 * app/sifs/page.js — SIF Screener Server Component
 *
 * Fetches latest SIF data server-side so:
 * 1. Search crawlers see real scheme data immediately (SEO)
 * 2. Page renders with data on first load (no loading flash)
 * 3. Next.js revalidate keeps data fresh every 4 hours
 */
import Script from 'next/script';
import SifScreener from './SifScreener';

export const revalidate = 14400; // 4 hours — matches Blob TTL

export const metadata = {
  title: 'SIF Screener — Specialised Investment Funds Live NAV | Abundance',
  description: 'Explore all SEBI-regulated Specialised Investment Funds (SIFs) with live daily NAVs from AMFI. Filter by strategy and type. Track Equity Long-Short, Hybrid Long-Short, and Active Asset Allocator strategies. Free tool by Abundance Financial Services, ARN-251838.',
  keywords: 'Specialised Investment Funds India, SIF NAV, SIF screener, equity long-short fund, hybrid long-short fund, SEBI SIF, AMFI SIF NAV, active asset allocator fund, SIF vs mutual fund, Abundance ARN-251838',
  alternates: { canonical: 'https://mfcalc.getabundance.in/sifs' },
  openGraph: {
    title: 'SIF Screener — Live NAVs for All Specialised Investment Funds',
    description: 'Track all AMFI-registered Specialised Investment Funds with daily NAVs, strategy filters, and performance data. Free tool by Abundance Financial Services.',
    url: 'https://mfcalc.getabundance.in/sifs',
    type: 'website',
    siteName: 'Abundance MF Analyzer',
    images: [{
      url:    'https://mfcalc.getabundance.in/api/og-sif',
      width:  1200,
      height: 630,
      alt:    'SIF Screener — Specialised Investment Funds | Abundance',
    }],
  },
  twitter: {
    card:        'summary_large_image',
    title:       'SIF Screener — Live NAVs | Abundance MF Analyzer',
    description: 'All Specialised Investment Funds with live AMFI NAVs and performance data.',
    images:      ['https://mfcalc.getabundance.in/api/og-sif'],
  },
};

async function getSifData() {
  try {
    // Server-side fetch — Next.js caches per revalidate above
    const res = await fetch('https://mfcalc.getabundance.in/api/sif-nav', {
      next: { revalidate: 14400 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'SIF Screener — Specialised Investment Funds',
  url: 'https://mfcalc.getabundance.in/sifs',
  description: 'Live NAV screener for all SEBI-regulated Specialised Investment Funds (SIFs) listed on AMFI, with performance data and strategy filters.',
  mainEntity: {
    '@type': 'FinancialProduct',
    name: 'Specialised Investment Fund (SIF)',
    description: 'SEBI-regulated investment product with minimum investment of ₹10 lakh. Includes Equity Long-Short, Hybrid Long-Short, and Active Asset Allocator strategies.',
    provider: {
      '@type': 'FinancialService',
      name: 'Abundance Financial Services',
      url: 'https://www.getabundance.in',
      areaServed: 'IN',
      description: 'AMFI Registered Mutual Fund Distributor — ARN-251838, Haldwani, Uttarakhand',
    },
  },
};

export default async function SifsPage() {
  const initialData = await getSifData();

  return (
    <>
      <Script
        id="sif-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SifScreener initialData={initialData} />
    </>
  );
}
