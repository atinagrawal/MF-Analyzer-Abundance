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

  // Mirrors the on-page FAQ (app/backtest/page.js FAQ_ITEMS) for rich-result eligibility.
  const faqs = [
    ["What does this portfolio backtester do?", "It lets you build a hypothetical basket of mutual funds and SIFs, then replays it through real historical NAVs to show how a SIP, a lumpsum, or a combination would have performed. Each holding can have its own strategy, amount and start date."],
    ["How is the return calculated — what is XIRR?", "Because SIPs and combinations involve many cash-flows on different dates, the headline annualised figure is XIRR (the money-weighted internal rate of return). For a single lumpsum, XIRR equals the simple point-to-point CAGR. Absolute return is the total gain over the total amount invested."],
    ["Where does the NAV data come from?", "Daily NAV history is sourced from AMFI via mfapi.in for mutual funds, and from the AMFI SIF feed for Specialised Investment Funds. Each instalment is executed at the next available trading-day NAV."],
    ["Can I backtest SIFs (Specialised Investment Funds)?", "Yes. SIFs are a newer SEBI category, so most have only a few months of live NAV history — backtests will automatically cover only the period since each SIF launched."],
    ["Why does some history start later than I chose?", "A backtest can only use the data that exists. If a fund launched after your chosen start date, that holding begins at its inception. For funds that changed hands (e.g. JPMorgan schemes that became Edelweiss in 2016), pre-merger NAVs can be return-linked so the track record extends back to the original launch."],
    ["What costs are included?", "The illustration uses scheme NAVs, which are already net of the expense ratio. It does not deduct exit loads, STT, stamp duty, or capital-gains tax, and it does not model expense-ratio changes over time. Treat the figures as indicative."],
    ["Why are only Regular plans shown, not Direct?", "Abundance Financial Services is an AMFI-registered mutual fund distributor (ARN-251838), so the tool surfaces Regular plans, which is what its clients invest in. Direct plans are intentionally hidden."],
    ["Is this investment advice?", "No. This is an educational, hypothetical illustration only. Past performance is not indicative of future results, and nothing here is a recommendation to buy or sell any scheme. Please consult your financial advisor before investing."],
  ];
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(([q, a]) => ({
      "@type": "Question",
      "name": q,
      "acceptedAnswer": { "@type": "Answer", "text": a },
    })),
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
