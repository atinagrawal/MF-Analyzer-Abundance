// /api/mf-portfolio-fetch?amc=SBI&scheme=SBI+Bluechip+Fund

export const config = { runtime: 'nodejs' };

import https from 'https';
import http from 'http';
import zlib from 'zlib';

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
      const mon3 = mon.substring(0, 3).toLowerCase();
      const lastDay = new Date(parseInt(year, 10), parseInt(mm, 10), 0).getDate();
      const lastDayOrd = getOrdinal(lastDay);
      return [
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/all-schemes-monthly-portfolio---as-on-${lastDayOrd}-${monLower}-${year}.xlsx`,
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/all-schemes-monthly-portfolio---as-on-${lastDayOrd}-${mon3}-${year}.xlsx`,
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/all-scheme-monthly-portfolio---as-on-${lastDayOrd}-${monLower}-${year}.xlsx`, 
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/all-schemes-monthly-portfolio---as-on-${lastDayOrd}-${monLower}-${year}.pdf`,
      ];
    }
  },
  ABSL: {
    url: (year, mon, mm, yy) => [ `https://mutualfund.adityabirlacapital.com/downloads/portfolio/monthly-portfolio-${mon.toLowerCase()}-${yy}.pdf` ]
  },
  ICICI: {
    url: (year, mon, mm, yy) => [ `https://www.icicipruamc.com/docs/default-source/monthly-portfolio/portfolio-${mon.toLowerCase()}${year}.pdf` ]
  },
  MIRAE: {
    url: (year, mon, mm, yy) => [ `https://www.miraeassetmf.co.in/docs/default-source/monthly-portfolio/portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf` ]
  },
  KOTAK: {
    url: (year, mon, mm, yy) => [ `https://www.kotakmf.com/docs/default-source/portfolio/monthly-portfolio/portfolio-${mon.substring(0,3).toLowerCase()}-${year}.pdf` ]
  },
  AXIS: {
    url: (year, mon, mm, yy) => [ `https://www.axismf.com/downloads/portfolio/${mon.substring(0,3).toLowerCase()}-${year}-monthly-portfolio.pdf` ]
  }
};

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function getMonthParams(date) {
  const y = date.getFullYear();
  const m = date.getMonth(); 
  return { year: String(y), mon: MONTHS[m], mm: String(m + 1).padStart(2, '0'), yy: String(y).slice(2) };
}

// --- Native Firewall Bypass Fetchers ---
function checkUrlExists(urlStr) {
  // Uses GET with Range bytes=0-1 to bypass Cloudflare HEAD blocking
  return new Promise((resolve) => {
    const u = new URL(urlStr);
    const req = (u.protocol === 'https:' ? https : http).request({ 
      hostname: u.hostname, path: u.pathname + u.search, method: 'GET', 
      headers: { 'User-Agent': BROWSER_UA, 'Range': 'bytes=0-1' }, timeout: 7000 
    }, (res) => {
      res.destroy(); // Instantly destroy connection to prevent downloading
      resolve(res.statusCode === 200 || res.statusCode === 206 || res.statusCode === 302);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function fetchBuffer(url) {
  const res = await fetch(url, { method: 'GET', headers: { 'User-Agent': BROWSER_UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer); 
}

// --- Scheme Name Fuzzy Matcher ---
function isSchemeMatch(rowStr, schemeName) {
  if (!schemeName) return true;
  const searchWords = schemeName.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\b(fund|plan|direct|regular|growth|idcw)\b/g, '').trim().split(/\s+/).filter(w => w.length > 2);
  if (searchWords.length === 0) return true;
  
  const matchCount = searchWords.filter(w => rowStr.includes(w)).length;
  return matchCount >= searchWords.length - 1; 
}

// ==========================================
// 1. NATIVE EXCEL ARRAY PARSER (Handles SBI Master Sheets)
// ==========================================
function extractHoldingsFromExcel(buf, schemeName) {
  const xlsx = (await import('xlsx')).default;
  const workbook = xlsx.read(buf, { type: 'buffer' });
  const holdings = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: false });

    let sheetMatches = schemeName ? isSchemeMatch(sheetName.toLowerCase(), schemeName) : false;
    let inScheme = !schemeName || sheetMatches; 
    let inHoldings = false;
    
    // IMPORTANT: colMap.scheme allows us to detect SBI's master sheet format
    let colMap = { name: -1, isin: -1, pct: -1, scheme: -1 };

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row || !row.length) continue;
      
      const rowStr = row.map(c => String(c || '').trim()).join(' ').toLowerCase();
      if (!rowStr.trim()) continue; 

      if (!inHoldings && (rowStr.includes('isin') || rowStr.includes('%') || rowStr.includes('nav'))) {
         row.forEach((cell, idx) => {
            const c = String(cell || '').toLowerCase();
            if (c.includes('instrument') || c.includes('company') || c.includes('security') || c.includes('name of')) colMap.name = idx;
            if (c.includes('isin')) colMap.isin = idx;
            if (c.includes('%') || c.includes('nav') || c.includes('assets')) colMap.pct = idx;
            if (c.includes('scheme') || c.includes('fund name')) colMap.scheme = idx;
         });
         
         if (colMap.name === -1 && colMap.scheme !== -1) colMap.name = colMap.isin === 0 ? 1 : 2; 
         if (colMap.name === -1) colMap.name = colMap.isin === 0 ? 1 : 0;
         if (colMap.pct !== -1) inHoldings = true;
         continue;
      }

      if (inHoldings) {
         // MASTER SHEET DETECTION: If the AMC put a "Scheme Name" column, filter row-by-row
         if (colMap.scheme !== -1 && schemeName) {
            let rowScheme = String(row[colMap.scheme] || '').toLowerCase();
            if (!isSchemeMatch(rowScheme, schemeName)) continue;
         } else {
            // Traditional formatting detection
            if (!inScheme && isSchemeMatch(rowStr, schemeName)) inScheme = true;
            if (!inScheme) continue;
            
            if (rowStr.startsWith('total') || rowStr.includes('grand total') || rowStr.includes('net assets')) {
               if (holdings.length > 5) break; 
            }
         }

         let name = row[colMap.name];
         let isin = colMap.isin !== -1 ? row[colMap.isin] : null;
         let pctRaw = row[colMap.pct];

         if (name && pctRaw && String(name).length > 2) {
            name = String(name).trim();
            if (name.toLowerCase().includes('total')) continue;

            let pctStr = String(pctRaw).replace(/[^0-9.]/g, '');
            let pctNum = parseFloat(pctStr);
            
            if (!isNaN(pctNum) && pctNum > 0 && pctNum <= 100) {
               holdings.push({
                  name: name.replace(/^INE[A-Z0-9]{9}\s*/, ''),
                  isin: String(isin || '').match(/INE[A-Z0-9]{9}/) ? String(isin).trim() : null,
                  pct: parseFloat(pctNum.toFixed(2))
               });
            }
         }
      }
    }
    if (holdings.length > 0) break; 
  }
  
  const seen = new Set();
  return holdings.filter(h => { if (seen.has(h.name)) return false; seen.add(h.name); return true; })
                 .sort((a, b) => b.pct - a.pct).slice(0, 50);
}

// ==========================================
// 2. PDF TEXT EXTRACTOR
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
  let inScheme = !schemeName; 
  let inHoldings = false;
  let headerFound = false;

  const headerKeywords = ['name of instrument', 'security name', 'issuer', 'company name', 'scrip name', 'instrument'];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ll = line.toLowerCase();

    if (!inScheme && isSchemeMatch(ll, schemeName)) inScheme = true;

    if (headerKeywords.some(kw => ll.includes(kw))) {
      headerFound = true;
      inHoldings = true;
      continue;
    }

    if (!inHoldings && !headerFound) continue;

    if (ll.startsWith('total') || ll.includes('grand total') || ll.includes('net assets')) {
      if (holdings.length > 0) break;
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

  for (let monthOffset = 1; monthOffset <= 3; monthOffset++) {
    const d = new Date(date);
    d.setMonth(d.getMonth() - monthOffset);
    const params = getMonthParams(d);
    
    let urlsToTry = [...new Set(cfg.url(params.year, params.mon, params.mm, params.yy))]; 

    for (const url of urlsToTry) {
      if (await checkUrlExists(url)) return { url, ...params, monthOffset };
    }
  }
  return null;
}

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

    const fileBuf = await fetchBuffer(found.url);
    if (fileBuf.length > 20 * 1024 * 1024) return res.status(413).json({ error: 'File too large (>20MB)' });

    const isExcel = found.url.includes('.xls') || found.url.includes('.xlsx');
    let holdings = isExcel ? extractHoldingsFromExcel(fileBuf, scheme || '') : parseHoldings(extractTextFromPDF(fileBuf), scheme || '');

    if (holdings.length === 0) {
      return res.status(404).json({ error: `Could not extract table for "${scheme || 'this scheme'}". Make sure the name matches the AMC's exact terminology.`, url: found.url });
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
