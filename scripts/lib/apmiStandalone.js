/**
 * scripts/lib/apmiStandalone.js
 *
 * Standalone (no Next.js `@/` path alias needed) equivalents of
 * lib/pmsDetailsCache.js, lib/pmsPeriodHistoryCache.js,
 * lib/pmsQuartileCache.js, and lib/apmiProviderMap.js -- see
 * scripts/compute_preferred_pms.js's Global Constraints comment for why
 * those four files can't be imported from a plain Node script.
 *
 * Reuses the EXACT SAME R2 cache key namespaces those four files write to
 * (pms-details-cache/, pms-period-history-cache/, pms-quartile-cache/,
 * pms-provider-map/) so this script's reads/writes stay shared with the
 * live app's own runtime caches -- a strategy already visited via
 * /pms/[id] is often already warm here, and anything this script fetches
 * warms the cache for the next live visitor too.
 *
 * r2Get/r2Put and fetchPmsDetails/fetchPmsMonthSnapshot are passed in by
 * the caller (which already dynamically imported lib/r2.js and
 * lib/pmsScrapers.js -- both alias-free, safe to import directly) rather
 * than imported here, so this file stays plain CommonJS.
 */

const cheerio = require('cheerio');

const DETAILS_TTL_MS = 90 * 24 * 60 * 60 * 1000;  // matches lib/pmsDetailsCache.js
const PROVIDER_MAP_TTL_MS = 90 * 24 * 60 * 60 * 1000; // matches lib/apmiProviderMap.js
const QUARTILE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // matches lib/pmsQuartileCache.js

// ── PMS details (fees, AUM, iaName, providerName, strategyName-as-category) ─
async function getPmsDetailsStandalone(iaid, { r2Get, r2Put, fetchPmsDetails }) {
  const key = `pms-details-cache/${iaid}.json`;
  try {
    const cached = await r2Get(key);
    if (cached?.ts && Date.now() - cached.ts < DETAILS_TTL_MS) return cached.data;
  } catch (err) {
    console.warn(`[apmiStandalone] R2 read failed for ${key}: ${err.message}`);
  }
  const data = await fetchPmsDetails(iaid);
  if (data) {
    try {
      await r2Put(key, JSON.stringify({ data, ts: Date.now() }));
    } catch (err) {
      console.warn(`[apmiStandalone] R2 write failed for ${key}: ${err.message}`);
    }
  }
  return data;
}

const MONTH_ABBR_LOCAL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// "Aug-2026" -> 202608 (comparable integer). Returns 0 for an unparseable value.
function monthRank(asOnMonth) {
  const [abbr, yearStr] = String(asOnMonth || '').split('-');
  const mi = MONTH_ABBR_LOCAL.indexOf(abbr);
  const yr = parseInt(yearStr, 10);
  return mi >= 0 && Number.isFinite(yr) ? yr * 100 + (mi + 1) : 0;
}

// ── Latest month's IA-vs-benchmark snapshot (for the "best alpha" insight
// and for identifying which year/month to ask the quartile endpoint about).
// Deliberately does NOT do lib/pmsPeriodHistoryCache.js's full ~40-month
// backfill -- only one snapshot is needed here, and writing a partial
// series into that cache key would corrupt it for the live app (which
// expects the FULL history back to EARLIEST_YEAR/EARLIEST_MONTH).
//
// `targetMonth` ({ year, month } 1-indexed) is the run's single canonical
// as-on month -- passing it keeps every strategy on the SAME reporting
// month instead of whatever each one's period-history cache tail happens
// to hold (that cache has no TTL and only grows on live /pms/[id] visits,
// so a rarely-visited strategy can lag months behind a popular one). The
// cache tail is still used when it already IS the target month (zero live
// APMI traffic); otherwise the target month is live-fetched (without
// persisting to that key), walking back up to 3 months if the strategy
// hasn't published the target month yet.
async function getLatestMonthSnapshotStandalone(iaid, { r2Get, fetchPmsMonthSnapshot }, targetMonth = null) {
  let cachedTail = null;
  try {
    const cached = await r2Get(`pms-period-history-cache/${iaid}.json`);
    if (cached?.data?.length > 0) cachedTail = cached.data[cached.data.length - 1];
  } catch (err) {
    console.warn(`[apmiStandalone] R2 read failed for period-history/${iaid}: ${err.message}`);
  }

  if (!targetMonth) {
    if (cachedTail) return cachedTail;
  } else {
    const targetRank = targetMonth.year * 100 + targetMonth.month;
    if (cachedTail && monthRank(cachedTail.asOnMonth) >= targetRank) return cachedTail;
  }

  const anchor = targetMonth
    ? new Date(targetMonth.year, targetMonth.month - 1, 1)
    : new Date();
  for (let back = 0; back < 4; back++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - back, 1);
    try {
      const snap = await fetchPmsMonthSnapshot(iaid, d.getFullYear(), d.getMonth() + 1);
      if (snap) return snap;
    } catch (err) {
      // No data published for this month yet -- keep walking back.
    }
  }
  return cachedTail; // last resort: a stale tail beats nothing
}

// ── Provider display name -> APMI's numeric pmsProvider ID ─────────────────
function normalizeProviderName(name) {
  return String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function parseProviderMap(html) {
  const selectMatch = html.match(/<select[^>]*id="pmsProvideNames"[\s\S]*?<\/select>/i);
  if (!selectMatch) throw new Error('pmsProvideNames select not found in APMI response');
  const optionRe = /<option\s+value="(\d+)"[^>]*>([^<]*)<\/option>/g;
  const map = {};
  let m;
  while ((m = optionRe.exec(selectMatch[0]))) {
    const id = Number(m[1]);
    const name = m[2].trim();
    if (id && name) map[normalizeProviderName(name)] = id;
  }
  return map;
}

async function getApmiProviderIdStandalone(providerName, { r2Get, r2Put }) {
  const key = 'pms-provider-map/map.json';
  let map = null;
  try {
    const cached = await r2Get(key);
    if (cached?.ts && Date.now() - cached.ts < PROVIDER_MAP_TTL_MS) map = cached.map;
  } catch (err) {
    console.warn(`[apmiStandalone] R2 read failed for provider map: ${err.message}`);
  }
  if (!map) {
    const res = await fetch('https://www.apmiindia.org/apmi/WSIAConsolidateReport.htm?action=showReportMenu', {
      headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.apmiindia.org/' },
    });
    if (!res.ok) throw new Error(`APMI provider map responded ${res.status}`);
    map = parseProviderMap(await res.text());
    try {
      await r2Put(key, JSON.stringify({ map, ts: Date.now() }));
    } catch (err) {
      console.warn(`[apmiStandalone] R2 write failed for provider map: ${err.message}`);
    }
  }
  return map[normalizeProviderName(providerName)] ?? null;
}

// ── Quartile table for one IAID/strategy-category/year/month ───────────────
function lastDayOfMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function parseQuartileTable(html) {
  // Bare <tbody> fragment -- must wrap in <table> or cheerio silently
  // drops the <tr>/<td> elements (HTML5 "foster parenting"). Row shape
  // (including q1Min/q2Min/q3Min from tds 5/6/7) must stay byte-identical
  // to lib/pmsQuartileCache.js's own parseQuartileTable: both write the
  // SAME pms-quartile-cache/ R2 key, so a narrower object here would be
  // served by the live app for up to QUARTILE_TTL_MS after a
  // script-initiated cache miss.
  const $ = cheerio.load(`<table>${html}</table>`);
  const rows = [];
  $('tr').each((_, tr) => {
    const tds = $(tr).find('td');
    if (tds.length < 8) return;
    const periodText = $(tds[0]).text().replace(/\s+/g, ' ').trim();
    const num = parseInt(periodText, 10);
    if (!num) return;
    const asNum = (i) => {
      const t = $(tds[i]).text().trim();
      return t === 'NA' || t === '' ? null : parseFloat(t);
    };
    const quartileText = $(tds[4]).text().trim();
    rows.push({
      period: `${num}Y`,
      label: periodText,
      peers: asNum(1),
      iaTwrr: asNum(2),
      benchmark: asNum(3),
      quartile: quartileText === 'NA' || quartileText === '' ? null : quartileText,
      q1Min: asNum(5),
      q2Min: asNum(6),
      q3Min: asNum(7),
    });
  });
  return rows;
}

async function getPmsQuartileStandalone(iaid, providerName, strategy, year, month, { r2Get, r2Put }) {
  const providerId = await getApmiProviderIdStandalone(providerName, { r2Get, r2Put });
  if (!providerId) return null;

  const key = `pms-quartile-cache/${iaid}-${strategy.toLowerCase().replace(/\s+/g, '-')}-${year}-${String(month).padStart(2, '0')}.json`;
  try {
    const cached = await r2Get(key);
    if (cached?.ts && Date.now() - cached.ts < QUARTILE_TTL_MS) return cached.data;
  } catch (err) {
    console.warn(`[apmiStandalone] R2 read failed for ${key}: ${err.message}`);
  }

  const asOnDate = `${year}-${month}-${lastDayOfMonth(year, month)}`;
  const params = new URLSearchParams();
  params.append('strategy', strategy);
  params.append('pmsProvider', String(providerId));
  params.append('iaName', String(iaid));
  params.append('fromMonth', String(month).padStart(2, '0'));
  params.append('fromYears', String(year));
  params.append('asOnDate', asOnDate);

  const res = await fetch('https://www.apmiindia.org/apmi/WSIAConsolidateReport.htm?action=getWebsiteConsolidateReport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.apmiindia.org/' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`APMI quartile responded ${res.status}`);
  const data = parseQuartileTable(await res.text());
  try {
    await r2Put(key, JSON.stringify({ data, ts: Date.now() }));
  } catch (err) {
    console.warn(`[apmiStandalone] R2 write failed for ${key}: ${err.message}`);
  }
  return data;
}

module.exports = {
  getPmsDetailsStandalone,
  getLatestMonthSnapshotStandalone,
  getApmiProviderIdStandalone,
  getPmsQuartileStandalone,
  parseProviderMap,
  parseQuartileTable,
};
