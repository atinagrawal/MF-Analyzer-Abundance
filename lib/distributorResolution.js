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

// Takes the raw advisor strings off a set of holdings (e.g. every CAS-
// derived fund's `advisor` field, "Direct / N/A" and blanks included),
// dedupes to the distinct resolvable ARNs, fetches each via the already-
// authenticated GET /api/distributor?arn=... in parallel (Promise.allSettled
// -- one slow/failing lookup must never block the others), and returns a
// map keyed by bare ARN digits so callers can look up by whatever
// extractArnDigits(fund.advisor) returns for each holding. An ARN that's
// well-formed but not found in AMFI's registry, or whose lookup fails
// outright, both map to null -- callers treat both the same way (fall back
// to unenriched display), per this feature's error-handling design.
export async function resolveDistributors(advisorStrings) {
  const arns = [...new Set(advisorStrings.map(extractArnDigits).filter(Boolean))];
  if (arns.length === 0) return {};

  const results = await Promise.allSettled(
    arns.map(arn => fetch(`/api/distributor?arn=${arn}`).then(r => r.json()))
  );

  const map = {};
  arns.forEach((arn, i) => {
    const r = results[i];
    map[arn] = r.status === 'fulfilled' && r.value.found ? r.value.distributor : null;
  });
  return map;
}
