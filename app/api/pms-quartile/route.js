/**
 * app/api/pms-quartile/route.js
 *
 * GET /api/pms-quartile?iaid=233&provider=Abakkus%20Asset%20Manager%20Private%20Limited&strategy=Equity&year=2026&month=6
 *
 * Fetches APMI's peer-quartile ranking for a single Investment Approach (IA)
 * from WSIAConsolidateReport.htm — a distinct report from the bulk
 * /api/pms-data leaderboard and the per-IA /api/pms-benchmark page. For each
 * of six fixed lookback periods (1/2/3/5/7/10 years — this report has no
 * 1M/3M/6M rows) it returns the IA's peer count, its own TWRR, the benchmark
 * return, which quartile it ranked into, and the minimum TWRR that defines
 * each quartile boundary — SEBI/APMI's own methodology, independent of any
 * of our own calculated figures.
 *
 * Three-layer cache, same pattern as /api/pms-data and /api/pms-benchmark.
 * Cache key includes year+month because — unlike a benchmark name, which
 * never changes — quartile rank moves every reporting month.
 */

import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { getApmiProviderId } from '@/lib/apmiProviderMap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MEM_TTL_MS  = 6  * 60 * 60 * 1000;       // 6 hours
const BLOB_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days — APMI publishes monthly
const BLOB_BASE   = 'pms-quartile-cache';

/** @type {Map<string, { data: any[], ts: number }>} */
const memCache = new Map();
/** @type {Map<string, Promise<any[]>>} */
const inflight = new Map();

function isFresh(ts, ttlMs) {
    return ts && Date.now() - ts < ttlMs;
}

function cacheKey(iaid, strategy, year, month) {
    return `${iaid}-${strategy.toLowerCase().replace(/\s+/g, '-')}-${year}-${String(month).padStart(2, '0')}`;
}

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

async function readFromBlob(key) {
    if (!BLOB_TOKEN) return null;
    try {
        const { list } = await import('@vercel/blob');
        const { blobs } = await list({ prefix: `${BLOB_BASE}/${key}.json`, token: BLOB_TOKEN, limit: 1 });
        if (!blobs.length) return null;
        const res = await fetch(blobs[0].downloadUrl || blobs[0].url, {
            headers: { Authorization: `Bearer ${BLOB_TOKEN}`, 'Cache-Control': 'no-store' },
        });
        if (!res.ok) return null;
        const payload = await res.json();
        if (!isFresh(payload.ts, BLOB_TTL_MS)) return null;
        return payload;
    } catch (err) {
        console.warn('[pms-quartile] Blob read error:', err.message);
        return null;
    }
}

async function writeToBlob(key, data) {
    if (!BLOB_TOKEN) return;
    try {
        const { put } = await import('@vercel/blob');
        const payload = JSON.stringify({ data, ts: Date.now() });
        await put(`${BLOB_BASE}/${key}.json`, payload, {
            access: 'private',
            contentType: 'application/json',
            addRandomSuffix: false,
            token: BLOB_TOKEN,
        });
    } catch (err) {
        console.warn('[pms-quartile] Blob write error:', err.message);
    }
}

function lastDayOfMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

/**
 * Parses the six-row quartile <tbody> returned by getWebsiteConsolidateReport.
 * Each row has exactly 8 <td> cells regardless of whether the IA has data for
 * that period (NA text fills the cells instead) — indices below are fixed:
 *   0 period label ("1 Year"/"2 Years"...) · 1 peer count · 2 IA TWRR ·
 *   3 benchmark return · 4 IA quartile label · 5/6/7 quartile-1/2/3 minimum TWRR
 */
export function parseQuartileTable(html) {
    // APMI's response is a bare <tbody> fragment with no enclosing <table>.
    // Verified live: cheerio's HTML5 parser silently drops <tr>/<td> elements
    // that appear outside table context ("foster parenting" per the HTML5
    // spec) — cheerio.load(html) on the raw fragment returns zero <tr>
    // matches even though the tags are right there in the string. Wrapping
    // in <table> before loading fixes it completely (verified against a
    // real APMI response: 0 rows -> 6 rows).
    const $ = cheerio.load(`<table>${html}</table>`);
    const rows = [];
    $('tr').each((_, tr) => {
        const tds = $(tr).find('td');
        if (tds.length < 8) return;
        const periodText = $(tds[0]).text().replace(/\s+/g, ' ').trim(); // "1 Year", "2 Years"...
        const num = parseInt(periodText, 10);
        if (!num) return;
        const asNum = (i) => {
            const t = $(tds[i]).text().trim();
            return t === 'NA' || t === '' ? null : parseFloat(t);
        };
        const quartileText = $(tds[4]).text().trim();
        rows.push({
            period    : `${num}Y`,
            label     : periodText,
            peers     : asNum(1),
            iaTwrr    : asNum(2),
            benchmark : asNum(3),
            quartile  : quartileText === 'NA' || quartileText === '' ? null : quartileText,
            q1Min     : asNum(5),
            q2Min     : asNum(6),
            q3Min     : asNum(7),
        });
    });
    return rows;
}

async function fetchQuartile(iaid, providerId, strategy, year, month) {
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
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'Mozilla/5.0',
            Referer: 'https://www.apmiindia.org/',
        },
        body: params.toString(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(`APMI responded ${res.status}`);
    const html = await res.text();
    return parseQuartileTable(html);
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const iaid     = searchParams.get('iaid');
    const provider = searchParams.get('provider');
    const strategy = searchParams.get('strategy') || 'Equity';
    const year     = parseInt(searchParams.get('year'), 10);
    const month    = parseInt(searchParams.get('month'), 10);

    if (!iaid || !provider || !year || !month) {
        return NextResponse.json({ status: 'error', message: 'Missing iaid, provider, year, or month' }, { status: 400 });
    }

    try {
        const providerId = await getApmiProviderId(provider);
        if (!providerId) {
            return NextResponse.json({ status: 'success', data: null, reason: 'provider not found in APMI registry' });
        }

        const key = cacheKey(iaid, strategy, year, month);

        const mem = memCache.get(key);
        if (isFresh(mem?.ts, MEM_TTL_MS)) return ok(mem.data, 'memory');

        const blob = await readFromBlob(key);
        if (blob) {
            memCache.set(key, { data: blob.data, ts: blob.ts });
            return ok(blob.data, 'blob');
        }

        if (inflight.has(key)) return ok(await inflight.get(key), 'dedup');

        const fetchPromise = (async () => {
            const data = await fetchQuartile(iaid, providerId, strategy, year, month);
            const ts = Date.now();
            memCache.set(key, { data, ts });
            writeToBlob(key, data); // fire-and-forget
            inflight.delete(key);
            return data;
        })();
        inflight.set(key, fetchPromise);
        fetchPromise.catch(() => inflight.delete(key));

        const data = await fetchPromise;
        return ok(data, 'live');
    } catch (err) {
        console.error('[pms-quartile] Route error:', err.message);
        return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
    }
}

function ok(data, source) {
    return NextResponse.json(
        { status: 'success', data, source },
        { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=2592000' } }
    );
}
