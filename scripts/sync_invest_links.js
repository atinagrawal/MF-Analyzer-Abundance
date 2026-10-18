/**
 * scripts/sync_invest_links.js
 *
 * Syncs AMC "direct invest" deep links into one R2 document
 * (amc-invest-links.json), consumed by lib/investLinksCache.js and merged
 * into the MF screener dataset (lib/screenerData.js) and the NFO detail
 * page (app/nfo/[slug]/page.jsx).
 *
 * Why this exists: an AMC that hands out one-off "invest now" links per
 * scheme (an ARN-tagged affiliate/transaction link) isn't something AMFI's
 * feeds carry -- scripts/sync_amfi_nfo.js's own header explains why that
 * pipeline can't carry a manually-supplied field either (it overwrites its
 * document wholesale every run). This sync is a separate, additive
 * pipeline specifically for AMC-provided link generators, structured so a
 * new AMC can be added by writing one more fetcher, not by hand-maintaining
 * a slug map (lib/nfoInvestLinks.js still exists as a manual override/
 * fallback for AMCs with no such API).
 *
 * Provider contract: each entry in PROVIDERS exposes
 *   fetch(existingByIsin) -> Promise<{ byIsin, bySchemeName }>
 * where byIsin/bySchemeName are plain { key: url } maps. `existingByIsin`
 * (this AMC's own byIsin map from the PREVIOUS sync) lets a provider reuse
 * an already-generated link for a scheme it's seen before instead of
 * calling the AMC's "create link" endpoint again on every run -- see
 * fetchCarnelianLinks()'s own comment for why that matters here
 * specifically.
 *
 * Carnelian Mutual Fund (verified live, 2026-10): their "create ARN
 * transaction link" portal (partners.carnelianmf.com) is a plain
 * Laravel + Inertia.js app with no auth beyond ARN validation. The full
 * fund list (every scheme, with ISIN, `type`, `option`) ships inline in
 * the page's own initial HTML load inside
 *   <script data-page="app" type="application/json">{ "props": {
 *     "funds": { "data": [...] } }, "version": "..." }</script>
 * and "Create link" is a plain POST once you have that load's session
 * cookie, CSRF token, and Inertia asset version. See
 * scripts/carnelian-invest-link.mjs for the original one-off CLI version
 * of this same logic (kept for ad hoc manual lookups); this file is the
 * scheduled, bulk, cache-writing version of it.
 *
 * Usage:
 *   node scripts/sync_invest_links.js [--dry-run]
 *   node scripts/sync_invest_links.js --self-test
 */

const { backupThenPut } = require('./lib/r2SyncSafety');

const DRY_RUN = process.argv.includes('--dry-run');
const R2_KEY = 'amc-invest-links.json';
const PACING_MS = 400;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normaliseSchemeName(name) {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// AMFI's NFO feed (lib/nfoData.js, via scripts/sync_amfi_nfo.js) carries
// only the BASE scheme name ("Carnelian Small Cap Fund") -- an AMC's own
// portal lists the specific share-class variant ("Carnelian Small Cap Fund
// Regular Plan Growth"). Without stripping that suffix, an NFO page's
// bySchemeName lookup against the full portal name always misses (verified
// live: it silently fell through to the old hand-maintained fallback
// instead of the freshly-synced link). Only strips a Regular-Growth-shaped
// suffix -- this script already filters every provider to that one share
// class, so there's no other variant a stripped name could collide with.
function stripShareClassSuffix(name) {
  return (name || '')
    .replace(/\s*-?\s*regular\s*-?\s*plan\s*-?\s*growth(\s*option)?\s*$/i, '')
    .trim();
}

// Pure, self-test-able: decides which funds already have a reusable link
// (present in this AMC's previous byIsin map) vs which genuinely need a
// fresh "create link" call. Kept separate from fetchCarnelianLinks()'s
// network code so the decision itself -- not the HTTP plumbing around it
// -- is what the self-test actually exercises.
function partitionFundsNeedingLinks(funds, existingByIsin) {
  const reuse = [];
  const toCreate = [];
  for (const f of funds) {
    if (existingByIsin && existingByIsin[f.isin]) reuse.push(f);
    else toCreate.push(f);
  }
  return { reuse, toCreate };
}

// ─── Carnelian Mutual Fund ──────────────────────────────────────────────

const CARNELIAN_PORTAL_BASE = 'https://partners.carnelianmf.com';
const CARNELIAN_LINK_PAGE_PATH = '/distributor/arn-txn-link';

// Public AMFI-issued distributor identifiers (ARN/EUIN), not secrets --
// see scripts/carnelian-invest-link.mjs's header for the same note.
// Overridable via env for a different ARN without touching code.
const CARNELIAN_ARN = process.env.CARNELIAN_ARN || '0155';
const CARNELIAN_EUIN = process.env.CARNELIAN_EUIN || 'E468841';
const CARNELIAN_SUB_ARN = process.env.CARNELIAN_SUB_ARN || '251838';
const CARNELIAN_SUB_BROKER_NAME = process.env.CARNELIAN_SUB_BROKER_NAME || 'Atin';

function parseSetCookie(setCookieHeaderValue) {
  const first = setCookieHeaderValue.split(';')[0];
  const eq = first.indexOf('=');
  return { name: first.slice(0, eq).trim(), value: first.slice(eq + 1).trim() };
}

async function carnelianFetchSessionAndFunds() {
  const res = await fetch(`${CARNELIAN_PORTAL_BASE}${CARNELIAN_LINK_PAGE_PATH}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AbundanceNFOBot/1.0)' },
  });
  if (!res.ok) throw new Error(`GET ${CARNELIAN_LINK_PAGE_PATH} failed: HTTP ${res.status}`);

  const cookies = {};
  const rawCookies = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') || '').split(/,(?=[^;]+?=)/);
  for (const raw of rawCookies) {
    if (!raw) continue;
    const { name, value } = parseSetCookie(raw);
    if (name) cookies[name] = value;
  }
  if (!cookies['carnelian_mf_session'] || !cookies['XSRF-TOKEN']) {
    throw new Error('Could not capture session/XSRF cookies -- portal may have changed.');
  }

  const html = await res.text();
  const match = html.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Could not find the embedded Inertia page payload -- portal markup may have changed.');

  const page = JSON.parse(match[1]);
  const version = page.version;
  const allFunds = page.props?.funds?.data || [];
  if (page.props?.funds?.last_page > 1) {
    console.warn(`[sync_invest_links] carnelian: fund list is paginated (${page.props.funds.last_page} pages) -- only page 1 was read.`);
  }
  if (!version || allFunds.length === 0) {
    throw new Error('Embedded page payload missing version or fund list -- portal shape may have changed.');
  }

  // Scope: only ever "Regular Plan Growth" (the only share class non-advisor
  // retail clients should be pointed at), per this feature's explicit brief.
  const funds = allFunds.filter((f) => f.type === 'regular' && f.option === 'growth');
  return { cookies, version, funds };
}

async function carnelianCreateLink({ cookies, version, isin }) {
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(`${CARNELIAN_PORTAL_BASE}${CARNELIAN_LINK_PAGE_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/html, application/xhtml+xml',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Inertia': 'true',
      'X-Inertia-Version': version,
      'X-XSRF-TOKEN': decodeURIComponent(cookies['XSRF-TOKEN']),
      'Referer': `${CARNELIAN_PORTAL_BASE}${CARNELIAN_LINK_PAGE_PATH}`,
      'Cookie': cookieHeader,
      'User-Agent': 'Mozilla/5.0 (compatible; AbundanceNFOBot/1.0)',
    },
    body: JSON.stringify({
      arn: `ARN-${CARNELIAN_ARN}`,
      euin: CARNELIAN_EUIN,
      sub_arn: CARNELIAN_SUB_ARN ? `ARN-${CARNELIAN_SUB_ARN}` : null,
      sub_broker_name: CARNELIAN_SUB_BROKER_NAME || null,
      isin,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`POST ${CARNELIAN_LINK_PAGE_PATH} failed for ${isin}: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  if (!data.link) throw new Error(`Response for ${isin} had no "link" field: ${JSON.stringify(data).slice(0, 200)}`);
  return data.link;
}

// Only calls Carnelian's own "create link" endpoint for ISINs this sync
// has never seen before -- a scheme's link, once generated, is reused
// forever rather than regenerated on every nightly run. That's both
// polite to their system (no daily churn against an endpoint meant for a
// human clicking "Create link" occasionally) and better for us: a stable
// URL is safe to have been shared/bookmarked, instead of silently
// rotating underneath whoever clicked it yesterday.
async function fetchCarnelianLinks(existingByIsin) {
  const { cookies, version, funds } = await carnelianFetchSessionAndFunds();
  const { reuse, toCreate } = partitionFundsNeedingLinks(funds, existingByIsin);

  const byIsin = {};
  const bySchemeName = {};

  // Indexes under both the portal's full share-class name AND the bare
  // base name (AMFI's NFO feed shape) -- see stripShareClassSuffix()'s
  // comment for why the base-name key is the one that actually matters.
  function indexSchemeName(rawName, link) {
    bySchemeName[normaliseSchemeName(rawName)] = link;
    const base = stripShareClassSuffix(rawName);
    if (base) bySchemeName[normaliseSchemeName(base)] = link;
  }

  for (const f of reuse) {
    byIsin[f.isin] = existingByIsin[f.isin];
    indexSchemeName(f.scheme_name, existingByIsin[f.isin]);
  }

  for (const f of toCreate) {
    try {
      const link = await carnelianCreateLink({ cookies, version, isin: f.isin });
      byIsin[f.isin] = link;
      indexSchemeName(f.scheme_name, link);
      console.log(`[sync_invest_links] carnelian: created link for ${f.scheme_name} (${f.isin})`);
    } catch (e) {
      console.warn(`[sync_invest_links] carnelian: ${e.message}`);
    }
    await sleep(PACING_MS);
  }

  return { byIsin, bySchemeName };
}

// Providers are matched to the rest of this app by their AMC name --
// matchFragments is currently unused by this script itself (each
// provider's own fetch() already knows its own fund universe), but is
// kept on the record for future callers that need to decide "does this
// AMC have an automated provider at all" without importing this whole
// file's network code just to find out.
const PROVIDERS = [
  { key: 'carnelian', displayName: 'Carnelian Mutual Fund', matchFragments: ['carnelian'], fetch: fetchCarnelianLinks },
];

function selfTest() {
  const assert = require('assert');

  assert.strictEqual(normaliseSchemeName('  Carnelian  Small Cap   Fund '), 'carnelian small cap fund');
  assert.strictEqual(normaliseSchemeName(''), '');

  // The exact case that broke live: AMFI's NFO feed carries only the base
  // name, the AMC portal carries the full share-class name.
  assert.strictEqual(stripShareClassSuffix('Carnelian Small Cap Fund Regular Plan Growth'), 'Carnelian Small Cap Fund');
  assert.strictEqual(stripShareClassSuffix('Carnelian Small Cap Fund - Regular Plan - Growth'), 'Carnelian Small Cap Fund');
  assert.strictEqual(stripShareClassSuffix('Carnelian Small Cap Fund Regular Plan Growth Option'), 'Carnelian Small Cap Fund');
  // No matching suffix -- returned unchanged, not mangled.
  assert.strictEqual(stripShareClassSuffix('Carnelian Liquid Fund'), 'Carnelian Liquid Fund');
  assert.strictEqual(stripShareClassSuffix(''), '');

  const funds = [{ isin: 'A1' }, { isin: 'A2' }, { isin: 'A3' }];
  const { reuse, toCreate } = partitionFundsNeedingLinks(funds, { A1: 'https://x/1', A3: 'https://x/3' });
  assert.strictEqual(reuse.length, 2);
  assert.strictEqual(toCreate.length, 1);
  assert.strictEqual(toCreate[0].isin, 'A2');

  // No existing map at all -- everything needs creating, not a crash.
  const allNew = partitionFundsNeedingLinks(funds, null);
  assert.strictEqual(allNew.toCreate.length, 3);
  assert.strictEqual(allNew.reuse.length, 0);

  console.log('[sync_invest_links] Self-test: ALL PASSED');
}

async function run() {
  console.log('=== Syncing AMC direct-invest links ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active]');

  const { r2Get, r2Put } = await import('../lib/r2.js');

  let existing = null;
  try {
    existing = await r2Get(R2_KEY);
  } catch (e) {
    console.warn(`[sync_invest_links] Could not read existing R2 document (continuing with none): ${e.message}`);
  }

  const amcs = {};
  for (const provider of PROVIDERS) {
    try {
      const existingByIsin = existing?.amcs?.[provider.key]?.byIsin || {};
      const { byIsin, bySchemeName } = await provider.fetch(existingByIsin);
      amcs[provider.key] = {
        displayName: provider.displayName,
        fetchedAt: new Date().toISOString(),
        byIsin,
        bySchemeName,
      };
      console.log(`[sync_invest_links] ${provider.key}: ${Object.keys(byIsin).length} scheme(s) with a link.`);
    } catch (e) {
      console.error(`[sync_invest_links] ${provider.key}: failed entirely (${e.message}) -- keeping its previous entry, if any.`);
      if (existing?.amcs?.[provider.key]) amcs[provider.key] = existing.amcs[provider.key];
    }
  }

  const result = { syncedAt: new Date().toISOString(), amcs };

  if (!DRY_RUN) {
    await backupThenPut(r2Put, R2_KEY, existing, JSON.stringify(result));
    console.log(`[sync_invest_links] Successfully wrote to R2 (${R2_KEY}).`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}

module.exports = {
  normaliseSchemeName,
  stripShareClassSuffix,
  partitionFundsNeedingLinks,
  fetchCarnelianLinks,
  PROVIDERS,
};

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    run().catch((e) => {
      console.error('[sync_invest_links] Fatal error:', e);
      process.exit(1);
    });
  }
}
