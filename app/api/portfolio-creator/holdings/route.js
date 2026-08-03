/**
 * app/api/portfolio-creator/holdings/route.js
 *
 * GET /api/portfolio-creator/holdings?amfiCode=118955&schemeName=HDFC%20Flexi%20Cap%20Fund
 *
 * Resolves a fund (by AMFI code + name) against an external scheme-detail
 * data source and returns its holdings plus scheme-level fields (AUM,
 * expense ratio, risk, category). Cached in-memory -> Vercel Blob -> live
 * fetch, same 3-layer pattern as pages/api/nifty-tri.js. Holdings change at
 * most monthly, so a 7-day TTL is generous without going stale.
 */

const CACHE_PREFIX = 'portfolio-creator-holdings/';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

const memCache = new Map(); // amfiCode -> { data, ts }
const inflight = new Map();

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://groww.in/mutual-funds',
};

function isFresh(ts) {
  return ts && Date.now() - ts < TTL_MS;
}

// Strips Direct/Regular/Growth/plan noise so the search term matches
// however the fund's canonical name is indexed. Kept as an independent
// copy from scripts/sync_groww_exit_loads.js's deriveSearchTerm -- that
// script is a standalone CLI tool, not an importable app module, and this
// route needs zero coupling to it.
function cleanSearchTerm(schemeName) {
  return (schemeName || '')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(Direct|Regular)\b/gi, '')
    .replace(/\bPlan\b/gi, '')
    .replace(/\b(Growth|IDCW|Dividend)\b/gi, '')
    .replace(/\b(Payout|Reinvestment|Reinvest|Bonus|Option|Quarterly|Monthly|Weekly|Daily|Annual)\b/gi, '')
    // Groww's own scheme titles inconsistently include the word "Fund" (e.g.
    // "HDFC Flexi Cap Direct Plan-Growth" has no "Fund", but "HDFC Focused
    // Fund" does) -- stripped here too so the normalized-name comparison in
    // resolveSearchId lines up regardless of which form Groww used. Verified
    // live (2026-08-03) this doesn't hurt query relevance or create
    // collisions across similar fund names in the same AMC family.
    .replace(/\bFund\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function resolveSearchId(amfiCode, schemeName) {
  const term = cleanSearchTerm(schemeName);
  const url = `https://groww.in/v1/api/search/v1/entity?app=false&entity_type=scheme&q=${encodeURIComponent(term)}&page=0&size=5`;
  const res = await fetch(url, { headers: FETCH_HEADERS });
  if (!res.ok) return null;
  const json = await res.json();
  // Live testing (2026-08-03): this endpoint returns { content: [...] } at
  // the top level -- NOT nested under a "data" key. (scripts/sync_groww_exit_loads.js's
  // `searchRes.data.content` is deceptive here: that script's own fetchJson()
  // helper wraps the parsed body as `{ status, data: <parsed JSON> }`, so
  // `.data.content` there means `(parsed JSON).content`, i.e. the same
  // top-level `content` field this route reads directly.)
  const candidates = json?.content || [];
  // Groww's search index only carries the Direct-plan variant of a scheme,
  // so its scheme_code is always the Direct plan's AMFI code. A Regular-plan
  // fund (the common case for CAS-imported holdings) will never match on
  // scheme_code alone even though Direct/Regular share identical underlying
  // holdings. Fall back to a normalized-name match (same cleanSearchTerm
  // used to build the query) so Regular-plan funds resolve too, while still
  // preferring the exact scheme_code match when it's the Direct plan itself.
  // Live testing (2026-08-03): each candidate's display name is on a `title`
  // field, e.g. "HDFC Flexi Cap Direct Plan-Growth" -- there is no `name` field.
  const normalizedTerm = term.toLowerCase();
  const match = candidates.find((c) => String(c.scheme_code) === String(amfiCode))
    || candidates.find((c) => cleanSearchTerm(c.title).toLowerCase() === normalizedTerm);
  return match ? match.search_id : null;
}

// Holdings arrive as positional arrays:
// [scheme_code, as_of_date, security_name, asset_class, sector,
//  instrument_type, null, market_value_cr, weightage_pct, null, null, stock_slug]
function normalizeHoldings(rawHoldings) {
  if (!Array.isArray(rawHoldings)) return [];
  return rawHoldings.map((h) => ({
    securityName: h[2] || '',
    assetClass: h[3] || 'OTHER',
    sector: h[4] || 'Unknown',
    marketValueCr: parseFloat(h[7]) || 0,
    weightagePct: parseFloat(h[8]) || 0,
    stockSlug: h[11] || null,
  }));
}

async function blobGet(amfiCode) {
  if (!BLOB_TOKEN) return null;
  try {
    const { list } = await import('@vercel/blob');
    const { blobs } = await list({ prefix: `${CACHE_PREFIX}${amfiCode}.json`, token: BLOB_TOKEN, limit: 1 });
    if (!blobs.length) return null;
    const res = await fetch(blobs[0].downloadUrl || blobs[0].url, {
      headers: { Authorization: `Bearer ${BLOB_TOKEN}`, 'Cache-Control': 'no-store' },
    });
    if (!res.ok) return null;
    const payload = await res.json();
    if (!isFresh(payload.ts)) return null;
    return payload.data;
  } catch {
    return null;
  }
}

async function blobPut(amfiCode, data) {
  if (!BLOB_TOKEN) return;
  try {
    const { put } = await import('@vercel/blob');
    await put(`${CACHE_PREFIX}${amfiCode}.json`, JSON.stringify({ data, ts: Date.now() }), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      token: BLOB_TOKEN,
    });
  } catch (e) {
    console.error('[portfolio-creator/holdings] Blob write failed:', e.message);
  }
}

// resolveSearchId's normalized-title fallback can land on a search candidate
// whose title superficially matches but whose scheme_code points at an
// unrelated fund -- e.g. Groww's own search index carries a mislabeled
// legacy candidate for "HDFC Multi Asset Fund" (search_id
// hdfc-multiple-yield-fund-plan-2005-direct-growth, scheme_code 119131,
// shared with an unrelated real fund). Confirm the resolved detail payload
// actually is the requested fund before trusting its holdings.
//
// Two independent ways to pass: (a) one of the detail's own scheme-code
// fields literally equals the requested amfiCode -- true for exact
// Direct-plan matches, or (b) the detail's own scheme_name normalizes
// (via cleanSearchTerm) to the same thing as the requested schemeName --
// true for legitimate Regular-plan resolutions, where the numeric codes
// differ from amfiCode by design (Groww's detail payload is Direct-plan
// centric) but the underlying fund identity is still correct.
//
// Verified live (2026-08-03): for the mismatched legacy candidate above,
// detail.scheme_name comes back as an unrelated internal slug
// ("hdfc-multi-asset-allocation-fund-direct-growth" -- a DIFFERENT fund's
// slug), which normalizes to "hdfc multi asset allocation" and does not
// match "HDFC Multi Asset Fund" ("hdfc multi asset"). Meanwhile a
// legitimate resolution like HDFC Flexi Cap Fund has detail.scheme_name
// "HDFC Flexi Cap Direct Plan Growth", which normalizes to "hdfc flexi cap"
// and matches the requested "HDFC Flexi Cap Fund - Growth Plan" the same
// way. That legit case's own scheme-code fields (scheme_code/direct_scheme_code
// = 118955) do NOT equal the requested Regular-plan amfiCode (101762) --
// confirming the code check alone isn't sufficient and the name-match
// fallback is required.
function schemeIdentityMatches(detail, amfiCode, schemeName) {
  const codeFields = [detail.scheme_code, detail.regular_scheme_code, detail.direct_scheme_code];
  if (codeFields.some((c) => c != null && String(c) === String(amfiCode))) return true;

  const detailName = cleanSearchTerm(detail.scheme_name).toLowerCase();
  const requestedName = cleanSearchTerm(schemeName).toLowerCase();
  return Boolean(detailName) && detailName === requestedName;
}

async function fetchFresh(amfiCode, schemeName) {
  const searchId = await resolveSearchId(amfiCode, schemeName);
  if (!searchId) return null;

  const detailRes = await fetch(`https://groww.in/v1/api/data/mf/web/v1/scheme/search/${searchId}`, { headers: FETCH_HEADERS });
  if (!detailRes.ok) return null;
  const detail = await detailRes.json();
  if (!detail || !Array.isArray(detail.holdings)) return null;
  if (!schemeIdentityMatches(detail, amfiCode, schemeName)) return null;

  return {
    schemeName: detail.scheme_name || schemeName,
    aum: detail.aum ?? null,
    expenseRatio: detail.expense_ratio ?? null,
    risk: detail.risk ?? null,
    category: detail.category ?? null,
    subCategory: detail.sub_category ?? null,
    benchmarkName: detail.benchmark_name ?? null,
    holdings: normalizeHoldings(detail.holdings),
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const amfiCode = searchParams.get('amfiCode');
  const schemeName = searchParams.get('schemeName');

  if (!amfiCode || !schemeName) {
    return Response.json({ error: 'amfiCode and schemeName are required' }, { status: 400 });
  }

  try {
    const mem = memCache.get(amfiCode);
    if (isFresh(mem?.ts)) {
      return Response.json({ ...mem.data, source: 'memory' });
    }

    const blobData = await blobGet(amfiCode);
    if (blobData) {
      memCache.set(amfiCode, { data: blobData, ts: Date.now() });
      return Response.json({ ...blobData, source: 'blob' });
    }

    if (inflight.has(amfiCode)) {
      const data = await inflight.get(amfiCode);
      if (!data) return Response.json({ error: 'No holdings data found for this fund' }, { status: 404 });
      return Response.json({ ...data, source: 'dedup' });
    }

    const fetchPromise = fetchFresh(amfiCode, schemeName)
      .then((data) => {
        if (data) {
          memCache.set(amfiCode, { data, ts: Date.now() });
          blobPut(amfiCode, data); // fire-and-forget
        }
        return data;
      })
      .finally(() => inflight.delete(amfiCode));
    inflight.set(amfiCode, fetchPromise);

    const data = await fetchPromise;
    if (!data) return Response.json({ error: 'No holdings data found for this fund' }, { status: 404 });
    return Response.json({ ...data, source: 'live' });
  } catch (err) {
    console.error('[portfolio-creator/holdings]', err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
