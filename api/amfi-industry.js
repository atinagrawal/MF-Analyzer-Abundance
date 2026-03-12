/**
 * /api/amfi-industry
 * Fetches AMFI monthly report PDF and returns parsed industry data as JSON.
 * Cached for 24 hours on Vercel CDN (s-maxage=86400).
 *
 * Query params:
 *   ?month=feb&year=2026   (defaults to latest available)
 *
 * Response: JSON with AUM, flows, folios by category
 */

export const config = { runtime: 'edge' };

const MONTH_MAP = {
  jan: 'jan', feb: 'feb', mar: 'mar', apr: 'apr',
  may: 'may', jun: 'jun', jul: 'jul', aug: 'aug',
  sep: 'sep', oct: 'oct', nov: 'nov', dec: 'dec'
};

// Determine latest likely available month (AMFI publishes ~10th of next month)
function getLatestMonth() {
  const now = new Date();
  const day = now.getUTCDate();
  // If before 10th, use month before last; else use last month
  const offset = day < 10 ? 2 : 1;
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const mon = d.toLocaleString('en-US', { month: 'short' }).toLowerCase();
  return { mon, year: d.getFullYear() };
}

function parseNumber(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/,/g, '').trim()) || 0;
}

// Parse category row: extract 7 numbers after a known category label
function extractRow(text, label) {
  // Match label then capture the numbers that follow on same/next lines
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(escaped + '[\\s\\S]{0,300}?([\\d,]+)\\s+([\\d,]+)\\s+([\\d,]+(?:\\.\\d+)?)\\s+([\\d,]+(?:\\.\\d+)?)\\s+(-?[\\d,]+(?:\\.\\d+)?)\\s+([\\d,]+(?:\\.\\d+)?)\\s+([\\d,]+(?:\\.\\d+)?)');
  const m = text.match(re);
  if (!m) return null;
  return {
    schemes:    parseNumber(m[1]),
    folios:     parseNumber(m[2]),
    inflow:     parseNumber(m[3]),
    redemption: parseNumber(m[4]),
    netFlow:    parseNumber(m[5]),
    aum:        parseNumber(m[6]),
    avgAum:     parseNumber(m[7])
  };
}

// Parse Grand Total row
function extractGrandTotal(text) {
  const re = /Grand Total\s+([\d,]+)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+(-?[\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)/;
  const m = text.match(re);
  if (!m) return null;
  return {
    schemes:    parseNumber(m[1]),
    folios:     parseNumber(m[2]),
    inflow:     parseNumber(m[3]),
    redemption: parseNumber(m[4]),
    netFlow:    parseNumber(m[5] || '0'),
    aum:        parseNumber(m[6]),
    avgAum:     parseNumber(m[7] || '0')
  };
}

const CATEGORIES = [
  // Debt
  { key: 'overnightFund',          label: 'Overnight Fund',                           type: 'debt' },
  { key: 'liquidFund',             label: 'Liquid Fund',                               type: 'debt' },
  { key: 'ultraShortDuration',     label: 'Ultra Short Duration Fund',                 type: 'debt' },
  { key: 'lowDuration',            label: 'Low Duration Fund',                         type: 'debt' },
  { key: 'moneyMarket',            label: 'Money Market Fund',                         type: 'debt' },
  { key: 'shortDuration',          label: 'Short Duration Fund',                       type: 'debt' },
  { key: 'mediumDuration',         label: 'Medium Duration Fund',                      type: 'debt' },
  { key: 'mediumToLong',           label: 'Medium to Long Duration Fund',              type: 'debt' },
  { key: 'longDuration',           label: 'Long Duration Fund',                        type: 'debt' },
  { key: 'dynamicBond',            label: 'Dynamic Bond Fund',                         type: 'debt' },
  { key: 'corporateBond',          label: 'Corporate Bond Fund',                       type: 'debt' },
  { key: 'creditRisk',             label: 'Credit Risk Fund',                          type: 'debt' },
  { key: 'bankingPSU',             label: 'Banking and PSU Fund',                      type: 'debt' },
  { key: 'gilt',                   label: 'Gilt Fund',                                 type: 'debt' },
  { key: 'gilt10yr',               label: 'Gilt Fund with 10 year constant duration',  type: 'debt' },
  { key: 'floater',                label: 'Floater Fund',                              type: 'debt' },
  // Equity
  { key: 'multiCap',               label: 'Multi Cap Fund',                            type: 'equity' },
  { key: 'largeCap',               label: 'Large Cap Fund',                            type: 'equity' },
  { key: 'largeMidCap',            label: 'Large & Mid Cap Fund',                      type: 'equity' },
  { key: 'midCap',                 label: 'Mid Cap Fund',                              type: 'equity' },
  { key: 'smallCap',               label: 'Small Cap Fund',                            type: 'equity' },
  { key: 'dividendYield',          label: 'Dividend Yield Fund',                       type: 'equity' },
  { key: 'valueContra',            label: 'Value Fund/Contra Fund',                    type: 'equity' },
  { key: 'focusedFund',            label: 'Focused Fund',                              type: 'equity' },
  { key: 'sectoralThematic',       label: 'Sectoral/Thematic Funds',                   type: 'equity' },
  { key: 'elss',                   label: 'ELSS',                                      type: 'equity' },
  { key: 'flexiCap',               label: 'Flexi Cap Fund',                            type: 'equity' },
  // Hybrid
  { key: 'conservativeHybrid',     label: 'Conservative Hybrid Fund',                  type: 'hybrid' },
  { key: 'aggressiveHybrid',       label: 'Balanced Hybrid Fund/Aggressive Hybrid Fund', type: 'hybrid' },
  { key: 'balancedAdvantage',      label: 'Dynamic Asset Allocation/Balanced Advantage Fund', type: 'hybrid' },
  { key: 'multiAsset',             label: 'Multi Asset Allocation Fund',               type: 'hybrid' },
  { key: 'arbitrage',              label: 'Arbitrage Fund',                            type: 'hybrid' },
  { key: 'equitySavings',          label: 'Equity Savings Fund',                       type: 'hybrid' },
  // Solution
  { key: 'retirementFund',         label: 'Retirement Fund',                           type: 'solution' },
  { key: 'childrensFund',          label: 'Childrens Fund',                            type: 'solution' },
  // Passive
  { key: 'indexFunds',             label: 'Index Funds',                               type: 'passive' },
  { key: 'goldETF',                label: 'GOLD ETF',                                  type: 'passive' },
  { key: 'otherETFs',              label: 'Other ETFs',                                type: 'passive' },
  { key: 'fofOverseas',            label: 'Fund of funds investing overseas',          type: 'passive' },
];

function parseAmfiText(text, month, year) {
  const categories = {};
  for (const cat of CATEGORIES) {
    const row = extractRow(text, cat.label);
    if (row) categories[cat.key] = { ...row, label: cat.label, type: cat.type };
  }

  const grandTotal = extractGrandTotal(text);

  // Extract subtotals
  const debtAum    = Object.values(categories).filter(c => c.type === 'debt').reduce((s, c) => s + c.aum, 0);
  const equityAum  = Object.values(categories).filter(c => c.type === 'equity').reduce((s, c) => s + c.aum, 0);
  const hybridAum  = Object.values(categories).filter(c => c.type === 'hybrid').reduce((s, c) => s + c.aum, 0);
  const passiveAum = Object.values(categories).filter(c => c.type === 'passive').reduce((s, c) => s + c.aum, 0);

  // Extract SIP data if present (some months include SIP paragraph)
  const sipMatch = text.match(/SIP.*?(?:Rs\.|INR|₹)\s*([\d,]+(?:\.\d+)?)\s*(?:crore|Crore|Cr)/i);
  const sipAum = sipMatch ? parseNumber(sipMatch[1]) : null;

  return {
    month,
    year,
    reportDate: `${month} ${year}`,
    grandTotal,
    summary: {
      totalAum:   grandTotal?.aum   || 0,
      totalFolios: grandTotal?.folios || 0,
      totalInflow: grandTotal?.inflow || 0,
      totalRedemption: grandTotal?.redemption || 0,
      totalNetFlow: grandTotal?.netFlow || 0,
      debtAum,
      equityAum,
      hybridAum,
      passiveAum,
    },
    categories,
    parsedAt: new Date().toISOString()
  };
}

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    let mon  = url.searchParams.get('month');
    let year = url.searchParams.get('year');

    if (!mon || !year) {
      const latest = getLatestMonth();
      mon  = latest.mon;
      year = latest.year;
    }

    mon = (MONTH_MAP[mon.toLowerCase()] || mon).toLowerCase();
    year = parseInt(year);

    const pdfUrl = `https://portal.amfiindia.com/spages/am${mon}${year}repo.pdf`;

    const res = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AbundanceMFCalc/1.0)' }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({
        error: `AMFI PDF not available for ${mon} ${year}`,
        pdfUrl,
        status: res.status
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return the PDF as a stream for client-side pdf.js parsing
    // OR parse server-side using text extraction
    // For Edge runtime, we return raw PDF bytes and let client parse with pdf.js
    // Alternatively, use a text-based approach below

    const arrayBuffer = await res.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Basic text extraction from PDF (works for text-layer PDFs like AMFI's)
    // Convert to string and extract readable text
    const decoder = new TextDecoder('latin1');
    const raw = decoder.decode(bytes);

    // Extract text streams from PDF
    const textChunks = [];
    const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    while ((match = streamRe.exec(raw)) !== null) {
      const chunk = match[1];
      // Extract text from PDF text operators (Tj, TJ, ')
      const textRe = /\(([^)]*)\)\s*(?:Tj|')|(\[.*?\])\s*TJ/g;
      let tm;
      while ((tm = textRe.exec(chunk)) !== null) {
        if (tm[1]) textChunks.push(tm[1].replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8))));
      }
    }

    const extractedText = textChunks.join(' ');

    if (extractedText.length < 500) {
      // Fallback: return raw PDF for client-side parsing
      return new Response(arrayBuffer, {
        headers: {
          'Content-Type': 'application/pdf',
          'X-Parse-Mode': 'client',
          'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const parsed = parseAmfiText(extractedText, mon, year);

    return new Response(JSON.stringify(parsed, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin': '*',
        'X-Source': pdfUrl,
        'X-Parsed-At': new Date().toISOString()
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
