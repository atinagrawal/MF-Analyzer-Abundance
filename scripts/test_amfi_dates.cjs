const https = require('https');
const zlib = require('zlib');

function httpGetJson(url) {
  return new Promise((resolve) => {
    const req = https.request(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.amfiindia.com/'
      },
      timeout: 10000,
    }, (res) => {
      const chunks = [];
      let stream = res;
      const enc = res.headers['content-encoding'] || '';
      if (enc.includes('br'))        stream = res.pipe(zlib.createBrotliDecompress());
      else if (enc.includes('gzip')) stream = res.pipe(zlib.createGunzip());
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch(e) { resolve(null); }
      });
      stream.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function main() {
  const datesToTest = [
    '01-Jul-2026',
    'July-2026',
    '01-07-2026',
    '01-Jun-2026',
    'June-2026',
    '01-May-2026',
    'May-2026'
  ];

  for (const d of datesToTest) {
    const res = await httpGetJson(`https://www.amfiindia.com/api/statewise-data?MF_ID=3&date=${d}`);
    const count = res && Array.isArray(res.data) ? res.data.length : 0;
    console.log(`Date '${d}': returned ${count} rows`);
    if (count > 0) {
      console.log(`  Sample row for '${d}':`, res.data[0]);
    }
  }
}

main().catch(console.error);
