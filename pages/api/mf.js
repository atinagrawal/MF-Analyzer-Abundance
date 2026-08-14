/**
 * /api/mf — Resilient proxy for Indian mutual fund data
 *
 * SEARCH (?q=), in priority order:
 *   1. R2-stored scheme list (mf-scheme-list.json), refreshed daily by
 *      scripts/sync_mf_scheme_list.js, cached in-memory 1h per warm
 *      instance -- one R2 fetch on a cold instance's first search, instant
 *      for every request after (formerly a static bundled import; moved to
 *      R2 so a sync updates live search without a redeploy or growing repo
 *      history with a fresh ~1MB diff every day).
 *   2. AMFI NAVAll.txt, fetched live and cached in-memory 30 min — catches
 *      anything added/renamed since the last daily sync, or covers a cold
 *      instance whose first request beat the R2 fetch above (or found R2
 *      unavailable).
 *   3. api.mfapi.in — last resort. Live-tested (2026-08): highly
 *      inconsistent latency (0.5s-10s+ for the same query), which is why
 *      it's no longer tried first.
 *
 * LATEST NAV / FULL HISTORY (?code=): still api.mfapi.in first, falling
 * back to AMFI NAVAll.txt (latest NAV) or mf.captnemo.in via ISIN lookup
 * (full history) -- unrelated to the search path above, these need fresh
 * NAV data that a daily-synced name-only list can't provide.
 *
 * Client calls (unchanged from before):
 *   /api/mf?q=hdfc           → search by name
 *   /api/mf?code=125497      → full NAV history
 *   /api/mf?code=125497&latest=1 → latest NAV only
 *   /api/mf?codes=125497,119551&latest=1 → latest NAV for many codes in one
 *     round trip -- same mfapi.in-then-AMFI resolution as the single-code
 *     path above, just fanned out server-side instead of once per code from
 *     the browser. Response shape is deliberately different from the
 *     single-code path ({ navs: { code: nav } } vs { meta, data: [...] } )
 *     since callers here only ever want the number, not scheme metadata.
 */

import { r2Get } from '../../lib/r2';

export const config = { runtime: 'nodejs' };

// ── Module-level AMFI cache (warm function reuse across requests) ──
// Stores parsed NAVAll.txt: Map<schemeCode, {isin, isinReinvest, name, nav, date}>
let _amfiCache = null;
let _amfiCacheTime = 0;
const AMFI_TTL_MS = 30 * 60 * 1000; // 30 minutes
const AMFI_URL    = 'https://portal.amfiindia.com/spages/NAVAll.txt';

// ── Module-level static scheme-list cache (warm function reuse across requests) ──
// R2 itself only refreshes once a day, so an hour-long in-memory cache is
// plenty fresh while sparing every request but the first-per-warm-instance
// an R2 round-trip.
let _staticListCache = null;
let _staticListCacheTime = 0;
const STATIC_LIST_TTL_MS = 60 * 60 * 1000; // 1 hour

/** Fetch and cache the R2-stored { schemeCode: schemeName } map. Returns null on any failure. */
async function getStaticSchemeList() {
  const now = Date.now();
  if (_staticListCache && (now - _staticListCacheTime) < STATIC_LIST_TTL_MS) return _staticListCache;
  try {
    const payload = await r2Get('mf-scheme-list.json');
    _staticListCache = payload?.schemes || null;
    _staticListCacheTime = now;
  } catch (_) {
    return null; // leave any previous cache value stale rather than throwing
  }
  return _staticListCache;
}

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

/**
 * Search the R2-stored scheme list (scripts/sync_mf_scheme_list.js,
 * refreshed daily). Same matching rule as searchAmfi (every word must
 * appear in the name) so results are identical in shape/quality; this is
 * just a faster route to the same data for the common case.
 */
function searchStaticList(schemes, query) {
  const q = query.toLowerCase().replace(/\s+/g, ' ').trim();
  const words = q.split(' ').filter(Boolean);
  const results = [];

  for (const code in schemes) {
    const name = schemes[code].toLowerCase();
    if (words.every(w => name.includes(w))) {
      results.push({ schemeCode: parseInt(code, 10), schemeName: schemes[code] });
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

/** Parse AMFI "24-Nov-2016" → epoch ms (authoritative latest date) */
function parseAmfiDate(d) {
  const months = { Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11 };
  const m = /(\d{1,2})-([A-Za-z]{3})-(\d{4})/.exec(d || '');
  return m ? Date.UTC(+m[3], months[m[2]] ?? 0, +m[1]) : null;
}

/** Newest date (epoch ms) from an mfapi-style (newest-first) data array of DD-MM-YYYY */
function newestMfapiDate(data) {
  if (!data || !data.length) return null;
  const [dd, mm, yy] = data[0].date.split('-').map(Number);
  return Date.UTC(yy, mm - 1, dd);
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
  const codes  = url.searchParams.get('codes');
  const latest = url.searchParams.get('latest');

  if (q === null && !code && !codes) {
    return sendError(res, 400, 'Provide ?q= for search, ?code= for NAV data, or ?codes= for batch latest NAV', 'BAD_REQUEST');
  }

  // ── BATCH LATEST NAV (?codes=A,B,C&latest=1) ──
  if (codes) {
    if (!latest) {
      return sendError(res, 400, '?codes= currently only supports &latest=1 (batch full-history fetch is not supported)', 'BAD_REQUEST');
    }
    const uniqueCodes = [...new Set(codes.split(',').map(c => c.trim()).filter(Boolean))];
    if (!uniqueCodes.length) {
      return sendError(res, 400, '?codes= must contain at least one scheme code', 'BAD_REQUEST');
    }

    const navs = {};
    await Promise.allSettled(uniqueCodes.map(async (c) => {
      try {
        const r = await fetch(
          `https://api.mfapi.in/mf/${c}/latest`,
          { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(4000) }
        );
        if (r.ok) {
          const data = await r.json();
          if (data?.data?.length) {
            navs[c] = data.data[0].nav;
            return;
          }
        }
      } catch (_) { /* fall through to AMFI */ }

      try {
        const amfi = await getAmfiMap();
        const fund = amfi.get(String(c));
        if (fund) navs[c] = fund.nav;
      } catch (_) { /* leave unresolved -- caller falls back to CAS-reported NAV */ }
    }));

    return sendOk(res, { status: 'SUCCESS', navs }, 's-maxage=3600, stale-while-revalidate=7200');
  }

  // ── SEARCH ──
  if (q !== null) {
    // 1. R2-stored scheme list (scripts/sync_mf_scheme_list.js, refreshed
    // daily), cached in-memory 1h per warm instance -- instant except for
    // a cold instance's first search, which pays one R2 round-trip.
    try {
      const schemes = await getStaticSchemeList();
      if (schemes) {
        const results = searchStaticList(schemes, q);
        if (results.length > 0) {
          return sendOk(res, results, 's-maxage=86400, stale-while-revalidate=172800');
        }
      }
    } catch (_) { /* fall through to live AMFI */ }

    // 2. AMFI's own live NAVAll.txt -- catches anything added/renamed since
    // the last daily sync. Fast and reliable once the 30-min in-memory
    // cache is warm. mfapi.in used to be tried before either of these, but
    // live testing (2026-08) showed it's highly inconsistent -- the SAME
    // query took anywhere from 0.5s to a full 10s timeout across 3
    // consecutive tries -- meaning every search was frequently waiting out
    // this route's 4s timeout before even reaching a reliable fallback.
    try {
      const amfi    = await getAmfiMap();
      const results = searchAmfi(amfi, q);
      if (results.length > 0) {
        return sendOk(res, results, 's-maxage=86400, stale-while-revalidate=172800');
      }
    } catch (_) { /* fall through to mfapi */ }

    // 3. mfapi.in: last resort, only reached if both AMFI-backed searches
    // above are unavailable or came up empty (mfapi's own search may catch
    // a fuzzier query neither matched) -- rare, since AMFI's NAVAll.txt is
    // the ground truth for every registered scheme.
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

    return sendError(res, 502, 'Search unavailable — static list, live AMFI, and mfapi.in all failed or found nothing', 'UPSTREAM_DOWN');
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
    // Try mfapi first (the authoritative source). Retry once and use a generous
    // timeout: history is not latency-critical, and failing over too eagerly is
    // dangerous — the ISIN-based fallback below can return a DIFFERENT scheme's
    // data when an ISIN survived an AMC transfer (e.g. JPMorgan→Edelweiss, where
    // ISIN INF843K01013 still resolves to the frozen 2007–2016 JPMorgan series).
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(
          `https://api.mfapi.in/mf/${code}`,
          { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(12000) }
        );
        if (r.ok) {
          const data = await r.json();
          if (data && Array.isArray(data.data) && data.data.length) {
            return sendOk(res, data, 's-maxage=14400, stale-while-revalidate=86400');
          }
        }
      } catch (_) { /* retry, then fall through to fallback */ }
    }

    // captnemo fallback (ISIN-based). Guarded against stale/cross-mapped lineage.
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
      // Use AMFI's CURRENT name — captnemo may carry the pre-transfer scheme name.
      data.meta.scheme_name = fund.name;

      // Freshness guard: AMFI knows the fund's true latest NAV date. If the
      // fallback series ends far earlier, the ISIN is pointing at a predecessor
      // (pre-transfer) lineage — refuse it rather than serve mislabelled data.
      const amfiLatest = parseAmfiDate(fund.date);
      const capLatest  = newestMfapiDate(data.data);
      if (amfiLatest && capLatest && (amfiLatest - capLatest) > 45 * 24 * 60 * 60 * 1000) {
        throw new Error(`fallback history for ISIN ${isin} ends ${data.data[0].date}, far behind AMFI's latest — likely a pre-transfer predecessor series; refusing to serve mismatched data`);
      }

      return sendOk(res, data, 's-maxage=3600, stale-while-revalidate=7200');

    } catch (e) {
      return sendError(
        res, 502,
        `NAV history unavailable — mfapi.in is slow/unreachable and the fallback was unsafe: ${e.message}`,
        'UPSTREAM_DOWN'
      );
    }
  }
}
