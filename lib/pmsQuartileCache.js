/**
 * lib/pmsQuartileCache.js
 *
 * Fetches and caches APMI's peer-quartile ranking for a single Investment
 * Approach from WSIAConsolidateReport.htm. Logic moved here verbatim from
 * app/api/pms-quartile/route.js (now a thin wrapper around this file) so
 * app/api/pms-detail/[id]/route.js (Task 4) can call getPmsQuartileCached()
 * directly, in-process -- same reasoning as lib/pmsDetailsCache.js's header
 * comment: no route.js may import another route.js in this codebase.
 */

import * as cheerio from 'cheerio';
import { getApmiProviderId } from '@/lib/apmiProviderMap';
import { r2Get, r2Put } from '@/lib/r2';

const MEM_TTL_MS  = 6  * 60 * 60 * 1000;       // 6 hours
const BLOB_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days -- APMI publishes monthly
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

async function readFromBlob(key) {
    try {
        const payload = await r2Get(`${BLOB_BASE}/${key}.json`);
        if (!payload) return null;
        if (!isFresh(payload.ts, BLOB_TTL_MS)) return null;
        return payload;
    } catch (err) {
        console.warn('[pmsQuartileCache] Blob read error:', err.message);
        return null;
    }
}

async function writeToBlob(key, data) {
    try {
        await r2Put(`${BLOB_BASE}/${key}.json`, JSON.stringify({ data, ts: Date.now() }));
    } catch (err) {
        console.warn('[pmsQuartileCache] Blob write error:', err.message);
    }
}

function lastDayOfMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

/**
 * Parses the six-row quartile <tbody> returned by getWebsiteConsolidateReport.
 * Each row has exactly 8 <td> cells regardless of whether the IA has data for
 * that period (NA text fills the cells instead) -- indices below are fixed:
 *   0 period label ("1 Year"/"2 Years"...) · 1 peer count · 2 IA TWRR ·
 *   3 benchmark return · 4 IA quartile label · 5/6/7 quartile-1/2/3 minimum TWRR
 */
export function parseQuartileTable(html) {
    // APMI's response is a bare <tbody> fragment with no enclosing <table>.
    // Verified live: cheerio's HTML5 parser silently drops <tr>/<td> elements
    // that appear outside table context ("foster parenting" per the HTML5
    // spec) -- cheerio.load(html) on the raw fragment returns zero <tr>
    // matches even though the tags are right there in the string. Wrapping
    // in <table> before loading fixes it completely.
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

export async function getPmsQuartileCached(iaid, provider, strategy, year, month) {
    const providerId = await getApmiProviderId(provider);
    if (!providerId) return null;

    const key = cacheKey(iaid, strategy, year, month);

    const mem = memCache.get(key);
    if (isFresh(mem?.ts, MEM_TTL_MS)) return mem.data;

    const blob = await readFromBlob(key);
    if (blob) {
        memCache.set(key, { data: blob.data, ts: blob.ts });
        return blob.data;
    }

    if (inflight.has(key)) return inflight.get(key);

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

    return fetchPromise;
}
