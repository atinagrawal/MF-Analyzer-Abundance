/**
 * scripts/carnelian-invest-link.mjs
 *
 * Generates a direct-invest ("ARN transaction link") for a Carnelian Mutual
 * Fund scheme without using their web UI at
 * https://partners.carnelianmf.com/distributor/arn-txn-link -- that page is
 * a Laravel + Inertia.js app, and its "Create link" button just does a
 * plain POST once you have its session cookie, CSRF token and current
 * Inertia asset version, all three of which are embedded in the initial
 * page load (no login/auth beyond that -- the ARN itself is what's
 * validated server-side). The scheme picker's "Choose a fund" dialog in the
 * UI never calls a separate search API either: the FULL fund list (every
 * Carnelian scheme, with ISIN, `type` and `option`) ships inline in that
 * same initial page load, inside
 *   <script data-page="app" type="application/json">{ ...,
 *     "props": { "funds": { "data": [ { "isin", "scheme_name", "type",
 *       "option", "amc_slug", ... } ] }, "version" } }
 *   </script>
 * -- so a new Carnelian NFO's "Regular Plan Growth" scheme is resolvable by
 * name the moment it appears there, no manual ISIN lookup needed.
 *
 * Usage:
 *   node scripts/carnelian-invest-link.mjs "Carnelian Small Cap Fund"
 *   node scripts/carnelian-invest-link.mjs --isin INF30CN01129
 *   node scripts/carnelian-invest-link.mjs --list        (prints every
 *     Regular-Growth Carnelian scheme currently known to their portal)
 *
 * The distributor identity (ARN/EUIN/sub-broker) defaults to the ARN-0155
 * (NJ IndiaInvest Pvt Ltd) / EUIN E468841 / sub-broker ARN-251838 ("Atin")
 * combination already in use for this site's other Carnelian link -- these
 * are public AMFI-issued distributor identifiers, not secrets. Override via
 * env vars (CARNELIAN_ARN, CARNELIAN_EUIN, CARNELIAN_SUB_ARN,
 * CARNELIAN_SUB_BROKER_NAME) if a different ARN is ever needed.
 *
 * After running, paste the printed link into the relevant slug's entry in
 * lib/nfoInvestLinks.js -- this script only reads Carnelian's portal and
 * generates a link there; it does not touch this repo's own files.
 */

const PORTAL_BASE = 'https://partners.carnelianmf.com';
const LINK_PAGE_PATH = '/distributor/arn-txn-link';

const ARN = process.env.CARNELIAN_ARN || '0155';
const EUIN = process.env.CARNELIAN_EUIN || 'E468841';
const SUB_ARN = process.env.CARNELIAN_SUB_ARN || '251838';
const SUB_BROKER_NAME = process.env.CARNELIAN_SUB_BROKER_NAME || 'Atin';

function parseArgs(argv) {
  const args = { query: null, isin: null, list: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--isin') args.isin = argv[++i];
    else if (a === '--list') args.list = true;
    else if (!a.startsWith('--')) args.query = a;
  }
  return args;
}

// Decodes a single Set-Cookie header's NAME=value pair (ignores attributes
// like Path/Secure/SameSite -- we only need name/value to resend them).
function parseSetCookie(setCookieHeaderValue) {
  const first = setCookieHeaderValue.split(';')[0];
  const eq = first.indexOf('=');
  return { name: first.slice(0, eq).trim(), value: first.slice(eq + 1).trim() };
}

async function fetchSessionAndFunds() {
  const res = await fetch(`${PORTAL_BASE}${LINK_PAGE_PATH}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AbundanceNFOBot/1.0)' },
  });
  if (!res.ok) throw new Error(`GET ${LINK_PAGE_PATH} failed: HTTP ${res.status}`);

  const cookies = {};
  // Node's fetch exposes multiple Set-Cookie values via getSetCookie();
  // fall back to the single joined header for older runtimes.
  const rawCookies = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') || '').split(/,(?=[^;]+?=)/);
  for (const raw of rawCookies) {
    if (!raw) continue;
    const { name, value } = parseSetCookie(raw);
    if (name) cookies[name] = value;
  }
  if (!cookies['carnelian_mf_session'] || !cookies['XSRF-TOKEN']) {
    throw new Error('Could not capture session/XSRF cookies from the portal -- it may have changed.');
  }

  const html = await res.text();
  const match = html.match(/<script data-page="app" type="application\/json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('Could not find the embedded Inertia page payload -- the portal\'s markup may have changed.');

  const page = JSON.parse(match[1]);
  const version = page.version;
  const funds = page.props?.funds?.data || [];
  if (page.props?.funds?.last_page > 1) {
    console.warn(`[carnelian-invest-link] Warning: fund list is paginated (${page.props.funds.last_page} pages) -- only page 1 was read.`);
  }
  if (!version || funds.length === 0) {
    throw new Error('Embedded page payload was missing a version or a fund list -- the portal\'s shape may have changed.');
  }

  return { cookies, version, funds };
}

function resolveFund(funds, { query, isin }) {
  const regularGrowth = funds.filter((f) => f.type === 'regular' && f.option === 'growth');
  if (isin) {
    const hit = regularGrowth.find((f) => f.isin === isin);
    if (!hit) throw new Error(`No Regular-Growth Carnelian scheme found with ISIN ${isin}.`);
    return hit;
  }
  const q = (query || '').trim().toLowerCase();
  if (!q) throw new Error('Pass a fund name, --isin <ISIN>, or --list.');
  const hits = regularGrowth.filter((f) => f.scheme_name.toLowerCase().includes(q));
  if (hits.length === 0) {
    throw new Error(`No Regular-Growth Carnelian scheme matched "${query}". Run with --list to see what's available.`);
  }
  if (hits.length > 1) {
    const names = hits.map((f) => `  - ${f.scheme_name} (${f.isin})`).join('\n');
    throw new Error(`"${query}" matched more than one scheme -- be more specific:\n${names}`);
  }
  return hits[0];
}

async function createLink({ cookies, version, isin }) {
  const cookieHeader = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(`${PORTAL_BASE}${LINK_PAGE_PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'text/html, application/xhtml+xml',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Inertia': 'true',
      'X-Inertia-Version': version,
      'X-XSRF-TOKEN': decodeURIComponent(cookies['XSRF-TOKEN']),
      'Referer': `${PORTAL_BASE}${LINK_PAGE_PATH}`,
      'Cookie': cookieHeader,
      'User-Agent': 'Mozilla/5.0 (compatible; AbundanceNFOBot/1.0)',
    },
    body: JSON.stringify({
      arn: `ARN-${ARN}`,
      euin: EUIN,
      sub_arn: SUB_ARN ? `ARN-${SUB_ARN}` : null,
      sub_broker_name: SUB_BROKER_NAME || null,
      isin,
    }),
  });

  if (res.status === 409) {
    throw new Error('Portal returned 409 (stale Inertia version) -- their asset build moved on; just re-run this script.');
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`POST ${LINK_PAGE_PATH} failed: HTTP ${res.status} ${body.slice(0, 300)}`);
  }
  const data = await res.json();
  if (!data.link) throw new Error(`Response had no "link" field: ${JSON.stringify(data).slice(0, 300)}`);
  return data.link;
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const { cookies, version, funds } = await fetchSessionAndFunds();

  if (args.list) {
    const regularGrowth = funds.filter((f) => f.type === 'regular' && f.option === 'growth');
    console.log(`${regularGrowth.length} Regular-Growth Carnelian scheme(s) currently on the portal:`);
    for (const f of regularGrowth) console.log(`  - ${f.scheme_name}  (ISIN ${f.isin})`);
    return;
  }

  const fund = resolveFund(funds, args);
  const link = await createLink({ cookies, version, isin: fund.isin });

  console.log(`Scheme: ${fund.scheme_name}`);
  console.log(`ISIN:   ${fund.isin}`);
  console.log(`Link:   ${link}`);
}

run().catch((e) => {
  console.error(`[carnelian-invest-link] ${e.message}`);
  process.exit(1);
});
