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

import { fetchRiskometer, matchBenchmarkRisk, matchOwnSchemeRisk } from './riskometer.js';
import { r2Get, r2Put } from './r2.js';
import { createR2JsonCache } from './r2JsonCache.js';
import pool from './db.js';

// amfi-aum.json, sif-aum.json, amfi-scheme-risk.json used to be statically
// imported here -- committed to git and rebuilt into the deploy bundle by
// their own monthly sync jobs. Now R2-backed (see scripts/sync_amfi_aum.js,
// sync_sif_aum.js, sync_scheme_riskometer.js), cached in-memory 1h per warm
// instance.
const getAmfiAum = createR2JsonCache('amfi-aum.json');
const getSifAum = createR2JsonCache('sif-aum.json');
const getAmfiSchemeRisk = createR2JsonCache('amfi-scheme-risk.json');

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

function normalizeCapSpaces(str) {
  return (str || '')
    .replace(/\bmid\s+cap\b/gi, 'midcap')
    .replace(/\bsmall\s+cap\b/gi, 'smallcap')
    .replace(/\blarge\s+cap\b/gi, 'largecap')
    .replace(/\bflexi\s+cap\b/gi, 'flexicap')
    .replace(/\bmulti\s+cap\b/gi, 'multicap')
    .replace(/\bhealth\s+care\b/gi, 'healthcare');
}

function canonicalAlphaNumeric(str) {
  return (str || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

async function resolveSearchId(amfiCode, schemeName) {
  const term = cleanSearchTerm(schemeName);
  const url = `https://groww.in/v1/api/search/v1/entity?app=false&entity_type=scheme&q=${encodeURIComponent(term)}&page=0&size=5`;
  const res = await fetchWithRetry(url, { headers: FETCH_HEADERS });
  if (!res || !res.ok) return null;
  const json = await res.json();
  const candidates = json?.content || [];
  const normalizedTerm = normalizeCapSpaces(term).toLowerCase();
  const canonicalTerm = canonicalAlphaNumeric(term);

  // 1. Direct scheme code match
  let match = candidates.find((c) => String(c.scheme_code) === String(amfiCode));
  if (match) return match.search_id;

  // 2. Canonical alphanumeric exact match (handles "Mid Cap" vs "Midcap", punctuation, etc.)
  match = candidates.find((c) => canonicalAlphaNumeric(cleanSearchTerm(c.title)) === canonicalTerm);
  if (match) return match.search_id;

  // 3. Normalized cap spaces match
  match = candidates.find((c) => normalizeCapSpaces(cleanSearchTerm(c.title)).toLowerCase() === normalizedTerm);
  if (match) return match.search_id;

  // 4. Token subset match (all significant words of query present in candidate title)
  const queryTokens = normalizedTerm.split(/\s+/).filter((w) => w.length > 2);
  match = candidates.find((c) => {
    const candNorm = normalizeCapSpaces(cleanSearchTerm(c.title)).toLowerCase();
    return queryTokens.length >= 2 && queryTokens.every((tok) => candNorm.includes(tok));
  });
  if (match) return match.search_id;

  // 5. Substring match on canonical alphanumeric
  match = candidates.find((c) => {
    const candCanon = canonicalAlphaNumeric(cleanSearchTerm(c.title));
    return candCanon.length >= 5 && (candCanon.includes(canonicalTerm) || canonicalTerm.includes(candCanon));
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

  const detailCanon = canonicalAlphaNumeric(cleanSearchTerm(detail.scheme_name));
  const reqCanon = canonicalAlphaNumeric(cleanSearchTerm(schemeName));
  if (detailCanon && reqCanon && (detailCanon === reqCanon || detailCanon.includes(reqCanon) || reqCanon.includes(detailCanon))) return true;

  const detailName = normalizeCapSpaces(cleanSearchTerm(detail.scheme_name)).toLowerCase();
  const requestedName = normalizeCapSpaces(cleanSearchTerm(schemeName)).toLowerCase();
  if (Boolean(detailName) && detailName === requestedName) return true;

  const reqTokens = requestedName.split(/\s+/).filter((w) => w.length > 2);
  const detailTokens = detailName.split(/\s+/).filter((w) => w.length > 2);
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

async function computeReturnsFromNavHistory(code) {
  if (!code || !/^\d+$/.test(String(code))) return null;
  try {
    const latestRes = await pool.query(
      `SELECT nav, nav_date FROM mf_nav_history WHERE code = $1 ORDER BY nav_date DESC LIMIT 1`,
      [String(code)]
    );
    if (!latestRes.rows.length) return null;
    const latestNav = parseFloat(latestRes.rows[0].nav);
    const latestDate = new Date(latestRes.rows[0].nav_date);

    async function getNavAroundDate(targetDate) {
      const targetStr = targetDate.toISOString().split('T')[0];
      const res = await pool.query(
        `SELECT nav, nav_date FROM mf_nav_history 
         WHERE code = $1 AND nav_date <= $2 
         ORDER BY nav_date DESC LIMIT 1`,
        [String(code), targetStr]
      );
      if (!res.rows.length) return null;
      return { nav: parseFloat(res.rows[0].nav), date: new Date(res.rows[0].nav_date) };
    }

    const oldestRes = await pool.query(
      `SELECT nav, nav_date FROM mf_nav_history WHERE code = $1 ORDER BY nav_date ASC LIMIT 1`,
      [String(code)]
    );
    const oldestNav = oldestRes.rows.length ? parseFloat(oldestRes.rows[0].nav) : null;
    const oldestDate = oldestRes.rows.length ? new Date(oldestRes.rows[0].nav_date) : null;

    const d1y = new Date(latestDate);
    d1y.setFullYear(d1y.getFullYear() - 1);
    const nav1y = await getNavAroundDate(d1y);

    const d3y = new Date(latestDate);
    d3y.setFullYear(d3y.getFullYear() - 3);
    const nav3y = await getNavAroundDate(d3y);

    const d5y = new Date(latestDate);
    d5y.setFullYear(d5y.getFullYear() - 5);
    const nav5y = await getNavAroundDate(d5y);

    function cagr(startNav, endNav, years) {
      if (!startNav || !endNav || startNav <= 0 || endNav <= 0 || years <= 0) return null;
      return (Math.pow(endNav / startNav, 1 / years) - 1) * 100;
    }

    const ret1y = nav1y && (latestDate - nav1y.date) / (365.25 * 86400000) >= 0.9 ? cagr(nav1y.nav, latestNav, 1) : null;
    const ret3y = nav3y && (latestDate - nav3y.date) / (365.25 * 86400000) >= 2.9 ? cagr(nav3y.nav, latestNav, 3) : null;
    const ret5y = nav5y && (latestDate - nav5y.date) / (365.25 * 86400000) >= 4.9 ? cagr(nav5y.nav, latestNav, 5) : null;

    let retInception = null;
    if (oldestNav && oldestDate) {
      const yearsInception = (latestDate - oldestDate) / (365.25 * 86400000);
      if (yearsInception >= 0.5) {
        retInception = cagr(oldestNav, latestNav, yearsInception);
      } else if (yearsInception > 0) {
        retInception = ((latestNav - oldestNav) / oldestNav) * 100;
      }
    }

    return {
      ret1y: ret1y != null ? Math.round(ret1y * 100) / 100 : null,
      ret3y: ret3y != null ? Math.round(ret3y * 100) / 100 : null,
      ret5y: ret5y != null ? Math.round(ret5y * 100) / 100 : null,
      retInception: retInception != null ? Math.round(retInception * 100) / 100 : null,
    };
  } catch (err) {
    console.warn('[holdingsLookup] computeReturnsFromNavHistory error:', err.message);
    return null;
  }
}

async function resolveFundReturns(amfiCode, schemeName, detail = {}) {
  const parseNum = (v) => (v != null && !isNaN(v) ? parseFloat(v) : null);
  const isSif = String(amfiCode).startsWith('SIF-');

  // 1. SIF Screener check
  if (isSif) {
    try {
      const sifRes = await pool.query(
        `SELECT ret_1y, ret_3y, ret_5y, ret_inception FROM sif_screener WHERE scheme_id = $1 LIMIT 1`,
        [amfiCode]
      );
      if (sifRes.rows.length) {
        const r = sifRes.rows[0];
        return {
          ret1y: parseNum(r.ret_1y),
          ret3y: parseNum(r.ret_3y),
          ret5y: parseNum(r.ret_5y),
          retInception: parseNum(r.ret_inception),
        };
      }
    } catch {}
  }

  // 2. MF Screener check by code
  const codesToTry = [
    amfiCode,
    detail.scheme_code,
    detail.direct_scheme_code,
    detail.regular_scheme_code,
  ].filter(Boolean).map(String);

  try {
    for (const c of codesToTry) {
      const res = await pool.query(
        `SELECT code, name, ret_1y, ret_3y, ret_5y, ret_inception FROM mf_screener WHERE code = $1 LIMIT 1`,
        [c]
      );
      if (res.rows.length) {
        const r = res.rows[0];
        return {
          ret1y: parseNum(r.ret_1y),
          ret3y: parseNum(r.ret_3y),
          ret5y: parseNum(r.ret_5y),
          retInception: parseNum(r.ret_inception),
        };
      }
    }

    // 3. MF Screener check by ISIN
    if (detail.isin) {
      const res = await pool.query(
        `SELECT code, name, ret_1y, ret_3y, ret_5y, ret_inception FROM mf_screener WHERE isin = $1 LIMIT 1`,
        [detail.isin]
      );
      if (res.rows.length) {
        const r = res.rows[0];
        return {
          ret1y: parseNum(r.ret_1y),
          ret3y: parseNum(r.ret_3y),
          ret5y: parseNum(r.ret_5y),
          retInception: parseNum(r.ret_inception),
        };
      }
    }

    // 4. MF Screener check by Name
    const term = cleanSearchTerm(schemeName);
    if (term.length >= 3) {
      const res = await pool.query(
        `SELECT code, name, ret_1y, ret_3y, ret_5y, ret_inception FROM mf_screener WHERE name ILIKE $1 ORDER BY length(name) ASC LIMIT 1`,
        [`%${term}%`]
      );
      if (res.rows.length) {
        const r = res.rows[0];
        return {
          ret1y: parseNum(r.ret_1y),
          ret3y: parseNum(r.ret_3y),
          ret5y: parseNum(r.ret_5y),
          retInception: parseNum(r.ret_inception),
        };
      }
    }
  } catch (err) {
    console.warn('[holdingsLookup] screener lookup error:', err.message);
  }

  // 5. Compute CAGR from self-hosted PostgreSQL mf_nav_history table
  for (const c of codesToTry) {
    const navReturns = await computeReturnsFromNavHistory(c);
    if (navReturns && (navReturns.ret1y != null || navReturns.ret3y != null || navReturns.ret5y != null || navReturns.retInception != null)) {
      return navReturns;
    }
  }

  // 6. Groww API payload fallback
  const gStats = Array.isArray(detail.return_stats) ? detail.return_stats[0] : (detail.return_stats || {});
  return {
    ret1y: parseNum(detail.ret_1y ?? detail.return_1y ?? gStats?.return1y ?? gStats?.return_1y),
    ret3y: parseNum(detail.ret_3y ?? detail.return_3y ?? gStats?.return3y ?? gStats?.return_3y),
    ret5y: parseNum(detail.ret_5y ?? detail.return_5y ?? gStats?.return5y ?? gStats?.return_5y),
    retInception: parseNum(detail.ret_inception ?? detail.return_inception ?? gStats?.return_since_created ?? gStats?.return_default),
  };
}

async function ensureReturns(data, amfiCode, schemeName) {
  if (!data) return data;
  const needsEnrichment = data.ret1y == null || data.ret3y == null || data.ret5y == null || data.retInception == null;
  if (!needsEnrichment) {
    return data;
  }
  const returns = await resolveFundReturns(amfiCode, schemeName, data);
  let changed = false;
  if (returns.ret1y != null && data.ret1y !== returns.ret1y) {
    data.ret1y = returns.ret1y;
    changed = true;
  }
  if (returns.ret3y != null && data.ret3y !== returns.ret3y) {
    data.ret3y = returns.ret3y;
    changed = true;
  }
  if (returns.ret5y != null && data.ret5y !== returns.ret5y) {
    data.ret5y = returns.ret5y;
    changed = true;
  }
  if (returns.retInception != null && data.retInception !== returns.retInception) {
    data.retInception = returns.retInception;
    changed = true;
  }

  // Persist the enrichment so subsequent reads from R2 / memory are populated
  if (changed) {
    blobPut(amfiCode, data);
  }
  return data;
}

async function formatDetailResponse(detail, amfiCode, schemeName) {
  const [amfiAum, sifAum, amfiSchemeRisk] = await Promise.all([getAmfiAum(), getSifAum(), getAmfiSchemeRisk()]);

  // amfiAum is keyed by plain numeric AMFI codes, sifAum by "SIF-XXX" --
  // the two key spaces never overlap, so a plain fallback is safe.
  const aumRecord = amfiAum?.[amfiCode] || sifAum?.[amfiCode] || null;
  const resolvedSchemeName = detail.scheme_name || schemeName;

  let risk = detail.risk ?? null;
  let riskSource = risk ? 'own' : null;
  if (!risk) {
    const ownSchemeRisk = matchOwnSchemeRisk(resolvedSchemeName, amfiSchemeRisk?.risk);
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

  const returns = await resolveFundReturns(amfiCode, resolvedSchemeName, detail);

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
    ret1y: returns.ret1y,
    ret3y: returns.ret3y,
    ret5y: returns.ret5y,
    retInception: returns.retInception,
    holdings: normalizeHoldings(detail.holdings),
  };
}

/**
 * Cheap, plan-agnostic AUM lookup -- just the two R2-cached AUM JSON files
 * (already warm via createR2JsonCache, no external vendor call), unlike
 * getHoldingsData() below which also fetches full portfolio holdings from
 * an external source and is deliberately gated to Pro users for cost
 * reasons. AUM itself is basic fund-size info, not a performance insight,
 * so it's served to every visitor regardless of plan (see
 * app/api/fund-detail/[code]/route.js).
 */
export async function getAumInfo(amfiCode) {
  const [amfiAum, sifAum] = await Promise.all([getAmfiAum(), getSifAum()]);
  const aumRecord = amfiAum?.[amfiCode] || sifAum?.[amfiCode] || null;
  return {
    aumCr: aumRecord?.aumCr ?? null,
    aumAsOf: aumRecord?.asOf ?? null,
  };
}

/**
 * Bulk-friendly counterpart to getAumInfo() -- for a caller building a
 * whole LIST of SIF schemes (app/api/sif-nav/route.js), calling
 * getAumInfo() once per scheme would mean N redundant awaits (cheap
 * after the first, since getSifAum() is itself in-memory-cached, but
 * still N calls for no reason). Returns the raw sif-aum.json object
 * directly, keyed by "SIF-XXX" scheme_id, so the caller does one lookup
 * per scheme locally instead.
 */
export async function getSifAumMap() {
  return (await getSifAum()) || {};
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
 * array is truncated to a free-tier preview -- the top 10 holdings in
 * vendor order (already weight-descending; HoldingsSection.jsx's own "Top
 * 5/10 Concentration" stats already rely on that same ordering), across
 * ALL asset classes rather than equity-only. Also carries a
 * `totalHoldingsCount` field with the TRUE total count so the UI can still
 * say "10 of 47" without the other 37 ever reaching a non-Pro browser.
 * Deliberately NOT equity-only: for a hybrid/multi-asset scheme, filtering
 * to equity before slicing hid every non-equity holding from the free
 * preview, which also suppressed HoldingsSection's asset-class allocation
 * bar and filter tabs (they only render when >1 asset class is present) --
 * exactly the diversification the multi-asset UI exists to show off.
 */
export function truncateHoldingsForFreeTier(data) {
  if (!data || !Array.isArray(data.holdings)) return data;
  return {
    ...data,
    holdings: data.holdings.slice(0, 10),
    totalHoldingsCount: data.holdings.length,
  };
}
