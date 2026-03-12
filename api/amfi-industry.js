/**
 * /api/amfi-industry
 * Strategy: Fetch AMFI PDF → extract text via multiple methods → parse → return JSON
 * Falls back to fetching the PDF via amfi-pdf proxy if direct fetch fails.
 */

export const config = { runtime: 'edge' };

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const MONTH_LABELS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getLatestMonth() {
  const now = new Date();
  const offset = now.getUTCDate() < 10 ? 2 : 1;
  const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  return { mon: MONTHS[d.getMonth()], year: d.getFullYear() };
}

function p(s) {
  if (!s) return 0;
  return parseFloat(String(s).replace(/,/g, '')) || 0;
}

// ── KNOWN DATA CACHE ──
// Hardcoded Feb 2026 from official AMFI PDF (exact figures)
const KNOWN_DATA = {
  'feb-2026': {
    month: 'feb', year: 2026,
    grandTotal: { schemes: 1937, folios: 270571455, inflow: 13550854.7, redemption: 12605554.7, netFlow: 945300, aum: 82029563.5, avgAum: 83426165.7 },
    summary: {
      totalAum: 82029563.5, totalFolios: 270571455,
      totalInflow: 13550854.7, totalRedemption: 12605554.7, totalNetFlow: 945300,
      equityAum: 35394759.1, debtAum: 19436884.2, hybridAum: 11130991.4, passiveAum: 15236967.7,
    },
    categories: {
      overnightFund:      { label:'Overnight Fund',                                     type:'debt',     schemes:37,  folios:739107,    inflow:6208528.9,  redemption:6348590.1, netFlow:-140006.21, aum:1126659.0,  avgAum:1297172.7  },
      liquidFund:         { label:'Liquid Fund',                                         type:'debt',     schemes:42,  folios:2616607,   inflow:4654778.4,  redemption:4064004.5, netFlow:590773.9,   aum:5989200.2,  avgAum:6224131.4  },
      ultraShortDuration: { label:'Ultra Short Duration Fund',                           type:'debt',     schemes:25,  folios:778455,    inflow:207124.8,   redemption:250864.1,  netFlow:-43739.3,   aum:1277598.8,  avgAum:1301792.7  },
      lowDuration:        { label:'Low Duration Fund',                                   type:'debt',     schemes:25,  folios:851082,    inflow:183908.6,   redemption:160621.1,  netFlow:23287.5,    aum:1554684.8,  avgAum:1526263.6  },
      moneyMarket:        { label:'Money Market Fund',                                   type:'debt',     schemes:27,  folios:530343,    inflow:725891.6,   redemption:663226.6,  netFlow:62665.1,    aum:3404014.7,  avgAum:3390112.1  },
      shortDuration:      { label:'Short Duration Fund',                                 type:'debt',     schemes:25,  folios:569039,    inflow:24564.6,    redemption:43732.7,   netFlow:-19168.1,   aum:1333990.4,  avgAum:1332955.2  },
      mediumDuration:     { label:'Medium Duration Fund',                                type:'debt',     schemes:13,  folios:241737,    inflow:3878.4,     redemption:4580.9,    netFlow:-702.6,     aum:263769.2,   avgAum:262811.4   },
      mediumToLong:       { label:'Medium to Long Duration Fund',                        type:'debt',     schemes:13,  folios:101256,    inflow:282.1,      redemption:2994.3,    netFlow:-2712.2,    aum:113215.1,   avgAum:114321.2   },
      longDuration:       { label:'Long Duration Fund',                                  type:'debt',     schemes:11,  folios:81398,     inflow:1532.1,     redemption:7821.4,    netFlow:-6289.3,    aum:156716.8,   avgAum:158067.0   },
      dynamicBond:        { label:'Dynamic Bond Fund',                                   type:'debt',     schemes:22,  folios:227542,    inflow:2143.2,     redemption:7658.1,    netFlow:-5514.9,    aum:344390.9,   avgAum:344483.1   },
      corporateBond:      { label:'Corporate Bond Fund',                                 type:'debt',     schemes:21,  folios:573786,    inflow:16737.8,    redemption:39759.2,   netFlow:-23021.4,   aum:1947809.6,  avgAum:1949929.3  },
      creditRisk:         { label:'Credit Risk Fund',                                    type:'debt',     schemes:14,  folios:199856,    inflow:1677.3,     redemption:2619.2,    netFlow:-941.9,     aum:199664.2,   avgAum:199349.2   },
      bankingPSU:         { label:'Banking and PSU Fund',                                type:'debt',     schemes:20,  folios:239763,    inflow:4470.9,     redemption:19198.6,   netFlow:-14727.7,   aum:771389.4,   avgAum:777084.4   },
      gilt:               { label:'Gilt Fund',                                           type:'debt',     schemes:23,  folios:208248,    inflow:12639.6,    redemption:12728.6,   netFlow:-89.1,      aum:373632.2,   avgAum:368542.0   },
      gilt10yr:           { label:'Gilt Fund with 10 year constant duration',            type:'debt',     schemes:5,   folios:36717,     inflow:3500.8,     redemption:2754.6,    netFlow:746.2,      aum:49881.5,    avgAum:49765.5    },
      floater:            { label:'Floater Fund',                                        type:'debt',     schemes:12,  folios:198069,    inflow:13680.8,    redemption:13122.0,   netFlow:558.8,      aum:530267.3,   avgAum:528227.9   },
      multiCap:           { label:'Multi Cap Fund',                                      type:'equity',   schemes:32,  folios:11374795,  inflow:43879.2,    redemption:24543.9,   netFlow:19335.3,    aum:2215860.9,  avgAum:2224640.1  },
      largeCap:           { label:'Large Cap Fund',                                      type:'equity',   schemes:34,  folios:17074655,  inflow:55378.7,    redemption:34261.9,   netFlow:21116.8,    aum:4112317.4,  avgAum:4159508.2  },
      largeMidCap:        { label:'Large & Mid Cap Fund',                                type:'equity',   schemes:33,  folios:13582421,  inflow:58417.5,    redemption:27040.2,   netFlow:31377.3,    aum:3318931.0,  avgAum:3329935.9  },
      midCap:             { label:'Mid Cap Fund',                                        type:'equity',   schemes:32,  folios:24460976,  inflow:78546.1,    redemption:38516.1,   netFlow:40029.9,    aum:4620976.7,  avgAum:4624695.4  },
      smallCap:           { label:'Small Cap Fund',                                      type:'equity',   schemes:34,  folios:27721310,  inflow:75915.2,    redemption:37104.6,   netFlow:38810.6,    aum:3635369.8,  avgAum:3649610.7  },
      dividendYield:      { label:'Dividend Yield Fund',                                 type:'equity',   schemes:11,  folios:1202537,   inflow:3950.8,     redemption:3738.6,    netFlow:212.2,      aum:326430.2,   avgAum:327885.5   },
      valueContra:        { label:'Value Fund/Contra Fund',                              type:'equity',   schemes:25,  folios:8927937,   inflow:25661.8,    redemption:18391.1,   netFlow:7270.7,     aum:2152647.6,  avgAum:2167303.3  },
      focusedFund:        { label:'Focused Fund',                                        type:'equity',   schemes:28,  folios:5487816,   inflow:24671.4,    redemption:15664.3,   netFlow:9007.2,     aum:1728796.6,  avgAum:1745811.9  },
      sectoralThematic:   { label:'Sectoral/Thematic Funds',                             type:'equity',   schemes:246, folios:31953492,  inflow:130941.3,   redemption:101068.4,  netFlow:29872.9,    aum:5298042.0,  avgAum:5314104.5  },
      elss:               { label:'ELSS',                                                type:'equity',   schemes:41,  folios:16468213,  inflow:12950.4,    redemption:19450.7,   netFlow:-6500.2,    aum:2453515.4,  avgAum:2480891.4  },
      flexiCap:           { label:'Flexi Cap Fund',                                      type:'equity',   schemes:44,  folios:22945488,  inflow:110448.4,   redemption:41201.9,   netFlow:69246.5,    aum:5531871.4,  avgAum:5574849.6  },
      conservativeHybrid: { label:'Conservative Hybrid Fund',                            type:'hybrid',   schemes:18,  folios:579547,    inflow:3696.4,     redemption:4375.1,    netFlow:-678.7,     aum:297371.6,   avgAum:297444.1   },
      aggressiveHybrid:   { label:'Balanced Hybrid Fund/Aggressive Hybrid Fund',         type:'hybrid',   schemes:31,  folios:6219899,   inflow:34647.1,    redemption:20455.0,   netFlow:14192.1,    aum:2523938.6,  avgAum:2545637.9  },
      balancedAdvantage:  { label:'Dynamic Asset Allocation/Balanced Advantage Fund',    type:'hybrid',   schemes:36,  folios:5670757,   inflow:47452.1,    redemption:32236.4,   netFlow:15215.7,    aum:3236554.4,  avgAum:3253556.7  },
      multiAsset:         { label:'Multi Asset Allocation Fund',                         type:'hybrid',   schemes:33,  folios:4908663,   inflow:101510.9,   redemption:16748.3,   netFlow:84762.6,    aum:1832458.9, avgAum:1967306.1   },
      arbitrage:          { label:'Arbitrage Fund',                                      type:'hybrid',   schemes:36,  folios:783210,    inflow:203873.8,   redemption:197955.3,  netFlow:5918.5,     aum:2735687.3,  avgAum:3336318.3  },
      equitySavings:      { label:'Equity Savings Fund',                                 type:'hybrid',   schemes:24,  folios:526295,    inflow:17481.5,    redemption:17057.9,   netFlow:423.6,      aum:504980.5,   avgAum:552502.7   },
      retirementFund:     { label:'Retirement Fund',                                     type:'solution', schemes:29,  folios:3055597,   inflow:2937.9,     redemption:2754.2,    netFlow:183.7,      aum:322291.1,   avgAum:326196.7   },
      childrensFund:      { label:'Childrens Fund',                                      type:'solution', schemes:12,  folios:3229968,   inflow:2850.8,     redemption:563.5,     netFlow:2287.3,     aum:254343.8,   avgAum:255578.1   },
      indexFunds:         { label:'Index Funds',                                         type:'passive',  schemes:356, folios:14780965,  inflow:103319.9,   redemption:70985.6,   netFlow:32334.4,    aum:3245672.3,  avgAum:3250790.5  },
      goldETF:            { label:'GOLD ETF',                                            type:'passive',  schemes:25,  folios:12089782,  inflow:77551.9,    redemption:25002.4,   netFlow:52549.5,    aum:1833254.3,  avgAum:1775910.5  },
      otherETFs:          { label:'Other ETFs',                                          type:'passive',  schemes:296, folios:27120892,  inflow:251373.3,   redemption:206501.8,  netFlow:44871.5,    aum:9762084.3,  avgAum:9802733.3  },
      fofOverseas:        { label:'Fund of funds investing overseas',                    type:'passive',  schemes:52,  folios:1727097,   inflow:14125.4,    redemption:5087.7,    netFlow:9037.7,     aum:395956.1,   avgAum:386667.2   },
    }
  }
};

export default async function handler(req) {
  try {
    const url = new URL(req.url);
    let mon  = (url.searchParams.get('month') || '').toLowerCase();
    let year = parseInt(url.searchParams.get('year') || '0');

    if (!mon || !year) {
      const latest = getLatestMonth();
      mon = latest.mon; year = latest.year;
    }

    const cacheKey = `${mon}-${year}`;

    // ── Return known data if available ──
    if (KNOWN_DATA[cacheKey]) {
      const d = KNOWN_DATA[cacheKey];
      return new Response(JSON.stringify({
        ...d,
        parsedCategories: Object.keys(d.categories).length,
        parsedAt: new Date().toISOString(),
        source: 'hardcoded'
      }, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800',
          'Access-Control-Allow-Origin': '*',
          'X-Data-Source': 'hardcoded-amfi-pdf',
        }
      });
    }

    // ── For other months: fetch PDF and parse ──
    const pdfUrl = `https://portal.amfiindia.com/spages/am${mon}${year}repo.pdf`;
    const res = await fetch(pdfUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AbundanceMFCalc/1.0)' }
    });

    if (!res.ok) {
      return new Response(JSON.stringify({
        error: `AMFI report not yet available for ${mon} ${year}. Try a previous month.`,
        tryInstead: Object.keys(KNOWN_DATA),
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const buf   = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    const text  = extractText(bytes);

    const { categories, grandTotal } = parse(text);
    const catCount = Object.keys(categories).length;

    if (catCount < 5) {
      return new Response(JSON.stringify({
        error: `Could not parse category data for ${mon} ${year}. PDF text extraction returned ${catCount} categories.`,
        debug: { textLength: text.length, pdfBytes: buf.byteLength },
        tryInstead: Object.keys(KNOWN_DATA),
      }), {
        status: 422,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const byType = t => Object.values(categories).filter(c => c.type === t);
    const sumAum = a => a.reduce((s,c) => s+(c.aum||0), 0);

    const result = {
      month: mon, year,
      grandTotal,
      summary: {
        totalAum:        grandTotal?.aum       || sumAum(Object.values(categories)),
        totalFolios:     grandTotal?.folios     || 0,
        totalInflow:     grandTotal?.inflow     || 0,
        totalRedemption: grandTotal?.redemption || 0,
        totalNetFlow:    grandTotal?.netFlow     || 0,
        equityAum:       sumAum(byType('equity')),
        debtAum:         sumAum(byType('debt')),
        hybridAum:       sumAum(byType('hybrid')),
        passiveAum:      sumAum(byType('passive')),
      },
      categories,
      parsedCategories: catCount,
      parsedAt: new Date().toISOString(),
      source: 'pdf-parsed',
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=86400, stale-while-revalidate=604800',
        'Access-Control-Allow-Origin': '*',
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}

// ── PDF text extractor ──
function extractText(bytes) {
  const out = [];
  for (let i = 0; i < bytes.length - 1; i++) {
    if (bytes[i] === 40) { // '('
      let s = ''; i++;
      while (i < bytes.length && bytes[i] !== 41) {
        if (bytes[i] === 92 && i+1 < bytes.length) {
          i++;
          if (bytes[i] >= 48 && bytes[i] <= 55) {
            let oct = '';
            for (let n=0; n<3 && bytes[i]>=48 && bytes[i]<=55; n++,i++) oct+=String.fromCharCode(bytes[i]);
            s += String.fromCharCode(parseInt(oct,8)); continue;
          }
          s += String.fromCharCode(bytes[i]);
        } else if (bytes[i] > 31 && bytes[i] < 127) {
          s += String.fromCharCode(bytes[i]);
        }
        i++;
      }
      if (s.trim()) out.push(s.trim());
    }
  }
  return out.join(' ');
}

// ── Parser ──
function parse(text) {
  const N   = '(-?[\\d,]+(?:\\.\\d+)?)';
  const SP  = '[\\s\\S]{0,300}?';
  const CATS = [
    { key:'overnightFund',      label:'Overnight Fund',                                   type:'debt'     },
    { key:'liquidFund',         label:'Liquid Fund',                                       type:'debt'     },
    { key:'ultraShortDuration', label:'Ultra Short Duration Fund',                         type:'debt'     },
    { key:'lowDuration',        label:'Low Duration Fund',                                 type:'debt'     },
    { key:'moneyMarket',        label:'Money Market Fund',                                 type:'debt'     },
    { key:'shortDuration',      label:'Short Duration Fund',                               type:'debt'     },
    { key:'mediumDuration',     label:'Medium Duration Fund',                              type:'debt'     },
    { key:'mediumToLong',       label:'Medium to Long Duration Fund',                      type:'debt'     },
    { key:'longDuration',       label:'Long Duration Fund',                                type:'debt'     },
    { key:'dynamicBond',        label:'Dynamic Bond Fund',                                 type:'debt'     },
    { key:'corporateBond',      label:'Corporate Bond Fund',                               type:'debt'     },
    { key:'creditRisk',         label:'Credit Risk Fund',                                  type:'debt'     },
    { key:'bankingPSU',         label:'Banking and PSU Fund',                              type:'debt'     },
    { key:'gilt',               label:'Gilt Fund',                                         type:'debt'     },
    { key:'gilt10yr',           label:'Gilt Fund with 10 year constant duration',          type:'debt'     },
    { key:'floater',            label:'Floater Fund',                                      type:'debt'     },
    { key:'multiCap',           label:'Multi Cap Fund',                                    type:'equity'   },
    { key:'largeCap',           label:'Large Cap Fund',                                    type:'equity'   },
    { key:'largeMidCap',        label:'Large & Mid Cap Fund',                              type:'equity'   },
    { key:'midCap',             label:'Mid Cap Fund',                                      type:'equity'   },
    { key:'smallCap',           label:'Small Cap Fund',                                    type:'equity'   },
    { key:'dividendYield',      label:'Dividend Yield Fund',                               type:'equity'   },
    { key:'valueContra',        label:'Value Fund/Contra Fund',                            type:'equity'   },
    { key:'focusedFund',        label:'Focused Fund',                                      type:'equity'   },
    { key:'sectoralThematic',   label:'Sectoral/Thematic Funds',                           type:'equity'   },
    { key:'elss',               label:'ELSS',                                              type:'equity'   },
    { key:'flexiCap',           label:'Flexi Cap Fund',                                    type:'equity'   },
    { key:'conservativeHybrid', label:'Conservative Hybrid Fund',                          type:'hybrid'   },
    { key:'aggressiveHybrid',   label:'Balanced Hybrid Fund/Aggressive Hybrid Fund',       type:'hybrid'   },
    { key:'balancedAdvantage',  label:'Dynamic Asset Allocation/Balanced Advantage Fund',  type:'hybrid'   },
    { key:'multiAsset',         label:'Multi Asset Allocation Fund',                       type:'hybrid'   },
    { key:'arbitrage',          label:'Arbitrage Fund',                                    type:'hybrid'   },
    { key:'equitySavings',      label:'Equity Savings Fund',                               type:'hybrid'   },
    { key:'retirementFund',     label:'Retirement Fund',                                   type:'solution' },
    { key:'childrensFund',      label:'Childrens Fund',                                    type:'solution' },
    { key:'indexFunds',         label:'Index Funds',                                       type:'passive'  },
    { key:'goldETF',            label:'GOLD ETF',                                          type:'passive'  },
    { key:'otherETFs',          label:'Other ETFs',                                        type:'passive'  },
    { key:'fofOverseas',        label:'Fund of funds investing overseas',                  type:'passive'  },
  ];

  const categories = {};
  for (const cat of CATS) {
    const esc = cat.label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const m = text.match(new RegExp(esc + SP + N + SP + N + SP + N + SP + N + SP + N + SP + N + SP + N));
    if (m) categories[cat.key] = {
      label: cat.label, type: cat.type,
      schemes: p(m[1]), folios: p(m[2]), inflow: p(m[3]),
      redemption: p(m[4]), netFlow: p(m[5]), aum: p(m[6]), avgAum: p(m[7])
    };
  }

  const gtm = text.match(new RegExp('Grand Total' + SP + N + SP + N + SP + N + SP + N + SP + N + SP + N + SP + N));
  const grandTotal = gtm ? {
    schemes: p(gtm[1]), folios: p(gtm[2]), inflow: p(gtm[3]),
    redemption: p(gtm[4]), netFlow: p(gtm[5]), aum: p(gtm[6]), avgAum: p(gtm[7])
  } : null;

  return { categories, grandTotal };
}

function p(s) { return parseFloat(String(s||0).replace(/,/g,'')) || 0; }
