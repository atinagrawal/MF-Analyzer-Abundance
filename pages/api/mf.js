/**
 * /api/mf — Resilient proxy for Indian mutual fund data
 *
 * PRIMARY:  api.mfapi.in  (free, full-featured, single point of failure)
 * FALLBACK 1 (search + latest NAV): AMFI NAVAll.txt — official government source
 * FALLBACK 2 (full history):        mf.captnemo.in  — ISIN-based, Netlify static
 *
 * Client calls (unchanged from before):
 *   /api/mf?q=hdfc           → search by name
 *   /api/mf?code=125497      → full NAV history
 *   /api/mf?code=125497&latest=1 → latest NAV only
 *
 * Fixes applied vs previous version:
 *   1. Timeout reduced 10s → 4s (fail fast, UX)
 *   2. Error responses now served with Cache-Control: no-store (prevents CDN caching 502s)
 *   3. Search cache bumped 5min → 24h (fund names rarely change)
 *   4. errorCode field added to all errors so frontend can distinguish reasons
 *   5. AMFI fallback for search + latest NAV (survives mfapi outages)
 *   6. captnemo fallback for full history via ISIN lookup
 */

export const config = { runtime: 'nodejs' };

// ── Module-level AMFI cache (warm function reuse across requests) ──
// Stores parsed NAVAll.txt: Map<schemeCode, {isin, isinReinvest, name, nav, date}>
let _amfiCache = null;
let _amfiCacheTime = 0;
const AMFI_TTL_MS = 30 * 60 * 1000; // 30 minutes
const AMFI_URL    = 'https://portal.amfiindia.com/spages/NAVAll.txt';

// ── Helpers ──

/** Parse AMFI NAVAll.txt into a Map keyed by scheme code */
function parseNavAll(text) {
  const map = new Map();
  for (const line of text.split('\n')) {
    const parts = line.trim().split(';');
    if (parts.length < 6) continue;
    const code = parts[0].trim();
    if (!/^\d{5,6}$/.test(code)) continue;
    map.set(code, {
      isin:          parts[1].trim(),
      isinReinvest:  parts[2].trim() === '-' ? null : parts[2].trim(),
      name:          parts[3].trim(),
      nav:           parts[4].trim(),
      date:          parts[5].trim(),
    });
  }
  return map;
}

/** Fetch and cache the AMFI NAVAll.txt file */
async function getAmfiMap() {
  const now = Date.now();
  if (_amfiCache && (now - _amfiCacheTime) < AMFI_TTL_MS) return _amfiCache;

  const r = await fetch(AMFI_URL, {
    headers: { 'Accept': 'text/plain' },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`AMFI NAVAll.txt returned HTTP ${r.status}`);
  const text = await r.text();
  _amfiCache = parseNavAll(text);
  _amfiCacheTime = now;
  return _amfiCache;
}

/** Simple fuzzy fund name search against AMFI map */
function searchAmfi(amfi, query) {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const words = q.split(' ').filter(Boolean);
  const results = [];

  for (const [code, fund] of amfi) {
    const name = fund.name.toLowerCase();
    // All words must appear in the fund name
    if (words.every(w => name.includes(w))) {
      results.push({ schemeCode: parseInt(code, 10), schemeName: fund.name });
    }
    if (results.length >= 30) break;
  }
  return results;
}

/** Convert DD-Mon-YYYY (AMFI) to DD-MM-YYYY (mfapi format) */
function amfiDateToMfapi(d) {
  const months = {
    'Jan':'01','Feb':'02','Mar':'03','Apr':'04','May':'05','Jun':'06',
    'Jul':'07','Aug':'08','Sep':'09','Oct':'10','Nov':'11','Dec':'12'
  };
  // Handles "20-Mar-2026" → "20-03-2026"
  return d.replace(/-([A-Za-z]{3})-/, (_, m) => `-${months[m] || '00'}-`);
}

/** Convert captnemo date YYYY-MM-DD → DD-MM-YYYY */
function captnemoDateToMfapi(d) {
  const [y, m, dd] = d.split('-');
  return `${dd}-${m}-${y}`;
}

/** Build mfapi-compatible response from AMFI single entry (latest NAV) */
function buildLatestFromAmfi(code, fund) {
  return {
    meta: {
      fund_house: '',
      scheme_type: '',
      scheme_category: '',
      scheme_code: parseInt(code, 10),
      scheme_name: fund.name,
      isin_growth: fund.isin || null,
      isin_div_reinvestment: fund.isinReinvest || null,
    },
    data: [{
      date: amfiDateToMfapi(fund.date),
      nav:  fund.nav,
    }],
    status: 'SUCCESS',
    _source: 'amfi-fallback',
  };
}

/** Build mfapi-compatible full history from captnemo response */
function buildHistoryFromCaptnemo(code, capData) {
  // captnemo historical_nav: [["YYYY-MM-DD", nav], ...]  newest-first or oldest-first
  const data = (capData.historical_nav || []).map(([d, nav]) => ({
    date: captnemoDateToMfapi(d),
    nav:  String(nav),
  }));
  // mfapi returns newest-first
  data.sort((a, b) => {
    const [ad, am, ay] = a.date.split('-').map(Number);
    const [bd, bm, by] = b.date.split('-').map(Number);
    return (by - ay) || (bm - am) || (bd - ad);
  });
  return {
    meta: {
      fund_house: '',
      scheme_type: '',
      scheme_category: '',
      scheme_code: parseInt(code, 10),
      scheme_name: capData.name || '',
      isin_growth: capData.ISIN || null,
      isin_div_reinvestment: null,
    },
    data,
    status: 'SUCCESS',
    _source: 'captnemo-fallback',
  };
}

/** Emit an error response — always with no-store so CDN never caches errors */
function sendError(res, status, msg, errorCode = 'UNKNOWN') {
  res.setHeader('Cache-Control', 'no-store, no-cache');
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(status).json({ error: msg, errorCode });
}

/** Emit a successful JSON response with appropriate cache headers */
function sendOk(res, data, cacheHeader) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', cacheHeader);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.status(200).json(data);
}

// ── Main handler ──
export default async function handler(req, res) {
  const url    = new URL(req.url, 'https://x');
  const q      = url.searchParams.get('q');
  const code   = url.searchParams.get('code');
  const latest = url.searchParams.get('latest');

  if (q === null && !code) {
    return sendError(res, 400, 'Provide ?q= for search or ?code= for NAV data', 'BAD_REQUEST');
  }

  // ── SEARCH ──
  if (q !== null) {
    // Try mfapi first
    try {
      const r = await fetch(
        `https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000) }
      );
      if (r.ok) {
        const data = await r.json();
        return sendOk(res, data, 's-maxage=86400, stale-while-revalidate=172800');
      }
    } catch (_) { /* fall through */ }

    // AMFI fallback: parse NAVAll.txt and search by name
    try {
      const amfi    = await getAmfiMap();
      const results = searchAmfi(amfi, q);
      return sendOk(res, results, 's-maxage=86400, stale-while-revalidate=172800');
    } catch (e) {
      return sendError(res, 502, 'Search unavailable — both mfapi.in and AMFI fallback failed: ' + e.message, 'UPSTREAM_DOWN');
    }
  }

  // ── LATEST NAV only ──
  if (code && latest) {
    try {
      const r = await fetch(
        `https://api.mfapi.in/mf/${code}/latest`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000) }
      );
      if (r.ok) {
        const data = await r.json();
        return sendOk(res, data, 's-maxage=3600, stale-while-revalidate=7200');
      }
    } catch (_) { /* fall through */ }

    // AMFI fallback: look up by scheme code in NAVAll.txt
    try {
      const amfi = await getAmfiMap();
      const fund = amfi.get(String(code));
      if (!fund) return sendError(res, 404, `Scheme code ${code} not found`, 'NOT_FOUND');
      const data = buildLatestFromAmfi(code, fund);
      return sendOk(res, data, 's-maxage=3600, stale-while-revalidate=7200');
    } catch (e) {
      return sendError(res, 502, 'Latest NAV unavailable — both mfapi.in and AMFI fallback failed: ' + e.message, 'UPSTREAM_DOWN');
    }
  }

  // ── FULL NAV HISTORY ──
  if (code) {
    // Try mfapi first
    try {
      const r = await fetch(
        `https://api.mfapi.in/mf/${code}`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000) }
      );
      if (r.ok) {
        const data = await r.json();
        return sendOk(res, data, 's-maxage=14400, stale-while-revalidate=86400');
      }
    } catch (_) { /* fall through */ }

    // captnemo fallback: need ISIN → fetch from AMFI map first
    try {
      const amfi = await getAmfiMap();
      const fund = amfi.get(String(code));
      if (!fund || !fund.isin || fund.isin === '-') {
        throw new Error(`No ISIN found for scheme ${code} in AMFI data`);
      }
      const isin = fund.isin;

      const cr = await fetch(
        `https://mf.captnemo.in/nav/${isin}`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
      );
      if (!cr.ok) throw new Error(`captnemo returned HTTP ${cr.status} for ISIN ${isin}`);
      const capData = await cr.json();
      if (!capData.historical_nav?.length) throw new Error('captnemo returned empty history');

      const data = buildHistoryFromCaptnemo(code, capData);
      // Shorter cache for fallback — encourage re-checking mfapi when it recovers
      return sendOk(res, data, 's-maxage=3600, stale-while-revalidate=7200');

    } catch (e) {
      return sendError(
        res, 502,
        `NAV history unavailable — mfapi.in is down and fallback failed: ${e.message}`,
        'UPSTREAM_DOWN'
      );
    }
  }
}
