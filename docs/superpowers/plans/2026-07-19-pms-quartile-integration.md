# APMI Quartile Ranking Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface APMI's own peer-quartile ranking for each PMS Investment Approach (IA) inside the PMS Compare modal, sourced live from APMI's `WSIAConsolidateReport.htm` report — a genuinely new data source, verified live during research (not previously scraped anywhere in this codebase).

**Architecture:** One new server-side lookup helper (provider name → APMI numeric ID, scraped once and cached long-term), one new cached API route (`/api/pms-quartile`) that resolves the provider ID and POSTs to APMI's quartile endpoint, and a frontend wire-up in `PMSCompareModal` that fetches per-fund quartile data (reusing the IAID already extracted from `apmiLink` for the existing benchmark fetch) and renders it as a new section in the comparison grid.

**Tech Stack:** Next.js 16 App Router API routes, `cheerio` (already a dependency), Vercel Blob (already used by `pms-data`/`pms-benchmark` for the shared cache layer), React (existing `PMSCompareModal`).

## Global Constraints

- Match the exact three-layer cache pattern (`in-memory Map` → `Vercel Blob` → live APMI fetch) already used in `app/api/pms-data/route.js` and `app/api/pms-benchmark/route.js` — same `isFresh`/`inflight`-dedup/fire-and-forget-write structure, so a future maintainer reading one route understands all three.
- Never throw when a fund simply doesn't resolve (unknown provider, empty quartile table, network failure) — every failure path returns `{status:'success', data:null, reason:'...'}` or logs and degrades, exactly like `pms-benchmark`'s `benchmark: null` behavior. The Compare modal must never break because one fund's quartile lookup failed.
- This repo has no test runner configured (`package.json` has no `"test"` script). Verification is: a standalone `.mjs` script run directly with `node`, exercising the exported pure-parsing functions against real fixture HTML (saved from a live APMI response during this session), plus `npm run build` and a manual dev-server check — the same pattern used for the PMS Compare verdict fix earlier this session (`test-pms-verdict.mjs`).
- Fixtures for this plan already exist at:
  - `C:\Users\Atin\AppData\Local\Temp\claude\D--workspace-MF-Analyzer-Abundance\a1324d72-9fae-4a5c-8f93-9ca9087db49c\scratchpad\fixtures\apmi-quartile-sample.html` — a real, live-fetched quartile `<tbody>` response for "Abakkus All Cap Approach" (provider id 36, IA id 233, Equity strategy, as-on 2026-06-30).
  - `...\scratchpad\fixtures\apmi-provider-select-sample.html` — a trimmed, valid `<select id="pmsProvideNames">` fragment containing 5 real provider options including Abakkus (id 36).
- The quartile report only has 6 periods: 1Y, 2Y, 3Y, 5Y, 7Y, 10Y (no 1M/3M/6M/Inception rows) — do not try to force these onto the existing `PERIODS` array in `PMSCompare.jsx` (`ret1M…retInception`), which is a different, unrelated set. Render the quartile section as its own table.

---

### Task 1: APMI provider name → ID lookup helper

**Files:**
- Create: `lib/apmiProviderMap.js`
- Test: run inline via `node` against the fixture (no separate test file needed — see Step 4)

**Interfaces:**
- Produces: `export async function getApmiProviderId(providerName: string): Promise<number|null>` — used by Task 2's API route. Returns `null` (never throws) when the name has no match.
- Also exports `parseProviderMap(html: string): Record<string, number>` (pure function, unexported from the public API surface but exported for the verification script to import directly) — maps a normalized (lowercase, whitespace-collapsed, trimmed) provider name to its APMI numeric ID.

- [ ] **Step 1: Write `lib/apmiProviderMap.js`**

```js
/**
 * lib/apmiProviderMap.js
 *
 * Resolves an APMI PMS provider's display name (e.g. "Abakkus Asset Manager
 * Private Limited", as scraped verbatim from the /api/pms-data leaderboard's
 * `portfolioManager` field) to its numeric `pmsProvider` ID — required by the
 * WSIAConsolidateReport quartile endpoint (Task 2), which the leaderboard and
 * IaInsight endpoints never expose.
 *
 * The full ~365-provider list is only visible in the
 * <select id="pmsProvideNames"> dropdown on WSIAConsolidateReport.htm's plain
 * GET page (no auth/session needed). Providers are added rarely, so the whole
 * map is scraped once and cached long-term — same three-layer pattern as
 * pms-data/pms-benchmark.
 */

const MEM_TTL_MS  = 30 * 24 * 60 * 60 * 1000;  // 30 days
const BLOB_TTL_MS = 90 * 24 * 60 * 60 * 1000;  // 90 days — new providers appear rarely
const BLOB_KEY    = 'pms-provider-map/map.json';

/** @type {{ map: Record<string, number>, ts: number } | null} */
let memCache = null;
/** @type {Promise<Record<string, number>> | null} */
let inflight = null;

function isFresh(ts, ttlMs) {
    return ts && Date.now() - ts < ttlMs;
}

function normalize(name) {
    return String(name || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

async function readFromBlob() {
    if (!BLOB_TOKEN) return null;
    try {
        const { list } = await import('@vercel/blob');
        const { blobs } = await list({ prefix: BLOB_KEY, token: BLOB_TOKEN, limit: 1 });
        if (!blobs.length) return null;
        const res = await fetch(blobs[0].downloadUrl || blobs[0].url, {
            headers: { Authorization: `Bearer ${BLOB_TOKEN}`, 'Cache-Control': 'no-store' },
        });
        if (!res.ok) return null;
        const payload = await res.json();
        if (!isFresh(payload.ts, BLOB_TTL_MS)) return null;
        return payload;
    } catch (err) {
        console.warn('[apmiProviderMap] Blob read error:', err.message);
        return null;
    }
}

async function writeToBlob(map) {
    if (!BLOB_TOKEN) return;
    try {
        const { put } = await import('@vercel/blob');
        const payload = JSON.stringify({ map, ts: Date.now() });
        await put(BLOB_KEY, payload, {
            access: 'private',
            contentType: 'application/json',
            addRandomSuffix: false,
            token: BLOB_TOKEN,
        });
    } catch (err) {
        console.warn('[apmiProviderMap] Blob write error:', err.message);
    }
}

/**
 * Parses the pmsProvideNames <select> options out of
 * WSIAConsolidateReport.htm?action=showReportMenu's HTML.
 * Exported (in addition to being used internally) so the verification
 * script in Step 4 can exercise it directly against a saved fixture.
 */
export function parseProviderMap(html) {
    const selectMatch = html.match(/<select[^>]*id="pmsProvideNames"[\s\S]*?<\/select>/i);
    if (!selectMatch) throw new Error('pmsProvideNames select not found in APMI response');
    const optionRe = /<option\s+value="(\d+)"[^>]*>([^<]*)<\/option>/g;
    const map = {};
    let m;
    while ((m = optionRe.exec(selectMatch[0]))) {
        const id = Number(m[1]);
        const name = m[2].trim();
        if (id && name) map[normalize(name)] = id; // id=0 is the "Select" placeholder — skipped
    }
    return map;
}

async function fetchProviderMap() {
    const res = await fetch('https://www.apmiindia.org/apmi/WSIAConsolidateReport.htm?action=showReportMenu', {
        headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://www.apmiindia.org/' },
        cache: 'no-store',
    });
    if (!res.ok) throw new Error(`APMI responded ${res.status}`);
    const html = await res.text();
    return parseProviderMap(html);
}

async function getProviderMap() {
    if (isFresh(memCache?.ts, MEM_TTL_MS)) return memCache.map;

    const blob = await readFromBlob();
    if (blob) {
        memCache = { map: blob.map, ts: blob.ts };
        return blob.map;
    }

    if (inflight) return inflight;

    inflight = (async () => {
        const map = await fetchProviderMap();
        memCache = { map, ts: Date.now() };
        writeToBlob(map); // fire-and-forget
        inflight = null;
        return map;
    })();
    inflight.catch(() => { inflight = null; });

    return inflight;
}

/**
 * Resolves a provider display name to its APMI `pmsProvider` ID.
 * Returns null (never throws) if the name has no match — callers must treat
 * that as "quartile data unavailable for this fund", not an error.
 */
export async function getApmiProviderId(providerName) {
    const map = await getProviderMap();
    return map[normalize(providerName)] ?? null;
}
```

- [ ] **Step 2: Verify directory exists and file was created correctly**

Run: `ls lib/apmiProviderMap.js` (from repo root)
Expected: file listed, no error.

- [ ] **Step 3: Write and run a standalone verification script against the fixture**

Create `C:\Users\Atin\AppData\Local\Temp\claude\D--workspace-MF-Analyzer-Abundance\a1324d72-9fae-4a5c-8f93-9ca9087db49c\scratchpad\verify-provider-map.mjs`:

`lib/apmiProviderMap.js` has no top-level imports (its only import, `@vercel/blob`, is loaded dynamically inside a function body and is never invoked by this test), so — unlike Task 2's `route.js` — it can be imported directly via an absolute `file://` URL without hitting the `@/`-alias problem:

```js
import { readFileSync } from 'fs';
import { parseProviderMap } from 'file:///D:/workspace/MF-Analyzer-Abundance/lib/apmiProviderMap.js';

const html = readFileSync(new URL('./fixtures/apmi-provider-select-sample.html', import.meta.url), 'utf8');
const map = parseProviderMap(html);

console.log('Parsed provider count:', Object.keys(map).length);
console.log('Expected: 4 (5 options minus the id=0 "Select" placeholder)');

const abakkusId = map['abakkus asset manager private limited'];
console.log('Abakkus Asset Manager Private Limited ->', abakkusId, '(expected: 36)');
console.assert(abakkusId === 36, 'FAILED: Abakkus ID mismatch');

const unknown = map['some fund manager nobody has heard of'];
console.log('Unknown provider ->', unknown, '(expected: undefined)');
console.assert(unknown === undefined, 'FAILED: unknown provider should not resolve');

console.log(Object.keys(map).length === 4 && abakkusId === 36 && unknown === undefined ? 'ALL CHECKS PASSED' : 'CHECKS FAILED');
```

Run: `node "C:\Users\Atin\AppData\Local\Temp\claude\D--workspace-MF-Analyzer-Abundance\a1324d72-9fae-4a5c-8f93-9ca9087db49c\scratchpad\verify-provider-map.mjs"`
Expected output: `ALL CHECKS PASSED`

- [ ] **Step 4: Commit**

```bash
git add lib/apmiProviderMap.js
git commit -m "feat(pms-quartile): add APMI provider name-to-ID lookup helper"
```

---

### Task 2: `/api/pms-quartile` route — fetch, parse, cache APMI's quartile table

**Files:**
- Create: `app/api/pms-quartile/route.js`

**Interfaces:**
- Consumes: `getApmiProviderId(providerName)` from `lib/apmiProviderMap.js` (Task 1).
- Produces: `GET /api/pms-quartile?iaid=<number>&provider=<string>&strategy=<Equity|Debt|Hybrid|Multi Asset>&year=<number>&month=<number 1-12>` → JSON `{status:'success', data: QuartileRow[] | null, source, reason?}` where `QuartileRow = {period, label, peers, iaTwrr, benchmark, quartile, q1Min, q2Min, q3Min}`. Consumed by `PMSCompareModal` in Task 3.
- Also exports `parseQuartileTable(html)` (pure function) for direct testing.

- [ ] **Step 1: Write `app/api/pms-quartile/route.js`**

```js
/**
 * app/api/pms-quartile/route.js
 *
 * GET /api/pms-quartile?iaid=233&provider=Abakkus%20Asset%20Manager%20Private%20Limited&strategy=Equity&year=2026&month=6
 *
 * Fetches APMI's peer-quartile ranking for a single Investment Approach (IA)
 * from WSIAConsolidateReport.htm — a distinct report from the bulk
 * /api/pms-data leaderboard and the per-IA /api/pms-benchmark page. For each
 * of six fixed lookback periods (1/2/3/5/7/10 years — this report has no
 * 1M/3M/6M rows) it returns the IA's peer count, its own TWRR, the benchmark
 * return, which quartile it ranked into, and the minimum TWRR that defines
 * each quartile boundary — SEBI/APMI's own methodology, independent of any
 * of our own calculated figures.
 *
 * Three-layer cache, same pattern as /api/pms-data and /api/pms-benchmark.
 * Cache key includes year+month because — unlike a benchmark name, which
 * never changes — quartile rank moves every reporting month.
 */

import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { getApmiProviderId } from '@/lib/apmiProviderMap';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MEM_TTL_MS  = 6  * 60 * 60 * 1000;       // 6 hours
const BLOB_TTL_MS = 30 * 24 * 60 * 60 * 1000;  // 30 days — APMI publishes monthly
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

const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

async function readFromBlob(key) {
    if (!BLOB_TOKEN) return null;
    try {
        const { list } = await import('@vercel/blob');
        const { blobs } = await list({ prefix: `${BLOB_BASE}/${key}.json`, token: BLOB_TOKEN, limit: 1 });
        if (!blobs.length) return null;
        const res = await fetch(blobs[0].downloadUrl || blobs[0].url, {
            headers: { Authorization: `Bearer ${BLOB_TOKEN}`, 'Cache-Control': 'no-store' },
        });
        if (!res.ok) return null;
        const payload = await res.json();
        if (!isFresh(payload.ts, BLOB_TTL_MS)) return null;
        return payload;
    } catch (err) {
        console.warn('[pms-quartile] Blob read error:', err.message);
        return null;
    }
}

async function writeToBlob(key, data) {
    if (!BLOB_TOKEN) return;
    try {
        const { put } = await import('@vercel/blob');
        const payload = JSON.stringify({ data, ts: Date.now() });
        await put(`${BLOB_BASE}/${key}.json`, payload, {
            access: 'private',
            contentType: 'application/json',
            addRandomSuffix: false,
            token: BLOB_TOKEN,
        });
    } catch (err) {
        console.warn('[pms-quartile] Blob write error:', err.message);
    }
}

function lastDayOfMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

/**
 * Parses the six-row quartile <tbody> returned by getWebsiteConsolidateReport.
 * Each row has exactly 8 <td> cells regardless of whether the IA has data for
 * that period (NA text fills the cells instead) — indices below are fixed:
 *   0 period label ("1 Year"/"2 Years"...) · 1 peer count · 2 IA TWRR ·
 *   3 benchmark return · 4 IA quartile label · 5/6/7 quartile-1/2/3 minimum TWRR
 */
export function parseQuartileTable(html) {
    // APMI's response is a bare <tbody> fragment with no enclosing <table>.
    // Verified live: cheerio's HTML5 parser silently drops <tr>/<td> elements
    // that appear outside table context ("foster parenting" per the HTML5
    // spec) — cheerio.load(html) on the raw fragment returns zero <tr>
    // matches even though the tags are right there in the string. Wrapping
    // in <table> before loading fixes it completely (verified against a
    // real APMI response: 0 rows -> 6 rows).
    const $ = cheerio.load(`<table>${html}</table>`);
    const rows = [];
    $('tr').each((_, tr) => {
        const tds = $(tr).find('td');
        if (tds.length < 8) return;
        const periodText = $(tds[0]).text().replace(/\s+/g, ' ').trim(); // "1 Year", "2 Years"...
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

function ok(data, source) {
    return NextResponse.json(
        { status: 'success', data, source },
        { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=2592000' } }
    );
}
```

- [ ] **Step 2: Write and run a standalone verification script against the real fixture**

`route.js` has top-level imports of `next/server` and the `@/lib/apmiProviderMap` alias — the `@/` alias is resolved by Next's bundler via `jsconfig.json`, which plain Node's ESM loader does not read, so importing `route.js` directly from a standalone script would throw `ERR_MODULE_NOT_FOUND`. Instead, paste the exact same `parseQuartileTable` function body into the verify script (identical to how `test-pms-verdict.mjs` and `verify-safeattr.mjs` verified this session's earlier work — a local copy exercised against fixtures, not a cross-boundary import) and diff it against `route.js` by eye before running. A bare `import * as cheerio from 'cheerio'` also fails from outside the project tree (Node's ESM resolver walks up from the *importing* script's own directory, which here is nowhere near the project's `node_modules`) — import cheerio's ESM entrypoint via an absolute `file://` URL instead, which was verified to work during this session's own testing.

Create `C:\Users\Atin\AppData\Local\Temp\claude\D--workspace-MF-Analyzer-Abundance\a1324d72-9fae-4a5c-8f93-9ca9087db49c\scratchpad\verify-quartile-parse.mjs`:

```js
import { readFileSync } from 'fs';
import * as cheerio from 'file:///D:/workspace/MF-Analyzer-Abundance/node_modules/cheerio/dist/esm/index.js';

// Exact copy of parseQuartileTable from app/api/pms-quartile/route.js — keep in sync.
function parseQuartileTable(html) {
    // APMI's response is a bare <tbody> fragment with no enclosing <table> —
    // cheerio silently drops <tr>/<td> outside table context, so wrap it first.
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

const html = readFileSync(new URL('./fixtures/apmi-quartile-sample.html', import.meta.url), 'utf8');
const rows = parseQuartileTable(html);

console.log('Parsed row count:', rows.length, '(expected: 6 — 1Y/2Y/3Y/5Y/7Y/10Y)');
console.assert(rows.length === 6, 'FAILED: expected 6 rows');

const y1 = rows.find(r => r.period === '1Y');
console.log('1Y row:', y1);
console.assert(y1.peers === 1283, 'FAILED: 1Y peers should be 1283');
console.assert(y1.iaTwrr === 5.29, 'FAILED: 1Y iaTwrr should be 5.29');
console.assert(y1.benchmark === -1.96, 'FAILED: 1Y benchmark should be -1.96');
console.assert(y1.quartile === 'Second Quartile', 'FAILED: 1Y quartile should be "Second Quartile"');
console.assert(y1.q1Min === 5.79 && y1.q2Min === 0.02 && y1.q3Min === -3.75, 'FAILED: 1Y quartile thresholds mismatch');

const y10 = rows.find(r => r.period === '10Y');
console.log('10Y row (NA case):', y10);
console.assert(y10.iaTwrr === null && y10.benchmark === null && y10.quartile === null, 'FAILED: 10Y should be null (NA) for the fund-specific columns');
console.assert(y10.q1Min === 14.75, 'FAILED: 10Y quartile-1 threshold should still be populated even when the fund itself has no 10Y data');

const allPassed = rows.length === 6 && y1.peers === 1283 && y1.quartile === 'Second Quartile' && y10.quartile === null;
console.log(allPassed ? 'ALL CHECKS PASSED' : 'CHECKS FAILED');
```

Run: `node "C:\Users\Atin\AppData\Local\Temp\claude\D--workspace-MF-Analyzer-Abundance\a1324d72-9fae-4a5c-8f93-9ca9087db49c\scratchpad\verify-quartile-parse.mjs"`
Expected output: `ALL CHECKS PASSED`

- [ ] **Step 3: Run the Next.js build to confirm the new route compiles cleanly**

Run: `npm run build` (from repo root)
Expected: build succeeds, `/api/pms-quartile` listed among the built routes, no type/lint errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/pms-quartile/route.js
git commit -m "feat(pms-quartile): add cached API route for APMI's peer-quartile ranking report"
```

---

### Task 3: Wire quartile data into `PMSCompareModal`

**Files:**
- Modify: `app/pms-screener/page.jsx` (pass `dataMonths` and `strategy` down to `PMSCompareModal`)
- Modify: `app/pms-screener/PMSCompare.jsx` (fetch + render quartile data)
- Modify: `app/pms-screener/pms-compare.css` (quartile badge styling)

**Interfaces:**
- Consumes: `GET /api/pms-quartile` (Task 2); `dataMonths.latest`/`dataMonths.prev` shape `{month, year, asOnDate, label, shortLabel, isoYearMonth}` from `lib/pmsDate.js`'s `getPmsDataMonths()` (already used in `page.jsx`); each fund object `f` already carries `f.dataMonth` (`'latest'|'prev'`), `f.portfolioManager`, `f.apmiLink`, `f.id` (all already present on data returned by `/api/pms-data`, confirmed by reading `PMSCompareModal`'s existing benchmark-fetch `useEffect`).
- Produces: nothing consumed by later tasks — this is the final task.

- [ ] **Step 1: Pass `dataMonths` and `strategy` down to `PMSCompareModal` in `app/pms-screener/page.jsx`**

Find the existing invocation (around line 942-945):

```jsx
                <PMSCompareModal
                    funds={compareList}
                    dataLabel={dataMonths.latest.label}
```

Replace with:

```jsx
                <PMSCompareModal
                    funds={compareList}
                    dataLabel={dataMonths.latest.label}
                    dataMonths={dataMonths}
                    strategy={strategy}
```

(Leave the remaining props on that call — `onClose`, `onRemove`, etc. — untouched.)

- [ ] **Step 2: Add a shared IAID-extraction helper near the top of `app/pms-screener/PMSCompare.jsx`**

The existing benchmark `useEffect` (around line 140-159) already extracts the APMI `IAID` inline from `f.apmiLink`. The new quartile fetch needs the same value, so factor it out once rather than duplicating the inline `try`/`catch`. Add this near the top of the file, just above `PMSCompareModal`'s definition (before line 120):

```jsx
/** Extracts the numeric APMI `IAID` from a fund's apmiLink, or null if absent/malformed. */
function extractIaid(apmiLink) {
  try {
    return apmiLink ? new URL(apmiLink).searchParams.get('IAID') : null;
  } catch {
    return null;
  }
}
```

Then replace the inline extraction inside the existing benchmark `useEffect` (around line 143-146):

```jsx
    Promise.all(funds.map(f => {
      let iaid = null;
      try { iaid = f.apmiLink ? new URL(f.apmiLink).searchParams.get('IAID') : null; } catch { /* ignore */ }
      if (!iaid) return Promise.resolve({ id: f.id, name: null });
```

with:

```jsx
    Promise.all(funds.map(f => {
      const iaid = extractIaid(f.apmiLink);
      if (!iaid) return Promise.resolve({ id: f.id, name: null });
```

- [ ] **Step 3: Accept the two new props and add quartile-fetch state to `PMSCompareModal`**

Change the function signature (around line 120):

```jsx
export function PMSCompareModal({ funds, dataLabel, onClose, onRemove }) {
```

to:

```jsx
export function PMSCompareModal({ funds, dataLabel, dataMonths, strategy, onClose, onRemove }) {
```

Then, immediately after the existing `bseReturns` state declaration (around line 138), add:

```jsx
  // ── APMI Quartile Ranking — independent, SEBI/APMI-sourced peer ranking ──
  // Distinct from the benchmark fetch above: this hits WSIAConsolidateReport
  // (a different APMI report entirely) and needs both the fund's IAID *and*
  // its numeric PMS-provider ID, which /api/pms-quartile resolves server-side
  // from the plain provider name we already have (f.portfolioManager). Each
  // fund's own reporting month can differ (f.dataMonth is 'latest' or 'prev',
  // set when page.jsx merges the two APMI data-month responses), so we look
  // up month/year per-fund via dataMonths rather than assuming one date for all.
  const [quartileData, setQuartileData] = useState({});
  const [quartileLoading, setQuartileLoading] = useState(true);

  useEffect(() => {
    if (!dataMonths) { setQuartileLoading(false); return; }
    let cancelled = false;
    setQuartileLoading(true);
    Promise.all(funds.map(f => {
      const iaid = extractIaid(f.apmiLink);
      if (!iaid || !f.portfolioManager) return Promise.resolve({ id: f.id, data: null });
      const monthInfo = f.dataMonth === 'prev' ? dataMonths.prev : dataMonths.latest;
      const params = new URLSearchParams({
        iaid,
        provider: f.portfolioManager,
        strategy: strategy || 'Equity',
        year: String(monthInfo.year),
        month: String(monthInfo.month),
      });
      return fetch(`/api/pms-quartile?${params}`)
        .then(r => r.json())
        .then(j => ({ id: f.id, data: j.status === 'success' ? j.data : null }))
        .catch(() => ({ id: f.id, data: null }));
    })).then(results => {
      if (cancelled) return;
      const map = {};
      results.forEach(r => { map[r.id] = r.data; });
      setQuartileData(map);
      setQuartileLoading(false);
    });
    return () => { cancelled = true; };
  }, [funds, dataMonths, strategy]);
```

- [ ] **Step 4: Render the quartile section in the comparison grid**

Add a small helper above `PMSCompareModal` (near `extractIaid`, or beside the existing `fmtRet`/`rc` helpers used by the Returns section — match whatever ordering those already use):

```jsx
const QUARTILE_PERIODS = ['1Y', '2Y', '3Y', '5Y', '7Y', '10Y'];
const QUARTILE_LABELS = { '1Y': '1 Year', '2Y': '2 Years', '3Y': '3 Years', '5Y': '5 Years', '7Y': '7 Years', '10Y': '10 Years' };

/** Maps an APMI quartile label to a short CSS-friendly class suffix. */
function quartileClass(q) {
  if (!q) return 'na';
  if (q.startsWith('First')) return 'q1';
  if (q.startsWith('Second')) return 'q2';
  if (q.startsWith('Third')) return 'q3';
  if (q.startsWith('Fourth')) return 'q4';
  return 'na';
}
```

Then, immediately after the existing Returns section's closing (right after the `{PERIODS.map(...)}` block ends, before the next `cmp-section-head` — locate by searching for the `📊 Returns Across All Time Horizons` section-head block and insert right after its closing `)}`), add:

```jsx
            {/* APMI Quartile Ranking — independent peer-relative ranking */}
            {!quartileLoading && funds.some(f => quartileData[f.id]?.length) && (
              <>
                <div className="cmp-section-head" style={{ gridColumn: `1 / span ${n + 1}` }}>
                  🏅 APMI Quartile Ranking · Peer-Relative, Not Self-Calculated
                </div>
                {QUARTILE_PERIODS.map(period => {
                  const anyData = funds.some(f => quartileData[f.id]?.find(r => r.period === period));
                  if (!anyData) return null;
                  return (
                    <div key={period} className="cmp-row">
                      <div className="cmp-cell" style={{ fontWeight: 700 }}>{QUARTILE_LABELS[period]}</div>
                      {funds.map(f => {
                        const row = quartileData[f.id]?.find(r => r.period === period);
                        if (!row) {
                          return <div key={f.id} className="cmp-cell"><span className="cmp-ret neu">—</span></div>;
                        }
                        return (
                          <div key={f.id} className="cmp-cell">
                            <span className={`cmp-quartile-badge cmp-quartile-${quartileClass(row.quartile)}`}>
                              {row.quartile || 'NA'}
                            </span>
                            {row.peers != null && (
                              <div className="cmp-quartile-peers">of {row.peers} peers</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                <div
                  className="cmp-quartile-footnote"
                  style={{ gridColumn: `1 / span ${n + 1}` }}
                >
                  Source: APMI India · WSIAConsolidateReport · Quartile = performance rank vs. all peer Investment Approaches in the same strategy for that period.
                </div>
              </>
            )}
```

**Why not `colSpan`:** this grid (`.cmp-grid`) is CSS Grid with `display: contents` rows (see `.cmp-row` in `pms-compare.css`), not an HTML `<table>` — `colSpan` is a table attribute and has no effect on a `<div>`. Column spanning here is done via inline `gridColumn`, exactly like the `cmp-section-head` blocks above it.

- [ ] **Step 5: Add quartile badge styling to `app/pms-screener/pms-compare.css`**

Append after the existing `.cmp-ret-best` rule (around line 268):

```css
/* APMI Quartile Ranking badges */
.cmp-quartile-badge {
  display: inline-block;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 700;
  font-size: .68rem;
  padding: 3px 9px;
  border-radius: 20px;
  letter-spacing: .3px;
}
.cmp-quartile-q1 { background: var(--g-xlight); color: var(--g1); border: 1.5px solid var(--g3); }
.cmp-quartile-q2 { background: color-mix(in srgb, var(--g3) 15%, transparent); color: var(--g2); border: 1.5px solid var(--g3); }
.cmp-quartile-q3 { background: rgba(200, 140, 40, .12); color: #a8681a; border: 1.5px solid rgba(200, 140, 40, .4); }
.cmp-quartile-q4 { background: rgba(200, 60, 60, .1); color: var(--neg); border: 1.5px solid rgba(200, 60, 60, .35); }
.cmp-quartile-na { background: var(--s2); color: var(--muted); border: 1.5px solid var(--border); }
.cmp-quartile-peers {
  font-size: .58rem;
  color: var(--muted);
  margin-top: 3px;
  font-family: 'JetBrains Mono', monospace;
}
.cmp-quartile-footnote {
  padding: 8px 18px 16px;
  font-size: .62rem;
  color: var(--muted);
  font-weight: 400;
}
```

- [ ] **Step 6: Run the build and manually verify in the dev server**

Run: `npm run build`
Expected: build succeeds with no errors.

Then start the dev server (`npm run dev`), open `/pms-screener`, select 2-3 strategies for comparison (include "Abakkus All Cap Approach" if visible in the Equity list, since it's the fixture-verified example), open the Compare modal, and confirm:
- A new "🏅 APMI Quartile Ranking" section appears below Returns.
- Quartile badges render with distinct colors per quartile (1st/2nd/3rd/4th) and a peer count beneath each.
- Funds with no resolvable provider/IAID show "—" instead of breaking the layout.
- The existing Returns section, verdict banner, and benchmark/alpha rows are all unaffected.

- [ ] **Step 7: Commit**

```bash
git add app/pms-screener/page.jsx app/pms-screener/PMSCompare.jsx app/pms-screener/pms-compare.css
git commit -m "feat(pms-quartile): surface APMI peer-quartile ranking in PMS Compare"
```
