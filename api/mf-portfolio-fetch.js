// /api/mf-portfolio-fetch?amc=SBI&scheme=SBI+Bluechip+Fund
// Fast, hardcoded-template AMC scraper with Native Excel Array Parsing and PDF fallback

export const config = { runtime: 'nodejs' };

const https = require('https');
const http = require('http');
const zlib = require('zlib');

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const getOrdinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

// --- AMC URL Templates ---
const AMC_CONFIG = {
  NIPPON: {
    url: (year, mon, mm, yy) => [
      `https://mf.nipponindiaim.com/InvestorServices/FactsheetsDocuments/NIMF-MONTHLY-PORTFOLIO-28-${mon.substring(0,3)}-${yy}.xls`,
      `https://mf.nipponindiaim.com/InvestorServices/Reports/PortfolioMon/Nippon-India-MF-Monthly-Portfolio-${mon}-${year}.pdf`,
    ]
  },
  PPFAS: {
    url: (year, mon, mm, yy) => [
      `https://amc.ppfas.com/downloads/portfolio-disclosure/ppfas-mf-monthly-portfolio-${mon.toLowerCase()}-${year}.pdf`,
      `https://amc.ppfas.com/schemes/scheme-financials/${mon.toLowerCase()}-${year}/monthly-portfolio-disclosure-${mon.toLowerCase()}-${year}.pdf`,
    ]
  },
  HDFC: {
    url: (year, mon, mm, yy) => [
      `https://files.hdfcfund.com/s3fs-public/Portfolio/${year}-${mm}/HDFC-MF-Monthly-Portfolio-${mon}-${year}.xlsx`,
      `https://files.hdfcfund.com/s3fs-public/Portfolio/${year}-${mm}/HDFC-MF-Monthly-Portfolio-${mon}-${year}.pdf`,
    ]
  },
  SBI: {
    url: (year, mon, mm, yy) => {
      const monLower = mon.toLowerCase();
      const lastDay = new Date(parseInt(year, 10), parseInt(mm, 10), 0).getDate();
      const lastDayOrd = getOrdinal(lastDay);
      return [
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/all-schemes-monthly-portfolio---as-on-${lastDayOrd}-${monLower}-${year}.xlsx`,
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/all-scheme-monthly-portfolio---as-on-${lastDayOrd}-${monLower}-${year}.xlsx`, 
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/all-schemes-monthly-portfolio---as-on-${lastDayOrd}-${monLower}-${year}.pdf`,
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/${monLower}${yy}port.pdf`,
      ];
    }
  },
  ABSL: {
    url: (year, mon, mm, yy) => [
      `https://mutualfund.adityabirlacapital.com/downloads/portfolio/monthly-portfolio-${mon.toLowerCase()}-${yy}.pdf`,
    ]
  },
  ICICI: {
    url: (year, mon, mm, yy) => [
      `https://www.icicipruamc.com/docs/default-source/monthly-portfolio/portfolio-${mon.toLowerCase()}${year}.pdf`,
    ]
  },
  MIRAE: {
    url: (year, mon, mm, yy) => [
      `https://www.miraeassetmf.co.in/docs/default-source/monthly-portfolio/portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ]
  },
  KOTAK: {
    url: (year, mon, mm, yy) => [
      `https://www.kotakmf.com/docs/default-source/portfolio/monthly-portfolio/portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ]
  },
  AXIS: {
    url: (year, mon, mm, yy) => [
      `https://www.axismf.com/downloads/portfolio/${mon.substring(0,3).toLowerCase()}-${year}-monthly-portfolio.pdf`,
    ]
  },
  UTI: {
    url: (year, mon, mm, yy) => [
      `https://www.utimf.com/portfolio-disclosure/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ]
  },
  DSP: {
    url: (year, mon, mm, yy) => [
      `https://www.dspim.com/content/dam/dsp/portfolio/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ]
  },
  BANDHAN: {
    url: (year, mon, mm, yy) => [
      `https://www.bandhanmf.com/uploads/monthly-portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf`,
    ]
  },
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getMonthParams(date) {
  const y = date.getFullYear();
  const m = date.getMonth(); 
  return { year: String(y), mon: MONTHS[m], mm: String(m + 1).padStart(2, '0'), yy: String(y).slice(2) };
}

// --- HTTP Helpers ---
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

// ==========================================
// 1. NATIVE EXCEL ARRAY PARSER (Highly Robust)
// ==========================================
function extractHoldingsFromExcel(buf, schemeName) {
  const xlsx = require('xlsx');
  const workbook = xlsx.read(buf, { type: 'buffer' });
  const holdings = [];
  
  // Clean the scheme name to match it easily
  const schemeNorm = schemeName ? schemeName.toLowerCase().replace(/\s+/g, ' ').trim() : '';

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    // raw: false ensures we read percentages formatted (e.g., "8.45%") instead of decimals
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });

    let inScheme = !schemeNorm;
    let inHoldings = false;
    let colMap = { name: -1, isin: -1, pct: -1 };

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row.length) continue;
      
      const rowStr = row.map(c => String(c || '').trim()).join(' ').toLowerCase();
      if (!rowStr.trim()) continue; // Skip entirely empty rows

      // A. Hunt for the specific scheme section
      if (!inScheme && schemeNorm && rowStr.includes(schemeNorm)) {
         inScheme = true;
      }

      if (inScheme) {
         // B. Map the table headers for this scheme
         if (!inHoldings && (rowStr.includes('isin') || rowStr.includes('%') || rowStr.includes('nav'))) {
            row.forEach((cell, idx) => {
               const c = String(cell || '').toLowerCase();
               if (c.includes('instrument') || c.includes('company') || c.includes('security') || c.includes('name')) colMap.name = idx;
               if (c.includes('isin')) colMap.isin = idx;
               if (c.includes('%') || c.includes('nav') || c.includes('assets')) colMap.pct = idx;
            });
            
            // Fallbacks if columns aren't explicitly named
            if (colMap.name === -1) colMap.name = colMap.isin === 0 ? 1 : 0;
            if (colMap.pct !== -1) inHoldings = true;
            continue;
         }

         // C. Extract the rows based on the mapped columns
         if (inHoldings) {
            // Stop parsing if we hit the end of the scheme's holdings table
            if (rowStr.startsWith('total') || rowStr.includes('grand total') || rowStr.includes('net assets')) {
               if (holdings.length > 5) break; 
            }

            let name = row[colMap.name];
            let isin = colMap.isin !== -1 ? row[colMap.isin] : null;
            let pctRaw = row[colMap.pct];

            if (name && pctRaw) {
               name = String(name).trim();
               pctRaw = String(pctRaw).trim();
               
               // Extract only the numbers/decimals from the cell
               let pctNum = parseFloat(pctRaw.replace(/[^0-9.]/g, ''));
               
               // Validate that it's a real holding and not a random header/footer
               if (!isNaN(pctNum) && pctNum > 0 && pctNum <= 100 && name.length > 2 && !name.toLowerCase().includes('total')) {
                  holdings.push({
                     name: name.replace(/^INE[A-Z0-9]{9}\s*/, ''), // Remove ISIN from name if combined
                     isin: String(isin || '').match(/INE[A-Z0-9]{9}/) ? String(isin).trim() : null,
                     pct: parseFloat(pctNum.toFixed(2))
                  });
               }
            }
         }
      }
    }
    // If we successfully found holdings in this sheet, no need to check other sheets
    if (holdings.length > 0) break; 
  }
  
  // Deduplicate and sort by weight
  const seen = new Set();
  return holdings.filter(h => { if (seen.has(h.name)) return false; seen.add(h.name); return true; })
                 .sort((a, b) => b.pct - a.pct).slice(0, 50);
}

// ==========================================
// 2. PDF TEXT EXTRACTOR & PARSER
// ==========================================
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

function parseHoldings(text, schemeName) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const holdings = [];
  const schemeNorm = schemeName.toLowerCase().replace(/\s+/g, ' ').trim();
  let inScheme = !schemeNorm; 
  let inHoldings = false;
  let headerFound = false;

  const headerKeywords = ['name of instrument', 'security name', 'issuer', 'company name', 'scrip name', 'instrument'];
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

    const pctMatch = line.match(/(\d{1,3}\.\d{1,4})\s*%?\s*$/);
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
async function findWorkingURL(amcKey, date) {
  const cfg = AMC_CONFIG[amcKey];
  if (!cfg) return null;

  // Search up to 3 months backward
  for (let monthOffset = 1; monthOffset <= 3; monthOffset++) {
    const d = new Date(date);
    d.setMonth(d.getMonth() - monthOffset);
    const params = getMonthParams(d);
    
    let urlsToTry = cfg.url(params.year, params.mon, params.mm, params.yy);
    urlsToTry = [...new Set(urlsToTry)]; 

    for (const url of urlsToTry) {
      try {
        const status = await httpHead(url);
        if (status === 200 || status === 302) return { url, ...params, monthOffset };
      } catch (e) { }
    }
  }
  return null;
}

// ==========================================
// 3. MAIN ROUTER HANDLER
// ==========================================
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { amc, scheme } = req.query;

  if (!amc) return res.status(400).json({ error: 'Missing ?amc= parameter' });

  const amcKey = amc.toUpperCase();
  if (!AMC_CONFIG[amcKey]) return res.status(400).json({ error: `Unknown AMC` });

  try {
    const found = await findWorkingURL(amcKey, new Date());
    if (!found) return res.status(503).json({ error: 'Could not find a valid portfolio document for this AMC.' });

    const fileBuf = await httpGet(found.url, 25000);
    if (fileBuf.length > 20 * 1024 * 1024) return res.status(413).json({ error: 'File too large (>20MB)' });

    const isExcel = found.url.includes('.xls') || found.url.includes('.xlsx');
    let holdings = [];

    // Route to the correct parser based on file extension
    if (isExcel) {
      holdings = extractHoldingsFromExcel(fileBuf, scheme || '');
    } else {
      const text = extractTextFromPDF(fileBuf);
      if (!text || text.length < 500) {
        return res.status(422).json({ error: 'Failed to extract text streams from PDF.', url: found.url });
      }
      holdings = parseHoldings(text, scheme || '');
    }

    if (holdings.length === 0) {
      return res.status(404).json({ 
        error: `File downloaded, but could not locate holdings for "${scheme || 'this scheme'}". Ensure the scheme name matches perfectly.`, 
        url: found.url 
      });
    }

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
