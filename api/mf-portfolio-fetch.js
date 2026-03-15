// /api/mf-portfolio?amcCode=NIPPON&scheme=Small+Cap&action=probe
// Dynamically scrapes AMC disclosure pages for the correct portfolio file URL.

export const config = { runtime: 'nodejs' };

const https = require('https');
const http = require('http');

// --- AMC Dynamic Discovery Configuration ---
const AMC_CONFIG = {
  NIPPON: {
    name: 'Nippon India',
    pageUrl: 'https://mf.nipponindiaim.com/investor-service/downloads/factsheet-portfolio-and-other-disclosures',
    findDynamicUrl: (html, mon, year, mon3, yy) => {
      // Catches: NIMF-MONTHLY-PORTFOLIO-28-Feb-26.xls or Nippon-India-MF-Monthly-Portfolio-February-2026.pdf
      const regex = new RegExp(`href=["']([^"']*(?:NIMF-MONTHLY-PORTFOLIO|Nippon).*?(?:${mon}|${mon3}).*?(?:${year}|${yy})\\.(?:xls|xlsx|pdf))["']`, 'gi');
      return extractMatches(html, regex, 'https://mf.nipponindiaim.com');
    },
    fallbackUrls: (year, mon, mm, yy, mon3) => [
      // Standard fallback based on your previous file format
      `https://mf.nipponindiaim.com/InvestorServices/FactsheetsDocuments/NIMF-MONTHLY-PORTFOLIO-28-${mon3}-${yy}.xls`,
      `https://mf.nipponindiaim.com/InvestorServices/Reports/PortfolioMon/Nippon-India-MF-Monthly-Portfolio-${mon}-${year}.pdf`,
    ]
  },
  PPFAS: {
    name: 'Parag Parikh',
    pageUrl: 'https://amc.ppfas.com/downloads/portfolio-disclosure/',
    findDynamicUrl: (html, mon, year, mon3, yy) => {
      // Catches: ppfas-mf-monthly-portfolio-february-2026.pdf
      const regex = new RegExp(`href=["']([^"']*portfolio.*?${mon}.*?${year}\\.(?:pdf|xlsx|xls))["']`, 'gi');
      return extractMatches(html, regex, 'https://amc.ppfas.com');
    },
    fallbackUrls: (year, mon, mm, yy, mon3) => [
      `https://amc.ppfas.com/downloads/portfolio-disclosure/ppfas-mf-monthly-portfolio-${mon.toLowerCase()}-${year}.pdf`,
    ]
  },
  SBI: {
    name: 'SBI',
    pageUrl: 'https://www.sbimf.com/portfolios',
    findDynamicUrl: (html, mon, year, mon3, yy) => {
      // Catches: feb26port.pdf OR portfolio-february-2026.xlsx
      const regex = new RegExp(`href=["']([^"']*(?:${mon3}${yy}port|portfolio.*?${mon3}.*?(?:${year}|${yy}))\\.(?:pdf|xlsx|xls))["']`, 'gi');
      return extractMatches(html, regex, 'https://www.sbimf.com');
    },
    fallbackUrls: (year, mon, mm, yy, mon3) => [
      `https://www.sbimf.com/docs/default-source/scheme-portfolios/${mon3}${yy}port.pdf`,
    ]
  },
  HDFC: {
    name: 'HDFC',
    pageUrl: 'https://www.hdfcfund.com/statutory-disclosure/portfolio/monthly-portfolio',
    findDynamicUrl: (html, mon, year, mon3, yy, scheme) => {
      const schemeSlug = scheme ? scheme.replace(/\s+/g, '.*?').toLowerCase() : 'portfolio';
      const regex = new RegExp(`href=["']([^"']*${schemeSlug}.*?${mon}.*?${year}\\.(?:pdf|xlsx|xls))["']`, 'gi');
      return extractMatches(html, regex, 'https://www.hdfcfund.com');
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
    mon3: mon.substring(0, 3) // e.g., 'Feb'
  };
}

// Helper to extract URLs from Regex matches and resolve relative paths
function extractMatches(html, regex, baseUrl) {
  const links = [];
  let match;
  while ((match = regex.exec(html)) !== null) {
    let link = match[1];
    if (link.startsWith('/')) {
      // Resolve relative links (e.g. /downloads/file.pdf -> https://.../downloads/file.pdf)
      link = baseUrl + link;
    }
    links.push(link);
  }
  return [...new Set(links)]; // Deduplicate array
}

// --- HTTP helpers ---
function httpGet(urlStr, timeout = 25000, asString = false) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.get({
      hostname: u.hostname, 
      path: u.pathname + u.search,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout,
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        // Handle Redirects natively
        let redirectUrl = res.headers.location;
        if (redirectUrl.startsWith('/')) redirectUrl = u.origin + redirectUrl;
        httpGet(redirectUrl, timeout, asString).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve(asString ? buffer.toString('utf8') : buffer);
      });
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

  // Try current month, then fallback to previous 2 months if the AMC hasn't uploaded yet
  for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
    const d = new Date(date);
    d.setMonth(d.getMonth() - monthOffset);
    const p = getMonthParams(d);
    
    let potentialUrls = [];

    // Strategy 1: Dynamic HTML Scraping
    try {
      const html = await httpGet(cfg.pageUrl, 15000, true);
      // Pass the different month formats (e.g. 'February', 'Feb', '26', '2026') to the regex
      const dynamicLinks = cfg.findDynamicUrl(html, p.mon, p.year, p.mon3, p.yy, scheme);
      potentialUrls.push(...dynamicLinks);
    } catch (e) {
      if (collectTriedUrls) collectTriedUrls.push({ url: cfg.pageUrl, status: 0, error: 'Scraping failed: ' + e.message });
    }

    // Strategy 2: Hardcoded Guessing (Fallback)
    if (potentialUrls.length === 0 && cfg.fallbackUrls) {
      potentialUrls.push(...cfg.fallbackUrls(p.year, p.mon, p.mm, p.yy, p.mon3));
    }

    // Ping the URLs to see which one returns a 200 OK (exists)
    for (const url of potentialUrls) {
      try {
        const status = await httpHead(url);
        if (collectTriedUrls) collectTriedUrls.push({ url, status });
        
        // Treat 200 OK and 302 Found (redirects to the file) as success
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
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const { amc, scheme, action } = req.query;

  // Used for debugging the Scraper without actually downloading the files
  if (action === 'probe' && amc) {
    const amcKey = amc.toUpperCase();
    if (!AMC_CONFIG[amcKey]) return res.status(400).json({ error: `Unknown AMC: ${amc}` });
    
    const tried = [];
    const result = await findWorkingURL(amcKey, new Date(), scheme, tried);
    
    if (!result) {
      return res.status(404).json({ error: 'No working URL found', amc: amcKey, tried });
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

    // Important: At this stage `found.url` contains the exact link (e.g., .../NIMF-MONTHLY-PORTFOLIO-28-Feb-26.xls)
    // You will need to integrate the `xlsx` parser here to actually read the buffer if it's an Excel file.
    
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
