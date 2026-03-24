// Portfolio source probe v2 — Nippon India Small Cap focus
// GET /api/test-portfolio

const https = require('https');
const zlib = require('zlib');

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        ...(options.headers || {}),
      },
      timeout: 12000,
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
          bodyLen: body.length,
          bodyStart: body.slice(0, 300).toString('utf8').replace(/[\x00-\x1f]+/g, ' '),
          isXlsx: body.slice(0,4).toString('hex') === '504b0304',
          location: res.headers['location'] || null,
        });
      });
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout 12s')); });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function probe(label, url, opts) {
  const t0 = Date.now();
  try {
    const r = await fetchUrl(url, opts);
    return {
      label, ok: true,
      status: r.status,
      ms: Date.now() - t0,
      bytes: r.bodyLen,
      type: (r.headers['content-type'] || '').split(';')[0],
      isXlsx: r.isXlsx,
      redirect: r.location,
      preview: r.bodyStart.slice(0, 150),
    };
  } catch(e) {
    return { label, ok: false, error: e.message, ms: Date.now() - t0 };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  // Nippon India uses SharePoint-based hosting
  // Their monthly portfolio is a SINGLE xlsx with ALL schemes combined (unlike HDFC per-scheme)
  // Pattern from factsheet page: "Monthly portfolio as on 28th February 2026"
  const probes = [

    // ── NIPPON: Various URL patterns to try ──
    // Pattern 1: SharePoint document library
    probe('Nippon SharePoint Feb2026 v1',
      'https://mf.nipponindiaim.com/InvestorServices/Monthly-Portfolio/Monthly-Portfolio-February-2026.xlsx'),
    probe('Nippon SharePoint Feb2026 v2',
      'https://mf.nipponindiaim.com/InvestorServices/Monthly%20Portfolio/Monthly-Portfolio-February-2026.xlsx'),
    probe('Nippon SharePoint Feb2026 v3',
      'https://mf.nipponindiaim.com/SiteCollectionDocuments/Monthly%20Portfolio/Monthly-Portfolio-February-2026.xlsx'),

    // Pattern 2: Old Reliance/Nippon URL style seen in older search results
    probe('Nippon old style Feb2026',
      'https://mf.nipponindiaim.com/investorservices/factsheetsdocuments/monthly-portfolio-feb-2026/Monthly-Portfolio-February-2026.xlsx'),
    probe('Nippon factsheetsdocuments Feb2026',
      'https://mf.nipponindiaim.com/investorservices/factsheetsdocuments/Monthly-Portfolio-February-2026.xlsx'),

    // Pattern 3: Direct CDN/blob
    probe('Nippon blob Feb2026 v1',
      'https://mf.nipponindiaim.com/_layouts/15/download.aspx?SourceUrl=%2FInvestorServices%2FMonthly%20Portfolio%2FMonthly%20Portfolio%20February%202026.xlsx'),

    // Pattern 4: Try the actual factsheet page for HTML link discovery
    probe('Nippon factsheet page (HTML)',
      'https://mf.nipponindiaim.com/investor-service/downloads/factsheet-portfolio-and-other-disclosures'),

    // Pattern 5: Try known monthly portfolio direct URLs (based on older web archive patterns)
    probe('Nippon Jan2026 portfolio direct',
      'https://mf.nipponindiaim.com/InvestorServices/Pages/Monthly-Portfolio/Monthly-Portfolio-January-2026.xlsx'),

    // Pattern 6: Azure blob or CDN (nipponindiaim uses Azure)
    probe('Nippon Azure CDN Feb2026',
      'https://mf.nipponindiaim.com/content/dam/monthly-portfolio/Monthly-Portfolio-February-2026.xlsx'),

    // ── HDFC confirmation (Jan 2026 - already confirmed working) ──
    probe('HDFC Innovation Jan2026 (re-confirm)',
      'https://files.hdfcfund.com/s3fs-public/2026-02/Monthly%20HDFC%20Innovation%20Fund%20-%2031%20January%202026.xlsx'),

    // ── captnemo for Nippon Small Cap ISIN ──
    probe('captnemo /nav Nippon Small Cap Direct',
      'https://mf.captnemo.in/nav/INF204K01K15'),

    // Nippon Small Cap ISIN (Direct Growth = INF204K01K15)
    probe('captnemo /kuvera Nippon Small Cap',
      'https://mf.captnemo.in/kuvera/INF204K01K15'),
  ];

  const settled = await Promise.allSettled(probes);
  const results = settled.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message });

  res.status(200).json({ ts: new Date().toISOString(), results });
};
