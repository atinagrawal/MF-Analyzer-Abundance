// Portfolio probe v7 — SBI pattern + verify all confirmed AMCs
import https from 'https';
import zlib from 'zlib';

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

// ── SBI URL generator with full flexibility ──
function ordinal(d) {
  if (d === 1 || d === 21 || d === 31) return 'st';
  if (d === 2 || d === 22)             return 'nd';
  if (d === 3 || d === 23)             return 'rd';
  return 'th';
}

function sbiCandidates(year, month) {
  // month: 1-12
  const months = ['january','february','march','april','may','june',
                  'july','august','september','october','november','december'];
  const monthName = months[month - 1];
  
  // Last day of month
  const lastDays = {
    1:31, 2: (year % 4 === 0 ? 29 : 28), 3:31, 4:30, 5:31, 6:30,
    7:31, 8:31, 9:30, 10:31, 11:30, 12:31
  };
  const d = lastDays[month];
  const ord = ordinal(d);
  const base = 'https://www.sbimf.com/docs/default-source/scheme-portfolios/';
  
  // Variations: scheme vs schemes (both observed), triple-dash consistent
  return [
    `${base}all-schemes-monthly-portfolio---as-on-${d}${ord}-${monthName}-${year}.xlsx`,
    `${base}all-scheme-monthly-portfolio---as-on-${d}${ord}-${monthName}-${year}.xlsx`,
    // Some months may use double-dash (defensive)
    `${base}all-schemes-monthly-portfolio--as-on-${d}${ord}-${monthName}-${year}.xlsx`,
    `${base}all-scheme-monthly-portfolio--as-on-${d}${ord}-${monthName}-${year}.xlsx`,
  ];
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  const out = {};

  // ── 1. SBI: try Feb 2026, Jan 2026, Dec 2025, Sep 2025 (the known one) ──
  const sbiTests = [
    { year: 2026, month: 2, label: 'Feb2026' },
    { year: 2026, month: 1, label: 'Jan2026' },
    { year: 2025, month: 12, label: 'Dec2025' },
    { year: 2025, month: 9,  label: 'Sep2025' },
  ];

  out.sbi = {};
  await Promise.all(sbiTests.map(async ({ year, month, label }) => {
    const candidates = sbiCandidates(year, month);
    out.sbi[label] = { candidates, results: {} };
    await Promise.all(candidates.map(async url => {
      try {
        const r = await fetchUrl(url);
        const key = url.includes('all-schemes') ? 'schemes' : 'scheme';
        const dashKey = url.includes('---') ? key+'_triple' : key+'_double';
        out.sbi[label].results[dashKey] = {
          status: r.status, bytes: r.bodyLen,
          isXlsx: r.isXlsx, isXls: r.isXls,
          ok: r.status === 200 && (r.isXlsx || r.isXls),
        };
      } catch(e) {
        const key = url.includes('all-schemes') ? 'schemes_err' : 'scheme_err';
        out.sbi[label].results[key] = { error: e.message };
      }
    }));
  }));

  // ── 2. NIPPON: confirm the 1.2MB XLSX is real (check sheet names via first bytes) ──
  try {
    const r = await fetchUrl('https://mf.nipponindiaim.com/InvestorServices/FactsheetsDocuments/NIMF-MONTHLY-PORTFOLIO-28-Feb-26.xls');
    out.nippon = {
      status: r.status, bytes: r.bodyLen,
      isXlsx: r.isXlsx, isXls: r.isXls,
      hexStart: r.body.slice(0,8).toString('hex'),
      ok: r.status === 200 && (r.isXlsx || r.isXls),
    };
  } catch(e) { out.nippon = { error: e.message }; }

  // ── 3. ICICI Pru: follow redirect ──
  try {
    // Try with trailing slash and common ICICI disclosure paths
    const urls = [
      'https://www.icicipruamc.com/downloads/portfolio-disclosures/',
      'https://www.icicipruamc.com/downloads/portfolio-disclosures/monthly-portfolio',
      'https://www.icicipruamc.com/portfolio-disclosures',
    ];
    out.icicipru = {};
    await Promise.all(urls.map(async u => {
      try {
        const r = await fetchUrl(u);
        const links = [...new Set((r.bodyText.match(/https?:\/\/[^\s"'<>]+\.(xlsx|xls)/gi) || [])
          .concat((r.bodyText.match(/\/[^\s"'<>]+\.(xlsx|xls)/gi) || []).map(p => 'https://www.icicipruamc.com' + p))
        )].filter(l => /portfolio|monthly|scheme/i.test(l)).slice(0,5);
        out.icicipru[u.split('/').slice(-1)[0] || 'root'] = {
          status: r.status, bytes: r.bodyLen, redirect: r.location, links
        };
      } catch(e) { out.icicipru[u.split('/').slice(-1)[0]] = { error: e.message }; }
    }));
  } catch(e) { out.icicipru = { error: e.message }; }

  // ── 4. Mirae: follow redirect ──
  try {
    const urls = [
      'https://www.miraeassetmf.co.in/downloads/portfolio-disclosure/',
      'https://www.miraeassetmf.co.in/downloads/portfolio-disclosures',
      'https://www.miraeassetmf.co.in/statutory-disclosure/monthly-portfolio',
    ];
    out.mirae = {};
    await Promise.all(urls.map(async u => {
      try {
        const r = await fetchUrl(u);
        const links = [...new Set((r.bodyText.match(/https?:\/\/[^\s"'<>]+\.(xlsx|xls)/gi) || [])
          .filter(l => /portfolio|monthly|scheme/i.test(l))
        )].slice(0,5);
        out.mirae[u.split('/').slice(-1)[0] || 'root'] = {
          status: r.status, bytes: r.bodyLen, redirect: r.location, links
        };
      } catch(e) { out.mirae[u.split('/').slice(-1)[0]] = { error: e.message }; }
    }));
  } catch(e) { out.mirae = { error: e.message }; }

  // ── 5. DSP: fix double-domain bug + find equity monthly ──
  try {
    const r = await fetchUrl('https://www.dspim.com/mandatory-disclosures/portfolio-disclosures');
    // Fix double-domain: remove the prefix duplication
    const rawLinks = r.bodyText.match(/\/www\.dspim\.com\/media[^\s"'<>]+\.(xls|xlsx)/gi) || [];
    const links = [...new Set(rawLinks.map(l => 'https:/' + l))];
    // Also look for equity monthly specifically
    const equityLinks = links.filter(l => !l.includes('debt') && !l.includes('fortnightly'));
    out.dsp = { status: r.status, allLinks: links.slice(0,10), equityLinks };
  } catch(e) { out.dsp = { error: e.message }; }

  // ── 6. Franklin: find actual portfolio URL ──
  try {
    const urls = [
      'https://www.franklintempletonindia.com/investor/portfolio-disclosures',
      'https://www.franklintempletonindia.com/downloads/monthly-portfolio',
    ];
    out.franklin = {};
    for (const u of urls) {
      try {
        const r = await fetchUrl(u);
        const links = [...new Set((r.bodyText.match(/https?:\/\/[^\s"'<>]+\.(xlsx|xls)/gi) || [])
          .filter(l => /portfolio|monthly/i.test(l))
        )].slice(0,5);
        out.franklin[u.split('/').slice(-1)[0]] = { status: r.status, bytes: r.bodyLen, redirect: r.location, links };
      } catch(e) { out.franklin[u.split('/').slice(-1)[0]] = { error: e.message }; }
    }
  } catch(e) { out.franklin = { error: e.message }; }

  res.status(200).json({ ts: new Date().toISOString(), ...out });
};
