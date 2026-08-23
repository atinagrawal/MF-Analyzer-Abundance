/**
 * lib/metadata.js — Centralized SEO metadata for every page
 *
 * Usage in any page.js file under app/:
 *   import { getPageMeta } from '@/lib/metadata';
 *   export const metadata = getPageMeta('rolling');
 */

const SITE = 'https://mfcalc.getabundance.in';
const SITE_NAME = 'Abundance Financial Services';
const ARN = 'ARN-251838';
const TWITTER = '@abundancefinsvs';
const LOCALE = 'en_IN';
const THEME_COLOR = '#1b5e20';

// ── Per-page SEO configs ─────────────────────────────────────────────────────
const PAGE_META = {
  home: {
    title: 'Free MF Comparison, SIP Calculator & SWP Backtester | Abundance',
    description: 'Compare up to 5 mutual funds side-by-side, backtest SIP & SWP on real NAV data, plan investment goals, and calculate EMI. Free tool by Abundance Financial Services ARN-251838.',
    keywords: 'mutual fund comparison India, SIP calculator, SWP backtester, NAV backtest, goal planner, EMI calculator, AMFI NAV data, fund performance, Sharpe ratio, XIRR calculator, mutual fund return between two dates, compare mutual fund historical return, mutual fund crash comparison, custom date mutual fund performance, Abundance Financial Services',
    path: '/',
    ogImage: '/og-mfcalc.png',
    changefreq: 'weekly',
    priority: 1.0,
  },

  rolling: {
    title: 'Rolling Returns Calculator — MF Consistency Analyser | Abundance',
    description: 'Rolling returns calculator for Indian mutual funds — CAGR distribution across every entry date, 1Y–10Y windows. Compare vs 100+ NSE indices. Free tool by Abundance Financial Services.',
    keywords: 'rolling returns mutual fund India, rolling CAGR calculator, mutual fund benchmark comparison, Nifty 50 TRI comparison, mutual fund consistency, AMFI NAV history, fund vs index comparison India',
    path: '/rolling',
    ogImage: '/og-rolling.png',
    changefreq: 'monthly',
    priority: 0.85,
  },

  backtest: {
    title: 'Portfolio Backtester — Test MF & SIF Portfolios on Real NAVs | Abundance',
    description: 'Build a hypothetical portfolio of mutual funds and SIFs, then backtest SIP, lumpsum or a combination on real historical NAVs. See XIRR, absolute returns and a benchmark comparison. Free tool by Abundance Financial Services.',
    keywords: 'mutual fund portfolio backtest, SIP backtester India, lumpsum backtest, SIF backtest, XIRR calculator, portfolio return simulator, historical NAV backtest, mutual fund portfolio builder India, Abundance Financial Services',
    path: '/backtest',
    ogImage: '/api/og-backtest',
    changefreq: 'monthly',
    priority: 0.85,
  },
  breadth: {
    title: 'Market Breadth Dashboard — India · Stocks Above 20/50/200 DMA | Abundance',
    description: 'Market-breadth dashboard for Indian equities: % of stocks above their 20/50/100/150/200-day moving averages, advance-decline, new 52-week highs/lows, and market regime. Premium analytics by Abundance Financial Services.',
    keywords: 'market breadth India, stocks above 200 DMA, advance decline line, breadth indicator, market regime, new highs new lows, breadth dashboard, Abundance Financial Services',
    path: '/market-breadth',
    ogImage: '/api/og-breadth',
    changefreq: 'daily',
    priority: 0.85,
  },
  screener: {
    title: 'Mutual Fund Screener India — Compare 2,500+ Funds by Returns, Risk & Holdings | Abundance',
    description: 'Screen 2,500+ mutual funds & SIFs in India by SEBI category, 1/3/5-year CAGR, volatility, max drawdown and return-per-risk. Compare funds side by side with portfolio overlap, sector allocation, market cap breakdown, stress test data and NAV-based wealth simulation. Free tool by Abundance Financial Services (ARN-251838).',
    keywords: 'mutual fund screener India, MF screener, best mutual funds India 2025, mutual fund comparison tool, equity fund screener, debt fund screener, ELSS tax saving fund screener, flexi cap fund comparison, mid cap fund ranking, small cap fund screener, large cap fund list, CAGR comparison mutual funds, volatility drawdown mutual fund, return per risk ratio, AMFI NAV data, mutual fund holdings checker, portfolio overlap calculator, fund sector allocation, market cap allocation mutual fund, stress test mutual fund, liquidity analysis mid cap, SIF screener India, Specialised Investment Fund India, mutual fund filter returns, best performing mutual funds, Abundance Financial Services ARN-251838',
    path: '/screener',
    ogImage: '/api/og-screener',
    changefreq: 'daily',
    priority: 0.9,
  },

  fund: {
    title: 'Mutual Fund Details — Analytics, Holdings & Stress Test | Abundance',
    description: 'Detailed mutual fund analytics including NAV history, portfolio holdings, SEBI stress test, liquidity analysis and operational facts. By Abundance Financial Services ARN-251838.',
    keywords: 'mutual fund analysis India, fund holdings, stress test, NAV history, exit load, portfolio analytics',
    path: '/fund',
    ogImage: '/og-mfcalc.png',
    changefreq: 'monthly',
    priority: 0.7,
  },

  proposalStudio: {
    title: 'Proposal Studio — Mutual Fund Portfolio Overlap, Sector & M-Cap Analysis | Abundance',
    description: "Build a mutual fund or SIF investment proposal with combined portfolio overlap detection, sector exposure, security-level holdings, and Large/Mid/Small-cap allocation using AMFI's official categorization. See pairwise fund overlap, unified sector breakdown, and combined M-Cap split across your entire portfolio — for both mutual funds and SIFs. Premium tool by Abundance Financial Services (ARN-251838).",
    keywords: 'mutual fund overlap checker India, portfolio overlap calculator, fund overlap detector, mutual fund sector exposure analysis, combined portfolio analysis tool, AMFI large mid small cap categorization, SIF portfolio analysis India, investment proposal builder, mutual fund holdings comparison, multi-fund portfolio builder, portfolio diversification checker, market cap allocation calculator, equity fund overlap India, portfolio construction tool, mutual fund portfolio builder India, CAS statement portfolio import, mutual fund proposal PDF, fund comparison tool India, overlap between mutual funds, Abundance Financial Services ARN-251838',
    path: '/proposal-studio',
    ogImage: '/api/og-proposal-studio',
    changefreq: 'weekly',
    priority: 0.8,
  },

  pioneers: {
    title: "The 30-Year Club: India's Oldest Mutual Funds & Decades of Wealth Creation | Abundance",
    description: "Explore the legendary 30+ year pioneers of Indian mutual funds. See how funds like UTI Mastershare, Franklin Bluechip, HDFC Flexi Cap, and Nippon Growth turned ₹10,000 into crores across 3 decades. Interactive compounding time machine, historical milestones, and full track records.",
    keywords: "oldest mutual funds in India, 30 year mutual fund returns, highest return mutual fund since inception, UTI Mastershare history, Franklin India Bluechip 1993, HDFC Flexi Cap 1994, Reliance Growth Fund 1995, mutual fund history India, decades of compounding, Indian equity pioneers, Abundance Financial Services ARN-251838",
    path: '/pioneers',
    ogImage: '/api/og-pioneers',
    changefreq: 'weekly',
    priority: 0.9,
  },

  industry: {
    title: 'Mutual Fund Industry AUM & Flows Dashboard | Abundance',
    description: 'Live AMFI industry data — monthly AUM, net flows, SIP flows, and fund category breakdown for the Indian mutual fund industry. Free analytics by Abundance Financial Services.',
    keywords: 'mutual fund industry India, AMFI AUM data, mutual fund flows, SIP flows India, fund category AUM, industry pulse, mutual fund market size India',
    path: '/industry',
    ogImage: '/og-industry.png',
    changefreq: 'weekly',
    priority: 0.85,
  },

  report: {
    title: 'MF Industry Report Card — Monthly Scorecard | Abundance',
    description: 'Monthly mutual fund industry report card with AUM trends, category performance, and SIP contribution data. Sourced from AMFI. Free by Abundance Financial Services.',
    keywords: 'mutual fund report card, AMFI monthly report, fund industry scorecard, AUM trends India, SIP contribution data, mutual fund category performance',
    path: '/report',
    ogImage: '/og-report.png',
    changefreq: 'monthly',
    priority: 0.80,
  },

  geography: {
    title: 'Mutual Fund Geography — State-wise AUM Map | Abundance',
    description: 'Interactive state-wise mutual fund AUM map of India. See how mutual fund penetration varies across Indian states. Data from AMFI. Free by Abundance Financial Services.',
    keywords: 'mutual fund geography India, state wise AUM, mutual fund penetration India map, AMFI state data, mutual fund distribution India',
    path: '/geography',
    ogImage: '/og-geography.png',
    changefreq: 'weekly',
    priority: 0.85,
  },

  'market-watch': {
    title: 'Live Market Watch — Nifty 50, FII/DII Flows & Top Movers | Abundance',
    description: 'Live NSE India market data — Nifty 50, Bank Nifty, Midcap 150, Smallcap 250, IT, India VIX, USD/INR, FII/DII cash flows, top gainers and losers, advances/declines, OHLC. Free tool by Abundance Financial Services, ARN-251838, Haldwani.',
    keywords: 'Nifty 50 live today, Bank Nifty live, India VIX, NSE market watch India, FII DII flow today, top gainers NSE today, top losers NSE today, market indices India live, USDINR NSE, Nifty advances declines, Abundance ARN-251838',
    path: '/market-watch',
    ogImage: '/api/og-market-watch',
    changefreq: 'always',
    priority: 0.90,
  },

  'sifs': {
    title: 'SIF Screener — Specialised Investment Funds Live NAV | Abundance',
    description: 'Screener for all SEBI-regulated Specialised Investment Funds (SIFs) with live AMFI NAVs. Filter by strategy, type, and fund house. Equity Long-Short, Hybrid Long-Short, Active Asset Allocator. Abundance Financial Services ARN-251838.',
    keywords: 'Specialised Investment Funds India, SIF NAV screener, equity long-short fund, hybrid long-short fund, SEBI SIF, AMFI SIF, active asset allocator fund, SIF vs mutual fund',
    path: '/sifs',
    ogImage: '/api/og-sif',
    changefreq: 'daily',
    priority: 0.85,
  },

  'cas-tracker': {
    title: 'CAS Portfolio Tracker — Live NAV, FIFO Gains & ELSS Lock-in | Abundance',
    description: 'Upload your CAMS or KFintech CAS PDF to track all mutual fund holdings with live AMFI NAVs, FIFO capital gains, ELSS 3-year lock-in status, SIF holdings, per-transaction NAV rate charts, and multi-PAN family support. Free tool by Abundance Financial Services, ARN-251838.',
    keywords: 'CAS portfolio tracker, CAMS statement upload, KFintech CAS parser, mutual fund portfolio tracker India, live NAV tracker AMFI, ELSS lock-in calculator, FIFO capital gains mutual fund, family CAS multi PAN, consolidated account statement analyser, SIF holdings tracker, mutual fund transaction history, NAV rate chart mutual fund, mutual fund transmission tracker, inherited mutual fund units, transmission in mutual fund folio, Abundance Financial Services, ARN-251838',
    path: '/cas-tracker',
    ogImage: '/og-cas.png',
    changefreq: 'monthly',
    priority: 0.85,
  },

  'portfolio': {
    title: 'My Portfolio — Track Mutual Funds with Live NAVs & XIRR | Abundance',
    description: 'Your personal mutual fund portfolio dashboard. Track all holdings with live AMFI NAVs, portfolio XIRR, FIFO capital gains, ELSS lock-in, SIF holdings, and family CAS multi-PAN support. Free for clients of Abundance Financial Services, ARN-251838, Haldwani.',
    keywords: 'mutual fund portfolio tracker India, live NAV portfolio dashboard, portfolio XIRR calculator, FIFO capital gains calculator mutual fund, ELSS lock-in tracker, family CAS multi PAN, SIF holdings tracker, Abundance Financial Services ARN-251838',
    path: '/portfolio',
    ogImage: '/api/og-portfolio',
    changefreq: 'weekly',
    priority: 0.90,
  },

  'widgets': {
    title: 'Desktop Widgets — Live Market, Portfolio & Top Funds | Abundance',
    description: 'Live Windows 10 & 11 desktop widgets for Indian market watch (Nifty 50, Sensex, Sectors), live CAS portfolio tracking, and top performing mutual funds.',
    keywords: 'windows 10 widgets mutual fund, stock market desktop widget India, live portfolio widget, Nifty 50 desktop widget, Abundance Financial Services',
    path: '/widgets',
    ogImage: '/api/og-widgets',
    changefreq: 'daily',
    priority: 0.85,
  },

  indices: {
    title: 'NSE Index Dashboard — Live Returns & Valuation | Abundance',
    description: 'Live NSE index dashboard showing 1M–10Y returns, P/E and P/B ratios for 50+ Nifty indices. Compare broad market, sectoral, and strategy indices. Free by Abundance Financial Services.',
    keywords: 'NSE index dashboard, Nifty 50 returns, index PE ratio, Nifty sectoral indices, index comparison India, Nifty valuation, total return index TRI',
    path: '/indices',
    ogImage: '/og-indices.png',
    changefreq: 'monthly',
    priority: 0.80,
  },

  'xls-pdf-extractor': {
    title: 'XLS & PDF Extractor | Abundance',
    description: 'Extract tabular data from XLS and PDF files. Free utility by Abundance Financial Services.',
    keywords: 'XLS extractor, PDF table extractor, data extraction tool',
    path: '/xls-pdf-extractor',
    ogImage: '/og-mfcalc.png',
    changefreq: 'monthly',
    priority: 0.50,
  },

  'pms-screener': {
    title: 'PMS Screener — Track & Compare Portfolio Management Services | Abundance',
    description: 'Live APMI data for 1,176+ PMS strategies in India. Compare Equity, Debt, Hybrid & Multi Asset portfolios by 1M–Inception returns, AUM, and alpha vs Nifty 50. Free HNI screener by Abundance Financial Services.',
    keywords: 'PMS screener India, portfolio management services comparison, APMI PMS data, best PMS India 2025, PMS returns comparison, equity PMS performance, HNI investment India, PMS vs mutual fund, top PMS strategies India, SEBI registered PMS, discretionary PMS India, PMS AUM tracker, PMS alpha Nifty, Abundance Financial Services PMS',
    path: '/pms-screener',
    ogImage: '/og-pms-screener.png',
    changefreq: 'weekly',
    priority: 0.90,
  },

  pricing: {
    title: 'Abundance Pro Pricing — Plans & Subscription Options | Abundance',
    description: 'Unlock Proposal Studio, Pairwise Fund Overlap, Complete 30-100+ Stock Holdings Disclosure, AMFI Market Cap Allocation, CAS Tracker & Market Breadth. Annual ₹499/yr + GST or Lifetime ₹1,999 + GST. Abundance Financial Services (ARN-251838).',
    keywords: 'Abundance Pro pricing, mutual fund proposal studio cost, fund overlap analyzer pro, full holdings disclosure mutual fund, AMFI market cap allocation tool, CAS tracker pro plan, market breadth pro subscription, mutual fund portfolio analyzer pricing, Abundance Financial Services pricing, ARN-251838',
    path: '/pricing',
    ogImage: '/og-pricing.png',
    changefreq: 'monthly',
    priority: 0.85,
  },
};

/**
 * Get full Next.js metadata object for a page
 * @param {string} pageKey — key from PAGE_META (e.g. 'rolling', 'cas-tracker')
 * @returns {import('next').Metadata}
 */
export function getPageMeta(pageKey, overrides = {}) {
  const base = PAGE_META[pageKey];
  if (!base) {
    console.warn(`[SEO] No metadata config for page: "${pageKey}"`);
    return { title: SITE_NAME };
  }
  const p = {
    ...base,
    title: overrides.title || base.title,
    description: overrides.description || base.description,
    path: overrides.canonicalPath || base.path,
  };

  const fullUrl = `${SITE}${p.path}`;
  const ogImageUrl = `${SITE}${base.ogImage}`;

  return {
    title: p.title,
    description: p.description,
    keywords: p.keywords,
    authors: [{ name: SITE_NAME }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    robots: { index: true, follow: true },
    metadataBase: new URL(SITE),
    alternates: {
      canonical: fullUrl,
      languages: {
        'en-IN': fullUrl,
        'x-default': fullUrl,
      },
    },
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      title: p.title,
      description: p.description,
      url: fullUrl,
      locale: LOCALE,
      images: [{
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: p.title,
      }],
    },
    twitter: {
      card: 'summary_large_image',
      site: TWITTER,
      title: p.title,
      description: p.description,
      images: [ogImageUrl],
    },
    other: {
      'geo.region': 'IN-UT',
      'geo.placename': 'Haldwani, Uttarakhand, India',
      'geo.position': '29.2183;79.5130',
      'ICBM': '29.2183, 79.5130',
    },
  };
}

/**
 * Get sitemap entries for all pages
 * Used by app/sitemap.js
 */
export function getSitemapEntries() {
  return Object.values(PAGE_META).map(p => ({
    url: `${SITE}${p.path}`,
    lastModified: new Date().toISOString().split('T')[0],
    changeFrequency: p.changefreq,
    priority: p.priority,
    alternates: {
      languages: {
        'en-IN': `${SITE}${p.path}`,
        'x-default': `${SITE}${p.path}`,
      },
    },
  }));
}

// Also add entries for the main page's tab variations (SIP, Goal, SWP, EMI)
export function getHomeSitemapEntries() {
  const tabs = [
    { tab: 'fund', priority: 0.9, changefreq: 'weekly' },
    { tab: 'sip', priority: 0.9, changefreq: 'weekly' },
    { tab: 'goal', priority: 0.8, changefreq: 'monthly' },
    { tab: 'swp', priority: 0.9, changefreq: 'weekly' },
    { tab: 'emi', priority: 0.8, changefreq: 'monthly' },
  ];
  return tabs.map(t => ({
    url: `${SITE}/?tab=${t.tab}`,
    lastModified: new Date().toISOString().split('T')[0],
    changeFrequency: t.changefreq,
    priority: t.priority,
  }));
}

// Add entries for the 6 curated screener category URLs
export function getScreenerCategorySitemapEntries(curatedCategories) {
  return curatedCategories.map((c) => ({
    url: `${SITE}/screener?category=${c.slug}`,
    lastModified: new Date().toISOString().split('T')[0],
    changeFrequency: 'daily',
    priority: 0.75,
  }));
}

export { PAGE_META, SITE, SITE_NAME, ARN, TWITTER, THEME_COLOR };
