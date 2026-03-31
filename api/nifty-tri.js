// api/nifty-tri.js
// Fetches TRI (Total Return Index) from niftyindices.com.
// niftyindices.com returns max 1 year of data per request — this function
// chunks the date range into 1-year intervals and stitches them together.
//
// Usage:
//   GET /api/nifty-tri?index=NIFTY%2050
//   GET /api/nifty-tri?index=Nifty%20Midcap%20150&from=01-Jan-2010&to=31-Mar-2026
//
// Default: last 10 years (enough for all rolling windows up to 10Y)
// For full history: pass ?from=01-Jan-1999
//
// Supported index names (exact):
//   NIFTY 50, Nifty Next 50, Nifty Midcap 150, Nifty Smallcap 250,
//   Nifty 500, Nifty Bank, Nifty IT, Nifty Midcap 50 ...

const https = require('https');

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(d) {
  return `${String(d.getDate()).padStart(2,'0')}-${MONTHS[d.getMonth()]}-${d.getFullYear()}`;
}

function parseDate(s) {
  const [dd, mon, yyyy] = s.split('-');
  return new Date(`${mon} ${dd} ${yyyy}`);
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status:  res.statusCode,
        headers: res.headers,
        body:    Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function fetchChunk(indexName, startDate, endDate, cookieStr) {
  const cinfo   = `{'name':'${indexName}','startDate':'${startDate}','endDate':'${endDate}','indexName':'${indexName}'}`;
  const payload = JSON.stringify({ cinfo });

  const res = await httpsRequest({
    hostname: 'www.niftyindices.com',
    path:     '/Backpage.aspx/getTotalReturnIndexString',
    method:   'POST',
    headers: {
      'User-Agent':       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept':           'application/json, text/javascript, */*; q=0.01',
      'Accept-Language':  'en-US,en;q=0.9',
      'Content-Type':     'application/json; charset=UTF-8',
      'Content-Length':   Buffer.byteLength(payload).toString(),
      'Referer':          'https://www.niftyindices.com/reports/historical-data',
      'Origin':           'https://www.niftyindices.com',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie':           cookieStr,
    },
  }, payload);

  if (res.status !== 200) throw new Error(`HTTP ${res.status}: ${res.body.slice(0,150)}`);

  const outer = JSON.parse(res.body);
  if (!outer.d) throw new Error(`No "d" key in response`);
  const rows = JSON.parse(outer.d);
  return Array.isArray(rows) ? rows : [];
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  // Cache 6 hours on CDN — TRI only changes on trading days
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const indexName = req.query.index || 'NIFTY 50';

  // Default: 10 years back (covers 1Y–10Y rolling windows)
  const defaultFrom = fmtDate(addDays(new Date(), -3650));
  const fromStr = req.query.from || defaultFrom;
  const toStr   = req.query.to   || fmtDate(new Date());

  try {
    // ── Acquire session cookie ───────────────────────────────────
    const homeRes = await httpsRequest({
      hostname: 'www.niftyindices.com',
      path:   '/',
      method: 'GET',
      headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const setCookieRaw = homeRes.headers['set-cookie'] || [];
    const cookieStr = (Array.isArray(setCookieRaw) ? setCookieRaw : [setCookieRaw])
      .map(c => c.split(';')[0]).join('; ');

    if (!cookieStr) {
      return res.status(502).json({ error: 'Could not acquire session cookie' });
    }

    // ── Build 1-year chunks ──────────────────────────────────────
    const startD = parseDate(fromStr);
    const endD   = parseDate(toStr);
    const chunks = [];
    let cursor = new Date(startD);
    while (cursor < endD) {
      const chunkEnd = addDays(cursor, 364);
      chunks.push({ from: fmtDate(cursor), to: fmtDate(chunkEnd > endD ? endD : chunkEnd) });
      cursor = addDays(chunkEnd > endD ? endD : chunkEnd, 1);
    }

    // ── Fetch sequentially with small delay ──────────────────────
    // Sequential (not parallel) to avoid triggering niftyindices rate limiting.
    // 150ms delay × 10 chunks (default) = ~1.5s overhead, well within Vercel limits.
    // Full 25Y history (28 chunks) at 150ms = ~4s overhead — set maxDuration:30 in vercel.json.
    const allRows  = [];
    const seenDates = new Set();
    let sampleKeys = null;
    const errors   = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const rows = await fetchChunk(indexName, chunk.from, chunk.to, cookieStr);
        if (rows.length && !sampleKeys) sampleKeys = Object.keys(rows[0]);
        for (const row of rows) {
          const dateKey = sampleKeys?.find(k => /date/i.test(k)) || Object.keys(row)[0];
          const key = row[dateKey];
          if (key && !seenDates.has(key)) {
            seenDates.add(key);
            allRows.push(row);
          }
        }
      } catch(e) {
        errors.push(`${chunk.from}→${chunk.to}: ${e.message}`);
      }
      if (i < chunks.length - 1) await sleep(150);
    }

    if (!allRows.length) {
      return res.status(404).json({
        error: 'No TRI data returned',
        index: indexName,
        chunks: chunks.length,
        errors,
      });
    }

    // ── Identify field names ─────────────────────────────────────
    if (!sampleKeys) sampleKeys = Object.keys(allRows[0]);
    const dateKey  = sampleKeys.find(k => /date/i.test(k)) || sampleKeys[0];
    const triKey   = sampleKeys.find(k => /total|tri|return/i.test(k));
    const closeKey = sampleKeys.find(k => /close/i.test(k));
    const valueKey = triKey || closeKey || sampleKeys[sampleKeys.length - 1];

    // ── Normalise to [{date, value}] sorted oldest→newest ────────
    const data = allRows
      .map(r => ({ date: r[dateKey], value: parseFloat(r[valueKey]) || null }))
      .filter(r => r.value !== null && r.date)
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return res.status(200).json({
      index:      indexName,
      from:       fromStr,
      to:         toStr,
      source:     'niftyindices.com/getTotalReturnIndexString',
      type:       triKey ? 'TRI' : 'PRICE',
      chunks:     chunks.length,
      count:      data.length,
      sampleKeys,
      dateKey,
      valueKey,
      oldest:     data[0],
      newest:     data[data.length - 1],
      ...(errors.length ? { errors } : {}),
      data,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
