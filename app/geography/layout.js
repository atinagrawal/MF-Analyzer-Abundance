import { getPageMeta } from '@/lib/metadata';
import Script from 'next/script';

export const metadata = getPageMeta('geography');

const BUILD_DATE = new Date().toISOString().slice(0, 10);

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
    "dateModified": BUILD_DATE,
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
      "@type": "Organization",
      "name": "Abundance Financial Services",
      "url": "https://www.getabundance.in",
      "telephone": "+919808105923",
      "identifier": "ARN-251838",
      "sameAs": [
        "https://twitter.com/abundancefinsvs",
        "https://www.linkedin.com/company/abundance-financial-services",
        "https://www.instagram.com/abundancefinancialservices"
      ]
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
    "creator": {
      "@type": "Organization",
      "name": "Association of Mutual Funds in India (AMFI)",
      "url": "https://www.amfiindia.com"
    },
    "publisher": {
      "@type": "Organization",
      "name": "Abundance Financial Services",
      "url": "https://www.getabundance.in",
      "logo": {
        "@type": "ImageObject",
        "url": "https://mfcalc.getabundance.in/og-mfcalc.png"
      },
      "sameAs": [
        "https://twitter.com/abundancefinsvs",
        "https://www.linkedin.com/company/abundance-financial-services"
      ]
    },
    "license": "https://www.amfiindia.com",
    "inLanguage": "en-IN",
    "isAccessibleForFree": true,
    "spatialCoverage": { "@type": "Place", "name": "India", "geo": { "@type": "GeoShape", "addressCountry": "IN" } },
    "temporalCoverage": "2014-03/..",
    "variableMeasured": ["Total AUM", "Equity AUM", "Debt AUM", "Balanced AUM", "ETF AUM", "FoF AUM"],
    "keywords": "state wise mutual fund AUM India, AMFI, equity penetration by state, Maharashtra, B30 states, mutual fund geography",
    "about": [
      {
        "@type": "Thing",
        "name": "Mutual funds in India",
        "sameAs": "https://en.wikipedia.org/wiki/Mutual_funds_in_India"
      },
      {
        "@type": "Thing",
        "name": "States and union territories of India",
        "sameAs": "https://en.wikipedia.org/wiki/States_and_union_territories_of_India"
      },
      {
        "@type": "Thing",
        "name": "Economy of India",
        "sameAs": "https://en.wikipedia.org/wiki/Economy_of_India"
      }
    ],
    "mentions": [
      {
        "@type": "Organization",
        "name": "Securities and Exchange Board of India",
        "sameAs": "https://en.wikipedia.org/wiki/Securities_and_Exchange_Board_of_India"
      },
      {
        "@type": "Organization",
        "name": "Association of Mutual Funds in India",
        "sameAs": "https://www.amfiindia.com"
      }
    ]
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
          "text": "Maharashtra has the highest mutual fund AUM in India by a wide margin, accounting for approximately 41% of the entire industry's ₹83+ lakh crore AUM as of 2026. This is driven by Mumbai's role as India's financial hub, housing major corporate treasuries, family offices, and institutional capital."
        }
      },
      {
        "@type": "Question",
        "name": "What percentage of India's mutual fund AUM is held by the top 5 states?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "The top 5 states — Maharashtra, New Delhi, Gujarat, Karnataka, and West Bengal — collectively account for approximately 68% to 70% of India's total mutual fund assets under management."
        }
      },
      {
        "@type": "Question",
        "name": "Which Indian state has the highest retail equity allocation ratio?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "While Maharashtra dominates in absolute total AUM due to corporate debt and institutional money market holdings, states like Gujarat, West Bengal, and Uttar Pradesh display significantly higher equity allocations (often exceeding 60-70% of their total state AUM in pure equity schemes), reflecting deep retail equity investor participation."
        }
      },
      {
        "@type": "Question",
        "name": "What are T30 and B30 locations in Indian mutual funds?",
        "acceptedAnswer": {
          "@type": "Answer",
          "text": "Under SEBI guidelines, AMFI classifies geographic inflows into Top 30 (T30) cities and Beyond 30 (B30) cities to incentivize fund houses to expand mutual fund penetration into Tier-2, Tier-3, and rural India. B30 locations represent the fastest-growing frontier for retail SIP adoption."
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
