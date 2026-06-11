import { getPageMeta } from '@/lib/metadata';

export const metadata = getPageMeta('breadth');

export default function BreadthLayout({ children }) {
  const webApp = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Market Breadth Dashboard",
    "url": "https://mfcalc.getabundance.in/breadth",
    "description": "Market-breadth analytics for Indian equities — % of stocks above 20/50/100/150/200-day moving averages, advance-decline, new 52-week highs/lows and market regime. Computed daily on the BSE main-board equity universe.",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "Any",
    "inLanguage": "en-IN",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "INR" },
    "featureList": [
      "Stocks above 20/50/100/150/200-day moving averages",
      "Advance-decline and new 52-week highs/lows",
      "Market regime read from breadth",
      "Day / week / month comparisons with date time-travel"
    ],
    "provider": {
      "@type": "FinancialService",
      "name": "Abundance Financial Services",
      "url": "https://www.getabundance.in",
      "telephone": "+919808105923",
      "description": "AMFI Registered Mutual Fund & SIF Distributor (ARN-251838)"
    }
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.getabundance.in" },
      { "@type": "ListItem", "position": 2, "name": "MFCalc", "item": "https://mfcalc.getabundance.in" },
      { "@type": "ListItem", "position": 3, "name": "Market Breadth", "item": "https://mfcalc.getabundance.in/breadth" }
    ]
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webApp) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      {children}
    </>
  );
}
