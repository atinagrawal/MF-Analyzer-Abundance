/**
 * /api/amfi-industry — Node.js runtime
 * Parses AMFI Monthly Report PDF using zlib + TJ operator parsing.
 *
 * Future-proofing: any category row found in the PDF that is NOT in
 * KNOWN_CATS is captured in `unknownCategories` in the response,
 * so new SEBI-introduced categories surface without breaking anything.
 *
 * Query: ?month=feb&year=2026  (defaults to latest available)
 */

import zlib from 'zlib';

export const config = { runtime: 'nodejs' };

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

/** Returns up to 3 candidate months to try, most recent first */
function candidateMonths() {
  const now = new Date();
  const mon = now.getUTCMonth() + 1; // 1-based
  const year = now.getUTCFullYear();
  const out = [];
  for (let offset = 1; offset <= 4; offset++) {
    let m = mon - offset, y = year;
    while (m <= 0) { m += 12; y--; }
    out.push({ mon: MONTHS[m - 1], year: y });
  }
  return out;
}

/** Parse '01-feb-2026' date string used by statewise API */
function parseDateParam(date) {
  if (!date) return null;
  // format: 01-MMM-YYYY  e.g. 01-feb-2026
  const parts = date.split('-');
  if (parts.length >= 3) {
    const mon = parts[1].toLowerCase().slice(0, 3);
    const year = parseInt(parts[2]);
    if (MONTHS.includes(mon) && year > 2000) return { mon, year };
  }
  return null;
}

const KNOWN_CATS = new Map([
  ['Overnight Fund',                                   { key: 'overnightFund',      type: 'debt'     }],
  ['Liquid Fund',                                      { key: 'liquidFund',         type: 'debt'     }],
  ['Ultra Short Duration Fund',                        { key: 'ultraShortDuration', type: 'debt'     }],
  ['Low Duration Fund',                                { key: 'lowDuration',        type: 'debt'     }],
  ['Money Market Fund',                                { key: 'moneyMarket',        type: 'debt'     }],
  ['Short Duration Fund',                              { key: 'shortDuration',      type: 'debt'     }],
  ['Medium Duration Fund',                             { key: 'mediumDuration',     type: 'debt'     }],
  ['Medium to Long Duration Fund',                     { key: 'mediumToLong',       type: 'debt'     }],
  ['Long Duration Fund',                               { key: 'longDuration',       type: 'debt'     }],
  ['Dynamic Bond Fund',                                { key: 'dynamicBond',        type: 'debt'     }],
  ['Corporate Bond Fund',                              { key: 'corporateBond',      type: 'debt'     }],
  ['Credit Risk Fund',                                 { key: 'creditRisk',         type: 'debt'     }],
  ['Banking and PSU Fund',                             { key: 'bankingPSU',         type: 'debt'     }],
  ['Gilt Fund',                                        { key: 'gilt',               type: 'debt'     }],
  ['Gilt Fund with 10 year constant duration',         { key: 'gilt10yr',           type: 'debt'     }],
  ['Floater Fund',                                     { key: 'floater',            type: 'debt'     }],
  ['Multi Cap Fund',                                   { key: 'multiCap',           type: 'equity'   }],
  ['Large Cap Fund',                                   { key: 'largeCap',           type: 'equity'   }],
  ['Large & Mid Cap Fund',                             { key: 'largeMidCap',        type: 'equity'   }],
  ['Mid Cap Fund',                                     { key: 'midCap',             type: 'equity'   }],
  ['Small Cap Fund',                                   { key: 'smallCap',           type: 'equity'   }],
  ['Dividend Yield Fund',                              { key: 'dividendYield',      type: 'equity'   }],
  ['Value Fund/Contra Fund',                           { key: 'valueContra',        type: 'equity'   }],
  ['Focused Fund',                                     { key: 'focusedFund',        type: 'equity'   }],
  ['Sectoral/Thematic Funds',                          { key: 'sectoralThematic',   type: 'equity'   }],
  ['ELSS',                                             { key: 'elss',               type: 'equity'   }],
  ['Flexi Cap Fund',                                   { key: 'flexiCap',           type: 'equity'   }],
  ['Conservative Hybrid Fund',                         { key: 'conservativeHybrid', type: 'hybrid'   }],
  ['Balanced Hybrid Fund/Aggressive Hybrid Fund',      { key: 'aggressiveHybrid',   type: 'hybrid'   }],
  ['Dynamic Asset Allocation/Balanced Advantage Fund', { key: 'balancedAdvantage',  type: 'hybrid'   }],
  ['Multi Asset Allocation Fund',                      { key: 'multiAsset',         type: 'hybrid'   }],
  ['Arbitrage Fund',                                   { key: 'arbitrage',          type: 'hybrid'   }],
  ['Equity Savings Fund',                              { key: 'equitySavings',      type: 'hybrid'   }],
  ['Retirement Fund',                                  { key: 'retirementFund',     type: 'solution' }],
  ['Childrens Fund',                                   { key: 'childrensFund',      type: 'solution' }],
  ['Index Funds',                                      { key: 'indexFunds',         type: 'passive'  }],
  ['GOLD ETF',                                         { key: 'goldETF',            type: 'passive'  }],
  ['Other ETFs',                                       { key: 'otherETFs',          type: 'passive'  }],
  ['Fund of funds investing overseas',                 { key: 'fofOverseas',        type: 'passive'  }],
]);

// Section headers and subtotals — not fund categories
const STRUCTURAL_LABELS = new Set([
  'Open ended Schemes','Close Ended Schemes','Interval Schemes',
  'Income/Debt Oriented Schemes','Growth/Equity Oriented Schemes',
  'Hybrid Schemes','Solution Oriented Schemes','Other Schemes',
  'Sub Total - I','Sub Total - II','Sub Total - III','Sub Total - IV','Sub Total - V',
  'Sub Total (i+ii)','Sub Total (i+ii+iii+iv)',
  'Total A-Open ended Schemes','Total B -Close ended Schemes',
  'Total C Interval Schemes','Grand Total',
  'Fund of Funds Scheme (Domestic) **',
  'A','B','C','I','II','III','IV','V',
  'i','ii','iii','iv','v','vi','vii','viii','ix','x','xi','xii',
  'xiii','xiv','xv','xvi','Sr','Scheme Name',
]);

function parseNum(str) {
  if (!str || str === '-' || str === '--') return 0;
  return parseFloat(str.replace(/,/g, '')) || 0;
}

function extractPdfChunks(pdfBinaryStr) {
  const chunks = [];
  let pos = 0;

  while (true) {
    const fdIdx = pdfBinaryStr.indexOf('FlateDecode', pos);
    if (fdIdx === -1) break;

    let streamStart = -1;
    const crnl = pdfBinaryStr.indexOf('stream\r\n', fdIdx);
    const nl   = pdfBinaryStr.indexOf('stream\n',  fdIdx);
    if (crnl !== -1 && (nl === -1 || crnl < nl)) streamStart = crnl + 8;
    else if (nl !== -1) streamStart = nl + 7;

    if (streamStart === -1 || streamStart > fdIdx + 500) { pos = fdIdx + 1; continue; }

    const streamEnd = pdfBinaryStr.indexOf('\nendstream', streamStart);
    if (streamEnd === -1) { pos = fdIdx + 1; continue; }

    const compressed = Buffer.from(pdfBinaryStr.slice(streamStart, streamEnd), 'binary');
    let decompressed;
    try       { decompressed = zlib.inflateSync(compressed).toString('latin1'); }
    catch (_) { try { decompressed = zlib.inflateRawSync(compressed).toString('latin1'); } catch (_2) { pos = fdIdx + 1; continue; } }

    const tjRe = /\[([^\]]*)\]\s*TJ/g;
    let tjMatch;
    while ((tjMatch = tjRe.exec(decompressed)) !== null) {
      let text = '';
      const strRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
      let strMatch;
      while ((strMatch = strRe.exec(tjMatch[1])) !== null) {
        let inner = strMatch[1];
        inner = inner.replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
        inner = inner.replace(/\\\(/g, '(').replace(/\\\)/g, ')');
        text += inner;
      }
      if (text.trim()) chunks.push(text.trim());
    }

    pos = fdIdx + 1;
  }

  return chunks;
}

function readRowValues(chunks, startIdx) {
  const vals = [];
  let j = startIdx;
  while (vals.length < 9 && j < chunks.length) {
    const v = chunks[j];
    if (KNOWN_CATS.has(v) || v === 'Grand Total' || v === 'Close Ended Schemes') break;
    vals.push(v);
    j++;
  }
  return vals;
}

function looksLikeCategoryLabel(str) {
  if (!str || str.length < 6) return false;
  if (STRUCTURAL_LABELS.has(str)) return false;
  if (/^[\d,.\-]+$/.test(str)) return false;
  if (/^[ivxlcdmIVXLCDM]+$/.test(str)) return false;
  if (/^[A-Z]$/.test(str)) return false;
  return /Fund|ETF|Scheme|Plan/i.test(str);
}

function parseCategories(chunks) {
  const categories = {};
  const unknownCategories = [];
  let grandTotal = null;
  let idx = 0;

  while (idx < chunks.length) {
    const chunk = chunks[idx];

    if (chunk === 'Grand Total') {
      const vals = [];
      let j = idx + 1;
      while (vals.length < 7 && j < chunks.length) vals.push(chunks[j++]);
      grandTotal = {
        schemes:    parseNum(vals[0]),
        folios:     parseNum(vals[1]),
        inflow:     parseNum(vals[2]),
        redemption: parseNum(vals[3]),
        netFlow:    parseNum(vals[4]),
        aum:        parseNum(vals[5]),
        avgAum:     parseNum(vals[6] || '0'),
      };
      break;
    }

    if (chunk === 'Close Ended Schemes') break;

    const catInfo = KNOWN_CATS.get(chunk);

    if (catInfo) {
      if (!categories[catInfo.key]) {
        const vals = readRowValues(chunks, idx + 1);
        if (vals.length >= 6) {
          categories[catInfo.key] = {
            label:      chunk,
            type:       catInfo.type,
            schemes:    parseNum(vals[0]),
            folios:     parseNum(vals[1]),
            inflow:     parseNum(vals[2]),
            redemption: parseNum(vals[3]),
            netFlow:    parseNum(vals[4]),
            aum:        parseNum(vals[5]),
            avgAum:     parseNum(vals[6] || '0'),
          };
          idx += 1 + vals.length;
          continue;
        }
      }
    } else if (looksLikeCategoryLabel(chunk)) {
      const vals = readRowValues(chunks, idx + 1);
      if (vals.length >= 6) {
        unknownCategories.push({
          label:      chunk,
          schemes:    parseNum(vals[0]),
          folios:     parseNum(vals[1]),
          inflow:     parseNum(vals[2]),
          redemption: parseNum(vals[3]),
          netFlow:    parseNum(vals[4]),
          aum:        parseNum(vals[5]),
          avgAum:     parseNum(vals[6] || '0'),
        });
        idx += 1 + vals.length;
        continue;
      }
    }

    idx++;
  }

  return { categories, grandTotal, unknownCategories };
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let mon  = url.searchParams.get('month');
    let year = url.searchParams.get('year');
    const dateParam = url.searchParams.get('date');

    // Support '01-feb-2026' date format used by report page / statewise API
    if ((!mon || !year) && dateParam) {
      const parsed = parseDateParam(dateParam);
      if (parsed) { mon = parsed.mon; year = parsed.year; }
    }

    // If specific month/year requested, try it directly
    if (mon && year) {
      mon  = mon.toLowerCase().slice(0, 3);
      year = parseInt(year);
      const pdfUrl = `https://portal.amfiindia.com/spages/am${mon}${year}repo.pdf`;

      const pdfRes = await fetch(pdfUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AbundanceMFCalc/1.0)' },
      });

      if (!pdfRes.ok) {
        res.status(404).json({ error: `AMFI report not available for ${mon} ${year}`, pdfUrl, httpStatus: pdfRes.status });
        return;
      }

      const pdfBuf = Buffer.from(await pdfRes.arrayBuffer()).toString('binary');
      const chunks = extractPdfChunks(pdfBuf);
      const { categories, grandTotal, unknownCategories } = parseCategories(chunks);
      const catCount = Object.keys(categories).length;

      if (catCount < 10) {
        res.status(422).json({
          error: 'Too few categories parsed — PDF format may have changed',
          catCount, chunksFound: chunks.length, sample: chunks.slice(50, 80),
        });
        return;
      }

      return sendSuccess(res, mon, year, categories, grandTotal, unknownCategories, catCount);
    }

    // No specific month: auto-resolve by trying candidates (month-1, month-2, ...)
    for (const candidate of candidateMonths()) {
      const { mon: cMon, year: cYear } = candidate;
      const pdfUrl2 = `https://portal.amfiindia.com/spages/am${cMon}${cYear}repo.pdf`;
      try {
        const pdfRes2 = await fetch(pdfUrl2, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AbundanceMFCalc/1.0)' },
        });
        if (!pdfRes2.ok) continue;
        const pdfBuf2 = Buffer.from(await pdfRes2.arrayBuffer()).toString('binary');
        const chunks2 = extractPdfChunks(pdfBuf2);
        const { categories: cats2, grandTotal: gt2, unknownCategories: unk2 } = parseCategories(chunks2);
        const catCount2 = Object.keys(cats2).length;
        if (catCount2 < 10) continue;
        return sendSuccess(res, cMon, cYear, cats2, gt2, unk2, catCount2);
      } catch (_) { continue; }
    }

    res.status(503).json({ error: 'AMFI report temporarily unavailable. Please try again later.' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

function sendSuccess(res, mon, year, categories, grandTotal, unknownCategories, catCount) {
  const byType = (t) => Object.values(categories).filter(c => c.type === t);
  const sumAum = (arr) => arr.reduce((s, c) => s + (c.aum || 0), 0);

  const summary = {
    totalAum:     grandTotal?.aum      || sumAum(Object.values(categories)),
    totalFolios:  grandTotal?.folios   || 0,
    totalNetFlow: grandTotal?.netFlow  || 0,
    equityAum:    sumAum(byType('equity')),
    debtAum:      sumAum(byType('debt')),
    hybridAum:    sumAum(byType('hybrid')),
    passiveAum:   sumAum(byType('passive')),
  };

  res.setHeader('Content-Type', 'application/json');
  // Historical months never change — AMFI doesn't update past PDFs
  const now = new Date();
  const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
  const reqDate = new Date(year, MONTHS.indexOf(mon), 1);
  const cutoff  = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const isHistorical = reqDate < cutoff;
  const cacheHeader = isHistorical
    ? 's-maxage=31536000, stale-while-revalidate=31536000, immutable'
    : 's-maxage=21600, stale-while-revalidate=86400';
  res.setHeader('Cache-Control', cacheHeader);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json({
    month: mon, year, reportDate: `${mon} ${year}`,
    grandTotal, summary, categories,
    parsedCategories: catCount,
    ...(unknownCategories.length > 0 && { unknownCategories }),
    parsedAt: new Date().toISOString(),
  });
}
