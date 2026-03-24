// Portfolio source probe v3 — Follow Kuvera v5 + scrape Nippon page
// GET /api/test-portfolio

const https = require('https');
const zlib = require('zlib');

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/json,*/*;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        ...(options.headers || {}),
      },
      timeout: 15000,
    }, (res) => {
      const chunks = [];
      let stream = res;
      const enc = res.headers['content-encoding'] || '';
      if (enc.includes('br'))        stream = res.pipe(zlib.createBrotliDecompress());
      else if (enc.includes('gzip')) stream = res.pipe(zlib.createGunzip());
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          bodyLen: body.length,
          bodyText: body.toString('utf8'),
          isXlsx: body.slice(0,4).toString('hex') === '504b0304',
          location: res.headers['location'] || null,
        });
      });
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout 15s')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function probe(label, url, opts) {
  const t0 = Date.now();
  try {
    const r = await fetchUrl(url, opts);
    const preview = r.bodyText.slice(0, 300).replace(/[\x00-\x08\x0b-\x1f]+/g, ' ');
    return {
      label, ok: true, status: r.status, ms: Date.now() - t0,
      bytes: r.bodyLen, type: (r.headers['content-type'] || '').split(';')[0],
      isXlsx: r.isXlsx, redirect: r.location, preview,
      // Pass full body for further processing
      _body: r.bodyText,
    };
  } catch(e) {
    return { label, ok: false, error: e.message, ms: Date.now() - t0 };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const results = {};

  // ── 1. Hit Kuvera API v5 directly (the redirect target) ──
  const kuveraV5 = await probe(
    'Kuvera v5 SCAG-GR (Nippon Small Cap)',
    'https://api.kuvera.in/mf/api/v5/fund_schemes/SCAG-GR.json'
  );
  results.kuveraV5 = {
    status: kuveraV5.status,
    ok: kuveraV5.ok,
    bytes: kuveraV5.bytes,
    ms: kuveraV5.ms,
    preview: kuveraV5.preview,
    // Try to parse JSON keys if it's valid
    keys: (() => {
      try { return Object.keys(JSON.parse(kuveraV5._body || '{}')).slice(0,30); } catch(e) { return ['parse error']; }
    })(),
    // Check for holdings/portfolio fields
    hasHoldings: (kuveraV5._body || '').includes('holding'),
    hasPortfolio: (kuveraV5._body || '').includes('portfolio'),
    hasBenchmark: (kuveraV5._body || '').includes('benchmark'),
    hasSector: (kuveraV5._body || '').includes('sector'),
  };

  // ── 2. Scrape Nippon factsheet page for real xlsx URLs ──
  const nipponPage = await probe(
    'Nippon factsheet page',
    'https://mf.nipponindiaim.com/investor-service/downloads/factsheet-portfolio-and-other-disclosures'
  );
  
  // Extract all .xlsx and document links from the HTML
  const xlsxLinks = [];
  const docLinks = [];
  if (nipponPage._body) {
    // Find xlsx URLs
    const xlsxMatches = nipponPage._body.match(/https?:\/\/[^\s"'<>]+\.xlsx/gi) || [];
    xlsxLinks.push(...[...new Set(xlsxMatches)]);
    
    // Find any link containing "monthly" or "portfolio"
    const portMatches = nipponPage._body.match(/https?:\/\/[^\s"'<>]*(monthly|portfolio)[^\s"'<>]*/gi) || [];
    docLinks.push(...[...new Set(portMatches)].slice(0, 10));
    
    // Also look for SharePoint RootFolder patterns
    const spMatches = nipponPage._body.match(/\/InvestorServices[^\s"'<>]+\.(xlsx|xls|pdf)/gi) || [];
    docLinks.push(...[...new Set(spMatches)].slice(0, 10));
  }
  results.nipponPage = {
    status: nipponPage.status,
    bytes: nipponPage.bytes,
    xlsxLinksFound: xlsxLinks.length,
    xlsxLinks: xlsxLinks.slice(0, 5),
    portfolioLinks: docLinks.slice(0, 10),
    // Sample of page for manual inspection
    pageSample: nipponPage._body ? nipponPage._body.slice(0, 500) : '',
  };

  // ── 3. Try Kuvera v5 for HDFC Innovation (we know ISIN = INF179KC1JO7) ──
  // captnemo gave 404 for this (new fund not in mapping). Try Kuvera directly with scheme code
  const kuveraHdfc = await probe(
    'Kuvera v5 HINNF-GR (HDFC Innovation guess)',
    'https://api.kuvera.in/mf/api/v5/fund_schemes/HINNF-GR.json'
  );
  results.kuveraHdfc = {
    status: kuveraHdfc.status, ms: kuveraHdfc.ms, bytes: kuveraHdfc.bytes,
    preview: kuveraHdfc.preview,
  };

  // ── 4. Try Nippon portfolio via AMFI direct disclosure (scheme code 118778) ──
  // AMFI has a per-scheme portfolio endpoint
  const amfiPortfolio = await probe(
    'AMFI scheme portfolio (code 118778)',
    'https://www.amfiindia.com/modules/NAVHistoryReport?mf=118778'
  );
  results.amfiPortfolio = {
    status: amfiPortfolio.status, ms: amfiPortfolio.ms, bytes: amfiPortfolio.bytes,
    preview: amfiPortfolio.preview,
  };

  // ── 5. Probe Nippon's actual document library root ──
  const nipponDocLib = await probe(
    'Nippon SharePoint doc library root',
    'https://mf.nipponindiaim.com/InvestorServices/Monthly%20Portfolio'
  );
  results.nipponDocLib = {
    status: nipponDocLib.status, ms: nipponDocLib.ms, bytes: nipponDocLib.bytes,
    preview: nipponDocLib.preview,
  };

  // ── 6. Try Nippon's RootFolder API (SharePoint REST) ──
  const nipponSPREST = await probe(
    'Nippon SharePoint REST API folder listing',
    "https://mf.nipponindiaim.com/_api/web/GetFolderByServerRelativeUrl('/InvestorServices/Monthly Portfolio')/Files?$select=Name,TimeLastModified&$top=5"
  );
  results.nipponSPREST = {
    status: nipponSPREST.status, ms: nipponSPREST.ms, bytes: nipponSPREST.bytes,
    preview: nipponSPREST.preview.slice(0, 300),
    hasXlsx: (nipponSPREST._body || '').toLowerCase().includes('.xlsx'),
    filesFound: ((nipponSPREST._body || '').match(/\.xlsx/gi) || []).length,
  };

  // ── 7. HDFC S3 re-confirm + speed ──
  const hdfc = await probe(
    'HDFC S3 Innovation Feb2026',
    'https://files.hdfcfund.com/s3fs-public/2026-03/Monthly%20HDFC%20Innovation%20Fund%20-%2028%20February%202026.xlsx'
  );
  results.hdfcFeb = { status: hdfc.status, ms: hdfc.ms, bytes: hdfc.bytes, isXlsx: hdfc.isXlsx };

  res.status(200).json({ ts: new Date().toISOString(), results });
};
