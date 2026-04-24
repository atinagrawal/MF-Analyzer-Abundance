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
    keywords: 'mutual fund comparison India, SIP calculator, SWP backtester, NAV backtest, goal planner, EMI calculator, AMFI NAV data, fund performance, Sharpe ratio, XIRR calculator, Abundance Financial Services',
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

  'cas-tracker': {
    title: 'CAS Portfolio Tracker — Live NAV, FIFO Gains & ELSS Lock-in | Abundance',
    description: 'Upload your CAMS or KFintech CAS PDF to track all mutual fund holdings with live AMFI NAVs, FIFO capital gains, ELSS 3-year lock-in status, SIF holdings, and multi-PAN family support. Free tool by Abundance Financial Services, ARN-251838.',
    keywords: 'CAS portfolio tracker, CAMS statement upload, KFintech CAS parser, mutual fund portfolio tracker India, live NAV tracker AMFI, ELSS lock-in calculator, FIFO capital gains mutual fund, family CAS multi PAN, consolidated account statement analyser, SIF holdings tracker, Abundance Financial Services, ARN-251838',
    path: '/cas-tracker',
    ogImage: '/og-cas.png',
    changefreq: 'monthly',
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

  portfolio: {
    title: 'Live AMC Portfolio Extractor | Abundance',
    description: 'Extract live mutual fund holdings from AMC disclosure PDFs. See the exact stocks and bonds your fund owns. Free tool by Abundance Financial Services.',
    keywords: 'mutual fund portfolio holdings, AMC portfolio extractor, fund holdings India, mutual fund stock holdings, portfolio disclosure extraction',
    path: '/portfolio',
    ogImage: '/og-mfcalc.png',
    changefreq: 'monthly',
    priority: 0.70,
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
};

/**
 * Get full Next.js metadata object for a page
 * @param {string} pageKey — key from PAGE_META (e.g. 'rolling', 'cas-tracker')
 * @returns {import('next').Metadata}
 */
export function getPageMeta(pageKey) {
  const p = PAGE_META[pageKey];
  if (!p) {
    console.warn(`[SEO] No metadata config for page: "${pageKey}"`);
    return { title: SITE_NAME };
  }

  const fullUrl = `${SITE}${p.path}`;
  const ogImageUrl = `${SITE}${p.ogImage}`;

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

export { PAGE_META, SITE, SITE_NAME, ARN, TWITTER, THEME_COLOR };
