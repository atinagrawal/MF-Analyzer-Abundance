// /api/mf-portfolio?amcCode=SBI&action=probe
export const config = { runtime: 'nodejs' };

const https = require('https');
const http = require('http');

// --- Helper to extract and strictly filter URLs ---
function extractAndFilterLinks(html, baseUrl, mon, year, mon3, yy, scheme = '') {
  // FIXED REGEX: Now allows query parameters after the extension (e.g., .pdf?sfvrsn=123)
  const regex = /href=["']([^"']*\.(?:pdf|xlsx|xls|zip)[^"']*)["']/gi;
  let links = [];
  let match;
  
  while ((match = regex.exec(html)) !== null) {
    let link = match[1];
    if (link.startsWith('/')) link = baseUrl + link;
    links.push(link);
  }

  const schemeSlug = scheme ? scheme.toLowerCase().replace(/\s+/g, '') : '';

  const validLinks = links.filter(link => {
    const lowerLink = link.toLowerCase();
    
    // Time constraints
    const hasMonth = lowerLink.includes(mon.toLowerCase()) || lowerLink.includes(mon3.toLowerCase());
    const hasYear = lowerLink.includes(year) || lowerLink.includes(yy);
    
    // File type constraints
    const hasPortfolio = lowerLink.includes('portfolio') || lowerLink.includes('port');
    const isFactsheet = lowerLink.includes('factsheet');
    
    // Scheme constraints: Only filter if scheme is explicitly requested
    const matchesScheme = schemeSlug ? lowerLink.replace(/[-_]/g, '').includes(schemeSlug) : true;

    // Must match time, must be a portfolio, MUST NOT be a factsheet
    return hasMonth && hasYear && hasPortfolio && !isFactsheet && matchesScheme;
  });

  return [...new Set(validLinks)]; // Deduplicate
}

// --- AMC Dynamic Discovery Configuration ---
const AMC_CONFIG = {
  NIPPON: {
    name: 'Nippon India',
    pageUrl: 'https://mf.nipponindiaim.com/investor-service/downloads/factsheet-portfolio-and-other-disclosures',
    findDynamicUrl: (html, mon, year, mon3, yy) => {
      return extractAndFilterLinks(html, 'https://mf.nipponindiaim.com', mon, year, mon3, yy);
    },
    fallbackUrls: (year, mon, mm, yy, mon3) => [
      `https://mf.nipponindiaim.com/InvestorServices/FactsheetsDocuments/NIMF-MONTHLY-PORTFOLIO-28-${mon3}-${yy}.xls`,
    ]
  },
  PPFAS: {
    name: 'Parag Parikh',
    pageUrl: 'https://amc.ppfas.com/downloads/portfolio-disclosure/',
    findDynamicUrl: (html, mon, year, mon3, yy) => {
      return extractAndFilterLinks(html, 'https://amc.ppfas.com', mon, year, mon3, yy);
    },
    fallbackUrls: (year, mon, mm, yy, mon3) => [
      `https://amc.ppfas.com/downloads/portfolio-disclosure/ppfas-mf-monthly-portfolio-${mon.toLowerCase()}-${year}.pdf`,
    ]
  },
  SBI: {
    name: 'SBI',
    url: (year, mon, mm, yy) => {
      const monLower = mon.toLowerCase();
      const mon3 = mon.substring(0, 3).toLowerCase();
      
      // Calculate the last day of the month dynamically
      const monthIndex = parseInt(mm, 10) - 1; 
      const lastDay = new Date(parseInt(year, 10), monthIndex + 1, 0).getDate();
      
      // Helper to add st, nd, rd, th
      const getOrdinal = (n) => {
        const s = ["th", "st", "nd", "rd"];
        const v = n % 100;
        return n + (s[(v - 20) % 10] || s[v] || s[0]);
      };
      
      const lastDayOrd = getOrdinal(lastDay);

      return [
        // Recent pattern (2023 - 2026+): .xlsx format
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/all-schemes-monthly-portfolio---as-on-${lastDayOrd}-${monLower}-${year}.xlsx`,
        // Typo variation seen in Sept 2025: "all-scheme" instead of "all-schemes"
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/all-scheme-monthly-portfolio---as-on-${lastDayOrd}-${monLower}-${year}.xlsx`,
        
        // Older pattern / fallback if they upload a PDF
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/all-schemes-monthly-portfolio---as-on-${lastDayOrd}-${monLower}-${year}.pdf`,
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/all-scheme-monthly-portfolio---as-on-${lastDayOrd}-${monLower}-${year}.pdf`,
        
        // Legacy formats (pre-2023)
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/${monLower}${yy}port.pdf`,
        `https://www.sbimf.com/docs/default-source/scheme-portfolios/${mon3}${yy}port.pdf`
      ];
    },
    confidence: 'medium',
  },
  HDFC: {
    name: 'HDFC',
    pageUrl: 'https://www.hdfcfund.com/statutory-disclosure/portfolio/monthly-portfolio',
    findDynamicUrl: (html, mon, year, mon3, yy, scheme) => {
      return extractAndFilterLinks(html, 'https://www.hdfcfund.com', mon, year, mon3, yy, scheme);
    },
    fallbackUrls: (year, mon, mm, yy, mon3) => [
      `https://files.hdfcfund.com/s3fs-public/Portfolio/${year}-${mm}/HDFC-MF-Monthly-Portfolio-${mon}-${year}.pdf`,
    ]
  }
};

// --- Month helpers ---
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

function getMonthParams(date) {
  const y = date.getFullYear();
  const m = date.getMonth(); 
  const mon = MONTHS[m];
  return {
    year: String(y),
    mon: mon,
    mm: String(m + 1).padStart(2, '0'),
    yy: String(y).slice(2),
    mon3: mon.substring(0, 3) 
  };
}

// --- HTTP helpers ---
function httpGet(urlStr, timeout = 25000) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get({
      hostname: u.hostname, 
      path: u.pathname + u.search,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) redirectUrl = u.origin + redirectUrl;
        httpGet(redirectUrl, timeout).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function httpHead(urlStr, timeout = 5000) {
  return new Promise((resolve) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request({ 
      hostname: u.hostname, 
      path: u.pathname + u.search,
      method: 'HEAD', 
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }, 
      timeout 
    }, (res) => resolve(res.statusCode));
    
    req.on('error', () => resolve(0));
    req.on('timeout', () => { req.destroy(); resolve(0); });
    req.end();
  });
}

// --- Dynamic URL Discovery ---
async function findWorkingURL(amcKey, date, scheme, collectTriedUrls) {
  const cfg = AMC_CONFIG[amcKey];
  if (!cfg) return null;

  // Try current month, then fallback to previous 2 months
  for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
    const d = new Date(date);
    d.setMonth(d.getMonth() - monthOffset);
    const p = getMonthParams(d);
    
    let potentialUrls = [];

    // Strategy 1: Dynamic HTML Scraping
    try {
      const html = await httpGet(cfg.pageUrl, 15000);
      const dynamicLinks = cfg.findDynamicUrl(html, p.mon, p.year, p.mon3, p.yy, scheme);
      
      // Prioritize .xls / .xlsx over .pdf if multiple are found
      dynamicLinks.sort((a, b) => {
        if (a.includes('.xls') && !b.includes('.xls')) return -1;
        if (!a.includes('.xls') && b.includes('.xls')) return 1;
        return 0;
      });

      potentialUrls.push(...dynamicLinks);
    } catch (e) {
      if (collectTriedUrls) collectTriedUrls.push({ url: cfg.pageUrl, status: 0, error: 'Scraping failed: ' + e.message });
    }

    // Strategy 2: Hardcoded Guessing (Fallback)
    if (potentialUrls.length === 0 && cfg.fallbackUrls) {
      potentialUrls.push(...cfg.fallbackUrls(p.year, p.mon, p.mm, p.yy, p.mon3));
    }

    // Ping the URLs to see which one returns a 200 OK
    for (const url of potentialUrls) {
      try {
        const status = await httpHead(url);
        if (collectTriedUrls) collectTriedUrls.push({ url, status });
        
        if (status === 200 || status === 302) {
          return { url, ...p, monthOffset };
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
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { amc, scheme, action } = req.query;

  // Debug Probe mode
  if (action === 'probe' && amc) {
    const amcKey = amc.toUpperCase();
    if (!AMC_CONFIG[amcKey]) return res.status(400).json({ error: `Unknown AMC` });
    
    const tried = [];
    const result = await findWorkingURL(amcKey, new Date(), scheme, tried);
    
    if (!result) {
      return res.status(404).json({ error: 'No working portfolio URL found', amc: amcKey, tried });
    }
    
    return res.json({
      amc: amcKey,
      name: AMC_CONFIG[amcKey].name,
      fileUrl: result.url,
      month: result.mon,
      year: result.year,
      triedLogs: tried,
    });
  }

  // --- Normal Execution Flow ---
  if (!amc) return res.status(400).json({ error: 'Missing ?amc= parameter' });

  const amcKey = amc.toUpperCase();
  if (!AMC_CONFIG[amcKey]) return res.status(400).json({ error: `Unknown AMC` });

  try {
    const triedUrls = [];
    const found = await findWorkingURL(amcKey, new Date(), scheme, triedUrls);
    
    if (!found) {
      return res.status(404).json({ error: 'Could not locate the AMC portfolio file for the recent months.', logs: triedUrls });
    }
    
    return res.json({
      success: true,
      amc: amcKey,
      scheme: scheme || null,
      month: found.mon,
      year: found.year,
      fileUrl: found.url
    });

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
