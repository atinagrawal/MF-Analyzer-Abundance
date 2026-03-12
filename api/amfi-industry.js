/**
 * /api/amfi-industry
 * Fetches AMFI monthly report PDF and returns parsed industry data as JSON.
 * Uses pdf.co-style text extraction via URL-based approach.
 * Falls back to hardcoded structure parsing from raw bytes.
 *
 * Query: ?month=feb&year=2026
 * Cached 24h on Vercel CDN.
 */

export const config = { runtime: 'edge' };

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_MAP = Object.fromEntries(MONTHS.map(m=>[m,m]));

function getLatestMonth() {
  const now = new Date();
  const offset = now.getUTCDate() < 10 ? 2 : 1;
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  return {
    mon: MONTHS[d.getMonth()],
    year: d.getFullYear()
  };
}

function parseNumber(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/,/g, '').trim()) || 0;
}

// Extract PDF text using a simple but effective approach:
// AMFI PDFs are text-based. We look for readable ASCII sequences.
function extractTextFromPDF(bytes) {
  const chunks = [];
  let i = 0;
  const len = bytes.length;

  while (i < len) {
    // Look for BT (Begin Text) blocks — PDF text operator
    if (bytes[i] === 0x42 && bytes[i+1] === 0x54) { // 'BT'
      i += 2;
      // Collect text until ET (End Text)
      while (i < len - 1) {
        if (bytes[i] === 0x45 && bytes[i+1] === 0x54) { i += 2; break; } // 'ET'
        // Look for (text) Tj pattern
        if (bytes[i] === 0x28) { // '('
          let str = '';
          i++;
          while (i < len && bytes[i] !== 0x29) {
            if (bytes[i] === 0x5C && i+1 < len) { // backslash escape
              i++;
              if (bytes[i] >= 0x30 && bytes[i] <= 0x37) {
                // Octal escape \nnn
                let oct = '';
                for (let k = 0; k < 3 && i < len && bytes[i] >= 0x30 && bytes[i] <= 0x37; k++, i++) oct += String.fromCharCode(bytes[i]);
                str += String.fromCharCode(parseInt(oct, 8));
                continue;
              }
              str += String.fromCharCode(bytes[i]);
            } else if (bytes[i] >= 32 && bytes[i] < 127) {
              str += String.fromCharCode(bytes[i]);
            }
            i++;
          }
          if (str.trim()) chunks.push(str.trim());
        }
        i++;
      }
    } else {
      i++;
    }
  }
  return chunks.join(' ');
}

// Parse the text content from AMFI PDF structure
// AMFI report has a very consistent tabular structure
// Columns: schemes, folios, inflow, redemption, netFlow, aum, avgAum
function parseTableFromText(text) {
  const categories = {};

  // Category definitions with exact labels as in AMFI PDF
  const CATS = [
    // Debt
    { key: 'overnightFund',      label: 'Overnight Fund',                                      type: 'debt'     },
    { key: 'liquidFund',         label: 'Liquid Fund',                                          type: 'debt'     },
    { key: 'ultraShortDuration', label: 'Ultra Short Duration Fund',                            type: 'debt'     },
    { key: 'lowDuration',        label: 'Low Duration Fund',                                    type: 'debt'     },
    { key: 'moneyMarket',        label: 'Money Market Fund',                                    type: 'debt'     },
    { key: 'shortDuration',      label: 'Short Duration Fund',                                  type: 'debt'     },
    { key: 'mediumDuration',     label: 'Medium Duration Fund',                                 type: 'debt'     },
    { key: 'mediumToLong',       label: 'Medium to Long Duration Fund',                         type: 'debt'     },
    { key: 'longDuration',       label: 'Long Duration Fund',                                   type: 'debt'     },
    { key: 'dynamicBond',        label: 'Dynamic Bond Fund',                                    type: 'debt'     },
    { key: 'corporateBond',      label: 'Corporate Bond Fund',                                  type: 'debt'     },
    { key: 'creditRisk',         label: 'Credit Risk Fund',                                     type: 'debt'     },
    { key: 'bankingPSU',         label: 'Banking and PSU Fund',                                 type: 'debt'     },
    { key: 'gilt',               label: 'Gilt Fund',                                            type: 'debt'     },
    { key: 'gilt10yr',           label: 'Gilt Fund with 10 year constant duration',             type: 'debt'     },
    { key: 'floater',            label: 'Floater Fund',                                         type: 'debt'     },
    // Equity
    { key: 'multiCap',           label: 'Multi Cap Fund',                                       type: 'equity'   },
    { key: 'largeCap',           label: 'Large Cap Fund',                                       type: 'equity'   },
    { key: 'largeMidCap',        label: 'Large & Mid Cap Fund',                                 type: 'equity'   },
    { key: 'midCap',             label: 'Mid Cap Fund',                                         type: 'equity'   },
    { key: 'smallCap',           label: 'Small Cap Fund',                                       type: 'equity'   },
    { key: 'dividendYield',      label: 'Dividend Yield Fund',                                  type: 'equity'   },
    { key: 'valueContra',        label: 'Value Fund/Contra Fund',                               type: 'equity'   },
    { key: 'focusedFund',        label: 'Focused Fund',                                         type: 'equity'   },
    { key: 'sectoralThematic',   label: 'Sectoral/Thematic Funds',                              type: 'equity'   },
    { key: 'elss',               label: 'ELSS',                                                 type: 'equity'   },
    { key: 'flexiCap',           label: 'Flexi Cap Fund',                                       type: 'equity'   },
    // Hybrid
    { key: 'conservativeHybrid', label: 'Conservative Hybrid Fund',                             type: 'hybrid'   },
    { key: 'aggressiveHybrid',   label: 'Balanced Hybrid Fund/Aggressive Hybrid Fund',          type: 'hybrid'   },
    { key: 'balancedAdvantage',  label: 'Dynamic Asset Allocation/Balanced Advantage Fund',     type: 'hybrid'   },
    { key: 'multiAsset',         label: 'Multi Asset Allocation Fund',                          type: 'hybrid'   },
    { key: 'arbitrage',          label: 'Arbitrage Fund',                                       type: 'hybrid'   },
    { key: 'equitySavings',      label: 'Equity Savings Fund',                                  type: 'hybrid'   },
    // Solution
    { key: 'retirementFund',     label: 'Retirement Fund',                                      type: 'solution' },
    { key: 'childrensFund',      label: 'Childrens Fund',                                       type: 'solution' },
    // Passive
    { key: 'indexFunds',         label: 'Index Funds',                                          type: 'passive'  },
    { key: 'goldETF',            label: 'GOLD ETF',                                             type: 'passive'  },
    { key: 'otherETFs',          label: 'Other ETFs',                                           type: 'passive'  },
    { key: 'fofOverseas',        label: 'Fund of funds investing overseas',                     type: 'passive'  },
  ];

  // Number pattern: matches numbers like 1,23,456.78 or -14,006.21
  const NUM = '(-?[\\d,]+(?:\\.\\d+)?)';
  const SP  = '[\\s\\S]{0,200}?';

  for (const cat of CATS) {
    const esc = cat.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Try to match: label ... schemes folios inflow redemption netflow aum avgaum
    const re = new RegExp(esc + SP + NUM + SP + NUM + SP + NUM + SP + NUM + SP + NUM + SP + NUM + SP + NUM);
    const m = text.match(re);
    if (m) {
      categories[cat.key] = {
        label:      cat.label,
        type:       cat.type,
        schemes:    parseNumber(m[1]),
        folios:     parseNumber(m[2]),
        inflow:     parseNumber(m[3]),
        redemption: parseNumber(m[4]),
        netFlow:    parseNumber(m[5]),
        aum:        parseNumber(m[6]),
        avgAum:     parseNumber(m[7]),
      };
    }
  }

  // Grand Total
  const gtRe = new RegExp('Grand Total' + SP + NUM + SP + NUM + SP + NUM + SP + NUM + SP + NUM + SP + NUM + SP + NUM);
  const gtm = text.match(gtRe);
  const grandTotal = gtm ? {
    schemes:    parseNumber(gtm[1]),
    folios:     parseNumber(gtm[2]),
    inflow:     parseNumber(gtm[3]),
    redemption: parseNumber(gtm[4]),
    netFlow:    parseNumber(gtm[5]),
    aum:        parseNumber(gtm[6]),
    avgAum:     parseNumber(gtm[7]),
  } : null;

  return { categories, grandTotal };
}

// Alternative: parse directly from PDF byte stream looking for number sequences
// AMFI PDFs store text uncompressed in content streams
function extractRawText(buffer) {
  const bytes = new Uint8Array(buffer);
  const text  = [];
  let   i     = 0;

  while (i < bytes.length - 1) {
    // Find text in parentheses — PDF string literals
    if (bytes[i] === 40) { // '('
      let s = '';
      i++;
      while (i < bytes.length && bytes[i] !== 41) { // ')'
        if (bytes[i] === 92 && i + 1 < bytes.length) { // backslash
          i++;
          if (bytes[i] >= 48 && bytes[i] <= 55) { // octal
            let oct = '';
            for (let n = 0; n < 3 && bytes[i] >= 48 && bytes[i] <= 55; n++, i++) oct += String.fromCharCode(bytes[i]);
            s += String.fromCharCode(parseInt(oct, 8));
            continue;
          }
          s += String.fromCharCode(bytes[i]);
        } else if (bytes[i] > 31 && bytes[i] < 127) {
          s += String.fromCharCode(bytes[i]);
        } else if (bytes[i] === 10 || bytes[i] === 13) {
          s += ' ';
        }
        i++;
      }
      if (s.trim().length > 0) text.push(s.trim());
    }
    i++;
  }

  return text.join(' ');
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

    mon  = (MONTH_MAP[mon.toLowerCase()] || mon).toLowerCase();
    year = parseInt(year);

    const pdfUrl = `https://portal.amfiindia.com/spages/am${mon}${year}repo.pdf`;

    const res = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AbundanceMFCalc/1.0)' }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({
        error: `AMFI PDF not available for ${mon} ${year}`,
        pdfUrl, status: res.status
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const buffer = await res.arrayBuffer();

    // Extract text from PDF
    const rawText = extractRawText(buffer);

    // Parse the structured data
    const { categories, grandTotal } = parseTableFromText(rawText);

    const catCount = Object.keys(categories).length;

    // Compute summaries
    const byType = (type) => Object.values(categories).filter(c => c.type === type);
    const sumAum  = (arr)  => arr.reduce((s, c) => s + (c.aum || 0), 0);

    const summary = {
      totalAum:        grandTotal?.aum        || sumAum(Object.values(categories)),
      totalFolios:     grandTotal?.folios      || 0,
      totalInflow:     grandTotal?.inflow      || 0,
      totalRedemption: grandTotal?.redemption  || 0,
      totalNetFlow:    grandTotal?.netFlow      || 0,
      equityAum:       sumAum(byType('equity')),
      debtAum:         sumAum(byType('debt')),
      hybridAum:       sumAum(byType('hybrid')),
      passiveAum:      sumAum(byType('passive')),
    };

    const result = {
      month: mon,
      year,
      reportDate: `${mon} ${year}`,
      grandTotal,
      summary,
      categories,
      parsedCategories: catCount,
      parsedAt: new Date().toISOString(),
      debug: {
        textLength: rawText.length,
        pdfSize: buffer.byteLength,
      }
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin': '*',
        'X-Source': pdfUrl,
        'X-Parsed-Categories': String(catCount),
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
