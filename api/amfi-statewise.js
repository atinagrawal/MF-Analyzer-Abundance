// /api/amfi-statewise.js
// Returns state-wise AUM data from AMFI with smart date resolution.
// Caching strategy:
//   - CDN: s-maxage=43200 (12hr), stale-while-revalidate=86400 (24hr)
//   - Once a month is published it never changes, so 12hr is conservative
//   - Date logic: AMFI usually publishes month N data by 10th-15th of month N+1
//     We try N-1 first, fall back to N-2 if AMFI returns no data

const https = require('https');
const zlib  = require('zlib');

// Month names AMFI accepts
const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function amfiDate(year, month) {
  // month is 1-indexed
  return `01-${MONTHS[month - 1]}-${year}`;
}

function fetchAMFI(date) {
  const url = `https://www.amfiindia.com/api/statewise-data?MF_ID=0&date=${date}`;
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate, br',
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
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          resolve(json);
        } catch(e) {
          reject(new Error('JSON parse error'));
        }
      });
      stream.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.end();
  });
}

// Compute which months to try, in priority order
function candidateMonths() {
  const now = new Date();
  const day  = now.getUTCDate();
  const mon  = now.getUTCMonth() + 1; // 1-indexed
  const year = now.getUTCFullYear();

  // If we're early in the month (before 15th), current month's data
  // almost certainly isn't published yet. Try N-1 first, then N-2.
  // If we're on or after 15th, try N-1 (published) first, then N-2.
  // Either way the order is: [N-1, N-2, N-3] — stop at first non-empty.

  const candidates = [];
  for (let offset = 1; offset <= 3; offset++) {
    let m = mon - offset;
    let y = year;
    while (m <= 0) { m += 12; y -= 1; }
    candidates.push({ year: y, month: m });
  }
  return candidates;
}

function processData(raw, date) {
  const states = (raw.data || []).filter(d => d.State && d.State !== 'Grand Total');
  if (states.length === 0) return null;

  const grandTotalRow = raw.data.find(d => d.State === 'Grand Total');
  const grandTotal = grandTotalRow ? parseFloat(grandTotalRow.Total) : 0;

  // Enrich each state
  const enriched = states.map(s => {
    const equity   = (s.GrowthEquityOrientedSchemes || 0) + (s.BalancedSchemes || 0);
    const debt     = (s.LiquidSchemes || 0) + (s.OtherDebtOrientedSchemes || 0);
    const etf      = (s.GoldExchangeTradedFund || 0) + (s.OtherExchangeTradedFund || 0);
    const fof      = (s.FOFInvestionOverseas || 0) + (s.FOFInvestingDomestic || 0);
    const total    = s.Total || 0;
    const sharePct = grandTotal > 0 ? (total / grandTotal * 100) : 0;
    const equityPct = total > 0 ? (equity / total * 100) : 0;

    return {
      state:      s.State,
      srno:       s.srno,
      total,
      equity,
      debt,
      etf,
      fof,
      liquid:     s.LiquidSchemes || 0,
      sharePct:   Math.round(sharePct * 100) / 100,
      equityPct:  Math.round(equityPct * 10) / 10,
      // raw fields for completeness
      equitySchemes: s.GrowthEquityOrientedSchemes || 0,
      balanced:      s.BalancedSchemes || 0,
      otherDebt:     s.OtherDebtOrientedSchemes || 0,
      goldETF:       s.GoldExchangeTradedFund || 0,
      otherETF:      s.OtherExchangeTradedFund || 0,
      fofOverseas:   s.FOFInvestionOverseas || 0,
      fofDomestic:   s.FOFInvestingDomestic || 0,
    };
  });

  // Sort by total descending (exclude 'Others' from rank but keep it in data)
  const named  = enriched.filter(s => s.state !== 'Others').sort((a,b) => b.total - a.total);
  const others = enriched.filter(s => s.state === 'Others');
  const sorted = [...named, ...others];

  // Assign rank to named states only
  named.forEach((s, i) => { s.rank = i + 1; });
  others.forEach(s => { s.rank = null; });

  // Summary stats
  const top5Share   = named.slice(0,5).reduce((acc, s) => acc + s.sharePct, 0);
  const equityTotal = sorted.reduce((acc, s) => acc + s.equity, 0);
  const equityPctIndustry = grandTotal > 0 ? Math.round(equityTotal / grandTotal * 1000) / 10 : 0;

  // Available months list from API response (for frontend date picker)
  const availableMonths = (raw.monthYear || []).map(m => m.date);

  return {
    date,
    grandTotal:          Math.round(grandTotal),
    top5SharePct:        Math.round(top5Share * 10) / 10,
    equityPctIndustry,
    stateCount:          named.length,
    states:              sorted,
    availableMonths,     // full list of months AMFI has data for
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  // Allow frontend to request a specific month (for historical browsing)
  // e.g. ?date=01-jan-2026 — if not provided, auto-resolve latest
  const requestedDate = req.query.date || null;

  try {
    let result = null;
    let usedDate = null;

    if (requestedDate) {
      // Specific month requested — fetch directly
      const raw = await fetchAMFI(requestedDate);
      result = processData(raw, requestedDate);
      usedDate = requestedDate;
    } else {
      // Auto-resolve latest available month
      const candidates = candidateMonths();
      for (const { year, month } of candidates) {
        const date = amfiDate(year, month);
        try {
          const raw = await fetchAMFI(date);
          result = processData(raw, date);
          if (result) { usedDate = date; break; }
        } catch(e) {
          continue;
        }
      }
    }

    if (!result) {
      res.status(503).json({ error: 'AMFI data temporarily unavailable' });
      return;
    }

    // Cache: 12hr CDN cache, 24hr stale-while-revalidate
    // Historical months can be cached forever (s-maxage=2592000)
    const isLatest = !requestedDate;
    const maxAge   = isLatest ? 43200 : 2592000; // 12hr for auto, 30d for specific
    res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=86400`);
    res.setHeader('X-AMFI-Date', usedDate);

    res.status(200).json(result);

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
