// app/screener/screenerContent.js
// Shared, framework-neutral content for the MF screener page -- imported by
// both the server page.js (metadata) and the client ScreenerClient.jsx
// (rendering), so the two never drift out of sync.

export const shortCat = (c = '') => {
  let s = c.replace(/^(Equity|Debt|Hybrid|Other|Solution Oriented|Income\/Debt Oriented)\s+Schemes?\s*-\s*/i, '').replace(/\s+Fund$/i, '').trim() || c;
  if (/^sectoral|^thematic|sectoral\s*\/\s*thematic/i.test(s)) return 'Sectoral / Thematic';
  if (/^value$|^contra$|value\s*\/\s*contra/i.test(s)) return 'Value / Contra';
  return s;
};

export function normalizeCategory(c = '') {
  if (!c || c === 'All') return 'All';
  let cat = c
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^(equity|debt|hybrid|other|solution oriented|income\/debt oriented|income)\s*schemes?\s*-\s*/i, '')
    .replace(/^(equity|debt|hybrid|other|solution oriented|income\/debt oriented)\s*-\s*/i, '')
    .replace(/\s*-\s*tax saver fund/i, '')
    .replace(/\s+fund$/i, '')
    .replace(/banking and psu debt/i, 'banking and psu')
    .replace(/ultra short term|ultra short to short term/i, 'ultra short duration')
    .replace(/short term/i, 'short duration')
    .replace(/medium term/i, 'medium duration')
    .replace(/medium to long term/i, 'medium to long duration')
    .replace(/long term/i, 'long duration')
    .replace(/dynamic term/i, 'dynamic bond')
    .replace(/floating interest rates/i, 'floater')
    .replace(/balanced advantage fund\/\s*dynamic asset allocation|dynamic asset allocation or balanced advantage|balanced advantage/i, 'dynamic asset allocation or balanced advantage')
    .replace(/gilt fund with 10 year constant duration|10-year constant maturity gilt/i, '10-year constant gilt')
    .trim();

  if (/^sectoral|^thematic|sectoral\s*\/\s*thematic/i.test(cat)) {
    return 'sectoral / thematic';
  }

  if (/^value$|^contra$|value\s*\/\s*contra/i.test(cat)) {
    return 'value / contra';
  }

  if (/^children/i.test(cat)) {
    return 'children';
  }

  if (/^retirement/i.test(cat)) {
    return 'retirement';
  }

  // AMFI files Life Cycle Funds as one self-contained category string per
  // maturity bucket ("Life Cycle Funds - Life Cycle Fund with Maturity of
  // 10 Years", "...15 Years", etc. -- confirmed live in NAVAll.txt Sep
  // 2026), unlike other categories where the tenure/variant is a genuinely
  // separate sub-category. Collapsing every bucket to one normalized value
  // is deliberate here so a single curated category page can cover all of
  // an AMC's tenures at once instead of fragmenting into near-empty pages
  // per maturity year.
  if (/^life cycle/i.test(cat)) {
    return 'life cycle';
  }

  if (/fund of funds|fof/i.test(cat)) {
    return 'fof';
  }

  if (/etf/i.test(cat)) {
    return 'etf';
  }

  if (cat === 'income') {
    return 'medium to long duration';
  }

  return cat;
}

export const CURATED_CATEGORIES = [
  {
    slug: 'sectoral-thematic',
    label: 'Sectoral / Thematic',
    category: 'Equity Scheme - Sectoral/ Thematic',
    subtitleSuffix: ' Sectoral & Thematic funds invest in specific sectors like Banking, IT, Pharma or Infrastructure.',
    metaBlurb: 'Sectoral & Thematic funds concentrate investments in specific sectors or themes like Banking, Defence, PSU or IT.',
    explainer: 'Sectoral and Thematic funds invest at least 80% of assets in a specific industry sector (like Banking, Technology, Healthcare) or theme (like Infrastructure, Manufacturing, Defence). They carry higher risk than diversified funds because their performance depends entirely on one sector’s business cycle.',
  },
  {
    slug: 'mid-cap',
    label: 'Mid Cap',
    category: 'Equity Scheme - Mid Cap Fund',
    subtitleSuffix: ' Mid Cap funds invest in companies ranked 101st–250th by market capitalisation.',
    metaBlurb: 'Mid Cap funds invest in companies ranked 101st–250th by market cap, balancing growth potential with moderate risk.',
    explainer: 'Mid Cap funds invest at least 65% of assets in companies ranked 101st–250th by market capitalisation — businesses past the small-cap stage but not yet market leaders. They sit between large and small cap on the risk-return spectrum, offering more growth potential than large caps with materially less volatility than small caps.',
  },
  {
    slug: 'small-cap',
    label: 'Small Cap',
    category: 'Equity Scheme - Small Cap Fund',
    subtitleSuffix: ' Small Cap funds invest in companies ranked 251st and below by market capitalisation.',
    metaBlurb: 'Small Cap funds invest in companies ranked 251st and below by market cap — the highest-growth, highest-volatility equity category.',
    explainer: 'Small Cap funds invest at least 65% of assets in companies ranked 251st and below by market capitalisation. This is the highest-growth-potential but also highest-volatility equity category — small caps can fall 40–50%+ in a sharp correction, so they suit investors with a long horizon (7+ years) and a high risk tolerance, typically as a smaller slice of a diversified portfolio rather than a core holding.',
  },
  {
    slug: 'flexi-cap',
    label: 'Flexi Cap',
    category: 'Equity Scheme - Flexi Cap Fund',
    subtitleSuffix: ' Flexi Cap funds invest across market caps without a fixed mandate.',
    metaBlurb: 'Flexi Cap funds invest at least 65% in equity with no fixed large/mid/small cap split, giving the fund manager full flexibility.',
    explainer: 'Flexi Cap funds must invest at least 65% in equity but face no mandated split across large, mid and small cap — the fund manager can move freely between them based on where they see opportunity. This flexibility makes Flexi Cap a popular single-fund core holding for investors who’d rather leave the cap-size allocation call to a professional manager.',
  },
  {
    slug: 'value-contra',
    label: 'Value / Contra',
    category: 'Equity Scheme - Value Fund',
    // AMFI files these as two genuinely distinct categories -- confirmed
    // live, both currently populated (e.g. SBI Contra Fund, Kotak India EQ
    // Contra Fund). `category` above stays the representative single value
    // slugToCategory/categoryToSlug use; `categories` is what
    // app/funds/[category]/page.js actually queries by, so the page
    // doesn't silently show only Value funds despite its own "Value &
    // Contra" copy.
    categories: ['Equity Scheme - Value Fund', 'Equity Scheme - Contra Fund'],
    subtitleSuffix: ' Value & Contra funds invest in undervalued or temporarily out-of-favour stocks.',
    metaBlurb: 'Value & Contra funds follow a value-investing strategy, buying stocks trading below their intrinsic worth.',
    explainer: 'Value funds follow a value-investing strategy by holding stocks trading below their intrinsic value, while Contra funds take contrarian bets against prevailing market trends. Both require patience, as undervalued stocks can take time to re-rate.',
  },
  {
    slug: 'multi-asset-allocation',
    label: 'Multi Asset Allocation',
    category: 'Hybrid Scheme - Multi Asset Allocation',
    subtitleSuffix: ' Multi Asset Allocation funds diversify across equity, debt and gold.',
    metaBlurb: 'Multi Asset Allocation funds invest across equity, debt and gold/commodities, with a minimum 10% in each asset class.',
    explainer: 'Multi Asset Allocation funds must invest in at least three asset classes — typically equity, debt and gold/commodities — with a minimum 10% allocation to each. That built-in diversification across asset classes (not just across stocks) is designed to smooth returns across market cycles, since equity, debt and gold rarely fall together, at the cost of capping the upside compared to a pure-equity fund in a strong bull run.',
  },
  {
    // Symbolic `category` — no raw AMFI string equals this exactly (every
    // real row carries its own maturity-bucket suffix, e.g. "Life Cycle
    // Funds - Life Cycle Fund with Maturity of 10 Years"). This entry is
    // matched via normalizeCategory's dedicated 'life cycle' collapse
    // above, not the exact-match branch in categoryToSlug -- and
    // app/funds/[category]/page.js queries this one category by prefix
    // (ILIKE 'Life Cycle Funds -%') instead of the usual exact match, so
    // every tenure bucket an AMC has launched shows up on one page. See
    // content/articles/pillar5-life-cycle-funds-explained.md for the full
    // writeup -- added ahead of live Regular-Plan data (SEBI created the
    // category Feb 2026; Zerodha's launches are Direct-Plan-only so never
    // reach mf_screener; ICICI Prudential's three tenures were mid-NFO as
    // of Sep 2026 and will populate automatically via the nightly ingest
    // once NAVs start publishing -- no further code change needed then).
    slug: 'life-cycle',
    label: 'Life Cycle',
    category: 'Life Cycle Funds',
    subtitleSuffix: ' Life Cycle Funds automatically shift from equity to debt as a fixed target year approaches.',
    metaBlurb: "Life Cycle Funds are SEBI's newest mutual fund category — an open-ended scheme with a fixed maturity year whose equity/debt mix de-risks itself on a pre-declared glide path.",
    explainer: "Life Cycle Funds are open-ended schemes built around a fixed target maturity year (5 to 30 years out), with the equity/debt allocation shifting automatically toward debt as that year approaches — no manual rebalancing needed. SEBI created the category in February 2026 as the replacement for new Retirement/Children's Fund launches (existing Retirement and Children's Funds remain open to new investment; this only affects new scheme launches). Redeeming early carries a tapering exit load — 3% in year one, 2% in year two, 1% in year three, nothing after — so the product is built for investors who pick a target year and hold to it.",
  },
];

export const KNOWN_CATEGORIES = [
  'Equity Scheme - Large Cap Fund',
  'Equity Scheme - Mid Cap Fund',
  'Equity Scheme - Small Cap Fund',
  'Equity Scheme - Large & Mid Cap Fund',
  'Equity Scheme - Multi Cap Fund',
  'Equity Scheme - Flexi Cap Fund',
  'Equity Scheme - ELSS',
  'Equity Scheme - Focused Fund',
  'Equity Scheme - Value Fund',
  'Equity Scheme - Contra Fund',
  'Equity Scheme - Dividend Yield Fund',
  'Equity Scheme - Sectoral/ Thematic',
  'Debt Scheme - Overnight Fund',
  'Debt Scheme - Liquid Fund',
  'Debt Scheme - Ultra Short Duration Fund',
  'Debt Scheme - Low Duration Fund',
  'Debt Scheme - Money Market Fund',
  'Debt Scheme - Short Duration Fund',
  'Debt Scheme - Medium Duration Fund',
  'Debt Scheme - Medium to Long Duration Fund',
  'Debt Scheme - Long Duration Fund',
  'Debt Scheme - Dynamic Bond',
  'Debt Scheme - Corporate Bond Fund',
  'Debt Scheme - Credit Risk Fund',
  'Debt Scheme - Banking and PSU Fund',
  'Debt Scheme - Gilt Fund',
  'Debt Scheme - Gilt Fund with 10 year constant duration',
  'Debt Scheme - Floater Fund',
  'Hybrid Scheme - Conservative Hybrid Fund',
  'Hybrid Scheme - Balanced Hybrid Fund',
  'Hybrid Scheme - Aggressive Hybrid Fund',
  'Hybrid Scheme - Dynamic Asset Allocation or Balanced Advantage',
  'Hybrid Scheme - Multi Asset Allocation',
  'Hybrid Scheme - Arbitrage Fund',
  'Hybrid Scheme - Equity Savings',
  'Solution Oriented Scheme - Retirement Fund',
  'Solution Oriented Scheme - Children’s Fund',
  'Other Scheme - Index Funds',
  'Other Scheme - Gold ETF',
  'Other Scheme - Other  ETFs',
  'Other Scheme - FoF Domestic',
  'Other Scheme - FoF Overseas',
  'Income/Debt Oriented Schemes - Liquid Fund',
  'Income/Debt Oriented Schemes - Overnight Fund',
  'Income/Debt Oriented Schemes - Money Market Fund',
  'Income/Debt Oriented Schemes - Ultra Short Term Fund',
  'Income/Debt Oriented Schemes - Short Term Fund',
  'Income/Debt Oriented Schemes - Medium Term Fund',
  'Income/Debt Oriented Schemes - Banking and PSU Debt Fund',
  'Income/Debt Oriented Schemes - Corporate Bond Fund',
  'Income/Debt Oriented Schemes - Credit Risk Fund',
  'Income/Debt Oriented Schemes - Gilt Fund',
  'Equity Schemes - Large Cap Fund',
  'Equity Schemes - Mid Cap Fund',
  'Equity Schemes - Small Cap Fund',
  'Equity Schemes - Flexi Cap Fund',
  'Equity Schemes - Multi Cap Fund',
  'Equity Schemes - ELSS',
  'Equity Schemes - Value Fund',
  'Equity Schemes - Contra Fund',
  'Equity Schemes - Sectoral Fund',
  'Equity Schemes - Thematic Fund',
];

export function slugToCategory(slug) {
  if (!slug) return null;
  const entry = CURATED_CATEGORIES.find((c) => c.slug === slug);
  if (entry) return entry.category;

  const cleanSlug = slug.toLowerCase().trim();
  for (const cat of KNOWN_CATEGORIES) {
    if (categoryToSlug(cat) === cleanSlug) return cat;
  }
  const unslugified = cleanSlug.replace(/-/g, ' ');
  for (const cat of KNOWN_CATEGORIES) {
    if (normalizeCategory(cat) === unslugified) return cat;
  }
  return null;
}

export function categoryToSlug(category) {
  if (!category || category === 'All') return null;
  const entry = CURATED_CATEGORIES.find(
    (c) => c.category === category || c.category === category + ' Fund' || c.category + ' Fund' === category
  );
  if (entry) return entry.slug;

  const norm = normalizeCategory(category);
  return norm.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function matchCategory(fundCategory, selectedCategory) {
  if (!selectedCategory || selectedCategory === 'All') return true;
  if (!fundCategory) return false;
  if (fundCategory === selectedCategory) return true;

  const nFund = normalizeCategory(fundCategory);
  const nSel = normalizeCategory(selectedCategory);
  return nFund === nSel;
}

export const GLOSSARY_ITEMS = [
  { q: 'CAGR (Compound Annual Growth Rate)', a: 'The annualised rate at which an investment would have grown, assuming steady compounding, to get from its starting value to its ending value. It\'s the standard way to compare returns across different time periods on a like-for-like basis — a fund\'s 3-year and 5-year CAGR can be directly compared even though the underlying periods differ.' },
  { q: 'Volatility (Standard Deviation)', a: 'The annualised standard deviation of a fund\'s monthly returns — a measure of how much the fund\'s value swings up and down, not the direction of those swings. A higher volatility number means a bumpier ride, even if the long-term destination (the CAGR) ends up the same. Two funds with identical 5-year returns can have very different volatility, and the smoother one is almost always preferable for most investors.' },
  { q: 'Max Drawdown', a: 'The largest peak-to-trough fall the fund has experienced within the available history — the worst-case loss an investor would have seen if they\'d bought at the top and sold at the bottom. It\'s a real, lived-through number, not a projection, and is one of the best gut-checks for whether you can actually stomach holding a fund through its worst period.' },
  { q: 'Return-per-Risk (Sharpe-like ratio)', a: 'CAGR divided by volatility — a rough measure of how much return a fund delivered for each unit of bumpiness it put investors through. Two funds with similar CAGR can have very different return-per-risk if one got there smoothly and the other got there through wild swings. Higher is generally better, but should always be read alongside absolute CAGR, since a very low-volatility debt fund can have a high ratio without actually growing your wealth meaningfully.' },
  { q: 'Expense Ratio', a: 'The annual fee, as a percentage of assets, that a fund charges to cover management and operating costs. It\'s deducted daily before the NAV is calculated, so every return figure you see anywhere — including on this page — is already net of this fee. A 1% expense ratio on a ₹1 lakh investment costs ₹1,000 per year, compounding over time. For long holding periods, the compounding effect of even a small expense ratio difference becomes significant.' },
  { q: 'NAV (Net Asset Value)', a: 'The per-unit price of a mutual fund, calculated daily by dividing the total market value of the fund\'s holdings (minus liabilities) by the number of outstanding units. When you invest ₹10,000 in a fund with an NAV of ₹100, you receive 100 units. When you redeem, you receive the current NAV per unit. NAV is published by AMFI every business day after market close.' },
  { q: 'AUM (Assets Under Management)', a: 'The total market value of all assets held and managed by a fund at a given point in time. AUM grows through new investor inflows and market appreciation, and shrinks through redemptions and market declines. Very large AUMs can become a constraint in small and mid cap funds, since buying or selling large positions in less-liquid stocks moves the price against the fund itself.' },
  { q: 'Alpha', a: 'The return a fund generates above (or below) its benchmark index, after accounting for the benchmark\'s own return. An alpha of +2% means the fund returned 2 percentage points more than the benchmark. Positive alpha over multiple full market cycles — not just a bull run — is the clearest evidence of genuine fund manager skill, though it\'s rare and not guaranteed to persist.' },
  { q: 'Beta', a: 'A measure of how much a fund tends to move relative to its benchmark. A beta of 1.2 means the fund historically rose or fell about 20% more than the index in each direction. High-beta funds amplify both gains and losses relative to the market; low-beta funds move more mildly. Beta is not the same as absolute volatility — a fund can have low beta (tightly tracking a low-volatility sector) but still have high absolute volatility.' },
  { q: 'Exit Load', a: 'A fee charged when you redeem your mutual fund units before a specified holding period — typically 1% if you sell within one year for equity funds. Exit load is charged as a percentage of the redemption amount and credited back to the fund\'s NAV (not to the fund house), effectively penalizing short-term traders while protecting long-term investors from the cost of others\' early exits.' },
  { q: 'SEBI Category', a: 'The fund classification assigned by SEBI (Securities and Exchange Board of India) under its 2017 circular on mutual fund categorization. Each AMC is allowed only one fund per SEBI category, ensuring investors can make true apples-to-apples comparisons. Categories include Large Cap, Mid Cap, Small Cap, Flexi Cap, ELSS, Balanced Advantage, and many more — each with specific investment mandate definitions.' },
  { q: 'SIP (Systematic Investment Plan)', a: 'A disciplined way to invest a fixed amount (as low as ₹100 in some funds) at regular intervals — daily, weekly, or monthly — instead of investing a lumpsum. SIPs benefit from rupee-cost averaging: you automatically buy more units when prices are low and fewer when prices are high. They also remove the need to time the market and make equity investing accessible to those without large lump sums.' },
];

export const FALLBACK_BENCHMARKS = {
  // ── Core Equity ────────────────────────────────────────────────────────
  BSE500: {
    symbol: 'BSE500',
    name: 'BSE 500 TRI',
    shortName: 'BSE 500',
    desc: 'S&P BSE 500 Total Return Index',
    nav: 36814.22,
    nav_date: '2026-08-20',
    ret_1m: 1.71,
    ret_3m: 3.95,
    ret_6m: 0.38,
    ret_1y: 1.34,
    ret_3y: 11.13,
    ret_5y: 10.65,
    ret_7y: 14.89,
    ret_10y: 12.22,
  },
  BSE100: {
    symbol: 'BSE100',
    name: 'BSE 100 TRI',
    shortName: 'BSE 100',
    desc: 'S&P BSE 100 Total Return Index',
    nav: 25994.17,
    nav_date: '2026-08-20',
    ret_1m: 1.54,
    ret_3m: 3.33,
    ret_6m: -2.97,
    ret_1y: -1.11,
    ret_3y: 9.41,
    ret_5y: 9.29,
    ret_7y: 13.20,
    ret_10y: 11.36,
  },
  BSEMID: {
    symbol: 'BSEMID',
    name: 'BSE Midcap 150 TRI',
    shortName: 'BSE Midcap',
    desc: 'S&P BSE MidCap Index',
    nav: 49165.67,
    nav_date: '2026-08-20',
    ret_1m: 2.60,
    ret_3m: 5.49,
    ret_6m: 7.19,
    ret_1y: 6.90,
    ret_3y: 16.85,
    ret_5y: 16.74,
    ret_7y: 20.66,
    ret_10y: 14.28,
  },
  BSESML: {
    symbol: 'BSESML',
    name: 'BSE Smallcap 250 TRI',
    shortName: 'BSE Smallcap',
    desc: 'S&P BSE SmallCap Index',
    nav: 58300.62,
    nav_date: '2026-08-20',
    ret_1m: 4.34,
    ret_3m: 11.26,
    ret_6m: 18.86,
    ret_1y: 9.62,
    ret_3y: 17.60,
    ret_5y: 17.75,
    ret_7y: 25.06,
    ret_10y: 16.71,
  },
  SPB25XIP: {
    symbol: 'SPB25XIP',
    name: 'BSE LargeMidCap 250 TRI',
    shortName: 'BSE 250 LargeMidCap',
    desc: 'S&P BSE 250 LargeMidCap Index',
    nav: 10880.81,
    nav_date: '2026-08-20',
    ret_1m: 1.54,
    ret_3m: 3.46,
    ret_6m: -1.03,
    ret_1y: 0.75,
    ret_3y: 10.74,
    ret_5y: 10.19,
    ret_7y: 14.36,
    ret_10y: null,
  },
  MULTICAP_50_25_25: {
    symbol: 'MULTICAP_50_25_25',
    name: 'NIFTY 500 Multicap 50:25:25 TRI',
    shortName: 'Nifty 500 Multicap',
    desc: '50% Large Cap + 25% Mid Cap + 25% Small Cap (SEBI Mandate)',
    nav: 447410.47,
    nav_date: '2026-08-20',
    ret_1m: 2.50,
    ret_3m: 5.82,
    ret_6m: 4.71,
    ret_1y: 3.56,
    ret_3y: 13.43,
    ret_5y: 13.35,
    ret_7y: 18.10,
    ret_10y: 13.56,
  },
  DIVY50: {
    symbol: 'DIVY50',
    name: 'BSE 500 Dividend Leaders 50 TRI',
    shortName: 'BSE Dividend 50',
    desc: 'S&P BSE 500 Dividend Leaders 50 Index',
    nav: 4890.35,
    nav_date: '2026-08-20',
    ret_1m: 2.10,
    ret_3m: 4.80,
    ret_6m: 3.79,
    ret_1y: 5.85,
    ret_3y: 15.20,
    ret_5y: 14.80,
    ret_7y: 17.50,
    ret_10y: 13.80,
  },

  // ── Hybrid Categories ──────────────────────────────────────────────────
  CRISIL_HYBRID_65_35: {
    symbol: 'CRISIL_HYBRID_65_35',
    name: 'CRISIL Hybrid 35+65 Aggressive Index',
    shortName: 'CRISIL Hybrid 65:35',
    desc: '65% Equity (BSE 200) + 35% Debt (CRISIL Bond Index)',
    nav: 8520.40,
    nav_date: '2026-08-20',
    ret_1m: 1.26,
    ret_3m: 2.93,
    ret_6m: 1.72,
    ret_1y: 3.09,
    ret_3y: 9.61,
    ret_5y: 9.84,
    ret_7y: 11.77,
    ret_10y: 10.61,
  },
  NIFTY_HYBRID_50_50: {
    symbol: 'NIFTY_HYBRID_50_50',
    name: 'NIFTY 50 Composite Hybrid 50:50 Index',
    shortName: 'NIFTY Hybrid 50:50',
    desc: '50% Equity + 50% Debt (Dynamic SEBI Tier-1 Benchmark)',
    nav: 6940.15,
    nav_date: '2026-08-20',
    ret_1m: 1.15,
    ret_3m: 2.73,
    ret_6m: 2.33,
    ret_1y: 4.28,
    ret_3y: 9.19,
    ret_5y: 9.15,
    ret_7y: 10.74,
    ret_10y: 9.96,
  },
  CRISIL_HYBRID_15_85: {
    symbol: 'CRISIL_HYBRID_15_85',
    name: 'CRISIL Hybrid 85+15 Conservative Index',
    shortName: 'CRISIL Hybrid 15:85',
    desc: '15% Equity (BSE 200) + 85% Debt (CRISIL Bond Index)',
    nav: 5410.80,
    nav_date: '2026-08-20',
    ret_1m: 0.87,
    ret_3m: 2.29,
    ret_6m: 3.75,
    ret_1y: 7.06,
    ret_3y: 8.22,
    ret_5y: 7.55,
    ret_7y: 8.35,
    ret_10y: 8.45,
  },
  CRISIL_MULTI_ASSET: {
    symbol: 'CRISIL_MULTI_ASSET',
    name: 'CRISIL Multi Asset Allocation Index',
    shortName: 'CRISIL Multi Asset',
    desc: '65% Equity + 20% Debt + 15% Domestic Gold',
    nav: 9240.60,
    nav_date: '2026-08-20',
    ret_1m: 1.85,
    ret_3m: 4.20,
    ret_6m: 3.80,
    ret_1y: 6.95,
    ret_3y: 12.45,
    ret_5y: 12.10,
    ret_7y: 14.25,
    ret_10y: 12.30,
  },
  NIFTY_ARBITRAGE: {
    symbol: 'NIFTY_ARBITRAGE',
    name: 'NIFTY 50 Arbitrage Index',
    shortName: 'NIFTY Arbitrage',
    desc: 'Fully Hedged Arbitrage (Cash-equivalent profile)',
    nav: 2420.30,
    nav_date: '2026-08-20',
    ret_1m: 0.56,
    ret_3m: 1.72,
    ret_6m: 3.52,
    ret_1y: 7.15,
    ret_3y: 6.95,
    ret_5y: 5.75,
    ret_7y: 5.65,
    ret_10y: 6.05,
  },
  NIFTY_EQ_SAVINGS: {
    symbol: 'NIFTY_EQ_SAVINGS',
    name: 'NIFTY Equity Savings Index',
    shortName: 'NIFTY Equity Savings',
    desc: '35% Unhedged Equity + 30% Arbitrage + 35% Debt',
    nav: 4860.50,
    nav_date: '2026-08-20',
    ret_1m: 0.98,
    ret_3m: 2.45,
    ret_6m: 2.75,
    ret_1y: 5.35,
    ret_3y: 8.65,
    ret_5y: 8.40,
    ret_7y: 9.60,
    ret_10y: 9.15,
  },

  // ── Debt Categories ────────────────────────────────────────────────────
  CRISIL_OVERNIGHT: {
    symbol: 'CRISIL_OVERNIGHT',
    name: 'CRISIL 1-Day Bharat Bond Index',
    shortName: 'CRISIL Overnight',
    desc: '1-day maturity (TREPS / Repo SEBI Tier-1 Benchmark)',
    nav: 1280.10,
    nav_date: '2026-08-20',
    ret_1m: 0.54,
    ret_3m: 1.64,
    ret_6m: 3.30,
    ret_1y: 6.65,
    ret_3y: 6.52,
    ret_5y: 5.45,
    ret_7y: 5.30,
    ret_10y: 5.65,
  },
  CRISIL_LIQUID: {
    symbol: 'CRISIL_LIQUID',
    name: 'CRISIL Liquid Debt Index',
    shortName: 'CRISIL Liquid',
    desc: 'Maturity up to 91 days (SEBI Tier-1 Benchmark)',
    nav: 3850.40,
    nav_date: '2026-08-20',
    ret_1m: 0.58,
    ret_3m: 1.76,
    ret_6m: 3.58,
    ret_1y: 7.22,
    ret_3y: 7.05,
    ret_5y: 5.85,
    ret_7y: 5.75,
    ret_10y: 6.15,
  },
  CRISIL_ULTRA_SHORT: {
    symbol: 'CRISIL_ULTRA_SHORT',
    name: 'CRISIL Ultra Short Duration Debt Index',
    shortName: 'CRISIL Ultra Short',
    desc: '3 to 6 months Macaulay duration',
    nav: 4620.80,
    nav_date: '2026-08-20',
    ret_1m: 0.62,
    ret_3m: 1.85,
    ret_6m: 3.75,
    ret_1y: 7.45,
    ret_3y: 7.25,
    ret_5y: 6.05,
    ret_7y: 6.10,
    ret_10y: 6.45,
  },
  CRISIL_LOW_DURATION: {
    symbol: 'CRISIL_LOW_DURATION',
    name: 'CRISIL Low Duration Debt Index',
    shortName: 'CRISIL Low Duration',
    desc: '6 to 12 months Macaulay duration',
    nav: 4980.20,
    nav_date: '2026-08-20',
    ret_1m: 0.65,
    ret_3m: 1.92,
    ret_6m: 3.90,
    ret_1y: 7.65,
    ret_3y: 7.38,
    ret_5y: 6.20,
    ret_7y: 6.30,
    ret_10y: 6.70,
  },
  CRISIL_MONEY_MARKET: {
    symbol: 'CRISIL_MONEY_MARKET',
    name: 'CRISIL Money Market Debt Index',
    shortName: 'CRISIL Money Market',
    desc: 'Maturity up to 1 year (CDs, CPs, T-Bills)',
    nav: 5120.60,
    nav_date: '2026-08-20',
    ret_1m: 0.64,
    ret_3m: 1.88,
    ret_6m: 3.82,
    ret_1y: 7.55,
    ret_3y: 7.30,
    ret_5y: 6.12,
    ret_7y: 6.22,
    ret_10y: 6.58,
  },
  CRISIL_SHORT_DURATION: {
    symbol: 'CRISIL_SHORT_DURATION',
    name: 'CRISIL Short Duration Debt Index',
    shortName: 'CRISIL Short Duration',
    desc: '1 to 3 years Macaulay duration',
    nav: 5380.90,
    nav_date: '2026-08-20',
    ret_1m: 0.70,
    ret_3m: 2.05,
    ret_6m: 4.15,
    ret_1y: 7.95,
    ret_3y: 7.55,
    ret_5y: 6.50,
    ret_7y: 6.75,
    ret_10y: 7.10,
  },
  CRISIL_CORP_BOND: {
    symbol: 'CRISIL_CORP_BOND',
    name: 'CRISIL Corporate Bond Composite Index',
    shortName: 'CRISIL Corp Bond',
    desc: 'Min 80% in AA+ & AAA corporate bonds',
    nav: 5720.40,
    nav_date: '2026-08-20',
    ret_1m: 0.75,
    ret_3m: 2.18,
    ret_6m: 4.35,
    ret_1y: 8.25,
    ret_3y: 7.80,
    ret_5y: 6.85,
    ret_7y: 7.20,
    ret_10y: 7.65,
  },
  CRISIL_BANKING_PSU: {
    symbol: 'CRISIL_BANKING_PSU',
    name: 'CRISIL Banking and PSU Debt Index',
    shortName: 'CRISIL Banking & PSU',
    desc: 'Min 80% in Banks, PSUs & PFIs',
    nav: 5540.10,
    nav_date: '2026-08-20',
    ret_1m: 0.72,
    ret_3m: 2.12,
    ret_6m: 4.25,
    ret_1y: 8.10,
    ret_3y: 7.65,
    ret_5y: 6.70,
    ret_7y: 7.05,
    ret_10y: 7.45,
  },
  CRISIL_GILT: {
    symbol: 'CRISIL_GILT',
    name: 'CRISIL Dynamic Gilt Index',
    shortName: 'CRISIL Dynamic Gilt',
    desc: 'Government Securities across all maturities',
    nav: 5980.70,
    nav_date: '2026-08-20',
    ret_1m: 0.78,
    ret_3m: 2.25,
    ret_6m: 4.48,
    ret_1y: 8.45,
    ret_3y: 7.90,
    ret_5y: 6.95,
    ret_7y: 7.35,
    ret_10y: 7.80,
  },
  CRISIL_10Y_GILT: {
    symbol: 'CRISIL_10Y_GILT',
    name: 'CRISIL 10 Year Gilt Index',
    shortName: 'CRISIL 10Y Gilt',
    desc: '10-Year Benchmark Government of India Securities',
    nav: 6150.30,
    nav_date: '2026-08-20',
    ret_1m: 0.82,
    ret_3m: 2.35,
    ret_6m: 4.65,
    ret_1y: 8.75,
    ret_3y: 8.10,
    ret_5y: 7.15,
    ret_7y: 7.50,
    ret_10y: 7.95,
  },
  CRISIL_DYNAMIC_BOND: {
    symbol: 'CRISIL_DYNAMIC_BOND',
    name: 'CRISIL Dynamic Bond Index',
    shortName: 'CRISIL Dynamic Bond',
    desc: 'Dynamic duration management across maturities',
    nav: 5690.80,
    nav_date: '2026-08-20',
    ret_1m: 0.76,
    ret_3m: 2.20,
    ret_6m: 4.40,
    ret_1y: 8.30,
    ret_3y: 7.75,
    ret_5y: 6.80,
    ret_7y: 7.15,
    ret_10y: 7.55,
  },
  CRISIL_CREDIT_RISK: {
    symbol: 'CRISIL_CREDIT_RISK',
    name: 'CRISIL Credit Risk Debt Index',
    shortName: 'CRISIL Credit Risk',
    desc: 'Min 65% in AA & below corporate debt',
    nav: 5480.50,
    nav_date: '2026-08-20',
    ret_1m: 0.74,
    ret_3m: 2.15,
    ret_6m: 4.30,
    ret_1y: 8.35,
    ret_3y: 7.95,
    ret_5y: 7.10,
    ret_7y: 7.40,
    ret_10y: 7.75,
  },
  CRISIL_FLOATER: {
    symbol: 'CRISIL_FLOATER',
    name: 'CRISIL Short Term Floating Rate Index',
    shortName: 'CRISIL Floater',
    desc: 'Min 65% in floating rate instruments',
    nav: 5240.20,
    nav_date: '2026-08-20',
    ret_1m: 0.66,
    ret_3m: 1.95,
    ret_6m: 3.95,
    ret_1y: 7.75,
    ret_3y: 7.45,
    ret_5y: 6.30,
    ret_7y: 6.40,
    ret_10y: 6.80,
  },
  CRISIL_MEDIUM_DURATION: {
    symbol: 'CRISIL_MEDIUM_DURATION',
    name: 'CRISIL Medium Duration Debt Index',
    shortName: 'CRISIL Med Duration',
    desc: '3 to 4 years Macaulay duration',
    nav: 5410.60,
    nav_date: '2026-08-20',
    ret_1m: 0.72,
    ret_3m: 2.10,
    ret_6m: 4.20,
    ret_1y: 8.05,
    ret_3y: 7.60,
    ret_5y: 6.60,
    ret_7y: 6.90,
    ret_10y: 7.25,
  },
  CRISIL_MED_LONG_DURATION: {
    symbol: 'CRISIL_MED_LONG_DURATION',
    name: 'CRISIL Medium to Long Duration Debt Index',
    shortName: 'CRISIL Med-Long',
    desc: '4 to 7 years Macaulay duration',
    nav: 5630.40,
    nav_date: '2026-08-20',
    ret_1m: 0.75,
    ret_3m: 2.18,
    ret_6m: 4.35,
    ret_1y: 8.25,
    ret_3y: 7.75,
    ret_5y: 6.80,
    ret_7y: 7.10,
    ret_10y: 7.50,
  },
  CRISIL_LONG_DURATION: {
    symbol: 'CRISIL_LONG_DURATION',
    name: 'CRISIL Long Duration Debt Index',
    shortName: 'CRISIL Long Duration',
    desc: 'Greater than 7 years Macaulay duration',
    nav: 6020.10,
    nav_date: '2026-08-20',
    ret_1m: 0.80,
    ret_3m: 2.30,
    ret_6m: 4.55,
    ret_1y: 8.60,
    ret_3y: 8.00,
    ret_5y: 7.05,
    ret_7y: 7.40,
    ret_10y: 7.85,
  },
};

export const CATEGORY_BENCHMARKS = {
  // ── Core Equity ────────────────────────────────────────────────────────
  'flexi cap': { symbol: 'BSE500', name: 'BSE 500 TRI', badge: 'Category Benchmark · Flexi Cap', desc: 'S&P BSE 500 Total Return Index' },
  'elss': { symbol: 'BSE500', name: 'BSE 500 TRI', badge: 'Category Benchmark · ELSS', desc: 'S&P BSE 500 Total Return Index' },
  'large cap': { symbol: 'BSE100', name: 'BSE 100 TRI', badge: 'Category Benchmark · Large Cap', desc: 'S&P BSE 100 Total Return Index' },
  'mid cap': { symbol: 'BSEMID', name: 'BSE Midcap 150 TRI', badge: 'Category Benchmark · Mid Cap', desc: 'S&P BSE MidCap Index' },
  'small cap': { symbol: 'BSESML', name: 'BSE Smallcap 250 TRI', badge: 'Category Benchmark · Small Cap', desc: 'S&P BSE SmallCap Index' },
  'large & mid cap': { symbol: 'SPB25XIP', name: 'BSE LargeMidCap 250 TRI', badge: 'Category Benchmark · Large & Mid Cap', desc: 'S&P BSE 250 LargeMidCap Index' },
  'multi cap': { symbol: 'MULTICAP_50_25_25', name: 'NIFTY 500 Multicap 50:25:25 TRI', badge: 'Category Benchmark · Multi Cap', desc: '50% Large + 25% Mid + 25% Small Cap (SEBI Mandate)' },
  'value': { symbol: 'BSE500', name: 'BSE 500 TRI', badge: 'Category Benchmark · Value', desc: 'S&P BSE 500 Total Return Index' },
  'contra': { symbol: 'BSE500', name: 'BSE 500 TRI', badge: 'Category Benchmark · Contra', desc: 'S&P BSE 500 Total Return Index' },
  'value / contra': { symbol: 'BSE500', name: 'BSE 500 TRI', badge: 'Category Benchmark · Value / Contra', desc: 'S&P BSE 500 Total Return Index' },
  'focused': { symbol: 'BSE500', name: 'BSE 500 TRI', badge: 'Category Benchmark · Focused', desc: 'S&P BSE 500 Total Return Index' },
  'dividend yield': { symbol: 'DIVY50', name: 'BSE 500 Dividend Leaders 50 TRI', badge: 'Category Benchmark · Dividend Yield', desc: 'S&P BSE 500 Dividend Leaders 50 Index' },

  // ── Hybrid Categories ──────────────────────────────────────────────────
  'aggressive hybrid': { symbol: 'CRISIL_HYBRID_65_35', name: 'CRISIL Hybrid 35+65 Aggressive Index', badge: 'Category Benchmark · Aggressive Hybrid', desc: '65% Equity (BSE 200) + 35% Debt (CRISIL Bond Index)' },
  'dynamic asset allocation or balanced advantage': { symbol: 'NIFTY_HYBRID_50_50', name: 'NIFTY 50 Composite Hybrid 50:50 Index', badge: 'Category Benchmark · Balanced Advantage', desc: '50% Equity + 50% Debt (Dynamic SEBI Tier-1 Benchmark)' },
  'conservative hybrid': { symbol: 'CRISIL_HYBRID_15_85', name: 'CRISIL Hybrid 85+15 Conservative Index', badge: 'Category Benchmark · Conservative Hybrid', desc: '15% Equity (BSE 200) + 85% Debt (CRISIL Bond Index)' },
  'multi asset allocation': { symbol: 'CRISIL_MULTI_ASSET', name: 'CRISIL Multi Asset Allocation Index', badge: 'Category Benchmark · Multi Asset', desc: '65% Equity + 20% Debt + 15% Domestic Gold' },
  'arbitrage': { symbol: 'NIFTY_ARBITRAGE', name: 'NIFTY 50 Arbitrage Index', badge: 'Category Benchmark · Arbitrage', desc: 'NIFTY 50 Arbitrage Index (SEBI Tier-1 Benchmark)' },
  'equity savings': { symbol: 'NIFTY_EQ_SAVINGS', name: 'NIFTY Equity Savings Index', badge: 'Category Benchmark · Equity Savings', desc: '35% Unhedged Equity + 30% Arbitrage + 35% Debt' },
  'balanced hybrid': { symbol: 'NIFTY_HYBRID_50_50', name: 'CRISIL Hybrid 50+50 Moderate Index', badge: 'Category Benchmark · Balanced Hybrid', desc: '50% Equity + 50% Debt (Fixed Allocation)' },

  // ── Debt Categories ────────────────────────────────────────────────────
  'liquid': { symbol: 'CRISIL_LIQUID', name: 'CRISIL Liquid Debt Index', badge: 'Category Benchmark · Liquid', desc: 'Maturity up to 91 days (SEBI Tier-1 Benchmark)' },
  'overnight': { symbol: 'CRISIL_OVERNIGHT', name: 'CRISIL 1-Day Bharat Bond Index', badge: 'Category Benchmark · Overnight', desc: '1-day maturity (TREPS / Repo SEBI Tier-1 Benchmark)' },
  'money market': { symbol: 'CRISIL_MONEY_MARKET', name: 'CRISIL Money Market Debt Index', badge: 'Category Benchmark · Money Market', desc: 'Maturity up to 1 year (CDs, CPs, T-Bills)' },
  'ultra short duration': { symbol: 'CRISIL_ULTRA_SHORT', name: 'CRISIL Ultra Short Duration Debt Index', badge: 'Category Benchmark · Ultra Short Duration', desc: '3 to 6 months Macaulay duration' },
  'low duration': { symbol: 'CRISIL_LOW_DURATION', name: 'CRISIL Low Duration Debt Index', badge: 'Category Benchmark · Low Duration', desc: '6 to 12 months Macaulay duration' },
  'short duration': { symbol: 'CRISIL_SHORT_DURATION', name: 'CRISIL Short Duration Debt Index', badge: 'Category Benchmark · Short Duration', desc: '1 to 3 years Macaulay duration' },
  'corporate bond': { symbol: 'CRISIL_CORP_BOND', name: 'CRISIL Corporate Bond Composite Index', badge: 'Category Benchmark · Corporate Bond', desc: 'Min 80% in AA+ & AAA corporate bonds' },
  'banking and psu': { symbol: 'CRISIL_BANKING_PSU', name: 'CRISIL Banking and PSU Debt Index', badge: 'Category Benchmark · Banking & PSU', desc: 'Min 80% in Banks, PSUs & PFIs' },
  'gilt': { symbol: 'CRISIL_GILT', name: 'CRISIL Dynamic Gilt Index', badge: 'Category Benchmark · Gilt', desc: 'Government Securities across all maturities' },
  '10-year constant gilt': { symbol: 'CRISIL_10Y_GILT', name: 'CRISIL 10 Year Gilt Index', badge: 'Category Benchmark · 10Y Constant Gilt', desc: '10-Year Benchmark Government of India Securities' },
  'dynamic bond': { symbol: 'CRISIL_DYNAMIC_BOND', name: 'CRISIL Dynamic Bond Index', badge: 'Category Benchmark · Dynamic Bond', desc: 'Dynamic duration management across maturities' },
  'credit risk': { symbol: 'CRISIL_CREDIT_RISK', name: 'CRISIL Credit Risk Debt Index', badge: 'Category Benchmark · Credit Risk', desc: 'Min 65% in AA & below corporate debt' },
  'floater': { symbol: 'CRISIL_FLOATER', name: 'CRISIL Short Term Floating Rate Index', badge: 'Category Benchmark · Floater', desc: 'Min 65% in floating rate instruments' },
  'medium duration': { symbol: 'CRISIL_MEDIUM_DURATION', name: 'CRISIL Medium Duration Debt Index', badge: 'Category Benchmark · Medium Duration', desc: '3 to 4 years Macaulay duration' },
  'medium to long duration': { symbol: 'CRISIL_MED_LONG_DURATION', name: 'CRISIL Medium to Long Duration Debt Index', badge: 'Category Benchmark · Medium to Long', desc: '4 to 7 years Macaulay duration' },
  'long duration': { symbol: 'CRISIL_LONG_DURATION', name: 'CRISIL Long Duration Debt Index', badge: 'Category Benchmark · Long Duration', desc: 'Greater than 7 years Macaulay duration' },
};

export function resolveCategoryBenchmark(category, benchmarks = FALLBACK_BENCHMARKS) {
  if (!category || category === 'All') {
    return {
      symbol: 'BSE500',
      name: 'BSE 500 TRI',
      badge: 'Broad Market Benchmark',
      desc: 'S&P BSE 500 Total Return Index',
      ...(benchmarks?.BSE500 || FALLBACK_BENCHMARKS.BSE500),
    };
  }

  const norm = normalizeCategory(category || '');
  // Explicitly excluded categories: Sectoral/Thematic, Retirement, Children's, FoF, Other ETFs, Index funds
  if (
    norm.includes('sectoral') ||
    norm.includes('thematic') ||
    norm.includes('retirement') ||
    norm.includes('children') ||
    norm === 'fof' ||
    norm.includes('fof') ||
    norm === 'etf' ||
    norm.includes('etf') ||
    norm.includes('index funds')
  ) {
    return null;
  }

  const matchedConfig = CATEGORY_BENCHMARKS[norm];
  if (!matchedConfig) return null;

  const data = (benchmarks && benchmarks[matchedConfig.symbol]) || FALLBACK_BENCHMARKS[matchedConfig.symbol] || {};
  // data is keyed by index symbol and carries shared performance numbers
  // (nav/ret_*) plus its own generic name/desc -- several categories
  // (e.g. 'balanced hybrid' and 'dynamic asset allocation or balanced
  // advantage') intentionally point at the same underlying index symbol
  // but need distinct category-specific name/badge/desc text, so
  // matchedConfig must win the merge, not be overwritten by it.
  return {
    ...data,
    ...matchedConfig,
  };
}

export const FAQ_ITEMS = [
  // Using the Screener
  { group: 'Using the Screener', q: 'What is the Category Benchmark row at the bottom of the table?', a: 'The benchmark row (pinned at the bottom of the table) shows the official benchmark index performance for the selected mutual fund category (e.g. S&P BSE 500 TRI for Flexi Cap and ELSS, BSE 100 TRI for Large Cap, BSE Midcap 150 for Mid Cap, BSE Smallcap 250 for Small Cap). It displays the index\'s live level in the NAV column and its point-to-point and CAGR returns across all available timeframes (1M, 3M, 6M, 1Y, 3Y, 5Y, 7Y, 10Y), allowing you to immediately benchmark active mutual fund performance against the market index.' },
  { group: 'Using the Screener', q: 'How are the returns calculated?', a: 'Point-to-point CAGR from real AMFI NAVs — the latest NAV versus the NAV one, three and five years earlier. For periods shorter than a fund\'s age, the figure is left blank rather than estimated. Since-inception return is the CAGR from the fund\'s launch NAV (₹10) to today, using the oldest available NAV record from AMFI.' },
  { group: 'Using the Screener', q: 'How current is the data?', a: 'The dataset is rebuilt every day from AMFI\'s official NAV files, so the figures reflect the most recent published NAVs. Holdings and stress test data are updated within a few days of each fund\'s monthly portfolio disclosure, typically within 2–5 business days of month-end.' },
  { group: 'Using the Screener', q: 'What do volatility and max drawdown mean?', a: 'Volatility is the annualised standard deviation of monthly returns — how bumpy the ride was. Max drawdown is the largest peak-to-trough fall. Both are on a month-end basis over the available history. For most equity funds, you should expect the max drawdown in any given year to exceed the annualised volatility figure, since drawdowns compound across consecutive bad months.' },
  { group: 'Using the Screener', q: 'Why do some funds show a dash instead of a return figure?', a: 'A dash means the fund doesn\'t have enough NAV history for that period — for example, a fund launched 2 years ago won\'t have a 3-year or 5-year return yet. We deliberately leave the cell blank rather than estimating or extrapolating a number, since a fabricated figure would be misleading.' },
  { group: 'Using the Screener', q: 'How do I compare multiple funds side by side?', a: 'Click the compare checkbox (⊕) on up to 3 fund rows to add them to your comparison basket. A bar will appear at the bottom of the screen. Click "Compare Now" to open the full comparison modal, which shows returns across all time horizons, risk metrics, category peer ranking, wealth simulation (lumpsum + SIP), an interactive growth chart, market cap breakdown, portfolio overlap, and top sector allocations side by side.' },
  { group: 'Using the Screener', q: 'What is the Portfolio Holdings section in each fund\'s detail panel?', a: 'When you click on any fund row, the detail panel shows the fund\'s actual disclosed stock holdings — with sector, individual stock weightage, top 5 and top 10 concentration metrics, and a sector exposure breakdown. This is sourced from the fund\'s most recent AMFI-mandated monthly portfolio disclosure. For debt funds or funds with no listed equity, this section shows a clean empty state.' },
  { group: 'Using the Screener', q: 'What does "Return per Risk" mean in the screener sort options?', a: 'Return per Risk is the 3-year CAGR divided by annualised volatility — a simple ratio of reward to bumpiness. Sorting by this metric surfaces funds that achieved their returns with the least amount of volatility, which is often more meaningful than raw returns for investors who value a smoother ride. However, always check the absolute CAGR as well — a fund with a great ratio but modest absolute returns may be too conservative for a long investment horizon.' },
  { group: 'Using the Screener', q: 'Can I filter by both category and return performance simultaneously?', a: 'Yes. The screener supports multiple active filters at once — you can narrow to a specific SEBI category (e.g. Flexi Cap), then also set a minimum 3-year return threshold, and the list instantly updates to show only funds matching all conditions. You can also sort the filtered results by any metric column.' },

  // Choosing a Category
  { group: 'Choosing a Category', q: 'What\'s the difference between Large, Mid and Small Cap funds?', a: 'It comes down to which companies, by size, the fund is required to hold. Large Cap funds invest at least 80% in India\'s top 100 companies by market cap — the most stable, liquid names. Mid Cap funds invest at least 65% in companies ranked 101st–250th, offering more growth potential with more volatility. Small Cap funds invest at least 65% in companies ranked 251st and below — the highest growth potential, but also the sharpest drawdowns in a correction.' },
  { group: 'Choosing a Category', q: 'What is a Flexi Cap fund and who is it best suited for?', a: 'A Flexi Cap fund must invest at least 65% in equity but faces no mandated split across large, mid and small cap — the fund manager can move freely between them based on where they see opportunity. This flexibility makes Flexi Cap a popular single-fund core holding for investors who\'d rather leave the cap-size allocation call to a professional manager. It\'s particularly suitable for first-time equity investors who want meaningful exposure to the full market without needing to decide the large/mid/small mix themselves.' },
  { group: 'Choosing a Category', q: 'What does the 3-year lock-in on ELSS funds mean?', a: 'Every ELSS investment — including each individual SIP instalment — is locked in for 3 years from its purchase date and can\'t be redeemed before that, regardless of market conditions. In exchange, ELSS is the only mutual fund category eligible for a Section 80C tax deduction. The lock-in doesn\'t remove market risk — your investment can still be worth less than you put in if equity markets are down when the lock-in ends.' },
  { group: 'Choosing a Category', q: 'What is a Multi Asset Allocation fund and when does it make sense?', a: 'Multi Asset Allocation funds must invest in at least three asset classes — typically equity, debt and gold/commodities — with a minimum 10% in each. The built-in diversification across asset classes is designed to smooth returns across market cycles, since equity, debt and gold rarely fall together. They\'re a good fit for investors who want a single-fund, all-weather portfolio without needing to rebalance manually, though the multi-asset exposure does cap the upside compared to a pure-equity fund in a strong bull run.' },
  { group: 'Choosing a Category', q: 'What is a Balanced Advantage Fund (BAF) / Dynamic Asset Allocation Fund?', a: 'Balanced Advantage Funds dynamically shift their equity-debt mix based on market valuations — increasing equity allocation when markets are cheap and reducing it when markets are expensive (using models based on P/E, P/B, or dividend yield). They aim to deliver equity-like long-term returns with lower volatility by tactically reducing equity exposure before market downturns. The actual equity range varies by fund — some cap equity at 80%, others can go as high as 100% or as low as 0%.' },
  { group: 'Choosing a Category', q: 'Who should invest in thematic or sectoral funds?', a: 'Thematic and sectoral funds (banking, pharma, infrastructure, technology, PSU, and similar) concentrate in a single sector or theme instead of diversifying across the market, which makes them SEBI\'s "Very High" risk category. They\'re best suited as a small satellite allocation — typically no more than 5–10% of an equity portfolio — for investors who already hold a diversified core (Flexi Cap, Large Cap, or similar), understand the specific sector\'s business cycle, and can tolerate that sector underperforming or falling for several years at a stretch. Buying into a theme after it has already rallied hard is one of the most common ways investors lose money in this category.' },
  { group: 'Choosing a Category', q: 'Are index funds always a better choice than actively managed funds?', a: 'Not necessarily — it depends heavily on the category. In India\'s large-cap segment, which is closely tracked by analysts and institutions, index funds have a genuinely strong case: SPIVA India scorecards have repeatedly shown that a majority of actively managed large-cap funds struggle to beat their benchmark after fees over long periods. Mid and small cap tell a different story — these segments are less researched and less efficiently priced, and the same SPIVA data has historically shown active funds outperforming their benchmarks more often here. A reasonable approach: lean towards low-cost index funds for your large-cap allocation, and evaluate active funds on their actual net track record for mid cap, small cap, and other less-efficient categories.' },
  { group: 'Choosing a Category', q: 'Does a higher expense ratio always mean lower returns?', a: 'No — and this is one of the most common misunderstandings about mutual funds. Every return figure you see, on this page or anywhere else, is calculated from its NAV, and the expense ratio is deducted daily before that NAV is struck. In other words, the fee is already baked into the number you\'re looking at. A fund with a 1.5% expense ratio and a 14% displayed return actually outperformed a fund with a 0.5% expense ratio and a 12% displayed return, fee and all. What matters is the net return relative to comparable funds and the benchmark. Where expense ratio deserves real weight is as a tie-breaker between two funds with genuinely similar net returns, or in categories like large-cap index funds where sustained outperformance is rare to begin with.' },
  { group: 'Choosing a Category', q: 'What is an Aggressive Hybrid fund vs a Conservative Hybrid fund?', a: 'Aggressive Hybrid funds invest 65–80% in equity and 20–35% in debt, qualifying as equity funds for tax purposes (holdings above 1 year are taxed at 12.5% LTCG). Conservative Hybrid funds flip this ratio: 10–25% in equity and 75–90% in debt, qualifying as debt funds for tax (with indexation benefits). Balanced Advantage Funds sit between these with a dynamic mandate. Aggressive Hybrid suits investors who want most of the equity upside but with a debt cushion; Conservative Hybrid suits investors who want mostly debt stability with a small equity kicker.' },

  // SIFs & Mutual Funds
  { group: 'SIFs & Mutual Funds', q: 'What is a Specialised Investment Fund (SIF) and how is it different from a mutual fund?', a: 'A Specialised Investment Fund (SIF) is a newer SEBI-regulated investment vehicle that sits between mutual funds and Portfolio Management Services (PMS). SIFs can use strategies mutual funds generally can\'t — such as long-short equity positions — and require a minimum investment of ₹10 lakh, compared to as little as ₹500 for a mutual fund SIP. They\'re aimed at investors who want more flexible, higher-conviction strategies than a traditional mutual fund but don\'t yet have the scale for a dedicated PMS.' },
  { group: 'SIFs & Mutual Funds', q: 'Why isn\'t there a SIP figure shown for SIFs?', a: 'SIFs do support SIP investments. We haven\'t enabled a SIP figure in the wealth simulator yet simply because there isn\'t enough real SIF NAV history available so far to model a meaningful SIP outcome — all wealth-simulation numbers for SIFs on this site currently assume a ₹10 lakh lumpsum instead, matching the minimum ticket size. We\'ll add SIP once sufficient data is available.' },
  { group: 'SIFs & Mutual Funds', q: 'Can I hold both mutual funds and SIFs in the same portfolio?', a: 'Yes. Many investors use SIFs as a satellite allocation alongside their core mutual fund portfolio, especially for strategies that SIFs uniquely enable — like long-short equity or higher-conviction concentrated positions. The Proposal Studio on this platform lets you build a combined analysis of both mutual funds and SIFs side by side, with shared overlap detection and unified sector/M-Cap exposure.' },
  { group: 'SIFs & Mutual Funds', q: 'How is a Mutual Fund different from PMS (Portfolio Management Services)?', a: 'Mutual funds pool money from thousands of investors into a single vehicle with a shared NAV. PMS manages a dedicated portfolio of individually-owned securities for each client, with much more flexibility on strategy and customisation. PMS has a SEBI minimum of ₹50 lakh, versus ₹10 lakh for SIFs and as little as ₹100–₹500 for mutual fund SIPs. PMS fees are typically performance-linked, whereas mutual funds charge only an expense ratio. The disclosure and oversight framework is different too — mutual funds publish full monthly holdings, while PMS reporting varies by provider.' },
  { group: 'SIFs & Mutual Funds', q: 'What is a Fund of Funds (FoF) and how does it compare?', a: 'A Fund of Funds (FoF) is a mutual fund that invests in units of other mutual funds rather than directly in stocks or bonds. They\'re used to get exposure to a basket of funds — international FoFs (e.g. investing in a US equity ETF), gold FoFs, or asset allocation FoFs — in a single, SIP-able vehicle. FoFs carry an additional layer of expense ratio on top of the underlying funds, which compounds over time. For tax purposes, FoFs investing predominantly in overseas equities or debt are treated as debt funds.' },

  // Stress Test & Liquidity
  { group: 'Stress Test & Liquidity', q: 'What is the Mutual Fund Stress Test & Liquidity Analysis?', a: 'As mandated by SEBI and AMFI, all Mid Cap and Small Cap mutual funds must disclose monthly stress test results. This liquidity analysis indicates the number of days a fund manager would take to liquidate 25% and 50% of the portfolio under stress conditions. It also details liability-side concentration (top 10 investors\' share), asset allocation breakdown (large, mid, small cap and cash %), and portfolio valuation (PE ratio) vs. benchmark to help investors evaluate portfolio risk in bloated or concentrated funds.' },
  { group: 'Stress Test & Liquidity', q: 'How do I interpret "Days to Liquidate" in the stress test data?', a: 'The "Days to Liquidate 50%" discloses how long the fund manager would need to sell half of the fund\'s assets in a market panic without causing severe price impact. Fewer days indicate high liquidity and lower redemption risk. As a rule of thumb: 1–5 days is excellent/highly liquid, 6–15 days is moderate, and more than 15 days suggests higher potential liquidity risk under market pressure.' },
  { group: 'Stress Test & Liquidity', q: 'Which categories are subject to the SEBI stress test mandate?', a: 'SEBI\'s mandatory monthly stress test disclosure applies specifically to Mid Cap and Small Cap funds. Large Cap and other equity fund categories are not currently required to publish this data, though many funds voluntarily include similar metrics in their factsheets. If you\'re investing in Mid Cap or Small Cap funds, stress test data is one of the most useful — and most underused — inputs for comparing funds in the same category.' },
  { group: 'Stress Test & Liquidity', q: 'What does a high top-10-investor concentration mean in the stress test?', a: 'A high top-10-investor concentration (e.g. top 10 investors hold 40%+ of a fund) means that if one or two large investors redeem, the fund manager may be forced to sell holdings quickly to meet redemptions — potentially at unfavourable prices, especially in a thinly-traded small cap portfolio. This is called redemption pressure or liquidity mismatch risk. For small cap and mid cap funds with large AUMs, this concentration metric is one of the more telling indicators of hidden redemption risk.' },

  // Portfolio Construction
  { group: 'Portfolio Construction', q: 'How many mutual funds should I hold in my portfolio?', a: 'Most financial research and advisory practitioners suggest 3–5 funds is optimal for most retail investors. Below 3, you\'re probably under-diversified across styles and managers. Above 5–7, you start creating hidden overlap — you\'re often just running a more expensive closet index fund. The right number depends on your goals: a single Flexi Cap or Balanced Advantage fund can be a complete portfolio for many investors, while more sophisticated portfolios might layer in a Mid Cap, Small Cap, and an international fund. More funds rarely means more diversification — it often means more administrative overhead and worse decisions during volatility.' },
  { group: 'Portfolio Construction', q: 'What is the difference between a Core and Satellite portfolio approach?', a: 'In a core-satellite approach, the "core" (typically 60–80% of the portfolio) consists of stable, diversified, lower-cost funds — often a Flexi Cap, Large Cap, or a broad index fund — that form the reliable foundation. The "satellite" (20–40%) consists of higher-risk, higher-conviction positions — like a Small Cap fund, a thematic bet, or a SIF — that aim to add alpha above the core. The advantage is that even if the satellite underperforms, the core protects most of your wealth. This structure also forces discipline: you decide the satellite allocation upfront rather than chasing themes reactively.' },
  { group: 'Portfolio Construction', q: 'What is portfolio overlap and why should I check it?', a: 'Portfolio overlap occurs when two or more funds you hold invest in the same underlying stocks. For example, if your Large Cap fund and your Flexi Cap fund both hold 5% in HDFC Bank, that\'s concentrated exposure to one company even though it looks like two separate "diversified" funds. High overlap means you\'re paying multiple expense ratios for what is effectively similar exposure. Our Proposal Studio can calculate exact pairwise overlap across any combination of mutual funds and SIFs using the minimum-weight method — the same approach used in professional investment research.' },
  { group: 'Portfolio Construction', q: 'Should I invest in Regular or Direct mutual fund plans?', a: 'Direct plans don\'t pay any distributor commission, so they have a lower expense ratio (typically 0.5–1% lower annually) and a higher NAV than Regular plans of the same fund. Over 10–20 years, this difference compounds significantly — often lakhs of rupees on a moderate-sized portfolio. Regular plans make financial sense only if your distributor provides ongoing, active advisory value that justifiably covers the expense difference: genuine financial planning, rebalancing guidance, goal tracking, and behavioural coaching during downturns. If you\'re choosing funds purely on a screener and managing your own portfolio, Direct plans are the more cost-efficient choice.' },
  { group: 'Portfolio Construction', q: 'How should I think about asset allocation across equity and debt?', a: 'Asset allocation — the split between equity, debt, and other asset classes — drives far more of long-term portfolio outcomes than fund selection within each class. A widely cited rule of thumb is "100 minus your age" in equity (e.g. 30-year-old: 70% equity, 30% debt), though modern practitioners often use "120 minus age" given longer life expectancies and lower real yields on debt. More practically: if you need the money within 1–2 years, stay in debt or liquid funds. 2–5 years: hybrid funds. 5+ years: equity-heavy allocation. Your actual risk tolerance (not just stated but demonstrated through how you behave during corrections) should refine this further.' },

  // Compliance
  { group: 'Compliance', q: 'Is this investment advice?', a: 'No. This is an educational data tool. Past performance is not indicative of future results, and nothing here is a recommendation to buy or sell any specific fund. Mutual fund investments are subject to market risks; please read all scheme-related documents carefully. Please consult a qualified AMFI Registered Mutual Fund Distributor or SEBI-Registered Investment Adviser (RIA) before making investment decisions.' },
  { group: 'Compliance', q: 'Who runs this screener and is it regulated?', a: 'This screener is built and operated by Abundance Financial Services, an AMFI Registered Mutual Fund and SIF Distributor (ARN-251838). Data is sourced directly from AMFI\'s official NAV and portfolio disclosures. The screener is an educational tool — it does not provide personalised investment advice and is not a SEBI-registered investment advisory service. We are regulated as a distributor, not as an investment adviser.' },
  { group: 'Compliance', q: 'How is the data sourced and how accurate is it?', a: 'NAV data is verified and sourced directly from AMFI\'s official daily NAV publication. Fund holdings are sourced from AMFI\'s monthly portfolio disclosure mandates. Stress test data is sourced from SEBI/AMFI mandated monthly disclosures. M-Cap categorization uses AMFI\'s official semi-annual Large/Mid/Small-cap categorization list. All data is displayed as-is from these authoritative sources — we do not adjust, estimate, or modify source figures. Errors in source data will be reflected here.' },
];
