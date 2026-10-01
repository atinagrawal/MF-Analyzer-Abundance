/**
 * lib/bseIndex.js
 *
 * Shared helpers for fetching index data from api.bseindia.com. Used by
 * both app/api/bse-index/route.js (PMS benchmark alpha lookup) and
 * pages/api/nifty-tri.js (Rolling Returns time series + fund/SIF detail
 * page benchmark-overlay charts).
 *
 * Why BSE and not NSE: NSE actively blocks server/cloud IPs via Akamai
 * (see scripts/ingest-eod.mjs's comment — the same lesson learned there
 * for stock EOD data applies here).
 *
 * UPDATE (2026-10): BSE has started doing the same thing on its own API
 * (confirmed live: api.bseindia.com/.../FillddlIndex now returns 403 from
 * Vercel's production IPs while the identical request succeeds from a
 * non-cloud machine) -- so fetchBseSymbolList/fetchBseDailySeries below
 * can no longer be trusted to work from a live Vercel request at all.
 * They still work fine from a GitHub Actions runner (same reasoning
 * ingest-eod.mjs already relies on for BSE bhavcopy), so
 * scripts/sync_bse_index_cache.js now runs them on a schedule there and
 * writes the results to the SAME R2 keys the live routes read --
 * getCachedBseSymbolList() below and pages/api/nifty-tri.js's own
 * bse-tri-cache/{slug}.json series cache. A live route calling these
 * fetch functions directly is now a last-resort fallback that will
 * routinely fail in production; the real reliability comes from the
 * cache staying warm via the scheduled sync, not from this fetch path
 * succeeding on demand.
 *
 * Endpoints (discovered via browser network inspection, no official
 * docs): FillddlIndex/w for the symbol list, IndexArchDailyPAR/w for
 * daily OHLC history. Both require Origin/Referer headers matching
 * bseindia.com or the Akamai WAF rejects the request; no auth token
 * otherwise needed. IndexArchDailyPAR/w returns full history back to each
 * index's inception when fmdt/todt are left empty (verified: BSE SENSEX
 * back to 1979, 11,000+ rows, in a single ~3.5s request) — no need for a
 * batch/incremental backfill pipeline.
 *
 * Note: BSE does not expose a separately-named "TRI" symbol per index —
 * e.g. "BSE 500" is the closest available series to "BSE 500 TRI" as
 * PMS managers describe their benchmark. Values here are PRICE returns,
 * not a literal Total Return Index computation (same caveat as our NSE
 * index-dashboard data elsewhere on the site).
 */

export const BSE_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
    Origin: 'https://www.bseindia.com',
    Referer: 'https://www.bseindia.com/',
    Accept: 'application/json, text/plain, */*',
};

/** "BSE 500" -> "bse-500" -- shared so the sync script and both read-side
 * routes always compute the same R2 key for the same index name. */
export function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Display-date format stored in the shared bse-tri-cache/{slug}.json
 * series cache ("09 Jul 2026") -- shared by scripts/sync_bse_index_cache.js
 * (writer), pages/api/nifty-tri.js, and app/api/bse-index/route.js (readers)
 * so none of them can drift out of sync on the format. */
export function fmtBseDisplayDate(d) {
    return `${String(d.getDate()).padStart(2, '0')} ${MONTH_ABBR[d.getMonth()]} ${d.getFullYear()}`;
}

/** Normalizes an index/benchmark name for matching ("Nifty 500 TRI" -> "bse 500"). */
export function normalizeIndexName(name) {
    let s = (name || '')
        .toLowerCase()
        .replace(/\btri\b/g, '')
        .replace(/\btotal return index\b/g, '')
        .replace(/\snifty\s/g, ' bse ')
        .replace(/^nifty\s/g, 'bse ')
        .replace(/\s+/g, ' ')
        .trim();
    if (s === 'bse 50') return 'bse sensex';
    if (s === 'bse midcap 150' || s === 'bse midcap 50') return 'bse midcap';
    if (s === 'bse smallcap 250') return 'bse smallcap';
    if (s === 'bse midsmallcap 400' || s === 'bse midsmallcap') return 'bse 400 midsmallcap index';
    return s;
}

/** Fetches BSE's full index symbol list: [{ Indx_cd, shortalias }, ...]. */
export async function fetchBseSymbolList() {
    const res = await fetch('https://api.bseindia.com/BseIndiaAPI/api/FillddlIndex/w?fmdt=&todt=', {
        headers: BSE_HEADERS,
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(`BSE symbol list responded ${res.status}`);
    const json = await res.json();
    return json.Table || [];
}

/** Finds the BSE symbol code (e.g. "BSE500") matching a given name. */
export function findBseSymbol(name, list) {
    const target = normalizeIndexName(name);
    const match = list.find(x => normalizeIndexName(x.shortalias) === target);
    return match ? { symbol: match.Indx_cd, name: match.shortalias.trim() } : null;
}

const SYMBOL_LIST_R2_KEY = 'bse-index-cache/_symbol-list.json';
const SYMBOL_LIST_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days -- the index universe rarely changes

// Process-local fast path, same role as each route's own in-memory cache
// used to play individually -- reset on cold start, which is exactly when
// the R2 fallback below matters.
let memSymbolList = null; // { list, ts }

/**
 * Shared symbol-list resolver for both /api/nifty-tri and /api/bse-index,
 * replacing each route's own separate in-memory-only cache (the actual
 * root cause of total failure: both previously called
 * fetchBseSymbolList() live, unconditionally, on every cold Vercel
 * instance -- meaning even an index whose SERIES data was already warm
 * in that route's own blob cache still 403'd, because symbol resolution
 * happened first and had no persisted fallback).
 *
 * Order: in-memory -> R2 blob (kept warm by scripts/sync_bse_index_cache.js
 * on a schedule) -> live BSE fetch as a last resort, which routinely
 * fails from Vercel now (see this file's header comment) but is kept so
 * the system self-heals if BSE ever stops blocking cloud IPs again, and
 * so local dev (not blocked) still works without needing R2 configured.
 *
 * @param {{ r2Get: Function, r2Put: Function }} deps
 */
export async function getCachedBseSymbolList({ r2Get, r2Put }) {
    if (memSymbolList && Date.now() - memSymbolList.ts < SYMBOL_LIST_TTL_MS) {
        return memSymbolList.list;
    }

    try {
        const blob = await r2Get(SYMBOL_LIST_R2_KEY);
        if (blob?.list?.length && Date.now() - blob.ts < SYMBOL_LIST_TTL_MS) {
            memSymbolList = { list: blob.list, ts: blob.ts };
            return blob.list;
        }
    } catch (err) {
        console.warn('[bseIndex] Symbol-list R2 read failed:', err.message);
    }

    const list = await fetchBseSymbolList();
    memSymbolList = { list, ts: Date.now() };
    try {
        await r2Put(SYMBOL_LIST_R2_KEY, JSON.stringify({ list, ts: memSymbolList.ts }));
    } catch (err) {
        console.warn('[bseIndex] Symbol-list R2 write failed:', err.message);
    }
    return list;
}

function fmtDateDDMMYYYY(d) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Fetches an index's daily OHLC history from BSE.
 * @param {string} symbol - BSE Indx_cd (e.g. "SENSEX", "BSE500")
 * @param {{ from?: Date, to?: Date }} [range] - omit for full history since inception
 * @returns {Promise<{ date: Date, close: number, pe: number|null, pb: number|null, dy: number|null }[]>} sorted ascending by date
 */
export async function fetchBseDailySeries(symbol, range = {}) {
    const fmdt = range.from ? fmtDateDDMMYYYY(range.from) : '';
    const todt = range.to ? fmtDateDDMMYYYY(range.to) : '';
    const url = `https://api.bseindia.com/BseIndiaAPI/api/IndexArchDailyPAR/w?fmdt=${fmdt}&index=${encodeURIComponent(symbol)}&period=D&todt=${todt}`;
    const res = await fetch(url, { headers: BSE_HEADERS, cache: 'no-store' });
    if (!res.ok) throw new Error(`BSE daily series responded ${res.status}`);
    const json = await res.json();
    return (json.Table || [])
        .map(r => ({
            date: new Date(r.tdate),
            close: r.I_close,
            pe: typeof r.I_pe === 'number' && r.I_pe > 0 ? r.I_pe : null,
            pb: typeof r.I_pb === 'number' && r.I_pb > 0 ? r.I_pb : null,
            dy: typeof r.I_yl === 'number' && r.I_yl > 0 ? r.I_yl : null,
        }))
        .filter(r => !isNaN(r.date.getTime()) && typeof r.close === 'number' && r.close > 0)
        .sort((a, b) => a.date - b.date);
}
