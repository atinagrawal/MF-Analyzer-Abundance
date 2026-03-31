// api/nifty-tri.js  — temporary probe for niftyindices.com API discovery
// GET /api/nifty-tri?index=NIFTY%2050&from=01-Jan-2020&to=31-Mar-2026

const https = require('https');

function httpsPost(hostname, path, headers, body) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

function httpsGet(hostname, path, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'GET', headers }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.setTimeout(12000, () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const index     = req.query.index || 'NIFTY 50';
  const startDate = req.query.from  || '01-Jan-2020';
  const endDate   = req.query.to    || '31-Mar-2026';

  const hostname = 'www.niftyindices.com';

  try {
    // Step 1: GET homepage to acquire cookies
    const homeRes = await httpsGet(hostname, '/', {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
    });

    // Build cookie string from Set-Cookie headers
    let cookieStr = '';
    const setCookieHeader = homeRes.headers['set-cookie'];
    if (setCookieHeader) {
      cookieStr = (Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader])
        .map(c => c.split(';')[0]).join('; ');
    }

    // Step 2: POST to multiple endpoints to discover which works
    const payload = JSON.stringify({ name: index, startDate, endDate });
    const commonHeaders = {
      'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept':          'application/json, text/javascript, */*; q=0.01',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type':    'application/json; charset=UTF-8',
      'Content-Length':  Buffer.byteLength(payload).toString(),
      'Referer':         'https://www.niftyindices.com/reports/historical-data',
      'Origin':          'https://www.niftyindices.com',
      'X-Requested-With':'XMLHttpRequest',
      ...(cookieStr ? { 'Cookie': cookieStr } : {}),
    };

    const endpoints = [
      '/Backpage.aspx/getTotalReturnIndexString',
      '/Backpage.aspx/getHistoricaldatatabletoString',
      '/Backpage.aspx/getHistoricalData',
    ];

    const results = {};
    for (const path of endpoints) {
      try {
        const r = await httpsPost(hostname, path, commonHeaders, payload);
        results[path] = {
          status:      r.status,
          ct:          r.headers['content-type'],
          preview:     r.body.slice(0, 600),
          len:         r.body.length,
        };
      } catch(e) {
        results[path] = { error: e.message };
      }
    }

    return res.status(200).json({
      cookiesAcquired: !!cookieStr,
      cookieStr:       cookieStr.slice(0, 100),
      index,
      startDate,
      endDate,
      results,
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  }
};
