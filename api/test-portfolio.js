// Portfolio probe v5 — Fetch actual Nippon XLS + verify AMFI + other AMCs
const https = require('https');
const zlib = require('zlib');

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120',
        'Accept': '*/*',
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
        const hex4 = body.slice(0,4).toString('hex');
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body,
          bodyLen: body.length,
          bodyText: body.toString('utf8'),
          // Excel magic bytes
          isXls:  hex4 === 'd0cf11e0',  // old .xls (BIFF8/Compound Doc)
          isXlsx: hex4 === '504b0304',  // .xlsx (ZIP)
          location: res.headers['location'],
        });
      });
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function probe(label, url, opts) {
  const t0 = Date.now();
  try {
    const r = await fetchUrl(url, opts);
    return { label, ok: true, status: r.status, ms: Date.now()-t0,
      bytes: r.bodyLen, type: (r.headers['content-type']||'').split(';')[0],
      isXls: r.isXls, isXlsx: r.isXlsx, redirect: r.location,
      preview: r.bodyText.slice(0,200).replace(/[\x00-\x08\x0b-\x1f]+/g,' '),
      _body: r.bodyText, _rawBody: r.body,
    };
  } catch(e) { return { label, ok:false, error:e.message, ms:Date.now()-t0 }; }
}

async function getPortfolioLinks(url) {
  const r = await fetchUrl(url);
  const html = r.bodyText;
  const links = [];
  // Extract server-relative paths ending in xls/xlsx
  const matches = html.match(/\/InvestorServices\/[^\s"'<>]+\.(xls|xlsx)/gi) || [];
  // Extract any full https URLs ending in xls/xlsx
  const fullMatches = html.match(/https?:\/\/[^\s"'<>]+\.(xls|xlsx)/gi) || [];
  return { status: r.status, links: [...new Set([...matches, ...fullMatches])], bytes: r.body.length };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const out = {};

  // ── 1. THE KEY TEST: Fetch Nippon monthly XLS directly ──
  out.nipponXLS = await probe(
    'Nippon MONTHLY PORTFOLIO Feb2026',
    'https://mf.nipponindiaim.com/InvestorServices/FactsheetsDocuments/NIMF-MONTHLY-PORTFOLIO-28-Feb-26.xls'
  );
  // Also try Jan 2026
  out.nipponXLSJan = await probe(
    'Nippon MONTHLY PORTFOLIO Jan2026',
    'https://mf.nipponindiaim.com/InvestorServices/FactsheetsDocuments/NIMF-MONTHLY-PORTFOLIO-31-Jan-26.xls'
  );

  // ── 2. Scan other major AMC disclosure pages for portfolio links ──
  const amcPages = [
    { name: 'SBI', url: 'https://www.sbimf.com/en-us/portfolio-disclosure' },
    { name: 'ICICI Pru', url: 'https://www.icicipruamc.com/downloads/portfolio-disclosures' },
    { name: 'Axis', url: 'https://www.axismf.com/portfolio-disclosure' },
    { name: 'Kotak', url: 'https://www.kotakmf.com/Information/statutory-disclosure/portfolio-disclosures' },
    { name: 'Mirae', url: 'https://www.miraeassetmf.co.in/downloads/portfolio-disclosure' },
    { name: 'DSP', url: 'https://www.dspim.com/mandatory-disclosures/portfolio-disclosures' },
  ];

  out.amcPageScans = {};
  await Promise.all(amcPages.map(async ({ name, url }) => {
    try {
      const result = await getPortfolioLinks(url);
      out.amcPageScans[name] = {
        pageStatus: result.status,
        pageBytes: result.bytes,
        xlsLinksFound: result.links.length,
        xlsLinks: result.links.slice(0, 5),
      };
    } catch(e) {
      out.amcPageScans[name] = { error: e.message };
    }
  }));

  // ── 3. AMFI POST - correct AMC codes for Nippon ──
  // AMFI AMC codes from their selector: need to find correct one for Nippon
  // Try a few known codes
  const amfiTests = [
    { code: '22', name: 'Nippon-22' },
    { code: '47', name: 'Nippon-47' },
    { code: '35', name: 'Nippon-35' },
  ];
  out.amfiTests = {};
  for (const t of amfiTests) {
    try {
      const r = await fetchUrl('https://www.amfiindia.com/modules/PortfolioHoldings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `mf=${t.code}&month=2&year=2026&type=1`,
      });
      out.amfiTests[t.name] = {
        status: r.status, bytes: r.bodyLen, isXls: r.isXls, isXlsx: r.isXlsx,
        preview: r.bodyText.slice(0, 100)
      };
    } catch(e) { out.amfiTests[t.name] = { error: e.message }; }
  }

  res.status(200).json({ ts: new Date().toISOString(), ...out });
};
