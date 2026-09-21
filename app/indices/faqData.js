/**
 * app/indices/faqData.js
 *
 * Single source of truth for Market Indices & Valuation FAQs — imported by both
 * page.js (the visible, crawlable accordion) and layout.js (the FAQPage JSON-LD).
 * Keeps visible content and search engine structured data in exact synchronization.
 */

export const INDICES_FAQ = [
  {
    q: 'What is the difference between Total Return Index (TRI) and Price Return (PR)?',
    a: 'A Price Return (PR) index reflects only capital gains resulting from constituent stock price movements. A Total Return Index (TRI) assumes all dividends declared by constituent companies are immediately reinvested into the index. SEBI mandates that all Indian mutual funds benchmark their performance against TRI indices because mutual fund NAVs naturally capture dividend receipts. Over long investment horizons (3–10 years), dividend reinvestment adds approximately 1.2% to 1.8% annualised return to broad benchmarks like Nifty 50 and BSE 500.',
  },
  {
    q: 'What is a normal or fair P/E ratio for Nifty 50?',
    a: 'Historically, Nifty 50 has traded in three primary valuation zones: Undervalued below 18x P/E, Fair Value between 18x and 24x P/E, and Expensive/Stretched above 24x P/E. Historically, investing when Nifty 50 is below 18x P/E has yielded above-average 3-to-5 year forward CAGRs. Note that since early 2021, NSE reports Nifty 50 P/E using consolidated earnings rather than standalone earnings, which structurally lowered the reported multiple by approximately 2.5 to 3 points.',
  },
  {
    q: 'Why do Nifty Midcap 150 and Nifty Smallcap 250 trade at higher P/E multiples than Nifty 50?',
    a: 'Midcap and Smallcap companies typically exhibit higher expected earnings growth rates compared to mature large-cap corporations. Furthermore, in cyclical sectors (such as capital goods, defence, and infrastructure), constituent earnings may still be recovering from cyclical troughs, which temporarily elevates trailing P/E multiples. Consequently, their historical fair-value bands are wider (25x–35x for Midcaps, 20x–30x for Smallcaps).',
  },
  {
    q: 'How frequently is this index dashboard updated?',
    a: 'Data on this dashboard is updated across two complementary cycles: NSE Indices Limited releases the official monthly Index Dashboard by the ~10th of every month, providing verified Total Return Index (TRI) trailing returns, P/E, P/B, Dividend Yield, Beta, and Volatility across 140+ indices. BSE index valuations are updated daily from official exchange datasets.',
  },
  {
    q: 'How can I compare my mutual funds against these benchmark indices?',
    a: 'Clicking the "Compare" button on any index row seamlessly opens the Rolling Returns Analyser (/rolling?bench=...) with that index pre-selected as the benchmark. You can test your mutual fund across 1-year, 3-year, and 5-year rolling windows across every historical market entry date to evaluate genuine alpha generation consistency beyond point-to-point returns.',
  },
];
