/**
 * app/api/scheme-master-facts/route.js
 *
 * GET /api/scheme-master-facts
 *
 * Slim, server-side projection of data/isin-scheme-master.json's
 * operational-facts fields (RTA, cutoffs, settlement, min lumpsum, SIP/SWP
 * eligibility) for the screener page's fund detail drawer. Excludes the
 * exit-load tier/lock data cas-tracker needs (most of the 5.6MB file's
 * size) — importing the full file into the screener's client bundle was
 * unnecessary bundle weight for a page most users hit.
 *
 * Returns two pre-built indices so the client never scans the full
 * dataset: byIsin (direct ISIN lookup) and byNormName (fallback lookup for
 * funds without an ISIN, keyed by the same normalized-name scheme used
 * elsewhere in this codebase — letters/digits only, uppercased).
 */

import fs from 'fs';
import path from 'path';
import isinSchemeMaster from '@/data/isin-scheme-master.json';

const FACT_FIELDS = ['name', 'rta', 'settlement', 'purchaseCutoff', 'redeemCutoff', 'minPurchase', 'sip', 'swp'];

function pickFacts(entry) {
  const out = {};
  for (const field of FACT_FIELDS) {
    if (entry[field] != null) out[field] = entry[field];
  }
  return out;
}

function normalizeName(str) {
  if (!str) return '';
  return str.toUpperCase()
    .replace(/\s*-\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/DIRECT PLAN/g, 'DIRECT')
    .replace(/REGULAR PLAN/g, 'REGULAR')
    .replace(/GROWTH OPTION/g, 'GROWTH')
    .replace(/IDCW OPTION/g, 'IDCW')
    .replace(/[^A-Z0-9]/g, '')
    .trim();
}

// Built once at module load so even a cold hit is an O(1) return.
const { byIsin, byAmfiCode, byNormName } = (() => {
  const byIsin = {};
  const byNormName = {};
  const byAmfiCode = {};

  for (const [isin, entry] of Object.entries(isinSchemeMaster)) {
    const facts = pickFacts(entry);
    byIsin[isin] = facts;
    if (entry.name) {
      const norm = normalizeName(entry.name);
      if (norm && !byNormName[norm]) byNormName[norm] = facts;
    }
  }

  try {
    const navAllPath = path.join(process.cwd(), 'NAVAll.txt');
    if (fs.existsSync(navAllPath)) {
      const navAllText = fs.readFileSync(navAllPath, 'utf8');
      for (const l of navAllText.split('\n')) {
        const p = l.split(';');
        if (p.length >= 6) {
          const code = p[0].trim();
          const isin1 = p[1].trim();
          const isin2 = p[2].trim();
          if (code && !isNaN(code)) {
            const targetIsin = (isin1 && isin1.startsWith('INF')) ? isin1 : ((isin2 && isin2.startsWith('INF')) ? isin2 : null);
            if (targetIsin && byIsin[targetIsin]) {
              byAmfiCode[code] = byIsin[targetIsin];
            }
          }
        }
      }
    }
  } catch (e) {
    console.warn('[scheme-master-facts] Warning reading NAVAll.txt:', e.message);
  }

  return { byIsin, byAmfiCode, byNormName };
})();

export async function GET() {
  return Response.json(
    { byIsin, byAmfiCode, byNormName },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
  );
}
