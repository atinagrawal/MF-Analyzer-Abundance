/**
 * lib/amfiDistributor.js
 *
 * Server-only wrapper around AMFI India's public (undocumented)
 * distributor-agent search API -- confirmed live via direct curl:
 * GET https://www.amfiindia.com/api/distributor-agent?strOpt=ALL&search={arn}&page=1&pageSize=10
 * No published contract, no documented rate limits -- same mitigation this
 * app already applies to mfapi.in/AMFI's other undocumented endpoints:
 * server-side-only calls, caching (see app/api/distributor/route.js), and
 * graceful degradation.
 *
 * See docs/superpowers/specs/2026-08-16-amfi-distributor-proposal-studio-design.md.
 */

// Extracts a bare 4-7 digit ARN from free text -- handles "ARN-251838",
// "ARN 251838", a bare "251838" (with surrounding whitespace), and returns
// null for anything that isn't ARN-shaped (blank, "Direct", a person's
// name, a too-short/too-long digit run -- e.g. a stray amount or phone-
// number fragment in free text should never be mistaken for an ARN).
//
// This is a free-text PARSER, not a validator for an already-known ARN --
// do not call it a second time on its own output (a real bug: NJ
// IndiaInvest's ARN-0155 strips to "155", 3 digits, which fails this
// window; calling extractArnDigits("155") returns null even though "155"
// is a perfectly valid ARN). Any caller that already has a bare ARN
// digit string -- e.g. an admin-set override, or a value this function
// already extracted once -- must skip straight to the AMFI lookup
// (lib/distributorResolution.js's resolveArns) instead of re-parsing it
// here. See the PRADEEP GOYAL/NJ national-distributor bug report.
export function extractArnDigits(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  const bare = /^\d{4,7}$/.test(trimmed)
    ? trimmed
    : (trimmed.match(/ARN[\s-]*(\d{4,7})(?!\d)/i)?.[1] ?? null);
  if (!bare) return null;

  // AMFI's own distributor records store the ARN WITHOUT leading zeros
  // (e.g. ARN-155, not ARN-0155) -- confirmed live against AMFI's search
  // API: a zero-padded query ("0155") returns zero results even though the
  // unpadded ARN is a real, valid, KYD-compliant record ("155" -> NJ
  // IndiaInvest Pvt Ltd). Some source documents (CAS PDFs, advisor fields)
  // zero-pad short ARNs for fixed-width display, so strip that padding
  // here -- the one place every caller gets its lookup key from -- rather
  // than making every consumer remember to normalize separately.
  return bare.replace(/^0+/, '') || null;
}

// Normalizes a directly-entered ARN (e.g. an admin typing a correction into
// the arn_overrides UI) to bare digits -- unlike extractArnDigits, this is
// NOT parsing free text for a plausible ARN buried inside it, so it doesn't
// need (and deliberately skips) that function's 4-7 digit disambiguation
// window: a human is asserting "this specific ARN is correct", and some
// real, long-registered AMFI distributors (NJ IndiaInvest's own "155", for
// instance) are legitimately outside that window once zero-padding is
// stripped. Accepts "ARN-155", "ARN 155", or a bare "155"; strips every
// non-digit character and leading zeros; returns null only for genuinely
// empty input.
export function normalizeArn(text) {
  const digits = String(text || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.replace(/^0+/, '') || null;
}

// Calls AMFI's distributor-agent search for an exact ARN, returns a
// normalized record or null if AMFI has no record for that ARN. Throws on
// network/API failure (distinct from "not found") so the caller can tell
// "verified absent" apart from "couldn't verify right now".
export async function fetchDistributorByArn(arn) {
  const res = await fetch(
    `https://www.amfiindia.com/api/distributor-agent?strOpt=ALL&search=${arn}&page=1&pageSize=10`,
    { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MFCalc/2.0)' }, signal: AbortSignal.timeout(15_000) }
  );
  if (!res.ok) throw new Error(`AMFI distributor endpoint returned ${res.status}`);
  const json = await res.json();
  const rec = (json.data || []).find((d) => d.ARN === arn);
  if (!rec) return null;
  return {
    arn: rec.ARN,
    name: rec.ARNHolderName,
    phone: rec.TelephoneNumber_O || rec.TelephoneNumber_R || '',
    email: rec.Email || '',
    address: rec.Address || '',
    city: rec.City || '',
    pin: rec.Pin || '',
    kydCompliant: rec.KYDCompliant === 'Y',
    arnValidFrom: rec.ARNValidFrom,
    arnValidTill: rec.ARNValidTill,
    euin: rec.EUIN || '',
    sifValidFrom: rec.SIF_Validity_From,
    sifValidTill: rec.SIF_Validity_to,
  };
}

// Shared by AdvisorDetailsCard's inline warning, ShareControls' Share/Send
// Email gate, and ProposalReadOnlyView's trust badge, so "is this ARN OK"
// is computed exactly one way everywhere. Accepts either a live
// DistributorRecord (from fetchDistributorByArn) or the smaller persisted
// `advisorArnVerified` shape ({ kydCompliant, arnValidTill, checkedAt }) --
// both carry the two fields this needs.
export function isArnBlocked(verified) {
  if (!verified) return false;
  if (verified.kydCompliant === false) return true;
  if (verified.arnValidTill && new Date(verified.arnValidTill) < new Date()) return true;
  return false;
}

export function arnBlockedReason(verified) {
  if (!verified) return null;
  if (verified.kydCompliant === false) return 'This ARN is not KYD compliant.';
  if (verified.arnValidTill && new Date(verified.arnValidTill) < new Date()) return 'This ARN has expired.';
  return null;
}
