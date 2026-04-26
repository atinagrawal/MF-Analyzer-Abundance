/**
 * app/sifs/page.js — SIF Screener (Server Component)
 *
 * Handles SEO metadata and JSON-LD schema.
 * All interactive logic lives in SifScreener.jsx (Client Component).
 */
import Script from 'next/script';
import SifScreener from './SifScreener';

export const metadata = {
  title: 'SIF Screener — Specialised Investment Funds | Abundance MF Analyzer',
  description: 'Explore all 57 SEBI-regulated Specialised Investment Funds (SIFs) with live daily NAVs from AMFI. Filter by strategy, type, and fund house. Equity Long-Short, Hybrid Long-Short, and Active Asset Allocator strategies. Abundance Financial Services, ARN-251838.',
  keywords: 'Specialised Investment Funds India, SIF NAV, SIF screener, equity long-short fund, hybrid long-short fund, SEBI SIF, AMFI SIF NAV, active asset allocator fund, SIF vs mutual fund, Abundance ARN-251838',
  alternates: { canonical: 'https://mfcalc.getabundance.in/sifs' },
  openGraph: {
    title: 'SIF Screener — Live NAVs for All Specialised Investment Funds',
    description: 'Track all AMFI-registered Specialised Investment Funds with daily NAVs, strategy filters, and fund-house search. Free tool by Abundance Financial Services.',
    url: 'https://mfcalc.getabundance.in/sifs',
    type: 'website',
    siteName: 'Abundance MF Analyzer',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SIF Screener — Live NAVs | Abundance MF Analyzer',
    description: 'All 57 Specialised Investment Funds with live AMFI NAVs. Filter by strategy and type.',
  },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebPage',
  name: 'SIF Screener — Specialised Investment Funds',
  url: 'https://mfcalc.getabundance.in/sifs',
  description: 'Live NAV screener for all SEBI-regulated Specialised Investment Funds (SIFs) listed on AMFI.',
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

export default function SifsPage() {
  return (
    <>
      <Script
        id="sif-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SifScreener />
    </>
  );
}
