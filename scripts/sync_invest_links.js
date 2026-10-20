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
 *   fetch(existingByIsin, existingBySchemeName) -> Promise<{ byIsin, bySchemeName }>
 * where byIsin/bySchemeName are plain { key: url } maps, and the two
 * `existing*` args are this AMC's own maps from the PREVIOUS sync -- so a
 * provider can reuse an already-generated link for a scheme it's seen
 * before instead of calling the AMC's "create link" endpoint again on
 * every run (see fetchCarnelianLinks()'s and fetchHdfcViaCams()'s own
 * comments for why that matters, and which of the two existing-maps each
 * one actually needs).
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
 * HDFC Mutual Fund, via CAMS (verified live, 2026-10): CAMS (the RTA) runs
 * a shared "AMCLinkGenerate" tool at mycams.camsonline.com, one `?amc=<id>`
 * page per AMC they service -- see
 * docs/superpowers/specs/2026-10-18-cams-invest-link-feasibility.md for how
 * this was found. Unlike Carnelian, it's classic ASP.NET WebForms with AJAX
 * UpdatePanel postbacks and no embedded ISIN anywhere, so
 * scripts/lib/camsLinkGenerator.js drives it with a real (Puppeteer)
 * browser and this file resolves each generated scheme's ISIN afterward
 * via an mf_screener name lookup (see fetchHdfcViaCams()). Needs
 * POSTGRES_URL in the environment for that lookup, and `puppeteer`
 * installed (not a committed dependency -- see
 * .github/workflows/invest-links-sync.yml, installed the same ad hoc way
 * aws4fetch is for every sync workflow in this repo).
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
    .replace(/\s*-?\s*(regular\s*-?\s*(plan)?\s*-?\s*growth(\s*option)?|growth\s*-?\s*regular\s*(plan)?|growth(\s*option)?)\s*$/i, '')
    .replace(/\s*-\s*$/, '')
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

// Resolves CAMS-generated schemes' real ISINs by name-matching against
// mf_screener (lib/screenerData.js's own data source) -- CAMS's tool never
// exposes ISIN anywhere (confirmed live: the scheme <select>'s own
// `value`s are internal CAMS codes like "ZEQU", not ISINs), but mf_screener
// already has every live fund's ISIN+name+AMC from AMFI's NAVAll feed.
// mf_screener's own `name` is ALREADY a cleaned, canonical, one-row-per-fund
// display name (confirmed live: "HDFC Short Term Fund", no "Regular"/
// "Growth" suffix at all -- scripts/build-screener.mjs's own dedup, not
// AMFI's raw plan-qualified naming).
//
// ONE query per AMC per run, not one (or two) per scheme: the original
// version queried mf_screener inside the per-scheme loop -- for ~90 HDFC
// schemes alone that's 100-180 round trips per run, repeated across every
// test/debug/production run in a single session. That's almost certainly
// what blew through this project's Prisma Postgres monthly operations
// quota (confirmed live: usage paused mid-session). Fetching the whole
// AMC's {isin, name} list once and matching in memory does the exact same
// job for 1 query instead of ~150.
// Deliberately does NOT catch its own query error -- this bit production
// R2 data, for real: swallowing a Postgres connection failure here and
// returning [] used to be indistinguishable from "mf_screener genuinely
// has zero rows for this AMC", so a real outage (confirmed live: this
// project's Prisma Postgres account hit "planLimitReached") made every
// scheme resolve to "no ISIN match" instead of failing loudly -- and
// because that looks like a normal, successful (if disappointing) result,
// run()'s per-provider try/catch never triggered its "keep the previous
// entry" fallback. The scheduled sync ran, "succeeded", and silently
// overwrote a real, working 68-scheme byIsin map with an empty one. Let
// this throw; the caller's provider function (fetchCamsLinksGeneric,
// fetchMotilalLinks) must NOT catch it either, so it reaches run()'s
// existing guard. (The 68 real CAMS links survived anyway, by luck: they
// live in bySchemeName too, built before ISIN resolution ever runs.)
async function fetchMfScreenerRowsForAmc(pool, amcLikePattern) {
  const { rows } = await pool.query(
    `SELECT isin, name FROM mf_screener WHERE amc ILIKE $1 AND isin IS NOT NULL`,
    [amcLikePattern]
  );
  return rows;
}

// In-memory version of the old per-query lookup -- same exact-then-fuzzy
// logic (exact avoids e.g. "HDFC Flexi Cap Fund" loosely matching "HDFC
// Flexi Cap Fund - Series II" if that ever exists; fuzzy falls back to the
// shortest containing name, i.e. the most specific real match), just
// against the batch already fetched by fetchMfScreenerRowsForAmc().
function resolveIsinFromRows(rows, baseName) {
  if (!baseName) return null;
  const target = baseName.trim().toLowerCase();
  if (!target) return null;

  const exact = rows.find((r) => r.name.trim().toLowerCase() === target);
  if (exact) return exact.isin;

  const fuzzy = rows
    .filter((r) => r.name.toLowerCase().includes(target))
    .sort((a, b) => a.name.length - b.name.length);
  return fuzzy[0]?.isin || null;
}

// CAMS shared AMCLinkGenerate tool (see this file's header and scripts/lib/camsLinkGenerator.js).
// Automates the ASP.NET WebForms flow via Puppeteer, then resolves each generated
// scheme's ISIN via mf_screener name lookup.
async function fetchCamsLinksGeneric(amcKey, amcLikePattern, existingByIsin, existingBySchemeName) {
  const puppeteer = require('puppeteer');
  const { fetchCamsLinksForAmc } = require('./lib/camsLinkGenerator');
  const pool = (await import('../lib/db.js')).default;

  // Fetched BEFORE the (slow, Puppeteer-driven) CAMS flow runs -- fail fast
  // on a Postgres outage rather than discovering it after several minutes
  // of browser automation, and never reach the point of writing a
  // successfully-generated bySchemeName with no byIsin behind it.
  const screenerRows = await fetchMfScreenerRowsForAmc(pool, amcLikePattern);

  const limit = process.env.CAMS_SCHEME_LIMIT ? Number(process.env.CAMS_SCHEME_LIMIT) : undefined;
  const { bySchemeName: rawBySchemeName } = await fetchCamsLinksForAmc(amcKey, existingBySchemeName, puppeteer, { limit });

  const byIsin = {};
  const bySchemeName = {};

  for (const [fullName, link] of Object.entries(rawBySchemeName)) {
    bySchemeName[fullName] = link;
    const baseName = stripShareClassSuffix(fullName);
    if (baseName) bySchemeName[normaliseSchemeName(baseName)] = link;

    const isin = resolveIsinFromRows(screenerRows, baseName || fullName);
    if (isin) {
      byIsin[isin] = link;
    } else {
      console.warn(`[sync_invest_links] cams:${amcKey}: no mf_screener ISIN match for "${fullName}" -- link saved under scheme name only.`);
    }
  }

  return { byIsin, bySchemeName };
}

async function fetchHdfcViaCams(existingByIsin, existingBySchemeName) {
  return fetchCamsLinksGeneric('hdfc', '%hdfc%', existingByIsin, existingBySchemeName);
}

async function fetchTataViaCams(existingByIsin, existingBySchemeName) {
  return fetchCamsLinksGeneric('tata', '%tata%', existingByIsin, existingBySchemeName);
}

async function fetchHsbcViaCams(existingByIsin, existingBySchemeName) {
  return fetchCamsLinksGeneric('hsbc', '%hsbc%', existingByIsin, existingBySchemeName);
}

async function fetchDspViaCams(existingByIsin, existingBySchemeName) {
  return fetchCamsLinksGeneric('dsp', '%dsp%', existingByIsin, existingBySchemeName);
}

async function fetchUnionViaCams(existingByIsin, existingBySchemeName) {
  return fetchCamsLinksGeneric('union', '%union%', existingByIsin, existingBySchemeName);
}

async function fetchShriramViaCams(existingByIsin, existingBySchemeName) {
  return fetchCamsLinksGeneric('shriram', '%shriram%', existingByIsin, existingBySchemeName);
}

// ─── PPFAS Mutual Fund ──────────────────────────────────────────────────

const PPFAS_ARN = process.env.PPFAS_ARN || '0155';
const PPFAS_EUIN = process.env.PPFAS_EUIN || 'E468841';

async function fetchPpfasLinks(existingByIsin, existingBySchemeName) {
  const pool = (await import('../lib/db.js')).default;
  const link = `https://selfinvest.ppfas.com/investor/regular/ARN-${PPFAS_ARN}/${PPFAS_EUIN}`;

  const res = await pool.query(
    "SELECT isin, name FROM mf_screener WHERE (amc ILIKE '%parag%' OR amc ILIKE '%ppfas%') AND isin IS NOT NULL"
  );

  const byIsin = {};
  const bySchemeName = {};

  for (const f of res.rows) {
    byIsin[f.isin] = link;
    bySchemeName[normaliseSchemeName(f.name)] = link;
    const base = stripShareClassSuffix(f.name);
    if (base) bySchemeName[normaliseSchemeName(base)] = link;
  }

  console.log(`[sync_invest_links] ppfas: mapped ${res.rows.length} scheme(s) to ARN-${PPFAS_ARN}/${PPFAS_EUIN}.`);
  return { byIsin, bySchemeName };
}

// ─── Motilal Oswal Mutual Fund ──────────────────────────────────────────

const MOTILAL_ARN = process.env.MOTILAL_ARN || '0155';
const MOTILAL_SUB_ARN = process.env.MOTILAL_SUB_ARN || '251838';
const MOTILAL_SUB_BROKER_CODE = process.env.MOTILAL_SUB_BROKER_CODE || '22734';
const MOTILAL_EUIN = process.env.MOTILAL_EUIN || 'E468841';

async function fetchMotilalLinks(existingByIsin, existingBySchemeName) {
  const pool = (await import('../lib/db.js')).default;

  const SCHEME_API_URL = 'https://digital.motilaloswalmf.com/ncms/api/FundCategorisationMF/get-fund-details?isETF=false';
  const CART_API_URL = 'https://digital.motilaloswalmf.com/oms/api/Cart/prelogin-add-to-cart/';
  const DEEPLINK_API_URL = 'https://digital.motilaloswalmf.com/deeplinkapi/dit-purchase-link';

  const res = await fetch(SCHEME_API_URL, {
    headers: {
      accept: 'application/json, text/plain, */*',
      appid: '654971C7M684BA4A54M9C48CBBD237E0AA34',
      'x-encrypted': 'N',
      'X-API-Key': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJuYW1lIjoiSSBhbSBDaGFuZHJhYSJ9.sFQoVHrvLf7noktxYkdhy8YPmSCwiOsQpoHCXI-gLu8',
    },
  });
  if (!res.ok) throw new Error(`Motilal get-fund-details failed: HTTP ${res.status}`);

  const data = await res.json();
  const mfData = data?.response?.data?.MF || {};

  const regularGrowthFunds = [];
  for (const schCode of Object.keys(mfData)) {
    const list = mfData[schCode];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const { schDetail, plan, option, amcPlancode } = item;
      if (!schDetail || !plan || !option) continue;
      if (schDetail.schname?.toUpperCase().includes('ETF')) continue;

      for (const pKey of Object.keys(plan)) {
        if (!/regular/i.test(plan[pKey])) continue;
        for (const oKey of Object.keys(option)) {
          if (!/growth/i.test(option[oKey])) continue;
          const prodCode = `${schCode}${pKey}${oKey}`;
          regularGrowthFunds.push({
            schemeName: schDetail.schname,
            schemeCode: schDetail.schcode,
            schemePlanCode: amcPlancode?.[prodCode] || '',
            schemePlanName: plan[pKey],
            schemeOptionCode: oKey,
            schemeOptionName: option[oKey],
          });
        }
      }
    }
  }

  const byIsin = {};
  const bySchemeName = {};
  const screenerRows = await fetchMfScreenerRowsForAmc(pool, '%motilal%');

  function indexSchemeName(rawName, link) {
    bySchemeName[normaliseSchemeName(rawName)] = link;
    const base = stripShareClassSuffix(rawName);
    if (base) bySchemeName[normaliseSchemeName(base)] = link;
  }

  for (const f of regularGrowthFunds) {
    const baseName = stripShareClassSuffix(f.schemeName);
    const isin = resolveIsinFromRows(screenerRows, baseName || f.schemeName);

    // Reuse check: if already in existingByIsin or existingBySchemeName
    const norm = normaliseSchemeName(baseName || f.schemeName);
    if (isin && existingByIsin?.[isin]) {
      byIsin[isin] = existingByIsin[isin];
      indexSchemeName(f.schemeName, existingByIsin[isin]);
      continue;
    }
    if (existingBySchemeName?.[norm]) {
      if (isin) byIsin[isin] = existingBySchemeName[norm];
      indexSchemeName(f.schemeName, existingBySchemeName[norm]);
      continue;
    }

    try {
      const payload = {
        prelogin: true,
        cartId: '',
        totalAmount: '500',
        utrParams: '',
        campaign: '',
        branchCode: 'WB99',
        subBranchCode: 'AMCMO',
        isAllFunds: false,
        items: [
          {
            schemeName: f.schemeName,
            schemeCode: f.schemeCode,
            schemePlanCode: f.schemePlanCode,
            schemePlanName: f.schemePlanName,
            schemeOptionCode: f.schemeOptionCode,
            schemeOptionName: f.schemeOptionName,
            amount: '500',
            transactionType: 1,
            transactionSubType: 1,
            brokerDetails: {
              distributorCodeType: 'ARN',
              distributorCode: MOTILAL_ARN,
              subBrokerCode: MOTILAL_SUB_ARN,
              empCode: MOTILAL_SUB_BROKER_CODE,
              euinNo: MOTILAL_EUIN,
            },
          },
        ],
      };

      const cartRes = await fetch(CART_API_URL, {
        method: 'POST',
        headers: {
          'X-Encrypted': 'N',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const cartData = await cartRes.json();
      const cartId = cartData?.response?.cartId;
      if (!cartId) {
        console.warn(`[sync_invest_links] motilal: cart creation failed for "${f.schemeName}"`);
        continue;
      }

      const longUrl = `https://invest.motilaloswalmf.com/mutualfund/login?returnURL=/sso&cartId=${cartId}&journeyType=POLP&quickLink=true`;
      const dlRes = await fetch(DEEPLINK_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
          Origin: 'https://www.motilaloswalmf.com',
          Referer: 'https://www.motilaloswalmf.com/quick-purchase',
          DITProduct: 'MF',
        },
        body: JSON.stringify({ longUrl }),
      });
      const dlData = await dlRes.json();
      const link = dlData?.shortUrl || longUrl;

      if (isin) byIsin[isin] = link;
      indexSchemeName(f.schemeName, link);
      console.log(`[sync_invest_links] motilal: created link for ${f.schemeName} (${isin || 'no ISIN'})`);
      await sleep(PACING_MS);
    } catch (e) {
      console.warn(`[sync_invest_links] motilal: ${f.schemeName}: ${e.message}`);
    }
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
  { key: 'hdfc', displayName: 'HDFC Mutual Fund', matchFragments: ['hdfc'], fetch: fetchHdfcViaCams },
  { key: 'tata', displayName: 'Tata Mutual Fund', matchFragments: ['tata'], fetch: fetchTataViaCams },
  { key: 'hsbc', displayName: 'HSBC Mutual Fund', matchFragments: ['hsbc'], fetch: fetchHsbcViaCams },
  { key: 'dsp', displayName: 'DSP Mutual Fund', matchFragments: ['dsp'], fetch: fetchDspViaCams },
  { key: 'union', displayName: 'Union Mutual Fund', matchFragments: ['union'], fetch: fetchUnionViaCams },
  { key: 'shriram', displayName: 'Shriram Mutual Fund', matchFragments: ['shriram'], fetch: fetchShriramViaCams },
  { key: 'ppfas', displayName: 'PPFAS Mutual Fund', matchFragments: ['ppfas', 'parag parikh'], fetch: fetchPpfasLinks },
  { key: 'motilal', displayName: 'Motilal Oswal Mutual Fund', matchFragments: ['motilal'], fetch: fetchMotilalLinks },
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
  assert.strictEqual(stripShareClassSuffix('Union ELSS Tax Saver Fund Growth - Regular Plan'), 'Union ELSS Tax Saver Fund');
  assert.strictEqual(stripShareClassSuffix('Union Liquid Fund Growth'), 'Union Liquid Fund');
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
      const existingBySchemeName = existing?.amcs?.[provider.key]?.bySchemeName || {};
      const { byIsin, bySchemeName } = await provider.fetch(existingByIsin, existingBySchemeName);

      // Partial-failure guard, same reasoning as this project's other sync
      // scripts (e.g. sync_mf_scheme_list.js): runs unattended on a
      // schedule, so refuse to overwrite good data with a suspiciously
      // smaller result. This is the second line of defense -- the first
      // (fetchMfScreenerRowsForAmc throwing on a DB error instead of
      // swallowing it) should mean a provider's fetch() throws instead of
      // ever reaching here with a hollowed-out result, but this guard
      // would have ALSO caught the real incident it's modeled on: a
      // scheduled run silently wrote an empty byIsin over a real 68-entry
      // one while Prisma Postgres was quota-exhausted, because the old
      // code treated "every ISIN lookup failed" as "no matches found".
      const existingCount = Object.keys(existingByIsin).length;
      const newCount = Object.keys(byIsin).length;
      if (existingCount >= 10 && newCount < existingCount * 0.5) {
        throw new Error(
          `byIsin count (${newCount}) is less than 50% of existing R2 copy's count (${existingCount}) -- refusing to overwrite, likely an upstream failure (e.g. Postgres unreachable).`
        );
      }

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
