/**
 * lib/holdingsLookup.js
 *
 * Fund/SIF holdings lookup — resolves a scheme (by AMFI/SIF scheme code +
 * name) against an external scheme-detail data source and returns its
 * holdings plus scheme-level fields (AUM, expense ratio, risk, category,
 * min investment amounts). Cached in-memory -> Cloudflare R2 -> live fetch,
 * same 3-layer pattern as pages/api/nifty-tri.js. Holdings change at most
 * monthly, so a 7-day TTL is generous without going stale.
 *
 * Extracted from app/api/proposal-studio/holdings/route.js so it can be
 * called in-process (no extra HTTP round trip) by server-side routes that
 * need to enforce a plan-based entitlement on the result -- that route
 * itself stays a public, unauthenticated wrapper around getHoldingsData()
 * unchanged, since it's also used by Proposal Studio's public share-link
 * viewers, who are gated by link possession, not personal Pro status.
 *
 * `amfiCode` also accepts a SIF scheme_id (e.g. "SIF-120", the same value
 * /api/sif-nav exposes as `scheme_id`) -- verified live (2026-08-03) that
 * this same data source resolves SIFs too (flagged `sifScheme: true` in its
 * detail payload) with holdings in the identical positional-array shape, no
 * special-casing needed here.
 */

import amfiAum from '@/data/amfi-aum.json';
import sifAum from '@/data/sif-aum.json';
import amfiSchemeRisk from '@/data/amfi-scheme-risk.json';
import { fetchRiskometer, matchBenchmarkRisk, matchOwnSchemeRisk } from '@/lib/riskometer';
import { r2Get, r2Put } from '@/lib/r2';
import pool from '@/lib/db';

const CACHE_PREFIX = 'portfolio-creator-holdings/';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

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
// however the fund's canonical name is indexed.
function cleanSearchTerm(schemeName) {
  return (schemeName || '')
    .replace(/\s*\([^)]*formerly known as[^)]*\)/gi, '')
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\b(Direct|Regular)\b/gi, '')
    .replace(/\b(Super\s+Institutional|Institutional|Retail|Unclaimed\s+Redemption|Unclaimed\s+Dividend|Unclaimed)\b/gi, '')
    .replace(/\bPlan(\s+[A-Z])?\b/gi, '')
    .replace(/\b(Growth|IDCW|Dividend)\b/gi, '')
    .replace(/\b(Payout|Reinvestment|Reinvest|Bonus|Option|Quarterly|Monthly|Weekly|Daily|Annual)\b/gi, '')
    .replace(/\bFund\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const MONTH_ABBR = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
function parseVendorLaunchDate(raw) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec((raw || '').trim());
  if (!m) return null;
  const month = MONTH_ABBR[m[2].toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[1].padStart(2, '0')}`;
}

async function fetchWithRetry(url, options = {}, retries = 2, delayMs = 600) {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.status === 429 || res.status === 503) {
        if (i < retries) {
          await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
          continue;
        }
      }
      return res;
    } catch (err) {
      if (i < retries) {
        await new Promise((r) => setTimeout(r, delayMs * (i + 1)));
        continue;
      }
      throw err;
    }
  }
}

async function resolveSearchId(amfiCode, schemeName) {
  const term = cleanSearchTerm(schemeName);
  const url = `https://groww.in/v1/api/search/v1/entity?app=false&entity_type=scheme&q=${encodeURIComponent(term)}&page=0&size=5`;
  const res = await fetchWithRetry(url, { headers: FETCH_HEADERS });
  if (!res || !res.ok) return null;
  const json = await res.json();
  const candidates = json?.content || [];
  const normalizedTerm = term.toLowerCase();

  const match = candidates.find((c) => String(c.scheme_code) === String(amfiCode))
    || candidates.find((c) => cleanSearchTerm(c.title).toLowerCase() === normalizedTerm)
    || candidates.find((c) => {
         const candNorm = cleanSearchTerm(c.title).toLowerCase();
         return candNorm.length >= 3 && (candNorm.includes(normalizedTerm) || normalizedTerm.includes(candNorm));
       });

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
  try {
    const payload = await r2Get(`${CACHE_PREFIX}${amfiCode}.json`);
    if (!payload || !isFresh(payload.ts)) return null;
    return payload.data;
  } catch {
    return null;
  }
}

async function blobPut(amfiCode, data) {
  try {
    await r2Put(`${CACHE_PREFIX}${amfiCode}.json`, JSON.stringify({ data, ts: Date.now() }));
  } catch (e) {
    console.error('[holdingsLookup] Blob write failed:', e.message);
  }
}

// resolveSearchId's normalized-title fallback can land on a search candidate
// whose title superficially matches but whose scheme_code points at an
// unrelated fund. Confirm the resolved detail payload actually is the
// requested fund before trusting its holdings. See git history for the
// live-verified HDFC Multi Asset Fund example this guard was added for.
const KNOWN_SLUG_ALIASES = [
  { pattern: /tata.*child/i, slugs: ['tata-young-citizens-fund-direct-growth', 'tata-childrens-fund-direct-plan-growth'] },
  { pattern: /axis.*child.*no\s*lock/i, slugs: ["axis-children's-fund-direct-no-lock-in-growth"] },
  { pattern: /axis.*child.*lock/i, slugs: ["axis-children's-fund-direct-compulsory-lock-in-growth"] },
  { pattern: /hdfc.*child/i, slugs: ["hdfc-children's-fund-direct-plan"] },
  { pattern: /sbi.*child.*invest/i, slugs: ["sbi-children's-fund-investment-plan-direct-growth"] },
  { pattern: /sbi.*child.*sav/i, slugs: ["sbi-children's-fund-savings-plan-direct-growth"] },
];

function schemeIdentityMatches(detail, amfiCode, schemeName) {
  const codeFields = [detail.scheme_code, detail.regular_scheme_code, detail.direct_scheme_code];
  if (codeFields.some((c) => c != null && String(c) === String(amfiCode))) return true;

  const detailName = cleanSearchTerm(detail.scheme_name).toLowerCase();
  const requestedName = cleanSearchTerm(schemeName).toLowerCase();
  if (Boolean(detailName) && detailName === requestedName) return true;

  const reqNorm = requestedName.replace(/['`’]/g, '');
  const detailNorm = detailName.replace(/['`’]/g, '');
  if (reqNorm === detailNorm) return true;

  const reqTokens = reqNorm.split(/\s+/).filter((w) => w.length > 2);
  const detailTokens = detailNorm.split(/\s+/).filter((w) => w.length > 2);
  if (!reqTokens.length || !detailTokens.length) return false;

  const matches = reqTokens.filter((t) => detailTokens.includes(t));
  return matches.length / reqTokens.length >= 0.5;
}

async function fetchFresh(amfiCode, schemeName) {
  const aliasMatch = KNOWN_SLUG_ALIASES.find((a) => a.pattern.test(schemeName));
  if (aliasMatch) {
    for (const slug of aliasMatch.slugs) {
      try {
        const aliasRes = await fetchWithRetry(`https://groww.in/v1/api/data/mf/web/v1/scheme/search/${slug}`, { headers: FETCH_HEADERS });
        if (aliasRes && aliasRes.ok) {
          const detail = await aliasRes.json();
          if (detail && Array.isArray(detail.holdings) && detail.holdings.length > 0) {
            return formatDetailResponse(detail, amfiCode, schemeName);
          }
        }
      } catch {}
    }
  }

  const searchId = await resolveSearchId(amfiCode, schemeName);
  if (!searchId) return null;

  const detailRes = await fetchWithRetry(`https://groww.in/v1/api/data/mf/web/v1/scheme/search/${searchId}`, { headers: FETCH_HEADERS });
  if (!detailRes || !detailRes.ok) return null;
  const detail = await detailRes.json();
  if (!detail || !Array.isArray(detail.holdings)) return null;
  if (!schemeIdentityMatches(detail, amfiCode, schemeName)) return null;

  return formatDetailResponse(detail, amfiCode, schemeName);
}

async function resolveScreenerRecord(amfiCode, schemeName, detail = {}) {
  try {
    const codesToTry = [
      amfiCode,
      detail.scheme_code,
      detail.direct_scheme_code,
      detail.regular_scheme_code,
    ].filter(Boolean).map(String);

    const term = cleanSearchTerm(schemeName);

    for (const c of codesToTry) {
      const res = await pool.query(
        `SELECT code, name, ret_1y, ret_3y, ret_5y, ret_inception FROM mf_screener WHERE code = $1`,
        [c]
      );
      if (res.rows.length) {
        const row = res.rows[0];
        if (cleanSearchTerm(row.name).toLowerCase() === term.toLowerCase() || res.rows.length === 1) {
          return row;
        }
      }
    }

    if (detail.isin) {
      const res = await pool.query(
        `SELECT code, name, ret_1y, ret_3y, ret_5y, ret_inception FROM mf_screener WHERE isin = $1 LIMIT 1`,
        [detail.isin]
      );
      if (res.rows.length) return res.rows[0];
    }

    if (term.length >= 3) {
      const res = await pool.query(
        `SELECT code, name, ret_1y, ret_3y, ret_5y, ret_inception FROM mf_screener WHERE name ILIKE $1 ORDER BY length(name) ASC LIMIT 1`,
        [`%${term}%`]
      );
      if (res.rows.length) return res.rows[0];
    }
  } catch (err) {
    console.warn('[holdingsLookup] screener lookup error:', err.message);
  }
  return null;
}

async function ensureReturns(data, amfiCode, schemeName) {
  if (!data) return data;
  if (data.ret1y !== undefined || data.ret3y !== undefined || data.ret5y !== undefined || data.retInception !== undefined) {
    return data;
  }
  const screenerRec = await resolveScreenerRecord(amfiCode, schemeName);
  const parseNum = (v) => (v != null && !isNaN(v) ? parseFloat(v) : null);
  data.ret1y = parseNum(screenerRec?.ret_1y);
  data.ret3y = parseNum(screenerRec?.ret_3y);
  data.ret5y = parseNum(screenerRec?.ret_5y);
  data.retInception = parseNum(screenerRec?.ret_inception);
  // Persist the enrichment so a cold instance reading straight from R2
  // (bypassing this instance's in-memory cache) doesn't re-run
  // resolveScreenerRecord() on every request for up to the blob's own TTL.
  // Fire-and-forget, same pattern getHoldingsData() already uses for its
  // own R2 writes; blobPut() already self-catches write failures.
  blobPut(amfiCode, data);
  return data;
}

async function formatDetailResponse(detail, amfiCode, schemeName) {
  // amfiAum is keyed by plain numeric AMFI codes, sifAum by "SIF-XXX" --
  // the two key spaces never overlap, so a plain fallback is safe.
  const aumRecord = amfiAum[amfiCode] || sifAum[amfiCode] || null;
  const resolvedSchemeName = detail.scheme_name || schemeName;

  let risk = detail.risk ?? null;
  let riskSource = risk ? 'own' : null;
  if (!risk) {
    const ownSchemeRisk = matchOwnSchemeRisk(resolvedSchemeName, amfiSchemeRisk.risk);
    if (ownSchemeRisk) {
      risk = ownSchemeRisk;
      riskSource = 'amfi';
    }
  }
  if (!risk && detail.benchmark_name) {
    const riskMap = await fetchRiskometer();
    const benchmarkRisk = matchBenchmarkRisk(detail.benchmark_name, riskMap);
    if (benchmarkRisk) {
      risk = benchmarkRisk.label;
      riskSource = 'benchmark';
    }
  }

  const screenerRec = await resolveScreenerRecord(amfiCode, resolvedSchemeName, detail);
  const parseNum = (v) => (v != null && !isNaN(v) ? parseFloat(v) : null);

  return {
    schemeName: resolvedSchemeName,
    aum: detail.aum ?? null,
    aumCr: aumRecord?.aumCr ?? null,
    aumAsOf: aumRecord?.asOf ?? null,
    launchDate: aumRecord?.launchDate ?? parseVendorLaunchDate(detail.launch_date),
    expenseRatio: detail.expense_ratio ?? null,
    risk,
    riskSource,
    category: detail.category ?? (aumRecord?.category ? aumRecord.category.split(' - ').pop() : null),
    subCategory: detail.sub_category ?? null,
    benchmarkName: detail.benchmark_name ?? null,
    minInvestment: detail.min_investment_amount ?? null,
    minSipInvestment: detail.min_sip_investment ?? null,
    ret1y: parseNum(screenerRec?.ret_1y ?? detail.ret_1y ?? detail.return_1y ?? detail.return_stats?.return_1y),
    ret3y: parseNum(screenerRec?.ret_3y ?? detail.ret_3y ?? detail.return_3y ?? detail.return_stats?.return_3y),
    ret5y: parseNum(screenerRec?.ret_5y ?? detail.ret_5y ?? detail.return_5y ?? detail.return_stats?.return_5y),
    retInception: parseNum(screenerRec?.ret_inception ?? detail.ret_inception ?? detail.return_inception ?? detail.return_stats?.return_inception),
    holdings: normalizeHoldings(detail.holdings),
  };
}

/**
 * Resolves full holdings + scheme-level detail for a fund or SIF, via the
 * memory -> R2 -> live-fetch cache chain. Returns null if the scheme
 * couldn't be resolved at all. ALWAYS returns the FULL holdings array --
 * callers that need to withhold holdings beyond a free-tier preview must
 * apply truncateHoldingsForFreeTier() themselves; this function has no
 * concept of plan/entitlement.
 */
export async function getHoldingsData(amfiCode, schemeName) {
  const mem = memCache.get(amfiCode);
  if (isFresh(mem?.ts)) {
    const data = await ensureReturns(mem.data, amfiCode, schemeName);
    return { ...data, source: 'memory' };
  }

  const blobData = await blobGet(amfiCode);
  if (blobData) {
    const data = await ensureReturns(blobData, amfiCode, schemeName);
    memCache.set(amfiCode, { data, ts: Date.now() });
    return { ...data, source: 'blob' };
  }

  if (inflight.has(amfiCode)) {
    const data = await inflight.get(amfiCode);
    if (!data) return null;
    const enrichedData = await ensureReturns(data, amfiCode, schemeName);
    return { ...enrichedData, source: 'dedup' };
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
  if (!data) return null;
  const enrichedData = await ensureReturns(data, amfiCode, schemeName);
  return { ...enrichedData, source: 'live' };
}

/**
 * Given a getHoldingsData() result, returns a shallow copy whose `holdings`
 * array is truncated to the same free-tier preview HoldingsSection.jsx
 * already renders (top 10 equity holdings, or top 10 of everything if the
 * scheme has no equity holdings), plus a `totalHoldingsCount` field
 * carrying the TRUE count so the UI can still say "10 of 47" without the
 * other 37 ever reaching a non-Pro browser.
 */
export function truncateHoldingsForFreeTier(data) {
  if (!data || !Array.isArray(data.holdings)) return data;
  const equityHoldings = data.holdings.filter((h) => h.assetClass === 'EQUITY');
  const activeHoldings = equityHoldings.length > 0 ? equityHoldings : data.holdings;
  return {
    ...data,
    holdings: activeHoldings.slice(0, 10),
    totalHoldingsCount: activeHoldings.length,
  };
}
