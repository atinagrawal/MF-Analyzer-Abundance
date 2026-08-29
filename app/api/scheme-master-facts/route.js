/**
 * app/api/scheme-master-facts/route.js
 *
 * GET /api/scheme-master-facts
 *
 * Slim, server-side projection of isin-scheme-master.json's operational-facts
 * fields (RTA, cutoffs, settlement, min lumpsum, SIP/SWP eligibility,
 * exit-load/ELSS-lock fields) & R2's groww-exit-loads.json, for the screener
 * page's fund detail drawer and app/cas-tracker/page.js's exit-load
 * estimation (both consumers of this one route rather than each carrying
 * their own copy of the underlying data).
 *
 * isin-scheme-master.json itself (~8.4MB, ~26k entries) is fetched from R2
 * (scripts/sync_bse_scheme_master.js writes it there monthly) instead of a
 * static import -- it used to be committed to git and bundled at build time,
 * which meant every real change triggered a full redeploy, and (worse)
 * app/cas-tracker/page.js's own former static import shipped the whole file
 * to every visitor's browser. This route is now the only place that reads
 * the raw file; every consumer gets only the slim per-ISIN projection below.
 */

import { r2Get } from '@/lib/r2';
import { normalizeSchemeName as normalizeName } from '@/lib/normalizeSchemeName';

const FACT_FIELDS = ['name', 'rta', 'settlement', 'purchaseCutoff', 'redeemCutoff', 'minPurchase', 'sip', 'swp', 'purchaseAllowed', 'redemptionAllowed', 'switchAllowed', 'divReinvest', 'isLocked', 'hasExitLoad', 'tiers', 'freePercent'];
const AMFI_NAV_URL = 'https://portal.amfiindia.com/spages/NAVAll.txt';
const AMFI_TTL_MS = 6 * 60 * 60 * 1000; // 6h -- code-to-ISIN mapping barely changes day to day
const ISIN_MASTER_TTL_MS = 60 * 60 * 1000; // 1h -- isin-scheme-master.json itself only refreshes monthly
const GROWW_TTL_MS = 60 * 60 * 1000; // 1h -- groww-exit-loads.json also only refreshes monthly

function pickFacts(entry) {
  const out = {};
  for (const field of FACT_FIELDS) {
    if (entry[field] != null) out[field] = entry[field];
  }
  return out;
}

// Groww exit-load data, R2-backed (scripts/sync_groww_exit_loads.js writes
// it there) rather than a git-committed data/*.json -- same reasoning as
// isin-scheme-master.json below: a monthly-changing data file shouldn't
// need a git commit + redeploy to refresh, and shouldn't ship to every
// visitor's browser via a static import.
let _growwCache = null; // { growwByAmfiCode, growwByIsin }
let _growwCacheTime = 0;

async function buildGrowwMaps() {
  const now = Date.now();
  if (_growwCache && (now - _growwCacheTime) < GROWW_TTL_MS) return _growwCache;

  let data = null;
  try {
    data = await r2Get('groww-exit-loads.json');
  } catch (e) {
    console.warn('[scheme-master-facts] Warning fetching groww-exit-loads.json from R2:', e.message);
  }
  if (!data) return _growwCache || { growwByAmfiCode: {}, growwByIsin: {} };

  const growwByAmfiCode = {};
  const growwByIsin = {};
  for (const [code, rec] of Object.entries(data)) {
    growwByAmfiCode[code] = rec;
    if (rec.isin) growwByIsin[rec.isin] = rec;
  }
  _growwCache = { growwByAmfiCode, growwByIsin };
  _growwCacheTime = now;
  return _growwCache;
}

let _factsCache = null; // { byIsin, byNormName }
let _factsCacheTime = 0;

// byIsin/byNormName, derived from R2's isin-scheme-master.json, cached
// in-memory per warm instance. Only overwrites the cache on a SUCCESSFUL R2
// read -- a transient R2 failure serves the last-known-good result (or an
// empty fallback if nothing has ever succeeded yet on this instance) rather
// than locking in an empty result for the full TTL.
async function buildFacts() {
  const now = Date.now();
  if (_factsCache && (now - _factsCacheTime) < ISIN_MASTER_TTL_MS) return _factsCache;

  let isinSchemeMaster = null;
  try {
    isinSchemeMaster = await r2Get('isin-scheme-master.json');
  } catch (e) {
    console.warn('[scheme-master-facts] Warning fetching isin-scheme-master.json from R2:', e.message);
  }
  if (!isinSchemeMaster) {
    return _factsCache || { byIsin: {}, byNormName: {} };
  }

  const { growwByIsin } = await buildGrowwMaps();

  const byIsin = {};
  const byNormName = {};
  for (const [isin, entry] of Object.entries(isinSchemeMaster)) {
    const facts = pickFacts(entry);
    const growwRec = growwByIsin[isin];
    if (growwRec) {
      facts.exitLoadText = growwRec.rawText;
      facts.exitLoadTiers = growwRec.tiers;
      facts.exitLoadConfidence = growwRec.confidence;
      facts.exitLoadFreePercent = growwRec.freePercent;
    }
    byIsin[isin] = facts;
    if (entry.name) {
      const norm = normalizeName(entry.name);
      if (norm && !byNormName[norm]) byNormName[norm] = facts;
    }
  }

  _factsCache = { byIsin, byNormName };
  _factsCacheTime = now;
  return _factsCache;
}

let _amfiCodeCache = null;
let _amfiCodeCacheTime = 0;

async function buildByAmfiCode(byIsin) {
  const now = Date.now();
  if (_amfiCodeCache && (now - _amfiCodeCacheTime) < AMFI_TTL_MS) return _amfiCodeCache;

  const { growwByAmfiCode } = await buildGrowwMaps();
  const byAmfiCode = {};
  try {
    const r = await fetch(AMFI_NAV_URL, {
      headers: { Accept: 'text/plain' },
      signal: AbortSignal.timeout(15000),
    });
    if (r.ok) {
      const navAllText = await r.text();
      for (const l of navAllText.split('\n')) {
        const p = l.split(';');
        if (p.length >= 6) {
          const code = p[0].trim();
          const isin1 = p[1].trim();
          const isin2 = p[2].trim();
          if (code && !isNaN(code)) {
            const targetIsin = (isin1 && isin1.startsWith('INF')) ? isin1 : ((isin2 && isin2.startsWith('INF')) ? isin2 : null);
            if (targetIsin && byIsin[targetIsin]) {
              const facts = { ...byIsin[targetIsin] };
              const growwRec = growwByAmfiCode[code];
              if (growwRec) {
                facts.exitLoadText = growwRec.rawText;
                facts.exitLoadTiers = growwRec.tiers;
                facts.exitLoadConfidence = growwRec.confidence;
                facts.exitLoadFreePercent = growwRec.freePercent;
              }
              byAmfiCode[code] = facts;
            }
          }
        }
      }
    } else {
      console.warn('[scheme-master-facts] AMFI NAVAll.txt returned HTTP', r.status);
    }
  } catch (e) {
    console.warn('[scheme-master-facts] Warning fetching NAVAll.txt:', e.message);
  }

  _amfiCodeCache = byAmfiCode;
  _amfiCodeCacheTime = now;
  return byAmfiCode;
}

export async function GET() {
  const { byIsin, byNormName } = await buildFacts();
  const byAmfiCode = await buildByAmfiCode(byIsin);
  return Response.json(
    { byIsin, byAmfiCode, byNormName },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
  );
}
