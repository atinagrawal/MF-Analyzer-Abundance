/**
 * lib/distributorResolution.js
 *
 * Page-agnostic batch resolver for CAS-holding advisor strings, built on
 * top of the shared AMFI distributor lookup service (lib/amfiDistributor.js,
 * app/api/distributor/route.js -- see docs/superpowers/specs/
 * 2026-08-16-amfi-distributor-proposal-studio-design.md). Deliberately has
 * no React/page dependency so a later effort can wire this into
 * app/portfolio/page.jsx without re-deriving any of this logic -- see
 * docs/superpowers/specs/2026-08-16-amfi-distributor-cas-tracker-design.md.
 */

export { extractArnDigits } from './amfiDistributor.js';

import { extractArnDigits } from './amfiDistributor.js';

// Builds the key an ARN override is stored/looked-up under, both in the
// arn_overrides table (pan, folio_no columns) and in the client-side
// overrides map fetched from GET /api/arn-overrides. Centralised here so
// the API route and every call site agree on the exact same string shape.
export function overrideKey(pan, folio) {
  return `${pan}::${folio}`;
}

// Resolves the ARN to actually use for one CAS holding. An admin-set
// correction (keyed by pan+folio) always wins over whatever's embedded in
// the raw CAS advisor string -- national/umbrella distributors (NJ
// IndiaInvest, Centricity, etc.) report one shared ARN for every folio
// under them, which doesn't identify which specific sub-advisor actually
// services a given folio, and CAS carries no field that could answer that
// on its own. `overrides` is the plain object GET /api/arn-overrides
// returns, keyed by overrideKey(pan, folio) -> corrected bare ARN digits.
export function resolveHoldingArn(pan, folio, advisorStr, overrides = {}) {
  const override = overrides[overrideKey(pan, folio)];
  if (override) return override;
  return extractArnDigits(advisorStr);
}

// AMFI returns ARNHolderName in ALL CAPS; title-cases it for display, and
// tolerates a missing/blank name (returns a safe placeholder) rather than
// letting a downstream `.split(' ')[0]` throw on undefined/empty.
export function formatDistributorName(name) {
  if (!name || !name.trim()) return 'Registered Distributor';
  return name.trim().toLowerCase().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Takes ARNs that are ALREADY bare digit strings -- no extraction, so it's
// safe to call with values that came from resolveHoldingArn (an admin
// override or an already-extracted ARN), unlike calling extractArnDigits a
// second time on its own output (that's the exact bug that used to make
// NJ IndiaInvest's "155" vanish -- see extractArnDigits's own comment).
// Dedupes, fetches each via the already-authenticated GET
// /api/distributor?arn=... in parallel (Promise.allSettled -- one slow/
// failing lookup must never block the others), and returns a map keyed by
// bare ARN digits. An ARN that's well-formed but not found in AMFI's
// registry, or whose lookup fails outright, both map to null -- callers
// treat both the same way (fall back to unenriched display), per this
// feature's error-handling design.
export async function resolveArns(arns) {
  const unique = [...new Set(arns.filter(Boolean))];
  if (unique.length === 0) return {};

  const results = await Promise.allSettled(
    unique.map(arn => fetch(`/api/distributor?arn=${arn}`).then(r => r.json()))
  );

  const map = {};
  unique.forEach((arn, i) => {
    const r = results[i];
    map[arn] = r.status === 'fulfilled' && r.value.found ? r.value.distributor : null;
  });
  return map;
}

// Takes the raw advisor strings off a set of holdings (e.g. every CAS-
// derived fund's `advisor` field, "Direct / N/A" and blanks included),
// extracts + dedupes to the distinct resolvable ARNs, and resolves them via
// resolveArns. This is the convenience entry point for a caller that only
// has raw advisor text and no per-holding pan/folio to check for an admin
// override -- app/cas-tracker/page.js instead calls resolveHoldingArn per
// holding (to honor overrides) and passes the results straight to
// resolveArns, skipping this extraction step entirely.
export async function resolveDistributors(advisorStrings) {
  const arns = advisorStrings.map(extractArnDigits);
  return resolveArns(arns);
}
