import { getPageMeta } from '@/lib/metadata';
import { FAQ_ITEMS, GLOSSARY_ITEMS } from './screenerContent';

export const metadata = getPageMeta('screener');

export default function ScreenerLayout({ children }) {
  const webAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Mutual Fund Screener",
    "url": "https://mfcalc.getabundance.in/screener",
    "description": "Screen 2,500+ mutual funds in India by category, 1/3/5-year returns, volatility and drawdown on real AMFI NAVs. Free tool by Abundance Financial Services® ARN-251838.",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "Any",
    "browserRequirements": "Requires JavaScript",
    "inLanguage": "en-IN",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "INR" },
    "featureList": [
      "Filter by SEBI category, returns and risk",
      "1/3/5-year CAGR on real NAVs",
      "Annualised volatility and max drawdown",
      "Return-per-unit-of-risk ranking",
      "Filter by category and returns"
    ],
    "provider": {
      "@type": "FinancialService",
      "name": "Abundance Financial Services",
      "url": "https://www.getabundance.in",
      "telephone": "+919808105923",
      "description": "AMFI Registered Mutual Fund & SIF Distributor (ARN-251838)"
    }
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": [
      { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.getabundance.in" },
      { "@type": "ListItem", "position": 2, "name": "MFCalc", "item": "https://mfcalc.getabundance.in" },
      { "@type": "ListItem", "position": 3, "name": "Mutual Fund Screener", "item": "https://mfcalc.getabundance.in/screener" }
    ]
  };
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [...FAQ_ITEMS, ...GLOSSARY_ITEMS].map(({ q, a }) => ({ "@type": "Question", "name": q, "acceptedAnswer": { "@type": "Answer", "text": a } }))
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webAppSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
      {children}
    </>
  );
}
