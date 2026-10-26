/**
 * lib/sifParentAmc.js
 *
 * Definitive mapping and resolution utilities for SIF (Specialised Investment Fund)
 * brand names to their parent AMCs / fund houses.
 *
 * Context: Under SEBI SIF regulations (2024-25), SIF offerings are legally mandated
 * to operate under distinct brand names (e.g. iSIF, Arudha, Magnum, Sapphire, Titanium)
 * rather than traditional retail mutual fund names. Investors and distributors need to
 * know which established AMC / parent company is behind each SIF.
 */

export const SIF_PARENT_AMC = {
  // Brand name (normalized lowercase, with or without 'sif') -> { amc, short }
  'isif':         { amc: 'ICICI Prudential Mutual Fund',        short: 'ICICI Prudential' },
  'arudha':       { amc: 'Bandhan Mutual Fund',                 short: 'Bandhan' },
  'magnum':       { amc: 'SBI Mutual Fund',                     short: 'SBI' },
  'altiva':       { amc: 'Edelweiss Mutual Fund',               short: 'Edelweiss' },
  'apex':         { amc: 'Aditya Birla Sun Life Mutual Fund',   short: 'Aditya Birla' },
  'dynasif':      { amc: '360 ONE Mutual Fund',                 short: '360 ONE' },
  'arthaya':      { amc: 'Union Mutual Fund',                   short: 'Union' },
  'diviniti':     { amc: 'ITI Mutual Fund',                     short: 'ITI' },
  'sapphire':     { amc: 'Franklin Templeton Mutual Fund',      short: 'Franklin Templeton' },
  'summit':       { amc: 'Invesco Mutual Fund',                 short: 'Invesco' },
  'titanium':     { amc: 'Tata Mutual Fund',                    short: 'Tata' },
  'infinity':     { amc: 'Kotak Mahindra Mutual Fund',          short: 'Kotak' },
  'platinum':     { amc: 'Mirae Asset Mutual Fund',             short: 'Mirae Asset' },
  'prism':        { amc: 'Jio BlackRock Mutual Fund',           short: 'Jio BlackRock' },
  'qsif':         { amc: 'quant Mutual Fund',                   short: 'Quant' },
  'redhex':       { amc: 'HSBC Mutual Fund',                    short: 'HSBC' },
  'wsif':         { amc: 'The Wealth Company Mutual Fund',      short: 'The Wealth Company' },
  'eminence':     { amc: 'AlphaGrep Mutual Fund',               short: 'AlphaGrep' },

  // Upcoming / Announced AMC SIF Brands & Direct AMC Names
  'hsif':         { amc: 'HDFC Mutual Fund',                    short: 'HDFC' },
  'h-sif':        { amc: 'HDFC Mutual Fund',                    short: 'HDFC' },
  'accelerate':   { amc: 'Axis Mutual Fund',                    short: 'Axis' },
  'nivesh':       { amc: 'Nippon India Mutual Fund',            short: 'Nippon India' },
  'motilal':      { amc: 'Motilal Oswal Mutual Fund',           short: 'Motilal Oswal' },
  'dsp':          { amc: 'DSP Mutual Fund',                     short: 'DSP' },
  'uti':          { amc: 'UTI Mutual Fund',                     short: 'UTI' },
  'whiteoak':     { amc: 'WhiteOak Capital Mutual Fund',        short: 'WhiteOak' },
  'groww':        { amc: 'Groww Mutual Fund',                   short: 'Groww' },
  'zerodha':      { amc: 'Zerodha Mutual Fund',                 short: 'Zerodha' },
  'navi':         { amc: 'Navi Mutual Fund',                    short: 'Navi' },
  'sundaram':     { amc: 'Sundaram Mutual Fund',                short: 'Sundaram' },
  'canara':       { amc: 'Canara Robeco Mutual Fund',           short: 'Canara Robeco' },
  'baroda':       { amc: 'Baroda BNP Paribas Mutual Fund',      short: 'Baroda BNP Paribas' },
  'mahindra':     { amc: 'Mahindra Manulife Mutual Fund',       short: 'Mahindra Manulife' },
  'bajaj':        { amc: 'Bajaj Finserv Mutual Fund',           short: 'Bajaj Finserv' },
  'pgim':         { amc: 'PGIM India Mutual Fund',              short: 'PGIM India' },
  'mirae':        { amc: 'Mirae Asset Mutual Fund',             short: 'Mirae Asset' },
  'tata':         { amc: 'Tata Mutual Fund',                    short: 'Tata' },
  'icici':        { amc: 'ICICI Prudential Mutual Fund',        short: 'ICICI Prudential' },
  'bandhan':      { amc: 'Bandhan Mutual Fund',                 short: 'Bandhan' },
  'sbi':          { amc: 'SBI Mutual Fund',                     short: 'SBI' },
  'kotak':        { amc: 'Kotak Mahindra Mutual Fund',          short: 'Kotak' },
  'hdfc':         { amc: 'HDFC Mutual Fund',                    short: 'HDFC' },
};

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolves a SIF brand name or AMC string to its parent AMC object: { amc, short }
 * Returns null if not recognized.
 *
 * @param {string} sifName - e.g. "iSIF SIF", "Arudha SIF", "Titanium", "WSIF"
 * @returns {{ amc: string, short: string } | null}
 */
export function getSifParentAmc(sifName) {
  if (!sifName || typeof sifName !== 'string') return null;

  const raw = sifName.trim().toLowerCase();
  if (SIF_PARENT_AMC[raw]) return SIF_PARENT_AMC[raw];

  // Strip 'sif' word, 'mutual fund', 'amc'
  const stripped = raw
    .replace(/\b(sif|mutual\s+fund|amc|asset\s+management)\b/gi, '')
    .trim()
    .replace(/\s+/g, ' ');

  if (stripped && SIF_PARENT_AMC[stripped]) return SIF_PARENT_AMC[stripped];

  // First token
  const firstWord = stripped.split(/[\s-]+/)[0];
  if (firstWord && SIF_PARENT_AMC[firstWord]) return SIF_PARENT_AMC[firstWord];

  // Whole-word matching for keys
  for (const [key, val] of Object.entries(SIF_PARENT_AMC)) {
    const keyRe = new RegExp(`\\b${escapeRegex(key)}\\b`, 'i');
    if (keyRe.test(raw) || (stripped && keyRe.test(stripped))) {
      return val;
    }
  }

  return null;
}

/**
 * Formats a SIF brand name with its parent AMC in parentheses.
 * e.g. "iSIF SIF" -> "iSIF (ICICI Prudential)" or "iSIF SIF (ICICI Prudential)"
 *
 * @param {string} sifName - e.g. "iSIF SIF"
 * @param {{ cleanBrand?: boolean }} [options] - if true, removes trailing " SIF" from brand name (default: true)
 * @returns {string} - formatted string, e.g. "iSIF (ICICI Prudential)"
 */
export function formatSifBrandWithAmc(sifName, { cleanBrand = true } = {}) {
  if (!sifName) return '';
  const parent = getSifParentAmc(sifName);
  const brand = cleanBrand ? sifName.replace(/\s+SIF$/i, '').trim() : sifName;

  if (!parent) return brand;

  // Don't repeat if parent name or short name is already present as a distinct word in the brand
  const shortRe = new RegExp(`\\b${escapeRegex(parent.short)}\\b`, 'i');
  const amcRe = new RegExp(`\\b${escapeRegex(parent.amc)}\\b`, 'i');
  if (shortRe.test(brand) || amcRe.test(brand)) {
    return brand;
  }

  return `${brand} (${parent.short})`;
}
