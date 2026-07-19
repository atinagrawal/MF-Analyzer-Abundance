/**
 * lib/apmiProviderMap.js
 *
 * Resolves an APMI PMS provider's display name (e.g. "Abakkus Asset Manager
 * Private Limited", as scraped verbatim from the /api/pms-data leaderboard's
 * `portfolioManager` field) to its numeric `pmsProvider` ID — required by the
 * WSIAConsolidateReport quartile endpoint, which the leaderboard and
 * IaInsight endpoints never expose.
 *
 * The full ~365-provider list is only visible in the
 * <select id="pmsProvideNames"> dropdown on WSIAConsolidateReport.htm's plain
 * GET page (no auth/session needed). Providers are added rarely, so the whole
 * map is scraped once and cached long-term — same three-layer pattern as
 * pms-data/pms-benchmark.
 */

const MEM_TTL_MS  = 30 * 24 * 60 * 60 * 1000;  // 30 days
const BLOB_TTL_MS = 90 * 24 * 60 * 60 * 1000;  // 90 days — new providers appear rarely
const BLOB_KEY    = 'pms-provider-map/map.json';

/** @type {{ map: Record<string, number>, ts: number } | null} */
let memCache = null;
/** @type {Promise<Record<string, number>> | null} */
let inflight = null;

function isFresh(ts, ttlMs) {
    return ts && Date.now() - ts < ttlMs;
}

function normalize(name) {
    return String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

async function readFromBlob() {
    if (!BLOB_TOKEN) return null;
    try {
        const { list } = await import('@vercel/blob');
        const { blobs } = await list({ prefix: BLOB_KEY, token: BLOB_TOKEN, limit: 1 });
        if (!blobs.length) return null;
        const res = await fetch(blobs[0].downloadUrl || blobs[0].url, {
            headers: { Authorization: `Bearer ${BLOB_TOKEN}`, 'Cache-Control': 'no-store' },
        });
        if (!res.ok) return null;
        const payload = await res.json();
        if (!isFresh(payload.ts, BLOB_TTL_MS)) return null;
        return payload;
    } catch (err) {
        console.warn('[apmiProviderMap] Blob read error:', err.message);
        return null;
    }
}

async function writeToBlob(map) {
    if (!BLOB_TOKEN) return;
    try {
        const { put } = await import('@vercel/blob');
        const payload = JSON.stringify({ map, ts: Date.now() });
        await put(BLOB_KEY, payload, {
            access: 'private',
            contentType: 'application/json',
            addRandomSuffix: false,
            token: BLOB_TOKEN,
        });
    } catch (err) {
        console.warn('[apmiProviderMap] Blob write error:', err.message);
    }
}

/**
 * Parses the pmsProvideNames <select> options out of
 * WSIAConsolidateReport.htm?action=showReportMenu's HTML.
 * Exported (in addition to being used internally) so it can be verified
 * directly against a saved fixture.
 */
export function parseProviderMap(html) {
    const selectMatch = html.match(/<select[^>]*id="pmsProvideNames"[\s\S]*?<\/select>/i);
    if (!selectMatch) throw new Error('pmsProvideNames select not found in APMI response');
    const optionRe = /<option\s+value="(\d+)"[^>]*>([^<]*)<\/option>/g;
    const map = {};
    let m;
    while ((m = optionRe.exec(selectMatch[0]))) {
        const id = Number(m[1]);
        const name = m[2].trim();
        if (id && name) map[normalize(name)] = id; // id=0 is the "Select" placeholder — skipped
    }
    return map;
}

async function fetchProviderMap() {
    const res = await fetch('https://www.apmiindia.org/apmi/WSIAConsolidateReport.htm?action=showReportMenu', {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.apmiindia.org/' },
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(`APMI responded ${res.status}`);
    const html = await res.text();
    return parseProviderMap(html);
}

async function getProviderMap() {
    if (isFresh(memCache?.ts, MEM_TTL_MS)) return memCache.map;

    const blob = await readFromBlob();
    if (blob) {
        memCache = { map: blob.map, ts: blob.ts };
        return blob.map;
    }

    if (inflight) return inflight;

    inflight = (async () => {
        const map = await fetchProviderMap();
        memCache = { map, ts: Date.now() };
        writeToBlob(map); // fire-and-forget
        inflight = null;
        return map;
    })();
    inflight.catch(() => { inflight = null; });

    return inflight;
}

/**
 * Resolves a provider display name to its APMI `pmsProvider` ID.
 * Returns null (never throws) if the name has no match — callers must treat
 * that as "quartile data unavailable for this fund", not an error.
 */
export async function getApmiProviderId(providerName) {
    const map = await getProviderMap();
    return map[normalize(providerName)] ?? null;
}
