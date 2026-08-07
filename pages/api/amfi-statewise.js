// pages/api/amfi-statewise.js
// Returns state-wise AUM data from AMFI aggregated across all AMCs for true industry totals.
// Data is cached in PostgreSQL — AMFI publishes monthly data between 7th–20th of each month.
// Cache strategy:
//   - Before 20th of the current month → check if current month data is in cache; if yes serve it
//   - Between 7th and 20th → try to fetch current month from AMFI, store if found
//   - After 20th → serve current month cached data as authoritative until next month's window
//   - DB cache never expires until superseded by a newer month's data

import https from 'https';
import zlib from 'zlib';
import pool from '@/lib/db';

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

// ── DB Cache ─────────────────────────────────────────────────────────────────

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS amfi_statewise_cache (
      id          SERIAL PRIMARY KEY,
      data_month  CHAR(7)    NOT NULL UNIQUE,  -- e.g. '2026-06'
      amfi_date   VARCHAR(20) NOT NULL,         -- e.g. '01-Jun-2026'
      payload     JSONB      NOT NULL,
      fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getCachedMonth(dataMonth) {
  try {
    const { rows } = await pool.query(
      'SELECT payload, amfi_date, fetched_at FROM amfi_statewise_cache WHERE data_month = $1',
      [dataMonth]
    );
    return rows[0] || null;
  } catch { return null; }
}

async function upsertCache(dataMonth, amfiDate, payload) {
  try {
    await pool.query(`
      INSERT INTO amfi_statewise_cache (data_month, amfi_date, payload, fetched_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (data_month) DO UPDATE
        SET payload    = EXCLUDED.payload,
            amfi_date  = EXCLUDED.amfi_date,
            fetched_at = NOW()
    `, [dataMonth, amfiDate, JSON.stringify(payload)]);
  } catch (e) {
    console.error('[amfi-statewise] Failed to cache to DB:', e.message);
  }
}

// ── Month logic ───────────────────────────────────────────────────────────────
// Returns a list of {year, month, dataMonth} to probe for, freshest first.
// dataMonth is the YYYY-MM key used in the DB and for display.
function candidatePeriods() {
  const now = new Date();
  const day  = now.getUTCDate();
  const mon  = now.getUTCMonth() + 1; // 1-12
  const year = now.getUTCFullYear();

  // Between 7th and 20th = "fetch window": try current month first, then fall back
  // Outside that window: last month is most recent complete data
  const out = [];
  // Always probe up to 4 months back to find available data
  for (let offset = 1; offset <= 4; offset++) {
    let m = mon - offset, y = year;
    while (m <= 0) { m += 12; y--; }
    out.push({ year: y, month: m, dataMonth: `${y}-${String(m).padStart(2,'0')}` });
  }
  return out;
}

// Within fetch window: true between 7th–21st of current month
function isInFetchWindow() {
  const d = new Date().getUTCDate();
  return d >= 7 && d <= 21;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function httpGetJson(url) {
  return new Promise((resolve) => {
    const req = https.request(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Referer': 'https://www.amfiindia.com/'
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
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
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

function r2(v) { return Math.round((v || 0) * 100) / 100; }

// ── Full AMFI fetch (all AMCs) ────────────────────────────────────────────────

async function fetchFromAMFI(date) {
  const amcIds = await getAmcIds();
  
  const firstAmcData = await fetchWithRetry(
    `https://www.amfiindia.com/api/statewise-data?MF_ID=${amcIds[0]}&date=${date}`, 2, 200
  );
  if (!firstAmcData || !Array.isArray(firstAmcData.data) || !firstAmcData.data.length) {
    return null;
  }

  const availableMonths = (firstAmcData.monthYear || [])
    .map(m => (typeof m === 'string' ? m : m.date || ''))
    .filter(Boolean);

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
          GrowthEquityOrientedSchemes: 0, BalancedSchemes: 0,
          OtherDebtOrientedSchemes: 0, LiquidSchemes: 0,
          GoldExchangeTradedFund: 0, OtherExchangeTradedFund: 0,
          FOFInvestionOverseas: 0, FOFInvestingDomestic: 0, Total: 0,
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
    const equity        = r2(equitySchemes + balanced);
    const debt          = r2(otherDebt + liquid);
    const etf           = r2(goldETF + otherETF);
    const fof           = r2(fofOverseas + fofDomestic);
    const total         = r2(s.Total);
    const sharePct      = grandTotal > 0 ? Math.round(total  / grandTotal * 10000) / 100 : 0;
    const equityPct     = total > 0      ? Math.round(equity / total      * 1000)  / 10  : 0;
    return {
      state: s.state, total, equity, debt, etf, fof, liquid,
      sharePct, equityPct, equitySchemes, balanced, otherDebt,
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

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  await ensureTable().catch(() => {});

  const requestedDate = req.query.date || null;
  const forceRefresh  = req.query.refresh === '1';

  try {
    // ── Historical date explicitly requested ─────────────────────────────────
    if (requestedDate) {
      // Parse into YYYY-MM for DB lookup
      const parts = requestedDate.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
      if (parts) {
        const [, , mon, yr] = parts;
        const monthNum = MONTHS.findIndex(m => m === mon) + 1;
        const dataMonth = `${yr}-${String(monthNum).padStart(2, '0')}`;

        const cached = await getCachedMonth(dataMonth);
        if (cached && !forceRefresh) {
          res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=86400');
          res.setHeader('X-AMFI-Date', cached.amfi_date);
          res.setHeader('X-Cache', 'DB-HIT');
          return res.status(200).json(cached.payload);
        }
      }

      const result = await fetchFromAMFI(requestedDate);
      if (!result) { res.status(503).json({ error: 'AMFI data unavailable for requested date' }); return; }

      // Cache it
      if (parts) {
        const [, , mon, yr] = parts;
        const monthNum = MONTHS.findIndex(m => m === mon) + 1;
        await upsertCache(`${yr}-${String(monthNum).padStart(2,'0')}`, requestedDate, result);
      }

      res.setHeader('Cache-Control', 'public, s-maxage=2592000, stale-while-revalidate=86400');
      res.setHeader('X-AMFI-Date', requestedDate);
      res.setHeader('X-Cache', 'AMFI-FRESH');
      return res.status(200).json(result);
    }

    // ── Auto-discover latest data ─────────────────────────────────────────────
    const periods = candidatePeriods();
    const inFetchWindow = isInFetchWindow();

    // 1. Always try DB cache first — serve current/recent month if available
    for (const { dataMonth, year, month } of periods) {
      const cached = await getCachedMonth(dataMonth);
      if (cached) {
        // If we're in the fetch window for the *current* calendar month and this is
        // the most recent cached month, re-fetch from AMFI in background to pick up
        // any new data, but still serve the cached response immediately.
        const now = new Date();
        const currentDataMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth()).padStart(2,'0')}`; // prev month
        const isNewest = dataMonth === periods[0].dataMonth;

        if (inFetchWindow && isNewest && !forceRefresh) {
          // Check if we've already refreshed today
          const fetchedAt = new Date(cached.fetched_at);
          const hoursSinceFetch = (Date.now() - fetchedAt.getTime()) / 3600000;
          if (hoursSinceFetch > 12) {
            // Try next month from AMFI in background (don't await)
            const nextDate = amfiDate(periods[0].year, periods[0].month);
            // Check if a newer month exists: try the period before periods[0]
            const nowDate = new Date();
            const curMon = nowDate.getUTCMonth() + 1;
            const curYear = nowDate.getUTCFullYear();
            let tryMon = curMon - 1, tryYear = curYear;
            if (tryMon <= 0) { tryMon += 12; tryYear--; }
            const tryDataMonth = `${tryYear}-${String(tryMon).padStart(2,'0')}`;
            if (tryDataMonth !== dataMonth) {
              const tryAmfiDate = amfiDate(tryYear, tryMon);
              fetchFromAMFI(tryAmfiDate).then(async fresh => {
                if (fresh) await upsertCache(tryDataMonth, tryAmfiDate, fresh);
              }).catch(() => {});
            }
          }
        }

        res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
        res.setHeader('X-AMFI-Date', cached.amfi_date);
        res.setHeader('X-Cache', `DB-HIT:${dataMonth}`);
        return res.status(200).json(cached.payload);
      }
    }

    // 2. Nothing in DB — fetch from AMFI (first load or DB wipe)
    let result = null, usedDate = null, usedDataMonth = null;
    for (const { year, month, dataMonth } of periods) {
      const d = amfiDate(year, month);
      try {
        result = await fetchFromAMFI(d);
        if (result) { usedDate = d; usedDataMonth = dataMonth; break; }
      } catch(e) { continue; }
    }

    if (!result) {
      res.status(503).json({ error: 'AMFI data temporarily unavailable' });
      return;
    }

    // Persist to DB
    await upsertCache(usedDataMonth, usedDate, result);

    res.setHeader('Cache-Control', 'public, s-maxage=43200, stale-while-revalidate=86400');
    res.setHeader('X-AMFI-Date', usedDate);
    res.setHeader('X-Cache', 'AMFI-FRESH');
    res.status(200).json(result);

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}
