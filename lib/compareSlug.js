/**
 * lib/compareSlug.js
 *
 * Slug generation, resolution, canonical ordering, and curated comparisons
 * for the mutual fund comparison engine at `/compare/[a]-vs-[b]`.
 *
 * Guarantees:
 * 1. Human-friendly, SEO-optimized slugs (e.g., `parag-parikh-flexi-cap-fund-vs-quant-flexi-cap-fund`).
 * 2. Deterministic alphabetical ordering to prevent search engine duplicate content penalties.
 * 3. Bidirectional resolution supporting AMFI numeric codes, trailing code slugs, and name slugs.
 */

import LINEAGE from '@/data/scheme-lineage.json';

/**
 * Normalizes a mutual fund scheme name into a clean, search-friendly kebab-case slug.
 * Strips plan artifacts (Direct/Regular/Growth/IDCW) and non-alphanumeric punctuation.
 */
export function toFundSlug(name) {
  return (name || '')
    .toLowerCase()
    .replace(/\s*\([^)]*formerly known as[^)]*\)/gi, '')
    .replace(/\s*-\s*(regular plan|direct plan|regular|direct|growth option|growth|idcw option|idcw|dividend|plan).*/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Resolves a single token (AMFI code or name slug) to a fund from `allFunds`.
 *
 * Resolution precedence:
 * 1. Exact AMFI code match (e.g. "122640")
 * 2. Trailing numeric code match (e.g. "parag-parikh-122640")
 * 3. Exact slug match against screener dataset
 * 4. Master scheme list translation (e.g. Direct Plan code "122639" -> Regular Plan "122640")
 * 5. Scheme lineage predecessor translation (merged schemes)
 */
export function resolveFundToken(token, allFunds, masterSchemes = null) {
  if (!token || !allFunds?.length) return null;
  const cleanToken = token.trim().toLowerCase();

  // 1. Exact AMFI code match
  const byCode = allFunds.find((f) => String(f.code) === cleanToken);
  if (byCode) return byCode;

  // 2. Trailing numeric code match (e.g., "fund-name-123456")
  const codeSuffixMatch = cleanToken.match(/-(\d{5,6})$/);
  if (codeSuffixMatch) {
    const code = codeSuffixMatch[1];
    const bySuffix = allFunds.find((f) => String(f.code) === code);
    if (bySuffix) return bySuffix;
  }

  // 3. Clean slug match against all screener funds
  const bySlug = allFunds.find((f) => toFundSlug(f.name) === cleanToken);
  if (bySlug) return bySlug;

  // 4. If token is numeric and masterSchemes is provided, map via scheme title
  if (masterSchemes && masterSchemes[cleanToken]) {
    const masterName = masterSchemes[cleanToken];
    const masterSlug = toFundSlug(masterName);
    const byMasterSlug = allFunds.find((f) => toFundSlug(f.name) === masterSlug);
    if (byMasterSlug) return byMasterSlug;
  }

  // 5. Check scheme-lineage.json predecessor mapping
  const succEntry = Object.entries(LINEAGE || {}).find(
    ([, entry]) => String(entry.pred) === cleanToken
  );
  if (succEntry) {
    const succCode = succEntry[0];
    const bySucc = allFunds.find((f) => String(f.code) === succCode);
    if (bySucc) return bySucc;
  }

  return null;
}

/**
 * Builds the canonical slug for a set of funds.
 * Funds are deterministically sorted alphabetically by their slug to prevent duplicate URLs.
 */
export function getCanonicalCompareSlug(funds) {
  if (!funds || funds.length < 2) return '';
  const slugs = funds.map((f) => toFundSlug(f.name || f.nav_name));
  return [...slugs].sort().join('-vs-');
}

/**
 * Parses and resolves a full comparison slug (e.g. `a-vs-b` or `a-vs-b-vs-c`).
 * Returns { funds, isCanonical, canonicalSlug } or null if resolution fails.
 */
export function resolveCompareFunds(slug, allFunds, masterSchemes = null) {
  if (!slug || typeof slug !== 'string') return null;
  const parts = slug.split('-vs-');
  if (parts.length < 2 || parts.length > 3) return null;

  const resolved = [];
  const seenCodes = new Set();

  for (const part of parts) {
    const fund = resolveFundToken(part, allFunds, masterSchemes);
    if (!fund) return null;
    if (seenCodes.has(fund.code)) return null; // Prevent comparing fund with itself
    seenCodes.add(fund.code);
    resolved.push(fund);
  }

  const canonicalSlug = getCanonicalCompareSlug(resolved);
  const isCanonical = slug === canonicalSlug;

  return {
    funds: resolved,
    isCanonical,
    canonicalSlug,
  };
}

/**
 * Curated high-intent comparison pairs across major AMFI categories.
 * Used for the `/compare` hub page and search engine crawl paths.
 */
export const POPULAR_COMPARISONS = [
  {
    category: 'Flexi Cap',
    description: 'India’s most popular multi-cap category with total fund manager allocation freedom.',
    pairs: [
      {
        slug: 'parag-parikh-flexi-cap-fund-vs-quant-flexi-cap-fund',
        title: 'Parag Parikh Flexi Cap vs Quant Flexi Cap',
        highlight: 'Value & Global Diversification vs High-Momentum Dynamic Allocation',
      },
      {
        slug: 'hdfc-flexi-cap-fund-vs-parag-parikh-flexi-cap-fund',
        title: 'HDFC Flexi Cap vs Parag Parikh Flexi Cap',
        highlight: 'Veteran Large-Cap Bias vs Consistent Cash-Generating Compounders',
      },
      {
        slug: 'jm-flexi-cap-fund-vs-quant-flexi-cap-fund',
        title: 'JM Flexi Cap vs Quant Flexi Cap',
        highlight: 'Fast-Rising Outperformer vs Aggressive Momentum Factor',
      },
      {
        slug: 'kotak-flexi-cap-fund-vs-parag-parikh-flexi-cap-fund',
        title: 'Kotak Flexi Cap vs Parag Parikh Flexi Cap',
        highlight: 'Steady Institutional Giant vs High-Conviction Focused Quality',
      },
    ],
  },
  {
    category: 'Large Cap & Index',
    description: 'Top 100 blue-chip market leaders and benchmark index replicators.',
    pairs: [
      {
        slug: 'icici-prudential-large-cap-fund-erstwhile-bluechip-fund-vs-nippon-india-large-cap-fund',
        title: 'ICICI Prudential Large Cap vs Nippon India Large Cap',
        highlight: 'Top 2 Actively Managed Large-Cap Giants by AUM',
      },
      {
        slug: 'hdfc-large-cap-fund-vs-icici-prudential-large-cap-fund-erstwhile-bluechip-fund',
        title: 'HDFC Large Cap vs ICICI Prudential Large Cap',
        highlight: 'Long-Term Legacy Track Record vs Consistent Benchmark Beater',
      },
      {
        slug: 'hdfc-nifty-50-index-fund-vs-uti-nifty-50-index-fund',
        title: 'HDFC Nifty 50 Index vs UTI Nifty 50 Index',
        highlight: 'Lowest Tracking Error & Expense Ratio Battle on Nifty 50',
      },
    ],
  },
  {
    category: 'Mid Cap',
    description: 'High-growth companies ranked 101–250 by market capitalization.',
    pairs: [
      {
        slug: 'axis-midcap-fund-vs-hdfc-mid-cap-fund',
        title: 'Axis Midcap vs HDFC Mid Cap',
        highlight: 'High-Alpha Focused Mid-Cap vs India’s Largest Mid-Cap Fund',
      },
      {
        slug: 'nippon-india-growth-mid-cap-fund-vs-quant-mid-cap-fund',
        title: 'Nippon India Growth Mid Cap vs Quant Mid Cap',
        highlight: '30-Year Wealth Creation Track Record vs Dynamic Factor Momentum',
      },
      {
        slug: 'kotak-mid-cap-fund-vs-sundaram-mid-cap-fund',
        title: 'Kotak Mid Cap vs Sundaram Mid Cap',
        highlight: 'Disciplined Growth at Reasonable Price vs Deep Value Mid-Cap Pick',
      },
    ],
  },
  {
    category: 'Multi Asset',
    description: 'Dynamic allocation across equity, debt, and gold/commodities in one scheme.',
    pairs: [
      {
        slug: 'icici-prudential-multi-asset-allocation-fund-vs-quant-multi-asset-allocation-fund',
        title: 'ICICI Prudential Multi Asset vs Quant Multi Asset',
        highlight: 'Largest Multi-Asset Track Record vs High-Momentum Dynamic Allocation',
      },
      {
        slug: 'hdfc-multi-asset-allocation-fund-vs-nippon-india-multi-asset-allocation-fund',
        title: 'HDFC Multi Asset vs Nippon India Multi Asset',
        highlight: 'Two Large-AMC Approaches to Equity-Debt-Gold Allocation',
      },
    ],
  },
  {
    category: 'Small Cap',
    description: 'High-octane emerging companies beyond top 250 market cap.',
    pairs: [
      {
        slug: 'nippon-india-small-cap-fund-vs-quant-small-cap-fund',
        title: 'Nippon India Small Cap vs Quant Small Cap',
        highlight: '₹60,000 Cr+ Small-Cap Anchor vs Rapid Trend Following Model',
      },
      {
        slug: 'bandhan-small-cap-fund-vs-tata-small-cap-fund',
        title: 'Bandhan Small Cap vs Tata Small Cap',
        highlight: 'Two Fast-Emerging Small-Cap Outperformers with High Alpha',
      },
      {
        slug: 'nippon-india-small-cap-fund-vs-sbi-small-cap-fund',
        title: 'Nippon India Small Cap vs SBI Small Cap',
        highlight: 'The Two Classic Long-Term Compounders in the Small-Cap Space',
      },
    ],
  },
  {
    category: 'Hybrid & Balanced Advantage',
    description: 'Dynamic asset allocation between equity and debt for lower downside volatility.',
    pairs: [
      {
        slug: 'hdfc-balanced-advantage-fund-vs-icici-prudential-balanced-advantage-fund',
        title: 'HDFC Balanced Advantage vs ICICI Prudential Balanced Advantage',
        highlight: 'The Two Largest Dynamic Asset Allocation Funds in India',
      },
      {
        slug: 'edelweiss-balanced-advantage-fund-vs-icici-prudential-balanced-advantage-fund',
        title: 'Edelweiss Balanced Advantage vs ICICI Prudential Balanced Advantage',
        highlight: 'Proprietary Equity Valuation Models in Head-to-Head Comparison',
      },
    ],
  },
];
