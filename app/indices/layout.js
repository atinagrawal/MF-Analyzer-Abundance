import { getPageMeta } from '@/lib/metadata';
import Script from 'next/script';
import { INDICES_FAQ } from './faqData';

export const metadata = getPageMeta('indices', {
  other: {
    'link:alternate': 'https://mfcalc.getabundance.in/indices?format=md',
  },
});

export default function IndicesLayout({ children }) {
  const webAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Indian Stock Market Index Dashboard (NSE & BSE)",
    "url": "https://mfcalc.getabundance.in/indices",
    "description": "Live performance, Total Return Index (TRI) CAGRs, P/E & P/B valuation gauges, Beta, and Volatility across 270+ Indian equity, debt, and hybrid indices.",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "Any",
    "browserRequirements": "Requires JavaScript for interactive filtering",
    "inLanguage": "en-IN",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "INR"
    },
    "featureList": [
      "270+ Indian Market Indices across NSE & BSE",
      "1M, 3M, 1Y, 3Y, 5Y Total Return Index (TRI) returns",
      "Live P/E and P/B valuation gauges with historical fair-value bands",
      "Dividend Yield, Annualised Volatility, and Beta",
      "Category filters: Broad Market, Sectoral, Factor / Smart-Beta, Thematic, and Hybrid",
      "Seamless deep-linking to Rolling Returns Analyser (/rolling?bench=...)",
      "Pro CSV Export and Shareable Deep Links"
    ],
    "provider": {
      "@type": "FinancialService",
      "name": "Abundance Financial Services",
      "url": "https://www.getabundance.in",
      "telephone": "+919808105923",
      "identifier": "ARN-251838"
    },
    "isPartOf": {
      "@type": "WebSite",
      "name": "Abundance MF Calculator",
      "url": "https://mfcalc.getabundance.in"
    }
  };

  const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "name": "Indian Stock Market Index Returns & Valuation Dataset (NSE & BSE)",
    "description": "Comprehensive performance, Total Return Index (TRI) CAGRs, valuation multiples (P/E, P/B, Dividend Yield), Beta, and Volatility across 270+ Indian equity, debt, and hybrid indices from NSE Indices Limited and BSE Ltd.",
    "url": "https://mfcalc.getabundance.in/indices",
    "keywords": [
      "Indian stock market indices",
      "Nifty 50 PE ratio",
      "BSE Sensex PE ratio",
      "Total Return Index TRI",
      "NSE index dashboard",
      "Mutual fund benchmark comparison",
      "Nifty Midcap 150 returns"
    ],
    "creator": {
      "@type": "FinancialService",
      "name": "Abundance Financial Services",
      "url": "https://www.getabundance.in",
      "identifier": "ARN-251838"
    },
    "distribution": [
      {
        "@type": "DataDownload",
        "encodingFormat": "text/markdown",
        "contentUrl": "https://mfcalc.getabundance.in/indices?format=md"
      },
      {
        "@type": "DataDownload",
        "encodingFormat": "application/json",
        "contentUrl": "https://mfcalc.getabundance.in/api/indices"
      }
    ],
    "spatialCoverage": "IN"
  };

  const faqPageSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": INDICES_FAQ.map(({ q, a }) => ({
      "@type": "Question",
      "name": q,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": a,
      },
    })),
  };

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      {
        "@type": "ListItem",
        "position": 1,
        "name": "Home",
        "item": "https://www.getabundance.in"
      },
      {
        "@type": "ListItem",
        "position": 2,
        "name": "Tools",
        "item": "https://mfcalc.getabundance.in"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": "Index Dashboard",
        "item": "https://mfcalc.getabundance.in/indices"
      }
    ]
  };

  const itemListSchema = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "Core Indian Market Benchmark Indices",
    "description": "Primary equity benchmarks for Indian mutual fund performance comparison and macroeconomic valuation.",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Nifty 50", "url": "https://mfcalc.getabundance.in/rolling?bench=NIFTY%2050" },
      { "@type": "ListItem", "position": 2, "name": "S&P BSE SENSEX", "url": "https://mfcalc.getabundance.in/rolling?bench=S%26P%20BSE%20SENSEX" },
      { "@type": "ListItem", "position": 3, "name": "Nifty Next 50", "url": "https://mfcalc.getabundance.in/rolling?bench=Nifty%20Next%2050" },
      { "@type": "ListItem", "position": 4, "name": "Nifty Midcap 150", "url": "https://mfcalc.getabundance.in/rolling?bench=Nifty%20Midcap%20150" },
      { "@type": "ListItem", "position": 5, "name": "Nifty Smallcap 250", "url": "https://mfcalc.getabundance.in/rolling?bench=Nifty%20Smallcap%20250" },
      { "@type": "ListItem", "position": 6, "name": "BSE 500", "url": "https://mfcalc.getabundance.in/rolling?bench=BSE%20500" }
    ]
  };

  return (
    <>
      <Script
        id="webapp-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }}
      />
      <Script
        id="dataset-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema) }}
      />
      <Script
        id="faq-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageSchema) }}
      />
      <Script
        id="breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <Script
        id="itemlist-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListSchema) }}
      />
      {children}
    </>
  );
}

