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
//
// UPDATE (2026-10): the live BSE fetch below (inside fetchPromise) now
// routinely fails in production -- api.bseindia.com blocks Vercel's IPs.
// Reliability comes from the blob cache below staying warm via
// scripts/sync_bse_index_cache.js on a schedule, not from this live path
// succeeding. See lib/bseIndex.js's header comment for the full story.

import { findBseSymbol, fetchBseDailySeries, getCachedBseSymbolList, slugify, fmtBseDisplayDate } from '../../lib/bseIndex';
import { r2Get, r2Put } from '../../lib/r2';

const CACHE_PRE = 'bse-tri-cache/';
const SERIES_TTL_MS = 24 * 60 * 60 * 1000;      // 1 day

function isFresh(ts, ttlMs) {
    return ts && Date.now() - ts < ttlMs;
}

const seriesCache = new Map(); // symbol -> { data, ts }
const inflight = new Map();

// Returns the blob regardless of freshness -- the caller decides whether to
// use it immediately (fresh) or only as a fallback if the live fetch fails
// (stale). Collapsing "stale" into "missing" here was the bug: BSE's index
// data genuinely doesn't change over a weekend (markets closed), but the
// sync workflow only runs Mon-Fri (see .github/workflows/
// bse-index-cache-sync.yml), so by Sunday the last-Friday blob is >24h old
// and was being discarded entirely -- falling through to the live BSE
// fetch, which 403s from Vercel's IPs (see this file's own header comment)
// with no fallback, breaking every benchmark, every weekend.
async function blobGet(slugName) {
    try {
        return await r2Get(`${CACHE_PRE}${slugName}.json`);
    } catch {
        return null;
    }
}

async function blobPut(slugName, indexName, data) {
    try {
        await r2Put(`${CACHE_PRE}${slugName}.json`, JSON.stringify({ index: indexName, data, ts: Date.now() }));
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
            hasR2Config: !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID),
            source: 'api.bseindia.com (via lib/bseIndex.js)',
            node: process.version,
        });
    }

    const indexName = req.query.index || 'BSE SENSEX';
    const slugName = slugify(indexName);

    try {
        const symbolList = await getCachedBseSymbolList({ r2Get, r2Put });
        const matched = findBseSymbol(indexName, symbolList);
        if (!matched) {
            return res.status(404).json({ error: `No matching BSE index found for "${indexName}"` });
        }
        const { symbol, name: matchedName } = matched;

        const mem = seriesCache.get(symbol);
        if (isFresh(mem?.ts, SERIES_TTL_MS)) {
            return res.status(200).json({ index: matchedName, source: 'bse-index/memory', count: mem.data.length, data: mem.data });
        }

        // May be fresh (same-day sync) or stale (last sync was before the
        // weekend) -- either way it's kept as `staleBlob` so a failed live
        // fetch below still has real data to fall back to, instead of
        // erroring just because BSE's Mon-Fri sync schedule left it >24h old.
        const staleBlob = await blobGet(slugName);
        if (staleBlob?.data?.length && isFresh(staleBlob.ts, SERIES_TTL_MS)) {
            seriesCache.set(symbol, { data: staleBlob.data, ts: staleBlob.ts });
            return res.status(200).json({ index: matchedName, source: 'bse-index/blob', count: staleBlob.data.length, data: staleBlob.data });
        }

        if (inflight.has(symbol)) {
            const data = await inflight.get(symbol);
            return res.status(200).json({ index: matchedName, source: 'bse-index/dedup', count: data.length, data });
        }

        const fetchPromise = (async () => {
            const rows = await fetchBseDailySeries(symbol); // no range = full history since inception
            const data = rows.map(r => ({ date: fmtBseDisplayDate(r.date), value: r.close }));
            seriesCache.set(symbol, { data, ts: Date.now() });
            blobPut(slugName, matchedName, data); // fire-and-forget
            inflight.delete(symbol);
            return data;
        })();
        inflight.set(symbol, fetchPromise);
        fetchPromise.catch(() => inflight.delete(symbol));

        let data;
        try {
            data = await fetchPromise;
        } catch (liveErr) {
            if (staleBlob?.data?.length) {
                console.warn(`[nifty-tri] Live fetch failed for ${symbol} (${liveErr.message}) -- serving stale cache from ${new Date(staleBlob.ts).toISOString()}`);
                seriesCache.set(symbol, { data: staleBlob.data, ts: staleBlob.ts });
                return res.status(200).json({ index: matchedName, source: 'bse-index/stale-blob', count: staleBlob.data.length, data: staleBlob.data });
            }
            throw liveErr;
        }
        if (!data.length) {
            return res.status(404).json({ error: `No historical data returned for ${matchedName}` });
        }
        return res.status(200).json({ index: matchedName, source: 'bse-index/live', count: data.length, data });
    } catch (err) {
        console.error('[nifty-tri]', err.message);
        return res.status(500).json({ error: err.message });
    }
}
