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
  const mfIds = amcs.map(a => a.mfId).filter(Boolean);
  console.log(`Fetching ${mfIds.length} AMCs for 01-Jun-2026...`);

  const date = '01-Jun-2026';
  const responses = await Promise.all(mfIds.map(id => httpGetJson(`https://www.amfiindia.com/api/statewise-data?MF_ID=${id}&date=${date}`)));

  const stateMap = new Map();
  let amcSuccessCount = 0;

  for (const resp of responses) {
    if (!resp || !Array.isArray(resp.data) || !resp.data.length) continue;
    amcSuccessCount++;
    for (const r of resp.data) {
      const stName = r.State;
      if (!stName || stName === 'Grand Total') continue;

      if (!stateMap.has(stName)) {
        stateMap.set(stName, {
          state: stName,
          total: 0,
          equity: 0,
          debt: 0,
          liquid: 0,
        });
      }
      const st = stateMap.get(stName);
      st.total += parseFloat(r.Total || 0);
      st.equity += parseFloat(r.GrowthEquityOrientedSchemes || 0) + parseFloat(r.BalancedSchemes || 0);
      st.debt += parseFloat(r.OtherDebtOrientedSchemes || 0);
      st.liquid += parseFloat(r.LiquidSchemes || 0);
    }
  }

  console.log(`Successfully fetched ${amcSuccessCount} of ${mfIds.length} AMCs`);
  const states = Array.from(stateMap.values()).sort((a,b) => b.total - a.total);
  const grandTotal = states.reduce((sum, s) => sum + s.total, 0);

  console.log(`Grand Total Industry AUM (June 2026): ₹${(grandTotal / 100000).toFixed(2)} Lakh Crore (₹${Math.round(grandTotal).toLocaleString()} Cr)`);
  console.log("\nTop 10 States by Total AUM:");
  states.slice(0, 10).forEach((s, i) => {
    const pct = (s.total / grandTotal * 100).toFixed(2);
    console.log(`${i + 1}. ${s.state}: ₹${Math.round(s.total).toLocaleString()} Cr (${pct}% of India)`);
  });

  console.log("\nSample state data (Maharashtra):", states.find(s => s.state.includes('Maharashtra')));
}

main().catch(console.error);
