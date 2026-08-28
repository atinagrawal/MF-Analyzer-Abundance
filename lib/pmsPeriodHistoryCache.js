/**
 * lib/pmsPeriodHistoryCache.js
 *
 * Returns the full April-2023-to-latest monthly period-wise performance
 * series for one Investment Approach. First call for an IAID with no
 * cache: walks every month sequentially (~40 requests at time of writing,
 * growing by one per month) with a small delay between each, then caches
 * the whole array in R2 PERMANENTLY -- past months' figures never change.
 * Every later call only fetches whatever new month(s) aren't cached yet.
 * Same three-layer cache shape as app/api/pms-benchmark/route.js, but
 * with no blob TTL expiry (extension, not re-fetch, keeps it current).
 *
 * getPmsPeriodHistoryCached() is exported as a plain lib function (see
 * lib/pmsDetailsCache.js's header comment for why) so both this file's own
 * route wrapper and app/api/pms-detail/[id]/route.js (Task 4) can call it
 * directly, in-process.
 */

import { fetchPmsMonthSnapshot, monthsFrom, MONTH_ABBR, EARLIEST_YEAR, EARLIEST_MONTH } from '@/lib/pmsScrapers';
import { r2Get, r2Put } from '@/lib/r2';

const MEM_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const BLOB_BASE = 'pms-period-history-cache';
const FETCH_DELAY_MS = 200; // be a good citizen of APMI's servers during a multi-month backfill

/** @type {Map<string, { data: Array<object>, ts: number }>} */
const memCache = new Map();
/** @type {Map<string, Promise<Array<object>>>} */
const inflight = new Map();

function isFresh(ts, ttlMs) {
  return ts && Date.now() - ts < ttlMs;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readFromBlob(iaid) {
  try {
    return await r2Get(`${BLOB_BASE}/${iaid}.json`);
  } catch (err) {
    console.warn('[pmsPeriodHistoryCache] Blob read error:', err.message);
    return null;
  }
}

async function writeToBlob(iaid, data) {
  try {
    await r2Put(`${BLOB_BASE}/${iaid}.json`, JSON.stringify({ data, ts: Date.now() }));
  } catch (err) {
    console.warn('[pmsPeriodHistoryCache] Blob write error:', err.message);
  }
}

async function fetchMonthsSequentially(iaid, months, existing) {
  const snapshots = [];
  try {
    for (const { year, month } of months) {
      const snap = await fetchPmsMonthSnapshot(iaid, year, month);
      if (snap) snapshots.push(snap);
      await sleep(FETCH_DELAY_MS);
    }
  } catch (err) {
    // On any fetch error, checkpoint partial progress to blob before rethrowing.
    // This allows the next request to resume from the partial progress rather than
    // losing everything. Only write if we collected at least one month.
    if (snapshots.length > 0) {
      const partialData = [...existing, ...snapshots];
      writeToBlob(iaid, partialData); // fire-and-forget, no await
    }
    throw err;
  }
  return snapshots;
}

function parseAsOnMonth(asOnMonth) {
  const [abbr, yearStr] = asOnMonth.split('-');
  return { year: parseInt(yearStr, 10), month: MONTH_ABBR.indexOf(abbr) + 1 };
}

/**
 * Full backfill (no cache yet) or incremental extend (cache exists but is
 * missing the current reporting month) -- either way returns the complete,
 * up-to-date array.
 */
async function backfillOrExtend(iaid, existing) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (!existing.length) {
    const months = monthsFrom(EARLIEST_YEAR, EARLIEST_MONTH, currentYear, currentMonth);
    return fetchMonthsSequentially(iaid, months, []);
  }

  const { year: lastYear, month: lastMonth } = parseAsOnMonth(existing[existing.length - 1].asOnMonth);
  if (lastYear === currentYear && lastMonth === currentMonth) return existing; // already current

  const nextMonth = lastMonth === 12 ? 1 : lastMonth + 1;
  const nextYear = lastMonth === 12 ? lastYear + 1 : lastYear;
  const missingMonths = monthsFrom(nextYear, nextMonth, currentYear, currentMonth);
  const extra = await fetchMonthsSequentially(iaid, missingMonths, existing);
  return [...existing, ...extra];
}

export async function getPmsPeriodHistoryCached(iaid) {
  const key = String(iaid);

  const mem = memCache.get(key);
  if (isFresh(mem?.ts, MEM_TTL_MS)) return mem.data;

  if (inflight.has(key)) return inflight.get(key);

  const fetchPromise = (async () => {
    const blob = await readFromBlob(key);
    const existing = blob?.data || [];
    const data = await backfillOrExtend(key, existing);
    const ts = Date.now();
    memCache.set(key, { data, ts });
    if (data.length !== existing.length) writeToBlob(key, data); // only write if it actually grew
    inflight.delete(key);
    return data;
  })();
  inflight.set(key, fetchPromise);
  fetchPromise.catch(() => inflight.delete(key));

  return fetchPromise;
}

/** Exposed for the route's stale-on-error fallback. */
export async function getStalePmsPeriodHistory(iaid) {
  const mem = memCache.get(String(iaid));
  if (mem) return mem.data;
  const blobStale = await r2Get(`${BLOB_BASE}/${iaid}.json`).catch(() => null);
  return blobStale ? blobStale.data : [];
}
