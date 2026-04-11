import { getPageMeta } from '@/lib/metadata';
import Script from 'next/script';

export const metadata = getPageMeta('industry');

export default function IndustryLayout({ children }) {
  const webAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "India MF Industry Pulse",
    "url": "https://mfcalc.getabundance.in/industry",
    "description": "Real-time mutual fund industry trends across 39 fund categories. Track monthly net flows, category growth, top performers. AMFI official data updated monthly.",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "Any",
    "browserRequirements": "Requires JavaScript",
    "inLanguage": "en-IN",
    "dateModified": "2026-04-08",
    "offers": {
      "@type": "Offer",
      "price": "0",
      "priceCurrency": "INR"
    },
    "featureList": [
      "39 fund categories with monthly data",
      "Net flow trends and category rankings",
      "Historical data since 2014",
      "Sortable and filterable tables",
      "12-month industry trends with heatmap"
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
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.getabundance.in" },
      { "@type": "ListItem", "position": 2, "name": "MF Calculator", "item": "https://mfcalc.getabundance.in" },
      { "@type": "ListItem", "position": 3, "name": "MF Industry Pulse", "item": "https://mfcalc.getabundance.in/industry" }
    ]
  };

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"
        strategy="beforeInteractive"
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {children}
    </>
  );
}

