// api/amfi-statewise.js
// Returns state-wise AUM data from AMFI with smart date resolution.
// Caching strategy:
//   - CDN: s-maxage=43200 (12hr), stale-while-revalidate=86400 (24hr)
//   - Once a month is published it never changes, so 12hr is conservative
//   - Date logic: AMFI usually publishes month N data by 10th-15th of month N+1
//     We try N-1 first, fall back to N-2 if AMFI returns no data

// FIXES: (1) s-maxage added → Vercel CDN now caches (was MISS every call)
//        (2) All AUM values rounded to 2dp → no more 3424298.829999999 noise

import https from 'https';
import zlib from 'zlib';

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function amfiDate(year, month) {
  return `01-${MONTHS[month - 1]}-${year}`;
}

function fetchAMFI(date) {
  const url = `https://www.amfiindia.com/api/statewise-data?MF_ID=0&date=${date}`;
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json', 'Accept-Encoding': 'gzip, deflate, br' },
      timeout: 12000,
    }, (res) => {
      const chunks = [];
      let stream = res;
      const enc = res.headers['content-encoding'] || '';
      if (enc.includes('br'))        stream = res.pipe(zlib.createBrotliDecompress());
      else if (enc.includes('gzip')) stream = res.pipe(zlib.createGunzip());
      stream.on('data', c => chunks.push(c));
      stream.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch(e) { reject(new Error('JSON parse error')); }
      });
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

function candidateMonths() {
  const now = new Date();
  const mon = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  const out = [];
  for (let offset = 1; offset <= 3; offset++) {
    let m = mon - offset, y = year;
    while (m <= 0) { m += 12; y--; }
    out.push({ year: y, month: m });
  }
  return out;
}

// Round to 2 decimal places — eliminates JS floating-point noise from summing
function r2(v) { return Math.round((v || 0) * 100) / 100; }

function processData(raw, date) {
  const rows   = raw.data || [];
  const states = rows.filter(d => d.State && d.State !== 'Grand Total');
  if (!states.length) return null;

  const gtRow     = rows.find(d => d.State === 'Grand Total');
  const grandTotal = r2(gtRow ? parseFloat(gtRow.Total) : 0);

  const enriched = states.map(s => {
    const equitySchemes = r2(s.GrowthEquityOrientedSchemes || 0);
    const balanced      = r2(s.BalancedSchemes             || 0);
    const otherDebt     = r2(s.OtherDebtOrientedSchemes    || 0);
    const liquid        = r2(s.LiquidSchemes               || 0);
    const goldETF       = r2(s.GoldExchangeTradedFund      || 0);
    const otherETF      = r2(s.OtherExchangeTradedFund     || 0);
    const fofOverseas   = r2(s.FOFInvestionOverseas        || 0);
    const fofDomestic   = r2(s.FOFInvestingDomestic        || 0);

    const equity  = r2(equitySchemes + balanced);
    const debt    = r2(otherDebt + liquid);
    const etf     = r2(goldETF + otherETF);
    const fof     = r2(fofOverseas + fofDomestic);
    const total   = r2(s.Total || 0);

    const sharePct  = grandTotal > 0 ? Math.round(total   / grandTotal * 10000) / 100 : 0;
    const equityPct = total > 0      ? Math.round(equity  / total      * 1000)  / 10  : 0;

    return {
      state: s.State, srno: s.srno,
      total, equity, debt, etf, fof, liquid,
      sharePct, equityPct,
      equitySchemes, balanced, otherDebt,
      goldETF, otherETF, fofOverseas, fofDomestic,
    };
  });

  const named  = enriched.filter(s => s.state !== 'Others').sort((a,b) => b.total - a.total);
  const others = enriched.filter(s => s.state === 'Others');
  named.forEach((s, i) => { s.rank = i + 1; });
  others.forEach(s => { s.rank = null; });

  const top5Share         = named.slice(0,5).reduce((a, s) => a + s.sharePct, 0);
  const equityTotal       = enriched.reduce((a, s) => a + s.equity, 0);
  const equityPctIndustry = grandTotal > 0 ? Math.round(equityTotal / grandTotal * 1000) / 10 : 0;

  const availableMonths = (raw.monthYear || [])
    .map(m => (typeof m === 'string' ? m : m.date || ''))
    .filter(Boolean);

  return {
    date,
    grandTotal:         Math.round(grandTotal),
    top5SharePct:       Math.round(top5Share * 10) / 10,
    equityPctIndustry,
    stateCount:         named.length,
    states:             [...named, ...others],
    availableMonths,
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const requestedDate = req.query.date || null;

  try {
    let result = null, usedDate = null;

    if (requestedDate) {
      result   = processData(await fetchAMFI(requestedDate), requestedDate);
      usedDate = requestedDate;
    } else {
      for (const { year, month } of candidateMonths()) {
        const date = amfiDate(year, month);
        try {
          result = processData(await fetchAMFI(date), date);
          if (result) { usedDate = date; break; }
        } catch(e) { continue; }
      }
    }

    if (!result) {
      res.status(503).json({ error: 'AMFI data temporarily unavailable' });
      return;
    }

    // KEY FIX: s-maxage tells Vercel CDN to cache. Without it every call was MISS.
    // Historical months: 30 days (data never changes after AMFI publishes)
    // Auto-resolved latest: 12 hours + 24hr stale-while-revalidate
    const maxAge = requestedDate ? 2592000 : 43200;
    res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=86400`);
    res.setHeader('X-AMFI-Date', usedDate);
    res.status(200).json(result);

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
