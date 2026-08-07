// pages/api/amfi-statewise.js
// Returns state-wise AUM data from AMFI aggregated across all AMCs for true industry totals.

import https from 'https';
import zlib from 'zlib';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const ALL_AMC_FALLBACK = [
  '62','85','3','86','80','87','53','75','48','46','4','32','81','91','84','6',
  '47','27','63','9','76','37','20','65','42','70','82','16','17','88','18','69',
  '45','89','55','54','21','73','90','78','58','64','13','41','74','22','67','33',
  '25','26','83','72','79','61','28','71','77'
];

function amfiDate(year, month) {
  return `01-${MONTHS[month - 1]}-${year}`;
}

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

async function fetchWithRetry(url, retries = 3, delayMs = 250) {
  for (let i = 0; i < retries; i++) {
    const res = await httpGetJson(url);
    if (res && Array.isArray(res.data) && res.data.length > 0) return res;
    if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs));
  }
  return null;
}

async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i], i);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

let cachedAmcIds = null;
let amcFetchTime = 0;

async function getAmcIds() {
  if (cachedAmcIds && Date.now() - amcFetchTime < 24 * 60 * 60 * 1000) {
    return cachedAmcIds;
  }
  const data = await httpGetJson('https://www.amfiindia.com/api/populate-mf');
  if (Array.isArray(data) && data.length) {
    cachedAmcIds = data.map(d => d.mfId).filter(Boolean);
    amcFetchTime = Date.now();
    return cachedAmcIds;
  }
  return ALL_AMC_FALLBACK;
}

function candidateMonths() {
  const now = new Date();
  const mon = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();
  const out = [];
  for (let offset = 1; offset <= 4; offset++) {
    let m = mon - offset, y = year;
    while (m <= 0) { m += 12; y--; }
    out.push({ year: y, month: m });
  }
  return out;
}

function r2(v) { return Math.round((v || 0) * 100) / 100; }

const RESPONSE_CACHE = new Map();
const CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours in-memory cache

async function fetchIndustryStatewise(date) {
  const cacheKey = date;
  const cached = RESPONSE_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }

  const amcIds = await getAmcIds();
  
  // Probe first AMC to check if date has data + fetch monthYear list
  const firstAmcData = await fetchWithRetry(`https://www.amfiindia.com/api/statewise-data?MF_ID=${amcIds[0]}&date=${date}`, 2, 200);
  if (!firstAmcData || !Array.isArray(firstAmcData.data) || !firstAmcData.data.length) {
    return null;
  }

  const availableMonths = (firstAmcData.monthYear || [])
    .map(m => (typeof m === 'string' ? m : m.date || ''))
    .filter(Boolean);

  // Fetch all AMCs using controlled concurrency (6 workers) with retries
  const responses = await mapConcurrent(amcIds, 6, (mfId) =>
    fetchWithRetry(`https://www.amfiindia.com/api/statewise-data?MF_ID=${mfId}&date=${date}`)
  );

  const stateMap = new Map();

  for (const resp of responses) {
    if (!resp || !Array.isArray(resp.data)) continue;
    for (const r of resp.data) {
      const stateName = r.State;
      if (!stateName || stateName === 'Grand Total') continue;

      if (!stateMap.has(stateName)) {
        stateMap.set(stateName, {
          state: stateName,
          GrowthEquityOrientedSchemes: 0,
          BalancedSchemes: 0,
          OtherDebtOrientedSchemes: 0,
          LiquidSchemes: 0,
          GoldExchangeTradedFund: 0,
          OtherExchangeTradedFund: 0,
          FOFInvestionOverseas: 0,
          FOFInvestingDomestic: 0,
          Total: 0,
        });
      }

      const st = stateMap.get(stateName);
      st.GrowthEquityOrientedSchemes += parseFloat(r.GrowthEquityOrientedSchemes || 0);
      st.BalancedSchemes             += parseFloat(r.BalancedSchemes || 0);
      st.OtherDebtOrientedSchemes    += parseFloat(r.OtherDebtOrientedSchemes || 0);
      st.LiquidSchemes               += parseFloat(r.LiquidSchemes || 0);
      st.GoldExchangeTradedFund      += parseFloat(r.GoldExchangeTradedFund || 0);
      st.OtherExchangeTradedFund     += parseFloat(r.OtherExchangeTradedFund || 0);
      st.FOFInvestionOverseas        += parseFloat(r.FOFInvestionOverseas || 0);
      st.FOFInvestingDomestic        += parseFloat(r.FOFInvestingDomestic || 0);
      st.Total                       += parseFloat(r.Total || 0);
    }
  }

  if (!stateMap.size) return null;

  const aggregatedRows = Array.from(stateMap.values());
  const grandTotal = r2(aggregatedRows.reduce((a, b) => a + b.Total, 0));

  const enriched = aggregatedRows.map(s => {
    const equitySchemes = r2(s.GrowthEquityOrientedSchemes);
    const balanced      = r2(s.BalancedSchemes);
    const otherDebt     = r2(s.OtherDebtOrientedSchemes);
    const liquid        = r2(s.LiquidSchemes);
    const goldETF       = r2(s.GoldExchangeTradedFund);
    const otherETF      = r2(s.OtherExchangeTradedFund);
    const fofOverseas   = r2(s.FOFInvestionOverseas);
    const fofDomestic   = r2(s.FOFInvestingDomestic);

    const equity  = r2(equitySchemes + balanced);
    const debt    = r2(otherDebt + liquid);
    const etf     = r2(goldETF + otherETF);
    const fof     = r2(fofOverseas + fofDomestic);
    const total   = r2(s.Total);

    const sharePct  = grandTotal > 0 ? Math.round(total   / grandTotal * 10000) / 100 : 0;
    const equityPct = total > 0      ? Math.round(equity  / total      * 1000)  / 10  : 0;

    return {
      state: s.state,
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

  const resultData = {
    date,
    grandTotal:         Math.round(grandTotal),
    top5SharePct:       Math.round(top5Share * 10) / 10,
    equityPctIndustry,
    stateCount:         named.length,
    states:             [...named, ...others],
    availableMonths,
  };

  RESPONSE_CACHE.set(cacheKey, { time: Date.now(), data: resultData });
  return resultData;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const requestedDate = req.query.date || null;

  try {
    let result = null, usedDate = null;

    if (requestedDate) {
      result   = await fetchIndustryStatewise(requestedDate);
      usedDate = requestedDate;
    } else {
      for (const { year, month } of candidateMonths()) {
        const date = amfiDate(year, month);
        try {
          result = await fetchIndustryStatewise(date);
          if (result) { usedDate = date; break; }
        } catch(e) { continue; }
      }
    }

    if (!result) {
      res.status(503).json({ error: 'AMFI data temporarily unavailable' });
      return;
    }

    const maxAge = requestedDate ? 2592000 : 43200;
    res.setHeader('Cache-Control', `public, s-maxage=${maxAge}, stale-while-revalidate=86400`);
    res.setHeader('X-AMFI-Date', usedDate);
    res.status(200).json(result);

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
