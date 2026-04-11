import { getPageMeta } from '@/lib/metadata';
import Script from 'next/script';

export const metadata = getPageMeta('rolling');

export default function RollingLayout({ children }) {
  const webAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Mutual Fund Rolling Returns Calculator",
    "url": "https://mfcalc.getabundance.in/rolling",
    "description": "Calculate rolling returns for any Indian mutual fund with interactive charts. Compare with index benchmarks, view return distribution, analyze consistency. Free tool by Abundance Financial Services® ARN-251838.",
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
      "Interactive rolling returns charts",
      "Index benchmark comparison",
      "Return distribution histogram",
      "1Y, 3Y, 5Y rolling windows",
      "Hit ratio and alpha analysis"
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
      { "@type": "ListItem", "position": 3, "name": "Rolling Returns", "item": "https://mfcalc.getabundance.in/rolling" }
    ]
  };

  return (
    <>
      <Script
        src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"
        strategy="beforeInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3/dist/chartjs-adapter-date-fns.bundle.min.js"
        strategy="beforeInteractive"
      />
      <Script
        src="https://cdn.jsdelivr.net/npm/chartjs-plugin-annotation@3/dist/chartjs-plugin-annotation.min.js"
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
