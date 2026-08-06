/**
 * app/api/pms-benchmark/route.js
 *
 * GET /api/pms-benchmark?iaid=1651
 *
 * Fetches a single PMS strategy's declared benchmark from its APMI detail
 * page. Unlike the main /api/pms-data table (one bulk request covers every
 * strategy), the benchmark only appears on each strategy's own
 * IaInsight.htm?IAID=N page — one request per strategy. Fetched lazily
 * (only when a user opens that strategy's detail drawer) and cached
 * effectively permanently, since a strategy's declared benchmark almost
 * never changes once set.
 *
 * Three-layer cache, same pattern as /api/pms-data:
 *   Layer 1 — in-memory Map (per serverless instance)
 *   Layer 2 — Vercel Blob (shared, long TTL)
 *   Layer 3 — live fetch + parse from apmiindia.org
 */

import { NextResponse } from 'next/server';
import { r2Get, r2Put } from '@/lib/r2';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MEM_TTL_MS  = 30 * 24 * 60 * 60 * 1000;  // 30 days
const BLOB_TTL_MS = 365 * 24 * 60 * 60 * 1000; // 1 year — benchmark rarely changes
const BLOB_BASE   = 'pms-benchmark-cache';

/** @type {Map<string, { benchmark: string | null, ts: number }>} */
const memCache = new Map();

/** @type {Map<string, Promise<string | null>>} */
const inflight = new Map();

function isFresh(ts, ttlMs) {
    return ts && Date.now() - ts < ttlMs;
}

async function readFromBlob(iaid) {
    try {
        const payload = await r2Get(`${BLOB_BASE}/${iaid}.json`);
        if (!payload) return null;
        if (!isFresh(payload.ts, BLOB_TTL_MS)) return null;
        return payload;
    } catch (err) {
        console.warn('[pms-benchmark] Blob read error:', err.message);
        return null;
    }
}

async function writeToBlob(iaid, benchmark) {
    try {
        const payload = JSON.stringify({ benchmark, ts: Date.now() });
        await r2Put(`${BLOB_BASE}/${iaid}.json`, payload);
    } catch (err) {
        console.warn('[pms-benchmark] Blob write error:', err.message);
    }
}

/** Extracts the "Benchmark" field from an IaInsight.htm detail page's HTML. */
function parseBenchmark(html) {
    const m = html.match(/<label>\s*<b>\s*Benchmark\s*<\/b>\s*<\/label>\s*<p[^>]*>([\s\S]*?)<\/p>/i);
    if (!m) return null;
    const text = m[1].replace(/\s+/g, ' ').trim();
    return text || null;
}

async function fetchBenchmark(iaid) {
    const res = await fetch(`https://www.apmiindia.org/apmi/IaInsight.htm?IAID=${encodeURIComponent(iaid)}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
            Referer: 'https://www.apmiindia.org/',
        },
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(`APMI responded ${res.status}`);
    const html = await res.text();
    return parseBenchmark(html);
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const iaid = searchParams.get('iaid');
    if (!iaid) {
        return NextResponse.json({ status: 'error', message: 'Missing iaid param' }, { status: 400 });
    }

    try {
        const mem = memCache.get(iaid);
        if (isFresh(mem?.ts, MEM_TTL_MS)) {
            return ok(mem.benchmark, 'memory');
        }

        const blob = await readFromBlob(iaid);
        if (blob) {
            memCache.set(iaid, { benchmark: blob.benchmark, ts: blob.ts });
            return ok(blob.benchmark, 'blob');
        }

        if (inflight.has(iaid)) {
            const benchmark = await inflight.get(iaid);
            return ok(benchmark, 'dedup');
        }

        const fetchPromise = (async () => {
            const benchmark = await fetchBenchmark(iaid);
            const ts = Date.now();
            memCache.set(iaid, { benchmark, ts });
            writeToBlob(iaid, benchmark); // fire-and-forget
            inflight.delete(iaid);
            return benchmark;
        })();

        inflight.set(iaid, fetchPromise);
        fetchPromise.catch(() => inflight.delete(iaid));

        const benchmark = await fetchPromise;
        return ok(benchmark, 'live');
    } catch (err) {
        console.error('[pms-benchmark] Route error:', err.message);
        return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
    }
}

function ok(benchmark, source) {
    return NextResponse.json(
        { status: 'success', benchmark, source },
        { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=2592000' } }
    );
}
