import { getPageMeta } from '@/lib/metadata';

export const metadata = getPageMeta('screener');

export default function ScreenerLayout({ children }) {
  const webAppSchema = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Mutual Fund Screener",
    "url": "https://mfcalc.getabundance.in/screener",
    "description": "Screen 2,500+ regular mutual funds in India by category, 1/3/5-year returns, volatility and drawdown on real AMFI NAVs. Free tool by Abundance Financial Services® ARN-251838.",
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
      "Regular plans only (Direct hidden)"
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
  const faqs = [
    ["How are the returns calculated?", "Returns are point-to-point CAGR computed from real AMFI NAVs: the latest NAV versus the NAV one, three and five years earlier. For periods shorter than a fund's age, the figure is left blank rather than estimated."],
    ["How current is the data?", "The dataset is rebuilt every day from AMFI's official NAV files, so returns and risk metrics reflect the most recent published NAVs."],
    ["What do volatility and max drawdown mean?", "Volatility is the annualised standard deviation of monthly returns — how bumpy the ride was. Max drawdown is the largest peak-to-trough fall. Both are computed on a month-end basis over the available history."],
    ["Why only Regular plans, not Direct?", "Abundance Financial Services is an AMFI-registered mutual fund distributor (ARN-251838), so the screener shows Regular plans, which is what its clients invest in. Direct plans are intentionally hidden."],
    ["Is this investment advice?", "No. The screener is an educational data tool. Past performance is not indicative of future results, and nothing here is a recommendation to buy or sell any scheme. Please consult your financial advisor before investing."]
  ];
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(([q, a]) => ({ "@type": "Question", "name": q, "acceptedAnswer": { "@type": "Answer", "text": a } }))
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
