// /api/mf-portfolio-fetch?amcCode=SBI&scheme=SBI+Magnum
// Fast, hardcoded-template AMC scraper with Web Firewall Bypass, Excel (.xlsx) support, and correct temporal logic

export const config = { runtime: 'nodejs' };

const https = require('https');
const http = require('http');
const zlib = require('zlib');

// Standard Chrome User-Agent to bypass Cloudflare/Akamai WAFs
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// Helper to add st, nd, rd, th to dates (needed for SBI)
const getOrdinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// --- AMC URL Templates ---
const AMC_CONFIG = {
  NIPPON: {
    name: 'Nippon India',
    url: (year, mon, mm, yy) => [
      `https://mf.nipponindiaim.com/InvestorServices/FactsheetsDocuments/NIMF-MONTHLY-PORTFOLIO-28-${mon.substring(0,3)}-${yy}.xls`,
      `https://mf.nipponindiaim.com/InvestorServices/Reports/PortfolioMon/Nippon-India-MF-Monthly-Portfolio-${mon}-${year}.pdf`,
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
      ];
    },
    confidence: 'medium',
  },
  HDFC: {
    name: 'HDFC',
    url: (year, mon, mm, yy) => [
      `https://files.hdfcfund.com/s3fs-public/Portfolio/${year}-${mm}/HDFC-MF-Monthly-Portfolio-${mon}-${year}.xlsx`,
      `https://files.hdfcfund.com/s3fs-public/Portfolio/${year}-${mm}/HDFC-MF-Monthly-Portfolio-${mon}-${year}.pdf`,
      `https://files.hdfcfund.com/s3fs-public/Portfolio/${year}-${mm}/HDFC-MF-Portfolio-${mon}-${year}.pdf`,
    ],
    confidence: 'medium',
  },
  SBI: {
    name: 'SBI',
    url: (year, mon, mm, yy) => {
      const monLower = mon.toLowerCase();
      const mon3 = mon.substring(0, 3).toLowerCase();
      // Calculate the exact last day of the reporting month
      const lastDay = new Date(parseInt(year, 10), parseInt(mm, 10), 0).getDate();
      const lastDayOrd = getOrdinal(lastDay);
      
      return [
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/all-schemes-monthly-portfolio---as-on-${lastDayOrd}-${monLower}-${year}.xlsx`,
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/all-scheme-monthly-portfolio---as-on-${lastDayOrd}-${monLower}-${year}.xlsx`, 
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/all-schemes-monthly-portfolio---as-on-${lastDayOrd}-${monLower}-${year}.pdf`,
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/all-scheme-monthly-portfolio---as-on-${lastDayOrd}-${monLower}-${year}.pdf`,
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/${monLower}${yy}port.pdf`,
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/${mon3}${yy}port.pdf`,
      ];
    },
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
  const m = date.getMonth(); 
  return { year: String(y), mon: MONTHS[m], mm: String(m + 1).padStart(2, '0'), yy: String(y).slice(2) };
}

// --- HTTP helpers ---
function httpHead(urlStr, timeout = 7000) {
  return new Promise((resolve) => {
    const u = new URL(urlStr);
    const req = (u.protocol === 'https:' ? https : http).request({ 
      hostname: u.hostname, path: u.pathname + u.search, method: 'HEAD', 
      headers: { 'User-Agent': BROWSER_UA, 'Accept': '*/*' }, timeout 
    }, (res) => resolve(res.statusCode));
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.end();
  });
}

function httpGet(urlStr, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const req = (u.protocol === 'https:' ? https : http).get({
      hostname: u.hostname, path: u.pathname + u.search,
      headers: { 'User-Agent': BROWSER_UA, 'Accept': '*/*' }, timeout,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redir = res.headers.location;
        if (redir.startsWith('/')) redir = u.origin + redir;
        httpGet(redir, timeout).then(resolve).catch(reject);
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

// --- Excel Text Extractor (Translates Excel sheets to Plain Text for Regex) ---
function extractTextFromExcel(buf) {
  try {
    const xlsx = require('xlsx'); // Requires npm install xlsx
    const workbook = xlsx.read(buf, { type: 'buffer' });
    let text = '';
    
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      for (const row of rows) {
        text += row.map(cell => String(cell).trim()).filter(Boolean).join(' ') + '\n';
      }
    }
    return text;
  } catch (e) {
    console.error("Excel parse error:", e.message);
    return null;
  }
}

// --- PDF text extractor ---
function extractTextFromPDF(buf) {
  const str = buf.toString('latin1');
  const texts = [];
  let pos = 0;
  while (true) {
    const streamStart = str.indexOf('stream', pos);
    if (streamStart === -1) break;
    const streamEnd = str.indexOf('endstream', streamStart);
    if (streamEnd === -1) break;

    const dictStart = str.lastIndexOf('<<', streamStart);
    const dict = str.slice(dictStart, streamStart);
    const isFlate = dict.includes('FlateDecode') || dict.includes('Fl\n');
    const rawStream = buf.slice(streamStart + 7, streamEnd); 

    try {
      let decoded = isFlate ? zlib.inflateSync(rawStream).toString('utf8') : rawStream.toString('latin1');
      const btRegex = /BT\s*([\s\S]*?)\s*ET/g;
      let m;
      while ((m = btRegex.exec(decoded)) !== null) {
        const block = m[1];
        const strRegex = /\(((?:[^()\\]|\\.)*)\)\s*(?:Tj|'|")|(\[(?:[^\]]*)\])\s*TJ/g;
        let sm;
        while ((sm = strRegex.exec(block)) !== null) {
          if (sm[1] !== undefined) {
            texts.push(unescape(sm[1].replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)))));
          } else if (sm[2]) {
            const tjStr = sm[2].replace(/\(((?:[^()\\]|\\.)*)\)/g, (_, s) => s + ' ');
            texts.push(tjStr.replace(/\s+/g, ' ').trim());
          }
        }
      }
    } catch { }
    pos = streamEnd + 9;
  }
  return texts.join('\n').replace(/\r/g, '').replace(/[ \t]+/g, ' ');
}

// --- Holdings parser ---
function parseHoldings(text, schemeName) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const holdings = [];
  const schemeNorm = schemeName.toLowerCase().replace(/\s+/g, ' ').trim();
  let inScheme = !schemeNorm; 
  let inHoldings = false;
  let headerFound = false;

  const headerKeywords = ['name of instrument', 'security name', 'name of security', 'issuer', 'company name', 'scrip name', 'instrument'];
  const stopKeywords = ['total', 'grand total', 'sub total', 'net assets'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ll = line.toLowerCase();

    if (!inScheme && schemeNorm && ll.includes(schemeNorm.substring(0, 20))) inScheme = true;

    if (headerKeywords.some(kw => ll.includes(kw))) {
      headerFound = true;
      inHoldings = true;
      continue;
    }

    if (!inHoldings && !headerFound) continue;

    if (stopKeywords.some(kw => ll.startsWith(kw)) && holdings.length > 0) {
      if (ll.includes('grand total') || ll.includes('net assets')) break;
    }

    const pctMatch = line.match(/(\d{1,3}\.\d{1,4})\s*$/);
    if (!pctMatch) continue;

    const pct = parseFloat(pctMatch[1]);
    if (pct <= 0 || pct > 50) continue; 

    const namePart = line.replace(/[\d,\s.%]+$/, '').trim();
    if (namePart.length < 3 || namePart.length > 100) continue;
    if (headerKeywords.some(kw => namePart.toLowerCase().includes(kw))) continue;

    const isinMatch = line.match(/INE[A-Z0-9]{9}/);
    const isin = isinMatch ? isinMatch[0] : null;

    let name = namePart.replace(/^INE[A-Z0-9]{9}\s*/, '').trim();
    if (!name || name.match(/^\d/)) continue;

    holdings.push({ name, isin, pct });
  }

  const seen = new Set();
  return holdings.filter(h => { if (seen.has(h.name)) return false; seen.add(h.name); return true; })
                 .sort((a, b) => b.pct - a.pct).slice(0, 50); 
}

// --- URL discovery ---
async function findWorkingURL(amcKey, date, collectTriedUrls) {
  const cfg = AMC_CONFIG[amcKey];
  if (!cfg) return null;

  // FIXED LOGIC: Portfolios are published for the PREVIOUS month around the 10th of the current month.
  // Therefore, we MUST start looking from `monthOffset = 1` (1 month ago), not 0.
  // We fall back up to 3 months ago in case the AMC is running late on disclosures.
  for (let monthOffset = 1; monthOffset <= 3; monthOffset++) {
    const d = new Date(date);
    d.setMonth(d.getMonth() - monthOffset);
    const params = getMonthParams(d);
    
    let urlsToTry = cfg.url(params.year, params.mon, params.mm, params.yy);
    urlsToTry = [...new Set(urlsToTry)]; // Deduplicate

    for (const url of urlsToTry) {
      try {
        const status = await httpHead(url);
        if (collectTriedUrls) collectTriedUrls.push({ url, status });
        
        // Treat 200 OK or 302 Redirect as a successful find
        if (status === 200 || status === 302) return { url, ...params, monthOffset };
      } catch (e) {
        if (collectTriedUrls) collectTriedUrls.push({ url, status: 0, error: e.message });
      }
    }
  }
  return null;
}

// --- Main handler ---
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { amc, scheme, action } = req.query;

  if (action === 'list') {
    return res.json({ amcs: Object.keys(AMC_CONFIG) });
  }

  if (action === 'probe' && amc) {
    const amcKey = amc.toUpperCase();
    if (!AMC_CONFIG[amcKey]) return res.status(400).json({ error: `Unknown AMC: ${amc}` });
    const tried = [];
    const result = await findWorkingURL(amcKey, new Date(), tried);
    if (!result) return res.status(404).json({ error: 'No working URL found', tried });
    return res.json({ amc: amcKey, url: result.url, tried });
  }

  if (!amc) return res.status(400).json({ error: 'Missing ?amc= parameter' });

  const amcKey = amc.toUpperCase();
  if (!AMC_CONFIG[amcKey]) return res.status(400).json({ error: `Unknown AMC` });

  try {
    const found = await findWorkingURL(amcKey, new Date(), null);
    if (!found) return res.status(503).json({ error: 'Could not find portfolio file for this AMC' });

    const fileBuf = await httpGet(found.url, 25000);
    if (fileBuf.length > 20 * 1024 * 1024) return res.status(413).json({ error: 'File too large (>20MB)' });

    const isExcel = found.url.includes('.xls') || found.url.includes('.xlsx');
    const text = isExcel ? extractTextFromExcel(fileBuf) : extractTextFromPDF(fileBuf);

    if (!text || text.length < 500) {
      return res.status(422).json({ error: 'Could not extract text from document', url: found.url });
    }

    const holdings = parseHoldings(text, scheme || '');

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');

    return res.json({
      amc: amcKey,
      scheme: scheme || null,
      month: found.mon,
      year: found.year,
      fileUrl: found.url,
      isExcel: isExcel,
      holdingsCount: holdings.length,
      holdings,
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
