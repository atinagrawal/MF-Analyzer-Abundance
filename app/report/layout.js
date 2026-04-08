import { getPageMeta } from '@/lib/metadata';

export const metadata = getPageMeta('report');

export default function ReportLayout({ children }) {
  const webAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "India MF Industry Report Card",
    "url": "https://mfcalc.getabundance.in/report",
    "description": "Monthly India mutual fund industry report card — downloadable PNG image showing total AUM, equity/debt/hybrid/passive breakdown, top net inflows, category outflows. Data directly from AMFI for all 39 fund categories.",
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
      "Download as PNG",
      "Share to LinkedIn, WhatsApp, Twitter",
      "39 fund categories",
      "Historical data since 2014",
      "Sortable category breakdown table"
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
      { "@type": "ListItem", "position": 3, "name": "MF Industry Report Card", "item": "https://mfcalc.getabundance.in/report" }
    ]
  };

  return (
    <>
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
