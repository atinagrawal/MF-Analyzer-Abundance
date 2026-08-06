/**
 * lib/proposalShareToken.js
 *
 * Share-token generation for Proposal Studio's shareable links (see
 * docs/superpowers/specs/2026-08-06-proposal-studio-sharing-design.md).
 * A token is a high-entropy random string, distinct from a proposal's own
 * internal id, stored in proposals.share_token -- NULL means "not shared".
 *
 * CommonJS (module.exports), matching lib/portfolioAnalysis.js and
 * lib/chartSvg.js's dual-purpose style so this stays importable both via
 * Next's `import` (route files) and plain `node`/`require` (tests/*.test.js
 * runs with no framework or ESM loader configured).
 */

const { randomBytes } = require('crypto');

// ~192 bits of entropy, base64url so it's safe to drop straight into a URL
// path segment with no further encoding.
function generateShareToken() {
  return randomBytes(24).toString('base64url');
}

// Idempotent: an already-shared proposal keeps its existing token (re-
// clicking Share must never invalidate a link already sent out) rather than
// minting a new one every call. `pool` is passed in rather than imported
// directly so this stays testable with a lightweight fake pool instead of a
// live database -- see tests/proposalShareToken.test.js.
//
// Single atomic UPDATE...RETURNING rather than a separate SELECT then
// UPDATE: two near-simultaneous calls (e.g. two browser tabs) could
// otherwise both read NULL from the SELECT and both UPDATE, with the first
// caller's copied link 404ing once the second UPDATE overwrote it. A
// candidate token is always generated, but COALESCE means Postgres only
// actually writes it if the column was NULL -- otherwise the existing value
// is kept and returned, atomically, in one round trip.
async function ensureShareToken(pool, id) {
  const token = generateShareToken();
  const result = await pool.query(
    `UPDATE proposals SET share_token = COALESCE(share_token, $1) WHERE id = $2 RETURNING share_token`,
    [token, id]
  );
  return result.rows[0]?.share_token;
}

module.exports = { generateShareToken, ensureShareToken };
