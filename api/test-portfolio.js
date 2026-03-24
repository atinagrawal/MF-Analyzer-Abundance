// Portfolio source probe — deploy, call once, then delete
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
      preview: r.bodyStart.slice(0, 180),
    };
  } catch(e) {
    return { label, ok: false, error: e.message, ms: Date.now() - t0 };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  const probes = [
    // HDFC S3 individual fund files
    probe('HDFC-S3 Innovation Jan2026',
      'https://files.hdfcfund.com/s3fs-public/2026-02/Monthly%20HDFC%20Innovation%20Fund%20-%2031%20January%202026.xlsx'),
    probe('HDFC-S3 Innovation Feb2026',
      'https://files.hdfcfund.com/s3fs-public/2026-03/Monthly%20HDFC%20Innovation%20Fund%20-%2028%20February%202026.xlsx'),
    probe('HDFC-S3 Retirement Feb2026 (known URL)',
      'https://files.hdfcfund.com/s3fs-public/2026-03/Monthly%20HDFC%20Retirement%20Savings%20Fund%20-%20Hybrid-Debt%20Plan%20-%2028%20February%202026.xlsx'),
    probe('HDFC-S3 HybridDebt Jan2026 (known URL)',
      'https://files.hdfcfund.com/s3fs-public/2026-02/Monthly%20HDFC%20Hybrid%20Debt%20Fund%20-%2031%20January%20%202026.xlsx'),
    // AMFI
    probe('AMFI NAVAll.txt (baseline)',
      'https://www.amfiindia.com/spages/NAVAll.txt'),
    probe('AMFI schemedata CSV',
      'https://portal.amfiindia.com/DownloadSchemeData_Po.aspx?mf=0'),
    probe('AMFI portfolio POST (mf=65,month=2,year=2026)',
      'https://www.amfiindia.com/modules/PortfolioHoldings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded',
                   'Referer': 'https://www.amfiindia.com/online-center/portfolio-disclosure' },
        body: 'mf=65&month=2&year=2026&type=1',
      }),
    probe('AMFI portfolio GET probe',
      'https://www.amfiindia.com/modules/portfolioDisclosure?mf=65&month=2&year=2026'),
    // captnemo
    probe('captnemo /nav baseline',
      'https://mf.captnemo.in/nav/INF179KC1JO7'),
    probe('captnemo /kuvera metadata',
      'https://mf.captnemo.in/kuvera/INF179KC1JO7'),
    // mfapi
    probe('mfapi search',
      'https://api.mfapi.in/mf/search?q=hdfc+innovation'),
  ];

  const settled = await Promise.allSettled(probes);
  const results = settled.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason?.message });

  res.status(200).json({ ts: new Date().toISOString(), results });
};
