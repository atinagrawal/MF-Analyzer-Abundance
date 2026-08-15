/**
 * app/portfolio/layout.js
 *
 * SEO: This page IS crawlable — logged-out users see a rich landing/gate
 * section (features, benefits, distributor info) which Google can index.
 * Personal portfolio data is never exposed to logged-out users.
 *
 * OG image: /api/og-portfolio (edge-rendered branded card)
 *
 * Structured data below follows the same pattern as app/cas-tracker/layout.js,
 * with deliberately distinct copy — this is the ongoing dashboard, CAS Tracker
 * is the upload/parsing tool. Positioning them as different tools instead of
 * paraphrasing each other's copy avoids duplicate-content dilution between
 * two closely related pages.
 */

import Script from 'next/script';
import { PORTFOLIO_FAQ } from './faqData';

export const metadata = {
  title: 'My Portfolio — Track Your Mutual Funds | Abundance Financial Services',
  description: 'Your personal mutual fund portfolio dashboard. Track holdings across all AMCs with live AMFI NAVs, FIFO capital gains, ELSS 3-year lock-in status, SIF holdings, family CAS support, and a FIFO redemption planner. Free for clients of Abundance Financial Services (ARN-251838).',
  keywords: 'mutual fund portfolio tracker India, live NAV portfolio, FIFO capital gains calculator, ELSS lock-in tracker, family CAS multi PAN, SIF holdings tracker, Abundance Financial Services, ARN-251838, CAMS KFintech portfolio',
  robots: {
    index:     true,    // allow indexing — logged-out users see the gate, not personal data
    follow:    true,
    noarchive: true,    // don't cache the page (personal auth state changes)
  },
  alternates: {
    canonical: 'https://mfcalc.getabundance.in/portfolio',
  },
  openGraph: {
    title: 'My Portfolio — Track Your Mutual Funds | Abundance',
    description: 'Free mutual fund portfolio tracker. Live AMFI NAVs, FIFO gains, ELSS lock-in, SIF holdings, and family CAS with multi-PAN support. By Abundance Financial Services, ARN-251838.',
    url: 'https://mfcalc.getabundance.in/portfolio',
    images: [{
      url:    'https://mfcalc.getabundance.in/api/og-portfolio',
      width:  1200,
      height: 630,
      alt:    'Abundance Portfolio Dashboard — Your Wealth, Beautifully Organised',
    }],
    siteName: 'Abundance MF Analyzer',
    type:     'website',
    locale:   'en_IN',
  },
  twitter: {
    card:        'summary_large_image',
    title:       'My Portfolio — Abundance MF Analyzer',
    description: 'Track your mutual fund portfolio with live NAVs, FIFO gains, ELSS lock-in, SIF holdings and family CAS multi-PAN support.',
    images:      ['https://mfcalc.getabundance.in/api/og-portfolio'],
  },
};

export default function PortfolioLayout({ children }) {
  const softwareSchema = {
    "@context": "https://schema.org",
    "@type": ["SoftwareApplication", "FinancialProduct"],
    "name": "Abundance Portfolio Dashboard",
    "alternateName": "My Portfolio",
    "url": "https://mfcalc.getabundance.in/portfolio",
    "description": "Personal mutual fund wealth dashboard — always-on view of holdings across all AMCs with live AMFI NAVs, FIFO capital gains, ELSS 3-year lock-in status, combined multi-PAN family view, SIF holdings, and a FIFO redemption planner.",
    "applicationCategory": "FinanceApplication",
    "applicationSubCategory": "Personal Wealth Dashboard",
    "operatingSystem": "Web Browser",
    "inLanguage": "en-IN",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "INR", "availability": "https://schema.org/InStock" },
    "featureList": [
      "Live AMFI NAV portfolio valuation",
      "Combined multi-PAN family portfolio view",
      "FIFO capital gains calculation",
      "ELSS 3-year lock-in tracking",
      "SIF (Specialised Investment Fund) holdings with live NAVs",
      "Manually-added holdings for investments not yet in a CAS",
      "FIFO redemption planner",
      "Cloud-saved portfolio — no re-upload needed on return visits",
      "PDF and Excel export"
    ],
    "provider": {
      "@type": "FinancialService",
      "name": "Abundance Financial Services",
      "url": "https://www.getabundance.in",
      "areaServed": "IN",
      "description": "AMFI Registered Mutual Fund Distributor — ARN-251838, Haldwani, Uttarakhand"
    },
    "screenshot": "https://mfcalc.getabundance.in/api/og-portfolio",
    "dateModified": "2026-08-15"
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.getabundance.in" },
      { "@type": "ListItem", "position": 2, "name": "MF Calculator", "item": "https://mfcalc.getabundance.in" },
      { "@type": "ListItem", "position": 3, "name": "My Portfolio", "item": "https://mfcalc.getabundance.in/portfolio" }
    ]
  };

  // Sourced from faqData.js -- the exact same list rendered as visible
  // content on the logged-out gate, so this can never drift out of sync
  // with what a crawler (or a user) actually sees.
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": PORTFOLIO_FAQ.map(({ q, a }) => ({
      "@type": "Question",
      "name": q,
      "acceptedAnswer": { "@type": "Answer", "text": a },
    })),
  };

  const howToSchema = {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "How to view your mutual fund portfolio dashboard",
    "description": "Sign in and see your full mutual fund portfolio with live NAVs, FIFO gains, and ELSS lock-in status — no re-upload needed after the first time.",
    "totalTime": "PT1M",
    "step": [
      { "@type": "HowToStep", "position": 1, "name": "Sign in to Abundance", "text": "Sign in via Google or email magic link." },
      { "@type": "HowToStep", "position": 2, "name": "Upload your CAS once (first-time only)", "text": "If you haven't already, upload your CAMS or KFintech CAS statement via CAS Tracker. It's saved to your account permanently." },
      { "@type": "HowToStep", "position": 3, "name": "Return to My Portfolio anytime", "text": "Your dashboard loads automatically with the latest AMFI NAVs — total wealth, top holdings, FIFO gains, and ELSS lock-in status, updated every visit." }
    ]
  };

  return (
    <>
      <Script id="portfolio-software-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }} />
      <Script id="portfolio-breadcrumb-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Script id="portfolio-faq-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <Script id="portfolio-howto-schema" type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToSchema) }} />
      {children}
    </>
  );
}
