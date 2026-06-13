import { getPageMeta } from '@/lib/metadata';

export const metadata = getPageMeta('breadth');

export default function BreadthLayout({ children }) {
  const webApp = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "name": "Market Breadth Dashboard — Indian Equities",
    "url": "https://mfcalc.getabundance.in/market-breadth",
    "description": "Market-breadth analytics for Indian equities — % of stocks above 20/50/100/150/200-day moving averages, advance-decline line, McClellan Oscillator, new 52-week highs/lows, per-sector breadth and market regime. Computed daily on 1,100+ BSE main-board stocks.",
    "applicationCategory": "FinanceApplication",
    "operatingSystem": "Any",
    "inLanguage": "en-IN",
    "offers": { "@type": "Offer", "price": "0", "priceCurrency": "INR" },
    "featureList": [
      "% of stocks above 20/50/100/150/200-day moving averages",
      "Advance-Decline Line and McClellan Oscillator",
      "New 52-week highs and lows",
      "Market regime read from 200-DMA breadth",
      "Golden cross and death cross counts",
      "Bull stacked and bear stacked alignment signals",
      "15-sector breadth grid with sparklines",
      "Sector rotation ranking with week-on-week change",
      "Historical percentile ranks for each breadth metric",
      "Nifty 50 / 500 / Bank and India VIX index strip"
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
      { "@type": "ListItem", "position": 3, "name": "Market Breadth", "item": "https://mfcalc.getabundance.in/market-breadth" }
    ]
  };
  const faqPage = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [
      {
        "@type": "Question",
        "name": "What is market breadth, and why does it matter?",
        "acceptedAnswer": { "@type": "Answer", "text": "Market breadth measures how many individual stocks are participating in a move, not just whether the index is up or down. An index like Nifty 50 tracks a small basket of large-cap stocks weighted by market cap, so a handful of heavyweights can lift the index even while most stocks are falling. Breadth tells you whether a rally is broad (most stocks moving together) or narrow (just a few leaders). Broad rallies tend to be durable; narrow ones are more fragile." }
      },
      {
        "@type": "Question",
        "name": "How is market breadth different from watching Nifty or Sensex?",
        "acceptedAnswer": { "@type": "Answer", "text": "Nifty 50 is the weighted average of 50 stocks. Reliance, HDFC Bank, Infosys, and ICICI Bank alone make up roughly 35–40% of its weight. This dashboard tracks 1,100+ liquid BSE stocks equally. When it says 42% of stocks are above their 200-day MA, that means 42% of real companies — not 42% of market cap — are in long-term uptrends. That is a more honest picture of what most investors actually hold." }
      },
      {
        "@type": "Question",
        "name": "What does the Risk-on / Risk-off regime label mean?",
        "acceptedAnswer": { "@type": "Answer", "text": "The regime is derived from the percentage of stocks above their 200-day moving average: 60% or more means Risk-on (broad uptrend); 40–60% means Mixed/Neutral (two-sided market); 20–40% means Risk-off (defensive conditions); below 20% means Deep risk-off (broad downtrend). The value is in the direction of change as much as the absolute level." }
      },
      {
        "@type": "Question",
        "name": "What does '% above 200-day MA' mean?",
        "acceptedAnswer": { "@type": "Answer", "text": "The 200-day moving average is the average closing price of a stock over the last 200 trading sessions — roughly 10 months. When a stock's price is above it, the stock is in a long-term uptrend. '% above 200-day MA' counts what fraction of the 1,100+ tracked stocks are currently above their own 200-day MA. The higher the percentage, the more stocks are individually in long-term uptrends." }
      },
      {
        "@type": "Question",
        "name": "What is the Advance-Decline (A-D) Line?",
        "acceptedAnswer": { "@type": "Answer", "text": "Each day, the number of advancing stocks minus declining stocks gives a net advance figure. The A-D Line is the running cumulative sum of this number. When the A-D Line is rising, more stocks are advancing than declining on most days — the market has broad participation. When it falls even as the index rises, it is a divergence warning: the rally is narrowing, driven by fewer and fewer stocks. This divergence often precedes corrections." }
      },
      {
        "@type": "Question",
        "name": "What is the McClellan Oscillator?",
        "acceptedAnswer": { "@type": "Answer", "text": "The McClellan Oscillator is the difference between a 19-day EMA and a 39-day EMA of the daily net advances. Positive and rising means short-term breadth momentum is expanding. Negative and falling means breadth is deteriorating. Extreme readings often signal overbought or oversold conditions. It is more timely than the raw A-D Line and useful for identifying breadth thrusts or exhaustion." }
      },
      {
        "@type": "Question",
        "name": "What is a Golden Cross and a Death Cross?",
        "acceptedAnswer": { "@type": "Answer", "text": "A Golden Cross (GC) occurs when a stock's 50-day moving average crosses above its 200-day moving average — medium-term momentum has turned bullish. A Death Cross (DC) is the mirror: the 50-day MA crosses below the 200-day MA. The counts on this dashboard show how many stocks had this crossover within the last 25 trading sessions." }
      },
      {
        "@type": "Question",
        "name": "What is Bull Stacked alignment?",
        "acceptedAnswer": { "@type": "Answer", "text": "Bull Stacked describes a stock where Price > 20-day MA > 50-day MA > 100-day MA > 150-day MA > 200-day MA — all moving averages in ascending order. This means the stock is in an uptrend across every time horizon simultaneously. A sector with many bull-stacked stocks is showing exceptionally clean trend alignment." }
      },
      {
        "@type": "Question",
        "name": "What does the sector breadth grid show?",
        "acceptedAnswer": { "@type": "Answer", "text": "The sector grid applies the same 200-day MA breadth calculation to each of the 15 Nifty sectoral indices individually. This lets you see which sectors are in broad uptrends, which are struggling, and which are seeing fresh momentum signals. Sectors with high breadth and rising advance-decline are typically where current market leadership sits." }
      },
      {
        "@type": "Question",
        "name": "Which stocks are included in the breadth calculation?",
        "acceptedAnswer": { "@type": "Answer", "text": "The dashboard tracks the top 1,100 liquid stocks on the BSE by 60-session average daily turnover. This universe is broad enough to capture real market breadth including mid- and small-cap stocks, while excluding thinly traded stocks where prices can be erratic." }
      },
      {
        "@type": "Question",
        "name": "How often does market breadth data update?",
        "acceptedAnswer": { "@type": "Answer", "text": "End-of-day price data is sourced from the BSE bhavcopy — the official daily price file published by the Bombay Stock Exchange after market close, typically between 6–7 PM IST. The nightly pipeline runs at 6 PM IST on weekdays and computes all breadth metrics, per-stock signals, and sector breadth." }
      }
    ]
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(webApp) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPage) }} />
      {children}
    </>
  );
}
