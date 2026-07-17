/**
 * lib/providerLogos.js
 *
 * Central logo resolution utility.
 *
 * Resolves PMS manager names, MF AMC names, and SIF house names to local
 * static asset paths under /public/logos/.
 *
 * Strategy:
 *  1. Try exact lowercase key in the pre-built logoMap.json
 *  2. For MF/SIF: also try fuzzy partial match (first significant word)
 *  3. SIF houses that are also registered MF/PMS get matched automatically
 *  4. Return null on miss — callers handle fallback rendering
 */

import logoMapData from './logoMap.json';

// ── Build case-insensitive lookup maps ────────────────────────────────────────

/** @type {Record<string, string>} lowercase name → /logos/path */
const mfMap = {};
/** @type {Record<string, string>} lowercase name → /logos/path */
const pmsMap = {};

for (const [key, path] of Object.entries(logoMapData.mf)) {
  mfMap[key] = path;
}
for (const [key, path] of Object.entries(logoMapData.pms)) {
  pmsMap[key] = path;
}

// Pre-sorted [strippedKey, path] pairs, longest strippedKey first, so a
// scheme-name prefix scan checks the most specific AMC name before a
// shorter one that happens to also be a string-prefix of it (e.g. "quant"
// is a literal prefix of "quantum" — without this ordering, whichever of
// "quant mutual fund" / "quantum mutual fund" iterates first in mfMap
// would silently win for every Quantum scheme, regardless of which AMC
// actually manages it). Sorting here makes correctness independent of
// logoMap.json's key order.
const mfEntriesByStrippedLengthDesc = Object.entries(mfMap)
  .map(([k, path]) => [k.replace(/ mutual fund$/, ''), path])
  .sort((a, b) => b[0].length - a[0].length);

// ── SIF house → logo path hand-written map ────────────────────────────────────
// Under SEBI regulations, SIFs (Specialised Investment Funds) must be distinct
// brand entities. Reusing parent MF logos is legally and visually incorrect.
// SIF brands without dedicated SIF logo assets will render using initials fallbacks.
const SIF_OVERRIDES = {
  'the wealth company mutual fund': '/logos/sif-wealthcompanyamc.svg',
  'franklin templeton mutual fund': '/logos/sif-franklintempleton.jpg',
  'hsbc mutual fund':               '/logos/sif-hsbc.svg',
  'mirae asset mutual fund':        '/logos/sif-miraeasset.svg',
  'isif sif':                       '/logos/sif-isif.svg',
  'dynasif sif':                    '/logos/sif-dynasif.jpg',
  'magnum sif':                     '/logos/sif-magnum.svg',
  'arudha sif':                     '/logos/sif-arudha.svg',
  'apex sif':                       '/logos/sif-apex.png',
  'qsif sif':                       '/logos/sif-qsif.jpg',
  'titanium sif':                   '/logos/sif-titanium.webp',
  'kotak mahindra mutual fund':     '/logos/sif-kotak.webp',
  'altiva sif':                     '/logos/sif-altiva.svg',
  'arthaya sif':                    '/logos/sif-arthaya.svg',
  'diviniti sif':                   '/logos/sif-diviniti.png',
};

// ── AMC name normalizer ───────────────────────────────────────────────────────
// Strips common suffixes that differ between the screener API and our map keys
const AMC_STRIP_RE = /\s+(asset management company( limited\.?)?|amc|mutual fund)\s*$/i;

function normalise(name) {
  return (name || '').trim().toLowerCase();
}

// ── Fuzzy first-word fallback ─────────────────────────────────────────────────
// When an exact match fails, try matching by the first significant word.
// This handles "HDFC Asset Management Co. Ltd." → "hdfc mutual fund".
function fuzzyMFLookup(name) {
  const n = normalise(name);
  const firstWord = n.split(/\s+/)[0];
  if (firstWord.length < 3) return null; // too short to be useful
  const hit = Object.entries(mfMap).find(([k]) => k.startsWith(firstWord + ' '));
  return hit ? hit[1] : null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Resolve a PMS portfolio manager name to a local logo path.
 * @param {string} managerName  e.g. "ASK Investment Managers Limited"
 * @returns {string|null}  e.g. "/logos/pms-askwealth-com.png"  or null
 */
export function getPMSLogo(managerName) {
  if (!managerName) return null;
  return pmsMap[normalise(managerName)] ?? null;
}

/**
 * Resolve an AMC / fund house name to a local logo path.
 * Accepts both the human-readable format from our map ("HDFC Mutual Fund")
 * and the verbose API format ("HDFC Asset Management Company Limited").
 * @param {string} fundHouseName
 * @returns {string|null}
 */
export function getMFLogo(fundHouseName) {
  if (!fundHouseName) return null;
  const n = normalise(fundHouseName);
  // 1. Direct hit
  if (mfMap[n]) return mfMap[n];
  // 2. Strip "Asset Management Company Ltd" suffix and try again
  const stripped = n.replace(AMC_STRIP_RE, '').trim();
  const withMF = stripped + ' mutual fund';
  if (mfMap[withMF]) return mfMap[withMF];
  if (mfMap[stripped]) return mfMap[stripped];
  // 3. Fuzzy first-word match
  return fuzzyMFLookup(n);
}

/**
 * Resolve a SIF fund house name to a local logo path.
 * SIF brands are legally and visually distinct; they only resolve if
 * an explicit SIF brand logo exists.
 * @param {string} sifHouseName  e.g. "Franklin Templeton Mutual Fund"
 * @returns {string|null}
 */
export function getSIFLogo(sifHouseName) {
  if (!sifHouseName) return null;
  const n = normalise(sifHouseName);
  return SIF_OVERRIDES[n] ?? null;
}

/**
 * Generic resolver — auto-detects type.
 * @param {'mf'|'pms'|'sif'} type
 * @param {string} name
 * @returns {string|null}
 */
export function getProviderLogo(type, name) {
  if (type === 'pms') return getPMSLogo(name);
  if (type === 'sif') return getSIFLogo(name);
  return getMFLogo(name);
}

/**
 * Extract the AMC name from a full scheme string.
 * e.g. "HDFC Mid-Cap Opportunities Fund - Regular Plan - Growth"
 *      → tries "hdfc mutual fund" etc via getMFLogo
 * Returns the logo path or null.
 */
export function getMFLogoFromSchemeName(schemeName) {
  if (!schemeName) return null;
  // Try known MF name prefixes from the map, longest-first for accuracy —
  // see mfEntriesByStrippedLengthDesc above for why the sort matters.
  const n = normalise(schemeName);
  const hit = mfEntriesByStrippedLengthDesc.find(([stripped]) => n.startsWith(stripped));
  if (hit) return hit[1];
  // Fuzzy: try each MF key's first word against the scheme name
  const firstWord = n.split(/[\s-]/)[0];
  const fuzzy = Object.entries(mfMap).find(([k]) => k.startsWith(firstWord + ' '));
  return fuzzy ? fuzzy[1] : null;
}
