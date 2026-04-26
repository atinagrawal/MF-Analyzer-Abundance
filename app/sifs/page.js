/**
 * app/sifs/page.js — SIF Screener (Server Component)
 *
 * Full SEO: metadata, JSON-LD (WebPage + FAQPage + BreadcrumbList + ItemList),
 * server-side data fetch with 4h revalidate.
 */

import Script from 'next/script';
import SifScreener from './SifScreener';

export const revalidate = 14400; // 4 hours — matches sif-nav Blob TTL

export const metadata = {
  title: 'SIF Screener — Specialised Investment Funds India | Live NAV & Performance',
  description: 'Free screener for all SEBI-regulated Specialised Investment Funds (SIFs) with live AMFI NAVs. Equity Long-Short, Hybrid Long-Short & Active Asset Allocator strategies. Filter by fund house, compare performance, track your watchlist. By Abundance Financial Services, ARN-251838.',
  keywords: 'Specialised Investment Funds India, SIF NAV screener, SIF SEBI, equity long-short fund India, hybrid long-short fund, active asset allocator fund, AMFI SIF NAV, iSIF qsif Altiva Apex Arudha Magnum Diviniti Titanium DynaSIF, SIF vs mutual fund, SIF minimum investment 10 lakh, Abundance ARN-251838',
  robots: { index: true, follow: true },
  alternates: { canonical: 'https://mfcalc.getabundance.in/sifs' },
  openGraph: {
    title: 'SIF Screener — Live NAVs for All Specialised Investment Funds | Abundance',
    description: 'Track all SEBI-regulated SIFs with live AMFI NAVs, strategy filters, and performance data. Free tool — no login required.',
    url: 'https://mfcalc.getabundance.in/sifs',
    type: 'website',
    siteName: 'Abundance MF Analyzer',
    locale: 'en_IN',
    images: [{
      url: 'https://mfcalc.getabundance.in/api/og-sif',
      width: 1200, height: 630,
      alt: 'SIF Screener — Specialised Investment Funds with Live NAVs | Abundance',
    }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SIF Screener — Live NAVs | Abundance',
    description: 'All SEBI-regulated SIFs with live AMFI NAVs. Free screener by Abundance Financial Services, ARN-251838.',
    images: ['https://mfcalc.getabundance.in/api/og-sif'],
  },
};

async function getSifData() {
  try {
    const res = await fetch('https://mfcalc.getabundance.in/api/sif-nav', {
      next: { revalidate: 14400 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

function buildJsonLd(data) {
  const schemes   = data?.schemes ?? [];
  const count     = schemes.length;
  const navDate   = data?.nav_date ?? '';

  // ── 1. WebPage ─────────────────────────────────────────────────────────────
  const webPage = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'SIF Screener — Specialised Investment Funds India',
    url: 'https://mfcalc.getabundance.in/sifs',
    description: 'Live NAV screener for all SEBI-regulated Specialised Investment Funds (SIFs) with strategy filters and performance data.',
    inLanguage: 'en-IN',
    dateModified: navDate ? new Date(navDate.split('-').reverse().join('-')).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    publisher: {
      '@type': 'FinancialService',
      name: 'Abundance Financial Services',
      url: 'https://www.getabundance.in',
      areaServed: 'IN',
      description: 'AMFI Registered Mutual Fund and SIF Distributor — ARN-251838',
    },
    mainEntity: {
      '@type': 'FinancialProduct',
      name: 'Specialised Investment Fund (SIF)',
      description: `SEBI-regulated investment product with minimum investment of ₹10 lakh. Includes ${count} schemes across Equity Long-Short, Hybrid Long-Short, and Active Asset Allocator strategies.`,
      category: 'Alternative Investment',
      additionalProperty: [
        { '@type': 'PropertyValue', name: 'Minimum Investment', value: '₹10,00,000' },
        { '@type': 'PropertyValue', name: 'Regulator', value: 'SEBI' },
        { '@type': 'PropertyValue', name: 'NAV Source', value: 'AMFI India' },
      ],
    },
  };

  // ── 2. BreadcrumbList ─────────────────────────────────────────────────────
  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem', position: 1,
        name: 'Home',
        item: 'https://mfcalc.getabundance.in',
      },
      {
        '@type': 'ListItem', position: 2,
        name: 'SIF Screener',
        item: 'https://mfcalc.getabundance.in/sifs',
      },
    ],
  };

  // ── 3. ItemList of all SIF schemes (crawlable fund index) ─────────────────
  const itemList = schemes.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Specialised Investment Funds — All Schemes',
    description: `Complete list of ${count} SEBI-regulated SIF schemes with live NAVs as of ${navDate}`,
    numberOfItems: count,
    itemListElement: schemes.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'FinancialProduct',
        name: s.nav_name,
        description: `${s.sif_name} — ${s.category.split(' - ').pop()} — NAV ₹${s.nav} as of ${navDate}`,
        identifier: s.scheme_id,
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'ISIN', value: s.isin_po },
          { '@type': 'PropertyValue', name: 'NAV', value: `₹${s.nav}` },
          { '@type': 'PropertyValue', name: 'Type', value: s.type },
        ],
      },
    })),
  } : null;

  // ── 4. FAQPage ───────────────────────────────────────────────────────────
  const faq = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is a Specialised Investment Fund (SIF)?',
        acceptedAnswer: { '@type': 'Answer', text: 'A Specialised Investment Fund (SIF) is a new SEBI-regulated investment category launched in 2024, designed for sophisticated investors. SIFs can use long-short strategies, derivatives, and alternative approaches unavailable in standard mutual funds. The minimum investment is ₹10 lakh.' },
      },
      {
        '@type': 'Question',
        name: 'What is the minimum investment for a SIF?',
        acceptedAnswer: { '@type': 'Answer', text: 'The minimum investment in a Specialised Investment Fund (SIF) is ₹10,00,000 (Ten Lakh Rupees), making it suitable for High Net Worth Individuals (HNIs) and accredited investors.' },
      },
      {
        '@type': 'Question',
        name: 'What are the different types of SIF strategies?',
        acceptedAnswer: { '@type': 'Answer', text: 'SIFs currently offer four SEBI-approved strategies: Equity Long-Short Fund, Equity Ex-Top 100 Long-Short Fund, Hybrid Long-Short Fund, and Active Asset Allocator Long-Short Fund. Each strategy has different risk-return profiles and can use long and short positions.' },
      },
      {
        '@type': 'Question',
        name: 'How are SIF NAVs different from mutual fund NAVs?',
        acceptedAnswer: { '@type': 'Answer', text: 'SIF NAVs are published daily by AMFI, the same as mutual funds. However, SIF NAVs are not listed in the standard AMFI NAV file (NAVAll.txt) — they are published through a dedicated SIF NAV endpoint. Starting NAVs are typically ₹10 per unit.' },
      },
      {
        '@type': 'Question',
        name: 'Which AMCs offer Specialised Investment Funds?',
        acceptedAnswer: { '@type': 'Answer', text: `As of ${navDate}, the following fund houses offer SIFs in India: ${[...new Set(schemes.map(s => s.sif_name))].join(', ')}. New SIF launches are expected as SEBI has approved the framework for all registered mutual fund houses.` },
      },
      {
        '@type': 'Question',
        name: 'Is SIF better than a PMS or AIF?',
        acceptedAnswer: { '@type': 'Answer', text: 'SIFs occupy a middle ground between mutual funds and Portfolio Management Services (PMS). Like mutual funds, SIFs have daily NAVs, SEBI regulation, and AMFI listing. Unlike PMS (minimum ₹50 lakh), SIFs start at ₹10 lakh. Unlike Category III AIFs, SIFs are regulated by the mutual fund framework, offering more investor protection.' },
      },
    ],
  };

  return [webPage, breadcrumb, itemList, faq].filter(Boolean);
}

export default async function SifsPage() {
  const initialData = await getSifData();
  const schemas     = buildJsonLd(initialData);

  return (
    <>
      {schemas.map((schema, i) => (
        <Script
          key={`sif-schema-${i}`}
          id={`sif-schema-${i}`}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <SifScreener initialData={initialData} />
    </>
  );
}
