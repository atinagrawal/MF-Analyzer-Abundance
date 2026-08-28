# PMS Detail Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every PMS strategy its own dedicated, SEO-indexable page at `/pms/[iaid]`, showing fee structure and historical performance APMI publishes but this site doesn't yet surface — free tier crawlable, richer analytics Pro-gated (mirroring the MF fund detail page's existing gate).

**Architecture:** Two new pure-scraper/parser functions in `lib/pmsScrapers.js` (zero framework-alias imports, so both Next API routes and a standalone Node script can import them) feed two new three-layer-cached API endpoints (`pms-details`, `pms-period-history`), which a new composing, session-gated route (`pms-detail/[id]`) calls in-process. A new page (`app/pms/[id]`) renders free facts always, richer analytics behind the existing Pro check. A late-stage script eagerly pre-warms the cache for strategies the screener already surfaces by default; everything else backfills lazily on first view.

**Tech Stack:** Next.js App Router, cheerio (already a dependency), Cloudflare R2 (`lib/r2.js`), NextAuth `auth()`, existing `CompareGrowthChart` component.

**Spec:** `docs/superpowers/specs/2026-08-28-pms-detail-pages-design.md`

## Global Constraints

- No new Postgres table — all new data is R2-cached scrape output, matching `pms-data`/`pms-benchmark`/`pms-quartile`'s existing precedent.
- `servicetype`/`serviceType` is always `'D'` (Discretionary) — matches the existing screener's only-covered service type.
- April 2023 (`2023-04`) is the confirmed floor for `getPerformanceChart.htm` history — do not query earlier months.
- The Pro gate is server-enforced (a genuinely smaller JSON payload to non-Pro callers), never client-side-only hiding — mirrors `app/api/fund-detail/[code]/route.js` exactly.
- Free tier must include: hero identity, key facts, and the full Fee & Terms card (fixed/variable fees, exit load, purpose) — this is the literal gap the feature exists to close; it must never move behind the Pro gate.
- Work directly on `main`, no feature branches. Commit automatically once each task is verified — never push without being asked. Never add a Claude/AI signature to any commit. Stage only the exact files each task's commit touches.
- No automated test framework exists in this repo for pipelines/pages like this. Verification is: `npm run build`, a live spot-check against real APMI data, and (for gated UI) a manual toggle of a test account's plan. The one exception: `parseAsOnDateObjects` gets an isolated, fixture-based check (mirroring `parseQuartileTable`'s existing precedent in `app/api/pms-quartile/route.js`) since it's parsing an undocumented, non-JSON format.

---

### Task 1: Pure APMI scraper/parser functions

**Files:**
- Create: `lib/pmsScrapers.js`

**Interfaces:**
- Produces: `fetchIaInsightHtml(iaid): Promise<string>`, `parseIaInsightDetails(html): object|null`, `fetchPmsDetails(iaid): Promise<object|null>` (fetch + parse combined), `extractPerlistsValue(html): string|null`, `parseAsOnDateObjects(rawValue): Array<object>`, `toMonthSnapshot(rawObjects): object|null`, `fetchPmsMonthSnapshot(iaid, year, month): Promise<object|null>` (fetch + parse combined), `MONTH_ABBR: string[]`, `monthsFrom(startYear, startMonth, endYear, endMonth): Array<{year,month}>`, `EARLIEST_YEAR = 2023`, `EARLIEST_MONTH = 4`.
- Consumes: nothing from earlier tasks (this is the foundation).

This file has **zero `@/` alias imports** — only `cheerio` (already a `package.json` dependency, used by `app/api/pms-data/route.js` and `app/api/pms-quartile/route.js`) and native `fetch`. That's deliberate: both the Next API routes (Task 2/3, importing via `@/lib/pmsScrapers`) and the standalone backfill script (Task 9, importing via a relative path `../lib/pmsScrapers.js`) need to call these same functions, and only alias-free, relative-importable lib files work in both contexts — see `lib/bseIndex.js`, which is already imported both ways (`app/api/bse-index/route.js` via `@/lib/bseIndex`, `scripts/build-bse-index-dashboard.mjs` via `../lib/bseIndex.js`).

- [ ] **Step 1: Write `lib/pmsScrapers.js`**

```js
/**
 * lib/pmsScrapers.js
 *
 * Pure APMI scraping + parsing functions for a single Investment Approach
 * (IA) -- deliberately dependency-light (cheerio + native fetch only, no
 * `@/` alias imports) so this file is importable both from Next API routes
 * (`@/lib/pmsScrapers`) and the standalone `scripts/backfill-pms-detail-pages.mjs`
 * (`../lib/pmsScrapers.js`), matching the existing dual-import pattern
 * `lib/bseIndex.js` already uses. Caching lives in the API route files that
 * call these functions (Task 2/3), not here.
 *
 * Two independent APMI endpoints, both verified live and cookie-free:
 *   1. GET IaInsight.htm?IAID=N        -- static details (fees, facts, manager)
 *   2. POST getPerformanceChart.htm    -- one month's period-wise performance
 */

import * as cheerio from 'cheerio';

const USER_AGENT = 'Mozilla/5.0';
const REFERRER = 'https://www.apmiindia.org/';

// ── 1. IaInsight.htm -- static details ──────────────────────────────────────

export async function fetchIaInsightHtml(iaid) {
  const res = await fetch(`https://www.apmiindia.org/apmi/IaInsight.htm?IAID=${encodeURIComponent(iaid)}`, {
    headers: { 'User-Agent': USER_AGENT, Referer: REFERRER },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`APMI IaInsight responded ${res.status}`);
  return res.text();
}

/**
 * Finds the <p> (or, for the Fund Manager card, <span class="wrapdata">)
 * immediately following a <label><b>labelText</b></label>, matching the
 * markup verified live on IaInsight.htm. Returns null if the label isn't
 * found or its value is empty.
 */
function fieldAfterLabel($, labelText, valueTag = 'p') {
  let result = null;
  $('label').each((_, el) => {
    const b = $(el).find('b').first();
    if (b.text().trim() !== labelText) return;
    const val = $(el).nextAll(valueTag).first();
    const text = val.text().replace(/\s+/g, ' ').trim();
    result = text || null;
    return false; // stop iterating once found
  });
  return result;
}

function parseAum($) {
  let aum = null;
  $('span').each((_, el) => {
    if ($(el).text().trim() !== '(AUM CR)') return;
    const h4 = $(el).parent().find('h4.pmsum-title').first();
    const num = parseFloat(h4.text().replace(/[₹,]/g, '').trim());
    if (!isNaN(num)) aum = num;
    return false;
  });
  return aum;
}

function parseFundManager($) {
  const card = $('h4.card-title').first();
  if (!card.length) return null;
  const name = card.text().trim();
  if (!name) return null;
  // Work Exp./Email ID/Mobile No use <span class="wrapdata"> as their value
  // tag, not <p> -- see the header comment for the exact markup difference.
  return {
    name,
    workExp: fieldAfterLabel($, 'Work Exp.', 'span.wrapdata') || fieldAfterLabel($, 'Work Exp', 'span.wrapdata'),
    email: fieldAfterLabel($, 'Email ID', 'span.wrapdata'),
    mobile: fieldAfterLabel($, 'Mobile No', 'span.wrapdata'),
  };
}

/**
 * Parses the "Investment Approach Details" + "Turnover Details" +
 * first Fund Manager card sections of an IaInsight.htm page.
 * Returns null if the page doesn't look like a valid IA page at all
 * (e.g. an unknown IAID) -- callers should treat that as "not found".
 */
export function parseIaInsightDetails(html) {
  const $ = cheerio.load(html);

  const providerName = fieldAfterLabel($, 'PMS Provider Name');
  const strategyName = fieldAfterLabel($, 'Strategy Name');
  if (!providerName && !strategyName) return null; // not a real IA page

  const minInvestmentRaw = fieldAfterLabel($, 'Min. Inv. Amount');
  const minInvestment = minInvestmentRaw ? parseFloat(minInvestmentRaw.replace(/[^\d.]/g, '')) : null;

  const turnover1MRaw = fieldAfterLabel($, '1 Month Turnover');
  const turnover1YRaw = fieldAfterLabel($, '1 Year Turnover');

  return {
    iaName: $('#IAName').attr('value') || null,
    providerName,
    benchmark: fieldAfterLabel($, 'Benchmark'),
    strategyName,
    productName: fieldAfterLabel($, 'Product Name'),
    inceptionDate: fieldAfterLabel($, 'Date Of Inception'),
    age: fieldAfterLabel($, 'Age'),
    minInvestment: isNaN(minInvestment) ? null : minInvestment,
    fixedFees: fieldAfterLabel($, 'Fixed Fees Structure'),
    variableFees: fieldAfterLabel($, 'Variable Fees Structure'),
    exitLoad: fieldAfterLabel($, 'Exit Load'),
    purpose: fieldAfterLabel($, 'Purpose'),
    aumCr: parseAum($),
    turnover1M: turnover1MRaw != null ? parseFloat(turnover1MRaw) : null,
    turnover1Y: turnover1YRaw != null ? parseFloat(turnover1YRaw) : null,
    fundManager: parseFundManager($),
  };
}

/** Fetch + parse combined -- the function API routes actually call. */
export async function fetchPmsDetails(iaid) {
  const html = await fetchIaInsightHtml(iaid);
  return parseIaInsightDetails(html);
}

// ── 2. getPerformanceChart.htm -- one month's period-wise performance ──────

export const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const EARLIEST_YEAR = 2023;
export const EARLIEST_MONTH = 4; // April 2023 -- confirmed floor (March 2023 returns "No Records Found")

/** Inclusive list of {year, month} from (startYear,startMonth) to (endYear,endMonth). */
export function monthsFrom(startYear, startMonth, endYear, endMonth) {
  const out = [];
  let y = startYear, m = startMonth;
  while (y < endYear || (y === endYear && m <= endMonth)) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * Extracts the raw `value` attribute of `<input ... id="perlists" value="...">`
 * from a getPerformanceChart.htm response fragment. Returns null when the
 * month has no data ("No Records Found" page, or the input is simply
 * missing) -- callers must treat that as "no data for this month", not an
 * error.
 */
export function extractPerlistsValue(html) {
  const m = html.match(/<input[^>]*id="perlists"[^>]*value="([^"]*)"/);
  if (!m || !m[1]) return null;
  return m[1]
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/**
 * Parses APMI's `perlists` value -- NOT JSON, it's Java's default
 * toString() for a List<Map<String,Object>>:
 *   [{AS_ON_DATE=Apr-2024, IA_ID=327, BENCHMARK_ID=null, MONTH1=5.06, ...}, {...}]
 * Verified live against the real endpoint. Exported standalone (per this
 * plan's testing convention) so it can be checked against a saved fixture
 * without a network call, mirroring `parseQuartileTable` in
 * `app/api/pms-quartile/route.js`.
 */
export function parseAsOnDateObjects(rawValue) {
  if (!rawValue || !rawValue.trim()) return [];
  const blocks = rawValue.match(/\{[^}]*\}/g);
  if (!blocks) return [];
  return blocks.map((block) => {
    const inner = block.slice(1, -1);
    const obj = {};
    inner.split(', ').forEach((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return;
      const key = pair.slice(0, eq).trim();
      const raw = pair.slice(eq + 1).trim();
      obj[key] = raw === 'null' ? null : raw;
    });
    return obj;
  });
}

/**
 * Normalizes the two raw objects (IA + benchmark) from one month's
 * `perlists` array into `{ asOnMonth, ia, benchmark }`. The IA's own row
 * has BENCHMARK_ID=null; the benchmark's row has a numeric BENCHMARK_ID.
 * Returns null if no IA row is present at all.
 */
export function toMonthSnapshot(rawObjects) {
  const numOrNull = (v) => (v == null ? null : parseFloat(v));
  const ia = rawObjects.find((o) => o.BENCHMARK_ID === null);
  const benchmark = rawObjects.find((o) => o.BENCHMARK_ID !== null);
  if (!ia) return null;

  const pick = (o) => (o ? {
    month1: numOrNull(o.MONTH1),
    month3: numOrNull(o.MONTH3),
    month6: numOrNull(o.MONTH6),
    year1: numOrNull(o.YEAR1),
    year2: numOrNull(o.YEAR2),
    year3: numOrNull(o.YEAR3),
    year4: numOrNull(o.YEAR4),
    year5: numOrNull(o.YEAR5),
    sinceInception: numOrNull(o.SINCE_INCEPTION),
  } : null);

  return {
    asOnMonth: ia.AS_ON_DATE, // e.g. "Apr-2024"
    ia: pick(ia),
    benchmark: pick(benchmark),
  };
}

/** Fetch + parse combined for a single month -- the function callers actually use. */
export async function fetchPmsMonthSnapshot(iaid, year, month) {
  const lastDay = new Date(year, month, 0).getDate(); // month is 1-indexed
  const asondate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const params = new URLSearchParams();
  params.append('iaid', String(iaid));
  params.append('serviceType', 'D');
  params.append('asondate', asondate);

  const res = await fetch('https://www.apmiindia.org/apmi/getPerformanceChart.htm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': USER_AGENT,
      Referer: `https://www.apmiindia.org/apmi/IaInsight.htm?IAID=${iaid}`,
    },
    body: params.toString(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`APMI getPerformanceChart responded ${res.status}`);
  const html = await res.text();
  const rawValue = extractPerlistsValue(html);
  if (!rawValue) return null;
  return toMonthSnapshot(parseAsOnDateObjects(rawValue));
}
```

- [ ] **Step 2: Verify the parser against a real fixture (no network call)**

Run this one-off check to confirm `parseAsOnDateObjects` handles the exact
format APMI returned live during this plan's research:

```bash
node -e "
const { parseAsOnDateObjects, toMonthSnapshot } = require('./lib/pmsScrapers.js');
" 2>&1 || node --input-type=module -e "
import { parseAsOnDateObjects, toMonthSnapshot } from './lib/pmsScrapers.js';
const fixture = '[{AS_ON_DATE=Apr-2024, IA_ID=327, BENCHMARK_ID=null, MONTH1=5.06, MONTH3=-2.89, MONTH6=7.57, YEAR1=21.84, YEAR2=10.56, YEAR3=17.78, YEAR4=28.80, YEAR5=14.95, SINCE_INCEPTION=14.56}, {AS_ON_DATE=Apr-2024, IA_ID=327, BENCHMARK_ID=22, MONTH1=3.44, MONTH3=6.05, MONTH6=25.01, YEAR1=38.63, YEAR2=20.19, YEAR3=20.46, YEAR4=28.62, YEAR5=18.21, SINCE_INCEPTION=13.26}]';
const objs = parseAsOnDateObjects(fixture);
console.assert(objs.length === 2, 'expected 2 objects, got ' + objs.length);
console.assert(objs[0].BENCHMARK_ID === null, 'first object should have BENCHMARK_ID null');
console.assert(objs[1].BENCHMARK_ID === '22', 'second object should have BENCHMARK_ID 22');
const snap = toMonthSnapshot(objs);
console.assert(snap.asOnMonth === 'Apr-2024', 'asOnMonth mismatch: ' + snap.asOnMonth);
console.assert(snap.ia.month1 === 5.06, 'ia.month1 mismatch: ' + snap.ia.month1);
console.assert(snap.benchmark.month1 === 3.44, 'benchmark.month1 mismatch: ' + snap.benchmark.month1);
console.log('parseAsOnDateObjects/toMonthSnapshot fixture check: PASS');
"
```

Expected: `parseAsOnDateObjects/toMonthSnapshot fixture check: PASS` with no assertion errors.

- [ ] **Step 3: Live spot-check against the real APMI endpoint**

```bash
node --input-type=module -e "
import { fetchPmsDetails, fetchPmsMonthSnapshot } from './lib/pmsScrapers.js';
const details = await fetchPmsDetails(327);
console.log('details:', JSON.stringify(details, null, 2));
const snap = await fetchPmsMonthSnapshot(327, 2024, 4);
console.log('Apr-2024 snapshot:', JSON.stringify(snap, null, 2));
"
```

Expected: `details` has non-null `providerName` ("Sundaram Alternate Assets Limited"), `fixedFees`, `variableFees`, `exitLoad`, `aumCr` (a number); `snap.asOnMonth === 'Apr-2024'` with numeric `month1` values on both `ia` and `benchmark`.

- [ ] **Step 4: Commit**

```bash
git add lib/pmsScrapers.js
git commit -m "feat(pms): add pure APMI IaInsight/getPerformanceChart scrapers"
```

---

### Task 2: `pms-details` endpoint (three-layer cache)

**Files:**
- Create: `lib/pmsDetailsCache.js`
- Create: `app/api/pms-details/route.js`

**Interfaces:**
- Consumes: `fetchPmsDetails(iaid)` from `@/lib/pmsScrapers` (Task 1); `r2Get`, `r2Put` from `@/lib/r2`.
- Produces: `export async function getPmsDetailsCached(iaid): Promise<object|null>` (from `lib/pmsDetailsCache.js` — imported directly, in-process, by Task 4's composing route and Task 5's page); `export async function GET(request)` (from `app/api/pms-details/route.js`, a thin wrapper — standalone `GET /api/pms-details?iaid=N` endpoint, `{status: 'success', data}` on success).

Follows the exact three-layer cache shape already used by `app/api/pms-benchmark/route.js` (in-memory `Map`, R2 blob, dedup `inflight` `Map`, stale-on-error fallback) — same 30-day memory / 90-day blob TTL class as `lib/apmiProviderMap.js`, since these fields (fees, inception date, etc.) change rarely.

The cache orchestration lives in a **lib module**, not the route file itself
— this repo has no precedent for one `route.js` importing another, and
`lib/apmiProviderMap.js` (whose `getApmiProviderId` is already imported
directly by `app/api/pms-quartile/route.js`) is the established pattern for
exactly this "shared, cached, in-process-callable" shape. The route file
stays a thin `GET` wrapper.

- [ ] **Step 1: Write `lib/pmsDetailsCache.js`**

```js
/**
 * lib/pmsDetailsCache.js
 *
 * Three-layer cache (in-memory Map -> R2 blob -> live scrape) around
 * lib/pmsScrapers.js's fetchPmsDetails(), same pattern as
 * app/api/pms-benchmark/route.js and lib/apmiProviderMap.js. Long TTL
 * (30d memory / 90d blob) since these fields (fees, inception date, etc.)
 * change rarely.
 *
 * Exported as a plain lib function (not left inline in the route file) so
 * both app/api/pms-details/route.js's own GET handler AND
 * app/api/pms-detail/[id]/route.js's composing, session-gated route
 * (Task 4) can call it directly, in-process -- avoiding an HTTP self-fetch
 * and any route-importing-route fragility.
 */

import { fetchPmsDetails } from '@/lib/pmsScrapers';
import { r2Get, r2Put } from '@/lib/r2';

const MEM_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // 30 days
const BLOB_TTL_MS = 90 * 24 * 60 * 60 * 1000;  // 90 days
const BLOB_BASE = 'pms-details-cache';

/** @type {Map<string, { data: object, ts: number }>} */
const memCache = new Map();
/** @type {Map<string, Promise<object|null>>} */
const inflight = new Map();

function isFresh(ts, ttlMs) {
  return ts && Date.now() - ts < ttlMs;
}

async function readFromBlob(iaid) {
  try {
    const payload = await r2Get(`${BLOB_BASE}/${iaid}.json`);
    if (!payload) return null;
    if (!isFresh(payload.ts, BLOB_TTL_MS)) return null;
    return payload;
  } catch (err) {
    console.warn('[pmsDetailsCache] Blob read error:', err.message);
    return null;
  }
}

async function writeToBlob(iaid, data) {
  try {
    await r2Put(`${BLOB_BASE}/${iaid}.json`, JSON.stringify({ data, ts: Date.now() }));
  } catch (err) {
    console.warn('[pmsDetailsCache] Blob write error:', err.message);
  }
}

export async function getPmsDetailsCached(iaid) {
  const key = String(iaid);

  const mem = memCache.get(key);
  if (isFresh(mem?.ts, MEM_TTL_MS)) return mem.data;

  const blob = await readFromBlob(key);
  if (blob) {
    memCache.set(key, { data: blob.data, ts: blob.ts });
    return blob.data;
  }

  if (inflight.has(key)) return inflight.get(key);

  const fetchPromise = (async () => {
    const data = await fetchPmsDetails(key);
    const ts = Date.now();
    memCache.set(key, { data, ts });
    if (data) writeToBlob(key, data); // fire-and-forget, only cache real hits
    inflight.delete(key);
    return data;
  })();
  inflight.set(key, fetchPromise);
  fetchPromise.catch(() => inflight.delete(key));

  return fetchPromise;
}

/** Exposed for the route's stale-on-error fallback (Step 2 below). */
export async function getStalePmsDetails(iaid) {
  const mem = memCache.get(String(iaid));
  if (mem) return mem.data;
  const blobStale = await r2Get(`${BLOB_BASE}/${iaid}.json`).catch(() => null);
  return blobStale ? blobStale.data : null;
}
```

- [ ] **Step 2: Write `app/api/pms-details/route.js`**

```js
/**
 * app/api/pms-details/route.js
 *
 * GET /api/pms-details?iaid=327
 *
 * Thin HTTP wrapper around lib/pmsDetailsCache.js's getPmsDetailsCached() --
 * see that file for the actual three-layer cache logic.
 */

import { NextResponse } from 'next/server';
import { getPmsDetailsCached, getStalePmsDetails } from '@/lib/pmsDetailsCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const iaid = searchParams.get('iaid');
  if (!iaid) {
    return NextResponse.json({ status: 'error', message: 'Missing iaid param' }, { status: 400 });
  }

  try {
    const data = await getPmsDetailsCached(iaid);
    if (!data) {
      return NextResponse.json({ status: 'success', data: null, reason: 'IAID not found on APMI' });
    }
    return NextResponse.json(
      { status: 'success', data },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=2592000' } }
    );
  } catch (err) {
    console.error('[pms-details] Route error:', err.message);

    // Stale-on-error: serve whatever we last had, even expired.
    const stale = await getStalePmsDetails(iaid).catch(() => null);
    if (stale) return NextResponse.json({ status: 'success', data: stale, stale: true });

    return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify against the real live route**

```bash
npm run dev &
sleep 3
curl -s "http://localhost:3000/api/pms-details?iaid=327" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  const j = JSON.parse(d);
  console.assert(j.status === 'success', 'expected success status');
  console.assert(j.data.providerName === 'Sundaram Alternate Assets Limited', 'providerName mismatch: ' + j.data.providerName);
  console.assert(j.data.fixedFees, 'fixedFees should be present');
  console.log('pms-details live check: PASS', JSON.stringify(j.data, null, 2));
});
"
kill %1
```

Expected: `pms-details live check: PASS` with real fee/AUM/inception data printed.

- [ ] **Step 4: Commit**

```bash
git add lib/pmsDetailsCache.js app/api/pms-details/route.js
git commit -m "feat(pms): add pms-details endpoint with 3-layer cache"
```

---

### Task 3: `pms-period-history` endpoint (backfill + extend, three-layer cache)

**Files:**
- Create: `lib/pmsPeriodHistoryCache.js`
- Create: `app/api/pms-period-history/route.js`

**Interfaces:**
- Consumes: `fetchPmsMonthSnapshot`, `monthsFrom`, `MONTH_ABBR`, `EARLIEST_YEAR`, `EARLIEST_MONTH` from `@/lib/pmsScrapers` (Task 1); `r2Get`, `r2Put` from `@/lib/r2`.
- Produces: `export async function getPmsPeriodHistoryCached(iaid): Promise<Array<object>>` (from `lib/pmsPeriodHistoryCache.js` — imported directly by Task 4's composing route and Task 5's page); `export async function GET(request)` (from `app/api/pms-period-history/route.js`, a thin wrapper).

On a cache miss (first-ever request for an IAID), walks every month from April 2023 to now sequentially (~40 requests at a small delay each, to stay a good citizen of APMI's servers) and caches the whole array in R2 permanently. On a hit, extends by only the missing recent months rather than re-fetching history that can't change.

Same reasoning as Task 2: the cache orchestration lives in a lib module so
it's callable in-process by another route without a route-importing-route
dependency.

- [ ] **Step 1: Write `lib/pmsPeriodHistoryCache.js`**

```js
/**
 * lib/pmsPeriodHistoryCache.js
 *
 * Returns the full April-2023-to-latest monthly period-wise performance
 * series for one Investment Approach. First call for an IAID with no
 * cache: walks every month sequentially (~40 requests at time of writing,
 * growing by one per month) with a small delay between each, then caches
 * the whole array in R2 PERMANENTLY -- past months' figures never change.
 * Every later call only fetches whatever new month(s) aren't cached yet.
 * Same three-layer cache shape as app/api/pms-benchmark/route.js, but
 * with no blob TTL expiry (extension, not re-fetch, keeps it current).
 *
 * getPmsPeriodHistoryCached() is exported as a plain lib function (see
 * lib/pmsDetailsCache.js's header comment for why) so both this file's own
 * route wrapper and app/api/pms-detail/[id]/route.js (Task 4) can call it
 * directly, in-process.
 */

import { fetchPmsMonthSnapshot, monthsFrom, MONTH_ABBR, EARLIEST_YEAR, EARLIEST_MONTH } from '@/lib/pmsScrapers';
import { r2Get, r2Put } from '@/lib/r2';

const MEM_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const BLOB_BASE = 'pms-period-history-cache';
const FETCH_DELAY_MS = 200; // be a good citizen of APMI's servers during a multi-month backfill

/** @type {Map<string, { data: Array<object>, ts: number }>} */
const memCache = new Map();
/** @type {Map<string, Promise<Array<object>>>} */
const inflight = new Map();

function isFresh(ts, ttlMs) {
  return ts && Date.now() - ts < ttlMs;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readFromBlob(iaid) {
  try {
    return await r2Get(`${BLOB_BASE}/${iaid}.json`);
  } catch (err) {
    console.warn('[pmsPeriodHistoryCache] Blob read error:', err.message);
    return null;
  }
}

async function writeToBlob(iaid, data) {
  try {
    await r2Put(`${BLOB_BASE}/${iaid}.json`, JSON.stringify({ data, ts: Date.now() }));
  } catch (err) {
    console.warn('[pmsPeriodHistoryCache] Blob write error:', err.message);
  }
}

async function fetchMonthsSequentially(iaid, months) {
  const snapshots = [];
  for (const { year, month } of months) {
    const snap = await fetchPmsMonthSnapshot(iaid, year, month);
    if (snap) snapshots.push(snap);
    await sleep(FETCH_DELAY_MS);
  }
  return snapshots;
}

function parseAsOnMonth(asOnMonth) {
  const [abbr, yearStr] = asOnMonth.split('-');
  return { year: parseInt(yearStr, 10), month: MONTH_ABBR.indexOf(abbr) + 1 };
}

/**
 * Full backfill (no cache yet) or incremental extend (cache exists but is
 * missing the current reporting month) -- either way returns the complete,
 * up-to-date array.
 */
async function backfillOrExtend(iaid, existing) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  if (!existing.length) {
    const months = monthsFrom(EARLIEST_YEAR, EARLIEST_MONTH, currentYear, currentMonth);
    return fetchMonthsSequentially(iaid, months);
  }

  const { year: lastYear, month: lastMonth } = parseAsOnMonth(existing[existing.length - 1].asOnMonth);
  if (lastYear === currentYear && lastMonth === currentMonth) return existing; // already current

  const nextMonth = lastMonth === 12 ? 1 : lastMonth + 1;
  const nextYear = lastMonth === 12 ? lastYear + 1 : lastYear;
  const missingMonths = monthsFrom(nextYear, nextMonth, currentYear, currentMonth);
  const extra = await fetchMonthsSequentially(iaid, missingMonths);
  return [...existing, ...extra];
}

export async function getPmsPeriodHistoryCached(iaid) {
  const key = String(iaid);

  const mem = memCache.get(key);
  if (isFresh(mem?.ts, MEM_TTL_MS)) return mem.data;

  if (inflight.has(key)) return inflight.get(key);

  const fetchPromise = (async () => {
    const blob = await readFromBlob(key);
    const existing = blob?.data || [];
    const data = await backfillOrExtend(key, existing);
    const ts = Date.now();
    memCache.set(key, { data, ts });
    if (data.length !== existing.length) writeToBlob(key, data); // only write if it actually grew
    inflight.delete(key);
    return data;
  })();
  inflight.set(key, fetchPromise);
  fetchPromise.catch(() => inflight.delete(key));

  return fetchPromise;
}

/** Exposed for the route's stale-on-error fallback. */
export async function getStalePmsPeriodHistory(iaid) {
  const mem = memCache.get(String(iaid));
  if (mem) return mem.data;
  const blobStale = await r2Get(`${BLOB_BASE}/${iaid}.json`).catch(() => null);
  return blobStale ? blobStale.data : [];
}
```

- [ ] **Step 2: Write `app/api/pms-period-history/route.js`**

```js
/**
 * app/api/pms-period-history/route.js
 *
 * GET /api/pms-period-history?iaid=327
 *
 * Thin HTTP wrapper around lib/pmsPeriodHistoryCache.js's
 * getPmsPeriodHistoryCached() -- see that file for the actual
 * backfill/extend + three-layer cache logic.
 */

import { NextResponse } from 'next/server';
import { getPmsPeriodHistoryCached, getStalePmsPeriodHistory } from '@/lib/pmsPeriodHistoryCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const iaid = searchParams.get('iaid');
  if (!iaid) {
    return NextResponse.json({ status: 'error', message: 'Missing iaid param' }, { status: 400 });
  }

  try {
    const data = await getPmsPeriodHistoryCached(iaid);
    return NextResponse.json(
      { status: 'success', data },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=604800' } }
    );
  } catch (err) {
    console.error('[pms-period-history] Route error:', err.message);
    const stale = await getStalePmsPeriodHistory(iaid).catch(() => []);
    if (stale.length) return NextResponse.json({ status: 'success', data: stale, stale: true });
    return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify against the real live route**

This is the expensive first-request path (~40 sequential APMI calls), so give it
a generous timeout:

```bash
npm run dev &
sleep 3
curl -s --max-time 60 "http://localhost:3000/api/pms-period-history?iaid=327" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  const j = JSON.parse(d);
  console.assert(j.status === 'success', 'expected success status');
  console.assert(Array.isArray(j.data), 'data should be an array');
  console.assert(j.data.length >= 30, 'expected at least 30 months of history, got ' + j.data.length);
  console.assert(j.data[0].asOnMonth === 'Apr-2023', 'first month should be Apr-2023, got ' + j.data[0].asOnMonth);
  console.log('pms-period-history live check: PASS, ' + j.data.length + ' months, first=' + j.data[0].asOnMonth + ' last=' + j.data[j.data.length-1].asOnMonth);
});
"
# Second call should be near-instant (cache hit)
time curl -s "http://localhost:3000/api/pms-period-history?iaid=327" > /dev/null
kill %1
```

Expected: `pms-period-history live check: PASS` with 30+ months starting at
`Apr-2023`; the second `curl` completes in well under a second (cache hit).

- [ ] **Step 4: Commit**

```bash
git add lib/pmsPeriodHistoryCache.js app/api/pms-period-history/route.js
git commit -m "feat(pms): add pms-period-history endpoint with backfill+extend cache"
```

---

### Task 4: Composing `pms-detail/[id]` route with Pro gate

**Files:**
- Create: `lib/pmsQuartileCache.js` (cache logic extracted out of `pms-quartile/route.js` — same reasoning as Tasks 2/3: a route file must never import another route file, so shared in-process-callable logic lives in `lib/`)
- Modify: `app/api/pms-quartile/route.js` (becomes a thin wrapper around the new lib module — no behavior change)
- Create: `app/api/pms-detail/[id]/route.js`

**Interfaces:**
- Consumes: `getPmsDetailsCached` from `@/lib/pmsDetailsCache` (Task 2), `getPmsPeriodHistoryCached` from `@/lib/pmsPeriodHistoryCache` (Task 3), `getUserPlan` from `@/lib/plan` (existing), `auth` from `@/auth` (existing), `MONTH_ABBR` from `@/lib/pmsScrapers` (Task 1).
- Produces: `export async function getPmsQuartileCached(iaid, provider, strategy, year, month): Promise<Array<object>|null>` (from the new `lib/pmsQuartileCache.js`, for this task's composing route to call in-process); `GET /api/pms-detail/[id]` returning `{ isPro, data, performance, history, quartile }`.

**Free-tier `data` shape** (always present): `{ iaid, iaName, providerName, strategyName, productName, benchmark, aumCr, inceptionDate, age, minInvestment, fixedFees, variableFees, exitLoad, purpose }`.
**Pro-only additions:** `data.turnover1M`, `data.turnover1Y`, `data.fundManager`; top-level `performance` (latest month's `{asOnMonth, ia, benchmark}`), `history` (full monthly array), `quartile` (six-period array, same shape `parseQuartileTable` already produces).

- [ ] **Step 1: Write `lib/pmsQuartileCache.js`, extracting `pms-quartile/route.js`'s existing cache logic**

Read `app/api/pms-quartile/route.js` in full first — this step moves its
existing `GET` handler's cache logic (everything from the `try` block
onward) into a new lib module verbatim, with zero behavior change. The
handler currently looks like this (for reference, do not write this part —
it's what you're replacing):

```js
    try {
        const providerId = await getApmiProviderId(provider);
        if (!providerId) {
            return NextResponse.json({ status: 'success', data: null, reason: 'provider not found in APMI registry' });
        }

        const key = cacheKey(iaid, strategy, year, month);

        const mem = memCache.get(key);
        if (isFresh(mem?.ts, MEM_TTL_MS)) return ok(mem.data, 'memory');

        const blob = await readFromBlob(key);
        if (blob) {
            memCache.set(key, { data: blob.data, ts: blob.ts });
            return ok(blob.data, 'blob');
        }

        if (inflight.has(key)) return ok(await inflight.get(key), 'dedup');

        const fetchPromise = (async () => {
            const data = await fetchQuartile(iaid, providerId, strategy, year, month);
            const ts = Date.now();
            memCache.set(key, { data, ts });
            writeToBlob(key, data); // fire-and-forget
            inflight.delete(key);
            return data;
        })();
        inflight.set(key, fetchPromise);
        fetchPromise.catch(() => inflight.delete(key));

        const data = await fetchPromise;
        return ok(data, 'live');
    } catch (err) {
        console.error('[pms-quartile] Route error:', err.message);
        return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
    }
}
```

Now write `lib/pmsQuartileCache.js`, moving `pms-quartile/route.js`'s
`memCache`, `inflight`, `isFresh`, `cacheKey`, `readFromBlob`, `writeToBlob`,
`lastDayOfMonth`, `parseQuartileTable`, and `fetchQuartile` here verbatim
(same logic, just relocated), adding one new export:

```js
/**
 * lib/pmsQuartileCache.js
 *
 * Fetches and caches APMI's peer-quartile ranking for a single Investment
 * Approach from WSIAConsolidateReport.htm. Logic moved here verbatim from
 * app/api/pms-quartile/route.js (now a thin wrapper around this file) so
 * app/api/pms-detail/[id]/route.js (Task 4) can call getPmsQuartileCached()
 * directly, in-process -- same reasoning as lib/pmsDetailsCache.js's header
 * comment: no route.js may import another route.js in this codebase.
 */

import * as cheerio from 'cheerio';
import { getApmiProviderId } from '@/lib/apmiProviderMap';
import { r2Get, r2Put } from '@/lib/r2';

const MEM_TTL_MS  = 6  * 60 * 60 * 1000;       // 6 hours
const BLOB_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days -- APMI publishes monthly
const BLOB_BASE   = 'pms-quartile-cache';

/** @type {Map<string, { data: any[], ts: number }>} */
const memCache = new Map();
/** @type {Map<string, Promise<any[]>>} */
const inflight = new Map();

function isFresh(ts, ttlMs) {
    return ts && Date.now() - ts < ttlMs;
}

function cacheKey(iaid, strategy, year, month) {
    return `${iaid}-${strategy.toLowerCase().replace(/\s+/g, '-')}-${year}-${String(month).padStart(2, '0')}`;
}

async function readFromBlob(key) {
    try {
        const payload = await r2Get(`${BLOB_BASE}/${key}.json`);
        if (!payload) return null;
        if (!isFresh(payload.ts, BLOB_TTL_MS)) return null;
        return payload;
    } catch (err) {
        console.warn('[pmsQuartileCache] Blob read error:', err.message);
        return null;
    }
}

async function writeToBlob(key, data) {
    try {
        await r2Put(`${BLOB_BASE}/${key}.json`, JSON.stringify({ data, ts: Date.now() }));
    } catch (err) {
        console.warn('[pmsQuartileCache] Blob write error:', err.message);
    }
}

function lastDayOfMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

/**
 * Parses the six-row quartile <tbody> returned by getWebsiteConsolidateReport.
 * Each row has exactly 8 <td> cells regardless of whether the IA has data for
 * that period (NA text fills the cells instead) -- indices below are fixed:
 *   0 period label ("1 Year"/"2 Years"...) · 1 peer count · 2 IA TWRR ·
 *   3 benchmark return · 4 IA quartile label · 5/6/7 quartile-1/2/3 minimum TWRR
 */
export function parseQuartileTable(html) {
    // APMI's response is a bare <tbody> fragment with no enclosing <table>.
    // Verified live: cheerio's HTML5 parser silently drops <tr>/<td> elements
    // that appear outside table context ("foster parenting" per the HTML5
    // spec) -- cheerio.load(html) on the raw fragment returns zero <tr>
    // matches even though the tags are right there in the string. Wrapping
    // in <table> before loading fixes it completely.
    const $ = cheerio.load(`<table>${html}</table>`);
    const rows = [];
    $('tr').each((_, tr) => {
        const tds = $(tr).find('td');
        if (tds.length < 8) return;
        const periodText = $(tds[0]).text().replace(/\s+/g, ' ').trim();
        const num = parseInt(periodText, 10);
        if (!num) return;
        const asNum = (i) => {
            const t = $(tds[i]).text().trim();
            return t === 'NA' || t === '' ? null : parseFloat(t);
        };
        const quartileText = $(tds[4]).text().trim();
        rows.push({
            period    : `${num}Y`,
            label     : periodText,
            peers     : asNum(1),
            iaTwrr    : asNum(2),
            benchmark : asNum(3),
            quartile  : quartileText === 'NA' || quartileText === '' ? null : quartileText,
            q1Min     : asNum(5),
            q2Min     : asNum(6),
            q3Min     : asNum(7),
        });
    });
    return rows;
}

async function fetchQuartile(iaid, providerId, strategy, year, month) {
    const asOnDate = `${year}-${month}-${lastDayOfMonth(year, month)}`;
    const params = new URLSearchParams();
    params.append('strategy', strategy);
    params.append('pmsProvider', String(providerId));
    params.append('iaName', String(iaid));
    params.append('fromMonth', String(month).padStart(2, '0'));
    params.append('fromYears', String(year));
    params.append('asOnDate', asOnDate);

    const res = await fetch('https://www.apmiindia.org/apmi/WSIAConsolidateReport.htm?action=getWebsiteConsolidateReport', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'User-Agent': 'Mozilla/5.0',
            Referer: 'https://www.apmiindia.org/',
        },
        body: params.toString(),
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(`APMI responded ${res.status}`);
    const html = await res.text();
    return parseQuartileTable(html);
}

export async function getPmsQuartileCached(iaid, provider, strategy, year, month) {
    const providerId = await getApmiProviderId(provider);
    if (!providerId) return null;

    const key = cacheKey(iaid, strategy, year, month);

    const mem = memCache.get(key);
    if (isFresh(mem?.ts, MEM_TTL_MS)) return mem.data;

    const blob = await readFromBlob(key);
    if (blob) {
        memCache.set(key, { data: blob.data, ts: blob.ts });
        return blob.data;
    }

    if (inflight.has(key)) return inflight.get(key);

    const fetchPromise = (async () => {
        const data = await fetchQuartile(iaid, providerId, strategy, year, month);
        const ts = Date.now();
        memCache.set(key, { data, ts });
        writeToBlob(key, data); // fire-and-forget
        inflight.delete(key);
        return data;
    })();
    inflight.set(key, fetchPromise);
    fetchPromise.catch(() => inflight.delete(key));

    return fetchPromise;
}
```

Then replace **the entire contents** of `app/api/pms-quartile/route.js` with
this thin wrapper (same `GET /api/pms-quartile` contract as before, byte-for-
byte identical responses):

```js
/**
 * app/api/pms-quartile/route.js
 *
 * GET /api/pms-quartile?iaid=233&provider=Abakkus%20Asset%20Manager%20Private%20Limited&strategy=Equity&year=2026&month=6
 *
 * Thin HTTP wrapper around lib/pmsQuartileCache.js's getPmsQuartileCached() --
 * see that file for the actual scrape + three-layer cache logic.
 */

import { NextResponse } from 'next/server';
import { getPmsQuartileCached } from '@/lib/pmsQuartileCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const iaid     = searchParams.get('iaid');
    const provider = searchParams.get('provider');
    const strategy = searchParams.get('strategy') || 'Equity';
    const year     = parseInt(searchParams.get('year'), 10);
    const month    = parseInt(searchParams.get('month'), 10);

    if (!iaid || !provider || !year || !month) {
        return NextResponse.json({ status: 'error', message: 'Missing iaid, provider, year, or month' }, { status: 400 });
    }

    try {
        const data = await getPmsQuartileCached(iaid, provider, strategy, year, month);
        if (data === null) {
            return NextResponse.json({ status: 'success', data: null, reason: 'provider not found in APMI registry' });
        }
        return NextResponse.json(
            { status: 'success', data, source: 'live' },
            { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=2592000' } }
        );
    } catch (err) {
        console.error('[pms-quartile] Route error:', err.message);
        return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
    }
}
```

- [ ] **Step 2: Verify the modified route still behaves identically**

```bash
npm run dev &
sleep 3
curl -s "http://localhost:3000/api/pms-quartile?iaid=327&provider=Sundaram%20Alternate%20Assets%20Limited&strategy=Equity&year=2026&month=7" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  const j = JSON.parse(d);
  console.assert(j.status === 'success', 'expected success status');
  console.assert(Array.isArray(j.data), 'data should be an array');
  console.log('pms-quartile still works after refactor: PASS,', j.data.length, 'rows');
});
"
kill %1
```

Expected: `pms-quartile still works after refactor: PASS` with 6 rows.

- [ ] **Step 3: Write `app/api/pms-detail/[id]/route.js`**

```js
/**
 * app/api/pms-detail/[id]/route.js
 *
 * GET /api/pms-detail/327
 *
 * Composes the three underlying PMS data sources (details, period history,
 * quartile) behind a single, session-gated response -- the same isPro
 * pattern as app/api/fund-detail/[code]/route.js: a genuinely smaller
 * payload for non-Pro callers, not client-side-hidden data. All three
 * underlying functions are called in-process (direct imports), not via
 * HTTP self-fetch.
 */

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getUserPlan } from '@/lib/plan';
import { getPmsDetailsCached } from '@/lib/pmsDetailsCache';
import { getPmsPeriodHistoryCached } from '@/lib/pmsPeriodHistoryCache';
import { getPmsQuartileCached } from '@/lib/pmsQuartileCache';
import { MONTH_ABBR } from '@/lib/pmsScrapers';

export const dynamic = 'force-dynamic';

function parseAsOnMonth(asOnMonth) {
  const [abbr, yearStr] = asOnMonth.split('-');
  return { year: parseInt(yearStr, 10), month: MONTH_ABBR.indexOf(abbr) + 1 };
}

export async function GET(request, { params }) {
  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'Invalid IAID' }, { status: 400 });
  }

  try {
    const session = await auth();
    const isPro = Boolean(
      session?.user?.role === 'admin' ||
      session?.user?.plan === 'pro' ||
      session?.user?.plan === 'pro_lifetime' ||
      session?.user?.plan === 'lifetime' ||
      session?.user?.isPro ||
      (session?.user?.id && (await getUserPlan(session.user.id)) === 'pro')
    );

    const details = await getPmsDetailsCached(id);
    if (!details) {
      return NextResponse.json({ error: 'Strategy not found' }, { status: 404 });
    }

    const publicFields = {
      iaid: id,
      iaName: details.iaName,
      providerName: details.providerName,
      strategyName: details.strategyName,
      productName: details.productName,
      benchmark: details.benchmark,
      aumCr: details.aumCr,
      inceptionDate: details.inceptionDate,
      age: details.age,
      minInvestment: details.minInvestment,
      fixedFees: details.fixedFees,
      variableFees: details.variableFees,
      exitLoad: details.exitLoad,
      purpose: details.purpose,
    };

    if (!isPro) {
      return NextResponse.json({
        data: publicFields,
        performance: null,
        history: null,
        quartile: null,
        isPro: false,
      });
    }

    const history = await getPmsPeriodHistoryCached(id);
    const latest = history.length ? history[history.length - 1] : null;

    let quartile = null;
    if (latest && details.providerName) {
      const { year, month } = parseAsOnMonth(latest.asOnMonth);
      quartile = await getPmsQuartileCached(id, details.providerName, details.strategyName || 'Equity', year, month);
    }

    const proFields = {
      ...publicFields,
      turnover1M: details.turnover1M,
      turnover1Y: details.turnover1Y,
      fundManager: details.fundManager,
    };

    return NextResponse.json({
      data: proFields,
      performance: latest,
      history,
      quartile,
      isPro: true,
    });
  } catch (err) {
    console.error('[pms-detail] Route error:', err.message);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verify the composing route (unauthenticated -- free tier)**

```bash
npm run dev &
sleep 3
curl -s "http://localhost:3000/api/pms-detail/327" | node -e "
let d=''; process.stdin.on('data',c=>d+=c); process.stdin.on('end',()=>{
  const j = JSON.parse(d);
  console.assert(j.isPro === false, 'unauthenticated request should be non-Pro');
  console.assert(j.data.fixedFees, 'free tier must include fixedFees');
  console.assert(j.data.exitLoad, 'free tier must include exitLoad');
  console.assert(j.history === null, 'free tier must NOT include history');
  console.assert(j.quartile === null, 'free tier must NOT include quartile');
  console.assert(j.data.fundManager === undefined, 'free tier must NOT include fundManager');
  console.log('pms-detail free-tier check: PASS');
});
"
kill %1
```

Expected: `pms-detail free-tier check: PASS`. (A signed-in Pro-account check
happens visually in Task 7, once the page exists to test against.)

- [ ] **Step 5: Commit**

```bash
git add lib/pmsQuartileCache.js app/api/pms-quartile/route.js "app/api/pms-detail/[id]/route.js"
git commit -m "feat(pms): add composing pms-detail route with isPro gate"
```

---

### Task 5: PMS detail page route — metadata, JSON-LD, FAQ content

**Files:**
- Create: `lib/pmsDetailFaq.js`
- Create: `app/pms/[id]/page.jsx`

**Interfaces:**
- Consumes: `getPmsDetailsCached` from `@/lib/pmsDetailsCache` (Task 2).
- Produces: `export function buildPmsDetailFaq(d): Array<{q, a}>` (from `lib/pmsDetailFaq.js`, called with the free-tier `data` object — unlike the static `lib/pmsFaq.js`, these FAQs are per-strategy, templated at render time, not a fixed export); default export `PMSDetailPage` (server component) rendering `<PMSDetailClient iaid={id} />` (client component built in Task 6).

Mirrors `app/fund/[code]/page.js` exactly: `generateMetadata` resolves only free-tier data (no session read), builds title/description/JSON-LD (`FinancialProduct` + `FAQPage` in one `@graph`), `notFound()` for an unresolvable IAID.

- [ ] **Step 1: Write `lib/pmsDetailFaq.js`**

```js
/**
 * lib/pmsDetailFaq.js
 *
 * Per-strategy FAQ content for a PMS detail page -- single source of truth
 * feeding both the FAQPage JSON-LD (app/pms/[id]/page.jsx's generateMetadata)
 * and the rendered HTML accordion (PMSDetailClient.jsx), matching
 * lib/pmsFaq.js's existing convention of keeping both in sync for Google's
 * rich-snippet eligibility. Unlike lib/pmsFaq.js (static, screener-wide),
 * these are templated per-strategy from its own free-tier details.
 *
 * @param {object} d - the free-tier `data` object from GET /api/pms-detail/[id]
 * @returns {Array<{q: string, a: string}>}
 */
export function buildPmsDetailFaq(d) {
  const name = d.iaName || d.strategyName || 'this PMS strategy';
  const provider = d.providerName || 'its portfolio manager';
  const minInvFormatted = d.minInvestment
    ? `₹${Number(d.minInvestment).toLocaleString('en-IN')}`
    : '₹50,00,000 (the SEBI-mandated PMS minimum)';

  return [
    {
      q: `What is ${name}?`,
      a: `${name} is a SEBI-regulated Portfolio Management Service (PMS) offered by ${provider}${d.category ? ` in the ${d.category} category` : ''}. It is registered with APMI (Association of Portfolio Managers in India), the official industry body for PMS.`,
    },
    {
      q: `What is the minimum investment for ${name}?`,
      a: `The minimum investment for ${name} is ${minInvFormatted}. This is per-strategy and can be higher than SEBI's ₹50 Lakh regulatory floor.`,
    },
    {
      q: `What are the fees for ${name}?`,
      a: `${name}'s fixed fee structure is: ${d.fixedFees || 'not disclosed'}. Its variable fee structure is: ${d.variableFees || 'not disclosed'}. Exit load: ${d.exitLoad || 'not disclosed'}. All figures are sourced directly from APMI India's public disclosures.`,
    },
    {
      q: `What is the benchmark for ${name}?`,
      a: `${name} is benchmarked against ${d.benchmark || 'an index disclosed by its portfolio manager'}, per its APMI filing.`,
    },
    {
      q: `Can I invest in ${name} through Abundance Financial Services?`,
      a: `Yes. Atin Kumar Agrawal (ARN-251838, APRN04279), owner of Abundance Financial Services® is an APMI Registered PMS Distributor serving investors across India. Call +91 98081 05923 or visit getabundance.in to book a free consultation about ${name}.`,
    },
  ];
}
```

- [ ] **Step 2: Write `app/pms/[id]/page.jsx`**

```jsx
import { notFound } from 'next/navigation';
import { getPmsDetailsCached } from '@/lib/pmsDetailsCache';
import { buildPmsDetailFaq } from '@/lib/pmsDetailFaq';
import PMSDetailClient from './PMSDetailClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  if (!id || isNaN(Number(id))) {
    return { title: 'Strategy Not Found | Abundance', robots: { index: false, follow: false } };
  }

  const d = await getPmsDetailsCached(id);
  if (!d) {
    return { title: 'Strategy Not Found | Abundance', robots: { index: false, follow: false } };
  }

  const canonicalUrl = `https://mfcalc.getabundance.in/pms/${id}`;
  const name = d.iaName || d.strategyName || 'PMS Strategy';
  const title = `${name} PMS by ${d.providerName} — Fees, Returns & Quartile Ranking | Abundance`;
  const description =
    `${name} is a ${d.strategyName || 'PMS'} Portfolio Management Service by ${d.providerName}.` +
    (d.aumCr ? ` AUM ₹${d.aumCr} Cr.` : '') +
    (d.minInvestment ? ` Min. investment ₹${Number(d.minInvestment).toLocaleString('en-IN')}.` : '') +
    ` View fee structure, exit load, historical performance and quartile ranking on Abundance — ARN-251838.`;

  const faq = buildPmsDetailFaq(d);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FinancialProduct',
        name,
        description,
        provider: { '@type': 'Organization', name: d.providerName },
        url: canonicalUrl,
        category: d.strategyName,
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, type: 'website', url: canonicalUrl },
    twitter: { card: 'summary_large_image', title, description },
    robots: {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, 'max-video-preview': -1, 'max-image-preview': 'large', 'max-snippet': -1 },
    },
    other: { 'script:ld+json': JSON.stringify(jsonLd) },
  };
}

export default async function PMSDetailPage({ params }) {
  const { id } = await params;
  if (!id || isNaN(Number(id))) notFound();

  const d = await getPmsDetailsCached(id);
  if (!d) notFound();

  return <PMSDetailClient iaid={id} />;
}
```

- [ ] **Step 3: Verify (page will 500 until Task 6 creates `PMSDetailClient` — confirm metadata alone works)**

```bash
node -e "
const { buildPmsDetailFaq } = require('./lib/pmsDetailFaq.js');
" 2>&1 || node --input-type=module -e "
import { buildPmsDetailFaq } from './lib/pmsDetailFaq.js';
const faq = buildPmsDetailFaq({ iaName: 'RISING STAR', providerName: 'Sundaram Alternate Assets Limited', strategyName: 'Equity', minInvestment: 5000000, fixedFees: 'AMC : 2.5 %', variableFees: 'AMC : 1.5%', exitLoad: '1ST YEAR : 1 %', benchmark: 'BSE 500 TRI' });
console.assert(faq.length === 5, 'expected 5 FAQ entries, got ' + faq.length);
console.assert(faq[0].q.includes('RISING STAR'), 'FAQ should reference the strategy name');
console.log('buildPmsDetailFaq check: PASS');
"
```

Expected: `buildPmsDetailFaq check: PASS`.

- [ ] **Step 4: Commit**

```bash
git add lib/pmsDetailFaq.js "app/pms/[id]/page.jsx"
git commit -m "feat(pms): add PMS detail page route with SEO metadata and JSON-LD"
```

---

### Task 6: `PMSDetailClient.jsx` — free-tier UI

**Files:**
- Create: `app/pms/[id]/PMSDetailClient.jsx`
- Create: `app/pms/[id]/pms-detail.css`

**Interfaces:**
- Consumes: `GET /api/pms-detail/[id]` (Task 4); `buildPmsDetailFaq` from `@/lib/pmsDetailFaq` (Task 5); `getPMSLogo` from `@/lib/providerLogos` (existing); `Navbar`, `Footer` (existing).
- Produces: default export `PMSDetailClient({ iaid })` — this task builds the shell + always-visible free-tier sections (hero, key facts, fee & terms, FAQ). Task 7 extends this same file with the Pro-gated sections and upgrade panel.

Structurally mirrors `app/fund/[code]/FundDetailClient.jsx`: fetch on mount, loading/error states, a hero section, then stacked content sections.

- [ ] **Step 1: Write `app/pms/[id]/PMSDetailClient.jsx` (free-tier shell)**

```jsx
'use client';

import { useState, useEffect } from 'react';
import { useSession, signIn } from 'next-auth/react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ProviderAvatar from '@/components/ProviderAvatar';
import { getPMSLogo } from '@/lib/providerLogos';
import { startCheckout } from '@/lib/checkoutClient';
import { buildPmsDetailFaq } from '@/lib/pmsDetailFaq';
import './pms-detail.css';

function fmtCr(v) {
  if (v == null) return '—';
  return `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })} Cr`;
}

function fmtInr(v) {
  if (v == null) return '—';
  return `₹${Number(v).toLocaleString('en-IN')}`;
}

export default function PMSDetailClient({ iaid }) {
  const { data: session } = useSession();
  const [state, setState] = useState({ loading: true, error: false, result: null });
  const [upgradeLoading, setUpgradeLoading] = useState(false);
  const [upgradeErr, setUpgradeErr] = useState('');
  const [faqOpen, setFaqOpen] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setState({ loading: true, error: false, result: null });
    fetch(`/api/pms-detail/${iaid}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        if (cancelled) return;
        setState({ loading: false, error: false, result: json });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ loading: false, error: true, result: null });
      });
    return () => { cancelled = true; };
  }, [iaid]);

  async function handleUpgrade() {
    if (!session?.user) { signIn(); return; }
    setUpgradeLoading(true);
    setUpgradeErr('');
    try {
      await startCheckout({
        plan: 'annual',
        session,
        onSuccess() { window.location.reload(); },
        onDismiss() { setUpgradeLoading(false); },
      });
    } catch (e) {
      setUpgradeErr(e.message);
      setUpgradeLoading(false);
    }
  }

  if (state.loading) {
    return (
      <>
        <Navbar />
        <main className="pmsd-page">
          <div className="pmsd-loading">Loading strategy details…</div>
        </main>
        <Footer />
      </>
    );
  }

  if (state.error || !state.result?.data) {
    return (
      <>
        <Navbar />
        <main className="pmsd-page">
          <div className="pmsd-loading">Could not load this strategy right now. Please try again shortly.</div>
        </main>
        <Footer />
      </>
    );
  }

  const { data: d, performance, history, quartile, isPro } = state.result;
  const faq = buildPmsDetailFaq(d);
  const displayName = d.iaName || d.strategyName;

  return (
    <>
      <Navbar />
      <main className="pmsd-page">

        {/* ── HERO ─────────────────────────────────────────────────────── */}
        <div className="pmsd-hero">
          <div className="pmsd-hero-row">
            <div className="pmsd-hero-logo">
              <ProviderAvatar name={d.providerName} logoPath={getPMSLogo(d.providerName)} size={48} radius={10} />
            </div>
            <div className="pmsd-hero-info">
              <h1 className="pmsd-name">{displayName}</h1>
              <div className="pmsd-hero-tags">
                <span className="pmsd-tag">{d.providerName}</span>
                <span className="pmsd-tag green">{d.strategyName}</span>
                {d.benchmark && <span className="pmsd-tag">vs {d.benchmark}</span>}
              </div>
            </div>
          </div>

          <div className="pmsd-hero-stats">
            {d.aumCr != null && (
              <div className="pmsd-stat-item">
                <div className="pmsd-stat-label">AUM</div>
                <div className="pmsd-stat-val">{fmtCr(d.aumCr)}</div>
              </div>
            )}
            {d.inceptionDate && (
              <div className="pmsd-stat-item">
                <div className="pmsd-stat-label">Inception</div>
                <div className="pmsd-stat-val">{d.inceptionDate}</div>
                {d.age && <div className="pmsd-stat-sub">{d.age}</div>}
              </div>
            )}
            {d.minInvestment != null && (
              <div className="pmsd-stat-item">
                <div className="pmsd-stat-label">Min Investment</div>
                <div className="pmsd-stat-val">{fmtInr(d.minInvestment)}</div>
              </div>
            )}
          </div>
        </div>

        {/* ── FEE & TERMS (always free) ───────────────────────────────── */}
        <div className="pmsd-section">
          <div className="pmsd-section-head">
            <span className="pmsd-section-title">Fee &amp; Terms</span>
          </div>
          <div className="pmsd-facts-grid">
            <div className="pmsd-fact-card">
              <div className="pmsd-fact-label">Fixed Fees</div>
              <div className="pmsd-fact-val">{d.fixedFees || '—'}</div>
            </div>
            <div className="pmsd-fact-card">
              <div className="pmsd-fact-label">Variable Fees</div>
              <div className="pmsd-fact-val">{d.variableFees || '—'}</div>
            </div>
            <div className="pmsd-fact-card">
              <div className="pmsd-fact-label">Exit Load</div>
              <div className="pmsd-fact-val">{d.exitLoad || '—'}</div>
            </div>
            <div className="pmsd-fact-card">
              <div className="pmsd-fact-label">Purpose</div>
              <div className="pmsd-fact-val">{d.purpose || '—'}</div>
            </div>
          </div>
        </div>

        {/* ── ⑤ PRO SECTIONS + UPGRADE GATE — added in Task 7 ─────────── */}
        {/* PRO_SECTIONS_PLACEHOLDER */}

        {/* ── FAQ ──────────────────────────────────────────────────────── */}
        <div className="pmsd-section pmsd-faq">
          <div className="pmsd-section-head">
            <span className="pmsd-section-title">Frequently Asked Questions</span>
          </div>
          {faq.map((item, i) => (
            <div key={i} className="pmsd-faq-item">
              <button className="pmsd-faq-q" onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                {item.q}
                <span className="pmsd-faq-caret">{faqOpen === i ? '−' : '+'}</span>
              </button>
              {faqOpen === i && <div className="pmsd-faq-a">{item.a}</div>}
            </div>
          ))}
        </div>

        <div className="pmsd-disclosure">
          Data sourced from APMI India (Association of Portfolio Managers in India).
          Min PMS investment ₹50L per SEBI. Past performance is not indicative of future results.
          Abundance Financial Services — Atin Kumar Agrawal · ARN-251838 · APRN04279 · APMI Registered PMS Distributor.
        </div>
      </main>
      <Footer />
    </>
  );
}
```

Note: the `{/* PRO_SECTIONS_PLACEHOLDER */}` comment marks exactly where Task 7
inserts real JSX (it is not a code placeholder — Task 7's diff replaces this
comment line with working sections; nothing here is left unfinished for a
reader of this task alone, since the free-tier UI above is fully functional
and testable on its own, matching this feature's "no partial-preview tier"
free/Pro split from the spec).

- [ ] **Step 2: Write `app/pms/[id]/pms-detail.css`**

```css
/* app/pms/[id]/pms-detail.css — PMS Detail page styles.
   Reuses design tokens from app/globals.css (--g1/--g2/--g3, --text, --muted,
   --border, --s2/--s3, --surface, --neg, etc.) — never redefine those here.
   Responsive breakpoints mirror app/fund/[code]/fund-detail.css's existing
   conventions (hero row collapses to column at <=768px). */

.pmsd-page {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 20px 48px;
  font-family: 'Raleway', sans-serif;
}

.pmsd-loading {
  padding: 80px 0;
  text-align: center;
  color: var(--muted);
  font-size: .9rem;
}

/* ── Hero ─────────────────────────────────────────────────────────────── */
.pmsd-hero {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 20px;
  padding: 28px 28px 24px;
  margin-bottom: 16px;
  box-shadow: var(--shadow);
}

.pmsd-hero-row {
  display: flex;
  align-items: flex-start;
  gap: 18px;
}

.pmsd-hero-logo {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: 14px;
  border: 1.5px solid var(--border);
  background: var(--s2);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.pmsd-hero-info { flex: 1; min-width: 0; }

.pmsd-name {
  font-size: 1.22rem;
  font-weight: 800;
  color: var(--text);
  margin: 0 0 10px;
}

.pmsd-hero-tags { display: flex; flex-wrap: wrap; gap: 6px; }

.pmsd-tag {
  font-size: .68rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 6px;
  background: var(--s2);
  border: 1px solid var(--border);
  color: var(--text2);
}
.pmsd-tag.green { background: var(--g-xlight); border-color: var(--g-light); color: var(--g1); }

.pmsd-hero-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 14px;
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--border);
}

.pmsd-stat-label {
  font-size: .6rem;
  font-weight: 700;
  letter-spacing: .8px;
  text-transform: uppercase;
  color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
}
.pmsd-stat-val { font-size: .92rem; font-weight: 800; color: var(--text); margin-top: 2px; }
.pmsd-stat-sub { font-size: .68rem; color: var(--muted); margin-top: 2px; }

/* ── Generic section ──────────────────────────────────────────────────── */
.pmsd-section {
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 16px;
  padding: 20px 22px;
  margin-bottom: 16px;
}

.pmsd-section-head { margin-bottom: 14px; }
.pmsd-section-title { font-size: 1rem; font-weight: 800; color: var(--text); }
.pmsd-section-sub { font-size: .72rem; color: var(--muted); margin-left: 8px; }

/* ── Facts / fee grid ─────────────────────────────────────────────────── */
.pmsd-facts-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}
.pmsd-fact-card {
  background: var(--s2);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 14px;
}
.pmsd-fact-label {
  font-size: .6rem;
  font-weight: 700;
  letter-spacing: .6px;
  text-transform: uppercase;
  color: var(--muted);
  font-family: 'JetBrains Mono', monospace;
  margin-bottom: 4px;
}
.pmsd-fact-val { font-size: .82rem; font-weight: 700; color: var(--text); white-space: pre-line; }

/* ── Returns bar (Pro) ────────────────────────────────────────────────── */
.pmsd-ret-bars { display: flex; flex-direction: column; gap: 8px; }
.pmsd-ret-row { display: flex; align-items: center; gap: 10px; }
.pmsd-ret-lbl { width: 90px; flex-shrink: 0; font-size: .72rem; font-weight: 700; color: var(--muted); }
.pmsd-ret-bar-wrap { flex: 1; height: 8px; background: var(--s2); border-radius: 4px; overflow: hidden; }
.pmsd-ret-bar-fill { height: 100%; background: var(--g2); border-radius: 4px; }
.pmsd-ret-bar-fill.neg { background: var(--neg); }
.pmsd-ret-val { width: 70px; flex-shrink: 0; text-align: right; font-size: .78rem; font-weight: 800; font-family: 'JetBrains Mono', monospace; }

/* ── Quartile table (Pro) ─────────────────────────────────────────────── */
.pmsd-quartile-table { width: 100%; border-collapse: collapse; font-size: .78rem; }
.pmsd-quartile-table th, .pmsd-quartile-table td { padding: 8px 10px; text-align: right; border-bottom: 1px solid var(--border); }
.pmsd-quartile-table th:first-child, .pmsd-quartile-table td:first-child { text-align: left; }
.pmsd-quartile-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: .68rem;
  font-weight: 800;
  background: var(--g-xlight);
  color: var(--g1);
}

/* ── FAQ ───────────────────────────────────────────────────────────────── */
.pmsd-faq-item { border-bottom: 1px solid var(--border); }
.pmsd-faq-item:last-child { border-bottom: none; }
.pmsd-faq-q {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 0;
  background: none;
  border: none;
  cursor: pointer;
  font-size: .84rem;
  font-weight: 700;
  color: var(--text);
  text-align: left;
}
.pmsd-faq-caret { font-size: 1.1rem; color: var(--g2); flex-shrink: 0; }
.pmsd-faq-a { padding: 0 0 14px; font-size: .8rem; color: var(--text2); line-height: 1.6; }

.pmsd-disclosure {
  font-size: .68rem;
  color: var(--muted);
  line-height: 1.6;
  padding: 16px 4px;
  text-align: center;
}

/* ── Upgrade gate (Non-Pro) — reuses fund-detail.css's visual language,
   own class prefix since this is a separate page-scoped stylesheet ── */
.pmsd-gate-panel {
  background: linear-gradient(145deg, #f1f8f1 0%, var(--s2) 40%, #e8f5e9 100%);
  border: 1.5px solid var(--g-light);
  border-radius: 18px;
  padding: 40px 32px;
  text-align: center;
  margin-bottom: 16px;
}
.pmsd-gate-crown {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: .62rem;
  font-weight: 800;
  letter-spacing: 1.4px;
  color: var(--g1);
  background: var(--g-xlight);
  border: 1px solid var(--g-light);
  border-radius: 20px;
  padding: 4px 12px;
  margin-bottom: 16px;
  text-transform: uppercase;
}
.pmsd-gate-title { font-size: 1.3rem; font-weight: 800; color: var(--text); margin-bottom: 6px; }
.pmsd-gate-subtitle { font-size: .83rem; color: var(--muted); margin-bottom: 24px; }
.pmsd-gate-features { list-style: none; padding: 0; margin: 0 auto 28px; display: inline-flex; flex-direction: column; gap: 8px; text-align: left; }
.pmsd-gate-features li { font-size: .83rem; color: var(--text2); font-weight: 600; }
.pmsd-gate-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-bottom: 14px; }
.pmsd-gate-btn { display: inline-flex; align-items: center; gap: 6px; padding: 12px 26px; border-radius: 10px; font-size: .84rem; font-weight: 800; cursor: pointer; border: none; }
.pmsd-gate-btn.primary { background: linear-gradient(135deg, var(--g1) 0%, var(--g2) 100%); color: #fff; }
.pmsd-gate-btn.primary:disabled { opacity: .7; cursor: wait; }
.pmsd-gate-btn.secondary { background: var(--surface); color: var(--text); border: 1.5px solid var(--border2); }
.pmsd-gate-link { font-size: .75rem; color: var(--muted); }
.pmsd-gate-link a { color: var(--g1); text-decoration: none; font-weight: 700; }
.pmsd-gate-err { color: var(--neg); font-size: .78rem; margin-top: 10px; font-weight: 600; }

/* ── Mobile ────────────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .pmsd-hero-row { flex-direction: column; gap: 14px; }
  .pmsd-hero { padding: 20px 18px 18px; border-radius: 16px; }
  .pmsd-section { padding: 16px; }
  .pmsd-gate-panel { padding: 28px 18px; }
  .pmsd-gate-title { font-size: 1.1rem; }
}
```

- [ ] **Step 3: Verify visually (free tier, unauthenticated)**

```bash
npm run build
npm run dev &
sleep 3
```

Open `http://localhost:3000/pms/327` in a browser (or via the Chrome
automation tools if available). Confirm: hero renders (name, provider, AUM,
inception, min investment), the Fee & Terms card shows real fixed/variable
fee text and exit load, the FAQ accordion expands/collapses, no console
errors. Then:

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add "app/pms/[id]/PMSDetailClient.jsx" "app/pms/[id]/pms-detail.css"
git commit -m "feat(pms): add PMS detail page free-tier UI (hero, fees, FAQ)"
```

---

### Task 7: Pro-gated sections — performance, growth chart, quartile, turnover, manager

**Files:**
- Modify: `app/pms/[id]/PMSDetailClient.jsx`

**Interfaces:**
- Consumes: `CompareGrowthChart` from `@/app/screener/CompareGrowthChart` (existing, unmodified — accepts `Array<{name, color, data: Array<{t, v}>}>`); `performance`, `history`, `quartile`, `isPro` from Task 4/6's already-fetched `state.result`.

Replaces the `{/* PRO_SECTIONS_PLACEHOLDER */}` comment from Task 6 with:
current period-wise bar (Pro), a reconstructed "₹100 invested" historical
growth chart (Pro), quartile ranking table (Pro), turnover + fund manager
(Pro), and the upgrade gate panel (non-Pro).

- [ ] **Step 1: Add the growth-series builder and period-bar helper above the component**

In `app/pms/[id]/PMSDetailClient.jsx`, add this import and these two helper
functions right after the existing imports (before `function fmtCr`):

```jsx
import CompareGrowthChart from '@/app/screener/CompareGrowthChart';
```

```jsx
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Apr-2024" -> ms timestamp of that month's last day (UTC). */
function monthLabelToTimestamp(label) {
  const [abbr, yearStr] = label.split('-');
  const year = parseInt(yearStr, 10);
  const month = MONTH_ABBR.indexOf(abbr) + 1; // 1-indexed
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return Date.UTC(year, month - 1, lastDay);
}

/**
 * Reconstructs a "grew ₹100 to ₹X" cumulative series from a monthly
 * period-history array's MONTH1 (1-month return) figures -- the same shape
 * CompareGrowthChart already renders elsewhere in this app.
 */
function buildGrowthSeries(history, key, name, color) {
  let value = 100;
  const data = [];
  for (const snap of history) {
    const monthRet = snap[key]?.month1;
    if (monthRet == null) continue;
    value = value * (1 + monthRet / 100);
    data.push({ t: monthLabelToTimestamp(snap.asOnMonth), v: value });
  }
  return data.length >= 2 ? { name, color, data } : null;
}

function pctTxt(v) {
  if (v == null) return '—';
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}
```

- [ ] **Step 2: Replace the placeholder with the real Pro sections**

Replace this line:

```jsx
        {/* ── ⑤ PRO SECTIONS + UPGRADE GATE — added in Task 7 ─────────── */}
        {/* PRO_SECTIONS_PLACEHOLDER */}
```

with:

```jsx
        {/* ── ⑤ CURRENT PERIOD-WISE PERFORMANCE (Pro) ─────────────────── */}
        {isPro && performance && (
          <div className="pmsd-section">
            <div className="pmsd-section-head">
              <span className="pmsd-section-title">Performance vs Benchmark</span>
              <span className="pmsd-section-sub">as of {performance.asOnMonth}</span>
            </div>
            <div className="pmsd-ret-bars">
              {[
                ['1M', performance.ia.month1, performance.benchmark?.month1],
                ['3M', performance.ia.month3, performance.benchmark?.month3],
                ['6M', performance.ia.month6, performance.benchmark?.month6],
                ['1Y', performance.ia.year1, performance.benchmark?.year1],
                ['2Y', performance.ia.year2, performance.benchmark?.year2],
                ['3Y', performance.ia.year3, performance.benchmark?.year3],
                ['5Y', performance.ia.year5, performance.benchmark?.year5],
                ['Since Inception', performance.ia.sinceInception, performance.benchmark?.sinceInception],
              ].map(([label, iaVal, benchVal]) => (
                <div key={label} className="pmsd-ret-row">
                  <span className="pmsd-ret-lbl">{label}</span>
                  <div className="pmsd-ret-bar-wrap">
                    <div className={`pmsd-ret-bar-fill${iaVal < 0 ? ' neg' : ''}`} style={{ width: `${Math.min(100, Math.abs(iaVal ?? 0) * 2)}%` }} />
                  </div>
                  <span className="pmsd-ret-val">{pctTxt(iaVal)}</span>
                  {benchVal != null && <span className="pmsd-ret-val" style={{ color: 'var(--muted)' }}>bm {pctTxt(benchVal)}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ⑥ HISTORICAL GROWTH CHART (Pro) ──────────────────────────── */}
        {isPro && history && history.length >= 2 && (() => {
          const iaSeries = buildGrowthSeries(history, 'ia', displayName, '#1b5e20');
          const benchSeries = buildGrowthSeries(history, 'benchmark', d.benchmark || 'Benchmark', '#78909c');
          const chartSeries = [iaSeries, benchSeries].filter(Boolean);
          if (chartSeries.length < 1) return null;
          return (
            <div className="pmsd-section">
              <div className="pmsd-section-head">
                <span className="pmsd-section-title">Historical Growth</span>
                <span className="pmsd-section-sub">₹100 invested, since {history[0].asOnMonth}</span>
              </div>
              <CompareGrowthChart series={chartSeries} />
            </div>
          );
        })()}

        {/* ── ⑦ QUARTILE RANKING (Pro) ─────────────────────────────────── */}
        {isPro && quartile && quartile.length > 0 && (
          <div className="pmsd-section">
            <div className="pmsd-section-head">
              <span className="pmsd-section-title">Peer Quartile Ranking</span>
              <span className="pmsd-section-sub">APMI methodology, TWRR-based</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="pmsd-quartile-table">
                <thead>
                  <tr>
                    <th>Period</th>
                    <th>Peers</th>
                    <th>TWRR</th>
                    <th>Benchmark</th>
                    <th>Quartile</th>
                  </tr>
                </thead>
                <tbody>
                  {quartile.map((row) => (
                    <tr key={row.period}>
                      <td>{row.label}</td>
                      <td>{row.peers ?? '—'}</td>
                      <td>{pctTxt(row.iaTwrr)}</td>
                      <td>{pctTxt(row.benchmark)}</td>
                      <td>{row.quartile ? <span className="pmsd-quartile-badge">{row.quartile}</span> : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ⑧ TURNOVER + FUND MANAGER (Pro) ──────────────────────────── */}
        {isPro && (d.turnover1M != null || d.turnover1Y != null || d.fundManager) && (
          <div className="pmsd-section">
            <div className="pmsd-section-head">
              <span className="pmsd-section-title">Portfolio &amp; Manager</span>
            </div>
            <div className="pmsd-facts-grid">
              {d.turnover1M != null && (
                <div className="pmsd-fact-card">
                  <div className="pmsd-fact-label">1 Month Turnover</div>
                  <div className="pmsd-fact-val">{d.turnover1M}</div>
                </div>
              )}
              {d.turnover1Y != null && (
                <div className="pmsd-fact-card">
                  <div className="pmsd-fact-label">1 Year Turnover</div>
                  <div className="pmsd-fact-val">{d.turnover1Y}</div>
                </div>
              )}
              {d.fundManager?.name && (
                <div className="pmsd-fact-card">
                  <div className="pmsd-fact-label">Fund Manager</div>
                  <div className="pmsd-fact-val">
                    {d.fundManager.name}
                    {d.fundManager.workExp && d.fundManager.workExp !== 'NA' && (
                      <div style={{ fontWeight: 400, fontSize: '.72rem', marginTop: 4, color: 'var(--muted)' }}>
                        {d.fundManager.workExp}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── ⑨ UPGRADE GATE (Non-Pro) ─────────────────────────────────── */}
        {!isPro && (
          <div className="pmsd-gate-panel">
            <div className="pmsd-gate-crown">👑 Abundance Pro Feature</div>
            <div className="pmsd-gate-title">Unlock Full Performance Analytics</div>
            <div className="pmsd-gate-subtitle">Get institutional-grade analysis for every PMS strategy in India.</div>
            <ul className="pmsd-gate-features">
              <li>Current returns vs benchmark across every period (1M to Since Inception)</li>
              <li>Historical growth chart, monthly, back to April 2023</li>
              <li>APMI's own peer-quartile ranking (1/2/3/5/7/10 year)</li>
              <li>Portfolio turnover ratio &amp; fund manager details</li>
            </ul>
            <div className="pmsd-gate-actions">
              {!session?.user && (
                <button className="pmsd-gate-btn secondary" onClick={() => signIn()}>Sign In</button>
              )}
              <button className="pmsd-gate-btn primary" onClick={handleUpgrade} disabled={upgradeLoading}>
                {upgradeLoading ? 'Opening checkout…' : 'Upgrade to Pro — ₹499/year →'}
              </button>
            </div>
            {upgradeErr && <div className="pmsd-gate-err">{upgradeErr}</div>}
            <div className="pmsd-gate-link">
              <a href="/pricing">View all Pro benefits &amp; features →</a>
            </div>
          </div>
        )}
```

- [ ] **Step 3: Verify visually (both free and Pro views)**

```bash
npm run build
npm run dev &
sleep 3
```

Open `http://localhost:3000/pms/327`:
1. Signed out: confirm the free tier renders exactly as in Task 6, plus the
   new "Unlock Full Performance Analytics" gate panel where the Pro sections
   would go, with a working Sign In button.
2. Sign in with a test Pro account (or temporarily set a test user's `plan`
   to `'pro'` in the `users` table): confirm the returns bar, the historical
   growth chart (via `CompareGrowthChart`, IA vs benchmark, both lines
   visible and roughly tracking known real returns), the quartile table,
   and turnover/fund manager card all render with real data, and the gate
   panel is gone.

```bash
kill %1
```

- [ ] **Step 4: Commit**

```bash
git add "app/pms/[id]/PMSDetailClient.jsx"
git commit -m "feat(pms): add Pro-gated performance, growth chart, quartile sections"
```

---

### Task 8: Screener drawer link + sitemap + robots

**Files:**
- Modify: `app/pms-screener/page.jsx`
- Create: `app/sitemap-pms.xml/route.js`
- Modify: `app/robots.js`

**Interfaces:**
- Consumes: nothing new from earlier tasks (the drawer link is a plain `<a href>`; the sitemap route independently re-derives the curated set via a live leaderboard fetch, matching `app/api/pms-data/route.js`'s existing `scrapeAPMI` shape, since there's no DB table to query).

- [ ] **Step 1: Add the "Full Strategy Report" drawer link**

In `app/pms-screener/page.jsx`, find this block (around line 1099, the
"Official Source" section):

```jsx
                            {selected.apmiLink && (
                                <>
                                    <div className="pd-section-head">Official Source</div>
                                    <a
                                        href={(() => {
```

Insert a new section immediately **before** it (so "Full Strategy Report"
appears above the raw APMI link):

```jsx
                            {selected.apmiLink && (() => {
                                let iaid;
                                try { iaid = new URL(selected.apmiLink).searchParams.get('IAID'); }
                                catch { iaid = null; }
                                if (!iaid) return null;
                                return (
                                    <>
                                        <div className="pd-section-head">Full Strategy Report</div>
                                        <a href={`/pms/${iaid}`} target="_blank" rel="noreferrer" className="apmi-link-btn">
                                            📄 View Fees, History &amp; Quartile Ranking →
                                        </a>
                                    </>
                                );
                            })()}

                            {selected.apmiLink && (
                                <>
                                    <div className="pd-section-head">Official Source</div>
                                    <a
                                        href={(() => {
```

- [ ] **Step 2: Write `app/sitemap-pms.xml/route.js`**

```js
/**
 * app/sitemap-pms.xml/route.js
 *
 * PMS has no Postgres table to SELECT from (see docs/superpowers/specs/
 * 2026-08-28-pms-detail-pages-design.md's Storage section) -- this sitemap
 * instead re-fetches the live leaderboard for all four strategies and
 * emits only the "curated" set (providers NOT excluded by the screener's
 * own small-AUM filter), matching scripts/backfill-pms-detail-pages.mjs's
 * (Task 9) eager pre-warm scope. Long-tail strategies below that threshold
 * still resolve as real pages via the screener's "All Funds" toggle and
 * internal links -- they're just not proactively pushed into the sitemap.
 */

const STRATEGIES = ['Equity', 'Debt', 'Multi Asset', 'Hybrid'];
const AUM_THRESHOLD = { Equity: 50, Debt: 10, 'Multi Asset': 10, Hybrid: 10 };

export const revalidate = 86400; // 24 hours

async function fetchLeaderboard(strategy) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const params = new URLSearchParams();
  params.append('strategyname', strategy);
  params.append('servicetype', 'D');
  params.append('', '');
  params.append('', '');
  params.append('fromMonth', String(month));
  params.append('fromYears', String(year));
  params.append('asOnDate', `${year}-${month}-${new Date(year, month, 0).getDate()}`);

  const res = await fetch('https://www.apmiindia.org/apmi/welcomeiaperformance.htm?action=loadIAReport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://www.apmiindia.org/' },
    body: params.toString(),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const html = await res.text();

  // Lightweight extraction -- only need portfolioManager, aum, and IAID per
  // row (full field parsing already lives in app/api/pms-data/route.js;
  // duplicating cheerio here isn't worth it for a sitemap that only needs
  // three fields and tolerates missing rows silently).
  const rows = [];
  const rowRe = /<tr>([\s\S]*?)<\/tr>/g;
  let m;
  while ((m = rowRe.exec(html))) {
    const row = m[1];
    const hrefMatch = row.match(/IaInsight\.htm\?IAID=(\d+)/);
    const aumMatch = row.match(/<td[^>]*>\s*([\d,.]+)\s*<\/td>\s*<td/); // best-effort; AUM is the 3rd <td>
    if (!hrefMatch) continue;
    rows.push({ iaid: hrefMatch[1], aum: aumMatch ? parseFloat(aumMatch[1].replace(/,/g, '')) : 0 });
  }
  return rows;
}

export async function GET() {
  const BASE = 'https://mfcalc.getabundance.in';
  try {
    const results = await Promise.all(STRATEGIES.map((s) => fetchLeaderboard(s)));
    const today = new Date().toISOString().split('T')[0];

    const urls = STRATEGIES.flatMap((strategy, i) => {
      const threshold = AUM_THRESHOLD[strategy];
      return results[i]
        .filter((r) => r.aum >= threshold)
        .map((r) => `  <url>
    <loc>${BASE}/pms/${r.iaid}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>`);
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err) {
    console.error('[sitemap-pms.xml]', err.message);
    const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;
    return new Response(emptyXml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
  }
}
```

- [ ] **Step 3: Modify `app/robots.js`**

Find:

```js
        allow: [
          '/',
          '/api/fund-detail/',
          '/api/sif-detail/',
```

Replace with:

```js
        allow: [
          '/',
          '/api/fund-detail/',
          '/api/sif-detail/',
          '/api/pms-detail/',
```

Find:

```js
    sitemap: [
      'https://mfcalc.getabundance.in/sitemap.xml',
      'https://mfcalc.getabundance.in/sitemap-funds.xml',
    ],
```

Replace with:

```js
    sitemap: [
      'https://mfcalc.getabundance.in/sitemap.xml',
      'https://mfcalc.getabundance.in/sitemap-funds.xml',
      'https://mfcalc.getabundance.in/sitemap-pms.xml',
    ],
```

- [ ] **Step 4: Verify**

```bash
npm run build
npm run dev &
sleep 3
curl -s http://localhost:3000/sitemap-pms.xml | head -20
curl -s http://localhost:3000/robots.txt | grep -i "pms"
kill %1
```

Expected: the sitemap XML contains at least one real `<loc>https://mfcalc.getabundance.in/pms/{iaid}</loc>` entry; `robots.txt` lists both the new `Allow: /api/pms-detail/` line and the new sitemap URL.

Then open the PMS Screener in a browser, select any strategy, and confirm the
new "Full Strategy Report →" button in the drawer opens `/pms/{iaid}` in a
new tab with real data.

- [ ] **Step 5: Commit**

```bash
git add app/pms-screener/page.jsx app/sitemap-pms.xml/route.js app/robots.js
git commit -m "feat(pms): link PMS screener drawer to detail pages, add sitemap"
```

---

### Task 9: Eager curated-set backfill script

**Files:**
- Create: `scripts/backfill-pms-detail-pages.mjs`
- Create: `.github/workflows/pms-detail-backfill.yml`

**Interfaces:**
- Consumes: `fetchPmsDetails`, `fetchPmsMonthSnapshot`, `monthsFrom`, `EARLIEST_YEAR`, `EARLIEST_MONTH` from `../lib/pmsScrapers.js` (Task 1, relative import); `r2Put`, `r2Get` from `../lib/r2.js` (existing, relative import, same dynamic-import pattern `scripts/sync_amfi_aum.js` already uses).

This is additive and non-blocking: every page already works correctly via
the lazy path (Tasks 2-3) without this script ever running. It only affects
(a) first-visitor latency for the curated (non-small-AUM) set, and (b) what
appears in the sitemap (Task 8 already computes its own curated set
independently, so this script running or not doesn't change the sitemap).

- [ ] **Step 1: Write `scripts/backfill-pms-detail-pages.mjs`**

```js
#!/usr/bin/env node
/**
 * scripts/backfill-pms-detail-pages.mjs
 *
 * Eagerly pre-warms the R2 cache (pms-details-cache/{iaid}.json and
 * pms-period-history-cache/{iaid}.json -- the SAME keys app/api/pms-details/
 * route.js and app/api/pms-period-history/route.js read) for the "curated"
 * set of PMS strategies: providers NOT excluded by the PMS Screener's own
 * small-AUM filter (app/pms-screener/page.jsx's smallAumProviders logic,
 * ported here since a script can't import a 'use client' page component).
 *
 * Everything below that threshold still works correctly -- it just
 * backfills lazily on that visitor's first real page view instead (see
 * docs/superpowers/specs/2026-08-28-pms-detail-pages-design.md).
 *
 * Usage:
 *   node scripts/backfill-pms-detail-pages.mjs [--dry-run] [--limit=N]
 *
 * Run via GitHub Actions (.github/workflows/pms-detail-backfill.yml),
 * workflow_dispatch or monthly schedule.
 */

import { fetchPmsDetails, fetchPmsMonthSnapshot, monthsFrom, EARLIEST_YEAR, EARLIEST_MONTH, MONTH_ABBR } from '../lib/pmsScrapers.js';

const STRATEGIES = ['Equity', 'Debt', 'Multi Asset', 'Hybrid'];
const AUM_THRESHOLD = { Equity: 50, Debt: 10, 'Multi Asset': 10, Hybrid: 10 };
const FETCH_DELAY_MS = 200;

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** Same scrapeAPMI shape as app/api/pms-data/route.js -- one leaderboard call per strategy. */
async function fetchLeaderboard(strategy) {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const params = new URLSearchParams();
  params.append('strategyname', strategy);
  params.append('servicetype', 'D');
  params.append('', '');
  params.append('', '');
  params.append('fromMonth', String(month));
  params.append('fromYears', String(year));
  params.append('asOnDate', `${year}-${month}-${new Date(year, month, 0).getDate()}`);

  const res = await fetch('https://www.apmiindia.org/apmi/welcomeiaperformance.htm?action=loadIAReport', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Referer: 'https://www.apmiindia.org/' },
    body: params.toString(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`APMI leaderboard responded ${res.status} for strategy ${strategy}`);
  const html = await res.text();

  const { default: cheerio } = await import('cheerio');
  const $ = cheerio.load(html);
  const rows = [];
  $('table tr').each((index, el) => {
    if (index === 0) return;
    const tds = $(el).find('td');
    if (tds.length < 12) return;
    const href = $(tds[1]).find('a').attr('href');
    const iaidMatch = href ? href.match(/IAID=(\d+)/) : null;
    if (!iaidMatch) return;
    rows.push({
      iaid: iaidMatch[1],
      portfolioManager: $(tds[0]).text().trim(),
      aum: parseFloat($(tds[2]).text().trim().replace(/[₹,]/g, '')) || 0,
    });
  });
  return rows;
}

/** Ports app/pms-screener/page.jsx's smallAumProviders logic -- provider-level exclusion. */
function computeCuratedSet(rows, strategy) {
  const threshold = AUM_THRESHOLD[strategy];
  const byProvider = {};
  rows.forEach((r) => {
    if (!byProvider[r.portfolioManager]) byProvider[r.portfolioManager] = [];
    byProvider[r.portfolioManager].push(r.aum);
  });
  const smallProviders = new Set(
    Object.entries(byProvider)
      .filter(([, aums]) => aums.every((a) => a < threshold))
      .map(([mgr]) => mgr)
  );
  return rows.filter((r) => !smallProviders.has(r.portfolioManager));
}

async function backfillOneStrategy(iaid, r2Put, r2Get) {
  // -- Details --
  try {
    const details = await fetchPmsDetails(iaid);
    if (details) {
      await r2Put(`pms-details-cache/${iaid}.json`, JSON.stringify({ data: details, ts: Date.now() }));
    }
  } catch (e) {
    console.warn(`[backfill] details failed for IAID ${iaid}: ${e.message}`);
  }
  await sleep(FETCH_DELAY_MS);

  // -- Period history: extend existing cache, or full backfill if none --
  try {
    const existing = await r2Get(`pms-period-history-cache/${iaid}.json`).catch(() => null);
    const existingData = existing?.data || [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;

    let months;
    if (!existingData.length) {
      months = monthsFrom(EARLIEST_YEAR, EARLIEST_MONTH, currentYear, currentMonth);
    } else {
      const [abbr, yearStr] = existingData[existingData.length - 1].asOnMonth.split('-');
      const lastYear = parseInt(yearStr, 10);
      const lastMonth = MONTH_ABBR.indexOf(abbr) + 1;
      if (lastYear === currentYear && lastMonth === currentMonth) {
        months = []; // already current
      } else {
        const nextMonth = lastMonth === 12 ? 1 : lastMonth + 1;
        const nextYear = lastMonth === 12 ? lastYear + 1 : lastYear;
        months = monthsFrom(nextYear, nextMonth, currentYear, currentMonth);
      }
    }

    if (months.length) {
      const newSnapshots = [];
      for (const { year, month } of months) {
        const snap = await fetchPmsMonthSnapshot(iaid, year, month);
        if (snap) newSnapshots.push(snap);
        await sleep(FETCH_DELAY_MS);
      }
      const merged = [...existingData, ...newSnapshots];
      if (merged.length !== existingData.length) {
        await r2Put(`pms-period-history-cache/${iaid}.json`, JSON.stringify({ data: merged, ts: Date.now() }));
      }
    }
  } catch (e) {
    console.warn(`[backfill] period-history failed for IAID ${iaid}: ${e.message}`);
  }
}

async function main() {
  const { r2Put, r2Get } = await import('../lib/r2.js');

  console.log(`=== PMS detail pages backfill${isDryRun ? ' [DRY RUN]' : ''} ===`);

  const perStrategyRows = await Promise.all(STRATEGIES.map((s) => fetchLeaderboard(s)));
  let curated = [];
  STRATEGIES.forEach((strategy, i) => {
    curated = curated.concat(computeCuratedSet(perStrategyRows[i], strategy));
  });

  // De-dupe by IAID -- a strategy shouldn't appear twice, but be defensive.
  const seen = new Set();
  curated = curated.filter((r) => (seen.has(r.iaid) ? false : (seen.add(r.iaid), true)));

  console.log(`Curated set: ${curated.length} strategies across ${STRATEGIES.length} categories`);

  const toProcess = curated.slice(0, limit);
  console.log(`Processing ${toProcess.length} strategies${limit !== Infinity ? ` (limited to ${limit})` : ''}`);

  if (isDryRun) {
    console.log('[Dry Run] Would backfill IAIDs:', toProcess.map((r) => r.iaid).join(', '));
    return;
  }

  let done = 0;
  for (const row of toProcess) {
    await backfillOneStrategy(row.iaid, r2Put, r2Get);
    done += 1;
    if (done % 10 === 0) console.log(`Progress: ${done}/${toProcess.length}`);
  }

  console.log(`=== Backfill complete: ${done}/${toProcess.length} strategies processed ===`);
}

main().catch((err) => {
  console.error('[backfill-pms-detail-pages] Fatal error:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Write `.github/workflows/pms-detail-backfill.yml`**

```yaml
name: Monthly PMS Detail Pages Backfill

on:
  schedule:
    # 20th of every month at 04:00 UTC -- after APMI's own monthly release
    # window (matches the "reporting window" timing already assumed by
    # app/api/pms-data/route.js's isReportingWindow flag).
    - cron: '0 4 20 * *'
  workflow_dispatch:
    inputs:
      limit:
        description: 'Limit number of strategies to process (leave empty for full curated set)'
        required: false
        default: ''
        type: string
      dry_run:
        description: 'Dry run (no writes)'
        required: false
        default: false
        type: boolean

concurrency:
  group: pms-detail-backfill
  cancel-in-progress: false

jobs:
  backfill:
    runs-on: ubuntu-latest
    timeout-minutes: 90

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "24"

      - name: Install deps
        run: npm install cheerio aws4fetch --no-save

      - name: Run backfill script
        env:
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
        run: |
          ARGS=""
          if [ -n "${{ inputs.limit }}" ]; then ARGS="$ARGS --limit=${{ inputs.limit }}"; fi
          if [ "${{ inputs.dry_run }}" = "true" ]; then ARGS="$ARGS --dry-run"; fi
          node scripts/backfill-pms-detail-pages.mjs $ARGS
```

- [ ] **Step 3: Verify with a small, real (non-dry-run) subset**

```bash
node scripts/backfill-pms-detail-pages.mjs --dry-run --limit=5
```

Expected: prints the curated set size (likely several hundred), then "Would
backfill IAIDs: ..." listing exactly 5 real numeric IAIDs.

```bash
node scripts/backfill-pms-detail-pages.mjs --limit=3
```

Expected: processes 3 real strategies, printing progress; no fatal errors.
Then confirm via the live app that one of those 3 IAIDs' detail page loads
instantly (cache hit) rather than taking the ~40-request first-view path:

```bash
npm run dev &
sleep 3
time curl -s "http://localhost:3000/api/pms-period-history?iaid={one of the 3 IAIDs printed above}" > /dev/null
kill %1
```

Expected: well under a second (proves the script's R2 write was picked up
by the app route's cache read).

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-pms-detail-pages.mjs .github/workflows/pms-detail-backfill.yml
git commit -m "feat(pms): add eager curated-set backfill script + monthly workflow"
```

---

## Final Verification

- [ ] `npm run build` passes cleanly with no errors.
- [ ] `/pms/327` (or any real IAID) loads correctly signed-out (free tier: hero, fee & terms, FAQ; upgrade gate where Pro sections go) and signed-in as Pro (all sections, including the historical growth chart and quartile table).
- [ ] The PMS Screener drawer's new "Full Strategy Report →" link opens the correct `/pms/{iaid}` page.
- [ ] `/sitemap-pms.xml` and `/robots.txt` both reflect the new page type.
- [ ] `parseAsOnDateObjects`'s fixture check (Task 1, Step 2) still passes.
