/**
 * lib/resolveFolioPan.js
 *
 * Pure decision logic for GET /api/cas/resolve-folios: given a folio's
 * manual override (if any) and whatever PAN(s) that same folio number was
 * seen under across the owner's OTHER saved CAS statements, decide what
 * PAN it should resolve to. Split from the route handler (which does the
 * actual DB/R2 reads) purely so this decision logic is testable without
 * mocking either -- same pattern this repo already uses for
 * lib/rateLimit.js's formatRetryLabel.
 */

// folioNos: string[] -- every folio number the caller wants resolved.
// overridesByFolio: { [folioNo]: pan } -- already-fetched folio_pan_overrides rows.
// historicalSightingsByFolio: { [folioNo]: string[] } -- PAN(s) seen for that
//   folio number across the owner's other saved statements (may be empty,
//   single, repeated, or conflicting).
// Returns { [folioNo]: { pan, source: 'manual' | 'history' } } -- a folio
// with no override and either no history or CONFLICTING history is
// omitted entirely (left unresolved) rather than guessed.
export function pickFolioResolutions(folioNos, overridesByFolio, historicalSightingsByFolio) {
  const result = {};
  for (const folioNo of folioNos) {
    const override = overridesByFolio[folioNo];
    if (override) {
      result[folioNo] = { pan: override, source: 'manual' };
      continue;
    }
    const sightings = historicalSightingsByFolio[folioNo] || [];
    const distinctPans = [...new Set(sightings)];
    if (distinctPans.length === 1) {
      result[folioNo] = { pan: distinctPans[0], source: 'history' };
    }
    // 0 sightings (unresolved) or 2+ conflicting distinct PANs (ambiguous)
    // both fall through here -- omitted, not guessed.
  }
  return result;
}
