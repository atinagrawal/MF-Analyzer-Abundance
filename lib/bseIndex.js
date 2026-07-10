/**
 * lib/bseIndex.js
 *
 * Shared helpers for fetching index data from api.bseindia.com. Used by
 * both app/api/bse-index/route.js (PMS benchmark alpha lookup) and
 * pages/api/nifty-tri.js (Rolling Returns time series).
 *
 * Why BSE and not NSE: NSE actively blocks server/cloud IPs via Akamai
 * (see scripts/ingest-eod.mjs's comment — the same lesson learned there
 * for stock EOD data applies here). BSE has no such block and covers a
 * comparably broad index universe, so it's the reliable choice for
 * anything that runs server-side in production.
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

/** Normalizes an index/benchmark name for matching ("Nifty 500 TRI" ~ "Nifty 500"). */
export function normalizeIndexName(name) {
    return (name || '')
        .toLowerCase()
        .replace(/\btri\b/g, '')
        .replace(/\btotal return index\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
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

function fmtDateDDMMYYYY(d) {
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/**
 * Fetches an index's daily OHLC history from BSE.
 * @param {string} symbol - BSE Indx_cd (e.g. "SENSEX", "BSE500")
 * @param {{ from?: Date, to?: Date }} [range] - omit for full history since inception
 * @returns {Promise<{ date: Date, close: number }[]>} sorted ascending by date
 */
export async function fetchBseDailySeries(symbol, range = {}) {
    const fmdt = range.from ? fmtDateDDMMYYYY(range.from) : '';
    const todt = range.to ? fmtDateDDMMYYYY(range.to) : '';
    const url = `https://api.bseindia.com/BseIndiaAPI/api/IndexArchDailyPAR/w?fmdt=${fmdt}&index=${encodeURIComponent(symbol)}&period=D&todt=${todt}`;
    const res = await fetch(url, { headers: BSE_HEADERS, cache: 'no-store' });
    if (!res.ok) throw new Error(`BSE daily series responded ${res.status}`);
    const json = await res.json();
    return (json.Table || [])
        .map(r => ({ date: new Date(r.tdate), close: r.I_close }))
        .filter(r => !isNaN(r.date.getTime()) && typeof r.close === 'number' && r.close > 0)
        .sort((a, b) => a.date - b.date);
}
