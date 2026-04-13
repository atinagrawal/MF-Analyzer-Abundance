import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

// ══════════════════════════════════════════════════════════════════════════
//  PMS Data API — Three-layer cache
//
//  Layer 1 │ In-memory (Map)
//           │ Fastest: <1ms, zero network
//           │ Lifetime: until serverless function goes cold (~10 min idle)
//           │ Shared: NO — each Vercel instance has its own memory
//
//  Layer 2 │ Vercel Blob (JSON file per strategy)
//           │ Fast: ~50–150ms, one HTTP GET to Vercel's CDN
//           │ Lifetime: PERMANENT until explicitly overwritten
//           │ Shared: YES — one Blob store, all instances read the same data
//
//  Layer 3 │ APMI India scrape
//           │ Slow: ~8–12s, external dependency
//           │ Triggered: only when both layers miss or are stale
//
//  TTL Strategy:
//    Memory cache → 6 hours  (safety, in case blob write fails)
//    Blob cache   → 30 days  (APMI only publishes monthly; 30d = 1 release cycle)
//
//  On Vercel (production): BLOB_READ_WRITE_TOKEN must be set in environment.
//  In local dev: blob layer is skipped gracefully; memory layer only.
// ══════════════════════════════════════════════════════════════════════════

const MEM_TTL_MS  = 6 * 60 * 60 * 1000;   // 6 hours  — in-memory TTL
const BLOB_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days  — blob TTL

/** @type {Map<string, { data: any[], ts: number }>} */
const memCache = new Map();

/** @type {Map<string, Promise<any[]>>} */
const inflight = new Map();

// ── Helpers ───────────────────────────────────────────────────────────────
function cacheKey(strategy, month, year) {
    return `pms-${strategy.toLowerCase().replace(/\s+/g, '-')}-${year}-${String(month).padStart(2, '0')}`;
}

function isFresh(ts, ttlMs) {
    return ts && Date.now() - ts < ttlMs;
}

function parseVal(str) {
    if (!str || str.trim() === '-' || str.trim() === '') return null;
    return parseFloat(str.trim().replace(/[₹,]/g, ''));
}

// ── Blob helpers (gracefully no-op when token not set) ────────────────────
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
const BLOB_BASE  = 'pms-cache';

async function readFromBlob(key) {
    if (!BLOB_TOKEN) return null;
    try {
        const { list } = await import('@vercel/blob');
        const { blobs } = await list({ prefix: `${BLOB_BASE}/${key}`, token: BLOB_TOKEN });
        if (!blobs.length) return null;

        // blobs are sorted newest first
        const newest = blobs[0];
        const res = await fetch(newest.url);
        if (!res.ok) return null;

        const payload = await res.json();
        // Check blob TTL
        if (!isFresh(payload.ts, BLOB_TTL_MS)) {
            console.log(`[PMS cache] Blob STALE for ${key}`);
            return null;
        }
        console.log(`[PMS cache] Blob HIT for ${key}, age ${Math.round((Date.now() - payload.ts) / 3600000)}h`);
        return payload;
    } catch (err) {
        console.warn('[PMS cache] Blob read error:', err.message);
        return null;
    }
}

async function writeToBlob(key, data) {
    if (!BLOB_TOKEN) return;
    try {
        const { put } = await import('@vercel/blob');
        const payload = JSON.stringify({ data, ts: Date.now(), key });
        await put(`${BLOB_BASE}/${key}.json`, payload, {
            access: 'public',
            token: BLOB_TOKEN,
            contentType: 'application/json',
            // Vercel Blob doesn't support TTL natively — we enforce it via ts check on read
            cacheControlMaxAge: 60 * 60 * 24 * 31, // hint CDN: 31 days
        });
        console.log(`[PMS cache] Blob WRITE OK for ${key}`);
    } catch (err) {
        // Non-fatal: app still works via memory cache
        console.warn('[PMS cache] Blob write error:', err.message);
    }
}

// ── Core APMI scraper ─────────────────────────────────────────────────────
async function scrapeAPMI(strategy, month, year, asOnDate) {
    const params = new URLSearchParams();
    params.append('strategyname', strategy);
    params.append('servicetype', 'D');
    params.append('', '');
    params.append('', '');
    params.append('fromMonth', month);
    params.append('fromYears', year);
    params.append('asOnDate', asOnDate);

    const apmiRes = await fetch(
        'https://www.apmiindia.org/apmi/welcomeiaperformance.htm?action=loadIAReport',
        {
            method: 'POST',
            headers: {
                accept: '*/*',
                'content-type': 'application/x-www-form-urlencoded',
                referrer: 'https://www.apmiindia.org/',
            },
            body: params.toString(),
            cache: 'no-store',
        }
    );

    if (!apmiRes.ok) throw new Error(`APMI responded ${apmiRes.status}`);

    const html = await apmiRes.text();
    const $ = cheerio.load(html);
    const pmsData = [];

    $('table tr').each((index, element) => {
        if (index === 0) return;
        const tds = $(element).find('td');
        if (tds.length >= 12) {
            pmsData.push({
                id: index,
                portfolioManager: $(tds[0]).text().trim(),
                strategyName:     $(tds[1]).text().trim(),
                apmiLink:         (() => {
                    const raw = $(tds[1]).find('a').attr('href');
                    if (!raw) return null;
                    if (raw.startsWith('http')) return raw;
                    // Resolve relative link against the APMI base path
                    return new URL(raw, 'https://www.apmiindia.org/apmi/').href;
                })(),
                aum:          parseVal($(tds[2]).text()),
                ret1M:        parseVal($(tds[3]).text()),
                ret3M:        parseVal($(tds[4]).text()),
                ret6M:        parseVal($(tds[5]).text()),
                ret1Y:        parseVal($(tds[6]).text()),
                ret2Y:        parseVal($(tds[7]).text()),
                ret3Y:        parseVal($(tds[8]).text()),
                ret4Y:        parseVal($(tds[9]).text()),
                ret5Y:        parseVal($(tds[10]).text()),
                retInception: parseVal($(tds[11]).text()),
            });
        }
    });

    return pmsData
        .filter(d => d.strategyName !== '')
        .sort((a, b) => (b.ret1Y ?? -Infinity) - (a.ret1Y ?? -Infinity));
}

// ── Route handler ─────────────────────────────────────────────────────────
export async function POST(request) {
    try {
        const body = await request.json();
        const {
            strategy  = 'Equity',
            month     = '2',
            year      = '2026',
            asOnDate  = '2026-2-28',
            bustCache = false,
        } = body;

        const key = cacheKey(strategy, month, year);

        // ── Layer 1: Memory cache ───────────────────────────────────
        if (!bustCache) {
            const mem = memCache.get(key);
            if (isFresh(mem?.ts, MEM_TTL_MS)) {
                return ok(mem.data, { source: 'memory', ageMinutes: Math.round((Date.now() - mem.ts) / 60000) });
            }
        }

        // ── Layer 2: Blob cache ─────────────────────────────────────
        if (!bustCache) {
            const blob = await readFromBlob(key);
            if (blob) {
                // Warm memory cache from blob
                memCache.set(key, { data: blob.data, ts: blob.ts });
                return ok(blob.data, { source: 'blob', ageHours: Math.round((Date.now() - blob.ts) / 3600000) });
            }
        }

        // ── Layer 3: Deduplicated live scrape ───────────────────────
        if (inflight.has(key)) {
            // Another request is already fetching — piggyback on it
            const data = await inflight.get(key);
            return ok(data, { source: 'dedup' });
        }

        const fetchPromise = (async () => {
            const data = await scrapeAPMI(strategy, month, year, asOnDate);
            const ts = Date.now();

            // Write to both caches (don't await blob write — it's fire-and-forget)
            memCache.set(key, { data, ts });
            writeToBlob(key, data); // async, non-blocking

            inflight.delete(key);
            return data;
        })();

        inflight.set(key, fetchPromise);
        fetchPromise.catch(() => inflight.delete(key));

        const data = await fetchPromise;
        return ok(data, { source: 'scrape' });

    } catch (error) {
        console.error('[PMS] Route error:', error);

        // Stale-on-error: return best available data even if expired
        try {
            const body2 = await request.clone().json().catch(() => ({}));
            const key = cacheKey(body2.strategy || 'Equity', body2.month || '2', body2.year || '2026');
            const stale = memCache.get(key);
            if (stale) {
                return ok(stale.data, { source: 'stale-memory', stale: true }, 200);
            }
            const blobStale = await readFromBlob(key).catch(() => null);
            if (blobStale) {
                return ok(blobStale.data, { source: 'stale-blob', stale: true }, 200);
            }
        } catch (_) { /* ignore */ }

        return NextResponse.json({ status: 'error', message: error.message }, { status: 500 });
    }
}

function ok(data, meta = {}, status = 200) {
    return NextResponse.json(
        { status: 'success', data, ...meta },
        {
            status,
            headers: {
                // CDN: cache 1h, serve stale for up to 7 days while revalidating
                'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=604800',
                'X-Cache-Source': meta.source || 'unknown',
            },
        }
    );
}