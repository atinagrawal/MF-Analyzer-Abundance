// api/index-dashboard.js
// Fetches and parses the monthly NSE Index Dashboard PDF from niftyindices.com
// PDF URL pattern: https://niftyindices.com/Index_Dashboard/Index_Dashboard_MAR2026.pdf
//
// Returns: { month, asOf, indices: [{name, category, returns:{1m,3m,1y,3y,5y}, risk:{vol,beta,corr,r2}, val:{pe,pb,dy}}] }
//
// Cached 12 hours (data is monthly, no point hitting PDF on every request)

const https = require('https');

const MONTH_NAMES = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const MONTH_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// All known index names from NSE Index Dashboard PDF (March 2026)
// Used to reliably parse multi-word names from the PDF text
const INDEX_META = {
  // Broad Market
  'NIFTY 50':                          { cat: 'broad',    short: 'N50'     },
  'Nifty Next 50':                     { cat: 'broad',    short: 'NXT50'   },
  'Nifty 100':                         { cat: 'broad',    short: 'N100'    },
  'Nifty 200':                         { cat: 'broad',    short: 'N200'    },
  'Nifty 500':                         { cat: 'broad',    short: 'N500'    },
  'Nifty Midcap 150':                  { cat: 'broad',    short: 'MID150'  },
  'Nifty Midcap 50':                   { cat: 'broad',    short: 'MID50'   },
  'Nifty Midcap 100':                  { cat: 'broad',    short: 'MID100'  },
  'Nifty Midcap Select':               { cat: 'broad',    short: 'MIDSEL'  },
  'Nifty Smallcap 250':                { cat: 'broad',    short: 'SM250'   },
  'Nifty Smallcap 50':                 { cat: 'broad',    short: 'SM50'    },
  'Nifty Smallcap 100':                { cat: 'broad',    short: 'SM100'   },
  'Nifty Smallcap 500':                { cat: 'broad',    short: 'SM500'   },
  'Nifty LargeMidcap 250':             { cat: 'broad',    short: 'LRGMID'  },
  'Nifty MidSmallcap 400':             { cat: 'broad',    short: 'MIDSM'   },
  'Nifty MidSmallcap400 50:50':        { cat: 'broad',    short: 'MS5050'  },
  'Nifty Total Market':                { cat: 'broad',    short: 'TOTMKT'  },
  'Nifty Microcap 250':                { cat: 'broad',    short: 'MICRO'   },
  'Nifty500 Multicap 50:25:25':        { cat: 'broad',    short: 'MULTICAP'},
  'Nifty500 LargeMidSmall Equal-Cap Weighted': { cat: 'broad', short: 'ECWT' },
  'Nifty India FPI 150':               { cat: 'broad',    short: 'FPI150'  },
  // Sectoral
  'Nifty Auto':                        { cat: 'sectoral', short: 'AUTO'    },
  'Nifty Bank':                        { cat: 'sectoral', short: 'BANK'    },
  'Nifty Cement':                      { cat: 'sectoral', short: 'CEMENT'  },
  'Nifty Chemicals':                   { cat: 'sectoral', short: 'CHEM'    },
  'Nifty Consumer Durables':           { cat: 'sectoral', short: 'CONSDUR' },
  'Nifty Financial Services':          { cat: 'sectoral', short: 'FINSERV' },
  'Nifty Financial Services 25/50':    { cat: 'sectoral', short: 'FIN2550' },
  'Nifty Financial Services Ex-Bank':  { cat: 'sectoral', short: 'FINEXBK' },
  'Nifty FMCG':                        { cat: 'sectoral', short: 'FMCG'    },
  'Nifty Healthcare Index':            { cat: 'sectoral', short: 'HLTH'    },
  'Nifty IT':                          { cat: 'sectoral', short: 'IT'      },
  'Nifty Media':                       { cat: 'sectoral', short: 'MEDIA'   },
  'Nifty Metal':                       { cat: 'sectoral', short: 'METAL'   },
  'Nifty MidSmall Financial Services': { cat: 'sectoral', short: 'MSFINSR' },
  'Nifty MidSmall Healthcare':         { cat: 'sectoral', short: 'MSHLTH'  },
  'Nifty MidSmall IT & Telecom':       { cat: 'sectoral', short: 'MSIT'    },
  'Nifty Oil & Gas':                   { cat: 'sectoral', short: 'OILGAS'  },
  'Nifty Pharma':                      { cat: 'sectoral', short: 'PHARMA'  },
  'Nifty Private Bank':                { cat: 'sectoral', short: 'PVTBANK' },
  'Nifty PSU Bank':                    { cat: 'sectoral', short: 'PSUBANK' },
  'Nifty Realty':                      { cat: 'sectoral', short: 'REALTY'  },
  'Nifty REITs & Realty':              { cat: 'sectoral', short: 'REITS'   },
  'Nifty500 Healthcare':               { cat: 'sectoral', short: 'HLT500'  },
  // Strategy
  'Nifty Alpha 50':                    { cat: 'strategy', short: 'ALPHA50' },
  'Nifty Alpha Low-Volatility 30':     { cat: 'strategy', short: 'ALPHALV' },
  'Nifty Alpha Quality Low-Volatility 30': { cat: 'strategy', short: 'AQALV' },
  'Nifty Alpha Quality Value Low-Volatility 30': { cat: 'strategy', short: 'AQVLV' },
  'Nifty Dividend Opportunities 50':   { cat: 'strategy', short: 'DIV50'  },
  'Nifty Growth Sectors 15':           { cat: 'strategy', short: 'GROWTH' },
  'Nifty High Beta 50':                { cat: 'strategy', short: 'HBETA'  },
  'Nifty Low Volatility 50':           { cat: 'strategy', short: 'LVOL50' },
  'Nifty Midcap150 Momentum 50':       { cat: 'strategy', short: 'M150M50'},
  'Nifty Midcap150 Quality 50':        { cat: 'strategy', short: 'M150Q50'},
  'Nifty MidSmallcap400 Momentum Quality 100': { cat: 'strategy', short: 'MS400MQ'},
  'Nifty Quality Low-Volatility 30':   { cat: 'strategy', short: 'QLVOL'  },
  'Nifty Smallcap250 Momentum Quality 100': { cat: 'strategy', short: 'S250MQ' },
  'Nifty Smallcap250 Quality 50':      { cat: 'strategy', short: 'S250Q'  },
  'Nifty Top 10 Equal Weight':         { cat: 'strategy', short: 'TOP10'  },
  'Nifty Top 15 Equal Weight':         { cat: 'strategy', short: 'TOP15'  },
  'Nifty Top 20 Equal Weight':         { cat: 'strategy', short: 'TOP20'  },
  'Nifty Total Market Momentum Quality 50': { cat: 'strategy', short: 'TMMQ50'},
  'Nifty100 Alpha 30':                 { cat: 'strategy', short: 'N100A30'},
  'Nifty100 Equal Weight':             { cat: 'strategy', short: 'N100EW' },
  'Nifty100 Low Volatility 30':        { cat: 'strategy', short: 'N100LV' },
  'Nifty100 Quality 30':               { cat: 'strategy', short: 'N100Q30'},
  'Nifty200 Alpha 30':                 { cat: 'strategy', short: 'N200A30'},
  'Nifty200 Momentum 30':              { cat: 'strategy', short: 'N200M30'},
  'Nifty200 Quality 30':               { cat: 'strategy', short: 'N200Q30'},
  'Nifty200 Value 30':                 { cat: 'strategy', short: 'N200V30'},
  'Nifty500 Equal Weight':             { cat: 'strategy', short: 'N500EW' },
  'Nifty500 Flexicap Quality 30':      { cat: 'strategy', short: 'N500FQ' },
  'Nifty500 Low Volatility 50':        { cat: 'strategy', short: 'N500LV' },
  'Nifty500 Momentum 50':              { cat: 'strategy', short: 'N500M50'},
  'Nifty500 Multicap Momentum Quality 50': { cat: 'strategy', short: 'N500MMQ'},
  'Nifty500 Multifactor MQVLv 50':     { cat: 'strategy', short: 'N500MF' },
  'Nifty500 Quality 50':               { cat: 'strategy', short: 'N500Q50'},
  'Nifty500 Value 50':                 { cat: 'strategy', short: 'N500V50'},
  'Nifty50 Equal Weight':              { cat: 'strategy', short: 'N50EW'  },
  'Nifty50 Value 20':                  { cat: 'strategy', short: 'N50V20' },
  // Thematic
  'Nifty100 Enhanced ESG':             { cat: 'thematic', short: 'EESG'   },
  'Nifty100 ESG':                      { cat: 'thematic', short: 'ESG100' },
};

const KNOWN_NAMES = Object.keys(INDEX_META);

async function fetchPdfText(url) {
  // Fetch the PDF binary
  const buffer = await new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' } }, res => {
      if (res.statusCode !== 200) {
        // Drain response
        res.resume();
        return resolve({ status: res.statusCode, text: null });
      }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, buffer: Buffer.concat(chunks) }));
    }).on('error', reject).setTimeout(25000, function() { this.destroy(new Error('PDF fetch timeout')); });
  });

  if (!buffer.buffer) return { status: buffer.status, text: null };

  // Use pdf-parse to extract text
  const pdfParse = require('pdf-parse');
  const data = await pdfParse(buffer.buffer, {
    // Extract all pages as text
    max: 0,
  });
  return { status: 200, text: data.text };
}

function parsePdfText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const indices = [];

  // Section headers mark category changes
  const catMap = {
    'broad market': 'broad',
    'strategy indices': 'strategy',
    'strategy': 'strategy',
    'sectoral indices': 'sectoral',
    'sectoral': 'sectoral',
    'thematic indices': 'thematic',
    'thematic': 'thematic',
  };

  // Skip lines that are definitely headers/noise
  const SKIP = new Set([
    'index dashboard','returns (%)','index name','volatility (%)','beta','correlation',
    'r','p/e','p/b','dividend','yield','based on total return index','contact us',
    '1 yr','3 yr','5 yr','1m','3m','2','indices','about nse indices limited',
    'nse indices limited','exchange plaza',
  ]);

  function isSkip(l) {
    const ll = l.toLowerCase();
    return SKIP.has(ll) || ll.startsWith('for more') || ll.startsWith('nse indices')
      || ll.startsWith('exchange plaza') || ll.startsWith('telephone')
      || ll.startsWith('disclaimer') || ll.startsWith('www.')
      || l.length < 2 || /^\d{1,2}$/.test(l);
  }

  // A numbers line: starts with optional minus, a digit, a dot — and contains ≥10 floats
  function isNumbersLine(l) {
    return /^-?\d+\./.test(l) && (l.match(/-?\d+\.\d{2}/g) || []).length >= 10;
  }

  // An index name line: not a number, not a skip, reasonable length
  function isNameLine(l) {
    return !isSkip(l) && !isNumbersLine(l) && l.length >= 4 && l.length <= 80;
  }

  let currentCat = 'broad';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ll = line.toLowerCase();

    // Detect category changes
    for (const [key, val] of Object.entries(catMap)) {
      if (ll.includes(key) && line.length < 60) {
        currentCat = val;
        break;
      }
    }

    // Numbers line — look back for the name
    if (isNumbersLine(line)) {
      // Find the most recent name line before this
      let name = null;
      for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
        if (isNameLine(lines[j])) { name = lines[j]; break; }
      }
      if (!name) continue;

      // Extract exactly 12 numbers using the 2-decimal pattern
      const nums = (line.match(/-?\d+\.\d{2}/g) || []).map(Number);
      if (nums.length < 12) continue;

      const meta = INDEX_META[name];
      const cat = meta?.cat || currentCat;

      indices.push({
        name,
        cat,
        short: meta?.short || name.slice(0, 8).toUpperCase(),
        returns: { r1m: nums[0], r3m: nums[1], r1y: nums[2], r3y: nums[3], r5y: nums[4] },
        risk:    { vol: nums[5], beta: nums[6], corr: nums[7], r2: nums[8] },
        val:     { pe: nums[9], pb: nums[10], dy: nums[11] },
      });
    }
  }

  return indices;
}



// Riskometer URL pattern: NSE_Indices_Riskometer_YYYY-MM.pdf
// Try current month, fall back to previous month
function getRiskometerUrl(year, month) {
  // month: 1-12
  const mm = String(month).padStart(2, '0');
  return `https://niftyindices.com/Benchmark_Riskometer/NSE_Indices_Riskometer_${year}-${mm}.pdf`;
}

async function fetchRiskometer() {
  const now = new Date();
  // Try previous month (riskometer typically lags by ~1 month vs dashboard)
  const attempts = [];
  for (let i = 1; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    attempts.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
  }

  for (const { year, month } of attempts) {
    const url = getRiskometerUrl(year, month);
    try {
      const { status, text } = await fetchPdfText(url);
      if (status === 200 && text) {
        return parseRiskometer(text);
      }
    } catch(e) { /* try next */ }
  }
  return {}; // graceful fallback — riskometer is optional
}

function parseRiskometer(text) {
  const result = {};
  const LABELS = ['Low To Moderate', 'Moderately High', 'Moderately Low', 'Very High', 'Moderate', 'High', 'Low'];
  const labelPat = LABELS.join('|');
  // Line format: "1 Nifty 50 5.33 Very High Broad Market"
  // Match: serial  name  score  label
  const lineRe = new RegExp(`^\d+\s+(.+?)\s+(\d+\.\d+)\s+(${labelPat})`, 'gm');
  let m;
  while ((m = lineRe.exec(text)) !== null) {
    const name = m[1].trim();
    const score = parseFloat(m[2]);
    const label = m[3];
    result[name] = { score, label };
  }
  return result;
}

function getPdfUrl(year, month) {
  // month: 0-11
  return `https://niftyindices.com/Index_Dashboard/Index_Dashboard_${MONTH_NAMES[month]}${year}.pdf`;
}

function getCurrentPdfUrl() {
  const now = new Date();
  // Try current month; if before 10th, try last month (data typically released by 10th)
  if (now.getDate() < 10) {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return { url: getPdfUrl(prev.getFullYear(), prev.getMonth()), year: prev.getFullYear(), month: prev.getMonth() };
  }
  return { url: getPdfUrl(now.getFullYear(), now.getMonth()), year: now.getFullYear(), month: now.getMonth() };
}


// ── Blob caching for parsed index data ─────────────────────────────────────
// Avoids fetching & parsing two PDFs on every CDN miss (~6-8s cold)
// Cache key: idx-dashboard-YYYY-MM.json  (refreshed monthly)

async function dashboardCacheGet(year, month) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const { list } = require('@vercel/blob');
    const key = `idx-dashboard-${year}-${String(month+1).padStart(2,'0')}.json`;
    const { blobs } = await list({ prefix: key, limit: 1, token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!blobs.length) return null;
    const r = await fetch(blobs[0].url + '?t=' + Date.now());
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function dashboardCachePut(year, month, payload) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  try {
    const { put } = require('@vercel/blob');
    const key = `idx-dashboard-${year}-${String(month+1).padStart(2,'0')}.json`;
    await put(key, JSON.stringify(payload), {
      access: 'public', contentType: 'application/json',
      addRandomSuffix: false, token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  } catch(e) {
    console.error('[index-dashboard] blob write FAILED — name:', e.name, 'msg:', e.message);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // Cache 12 hours — monthly data
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');  // blob handles persistence
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Allow override for testing: ?month=MAR2025
  let pdfUrl, year, month;
  if (req.query.month) {
    const m = req.query.month.toUpperCase();
    const mn = MONTH_NAMES.indexOf(m.slice(0, 3));
    const yr = parseInt(m.slice(3));
    if (mn >= 0 && yr >= 2020) {
      pdfUrl = getPdfUrl(yr, mn);
      year = yr; month = mn;
    }
  }
  if (!pdfUrl) {
    const cur = getCurrentPdfUrl();
    pdfUrl = cur.url; year = cur.year; month = cur.month;
  }

  try {
    // Check blob cache first — avoids fetching PDFs on every CDN miss
    const cached = await dashboardCacheGet(year, month);
    if (cached?.indices?.length) {
      return res.status(200).json({ ...cached, source: 'NSE Indices', cached: true });
    }

    // Cache miss — fetch dashboard PDF and riskometer in parallel
    const [{ status, text }, riskMap] = await Promise.all([
      fetchPdfText(pdfUrl),
      fetchRiskometer(),
    ]);

    if (status !== 200 || !text) {
      // Try previous month as fallback
      const prev = new Date(year, month - 1, 1);
      const prevUrl = getPdfUrl(prev.getFullYear(), prev.getMonth());
      const fallback = await fetchPdfText(prevUrl);
      if (fallback.status !== 200 || !fallback.text) {
        return res.status(502).json({ error: `PDF not available: ${pdfUrl}`, status });
      }
      year = prev.getFullYear(); month = prev.getMonth();
      const indices = parsePdfText(fallback.text);
      const enrichedFallback = indices.map(idx => { const r = riskMap[idx.name]; return r ? { ...idx, riskScore: r.score, riskLabel: r.label } : idx; });
      return res.status(200).json({ month: MONTH_FULL[month], year, asOf: `${year}-${String(month+1).padStart(2,'0')}-28`, count: enrichedFallback.length, indices: enrichedFallback, source: 'NSE Indices' });
    }

    const indices = parsePdfText(text);

    if (!indices.length) {
      // Log first 1000 chars for debugging
      // Log first 500 chars to runtime logs for debugging
      const preview = text ? text.slice(0, 500) : 'no text extracted';
      console.error('[index-dashboard] Parse failed. Preview:', preview.replace(/\n/g,' '));
      return res.status(500).json({ error: 'PDF parsed but no indices found. Check runtime logs.', url: pdfUrl });
    }

    // Merge riskometer scores
    const enriched = indices.map(idx => {
      const risk = riskMap[idx.name];
      return risk ? { ...idx, riskScore: risk.score, riskLabel: risk.label } : idx;
    });

    const payload = {
      month: MONTH_FULL[month],
      year,
      asOf: `${year}-${String(month+1).padStart(2,'0')}-${new Date(year, month+1, 0).getDate()}`,
      count: enriched.length,
      indices: enriched,
    };

    // Fire-and-forget blob write — cache for next request
    dashboardCachePut(year, month, payload).catch(() => {});

    return res.status(200).json({ ...payload, source: 'NSE Indices' });

  } catch (err) {
    return res.status(500).json({ error: err.message, url: pdfUrl });
  }
};
