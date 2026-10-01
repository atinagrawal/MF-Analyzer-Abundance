/**
 * app/api/bse-index/route.js
 *
 * GET /api/bse-index?name=BSE%20500%20TRI
 *
 * Given a benchmark/index name (as declared by a PMS strategy, e.g. from
 * APMI's "Benchmark" field via /api/pms-benchmark), finds the matching BSE
 * index and returns its real 1Y/3Y/5Y returns, computed from BSE's own
 * daily historical index data. This exists because our NSE-based index
 * data (index-dashboard.js) has no coverage for strategies benchmarked
 * against a BSE index rather than an NSE one — those previously showed no
 * alpha data at all in the PMS compare modal.
 *
 * Fetch/matching logic lives in lib/bseIndex.js, shared with
 * pages/api/nifty-tri.js (Rolling Returns). See that module for why BSE
 * (not NSE) and the exact endpoints used.
 *
 * Note: BSE does not expose a separately-named "TRI" symbol per index —
 * e.g. "BSE 500" is the closest available series to what APMI strategies
 * call "BSE 500 TRI". Returns computed here are therefore PRICE returns,
 * not a literal Total Return Index. 1Y is an absolute return; 3Y/5Y are
 * CAGR — same convention used everywhere else on the site.
 *
 * Two-layer cache (memory + Blob) for computed returns, keyed by symbol;
 * each refreshes daily (new trading day). The symbol list itself now
 * comes from lib/bseIndex.js's getCachedBseSymbolList() -- a THIRD,
 * R2-backed layer shared with pages/api/nifty-tri.js, kept warm by
 * scripts/sync_bse_index_cache.js on a schedule since api.bseindia.com
 * now 403s this endpoint from Vercel's production IPs (see
 * lib/bseIndex.js's header comment for the full story).
 */

import { NextResponse } from 'next/server';
import { findBseSymbol, fetchBseDailySeries, getCachedBseSymbolList, slugify } from '@/lib/bseIndex';
import { r2Get, r2Put } from '@/lib/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SERIES_TTL_MS = 24 * 60 * 60 * 1000;      // 1 day
const BLOB_BASE = 'bse-index-cache';
const SHARED_SERIES_PRE = 'bse-tri-cache/'; // same key prefix as pages/api/nifty-tri.js + the sync script

const seriesCache = new Map(); // symbol -> { returns, ts }
const inflight = new Map();

function isFresh(ts, ttlMs) {
    return ts && Date.now() - ts < ttlMs;
}

const MONTH_IDX = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };

/**
 * Reads the SAME full-history raw series pages/api/nifty-tri.js and
 * scripts/sync_bse_index_cache.js read/write (bse-tri-cache/{slug}.json),
 * rather than maintaining a second, independently-fetched cache under
 * this route's own bse-index-cache/{symbol}.json -- one shared series
 * cache to keep warm instead of two, and both routes always agree on the
 * same underlying data. Converts its {date: "09 Jul 2026", value} rows
 * into the {date: Date, close} shape computeReturns() expects.
 */
async function readSharedSeries(matchedName) {
    const payload = await r2Get(`${SHARED_SERIES_PRE}${slugify(matchedName)}.json`).catch(() => null);
    if (!payload?.data?.length) return null;
    const rows = payload.data
        .map((r) => {
            const [dd, mon, yy] = r.date.split(' ');
            return { date: new Date(Date.UTC(+yy, MONTH_IDX[mon] ?? 0, +dd)), close: r.value };
        })
        .filter((r) => !isNaN(r.date.getTime()) && typeof r.close === 'number' && r.close > 0)
        .sort((a, b) => a.date - b.date);
    return { rows, ts: payload.ts };
}

/** Closest row at or before targetDate (nearest prior trading day). */
function closestOnOrBefore(rows, targetDate) {
    let best = null;
    for (const r of rows) {
        if (r.date <= targetDate && (!best || r.date > best.date)) best = r;
    }
    return best;
}

function computeReturns(rows) {
    if (!rows.length) return null;
    const latest = rows[rows.length - 1];
    const yearsAgo = n => { const d = new Date(latest.date); d.setFullYear(d.getFullYear() - n); return d; };

    const y1 = closestOnOrBefore(rows, yearsAgo(1));
    const y3 = closestOnOrBefore(rows, yearsAgo(3));
    const y5 = closestOnOrBefore(rows, yearsAgo(5));

    return {
        r1y: y1 ? +(((latest.close / y1.close) - 1) * 100).toFixed(2) : null,
        r3y: y3 ? +((Math.pow(latest.close / y3.close, 1 / 3) - 1) * 100).toFixed(2) : null,
        r5y: y5 ? +((Math.pow(latest.close / y5.close, 1 / 5) - 1) * 100).toFixed(2) : null,
        asOf: latest.date.toISOString().slice(0, 10),
    };
}

async function readFromBlob(symbol) {
    try {
        const payload = await r2Get(`${BLOB_BASE}/${symbol}.json`);
        if (!payload) return null;
        if (!isFresh(payload.ts, SERIES_TTL_MS)) return null;
        return payload;
    } catch (err) {
        console.warn('[bse-index] Blob read error:', err.message);
        return null;
    }
}

async function writeToBlob(symbol, returns) {
    try {
        await r2Put(`${BLOB_BASE}/${symbol}.json`, JSON.stringify({ returns, ts: Date.now() }));
    } catch (err) {
        console.warn('[bse-index] Blob write error:', err.message);
    }
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');
    if (!name) {
        return NextResponse.json({ status: 'error', message: 'Missing name param' }, { status: 400 });
    }

    try {
        const symbolList = await getCachedBseSymbolList({ r2Get, r2Put });
        const matched = findBseSymbol(name, symbolList);
        if (!matched) {
            return NextResponse.json({ status: 'success', matched: false, returns: null });
        }
        const { symbol, name: matchedName } = matched;

        const mem = seriesCache.get(symbol);
        if (isFresh(mem?.ts, SERIES_TTL_MS)) {
            return NextResponse.json({ status: 'success', matched: true, symbol, returns: mem.returns });
        }

        // Primary source: the shared raw-series cache kept warm by the
        // sync script (see this file's header comment) -- checked before
        // this route's own older computed-returns blob, since that one
        // only ever gets populated by organic live traffic hitting the
        // fetch fallback below, which is exactly the path that's now
        // unreliable in production.
        const shared = await readSharedSeries(matchedName).catch((err) => {
            console.warn('[bse-index] Shared series read failed:', err.message);
            return null;
        });
        if (shared?.rows?.length) {
            const returns = computeReturns(shared.rows);
            seriesCache.set(symbol, { returns, ts: shared.ts });
            writeToBlob(symbol, returns); // fire-and-forget, keeps the old cache warm too
            return NextResponse.json({ status: 'success', matched: true, symbol, returns, source: 'shared-cache' });
        }

        const blob = await readFromBlob(symbol);
        if (blob) {
            seriesCache.set(symbol, { returns: blob.returns, ts: blob.ts });
            return NextResponse.json({ status: 'success', matched: true, symbol, returns: blob.returns });
        }

        if (inflight.has(symbol)) {
            const returns = await inflight.get(symbol);
            return NextResponse.json({ status: 'success', matched: true, symbol, returns });
        }

        const fetchPromise = (async () => {
            const to = new Date();
            const from = new Date(); from.setFullYear(from.getFullYear() - 6); // 6y covers 5Y CAGR with margin
            const rows = await fetchBseDailySeries(symbol, { from, to });
            const returns = computeReturns(rows);
            seriesCache.set(symbol, { returns, ts: Date.now() });
            writeToBlob(symbol, returns); // fire-and-forget
            inflight.delete(symbol);
            return returns;
        })();
        inflight.set(symbol, fetchPromise);
        fetchPromise.catch(() => inflight.delete(symbol));

        const returns = await fetchPromise;
        return NextResponse.json({ status: 'success', matched: true, symbol, returns });
    } catch (err) {
        console.error('[bse-index] Route error:', err.message);
        return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
    }
}
