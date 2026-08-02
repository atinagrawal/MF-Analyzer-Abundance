/**
 * app/api/scheme-master-facts/route.js
 *
 * GET /api/scheme-master-facts
 *
 * Slim, server-side projection of data/isin-scheme-master.json's
 * operational-facts fields (RTA, cutoffs, settlement, min lumpsum, SIP/SWP
 * eligibility) & data/groww-exit-loads.json for the screener page's fund detail drawer.
 */

import fs from 'fs';
import path from 'path';
import isinSchemeMaster from '@/data/isin-scheme-master.json';
import { normalizeSchemeName as normalizeName } from '@/lib/normalizeSchemeName';

const FACT_FIELDS = ['name', 'rta', 'settlement', 'purchaseCutoff', 'redeemCutoff', 'minPurchase', 'sip', 'swp', 'purchaseAllowed', 'redemptionAllowed', 'switchAllowed', 'divReinvest'];
const AMFI_NAV_URL = 'https://portal.amfiindia.com/spages/NAVAll.txt';
const AMFI_TTL_MS = 6 * 60 * 60 * 1000; // 6h -- code-to-ISIN mapping barely changes day to day

function pickFacts(entry) {
  const out = {};
  for (const field of FACT_FIELDS) {
    if (entry[field] != null) out[field] = entry[field];
  }
  return out;
}

// Load decoupled Groww exit loads data
const { growwByAmfiCode, growwByIsin } = (() => {
  const growwByAmfiCode = {};
  const growwByIsin = {};
  try {
    const filePath = path.join(process.cwd(), 'data', 'groww-exit-loads.json');
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      for (const [code, rec] of Object.entries(data)) {
        growwByAmfiCode[code] = rec;
        if (rec.isin) growwByIsin[rec.isin] = rec;
      }
    }
  } catch (e) {
    console.warn('[scheme-master-facts] Warning loading groww-exit-loads.json:', e.message);
  }
  return { growwByAmfiCode, growwByIsin };
})();

// byIsin/byNormName built once at module load -- pure, synchronous, no I/O.
const { byIsin, byNormName } = (() => {
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

  return { byIsin, byNormName };
})();

let _amfiCodeCache = null;
let _amfiCodeCacheTime = 0;

async function buildByAmfiCode() {
  const now = Date.now();
  if (_amfiCodeCache && (now - _amfiCodeCacheTime) < AMFI_TTL_MS) return _amfiCodeCache;

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
  const byAmfiCode = await buildByAmfiCode();
  return Response.json(
    { byIsin, byAmfiCode, byNormName },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
  );
}
