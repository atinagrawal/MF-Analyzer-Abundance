// /api/mf-portfolio?amcCode=HDFC&scheme=HDFC+Flexi+Cap+Fund&month=2026-01
// Returns parsed holdings JSON from AMC monthly portfolio PDFs
// Strategy: hardcoded URL templates per AMC, HEAD-check each URL, fallback to prev month

export const config = { runtime: 'nodejs' };

const https = require('https');
const http = require('http');
const zlib = require('zlib');

// --- AMC URL Templates ---
// Each AMC has: url(year, mon, mm) -> string | string[]
// mon = 'January', mm = '01', yy = '26'
// Confidence: [verified] verified  [medium] pattern-inferred  [low] guessed

const AMC_CONFIG = {
  NIPPON: {
    name: 'Nippon India',
    url: (year, mon, mm, yy) => [
      `https://mf.nipponindiaim.com/InvestorServices/Reports/PortfolioMon/Nippon-India-MF-Monthly-Portfolio-${mon}-${year}.pdf`,
      `https://mf.nipponindiaim.com/InvestorServices/Reports/PortfolioMon/Nippon-India-Monthly-Portfolio-${mon}-${year}.pdf`,
      `https://mf.nipponindiaim.com/InvestorServices/Reports/PortfolioMon/NipponIndia-Monthly-Portfolio-${mon}-${year}.pdf`,
      `https://mf.nipponindiaim.com/InvestorServices/FactSheets/NipponIndia-Factsheet-${mon}-${year}.pdf`,
    ],
    confidence: 'medium',
  },
  PPFAS: {
    name: 'Parag Parikh',
    url: (year, mon, mm, yy) => {
      const monLower = mon.toLowerCase();
      const mon3 = mon.substring(0, 3).toLowerCase();
      return [
        `https://amc.ppfas.com/downloads/portfolio-disclosure/ppfas-mf-monthly-portfolio-${monLower}-${year}.pdf`,
        `https://amc.ppfas.com/schemes/scheme-financials/${monLower}-${year}/monthly-portfolio-disclosure-${monLower}-${year}.pdf`,
        `https://amc.ppfas.com/downloads/portfolio-disclosure/ppfas-portfolio-${mon3}${yy}.pdf`,
        `https://amc.ppfas.com/downloads/factsheet/${year}/ppfas-mf-factsheet-for-${mon}-${year}.pdf`,
      ];
    },
    confidence: 'medium',
  },
  HDFC: {
    name: 'HDFC',
    url: (year, mon, mm, yy) => [
      `https://files.hdfcfund.com/s3fs-public/Portfolio/${year}-${mm}/HDFC-MF-Monthly-Portfolio-${mon}-${year}.pdf`,
      `https://files.hdfcfund.com/s3fs-public/Portfolio/${year}-${mm}/HDFC-MF-Portfolio-${mon}-${year}.pdf`,
      `https://files.hdfcfund.com/s3fs-public/Portfolio/${year}-${mm}/HDFC-MF-Monthly-Portfolio-${mon}-${year}-Equity.pdf`,
    ],
    confidence: 'medium',
  },
  SBI: {
    name: 'SBI',
    url: (year, mon, mm, yy) => [
      `https://www.sbimf.com/docs/default-source/scheme-portfolios/${mon.toLowerCase()}${yy}port.pdf`,
      `https://www.sbimf.com/docs/default-source/scheme-portfolios/${mon.substring(0,3).toLowerCase()}${yy}port.pdf`,
    ],
    confidence: 'medium',
  },
  ABSL: {
    name: 'Aditya Birla Sun Life',
    url: (year, mon, mm, yy) => [
      `https://mutualfund.adityabirlacapital.com/downloads/portfolio/monthly-portfolio-${mon.toLowerCase()}-${yy}.pdf`,
      `https://mutualfund.adityabirlacapital.com/downloads/portfolio/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${yy}.pdf`,
    ],
    confidence: 'medium',
  },
  ICICI: {
    name: 'ICICI Prudential',
    url: (year, mon, mm, yy) => [
      `https://www.icicipruamc.com/docs/default-source/monthly-portfolio/portfolio-${mon.toLowerCase()}${year}.pdf`,
      `https://www.icicipruamc.com/docs/default-source/monthly-portfolio/portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
      `https://www.icicipruamc.com/docs/default-source/monthly-portfolio/ipamc-monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'medium',
  },
  MIRAE: {
    name: 'Mirae Asset',
    url: (year, mon, mm, yy) => [
      `https://www.miraeassetmf.co.in/docs/default-source/monthly-portfolio/portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
      `https://www.miraeassetmf.co.in/docs/default-source/monthly-portfolio/mirae-asset-mf-portfolio-${mon.toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'medium',
  },
  KOTAK: {
    name: 'Kotak',
    url: (year, mon, mm, yy) => [
      `https://www.kotakmf.com/docs/default-source/portfolio/monthly-portfolio/portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
      `https://www.kotakmf.com/getmedia/monthly-portfolio-${mon.toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
  AXIS: {
    name: 'Axis',
    url: (year, mon, mm, yy) => [
      `https://www.axismf.com/downloads/portfolio/${mon.substring(0,3).toLowerCase()}-${year}-monthly-portfolio.pdf`,
      `https://www.axismf.com/downloads/portfolio/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
  UTI: {
    name: 'UTI',
    url: (year, mon, mm, yy) => [
      `https://www.utimf.com/portfolio-disclosure/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
      `https://www.utimf.com/content/dam/uti/downloads/portfolio/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
  DSP: {
    name: 'DSP',
    url: (year, mon, mm, yy) => [
      `https://www.dspim.com/content/dam/dsp/portfolio/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
      `https://www.dspim.com/downloads/portfolio/dsp-monthly-portfolio-${mon.toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
  FRANKLIN: {
    name: 'Franklin Templeton',
    url: (year, mon, mm, yy) => [
      `https://www.franklintempletonindia.com/downloadsServlet/pdf/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
  TATA: {
    name: 'Tata',
    url: (year, mon, mm, yy) => [
      `https://www.tatamutualfund.com/docs/default-source/portfolio/monthly-portfolio/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
  INVESCO: {
    name: 'Invesco',
    url: (year, mon, mm, yy) => [
      `https://www.invescomutualfund.com/docs/default-source/portfolio/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
  BANDHAN: {
    name: 'Bandhan',
    url: (year, mon, mm, yy) => [
      `https://www.bandhanmf.com/uploads/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ],
    confidence: 'low',
  },
};

// --- Month helpers ---
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function getMonthParams(date) {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-indexed
  return {
    year: String(y),
    mon: MONTHS[m],
    mm: String(m + 1).padStart(2, '0'),
    yy: String(y).slice(2),
  };
}

// --- HTTP helpers ---
function httpHead(urlStr, timeout = 5000) {
  return new Promise((resolve) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({ hostname: u.hostname, path: u.pathname + u.search,
      method: 'HEAD', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MFCalc/1.0)' },
      timeout }, (res) => resolve(res.statusCode));
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.end();
  });
}

function httpGet(urlStr, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get({
      hostname: u.hostname, path: u.pathname + u.search,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MFCalc/1.0)',
                 'Accept': 'application/pdf,*/*' },
      timeout,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpGet(res.headers.location, timeout).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

// --- PDF text extractor (no external deps) ---
function extractTextFromPDF(buf) {
  // Extract text streams from PDF using basic parsing
  const str = buf.toString('latin1');
  const texts = [];

  // Find all stream blocks
  let pos = 0;
  while (true) {
    const streamStart = str.indexOf('stream', pos);
    if (streamStart === -1) break;
    const streamEnd = str.indexOf('endstream', streamStart);
    if (streamEnd === -1) break;

    // Get the dictionary before stream to check for FlateDecode
    const dictStart = str.lastIndexOf('<<', streamStart);
    const dict = str.slice(dictStart, streamStart);
    const isFlate = dict.includes('FlateDecode') || dict.includes('Fl\n');
    const rawStream = buf.slice(streamStart + 7, streamEnd); // skip 'stream\n'

    try {
      let decoded;
      if (isFlate) {
        try { decoded = zlib.inflateSync(rawStream).toString('utf8'); }
        catch { decoded = rawStream.toString('latin1'); }
      } else {
        decoded = rawStream.toString('latin1');
      }

      // Extract text from BT...ET blocks
      const btRegex = /BT\s*([\s\S]*?)\s*ET/g;
      let m;
      while ((m = btRegex.exec(decoded)) !== null) {
        const block = m[1];
        // Extract Tj, TJ, ' strings
        const strRegex = /\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")|(\[(?:[^\]]*)\])\s*TJ/g;
        let sm;
        while ((sm = strRegex.exec(block)) !== null) {
          if (sm[1] !== undefined) {
            texts.push(unescape(sm[1].replace(/\\([0-7]{3})/g,
              (_, o) => String.fromCharCode(parseInt(o, 8)))));
          } else if (sm[2]) {
            // TJ array - extract string parts
            const tjStr = sm[2].replace(/\(((?:[^()\\]|\\.)*)\)/g, (_, s) => s + ' ');
            texts.push(tjStr.replace(/\s+/g, ' ').trim());
          }
        }
      }
    } catch { /* skip bad streams */ }

    pos = streamEnd + 9;
  }

  return texts.join('\n').replace(/\r/g, '').replace(/[ \t]+/g, ' ');
}

// --- Holdings parser ---
function parseHoldings(text, schemeName) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const holdings = [];

  // Find the scheme section
  const schemeNorm = schemeName.toLowerCase().replace(/\s+/g, ' ').trim();
  let inScheme = false;
  let inHoldings = false;
  let headerFound = false;

  // Common column patterns in AMC PDFs
  // Look for: ISIN | Company Name | Rating | Sector | Quantity | Market Value | % to NAV
  const holdingLineRe = /^(INE[A-Z0-9]{9})\s+(.+?)\s+[\d,]+\.?\d*\s+([\d,]+\.?\d*)\s+([\d.]+)\s*%?$/;
  const percentRe = /([\d.]+)\s*%/;

  // Generic pattern: lines with company name + percentage
  // We look for lines after headers like "Name of Instrument" / "Security Name"
  const headerKeywords = ['name of instrument', 'security name', 'name of security',
    'issuer', 'company name', 'scrip name'];
  const stopKeywords = ['total', 'grand total', 'sub total', 'net assets'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ll = line.toLowerCase();

    // Find scheme section
    if (!inScheme && schemeNorm && ll.includes(schemeNorm.substring(0, 20))) {
      inScheme = true;
    }

    // Find holdings table header
    if (headerKeywords.some(kw => ll.includes(kw))) {
      headerFound = true;
      inHoldings = true;
      continue;
    }

    if (!inHoldings && !headerFound) continue;

    // Stop at totals or new scheme
    if (stopKeywords.some(kw => ll.startsWith(kw)) && holdings.length > 0) {
      if (ll.includes('grand total') || ll.includes('net assets')) break;
    }

    // Try to extract a holding line
    // Pattern: something that ends with a percentage
    const pctMatch = line.match(/(\d{1,3}\.\d{1,4})\s*$/);
    if (!pctMatch) continue;

    const pct = parseFloat(pctMatch[1]);
    if (pct <= 0 || pct > 50) continue; // sanity check

    // Extract name - everything before the numbers
    const namePart = line.replace(/[\d,\s.%]+$/, '').trim();
    if (namePart.length < 3 || namePart.length > 100) continue;

    // Skip header-like lines
    if (headerKeywords.some(kw => namePart.toLowerCase().includes(kw))) continue;

    // Extract ISIN if present
    const isinMatch = line.match(/INE[A-Z0-9]{9}/);
    const isin = isinMatch ? isinMatch[0] : null;

    // Clean name
    let name = namePart.replace(/^INE[A-Z0-9]{9}\s*/, '').trim();
    if (!name || name.match(/^\d/)) continue;

    holdings.push({ name, isin, pct });
  }

  // Deduplicate and sort
  const seen = new Set();
  return holdings
    .filter(h => { if (seen.has(h.name)) return false; seen.add(h.name); return true; })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 50); // top 50 holdings max
}

// --- URL discovery ---
async function findWorkingURL(amcKey, date, collectTriedUrls) {
  const cfg = AMC_CONFIG[amcKey];
  if (!cfg) return null;

  // Try current month then previous 2 months
  for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
    const d = new Date(date);
    d.setMonth(d.getMonth() - monthOffset);
    const params = getMonthParams(d);
    const urls = cfg.url(params.year, params.mon, params.mm, params.yy);

    for (const url of urls) {
      try {
        const status = await httpHead(url);
        if (collectTriedUrls) collectTriedUrls.push({ url, status });
        if (status === 200 || status === 302) {
          return { url, ...params, monthOffset };
        }
      } catch (e) {
        if (collectTriedUrls) collectTriedUrls.push({ url, status: 0, error: e.message });
      }
    }
  }
  return null;
}

// --- Main handler ---
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { amc, scheme, action } = req.query;

  // Action: list -> return all known AMCs
  if (action === 'list') {
    return res.json({
      amcs: Object.entries(AMC_CONFIG).map(([key, cfg]) => ({
        key, name: cfg.name, confidence: cfg.confidence,
      })),
    });
  }

  // Action: probe -> check which URL works for an AMC this month
  if (action === 'probe' && amc) {
    const amcKey = amc.toUpperCase();
    if (!AMC_CONFIG[amcKey]) {
      return res.status(400).json({ error: `Unknown AMC: ${amc}` });
    }
    const tried = [];
    const result = await findWorkingURL(amcKey, new Date(), tried);
    if (!result) {
      return res.status(404).json({ error: 'No working URL found', amc: amcKey, tried });
    }
    return res.json({
      amc: amcKey,
      name: AMC_CONFIG[amcKey].name,
      url: result.url,
      month: result.mon,
      year: result.year,
      monthOffset: result.monthOffset,
      tried,
    });
  }

  // Action: holdings -> full parse
  if (!amc) {
    return res.status(400).json({
      error: 'Missing ?amc= parameter',
      example: '/api/mf-portfolio?amc=HDFC&scheme=HDFC+Flexi+Cap+Fund',
      available: Object.keys(AMC_CONFIG),
    });
  }

  const amcKey = amc.toUpperCase();
  if (!AMC_CONFIG[amcKey]) {
    return res.status(400).json({ error: `Unknown AMC: ${amc}`, available: Object.keys(AMC_CONFIG) });
  }

  try {
    // Step 1: Find working URL
    const found = await findWorkingURL(amcKey, new Date(), null);
    if (!found) {
      return res.status(503).json({
        error: 'Could not find portfolio PDF for this AMC',
        amc: amcKey,
        confidence: AMC_CONFIG[amcKey].confidence,
        hint: 'URL pattern may have changed. Please report this.',
      });
    }

    // Step 2: Download PDF (with size cap at 15MB)
    let pdfBuf;
    try {
      pdfBuf = await httpGet(found.url, 20000);
    } catch (e) {
      return res.status(503).json({ error: `PDF fetch failed: ${e.message}`, url: found.url });
    }

    if (pdfBuf.length > 15 * 1024 * 1024) {
      return res.status(413).json({ error: 'PDF too large (>15MB)', size: pdfBuf.length });
    }

    // Step 3: Extract text
    const text = extractTextFromPDF(pdfBuf);
    if (!text || text.length < 500) {
      return res.status(422).json({
        error: 'Could not extract text from PDF (may be image-based)',
        url: found.url,
        textLength: text?.length ?? 0,
      });
    }

    // Step 4: Parse holdings
    const holdings = parseHoldings(text, scheme || '');

    // Cache for 24h (PDF valid all month)
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');

    return res.json({
      amc: amcKey,
      amcName: AMC_CONFIG[amcKey].name,
      scheme: scheme || null,
      month: found.mon,
      year: found.year,
      monthOffset: found.monthOffset,
      pdfUrl: found.url,
      confidence: AMC_CONFIG[amcKey].confidence,
      holdingsCount: holdings.length,
      holdings,
      textLength: text.length,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message, stack: e.stack?.slice(0, 500) });
  }
}
