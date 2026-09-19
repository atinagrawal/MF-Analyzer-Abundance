/**
 * lib/tickertapeMfRatios.js
 *
 * Best-effort PE Ratio / Category PE / Sortino / Alpha lookup for a mutual
 * fund scheme, sourced from Tickertape (tickertape.in) -- the one ratio
 * this app genuinely can't self-compute, since it depends on the fund's
 * actual portfolio holdings' individual stock valuations, which this app
 * doesn't have. Std Dev and Sharpe Ratio are deliberately NOT sourced from
 * here -- see lib/riskFreeRate.js -- this app already self-computes both
 * reliably from AMFI NAV history, so Tickertape is only asked for the one
 * gap.
 *
 * There is no public Tickertape API for this. Their individual fund pages
 * (e.g. https://www.tickertape.in/mutualfunds/hdfc-flexi-cap-fund-M_HDCEQ)
 * are server-rendered Next.js pages with the real numeric data embedded in
 * a `<script id="__NEXT_DATA__">` JSON blob, at
 * `props.pageProps.mfPageFaq.ratios` -- confirmed by fetching that exact
 * page during this feature's design and cross-checking the embedded
 * `stdDev`/`sharpe` values (12.55 / -0.37) against the page's own visible
 * FAQ text. This is inherently fragile: Tickertape owns no obligation to
 * keep that shape stable, and this module has no fallback if they change
 * it beyond returning null (handled gracefully -- see getTickertapeRatios).
 *
 * Matching problem: Tickertape's URL slug encodes an internal ID (e.g.
 * "M_HDCEQ") this app has no independent way to look up for an arbitrary
 * AMFI scheme code -- there's no documented search API either (their
 * search-bar dropdown resolves client-side against a bundle this module
 * has no equivalent access to). Their dedicated mutual-fund XML sitemap
 * (https://www.tickertape.in/sitemaps/mutualfunds/sitemap.xml) DOES list
 * every fund/plan/option variant's slug+ID, so this module fetches that
 * once (cached in-memory) and matches by normalized scheme name instead --
 * see normalizeForMatch(). Matching is deliberately strict (exact
 * normalized-string equality, not fuzzy/partial) -- a wrong PE Ratio
 * attributed to the wrong fund is worse than showing none at all.
 */

const SITEMAP_URL = 'https://www.tickertape.in/sitemaps/mutualfunds/sitemap.xml';
const FETCH_HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; AbundanceMFCalc/1.0)' };
const FETCH_TIMEOUT_MS = 15000;

const SITEMAP_TTL_MS = 7 * 24 * 60 * 60 * 1000;  // fund universe barely changes day to day
const RATIOS_TTL_MS = 24 * 60 * 60 * 1000;        // ratios refresh roughly daily upstream anyway

let sitemapCache = null;  // { entries: [{slug, mfId, normalized}], fetchedAt }
const ratiosCache = new Map(); // normalized name -> { data, fetchedAt }

// Marks a slug as carrying an explicit plan/option descriptor -- a
// non-default variant (IDCW, Direct, Regular, a payout/reinvestment
// sub-option, ...). Deliberately excludes "fund" (every slug legitimately
// contains it) and "growth" (Tickertape's primary/default listing OMITS
// the word entirely rather than stating it -- confirmed against HDFC
// Flexi Cap Fund's own sitemap entries: the one bare slug had no "growth"
// in it at all, while every IDCW/reinvestment variant added its own
// marker word). No /g flag -- .test() below must not mutate lastIndex.
const VARIANT_MARKER_WORDS = /idcw|dividend|direct|regular|payout|reinvestment|reinv|bonus|plan|option/i;

// Noise stripped during normalization -- broader than the marker check
// above, since this also has to reconcile OUR OWN fund names (which spell
// out "Growth"/"Fund" explicitly, e.g. "HDFC Flexi Cap Fund - Growth")
// against a slug that may omit them. Split in two because slugs glue some
// of these onto "fund" with no separator (e.g.
// "hdfc-flexi-cap-fundidcw-M_HDEN") while others always appeared
// hyphen/space-separated in every real slug seen during design --
// the glued group is matched as plain substrings (no word boundary,
// since a boundary can't exist mid-word), the rest stay \b-bound.
const NOISE_WORDS_GLUED = /(idcw|dividend|reinvestment|reinv|payout|bonus)/gi;
const NOISE_WORDS_BOUNDED = /\b(growth|direct|regular|plan|option|fund|annual|quarterly|monthly|weekly|daily)\b/gi;

// AMC names Tickertape's own slugs abbreviate -- found by sampling the
// sitemap across ~50 AMCs during design; only ICICI Prudential's slugs
// consistently drop to "ICICI Pru" ("icici-pru-multi-asset-active-fof-
// M_ICRMI"), every other AMC checked matched its full/common name as-is
// (Aditya Birla, Mahindra Manulife, Mirae Asset, Nippon India, Motilal
// Oswal, Franklin India, ...). Applied AFTER lowercasing, before the
// noise-word strip, so "icici prudential ... fund" and "icici pru ...
// fund" both end up "icici pru ...".
const AMC_ALIASES = [[/\bicici prudential\b/, 'icici pru']];

// Normalizes a scheme name OR a sitemap slug's name portion down to a bare
// comparable string.
export function normalizeForMatch(text) {
  let s = String(text || '').toLowerCase().replace(/-/g, ' ');
  for (const [pattern, replacement] of AMC_ALIASES) s = s.replace(pattern, replacement);
  return s
    .replace(NOISE_WORDS_GLUED, ' ')
    .replace(NOISE_WORDS_BOUNDED, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: FETCH_HEADERS, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

// Parses the sitemap's <loc> entries into {slug, mfId, normalized, isBare}.
// isBare = the slug carries none of the plan/option marker words --
// almost always the primary Growth-option listing (confirmed against
// HDFC Flexi Cap Fund's own sitemap entries during design: the one bare
// slug was the Direct-Growth page; every IDCW/reinvestment variant added
// a suffix word).
export function parseSitemap(xml) {
  const entries = [];
  const re = /<loc>https:\/\/www\.tickertape\.in\/mutualfunds\/([a-z0-9-]+)-([A-Z0-9_]+)<\/loc>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const [, slugName, mfId] = m;
    entries.push({
      slug: `${slugName}-${mfId}`,
      mfId,
      normalized: normalizeForMatch(slugName),
      isBare: !VARIANT_MARKER_WORDS.test(slugName),
    });
  }
  return entries;
}

async function getSitemapEntries() {
  if (sitemapCache && Date.now() - sitemapCache.fetchedAt < SITEMAP_TTL_MS) {
    return sitemapCache.entries;
  }
  const xml = await fetchText(SITEMAP_URL);
  const entries = parseSitemap(xml);
  sitemapCache = { entries, fetchedAt: Date.now() };
  return entries;
}

// Finds the sitemap entry for `fundName`, or null if nothing matches
// exactly. When several variants (Growth/IDCW/...) share the same
// normalized name, prefers the bare (Growth) slug.
async function matchSitemapEntry(fundName) {
  const target = normalizeForMatch(fundName);
  if (!target) return null;
  const entries = await getSitemapEntries();
  const matches = entries.filter(e => e.normalized === target);
  if (!matches.length) return null;
  return matches.find(e => e.isBare) || matches[0];
}

// Fetches one Tickertape fund page and extracts its ratios object from
// the embedded __NEXT_DATA__ payload. Returns null on any parse failure
// (page redesign, missing script tag, unexpected shape) rather than
// throwing -- this is best-effort enrichment, never load-bearing.
async function fetchRatiosForSlug(slug) {
  const html = await fetchText(`https://www.tickertape.in/mutualfunds/${slug}`);
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return null;
  let data;
  try { data = JSON.parse(m[1]); } catch { return null; }
  const ratios = data?.props?.pageProps?.mfPageFaq?.ratios;
  if (!ratios) return null;
  // Individual fields can legitimately be null upstream -- a Fund-of-Funds
  // holds other funds, not individual stocks, so Tickertape itself has no
  // portfolio PE for one (confirmed against a real FoF during design:
  // sortino/alpha were present, pe/catPe were null). Returning the object
  // regardless lets the UI show what's actually available instead of
  // discarding real data over one missing field.
  const num = (v) => (typeof v === 'number' ? v : null);
  return {
    pe: num(ratios.pe),
    catPe: num(ratios.catPe),
    sortino: num(ratios.sortino),
    alpha: num(ratios.alpha),
  };
}

/**
 * Returns { pe, catPe, sortino, alpha } for the named fund, or null if no
 * confident match was found or the fetch/parse failed for any reason.
 * Never throws -- callers can call this unconditionally and treat null as
 * "no enrichment available," the same way every other best-effort
 * external lookup in this codebase degrades.
 */
// Test-only: clears the in-memory caches so a test can control exactly
// which fetches happen next, instead of a warm sitemap/ratios cache from
// an earlier test silently short-circuiting a later one's mocked fetch.
// Never called from application code.
export function __resetCacheForTests() {
  sitemapCache = null;
  ratiosCache.clear();
}

export async function getTickertapeRatios(fundName) {
  const cacheKey = normalizeForMatch(fundName);
  if (!cacheKey) return null;
  const cached = ratiosCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < RATIOS_TTL_MS) return cached.data;

  try {
    const entry = await matchSitemapEntry(fundName);
    if (!entry) { ratiosCache.set(cacheKey, { data: null, fetchedAt: Date.now() }); return null; }
    const ratios = await fetchRatiosForSlug(entry.slug);
    ratiosCache.set(cacheKey, { data: ratios, fetchedAt: Date.now() });
    return ratios;
  } catch (err) {
    console.error('[tickertapeMfRatios] lookup failed:', err.message);
    return null; // non-fatal -- the fund detail page just shows no PE data
  }
}
