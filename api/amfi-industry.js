/**
 * /api/amfi-industry — Node.js runtime
 * Parses AMFI Monthly Report PDF using zlib + TJ operator parsing.
 */

import zlib from 'zlib';

export const config = { runtime: 'nodejs' };

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function getLatestMonth() {
  const now = new Date();
  const offset = now.getUTCDate() < 10 ? 2 : 1;
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  return { mon: MONTHS[d.getMonth()], year: d.getFullYear() };
}

const KNOWN_CATS = new Map([
  ['Overnight Fund',                                   { key:'overnightFund',      type:'debt'     }],
  ['Liquid Fund',                                      { key:'liquidFund',         type:'debt'     }],
  ['Ultra Short Duration Fund',                        { key:'ultraShortDuration', type:'debt'     }],
  ['Low Duration Fund',                                { key:'lowDuration',        type:'debt'     }],
  ['Money Market Fund',                                { key:'moneyMarket',        type:'debt'     }],
  ['Short Duration Fund',                              { key:'shortDuration',      type:'debt'     }],
  ['Medium Duration Fund',                             { key:'mediumDuration',     type:'debt'     }],
  ['Medium to Long Duration Fund',                     { key:'mediumToLong',       type:'debt'     }],
  ['Long Duration Fund',                               { key:'longDuration',       type:'debt'     }],
  ['Dynamic Bond Fund',                                { key:'dynamicBond',        type:'debt'     }],
  ['Corporate Bond Fund',                              { key:'corporateBond',      type:'debt'     }],
  ['Credit Risk Fund',                                 { key:'creditRisk',         type:'debt'     }],
  ['Banking and PSU Fund',                             { key:'bankingPSU',         type:'debt'     }],
  ['Gilt Fund',                                        { key:'gilt',               type:'debt'     }],
  ['Gilt Fund with 10 year constant duration',         { key:'gilt10yr',           type:'debt'     }],
  ['Floater Fund',                                     { key:'floater',            type:'debt'     }],
  ['Multi Cap Fund',                                   { key:'multiCap',           type:'equity'   }],
  ['Large Cap Fund',                                   { key:'largeCap',           type:'equity'   }],
  ['Large & Mid Cap Fund',                             { key:'largeMidCap',        type:'equity'   }],
  ['Mid Cap Fund',                                     { key:'midCap',             type:'equity'   }],
  ['Small Cap Fund',                                   { key:'smallCap',           type:'equity'   }],
  ['Dividend Yield Fund',                              { key:'dividendYield',      type:'equity'   }],
  ['Value Fund/Contra Fund',                           { key:'valueContra',        type:'equity'   }],
  ['Focused Fund',                                     { key:'focusedFund',        type:'equity'   }],
  ['Sectoral/Thematic Funds',                          { key:'sectoralThematic',   type:'equity'   }],
  ['ELSS',                                             { key:'elss',               type:'equity'   }],
  ['Flexi Cap Fund',                                   { key:'flexiCap',           type:'equity'   }],
  ['Conservative Hybrid Fund',                         { key:'conservativeHybrid', type:'hybrid'   }],
  ['Balanced Hybrid Fund/Aggressive Hybrid Fund',      { key:'aggressiveHybrid',   type:'hybrid'   }],
  ['Dynamic Asset Allocation/Balanced Advantage Fund', { key:'balancedAdvantage',  type:'hybrid'   }],
  ['Multi Asset Allocation Fund',                      { key:'multiAsset',         type:'hybrid'   }],
  ['Arbitrage Fund',                                   { key:'arbitrage',          type:'hybrid'   }],
  ['Equity Savings Fund',                              { key:'equitySavings',      type:'hybrid'   }],
  ['Retirement Fund',                                  { key:'retirementFund',     type:'solution' }],
  ['Childrens Fund',                                   { key:'childrensFund',      type:'solution' }],
  ['Index Funds',                                      { key:'indexFunds',         type:'passive'  }],
  ['GOLD ETF',                                         { key:'goldETF',            type:'passive'  }],
  ['Other ETFs',                                       { key:'otherETFs',          type:'passive'  }],
  ['Fund of funds investing overseas',                 { key:'fofOverseas',        type:'passive'  }],
]);

const STOP_LABELS = new Set([
  'Grand Total', 'Total B -Close ended Schemes', 'Total C Interval Schemes',
  'B', 'C',  // section markers for close-ended / interval
]);

function parseNum(s) {
  if (!s || s === '-' || s === '--') return 0;
  return parseFloat(s.replace(/,/g, '')) || 0;
}

function extractPdfChunks(pdfBuf) {
  const allChunks = [];
  let pos = 0;

  while (true) {
    const fdIdx = pdfBuf.indexOf('FlateDecode', pos);
    if (fdIdx === -1) break;

    let streamStart = -1;
    const crnl = pdfBuf.indexOf('stream\r\n', fdIdx);
    const nl   = pdfBuf.indexOf('stream\n',  fdIdx);
    if (crnl !== -1 && (nl === -1 || crnl < nl)) streamStart = crnl + 8;
    else if (nl !== -1) streamStart = nl + 7;

    if (streamStart === -1 || streamStart > fdIdx + 500) { pos = fdIdx + 1; continue; }

    const streamEnd = pdfBuf.indexOf('\nendstream', streamStart);
    if (streamEnd === -1) { pos = fdIdx + 1; continue; }

    const compressed = Buffer.from(pdfBuf.slice(streamStart, streamEnd), 'binary');
    let decompressed;
    try { decompressed = zlib.inflateSync(compressed).toString('latin1'); }
    catch { try { decompressed = zlib.inflateRawSync(compressed).toString('latin1'); } catch { pos = fdIdx + 1; continue; } }

    const tjRe = /\[([^\]]*)\]\s*TJ/g;
    let m;
    while ((m = tjRe.exec(decompressed)) !== null) {
      let s = '';
      const strRe = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
      let sm;
      while ((sm = strRe.exec(m[1])) !== null) {
        let inner = sm[1];
        inner = inner.replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)));
        inner = inner.replace(/\\\(/g,'(').replace(/\\\)/g,')');
        s += inner;
      }
      if (s.trim()) allChunks.push(s.trim());
    }

    pos = fdIdx + 1;
  }

  return allChunks;
}

function parseCategories(chunks) {
  const categories = {};
  let grandTotal = null;
  let i = 0;

  while (i < chunks.length) {
    const chunk = chunks[i];

    // Hard stop at Grand Total or close-ended section start
    if (chunk === 'Grand Total') {
      const vals = [];
      let j = i + 1;
      while (vals.length < 7 && j < chunks.length) vals.push(chunks[j++]);
      grandTotal = {
        schemes: parseNum(vals[0]), folios: parseNum(vals[1]),
        inflow: parseNum(vals[2]),  redemption: parseNum(vals[3]),
        netFlow: parseNum(vals[4]), aum: parseNum(vals[5]), avgAum: parseNum(vals[6] || '0'),
      };
      break; // stop — everything after is close-ended / interval / NFO
    }

    // Stop if we enter close-ended section (B or C section headers in context)
    if (chunk === 'Close Ended Schemes' || chunk === 'Interval Schemes') break;

    const catInfo = KNOWN_CATS.get(chunk);
    if (catInfo) {
      // Only parse if not already seen (first occurrence = open-ended, correct one)
      if (!categories[catInfo.key]) {
        const vals = [];
        let j = i + 1;
        while (vals.length < 9 && j < chunks.length) {
          const v = chunks[j];
          if (KNOWN_CATS.has(v) || v === 'Grand Total' || v === 'Close Ended Schemes') break;
          vals.push(v);
          j++;
        }
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
        }
        i = j;
        continue;
      }
    }

    i++;
  }

  return { categories, grandTotal };
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    let mon  = url.searchParams.get('month');
    let year = url.searchParams.get('year');

    if (!mon || !year) { const l = getLatestMonth(); mon = l.mon; year = l.year; }
    mon  = mon.toLowerCase().slice(0, 3);
    year = parseInt(year);

    const pdfUrl = `https://portal.amfiindia.com/spages/am${mon}${year}repo.pdf`;

    const pdfRes = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AbundanceMFCalc/1.0)' }
    });

    if (!pdfRes.ok) {
      res.status(404).json({ error: `AMFI report not available for ${mon} ${year}`, pdfUrl, httpStatus: pdfRes.status });
      return;
    }

    const pdfBuf = Buffer.from(await pdfRes.arrayBuffer()).toString('binary');
    const chunks = extractPdfChunks(pdfBuf);
    const { categories, grandTotal } = parseCategories(chunks);
    const catCount = Object.keys(categories).length;

    if (catCount < 10) {
      res.status(422).json({ error: 'Too few categories parsed', catCount, chunksFound: chunks.length, sample: chunks.slice(50, 80) });
      return;
    }

    const byType = (t) => Object.values(categories).filter(c => c.type === t);
    const sumAum  = (arr) => arr.reduce((s, c) => s + (c.aum || 0), 0);

    const sumFolios = (arr) => arr.reduce((s, c) => s + (c.folios || 0), 0);
    const openEndedFolios = sumFolios(Object.values(categories));

    const summary = {
      totalAum:      grandTotal?.aum        || sumAum(Object.values(categories)),
      totalFolios:   grandTotal?.folios      || openEndedFolios,
      totalInflow:   grandTotal?.inflow      || 0,
      totalRedemption: grandTotal?.redemption || 0,
      totalNetFlow:  grandTotal?.netFlow     || 0,
      equityAum:     sumAum(byType('equity')),
      debtAum:       sumAum(byType('debt')),
      hybridAum:     sumAum(byType('hybrid')),
      passiveAum:    sumAum(byType('passive')),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json({ month: mon, year, reportDate: `${mon} ${year}`,
      grandTotal, summary, categories, parsedCategories: catCount,
      parsedAt: new Date().toISOString() });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
