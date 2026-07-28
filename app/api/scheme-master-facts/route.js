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

import isinSchemeMaster from '@/data/isin-scheme-master.json';

const FACT_FIELDS = ['name', 'rta', 'settlement', 'purchaseCutoff', 'redeemCutoff', 'minPurchase', 'sip', 'swp'];

function pickFacts(entry) {
  const out = {};
  for (const field of FACT_FIELDS) {
    if (entry[field] != null) out[field] = entry[field];
  }
  return out;
}

export async function GET() {
  const byIsin = {};
  const byNormName = {};
  for (const [isin, entry] of Object.entries(isinSchemeMaster)) {
    const facts = pickFacts(entry);
    byIsin[isin] = facts;
    if (entry.name) {
      const norm = entry.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (norm && !byNormName[norm]) byNormName[norm] = facts;
    }
  }
  return Response.json(
    { byIsin, byNormName },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' } }
  );
}
