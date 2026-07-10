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
 * Two-layer cache (memory + Blob): the symbol list rarely changes (30-day
 * TTL, cached in lib/bseIndex.js's caller-side memory below); each
 * index's computed returns refresh daily (new trading day).
 */

import { NextResponse } from 'next/server';
import { fetchBseSymbolList, findBseSymbol, fetchBseDailySeries } from '@/lib/bseIndex';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYMBOL_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SERIES_TTL_MS = 24 * 60 * 60 * 1000;      // 1 day
const BLOB_BASE = 'bse-index-cache';
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

let symbolListCache = null; // { list, ts }
const seriesCache = new Map(); // symbol -> { returns, ts }
const inflight = new Map();

function isFresh(ts, ttlMs) {
    return ts && Date.now() - ts < ttlMs;
}

async function getSymbolList() {
    if (isFresh(symbolListCache?.ts, SYMBOL_TTL_MS)) return symbolListCache.list;
    const list = await fetchBseSymbolList();
    symbolListCache = { list, ts: Date.now() };
    return list;
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
    if (!BLOB_TOKEN) return null;
    try {
        const { list } = await import('@vercel/blob');
        const { blobs } = await list({ prefix: `${BLOB_BASE}/${symbol}.json`, token: BLOB_TOKEN, limit: 1 });
        if (!blobs.length) return null;
        const res = await fetch(blobs[0].downloadUrl || blobs[0].url, {
            headers: { Authorization: `Bearer ${BLOB_TOKEN}`, 'Cache-Control': 'no-store' },
        });
        if (!res.ok) return null;
        const payload = await res.json();
        if (!isFresh(payload.ts, SERIES_TTL_MS)) return null;
        return payload;
    } catch (err) {
        console.warn('[bse-index] Blob read error:', err.message);
        return null;
    }
}

async function writeToBlob(symbol, returns) {
    if (!BLOB_TOKEN) return;
    try {
        const { put } = await import('@vercel/blob');
        await put(`${BLOB_BASE}/${symbol}.json`, JSON.stringify({ returns, ts: Date.now() }), {
            access: 'private',
            contentType: 'application/json',
            addRandomSuffix: false,
            token: BLOB_TOKEN,
        });
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
        const symbolList = await getSymbolList();
        const matched = findBseSymbol(name, symbolList);
        if (!matched) {
            return NextResponse.json({ status: 'success', matched: false, returns: null });
        }
        const { symbol } = matched;

        const mem = seriesCache.get(symbol);
        if (isFresh(mem?.ts, SERIES_TTL_MS)) {
            return NextResponse.json({ status: 'success', matched: true, symbol, returns: mem.returns });
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
