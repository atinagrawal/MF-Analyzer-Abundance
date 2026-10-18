/**
 * lib/nfoInvestLinks.js
 *
 * Hand-maintained AMC "direct invest" deep links, keyed by NFO slug.
 *
 * scripts/sync_amfi_nfo.js overwrites amfi-nfo.json wholesale on every run
 * (see its own header comment) -- there's nowhere in that pipeline to carry
 * a manually-supplied field, so this map lives separately and is merged in
 * at render time by app/nfo/[slug]/page.jsx. Slugs are stable once assigned
 * (preserveSlugs() in the sync script), so a slug key here survives AMFI
 * renaming the scheme mid-offer.
 *
 * Add an entry here whenever an AMC gives us a direct subscription link for
 * an open NFO. Safe to leave stale entries after a scheme closes -- they
 * simply never get looked up again once nfoData drops the slug.
 */
export const NFO_INVEST_LINKS = {
  'carnelian-small-cap-fund': 'https://investors.carnelianmf.com/investor/s?i=iF9k8EAQO1',
  // Generated via mycams.camsonline.com's "AMCLinkGenerate" tool -- see
  // docs/superpowers/specs/2026-10-18-cams-invest-link-feasibility.md for
  // how that tool was found and verified (CAMS is the RTA for a large
  // share of the industry, this is shared infrastructure, not an
  // HDFC-specific build). ARN-0155 (NJ IndiaInvest Pvt Ltd) / sub-broker
  // code 22734 / sub-broker ARN-251838 / EUIN E468841.
  'hdfc-nifty-largemidcap250-plus-8-13-yr-g-sec-70-30-index-fund': 'https://s.camsai.com/r/O4Dik8r5',
};

/**
 * @param {string} slug
 * @returns {string|null}
 */
export function getNfoInvestLink(slug) {
  if (!slug) return null;
  return NFO_INVEST_LINKS[slug] || null;
}
