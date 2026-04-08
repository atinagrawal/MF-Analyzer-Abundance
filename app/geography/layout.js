import { getPageMeta } from '@/lib/metadata';
import Script from 'next/script';

export const metadata = getPageMeta('geography');

export default function GeographyLayout({ children }) {
  const webAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "India MF Geography — State-wise AUM Map",
    "url": "https://mfcalc.getabundance.in/geography",
    "description": "Interactive choropleth map showing state-wise mutual fund AUM distribution across all 36 Indian states and union territories. Monthly AMFI data with equity penetration, state rankings, and history since 2014.",
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
      "Interactive India choropleth map with all 36 states/UTs",
      "State-wise AUM rankings",
      "Equity penetration by state",
      "Historical monthly data since March 2014",
      "State detail panel with full fund-type breakdown"
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
      { "@type": "ListItem", "position": 3, "name": "India MF Geography", "item": "https://mfcalc.getabundance.in/geography" }
    ]
  };

  const datasetSchema = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "name": "AMFI State-wise Mutual Fund AUM Data — India",
    "description": "Monthly state-wise mutual fund AUM data for all 36 Indian states and union territories from AMFI. Includes total AUM, equity, debt, balanced, ETF, and FoF breakdowns. Historical data from March 2014.",
    "url": "https://mfcalc.getabundance.in/geography",
    "creator": { "@type": "Organization", "name": "AMFI", "url": "https://www.amfiindia.com" },
    "publisher": { "@type": "Organization", "name": "Abundance Financial Services", "url": "https://www.getabundance.in" },
    "license": "https://www.amfiindia.com",
    "inLanguage": "en-IN",
    "isAccessibleForFree": true,
    "spatialCoverage": { "@type": "Place", "name": "India", "geo": { "@type": "GeoShape", "addressCountry": "IN" } },
    "temporalCoverage": "2014-03/..",
    "variableMeasured": ["Total AUM", "Equity AUM", "Debt AUM", "Balanced AUM", "ETF AUM", "FoF AUM"],
    "keywords": "state wise mutual fund AUM India, AMFI, equity penetration by state, Maharashtra, B30 states"
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "Which state has the highest mutual fund AUM in India?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Maharashtra has the highest mutual fund AUM in India by a wide margin, accounting for approximately 41% of the entire industry's ₹83 lakh crore AUM as of February 2026. This is largely driven by Mumbai's dominance as India's financial capital, with large institutional investors and corporate treasuries concentrated there."
        }
      },
      {
        "@type": "Question",
        "name": "What percentage of India's mutual fund AUM is held by the top 5 states?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "The top 5 states — Maharashtra, Delhi, Karnataka, Gujarat, and West Bengal — together account for approximately 67-68% of India's total mutual fund industry AUM. This high concentration reflects where India's financial activity and high-net-worth investor base is centered."
        }
      }
    ]
  };

  return (
    <>
      <Script id="webapp-schema" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }} />
      <Script id="breadcrumb-schema" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <Script id="dataset-schema" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datasetSchema) }} />
      <Script id="faq-schema" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      <Script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js" strategy="beforeInteractive" />
      {children}
    </>
  );
}
