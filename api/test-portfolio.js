// Portfolio probe v6 — Fast split: Nippon XLS + top 3 AMCs only (< 15s total)
const https = require('https');
const zlib = require('zlib');

function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120',
        'Accept': '*/*', 'Accept-Encoding': 'gzip, deflate, br',
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
        const hex4 = body.slice(0,4).toString('hex');
        resolve({
          status: res.statusCode, headers: res.headers, body,
          bodyLen: body.length, bodyText: body.toString('utf8'),
          isXls:  hex4 === 'd0cf11e0',
          isXlsx: hex4 === '504b0304',
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

function extractXlsLinks(html, baseUrl) {
  const relative = [...new Set((html.match(/\/[^\s"'<>]+\.(xls|xlsx)/gi) || []))];
  const absolute = [...new Set((html.match(/https?:\/\/[^\s"'<>]+\.(xls|xlsx)/gi) || []))];
  const full = [
    ...relative.map(p => baseUrl + p),
    ...absolute
  ];
  // Filter: only keep likely portfolio/monthly files
  return full.filter(u => /monthly|portfolio|factsheet|fundport/i.test(u)).slice(0, 8);
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const out = {};

  // Run all in parallel but with 12s timeouts each
  const tasks = [

    // ── NIPPON: Fetch the actual XLS file ──
    (async () => {
      try {
        const r = await fetchUrl('https://mf.nipponindiaim.com/InvestorServices/FactsheetsDocuments/NIMF-MONTHLY-PORTFOLIO-28-Feb-26.xls');
        out.nippon = {
          status: r.status, bytes: r.bodyLen,
          isXls: r.isXls, isXlsx: r.isXlsx,
          type: r.headers['content-type'],
          // First 200 bytes as hex to diagnose format
          hexStart: r.body.slice(0,8).toString('hex'),
          // If it's text-like, show preview
          textPreview: r.isXls || r.isXlsx ? '[binary]' : r.bodyText.slice(0,200),
        };
      } catch(e) { out.nippon = { error: e.message }; }
    })(),

    // ── SBI ──
    (async () => {
      try {
        const r = await fetchUrl('https://www.sbimf.com/en-us/portfolio-disclosure');
        const links = extractXlsLinks(r.bodyText, 'https://www.sbimf.com');
        out.sbi = { status: r.status, bytes: r.bodyLen, links };
      } catch(e) { out.sbi = { error: e.message }; }
    })(),

    // ── ICICI Pru ──
    (async () => {
      try {
        const r = await fetchUrl('https://www.icicipruamc.com/downloads/portfolio-disclosures');
        const links = extractXlsLinks(r.bodyText, 'https://www.icicipruamc.com');
        out.icicipru = { status: r.status, bytes: r.bodyLen, links };
      } catch(e) { out.icicipru = { error: e.message }; }
    })(),

    // ── Axis ──
    (async () => {
      try {
        const r = await fetchUrl('https://www.axismf.com/portfolio-disclosure');
        const links = extractXlsLinks(r.bodyText, 'https://www.axismf.com');
        out.axis = { status: r.status, bytes: r.bodyLen, links };
      } catch(e) { out.axis = { error: e.message }; }
    })(),

    // ── Mirae ──
    (async () => {
      try {
        const r = await fetchUrl('https://www.miraeassetmf.co.in/downloads/portfolio-disclosure');
        const links = extractXlsLinks(r.bodyText, 'https://www.miraeassetmf.co.in');
        out.mirae = { status: r.status, bytes: r.bodyLen, links };
      } catch(e) { out.mirae = { error: e.message }; }
    })(),

    // ── Kotak ──
    (async () => {
      try {
        const r = await fetchUrl('https://www.kotakmf.com/Information/statutory-disclosure/portfolio-disclosures');
        const links = extractXlsLinks(r.bodyText, 'https://www.kotakmf.com');
        out.kotak = { status: r.status, bytes: r.bodyLen, links };
      } catch(e) { out.kotak = { error: e.message }; }
    })(),

    // ── DSP ──
    (async () => {
      try {
        const r = await fetchUrl('https://www.dspim.com/mandatory-disclosures/portfolio-disclosures');
        const links = extractXlsLinks(r.bodyText, 'https://www.dspim.com');
        out.dsp = { status: r.status, bytes: r.bodyLen, links };
      } catch(e) { out.dsp = { error: e.message }; }
    })(),

    // ── Franklin Templeton ──
    (async () => {
      try {
        const r = await fetchUrl('https://www.franklintempletonindia.com/investor/portfolio-disclosures');
        const links = extractXlsLinks(r.bodyText, 'https://www.franklintempletonindia.com');
        out.franklin = { status: r.status, bytes: r.bodyLen, links };
      } catch(e) { out.franklin = { error: e.message }; }
    })(),

    // ── AMFI POST with correct AMC-code discovery ──
    // First: get the list of AMC codes from AMFI's own dropdown
    (async () => {
      try {
        const r = await fetchUrl('https://www.amfiindia.com/online-center/portfolio-disclosure');
        // Look for option values in the AMC dropdown
        const opts = r.bodyText.match(/value="(\d+)"[^>]*>([^<]+)<\/option>/gi) || [];
        const nipponOpt = opts.find(o => /nippon|reliance/i.test(o));
        out.amfiAMCCodes = {
          status: r.status,
          bytes: r.bodyLen,
          nipponOption: nipponOpt || null,
          allOptions: opts.slice(0, 20),
        };
      } catch(e) { out.amfiAMCCodes = { error: e.message }; }
    })(),

  ];

  await Promise.allSettled(tasks);

  res.status(200).json({ ts: new Date().toISOString(), ...out });
};
