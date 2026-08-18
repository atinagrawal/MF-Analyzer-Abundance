/**
 * app/api/market-holidays/route.js
 *
 * GET /api/market-holidays
 * Response: { holidays: ['YYYY-MM-DD', ...] }
 *
 * Thin, long-cached wrapper around the same NSE holiday-master call
 * app/api/market-watch/route.js already makes -- split out separately
 * because components/ClosingBell.jsx needs to load this on EVERY page
 * site-wide, and market-watch's full payload (live indices, gainers/
 * losers, FII/DII) is much heavier than this needs, with a much shorter
 * (5-min) TTL than this basically-static list warrants.
 *
 * Fails loose: if both the live NSE fetch AND the stale cache fallback
 * come up empty, this still returns 200 with an empty holidays array
 * (never an error status) -- an empty list still lets the client's
 * isTradingDay() correctly treat ordinary weekdays as trading days, it
 * just won't know about a specific holiday today. See
 * docs/superpowers/specs/2026-08-19-closing-bell-design.md's Data source
 * section for why this is the deliberate choice over failing closed.
 */

import { r2Get, r2Put } from '@/lib/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BLOB_KEY = 'market-holidays/latest.json';
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours -- this list is published once a year

const H = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.nseindia.com/',
  'Accept-Language': 'en-IN,en;q=0.9',
};

const MONTHS = { Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06', Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12' };

// NSE's tradingDate field is 'DD-Mon-YYYY' (e.g. '26-Jan-2026') -- convert
// to 'YYYY-MM-DD' server-side so the client can match it against
// lib/closingBell.js's computeIstNow() output with plain string equality,
// no date-format parsing on the client at all.
function toIsoDate(nseDate) {
  const parts = (nseDate || '').split('-');
  if (parts.length !== 3) return null;
  const [dd, mon, yyyy] = parts;
  const mm = MONTHS[mon];
  if (!mm || !/^\d{1,2}$/.test(dd) || !/^\d{4}$/.test(yyyy)) return null;
  return `${yyyy}-${mm}-${dd.padStart(2, '0')}`;
}

async function fetchHolidays() {
  const res = await fetch('https://www.nseindia.com/api/holiday-master?type=trading', {
    headers: H,
    signal: AbortSignal.timeout(14_000),
  });
  if (!res.ok) throw new Error(`NSE holiday-master returned ${res.status}`);
  const data = await res.json();
  const holidays = (data.CM || [])
    .map(h => toIsoDate(h.tradingDate))
    .filter(Boolean);
  return { holidays, cached_at: new Date().toISOString() };
}

async function blobGet() {
  try { return await r2Get(BLOB_KEY); } catch { return null; }
}

async function blobPut(payload) {
  try { await r2Put(BLOB_KEY, JSON.stringify(payload)); } catch {}
}

export async function GET(req) {
  const bust = new URL(req.url).searchParams.has('bust');

  if (!bust) {
    const cached = await blobGet();
    if (cached?.cached_at && (Date.now() - new Date(cached.cached_at).getTime()) < TTL_MS) {
      return Response.json({ holidays: cached.holidays }, { headers: { 'X-Cache': 'HIT', 'Cache-Control': 'no-store' } });
    }
  }

  try {
    const data = await fetchHolidays();
    blobPut(data);
    return Response.json({ holidays: data.holidays }, { headers: { 'X-Cache': 'MISS', 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[market-holidays]', err.name, err.message);
    const stale = await blobGet();
    if (stale) {
      return Response.json({ holidays: stale.holidays }, { headers: { 'X-Cache': 'STALE', 'Cache-Control': 'no-store' } });
    }
    return Response.json({ holidays: [] }, { headers: { 'X-Cache': 'MISS-EMPTY', 'Cache-Control': 'no-store' } });
  }
}
