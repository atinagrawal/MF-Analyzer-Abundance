#!/usr/bin/env node
/**
 * scripts/build-reverse-holdings-index.mjs
 *
 * Inverts the Cloudflare R2 forward holdings cache (portfolio-creator-holdings/*.json
 * and pms-factsheets.json) into the high-performance PostgreSQL table:
 * stock_fund_holdings.
 *
 * Resolves each holding to an NSE ticker and ISIN via stock_signals, with
 * match_confidence tagging ('exact_isin', 'exact_symbol', 'normalized_name', 'manual_alias', 'unmatched').
 * Uses an atomic zero-downtime PostgreSQL staging table swap.
 *
 * Usage:
 *   node --env-file=.env.local scripts/build-reverse-holdings-index.mjs [options]
 *
 * Options:
 *   --dry-run     Parse and normalize holdings without writing to PostgreSQL
 *   --limit=N     Invert only the first N mutual fund schemes (useful for quick verification)
 */

import pool from '../lib/db.js';
import { r2Get } from '../lib/r2.js';

const CACHE_PREFIX = 'portfolio-creator-holdings/';
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

// Concurrency helper
async function pMap(items, fn, concurrency = 20) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── DERIVATIVE, CASH & DEBT FILTERS ──────────────────────────────────────────
const DERIVATIVE_OR_DEBT_RE = /(\b(futures?|options?|call|put|debentures?|bonds?|ncd|repo|treps|cblo|cd|cp|bill|tbill)\b|\$\$\s*$|\b\d{0,2}[-\s]?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[-\s]?\d{2,4}\*{0,2}\s*$|_\d{2}\/\d{2}\/\d{4})/i;

const GENERIC_CASH_PREFIXES = [
  'net current assets', 'net receivables', 'net receivables/payables',
  'cash & cash equivalents', 'cash and cash equivalents', 'reverse repo',
  'treps', 'cblo', 'repo', 'cash',
];

function isComparableHolding(securityName) {
  const name = (securityName || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return Boolean(name) && !GENERIC_CASH_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function isDerivativeOrDebtHolding(h) {
  const name = h.securityName || h.name || '';
  const slug = h.stockSlug || '';
  if (DERIVATIVE_OR_DEBT_RE.test(name) || DERIVATIVE_OR_DEBT_RE.test(slug)) return true;
  if (/[-._\s]\d{2}[-.\/]\d{2}[-.\/]\d{4}/.test(name) || /[-._\s]\d{2}[-.\/]\d{2}[-.\/]\d{4}/.test(slug)) return true;
  return false;
}

// ── NAME NORMALIZATION ───────────────────────────────────────────────────────
const CONGLOMERATE_PREFIXES = [
  'aditya birla', 'reliance', 'tata', 'bajaj', 'adani', 'birla',
  'mahindra', 'godrej', 'larsen', 'shriram', 'kotak', 'hdfc',
  'icici', 'sbi', 'tvs', 'sundaram', 'cholamandalam'
];

function cleanCompanyName(text) {
  return String(text || '')
    .toLowerCase()
    .trim()
    .replace(/^the\s+/i, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(limited|ltd|pvt\s+ltd|private\s+limited|pvt|co\s+ltd|llp|inc|plc)\b/gi, ' ')
    .replace(/\b(equity|eq|shares?|ord)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isSafeTruncatedMatch(cleanName, key) {
  if (!cleanName || !key) return false;
  if (cleanName === key) return true;

  const shorter = cleanName.length < key.length ? cleanName : key;
  const longer = cleanName.length < key.length ? key : cleanName;

  if (!longer.startsWith(shorter)) return false;

  const commonPrefix = shorter;
  if (commonPrefix.length < 15) return false;

  if (commonPrefix.length / longer.length < 0.75) return false;

  for (const cong of CONGLOMERATE_PREFIXES) {
    if (cleanName.startsWith(cong) || key.startsWith(cong)) {
      if (!commonPrefix.startsWith(cong) || commonPrefix.length < cong.length + 5) {
        return false;
      }
    }
  }

  return true;
}

// Curated high-confidence alias map (e.g. corporate rebrands, major conglomerates, foreign stocks)
const KNOWN_ALIASES = {
  // Conglomerate families & key disambiguations
  'reliance-industries-ltd': 'RELIANCE',
  'reliance-industries': 'RELIANCE',
  'reliance': 'RELIANCE',
  'reliance-power-ltd': 'RPOWER',
  'reliance-power': 'RPOWER',
  'reliance-industrial-infrastructure-ltd': 'RIIL',
  'reliance-industrial-infrastructure': 'RIIL',
  'adani-enterprises-ltd': 'ADANIENT',
  'adani-enterprises': 'ADANIENT',
  'adani-enterprises-limited': 'ADANIENT',
  'adani-ports-and-special-economic-zone-ltd': 'ADANIPORTS',
  'adani-ports-and-special-economic-zone': 'ADANIPORTS',
  'adani-ports': 'ADANIPORTS',
  'adani-ports-sez': 'ADANIPORTS',
  'adani-total-gas-ltd': 'ATGL',
  'adani-total-gas': 'ATGL',
  'adani-wilmar-ltd': 'AWL',
  'adani-wilmar': 'AWL',
  'birlasoft-ltd': 'BSOFT',
  'birlasoft': 'BSOFT',
  'tata-motors-ltd': 'TMPV',
  'tata-motors': 'TMPV',
  'tata-motors-ltd-22': 'TMCV',
  'tata-consultancy-services-ltd': 'TCS',
  'tata-consultancy-services': 'TCS',
  'tcs': 'TCS',
  'mahindra-and-mahindra-ltd': 'M&M',
  'mahindra-mahindra-ltd': 'M&M',
  'mandm': 'M&M',
  'larsen-and-toubro-ltd': 'LT',
  'larsen-toubro-ltd': 'LT',
  'lt': 'LT',
  'ltimindtree-ltd': 'LTIM',
  'ltimindtree': 'LTIM',
  'larsen-toubro-infotech-ltd': 'LTIM',
  // Major corporate renames & ticker discrepancies
  'power-grid-corporation-of-india-ltd': 'POWERGRID',
  'power-grid-corporation-of-india': 'POWERGRID',
  'power-grid': 'POWERGRID',
  'powergrid': 'POWERGRID',
  'the-federal-bank-ltd': 'FEDERALBNK',
  'federal-bank': 'FEDERALBNK',
  'federal-bank-ltd': 'FEDERALBNK',
  'federalbnk': 'FEDERALBNK',
  'bajaj-holdings-investment-ltd': 'BAJAJHLDNG',
  'bajaj-holdings-and-investment-ltd': 'BAJAJHLDNG',
  'bajaj-holdings': 'BAJAJHLDNG',
  'bajajhldng': 'BAJAJHLDNG',
  'motherson-sumi-systems-ltd': 'MOTHERSON',
  'samvardhana-motherson-international-ltd': 'MOTHERSON',
  'motherson': 'MOTHERSON',
  'fsn-ecommerce-ventures-ltd': 'NYKAA',
  'fsn-e-commerce-ventures-ltd': 'NYKAA',
  'nykaa': 'NYKAA',
  'sona-blw-precision-forgings-ltd': 'SONACOMS',
  'sonacoms': 'SONACOMS',
  'hdfc-standard-life-insurance-co-ltd': 'HDFCLIFE',
  'hdfc-life-insurance-co-ltd': 'HDFCLIFE',
  'hdfc-life-insurance-company-ltd': 'HDFCLIFE',
  'hdfclife': 'HDFCLIFE',
  'sbi-life-insurance-company-ltd': 'SBILIFE',
  'sbilife': 'SBILIFE',
  'adani-transmission-ltd': 'ADANIENSOL',
  'adani-energy-solutions-ltd': 'ADANIENSOL',
  'adaniensol': 'ADANIENSOL',
  'max-healthcare-institute-ltd': 'MAXHEALTH',
  'maxhealth': 'MAXHEALTH',
  'hindustan-petroleum-corporation-ltd': 'HINDPETRO',
  'hindpetro': 'HINDPETRO',
  'oil-natural-gas-corporation-ltd': 'ONGC',
  'ongc': 'ONGC',
  'jindal-steel-power-ltd': 'JINDALSTEL',
  'jindalstel': 'JINDALSTEL',
  'icici-lombard-general-insurance-co-ltd': 'ICICIGI',
  'icicigi': 'ICICIGI',
  'cholamandalam-investment-finance-company-ltd': 'CHOLAFIN',
  'cholafin': 'CHOLAFIN',
  'cg-power-industrial-solutions-ltd': 'CGPOWER',
  'cgpower': 'CGPOWER',
  'mahindra-mahindra-financial-services-ltd': 'M&MFIN',
  'm-and-m-financial-services-ltd': 'M&MFIN',
  'mmfin': 'M&MFIN',
  'dixon-technologies-india-ltd': 'DIXON',
  'dixon': 'DIXON',
  'apollo-hospitals-enterprise-ltd': 'APOLLOHOSP',
  'apollohosp': 'APOLLOHOSP',
  'shriram-transport-finance-company-ltd': 'SHRIRAMFIN',
  'shriramfin': 'SHRIRAMFIN',
  'icici-prudential-life-insurance-company-ltd': 'ICICIPRULI',
  'icicipruli': 'ICICIPRULI',
  'tata-power-company-ltd': 'TATAPOWER',
  'tatapower': 'TATAPOWER',
  'kalpataru-power-transmission-ltd': 'KPIL',
  'kpil': 'KPIL',
  'sbi-cards-payment-services-ltd': 'SBICARD',
  'sbicard': 'SBICARD',
  'bharat-petroleum-corporation-ltd': 'BPCL',
  'bpcl': 'BPCL',
  'krishna-institute-of-medical-sciences-ltd': 'KIMS',
  'kims': 'KIMS',
  'crompton-greaves-consumer-electricals-ltd': 'CROMPTON',
  'crompton': 'CROMPTON',
  'wabco-india-ltd': 'ZFCVINDIA',
  'zf-commercial-vehicle-control-systems-india-ltd': 'ZFCVINDIA',
  'adani-ports-and-special-economic-zone-ltd': 'ADANIPORTS',
  'adaniports': 'ADANIPORTS',
  'reliance-nippon-life-asset-management-ltd': 'NAM-INDIA',
  'nippon-life-india-asset-management-ltd': 'NAM-INDIA',
  'amber-enterprises-india-ltd': 'AMBER',
  'amber': 'AMBER',
  'jk-cement-ltd': 'JKCEMENT',
  'jkcement': 'JKCEMENT',
  'phoenix-mills-ltd': 'PHOENIXLTD',
  'pi-industries-ltd': 'PIIND',
  'piind': 'PIIND',
  'ti-financial-holdings-ltd': 'CHOLAHLDNG',
  'cholamandalam-financial-holdings-ltd': 'CHOLAHLDNG',
  'zomato': 'ETERNAL',
  'zomato-ltd': 'ETERNAL',
  'eternal': 'ETERNAL',
  'eternal-ltd': 'ETERNAL',
  'paytm': 'PAYTM',
  'one-97-communications': 'PAYTM',
  'one-97-communications-ltd': 'PAYTM',
  'one-97-communications-limited': 'PAYTM',
  'state-bank-of-india': 'SBIN',
  'sbi': 'SBIN',
  'larsen-and-toubro': 'LT',
  'larsen-toubro': 'LT',
  'l-and-t': 'LT',
  'tata-motors': 'TMPV',
  'tata-motors-ltd': 'TMPV',
  'tata-consultancy-services': 'TCS',
  'tata-consultancy-services-ltd': 'TCS',
  'maruti-suzuki-india': 'MARUTI',
  'maruti-suzuki': 'MARUTI',
  'mahindra-and-mahindra': 'M&M',
  'm-and-m': 'M&M',
  'hindustan-unilever': 'HINDUNILVR',
  'hindustan-unilever-ltd': 'HINDUNILVR',
  'hdfc-bank': 'HDFCBANK',
  'hdfc-bank-ltd': 'HDFCBANK',
  'icici-bank': 'ICICIBANK',
  'icici-bank-ltd': 'ICICIBANK',
  'kotak-mahindra-bank': 'KOTAKBANK',
  'axis-bank': 'AXISBANK',
  'axis-bank-ltd': 'AXISBANK',
  'bharti-airtel': 'BHARTIARTL',
  'bharti-airtel-ltd': 'BHARTIARTL',
  'reliance-industries': 'RELIANCE',
  'reliance-industries-ltd': 'RELIANCE',
  'itc': 'ITC',
  'itc-ltd': 'ITC',
  'infosys': 'INFY',
  'infosys-ltd': 'INFY',
  'bajaj-finance': 'BAJFINANCE',
  'bajaj-finance-ltd': 'BAJFINANCE',
  'bajaj-finserv': 'BAJAJFINSV',
  'multicommodity-exchange-of-india': 'MCX',
  'multi-commodity-exchange-of-india': 'MCX',
  'multi-commodity-exchange-of-india-ltd': 'MCX',
  'bse': 'BSE',
  'bse-ltd': 'BSE',
  'cdsl': 'CDSL',
  'central-depository-services-india': 'CDSL',
  'kalyan-jewellers-india': 'KALYANKJIL',
  'kalyan-jewellers-india-ltd': 'KALYANKJIL',
};

// Builds stock lookup dictionaries from stock_signals
async function buildStockIndex() {
  console.log('[Indexer] Loading active stock universe from stock_signals...');
  const res = await pool.query(`
    SELECT symbol, name, isin
    FROM (
      SELECT DISTINCT symbol, name, isin
      FROM stock_signals
      WHERE symbol IS NOT NULL
        AND symbol NOT LIKE '%PP'
        AND symbol NOT LIKE '%P1'
        AND symbol NOT LIKE '%P2'
    ) t
    ORDER BY CASE WHEN isin LIKE 'INE%' THEN 0 ELSE 1 END, length(symbol) ASC
  `);
  
  const sectorRes = await pool.query(`SELECT isin, sector FROM sector_isin_map WHERE isin IS NOT NULL`).catch(() => ({ rows: [] }));
  const isinSectorMap = new Map();
  for (const row of sectorRes.rows) {
    if (row.isin) isinSectorMap.set(row.isin.toUpperCase().trim(), row.sector);
  }

  const symbolMap = new Map();     // UPPERCASE SYMBOL -> { symbol, name, isin, sector }
  const isinMap = new Map();       // ISIN -> { symbol, name, isin, sector }
  const cleanNameMap = new Map();  // cleanedName -> { symbol, name, isin, sector }
  const slugMap = new Map();       // slugified name -> { symbol, name, isin, sector }

  for (const row of res.rows) {
    const sym = row.symbol.toUpperCase().trim();
    const isin = row.isin ? row.isin.toUpperCase().trim() : null;
    const sector = (isin && isinSectorMap.get(isin)) || null;
    const stockInfo = { symbol: sym, name: row.name, isin, sector };

    symbolMap.set(sym, stockInfo);
    if (isin) isinMap.set(isin, stockInfo);

    const cleanName = cleanCompanyName(row.name);
    if (cleanName && !cleanNameMap.has(cleanName)) {
      cleanNameMap.set(cleanName, stockInfo);
    }

    const sSlug = slugify(row.name);
    if (sSlug && !slugMap.has(sSlug)) {
      slugMap.set(sSlug, stockInfo);
    }
    const symSlug = slugify(sym);
    if (symSlug && !slugMap.has(symSlug)) {
      slugMap.set(symSlug, stockInfo);
    }
  }

  console.log(`[Indexer] Indexed ${symbolMap.size} stocks from stock_signals.`);
  return { symbolMap, isinMap, cleanNameMap, slugMap, isinSectorMap };
}

// Matches a holding to a stock_signals record with confidence tagging
function resolveStock(securityName, rawSlug, rawIsin, stockIndex) {
  const { symbolMap, isinMap, cleanNameMap, slugMap, isinSectorMap } = stockIndex;
  const canonicalSlug = rawSlug ? slugify(rawSlug) : slugify(securityName);
  const cleanName = cleanCompanyName(securityName);

  const formatResult = (match, confidence) => {
    let displayCompany = securityName;
    if (!displayCompany || displayCompany.toUpperCase() === match.symbol || displayCompany.length <= 4) {
      displayCompany = match.name;
    }
    return {
      stockSlug: canonicalSlug,
      ticker: match.symbol,
      isin: match.isin,
      companyName: displayCompany,
      sector: match.sector,
      matchConfidence: confidence,
    };
  };

  // 0. Match by ISIN first if provided
  if (rawIsin && isinMap.has(rawIsin.toUpperCase().trim())) {
    const match = isinMap.get(rawIsin.toUpperCase().trim());
    return formatResult(match, 'exact_isin');
  }

  // 1. Manual alias match (high priority for corporate renames / commercial brands)
  if (KNOWN_ALIASES[canonicalSlug] || (cleanName && KNOWN_ALIASES[cleanName])) {
    const aliasTicker = KNOWN_ALIASES[canonicalSlug] || KNOWN_ALIASES[cleanName];
    const match = symbolMap.get(aliasTicker);
    if (match) {
      return formatResult(match, 'manual_alias');
    }
  }

  // 2. Normalized name exact match (AMC disclosed securityName is primary truth)
  if (cleanName && cleanNameMap.has(cleanName)) {
    const match = cleanNameMap.get(cleanName);
    return formatResult(match, 'normalized_name');
  }

  // 3. Direct symbol match
  const directSym = canonicalSlug.toUpperCase();
  if (symbolMap.has(directSym)) {
    const match = symbolMap.get(directSym);
    // If securityName is provided, ensure it's compatible
    if (!cleanName || cleanName === cleanCompanyName(match.name) || cleanName === match.symbol.toLowerCase()) {
      return formatResult(match, 'exact_symbol');
    }
  }

  // 4. Slug match against stock_signals WITH COMPATIBILITY CHECK
  if (slugMap.has(canonicalSlug)) {
    const match = slugMap.get(canonicalSlug);
    // Verify compatibility if securityName is provided (avoids Birlasoft vs KPIT bug)
    if (cleanName) {
      const cleanMatchName = cleanCompanyName(match.name);
      const nameWords = cleanName.split(' ').filter(w => w.length > 2);
      const matchWords = cleanMatchName.split(' ').filter(w => w.length > 2);
      const hasOverlap = nameWords.some(w => matchWords.includes(w)) || nameWords.includes(match.symbol.toLowerCase());
      if (hasOverlap) {
        return formatResult(match, 'exact_symbol');
      }
      // Slug mismatch detected: fall through rather than assigning wrong company!
    } else {
      return formatResult(match, 'exact_symbol');
    }
  }

  // 5. Prefix match for truncated stock_signals names (>= 15 chars, >= 75% coverage, conglomerate-safe)
  if (cleanName && cleanName.length >= 15) {
    for (const [key, match] of cleanNameMap.entries()) {
      if (isSafeTruncatedMatch(cleanName, key)) {
        return formatResult(match, 'normalized_name');
      }
    }
  }

  // 6. Unmatched (retains canonical slug without dropping)
  return {
    stockSlug: canonicalSlug,
    ticker: null,
    isin: null,
    companyName: securityName || canonicalSlug,
    sector: null,
    matchConfidence: 'unmatched',
  };
}

async function getTargetMutualFunds() {
  const query = `
    SELECT code, name, category, amc, nav, ret_3y
    FROM mf_screener
    WHERE (
      category ILIKE '%equity%'
      OR category ILIKE '%hybrid%'
      OR category ILIKE '%elss%'
      OR category ILIKE '%solution%'
      OR category ILIKE '%children%'
      OR category ILIKE '%retirement%'
    )
    AND category NOT ILIKE '%debt%'
    AND category NOT ILIKE '%gold%'
    AND category NOT ILIKE '%silver%'
    AND category NOT ILIKE '%commodity%'
    ORDER BY ret_3y DESC NULLS LAST, code ASC;
  `;
  const res = await pool.query(query);
  return res.rows;
}

const MONTH_MAP = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12'
};

function toIsoDate(str, defaultDate = '2026-08-31') {
  if (!str) return defaultDate;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  // YYYY-MM
  if (/^\d{4}-\d{2}$/.test(str)) {
    const [y, m] = str.split('-');
    const lastDay = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
    return `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
  }

  // DD-Mon-YYYY or DD/Mon/YYYY
  const ddMonYyyy = /^(\d{1,2})[-/]([A-Za-z]+)[-/](\d{4})$/.exec(str);
  if (ddMonYyyy) {
    const d = ddMonYyyy[1].padStart(2, '0');
    const mStr = ddMonYyyy[2].toLowerCase();
    const m = MONTH_MAP[mStr] || MONTH_MAP[mStr.slice(0, 3)];
    const y = ddMonYyyy[3];
    if (m) return `${y}-${m}-${d}`;
  }

  // Mon-YYYY or Month-YYYY or Month YYYY
  const monYyyy = /^([A-Za-z]+)[-/\s](\d{4})$/.exec(str);
  if (monYyyy) {
    const mStr = monYyyy[1].toLowerCase();
    const m = MONTH_MAP[mStr] || MONTH_MAP[mStr.slice(0, 3)];
    const y = monYyyy[2];
    if (m) {
      const lastDay = new Date(parseInt(y, 10), parseInt(m, 10), 0).getDate();
      return `${y}-${m}-${String(lastDay).padStart(2, '0')}`;
    }
  }

  return defaultDate;
}

async function main() {
  console.log('='.repeat(70));
  console.log('Reverse Holdings Engine: Batch Inversion & Normalization (§5.1)');
  console.log(`Modes: dry-run=${isDryRun}, limit=${limit === Infinity ? 'ALL' : limit}`);
  console.log('='.repeat(70));

  const stockIndex = await buildStockIndex();

  // Load AUM map from R2 for fallback market value calculation
  console.log('[Indexer] Loading amfi-aum.json from R2...');
  const amfiAum = (await r2Get('amfi-aum.json').catch(() => ({}))) || {};

  // Load PMS factsheets from R2
  console.log('[Indexer] Loading pms-factsheets.json from R2...');
  const pmsData = (await r2Get('pms-factsheets.json').catch(() => ({}))) || {};

  const targetFunds = await getTargetMutualFunds();
  console.log(`[Universe] Found ${targetFunds.length} mutual funds to inspect.`);

  const fundsToProcess = targetFunds.slice(0, limit);
  console.log(`[Inversion] Fetching cached holdings from R2 for ${fundsToProcess.length} mutual funds...`);

  // Map of unique (stock_slug, scheme_code) -> aggregated holding row
  const holdingsMap = new Map();

  // 1. Process Mutual Funds
  const mfPayloads = await pMap(
    fundsToProcess,
    async (fund) => {
      try {
        const cached = await r2Get(`${CACHE_PREFIX}${fund.code}.json`);
        return { fund, data: cached?.data || null };
      } catch {
        return { fund, data: null };
      }
    },
    25
  );

  let mfCount = 0;
  let mfHoldingsCount = 0;

  for (const { fund, data } of mfPayloads) {
    if (!data || !Array.isArray(data.holdings) || data.holdings.length === 0) continue;
    mfCount++;

    const aumCr = parseFloat(amfiAum?.[fund.code]?.aumCr) || parseFloat(data.aumCr) || 0;
    const asOfDate = toIsoDate(data.aumAsOf || data.asOfDate || '2026-08-31');

    for (const h of data.holdings) {
      // 1. Strict Equity check -- NEVER let stockSlug bypass assetClass!
      const assetClass = (h.assetClass || '').toUpperCase().trim();
      if (assetClass && assetClass !== 'EQUITY') continue;

      const securityName = h.securityName || h.name || '';
      if (!securityName && !h.stockSlug) continue;

      // 2. Exclude generic cash buckets (TREPS, REPO, Net Current Assets, etc.)
      if (!isComparableHolding(securityName)) continue;

      // 3. Exclude derivatives (Futures, Options, Calls, Puts) & debt instruments
      if (isDerivativeOrDebtHolding(h)) continue;

      const resolved = resolveStock(securityName, h.stockSlug, h.isin, stockIndex);
      const weightPct = parseFloat(h.weightagePct) || 0;

      // Market value waterfall:
      // Primary: normalized holding marketValueCr
      // Fallback: (weight / 100) * aumCr
      let marketValueCr = parseFloat(h.marketValueCr) || 0;
      if (!marketValueCr && weightPct > 0 && aumCr > 0) {
        marketValueCr = (weightPct / 100) * aumCr;
      }
      marketValueCr = marketValueCr > 0 ? Math.round(marketValueCr * 100) / 100 : null;

      const key = `${resolved.stockSlug}::${fund.code}`;
      const sector = resolved.sector || h.sector || 'Diversified';

      if (holdingsMap.has(key)) {
        const existing = holdingsMap.get(key);
        existing.weight_pct = Math.round((existing.weight_pct + weightPct) * 1000) / 1000;
        if (marketValueCr != null) {
          existing.market_value_cr = Math.round(((existing.market_value_cr || 0) + marketValueCr) * 100) / 100;
        }
      } else {
        holdingsMap.set(key, {
          stock_slug: resolved.stockSlug,
          ticker: resolved.ticker,
          isin: resolved.isin,
          company_name: resolved.companyName,
          sector: sector,
          holder_type: 'MF',
          scheme_code: String(fund.code),
          scheme_name: fund.name,
          provider_name: fund.amc,
          category: fund.category,
          weight_pct: Math.round(weightPct * 1000) / 1000,
          market_value_cr: marketValueCr,
          as_of_date: asOfDate,
          match_confidence: resolved.matchConfidence,
        });
        mfHoldingsCount++;
      }
    }
  }

  console.log(`[Inversion] Processed ${mfCount} mutual funds with ${mfHoldingsCount} holdings.`);

  // 2. Process PMS Strategies
  let pmsStrategyCount = 0;
  let pmsHoldingsCount = 0;

  for (const provider of Object.values(pmsData.providers || {})) {
    const provName = provider.name || provider.providerName || 'PMS Provider';
    for (const doc of provider.documents || []) {
      const holdings = doc.extracted?.topHoldings || doc.extracted?.holdings;
      if (!Array.isArray(holdings) || holdings.length === 0) continue;

      pmsStrategyCount++;
      const stratName = doc.strategyName || doc.title || 'PMS Strategy';
      const stratCode = doc.strategyId || doc.id || slugify(`${provName}-${stratName}`);
      const asOfDate = toIsoDate(doc.period, '2026-08-31');

      for (const h of holdings) {
        const stockName = h.name || h.securityName || '';
        if (!stockName) continue;

        // Exclude cash buckets
        if (!isComparableHolding(stockName)) continue;

        // Exclude derivatives & debt
        if (isDerivativeOrDebtHolding(h)) continue;

        const resolved = resolveStock(stockName, h.slug, h.isin, stockIndex);
        const weightPct = parseFloat(h.weightPct ?? h.weightage ?? h.weight) || 0;

        const key = `${resolved.stockSlug}::${stratCode}`;
        const sector = resolved.sector || h.sector || 'Diversified';

        if (holdingsMap.has(key)) {
          const existing = holdingsMap.get(key);
          existing.weight_pct = Math.round((existing.weight_pct + weightPct) * 1000) / 1000;
        } else {
          holdingsMap.set(key, {
            stock_slug: resolved.stockSlug,
            ticker: resolved.ticker,
            isin: resolved.isin,
            company_name: resolved.companyName,
            sector: sector,
            holder_type: 'PMS',
            scheme_code: String(stratCode),
            scheme_name: stratName,
            provider_name: provName,
            category: doc.category || 'PMS Strategy',
            weight_pct: Math.round(weightPct * 1000) / 1000,
            market_value_cr: null, // Disclosed PMS factsheets report weight % only
            as_of_date: asOfDate,
            match_confidence: resolved.matchConfidence,
          });
          pmsHoldingsCount++;
        }
      }
    }
  }

  console.log(`[Inversion] Processed ${pmsStrategyCount} PMS strategies with ${pmsHoldingsCount} holdings.`);
  console.log(`[Summary] Total aggregated holdings to write: ${holdingsMap.size}`);

  // Confidence distribution statistics
  const confidenceStats = { exact_isin: 0, exact_symbol: 0, normalized_name: 0, manual_alias: 0, unmatched: 0 };
  for (const row of holdingsMap.values()) {
    confidenceStats[row.match_confidence] = (confidenceStats[row.match_confidence] || 0) + 1;
  }
  console.log('[Confidence Breakdown]', confidenceStats);

  if (isDryRun) {
    console.log('[Dry-Run] Skipped database write.');
    await pool.end();
    process.exit(0);
  }

  // 3. Batch insert into staging table
  console.log('[Database] Truncating staging table stock_fund_holdings_staging...');
  await pool.query(`TRUNCATE TABLE stock_fund_holdings_staging;`);

  const allRows = Array.from(holdingsMap.values());
  const CHUNK_SIZE = 500;
  console.log(`[Database] Inserting ${allRows.length} rows into staging in chunks of ${CHUNK_SIZE}...`);

  for (let i = 0; i < allRows.length; i += CHUNK_SIZE) {
    const chunk = allRows.slice(i, i + CHUNK_SIZE);
    const valuePlaceholders = [];
    const params = [];
    let pIdx = 1;

    for (const r of chunk) {
      valuePlaceholders.push(`($${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++})`);
      params.push(
        r.stock_slug,
        r.ticker,
        r.isin,
        r.company_name,
        r.sector,
        r.holder_type,
        r.scheme_code,
        r.scheme_name,
        r.provider_name,
        r.category,
        r.weight_pct,
        r.market_value_cr,
        r.as_of_date,
        r.match_confidence
      );
    }

    const insertSql = `
      INSERT INTO stock_fund_holdings_staging (
        stock_slug, ticker, isin, company_name, sector,
        holder_type, scheme_code, scheme_name, provider_name,
        category, weight_pct, market_value_cr, as_of_date, match_confidence
      ) VALUES ${valuePlaceholders.join(',\n')}
      ON CONFLICT (stock_slug, scheme_code) DO UPDATE SET
        weight_pct = EXCLUDED.weight_pct,
        market_value_cr = EXCLUDED.market_value_cr,
        updated_at = NOW();
    `;
    await pool.query(insertSql, params);
  }

  // 4. Atomic zero-downtime refresh via transactional swap
  console.log('[Database] Performing atomic transactional refresh...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM stock_fund_holdings;');
    await client.query(`
      INSERT INTO stock_fund_holdings (
        stock_slug, ticker, isin, company_name, sector,
        holder_type, scheme_code, scheme_name, provider_name,
        category, weight_pct, market_value_cr, as_of_date, match_confidence
      )
      SELECT
        stock_slug, ticker, isin, company_name, sector,
        holder_type, scheme_code, scheme_name, provider_name,
        category, weight_pct, market_value_cr, as_of_date, match_confidence
      FROM stock_fund_holdings_staging;
    `);
    await client.query('TRUNCATE stock_fund_holdings_staging;');
    await client.query('COMMIT');
    console.log('✅ [Database] Atomic transactional refresh completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ [Database] Atomic refresh failed, transaction rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }

  // 5. Verification summary
  const summaryRes = await pool.query(`
    SELECT
      count(*) as total_rows,
      count(DISTINCT stock_slug) as unique_stocks,
      count(DISTINCT ticker) as unique_tickers,
      count(*) FILTER (WHERE match_confidence != 'unmatched') as matched_rows,
      count(*) FILTER (WHERE match_confidence = 'unmatched') as unmatched_rows,
      sum(market_value_cr) as total_val_cr
    FROM stock_fund_holdings;
  `);
  console.log('\n' + '='.repeat(70));
  console.log('FINAL DATABASE VERIFICATION:');
  console.table(summaryRes.rows);
  console.log('='.repeat(70));

  await pool.end();
}

main().catch(async (err) => {
  console.error('FATAL:', err);
  try { await pool.end(); } catch {}
  process.exit(1);
});
