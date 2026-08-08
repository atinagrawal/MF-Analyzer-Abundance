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
  const amcs = await httpGetJson('https://www.amfiindia.com/api/populate-mf');
  console.log(`Populate MF count: ${amcs ? amcs.length : 'NULL'}`);
  if (amcs && amcs.length) {
    console.log("Sample AMCs:", amcs.slice(0, 5));
  }

  // Probe with MF_ID="" or MF_ID=0 or MF_ID=all or first AMC
  const probeAll = await httpGetJson('https://www.amfiindia.com/api/statewise-data?MF_ID=&date=01-Jan-2026');
  console.log("Probe empty MF_ID:", probeAll ? (probeAll.data ? probeAll.data.length : 'NO DATA') : 'NULL');
  if (probeAll && probeAll.data) {
    console.log("Sample empty MF_ID rows:", probeAll.data.slice(0, 3));
  }

  const date0 = '01-Jan-2026';
  const amc1 = await httpGetJson(`https://www.amfiindia.com/api/statewise-data?MF_ID=3&date=${date0}`);
  console.log(`Probe MF_ID=3 date ${date0}:`, amc1 ? (amc1.data ? amc1.data.length : 'NO DATA') : 'NULL');
  if (amc1 && amc1.monthYear) {
    console.log("Available monthYears from AMFI:", amc1.monthYear.slice(0, 5));
  }
}

main().catch(console.error);
