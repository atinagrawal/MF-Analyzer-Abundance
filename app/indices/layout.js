import { getPageMeta } from '@/lib/metadata';
import Script from 'next/script';

export const metadata = getPageMeta('indices');

export default function IndicesLayout({ children }) {
  const webAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "NSE Index Dashboard",
    "url": "https://mfcalc.getabundance.in/indices",
    "description": "Monthly NSE Index Dashboard showing 100+ indices with 1M, 3M, 1Y, 3Y, 5Y TRI returns, P/E, P/B, Beta and Dividend Yield. Data from NSE Indices Limited.",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "Any",
    "browserRequirements": "Requires JavaScript",
    "inLanguage": "en-IN",
    "dateModified": "2026-04-07",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "INR"
    },
    "featureList": [
      "100+ NSE indices",
      "1M 3M 1Y 3Y 5Y TRI returns",
      "P/E P/B Dividend Yield",
      "Beta Volatility Correlation",
      "Sortable by any column",
      "Filter by category",
      "Link to Rolling Returns benchmark"
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
        "name": "MF Calculator",
        "item": "https://mfcalc.getabundance.in"
      },
      {
        "@type": "ListItem",
        "position": 3,
        "name": "NSE Index Dashboard",
        "item": "https://mfcalc.getabundance.in/indices"
      }
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
        id="breadcrumb-schema"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {children}
    </>
  );
}
