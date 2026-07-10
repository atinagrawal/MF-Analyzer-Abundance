// pages/api/nifty-tri.js
//
// GET /api/nifty-tri?index=NIFTY%2050
//
// Serves daily index history for the Rolling Returns page. Route path and
// response shape (`{ index, data: [{ date: "09 Jul 2026", value }] }`) are
// unchanged from the original — only the backend source changed, so
// app/rolling/page.js's fetchBenchmark() needed no changes.
//
// Previously scraped niftyindices.com via a session-cookie flow that
// stopped working (the site no longer issues a session cookie on a plain
// GET, and the data endpoint now redirects to a real Sitefinity login —
// see the investigation in this session's history). Rebuilt on BSE's
// public index API instead (see lib/bseIndex.js for why BSE, not NSE,
// and the exact endpoints). BSE returns FULL history since each index's
// inception in a single request (verified: BSE SENSEX back to 1979,
// 11,000+ daily rows, ~3.5s) — no incremental gap-fetching or batch
// backfill needed, unlike the old implementation.
//
// Note: the requested "index" name is matched against BSE's own index
// list (app/rolling/page.js's ALL_INDICES now lists real BSE index names
// — see that file for the mapping from the old NIFTY-branded list). Data
// is a PRICE index, not a literal Total Return Index (BSE has no
// separately-named TRI symbol per index) — same caveat as the BSE data
// used elsewhere on the site.

import { fetchBseSymbolList, findBseSymbol, fetchBseDailySeries } from '../../lib/bseIndex';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const CACHE_PRE = 'bse-tri-cache/';
const SYMBOL_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SERIES_TTL_MS = 24 * 60 * 60 * 1000;      // 1 day
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

function isFresh(ts, ttlMs) {
    return ts && Date.now() - ts < ttlMs;
}

function fmtDisplayDate(d) {
    return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

let symbolListCache = null; // { list, ts }
const seriesCache = new Map(); // symbol -> { data, ts }
const inflight = new Map();

async function getSymbolList() {
    if (isFresh(symbolListCache?.ts, SYMBOL_TTL_MS)) return symbolListCache.list;
    const list = await fetchBseSymbolList();
    symbolListCache = { list, ts: Date.now() };
    return list;
}

async function blobGet(slugName) {
    if (!BLOB_TOKEN) return null;
    try {
        const { list } = await import('@vercel/blob');
        const { blobs } = await list({ prefix: `${CACHE_PRE}${slugName}.json`, token: BLOB_TOKEN, limit: 1 });
        if (!blobs.length) return null;
        const res = await fetch(blobs[0].downloadUrl || blobs[0].url, {
            headers: { Authorization: `Bearer ${BLOB_TOKEN}`, 'Cache-Control': 'no-store' },
        });
        if (!res.ok) return null;
        const payload = await res.json();
        if (!isFresh(payload.ts, SERIES_TTL_MS)) return null;
        return payload;
    } catch {
        return null;
    }
}

async function blobPut(slugName, indexName, data) {
    if (!BLOB_TOKEN) return;
    try {
        const { put } = await import('@vercel/blob');
        await put(`${CACHE_PRE}${slugName}.json`, JSON.stringify({ index: indexName, data, ts: Date.now() }), {
            access: 'private',
            contentType: 'application/json',
            addRandomSuffix: false,
            token: BLOB_TOKEN,
        });
    } catch (e) {
        console.error('[nifty-tri] Blob write FAILED:', e.message);
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    if (req.method === 'OPTIONS') return res.status(200).end();

    // Diagnostic endpoint: /api/nifty-tri?health=1
    if (req.query.health) {
        return res.status(200).json({
            hasBlobToken: !!BLOB_TOKEN,
            source: 'api.bseindia.com (via lib/bseIndex.js)',
            node: process.version,
        });
    }

    const indexName = req.query.index || 'BSE SENSEX';
    const slugName = slugify(indexName);

    try {
        const symbolList = await getSymbolList();
        const matched = findBseSymbol(indexName, symbolList);
        if (!matched) {
            return res.status(404).json({ error: `No matching BSE index found for "${indexName}"` });
        }
        const { symbol, name: matchedName } = matched;

        const mem = seriesCache.get(symbol);
        if (isFresh(mem?.ts, SERIES_TTL_MS)) {
            return res.status(200).json({ index: matchedName, source: 'bse-index/memory', count: mem.data.length, data: mem.data });
        }

        const blob = await blobGet(slugName);
        if (blob?.data?.length) {
            seriesCache.set(symbol, { data: blob.data, ts: blob.ts });
            return res.status(200).json({ index: matchedName, source: 'bse-index/blob', count: blob.data.length, data: blob.data });
        }

        if (inflight.has(symbol)) {
            const data = await inflight.get(symbol);
            return res.status(200).json({ index: matchedName, source: 'bse-index/dedup', count: data.length, data });
        }

        const fetchPromise = (async () => {
            const rows = await fetchBseDailySeries(symbol); // no range = full history since inception
            const data = rows.map(r => ({ date: fmtDisplayDate(r.date), value: r.close }));
            seriesCache.set(symbol, { data, ts: Date.now() });
            blobPut(slugName, matchedName, data); // fire-and-forget
            inflight.delete(symbol);
            return data;
        })();
        inflight.set(symbol, fetchPromise);
        fetchPromise.catch(() => inflight.delete(symbol));

        const data = await fetchPromise;
        if (!data.length) {
            return res.status(404).json({ error: `No historical data returned for ${matchedName}` });
        }
        return res.status(200).json({ index: matchedName, source: 'bse-index/live', count: data.length, data });
    } catch (err) {
        console.error('[nifty-tri]', err.message);
        return res.status(500).json({ error: err.message });
    }
}
