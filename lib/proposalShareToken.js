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
async function ensureShareToken(pool, id) {
  const existing = await pool.query(`SELECT share_token FROM proposals WHERE id = $1`, [id]);
  const currentToken = existing.rows[0]?.share_token;
  if (currentToken) return currentToken;

  const token = generateShareToken();
  await pool.query(`UPDATE proposals SET share_token = $1 WHERE id = $2`, [token, id]);
  return token;
}

module.exports = { generateShareToken, ensureShareToken };
