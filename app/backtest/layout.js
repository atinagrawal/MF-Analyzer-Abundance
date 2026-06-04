import { getPageMeta } from '@/lib/metadata';

export const metadata = getPageMeta('backtest');

export default function BacktestLayout({ children }) {
  const webAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Mutual Fund & SIF Portfolio Backtester",
    "url": "https://mfcalc.getabundance.in/backtest",
    "description": "Build a hypothetical portfolio of mutual funds and SIFs and backtest SIP, lumpsum or combination strategies on real historical NAVs. Free tool by Abundance Financial Services® ARN-251838.",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "Any",
    "browserRequirements": "Requires JavaScript",
    "inLanguage": "en-IN",
    "dateModified": "2026-06-04",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "INR" },
    "featureList": [
      "Multi-fund portfolio construction (MF + SIF)",
      "SIP, lumpsum and lumpsum+SIP backtesting",
      "Money-weighted XIRR and absolute returns",
      "Common-period alignment across holdings",
      "Optional benchmark fund comparison",
      "Invested vs portfolio value chart"
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
      { "@type": "ListItem", "position": 3, "name": "Portfolio Backtester", "item": "https://mfcalc.getabundance.in/backtest" }
    ]
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      {children}
    </>
  );
}
