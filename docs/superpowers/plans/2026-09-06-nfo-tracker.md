# NFO Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Open Now" New Fund Offer (NFO) tracker — a listing page plus per-scheme detail pages — covering both Mutual Funds and SIFs, sourced entirely from AMFI's own public JSON API, with zero new Postgres load beyond one explicitly-scoped read-only lookup.

**Architecture:** A daily GitHub Actions job (`scripts/sync_amfi_nfo.js`) pulls AMFI's open-NFO feeds for both fund types, normalizes them, and writes one JSON document to Cloudflare R2 (same pattern as `amfi-aum.json`). A thin reader (`lib/nfoData.js`) serves that document to a public API route, a listing page, and per-scheme detail pages — all pure R2 reads, no Postgres, matching the safe pattern already proven by `/api/screener`.

**Tech Stack:** Next.js App Router (React Server Components + one client island), Node.js sync script, Cloudflare R2 (via `aws4fetch`), GitHub Actions cron.

**Spec:** `docs/superpowers/specs/2026-09-06-nfo-tracker-design.md`

## Global Constraints

- No new Postgres query path except the single, explicitly-scoped, read-only best-effort name-match lookup in Task 6 (the detail page) — never a query on the listing page or the API route.
- Never fabricate a date, price, or link — every field traces to a real AMFI response field; a missing field is omitted from the UI, never guessed.
- Evergreen slugs — a slug, once generated, is never regenerated differently for the same `schemeId` (the stable `slugify(toTitleCase(...))` function from Task 1 is the only place a slug is derived).
- Reuse `/book-consultation` for the advisor CTA — never link to the external getabundance.in contact page.
- No Claude/AI signature in any commit. Work directly on `main`. Commit automatically once each task is verified; push only when explicitly asked. Stage only the exact files each task's commit touches.
- This repo has no automated test framework for pipeline/page work of this kind — verification is `npm run build`, live spot-checks against real data, and (for the sync script's pure functions only) inline `assert`-based self-checks, not a new test runner.

---

### Task 1: NFO sync script (`scripts/sync_amfi_nfo.js`)

**Files:**
- Create: `scripts/sync_amfi_nfo.js`

**Interfaces:**
- Consumes: `scripts/lib/r2SyncSafety.js`'s `backupThenPut(r2Put, key, existingValue, newContent)` (already exists, read it in full before writing this task — same signature `sync_amfi_aum.js` already uses); `lib/r2.js`'s `r2Get(key)` / `r2Put(key, jsonString)` (dynamic `import()`, same as `sync_amfi_aum.js`).
- Produces: an R2 JSON document at key `amfi-nfo.json`, shape `{syncedAt: string, mf: NfoEntry[], sif: NfoEntry[]}` where `NfoEntry = {type: 'mf'|'sif', schemeId: string, mfId: string|null, amcName: string|null, schemeName: string, slug: string, schemeType: string|null, category: string|null, objective: string|null, openDate: string|null, closeDate: string|null, offerPrice: number|null, minInvestment: number|null, amcWebsite: string|null, infoDocumentUrl: string|null, status: 'open'|'closed'}`. This exact shape is what Task 3's `lib/nfoData.js` reads.

- [ ] **Step 1: Read the two files this task must mirror**

Read `scripts/sync_amfi_aum.js` and `scripts/lib/r2SyncSafety.js` in full — this task copies their scheduled-sync-to-R2 shape (dynamic `import('../lib/r2.js')`, `backupThenPut` usage, `require.main === module` entry point), with one deliberate difference explained in Step 4 below.

- [ ] **Step 2: Write the script with its pure helper functions, module exports, and self-test**

```js
/**
 * scripts/sync_amfi_nfo.js
 *
 * Syncs currently-open New Fund Offers (NFOs) -- both regular Mutual Funds
 * and SIFs -- from AMFI's own public JSON API into one R2-cached document,
 * consumed by lib/nfoData.js. See docs/superpowers/specs/
 * 2026-09-06-nfo-tracker-design.md for the full design rationale.
 *
 * Endpoints (no auth, no referer needed -- verified live):
 *   GET /api/new-fund-offer                  -> summary of every open MF NFO
 *   GET /api/new-fund-offer?Scheme_Id=X       -> detail for one MF NFO
 *   GET /api/sif-nfo                          -> summary of every open SIF NFO
 *   GET /api/sif-nfo?Scheme_Id=X              -> detail for one SIF NFO
 *
 * Unlike sync_amfi_aum.js's count-based partial-failure guard (a shrinking
 * count is itself suspicious there, since AUM never legitimately drops to
 * zero), an NFO list legitimately shrinking to zero is a valid, expected
 * outcome -- all NFOs closed, nothing new open. The correct guard here is
 * at the HTTP-response level: a non-200 or unparsable body from either
 * summary endpoint aborts the whole run and preserves the existing R2
 * document untouched (see fetchOpenNfos()).
 *
 * The SIF detail endpoint's field shape was never directly observed at
 * spec time (zero SIF NFOs were open) -- mapDetailItem()/fetchOpenNfos()
 * are deliberately defensive about missing fields for BOTH types, not
 * just SIF, so this isn't a special case that could silently rot.
 *
 * Usage:
 *   node scripts/sync_amfi_nfo.js [--dry-run]
 *   node scripts/sync_amfi_nfo.js --self-test
 */

const { backupThenPut } = require('./lib/r2SyncSafety');

const DRY_RUN = process.argv.includes('--dry-run');
const R2_KEY = 'amfi-nfo.json';
const ARCHIVE_DAYS = 30;
const PACING_MS = 200;

const AMFI_BASE = 'https://www.amfiindia.com/api';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  try {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    const data = await res.json();
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: null };
  }
}

// "BANK OF INDIA VALUE FUND" -> "Bank Of India Value Fund". Deliberately
// simple (no acronym exception list, no small-word lowercasing) -- matches
// the spec's own worked example exactly and avoids guessing at AMC-name
// casing conventions (ICICI, SBI, UTI, etc.) that would need a maintained
// exception list to get "right".
function toTitleCase(raw) {
  if (!raw) return '';
  return raw.trim().toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

// "Bank Of India Value Fund" -> "bank-of-india-value-fund"
function slugify(titleCased) {
  return (titleCased || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toDateOnly(raw) {
  if (!raw || typeof raw !== 'string') return null;
  return raw.split('T')[0] || null;
}

function toNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// No closeDate to judge by -> default to 'open' rather than guessing
// 'closed'; the summary-list membership (handled in fetchOpenNfos) is the
// real source of truth for what counts as open.
function computeStatus(closeDate, todayStr = new Date().toISOString().split('T')[0]) {
  if (!closeDate) return 'open';
  return todayStr <= closeDate ? 'open' : 'closed';
}

// Maps one AMFI detail-endpoint item (the raw `items[0]` object from either
// /api/new-fund-offer?Scheme_Id=X or /api/sif-nfo?Scheme_Id=X) to this app's
// normalized shape. `type` is 'mf' or 'sif', passed in by the caller rather
// than inferred, since both endpoints share an identical field set.
function mapDetailItem(raw, type) {
  const schemeName = toTitleCase(raw.SchemeName);
  const closeDate = toDateOnly(raw.NewFundOfferClosureDate) || toDateOnly(raw.NewFundEarliestClosureDate);
  return {
    type,
    schemeId: String(raw.Scheme_Id ?? ''),
    mfId: raw.MF_Id != null ? String(raw.MF_Id) : null,
    amcName: raw.MutualFund || null,
    schemeName,
    slug: slugify(schemeName),
    schemeType: raw.SchemeType || null,
    category: raw.SchemeCategory || null,
    objective: (raw.ObjectiveofScheme || '').trim() || null,
    openDate: toDateOnly(raw.NewFundLaunchDate),
    closeDate,
    offerPrice: toNumber(raw.OfferPriceRs),
    minInvestment: toNumber(raw.MinimumSubscriptionAmount),
    amcWebsite: raw.ForFurtherDetailsPleaseVisitWebsite || null,
    infoDocumentUrl: raw.infoDocumentUrl || null,
    status: computeStatus(closeDate),
  };
}

// Fetches every currently-open NFO of one type ('mf' or 'sif') as fully
// normalized entries. Returns { ok: true, entries } on success, or
// { ok: false, entries: [] } if the SUMMARY call itself failed (network,
// non-200, or unparsable body) -- callers must treat ok:false as "abort,
// don't touch R2 for this type", never as "empty list". A single detail
// fetch failing for one scheme_id only skips that one entry (logged), it
// does not abort the whole type.
async function fetchOpenNfos(type) {
  const summaryPath = type === 'sif' ? '/sif-nfo' : '/new-fund-offer';
  const summaryRes = await fetchJson(`${AMFI_BASE}${summaryPath}`);
  if (!summaryRes.ok || !Array.isArray(summaryRes.data?.NewFundOffer)) {
    console.error(`[NFO Sync] ${type}: summary fetch failed (status ${summaryRes.status}) -- aborting this type.`);
    return { ok: false, entries: [] };
  }

  const refs = [];
  for (const group of summaryRes.data.NewFundOffer) {
    for (const item of group.items || []) {
      if (item.Scheme_Id != null) refs.push(item.Scheme_Id);
    }
  }

  const entries = [];
  for (const schemeId of refs) {
    const detailRes = await fetchJson(`${AMFI_BASE}${summaryPath}?Scheme_Id=${encodeURIComponent(schemeId)}`);
    await sleep(PACING_MS);
    if (!detailRes.ok || !Array.isArray(detailRes.data?.NewFundOffer)) {
      console.warn(`[NFO Sync] ${type} Scheme_Id=${schemeId}: detail fetch failed, skipping this one entry.`);
      continue;
    }
    const item = detailRes.data.NewFundOffer[0]?.items?.[0];
    if (!item || !item.SchemeName) {
      console.warn(`[NFO Sync] ${type} Scheme_Id=${schemeId}: detail response missing expected fields, skipping.`);
      continue;
    }
    entries.push(mapDetailItem(item, type));
  }

  return { ok: true, entries };
}

// Archival rule: an entry present in `previousEntries` but absent from
// `newOpenEntries` (matched by schemeId) is carried forward with
// status:'closed' as long as its closeDate is within ARCHIVE_DAYS of
// today; anything closed longer than that -- or with no closeDate to
// judge by at all -- is dropped. Pure function, no I/O, so it can be
// checked with fixtures in isolation (see selfTest() below).
function archiveClosedEntries(previousEntries, newOpenEntries, todayStr = new Date().toISOString().split('T')[0]) {
  const openIds = new Set(newOpenEntries.map((e) => e.schemeId));
  const cutoff = new Date(todayStr);
  cutoff.setDate(cutoff.getDate() - ARCHIVE_DAYS);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const carried = (previousEntries || [])
    .filter((e) => {
      if (openIds.has(e.schemeId)) return false; // still open -- the new fetch already has it
      if (!e.closeDate) return false; // no date to judge staleness by -- drop rather than keep forever
      return e.closeDate >= cutoffStr;
    })
    .map((e) => ({ ...e, status: 'closed' }));

  return [...newOpenEntries, ...carried];
}

function selfTest() {
  const assert = require('assert');

  assert.strictEqual(toTitleCase('BANK OF INDIA VALUE FUND'), 'Bank Of India Value Fund');
  assert.strictEqual(toTitleCase(''), '');
  assert.strictEqual(slugify('Bank Of India Value Fund'), 'bank-of-india-value-fund');
  assert.strictEqual(toDateOnly('2026-08-28T00:00:00.000Z'), '2026-08-28');
  assert.strictEqual(toDateOnly(null), null);
  assert.strictEqual(toNumber('5000'), 5000);
  assert.strictEqual(toNumber(''), null);
  assert.strictEqual(computeStatus('2099-01-01', '2026-09-06'), 'open');
  assert.strictEqual(computeStatus('2000-01-01', '2026-09-06'), 'closed');
  assert.strictEqual(computeStatus(null, '2026-09-06'), 'open');

  const mapped = mapDetailItem(
    {
      Scheme_Id: '14562',
      MF_Id: '46',
      MutualFund: 'Bank of India Mutual Fund',
      SchemeName: 'BANK OF INDIA VALUE FUND',
      SchemeType: 'Open Ended',
      SchemeCategory: 'Equity Schemes - Value Fund',
      ObjectiveofScheme: 'The investment objective of the scheme is to generate long-term capital appreciation.',
      NewFundLaunchDate: '2026-08-28T00:00:00.000Z',
      NewFundOfferClosureDate: '2026-09-11T00:00:00.000Z',
      OfferPriceRs: '10',
      MinimumSubscriptionAmount: '5000',
      ForFurtherDetailsPleaseVisitWebsite: 'https://www.boimf.in',
      infoDocumentUrl: 'https://portal.amfiindia.com/spages/14562.pdf',
    },
    'mf'
  );
  assert.strictEqual(mapped.schemeName, 'Bank Of India Value Fund');
  assert.strictEqual(mapped.slug, 'bank-of-india-value-fund');
  assert.strictEqual(mapped.offerPrice, 10);
  assert.strictEqual(mapped.minInvestment, 5000);
  assert.strictEqual(mapped.openDate, '2026-08-28');
  assert.strictEqual(mapped.closeDate, '2026-09-11');
  assert.strictEqual(mapped.type, 'mf');

  // Defensive mapping: a detail response missing a required field never
  // throws -- fetchOpenNfos() is what actually skips it, mapDetailItem()
  // itself just needs to not blow up on sparse input.
  const sparse = mapDetailItem({ SchemeName: 'X', Scheme_Id: '1' }, 'sif');
  assert.strictEqual(sparse.offerPrice, null);
  assert.strictEqual(sparse.amcWebsite, null);

  const today = '2026-09-06';

  // A previously-open entry no longer in the new open list, closed 10 days
  // ago, carries forward as 'closed'.
  const recentlyClosed = [{ schemeId: 'X1', schemeName: 'Old Fund', closeDate: '2026-08-27', status: 'open' }];
  const carried = archiveClosedEntries(recentlyClosed, [], today);
  assert.strictEqual(carried.length, 1);
  assert.strictEqual(carried[0].status, 'closed');

  // An entry closed more than 30 days ago is dropped, not carried forever.
  const staleClosed = [{ schemeId: 'X2', schemeName: 'Ancient Fund', closeDate: '2026-06-01', status: 'open' }];
  assert.strictEqual(archiveClosedEntries(staleClosed, [], today).length, 0);

  // An entry still present in the new open list is not duplicated via the
  // carry-forward path.
  const stillOpen = [{ schemeId: 'X3', schemeName: 'Still Open Fund', closeDate: '2026-09-20', status: 'open' }];
  assert.strictEqual(archiveClosedEntries(stillOpen, stillOpen, today).length, 1);

  console.log('[NFO Sync] Self-test: ALL PASSED');
}

async function run() {
  console.log('=== Syncing AMFI New Fund Offers ===');
  if (DRY_RUN) console.log('[Dry Run Mode Active]');

  const { r2Get, r2Put } = await import('../lib/r2.js');

  const existing = await r2Get(R2_KEY).catch((e) => {
    console.warn(`[NFO Sync] Could not read existing R2 document: ${e.message}`);
    return null;
  });

  const mfResult = await fetchOpenNfos('mf');
  const sifResult = await fetchOpenNfos('sif');

  if (!mfResult.ok || !sifResult.ok) {
    console.error('[NFO Sync] One or both summary endpoints failed -- preserving existing R2 document untouched.');
    process.exit(1);
  }

  const mf = archiveClosedEntries(existing?.mf, mfResult.entries);
  const sif = archiveClosedEntries(existing?.sif, sifResult.entries);

  const result = { syncedAt: new Date().toISOString(), mf, sif };

  console.log(`[NFO Sync] MF: ${mfResult.entries.length} open, ${mf.length - mfResult.entries.length} archived-closed.`);
  console.log(`[NFO Sync] SIF: ${sifResult.entries.length} open, ${sif.length - sifResult.entries.length} archived-closed.`);

  if (!DRY_RUN) {
    await backupThenPut(r2Put, R2_KEY, existing, JSON.stringify(result));
    console.log(`[NFO Sync] Successfully wrote to R2 (${R2_KEY}).`);
  }
}

module.exports = {
  toTitleCase,
  slugify,
  toDateOnly,
  toNumber,
  computeStatus,
  mapDetailItem,
  archiveClosedEntries,
};

if (require.main === module) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    run().catch((e) => {
      console.error('[NFO Sync] Fatal error:', e);
      process.exit(1);
    });
  }
}
```

- [ ] **Step 3: Run the self-test**

Run: `node scripts/sync_amfi_nfo.js --self-test`
Expected: `[NFO Sync] Self-test: ALL PASSED` with no assertion errors.

- [ ] **Step 4: Run the real sync against live AMFI endpoints**

Run: `node scripts/sync_amfi_nfo.js`
Expected: console output showing MF and SIF counts (SIF may legitimately show 0 open — that is a valid outcome, not a failure), ending with `[NFO Sync] Successfully wrote to R2 (amfi-nfo.json).`. Then inspect the write by hand:

```bash
node --env-file=.env.local -e "
(async () => {
  const { r2Get } = await import('./lib/r2.js');
  const doc = await r2Get('amfi-nfo.json');
  console.log('syncedAt:', doc.syncedAt);
  console.log('mf count:', doc.mf.length, 'sif count:', doc.sif.length);
  console.log('sample mf entry:', JSON.stringify(doc.mf[0], null, 2));
})();
"
```
Confirm the sample entry has a real `schemeName`, `slug`, `openDate`, `closeDate`, and that no field was fabricated (cross-check one entry against `https://www.amfiindia.com/api/new-fund-offer?Scheme_Id=<that id>` by hand).

- [ ] **Step 5: Live-verify the archival rule end-to-end (not just the self-test's fixtures)**

The self-test in Step 3 only checks `archiveClosedEntries()` in isolation. This step confirms it's actually wired correctly inside `run()` against a real R2 round-trip. Inject one fake "just closed" entry into the real document and confirm the next real sync run carries it forward as `status: "closed"` instead of silently dropping it:

```bash
node --env-file=.env.local -e "
(async () => {
  const { r2Get, r2Put } = await import('./lib/r2.js');
  const doc = await r2Get('amfi-nfo.json');
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  doc.mf.push({
    type: 'mf', schemeId: 'FAKE-TEST-9999', mfId: null, amcName: 'Test AMC',
    schemeName: 'Test Fund For Archival Check', slug: 'test-fund-for-archival-check',
    schemeType: 'Open Ended', category: 'Test', objective: null,
    openDate: '2026-08-01', closeDate: yesterday, offerPrice: 10, minInvestment: 5000,
    amcWebsite: null, infoDocumentUrl: null, status: 'open',
  });
  await r2Put('amfi-nfo.json', JSON.stringify(doc));
  console.log('Injected fake closed-yesterday entry, doc now has', doc.mf.length, 'mf entries');
})();
"
```

Run: `node scripts/sync_amfi_nfo.js` again, then:

```bash
node --env-file=.env.local -e "
(async () => {
  const { r2Get } = await import('./lib/r2.js');
  const doc = await r2Get('amfi-nfo.json');
  const carried = doc.mf.find((e) => e.schemeId === 'FAKE-TEST-9999');
  console.log('Fake entry carried forward:', !!carried, 'status:', carried?.status);
})();
"
```
Expected: `Fake entry carried forward: true status: closed` — confirms the real `run()` correctly reads the previous document, doesn't see `FAKE-TEST-9999` in AMFI's real open list, and carries it forward as closed rather than dropping it. This fake entry will itself get dropped by the archival rule 30 days from now, so no manual cleanup is needed — but note it in the task report so it isn't mistaken for real data in the meantime.

- [ ] **Step 6: Commit**

```bash
git add scripts/sync_amfi_nfo.js
git commit -m "feat(nfo): add AMFI NFO sync script (MF + SIF, R2-backed)"
```

---

### Task 2: GitHub Actions workflow

**Files:**
- Create: `.github/workflows/amfi-nfo-sync.yml`

**Interfaces:**
- Consumes: `scripts/sync_amfi_nfo.js` (Task 1) as its entry point; the same `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` repo secrets `amfi-aum-sync.yml` already uses.

- [ ] **Step 1: Read the file this task mirrors**

Read `.github/workflows/amfi-aum-sync.yml` in full — this task is a near-identical copy with a daily cron instead of monthly.

- [ ] **Step 2: Write the workflow file**

```yaml
name: Daily AMFI NFO Sync

on:
  schedule:
    # NFO windows are short (typically ~2 weeks) and open/close dates are
    # time-sensitive, unlike AUM's quarterly cadence -- this runs daily,
    # not monthly.
    - cron: '0 4 * * *'
  workflow_dispatch:

jobs:
  sync-amfi-nfo:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 24

      - name: Install deps
        run: npm install aws4fetch --no-save

      - name: Run AMFI NFO Sync
        env:
          R2_ACCOUNT_ID: ${{ secrets.R2_ACCOUNT_ID }}
          R2_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          R2_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          R2_BUCKET_NAME: ${{ secrets.R2_BUCKET_NAME }}
        run: node scripts/sync_amfi_nfo.js
```

- [ ] **Step 3: Verify the workflow file is valid YAML**

Run: `node -e "require('js-yaml') ? console.log('js-yaml available') : null" 2>/dev/null || echo "skip: no js-yaml, visually diff against amfi-aum-sync.yml instead"`
Expected: the file structure matches `amfi-aum-sync.yml` line-for-line except the `name:`, the `cron:` schedule/comment, and the final `run:` command — confirm this by eye (`diff <(sed 's/nfo/aum/g; s/NFO/AUM/g' .github/workflows/amfi-nfo-sync.yml) .github/workflows/amfi-aum-sync.yml` should show only the cron-schedule and comment lines differing).

- [ ] **Step 4: Trigger a manual run via `workflow_dispatch` once pushed (informational — not part of this local verification loop)**

This step only applies after the branch is pushed and GitHub Actions can see the workflow; note it in the task report but do not block local completion on it, since this repo pushes only when explicitly asked.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/amfi-nfo-sync.yml
git commit -m "ci: add daily AMFI NFO sync workflow"
```

---

### Task 3: R2 reader (`lib/nfoData.js`)

**Files:**
- Create: `lib/nfoData.js`

**Interfaces:**
- Consumes: `lib/r2JsonCache.js`'s `createR2JsonCache(key, ttlMs)` (already exists, reused as-is, no modification); the R2 document written by Task 1 at key `amfi-nfo.json`.
- Produces: `getNfoData(): Promise<{syncedAt: string|null, mf: NfoEntry[], sif: NfoEntry[]}>` and `getNfoBySlug(slug: string): Promise<NfoEntry|null>` — both used by Task 4, Task 5, Task 6, and Task 7.

- [ ] **Step 1: Read the file this task reuses**

Read `lib/r2JsonCache.js` in full — `createR2JsonCache` is used unmodified here, exactly as it already is for `amfi-aum.json`/`sif-aum.json`.

- [ ] **Step 2: Write `lib/nfoData.js`**

```js
/**
 * lib/nfoData.js
 *
 * Read side for the NFO tracker's R2-cached document written by
 * scripts/sync_amfi_nfo.js. Mirrors the createR2JsonCache pattern already
 * used for amfi-aum.json/sif-aum.json -- in-memory cached, R2-backed, no
 * Postgres involved. See docs/superpowers/specs/
 * 2026-09-06-nfo-tracker-design.md.
 */

import { createR2JsonCache } from './r2JsonCache.js';

const getNfoDataCached = createR2JsonCache('amfi-nfo.json', 60 * 60 * 1000);

/**
 * @returns {Promise<{syncedAt: string|null, mf: object[], sif: object[]}>}
 */
export async function getNfoData() {
  const data = await getNfoDataCached();
  return data || { syncedAt: null, mf: [], sif: [] };
}

/**
 * @param {string} slug
 * @returns {Promise<object|null>}
 */
export async function getNfoBySlug(slug) {
  if (!slug) return null;
  const data = await getNfoData();
  const all = [...(data.mf || []), ...(data.sif || [])];
  return all.find((e) => e.slug === slug) || null;
}
```

- [ ] **Step 3: Verify against the real R2 document written in Task 1**

```bash
node --env-file=.env.local -e "
(async () => {
  const { getNfoData, getNfoBySlug } = await import('./lib/nfoData.js');
  const data = await getNfoData();
  console.log('mf count:', data.mf.length, 'sif count:', data.sif.length);
  if (data.mf[0]) {
    const bySlug = await getNfoBySlug(data.mf[0].slug);
    console.log('round-trip match:', bySlug?.schemeId === data.mf[0].schemeId);
  }
  console.log('miss returns null:', (await getNfoBySlug('this-slug-does-not-exist')) === null);
})();
"
```
Expected: `round-trip match: true` and `miss returns null: true`.

- [ ] **Step 4: Commit**

```bash
git add lib/nfoData.js
git commit -m "feat(nfo): add R2 reader for the NFO document"
```

---

### Task 4: Public API route (`app/api/nfo/route.js`)

**Files:**
- Create: `app/api/nfo/route.js`

**Interfaces:**
- Consumes: `getNfoData()` from `@/lib/nfoData` (Task 3).
- Produces: `GET /api/nfo` returning `{syncedAt, mf, sif}` as JSON, `revalidate = 3600`. No auth, no Postgres.

- [ ] **Step 1: Read the file this task mirrors**

Read `app/api/screener/route.js` in full — this task copies its route-level `revalidate` + `Cache-Control` header shape at a shorter interval.

- [ ] **Step 2: Write the route**

```js
// app/api/nfo/route.js — public read of the synced NFO document.
// Mirrors app/api/screener/route.js's caching shape: no Postgres, no
// personalization, safe under concurrent load by design.

import { getNfoData } from '@/lib/nfoData';

export const revalidate = 3600;

export async function GET() {
  try {
    const data = await getNfoData();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (e) {
    return Response.json(
      { error: 'NFO data unavailable', detail: String(e.message || e), syncedAt: null, mf: [], sif: [] },
      { status: 503 }
    );
  }
}
```

- [ ] **Step 3: Verify locally**

Run: `npm run dev` (if not already running), then `curl http://localhost:3000/api/nfo | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const j=JSON.parse(d);console.log('mf:',j.mf.length,'sif:',j.sif.length)})"`
Expected: real counts matching Task 1/3's verification, no error.

- [ ] **Step 4: Commit**

```bash
git add app/api/nfo/route.js
git commit -m "feat(nfo): add public /api/nfo route"
```

---

### Task 5: Listing page (`/nfo`)

**Files:**
- Create: `app/nfo/page.jsx`
- Create: `app/nfo/NfoFilterTabs.jsx`
- Modify: `lib/metadata.js` (add an `nfo` entry to `PAGE_META`)
- Modify: `app/globals.css` (append `.nfo-*` listing-page class block)

**Interfaces:**
- Consumes: `getNfoData()` from `@/lib/nfoData` (Task 3); `getProviderLogo(type, name)` from `@/lib/providerLogos` (existing, read in full first); `getPageMeta('nfo')` from `@/lib/metadata` (existing, read the file's structure in full first — this task adds one entry to its `PAGE_META` object, following the exact shape every other entry already uses); `Navbar`/`Footer` from `@/components/Navbar` / `@/components/Footer` (existing, default exports).
- Produces: the `/nfo` route, and the `NfoFilterTabs` component's prop contract `{mf: NfoEntry[], sif: NfoEntry[]}` (consumed only within this task).

- [ ] **Step 1: Read the files this task reuses**

Read `lib/providerLogos.js` in full (already read during planning — `getProviderLogo(type, name)` where `type` is `'mf'|'sif'|'pms'`), `lib/metadata.js` in full (structure of `PAGE_META` and `getPageMeta`), and the `.pf-health-*` block in `app/globals.css` (around line 6035) for the CSS-block convention this task's CSS follows.

- [ ] **Step 2: Add the `nfo` entry to `lib/metadata.js`'s `PAGE_META`**

Add this entry to the `PAGE_META` object (anywhere among the other entries, e.g. immediately before the closing `};` of `PAGE_META`):

```js
  nfo: {
    title: 'NFO Tracker — Live Mutual Fund & SIF New Fund Offers | Abundance',
    description: 'Track every mutual fund and SIF New Fund Offer (NFO) currently open for subscription in India — launch dates, closing dates, offer price and minimum investment, sourced directly from AMFI.',
    keywords: 'NFO India, new fund offer, mutual fund NFO today, SIF NFO, upcoming mutual fund launch, NFO open now, AMFI new fund offer',
    path: '/nfo',
    ogImage: '/og-mfcalc.png',
    changefreq: 'daily',
    priority: 0.75,
  },
```

- [ ] **Step 3: Write `app/nfo/NfoFilterTabs.jsx`**

```jsx
'use client';

import { useState } from 'react';
import { getProviderLogo } from '@/lib/providerLogos';

function closesInDays(closeDate) {
  if (!closeDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const close = new Date(closeDate + 'T00:00:00');
  return Math.round((close - today) / 86400000);
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatRupees(n) {
  if (n === null || n === undefined) return null;
  return new Intl.NumberFormat('en-IN').format(n);
}

function NfoCard({ entry }) {
  const logo = getProviderLogo(entry.type, entry.amcName);
  const daysLeft = closesInDays(entry.closeDate);

  return (
    <a href={`/nfo/${entry.slug}`} className="nfo-card">
      <div className="nfo-card-top">
        {logo ? (
          <img src={logo} alt={entry.amcName || ''} className="nfo-card-logo" />
        ) : (
          <span className="nfo-card-logo-fallback">{(entry.amcName || '?').charAt(0)}</span>
        )}
        <span className="nfo-card-category">{entry.category || entry.schemeType || 'NFO'}</span>
      </div>
      <h3 className="nfo-card-name">{entry.schemeName}</h3>
      <p className="nfo-card-amc">{entry.amcName}</p>
      <div className="nfo-card-facts">
        <span>Opens {formatDate(entry.openDate)}</span>
        <span>Closes {formatDate(entry.closeDate)}</span>
      </div>
      <div className="nfo-card-bottom">
        {entry.minInvestment != null && <span className="nfo-card-min">Min ₹{formatRupees(entry.minInvestment)}</span>}
        {daysLeft != null && daysLeft >= 0 && (
          <span className="nfo-chip">{daysLeft === 0 ? 'Closes today' : `Closes in ${daysLeft}d`}</span>
        )}
      </div>
    </a>
  );
}

function EmptyState({ message, href, linkLabel }) {
  return (
    <div className="nfo-empty-state">
      <p>{message}</p>
      <a href={href}>{linkLabel} →</a>
    </div>
  );
}

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'mf', label: 'Mutual Fund' },
  { key: 'sif', label: 'SIF' },
];

export default function NfoFilterTabs({ mf, sif }) {
  const [tab, setTab] = useState('all');
  const entries = tab === 'mf' ? mf : tab === 'sif' ? sif : [...mf, ...sif];

  return (
    <div className="nfo-tabs-wrap">
      <div className="nfo-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`nfo-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'sif' && sif.length === 0 && (
        <EmptyState message="No SIF NFOs are open right now." href="/sifs" linkLabel="Browse the SIF Screener" />
      )}
      {tab === 'mf' && mf.length === 0 && (
        <EmptyState message="No mutual fund NFOs are open right now." href="/screener" linkLabel="Browse the MF Screener" />
      )}
      {tab === 'all' && entries.length === 0 && (
        <EmptyState message="No NFOs are open right now." href="/screener" linkLabel="Browse the MF Screener" />
      )}

      {entries.length > 0 && (
        <div className="nfo-card-grid">
          {entries.map((e) => (
            <NfoCard key={`${e.type}-${e.schemeId}`} entry={e} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `app/nfo/page.jsx`**

```jsx
import { getPageMeta } from '@/lib/metadata';
import { getNfoData } from '@/lib/nfoData';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import NfoFilterTabs from './NfoFilterTabs';

export const metadata = getPageMeta('nfo');
export const revalidate = 3600;

export default async function NfoPage() {
  const data = await getNfoData();

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'New Fund Offers (NFO) — Live Tracker',
    description: 'Every mutual fund and SIF New Fund Offer currently open for subscription in India, sourced from AMFI.',
    url: 'https://mfcalc.getabundance.in/nfo',
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Navbar />
      <main className="nfo-page container">
        <header className="nfo-hero">
          <h1>New Fund Offers (NFO)</h1>
          <p className="nfo-hero-sub">
            Every mutual fund and SIF currently open for subscription in India — sourced directly from AMFI.
            {data.syncedAt && (
              <> Last updated {new Date(data.syncedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}.</>
            )}
          </p>
        </header>
        <NfoFilterTabs mf={data.mf || []} sif={data.sif || []} />
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 5: Append the listing-page CSS block to `app/globals.css`**

```css
/* ── NFO Tracker — Listing ── */
.nfo-hero { margin-bottom: 24px; }
.nfo-hero h1 { font-size: 1.6rem; font-weight: 800; margin-bottom: 8px; }
.nfo-hero-sub { font-size: .85rem; color: var(--muted); line-height: 1.6; max-width: 640px; }

.nfo-tabs-wrap { display: flex; flex-direction: column; gap: 20px; }
.nfo-tabs { display: flex; gap: 8px; border-bottom: 1.5px solid var(--border); }
.nfo-tab {
  padding: 8px 16px; border: none; background: none; cursor: pointer;
  font-family: 'Raleway', sans-serif; font-size: .82rem; font-weight: 700;
  color: var(--muted); border-bottom: 2px solid transparent; margin-bottom: -1.5px;
  transition: color .15s, border-color .15s;
}
.nfo-tab.active { color: var(--g1); border-bottom-color: var(--g1); }

.nfo-empty-state {
  padding: 32px 20px; text-align: center; background: var(--s2);
  border: 1.5px dashed var(--border); border-radius: 12px;
}
.nfo-empty-state p { font-size: .88rem; color: var(--muted); margin-bottom: 10px; }
.nfo-empty-state a { font-size: .85rem; font-weight: 700; color: var(--g1); text-decoration: none; }

.nfo-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
.nfo-card {
  display: block; background: var(--surface); border: 1.5px solid var(--border);
  border-radius: 14px; padding: 16px; text-decoration: none; color: var(--text);
  transition: border-color .15s, transform .15s;
}
.nfo-card:hover { border-color: var(--g1); transform: translateY(-2px); }
.nfo-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.nfo-card-logo { width: 32px; height: 32px; border-radius: 8px; object-fit: contain; background: #fff; }
.nfo-card-logo-fallback {
  width: 32px; height: 32px; border-radius: 8px; background: var(--s2);
  display: flex; align-items: center; justify-content: center;
  font-weight: 800; font-size: .85rem; color: var(--muted);
}
.nfo-card-category {
  font-size: .62rem; font-weight: 800; letter-spacing: .4px; text-transform: uppercase;
  color: var(--muted); background: var(--s2); border-radius: 6px; padding: 3px 8px;
}
.nfo-card-name { font-size: .95rem; font-weight: 800; margin-bottom: 3px; line-height: 1.3; }
.nfo-card-amc { font-size: .74rem; color: var(--muted); margin-bottom: 10px; }
.nfo-card-facts { display: flex; flex-direction: column; gap: 2px; font-size: .72rem; color: var(--muted); margin-bottom: 10px; }
.nfo-card-bottom { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.nfo-card-min { font-family: 'JetBrains Mono', monospace; font-size: .72rem; font-weight: 700; color: var(--text); }
.nfo-chip {
  font-size: .68rem; font-weight: 800; padding: 3px 9px; border-radius: 20px;
  background: var(--g-xlight); color: var(--g1); white-space: nowrap;
}
```

- [ ] **Step 6: Build and manually verify**

Run: `npm run build`
Expected: clean build, no errors for the new `/nfo` route.

Then run `npm run dev` and visit `http://localhost:3000/nfo`:
- Confirm real MF NFO cards render with correct dates/logo/category.
- Click the "SIF" tab — confirm the honest empty state renders (real state at plan time, not simulated) with a working link to `/sifs`.
- Confirm the "Closes in Nd" chip shows a sane number for at least one real card.

- [ ] **Step 7: Commit**

```bash
git add app/nfo/page.jsx app/nfo/NfoFilterTabs.jsx lib/metadata.js app/globals.css
git commit -m "feat(nfo): add /nfo listing page with MF/SIF filter tabs"
```

---

### Task 6: Detail page (`/nfo/[slug]`)

**Files:**
- Create: `app/nfo/[slug]/page.jsx`
- Modify: `app/globals.css` (append `.nfo-*` detail-page class block)

**Interfaces:**
- Consumes: `getNfoBySlug(slug)` from `@/lib/nfoData` (Task 3); `getProviderLogo(type, name)` from `@/lib/providerLogos`; `pool` (default export) from `@/lib/db`; `Navbar`/`Footer`.
- Produces: the `/nfo/[slug]` route — read by Task 7's sitemap only insofar as Task 7 generates matching URLs; no other task imports from this one.

- [ ] **Step 1: Read the file this task mirrors**

Read `app/sif/[id]/page.js` in full (already read during planning) — this task adapts its `generateMetadata` + JSON-LD + `notFound()` shape, adding a time-bound `offers` block (this page's data has open/close dates; `sif/[id]`'s does not) and a `status: 'closed'` still-renders-with-a-banner path instead of `notFound()`.

- [ ] **Step 2: Write `app/nfo/[slug]/page.jsx`**

```jsx
import { notFound } from 'next/navigation';
import { getNfoBySlug } from '@/lib/nfoData';
import { getProviderLogo } from '@/lib/providerLogos';
import pool from '@/lib/db';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

export const dynamic = 'force-dynamic';

function formatDate(d) {
  if (!d) return null;
  return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Strips plan/option noise so a scheme name matches however mf_screener/
// sif_screener happen to store it -- same idea as lib/holdingsLookup.js's
// cleanSearchTerm(), kept local here since this task's match is a single,
// narrowly-scoped lookup rather than a shared concern.
function cleanSearchTerm(name) {
  return (name || '')
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/\b(Direct|Regular|Growth|Plan|Fund)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Best-effort, read-only cross-link to an existing live fund page -- the
// ONE place this feature touches Postgres, deliberately scoped: a single
// indexed name-match SELECT on a low-traffic detail page, same risk class
// as the lookups lib/holdingsLookup.js already does today (not the
// personalized/high-concurrency pattern that caused past incidents).
// Never fabricates a link -- returns null on any miss or error.
async function findLiveFundLink(schemeName, type) {
  const term = cleanSearchTerm(schemeName);
  if (term.length < 3) return null;
  try {
    if (type === 'sif') {
      const { rows } = await pool.query(
        `SELECT scheme_id FROM sif_screener WHERE nav_name ILIKE $1 ORDER BY length(nav_name) ASC LIMIT 1`,
        [`%${term}%`]
      );
      return rows.length ? `/sif/${rows[0].scheme_id}` : null;
    }
    const { rows } = await pool.query(
      `SELECT code FROM mf_screener WHERE name ILIKE $1 ORDER BY length(name) ASC LIMIT 1`,
      [`%${term}%`]
    );
    return rows.length ? `/fund/${rows[0].code}` : null;
  } catch (e) {
    console.warn('[nfo/[slug]] live-fund lookup failed:', e.message);
    return null;
  }
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const entry = await getNfoBySlug(slug);
  if (!entry) {
    return { title: 'NFO Not Found | Abundance', robots: { index: false, follow: false } };
  }

  const title = `${entry.schemeName} NFO — Open Date, Price & Minimum Investment | Abundance`;
  const description =
    `${entry.schemeName} is a ${entry.status === 'open' ? 'currently open' : 'recently closed'} ` +
    `New Fund Offer from ${entry.amcName || 'the AMC'}${entry.category ? ` (${entry.category})` : ''}. ` +
    `${entry.openDate ? `Opened ${formatDate(entry.openDate)}. ` : ''}` +
    `${entry.closeDate ? `Closes ${formatDate(entry.closeDate)}. ` : ''}` +
    `Offer price ₹${entry.offerPrice ?? 10} per unit, minimum investment ₹${entry.minInvestment ?? '—'}.`;

  const canonicalUrl = `https://mfcalc.getabundance.in/nfo/${entry.slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'FinancialProduct',
        name: entry.schemeName,
        description,
        provider: { '@type': 'Organization', name: entry.amcName },
        url: canonicalUrl,
        category: entry.category || entry.schemeType,
        identifier: entry.schemeId,
        offers: {
          '@type': 'Offer',
          price: entry.offerPrice,
          priceCurrency: 'INR',
          validFrom: entry.openDate,
          validThrough: entry.closeDate,
        },
      },
    ],
  };

  return {
    title,
    description,
    alternates: { canonical: canonicalUrl },
    openGraph: { title, description, type: 'website', url: canonicalUrl },
    twitter: { card: 'summary', title, description },
    robots: { index: true, follow: true },
    other: { 'script:ld+json': JSON.stringify(jsonLd) },
  };
}

export default async function NfoDetailPage({ params }) {
  const { slug } = await params;
  const entry = await getNfoBySlug(slug);
  if (!entry) notFound();

  const logo = getProviderLogo(entry.type, entry.amcName);
  const liveLink = await findLiveFundLink(entry.schemeName, entry.type);

  return (
    <>
      <Navbar />
      <main className="nfo-detail container">
        <a href="/nfo" className="nfo-back-link">← All NFOs</a>

        <header className="nfo-detail-header">
          {logo && <img src={logo} alt={entry.amcName || ''} className="nfo-detail-logo" />}
          <div>
            <h1>{entry.schemeName}</h1>
            <p className="nfo-detail-amc">{entry.amcName} · {entry.category || entry.schemeType}</p>
          </div>
        </header>

        {entry.status === 'closed' && (
          <div className="nfo-closed-banner">
            This NFO closed on {formatDate(entry.closeDate)} and is no longer accepting subscriptions.
          </div>
        )}

        {entry.objective && <p className="nfo-detail-objective">{entry.objective}</p>}

        <table className="nfo-facts-table">
          <tbody>
            <tr><th>Category</th><td>{entry.category || '—'}</td></tr>
            <tr><th>Scheme type</th><td>{entry.schemeType || '—'}</td></tr>
            <tr><th>Offer price</th><td>{entry.offerPrice != null ? `₹${entry.offerPrice}` : '—'}</td></tr>
            <tr><th>Minimum investment</th><td>{entry.minInvestment != null ? `₹${new Intl.NumberFormat('en-IN').format(entry.minInvestment)}` : '—'}</td></tr>
            <tr><th>Opens</th><td>{formatDate(entry.openDate) || '—'}</td></tr>
            <tr><th>Closes</th><td>{formatDate(entry.closeDate) || '—'}</td></tr>
            <tr><th>Fund house</th><td>{entry.amcName || '—'}</td></tr>
          </tbody>
        </table>

        <div className="nfo-detail-links">
          {entry.infoDocumentUrl && (
            <a href={entry.infoDocumentUrl} target="_blank" rel="noopener noreferrer" className="nfo-external-link">
              📄 Official Offer Document (PDF) ↗
            </a>
          )}
          {entry.amcWebsite && (
            <a href={entry.amcWebsite} target="_blank" rel="noopener noreferrer" className="nfo-external-link">
              🔗 {entry.amcName} Website ↗
            </a>
          )}
          {liveLink && (
            <a href={liveLink} className="nfo-external-link">
              📊 View Full Analysis →
            </a>
          )}
        </div>

        <a href="/book-consultation" className="nfo-cta-button">Talk to an Advisor</a>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 3: Append the detail-page CSS block to `app/globals.css`**

```css
/* ── NFO Tracker — Detail Page ── */
.nfo-back-link { display: inline-block; font-size: .8rem; font-weight: 700; color: var(--muted); text-decoration: none; margin-bottom: 16px; }
.nfo-detail-header { display: flex; align-items: center; gap: 14px; margin-bottom: 16px; }
.nfo-detail-logo { width: 48px; height: 48px; border-radius: 10px; object-fit: contain; background: #fff; border: 1px solid var(--border); }
.nfo-detail-header h1 { font-size: 1.4rem; font-weight: 800; margin-bottom: 2px; }
.nfo-detail-amc { font-size: .82rem; color: var(--muted); }

.nfo-closed-banner {
  background: var(--s2); border: 1.5px solid var(--border); border-left: 4px solid var(--muted);
  border-radius: 10px; padding: 12px 16px; font-size: .82rem; color: var(--text); margin-bottom: 16px;
}

.nfo-detail-objective { font-size: .88rem; line-height: 1.65; color: var(--text); margin-bottom: 20px; }

.nfo-facts-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: .82rem; }
.nfo-facts-table th { text-align: left; padding: 9px 12px; color: var(--muted); font-weight: 700; width: 40%; border-bottom: 1px solid var(--border); }
.nfo-facts-table td { padding: 9px 12px; font-weight: 600; border-bottom: 1px solid var(--border); font-family: 'JetBrains Mono', monospace; }

.nfo-detail-links { display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }
.nfo-external-link {
  font-size: .82rem; font-weight: 700; color: var(--g1); text-decoration: none;
  padding: 10px 14px; background: var(--s2); border-radius: 10px; border: 1px solid var(--border);
}

.nfo-cta-button {
  display: inline-block; padding: 12px 24px; background: var(--g1); color: #fff;
  font-weight: 800; font-size: .85rem; text-decoration: none; border-radius: 10px;
}
```

- [ ] **Step 4: Build and manually verify**

Run: `npm run build`
Expected: clean build, no errors for the new `/nfo/[slug]` route.

Then run `npm run dev` and:
- Visit `/nfo/<a real open NFO's slug from Task 1's verification>` — confirm the key-facts table, objective, external links (PDF + AMC site, both opening in a new tab), and the "Talk to an Advisor" CTA (pointing at `/book-consultation`) all render correctly.
- Visit `/nfo/this-slug-does-not-exist` — confirm Next's standard 404 page renders (`notFound()` path).
- Temporarily hand-edit one entry in the local R2 document to `status: "closed"` (via a throwaway script using `r2Get`/`r2Put` against the dev environment) and confirm its detail page shows the closed banner instead of 404ing, then restore the real synced document afterward (re-run `node scripts/sync_amfi_nfo.js`).
- Validate the JSON-LD block by viewing page source and pasting the `<script type="application/ld+json">` contents into a structured-data validator.

- [ ] **Step 5: Commit**

```bash
git add "app/nfo/[slug]/page.jsx" app/globals.css
git commit -m "feat(nfo): add /nfo/[slug] detail page with SEO + best-effort fund cross-link"
```

---

### Task 7: SEO plumbing (sitemap + robots)

**Files:**
- Create: `app/sitemap-nfo.xml/route.js`
- Modify: `app/robots.js`

**Interfaces:**
- Consumes: `getNfoData()` from `@/lib/nfoData` (Task 3).
- Produces: `/sitemap-nfo.xml`, and one new entry in `robots.js`'s `sitemap` array.

- [ ] **Step 1: Read the files this task mirrors**

Read `app/sitemap-funds.xml/route.js` and `app/robots.js` in full (already read during planning) — this task copies the XML-template + `revalidate` + `Cache-Control` shape, reading from `getNfoData()` instead of Postgres.

- [ ] **Step 2: Write `app/sitemap-nfo.xml/route.js`**

```js
// app/sitemap-nfo.xml/route.js — dedicated sitemap for the NFO tracker.
// Reads the R2-cached NFO document (no Postgres), same pattern as
// sitemap-funds.xml but sourced from lib/nfoData.js instead of mf_screener.

import { getNfoData } from '@/lib/nfoData';

export const revalidate = 86400;

export async function GET() {
  const BASE = 'https://mfcalc.getabundance.in';
  try {
    const data = await getNfoData();
    const all = [...(data.mf || []), ...(data.sif || [])];
    const today = new Date().toISOString().split('T')[0];

    const entryUrls = all
      .map(
        (e) => `  <url>
    <loc>${BASE}/nfo/${e.slug}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${e.status === 'open' ? 0.7 : 0.3}</priority>
  </url>`
      )
      .join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${BASE}/nfo</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.75</priority>
  </url>
${entryUrls}
</urlset>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
      },
    });
  } catch (err) {
    console.error('[sitemap-nfo.xml]', err.message);
    const emptyXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
</urlset>`;
    return new Response(emptyXml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
  }
}
```

- [ ] **Step 3: Add the sitemap entry to `app/robots.js`**

In the existing `sitemap` array, add one line so it reads:

```js
    sitemap: [
      'https://mfcalc.getabundance.in/sitemap.xml',
      'https://mfcalc.getabundance.in/sitemap-funds.xml',
      'https://mfcalc.getabundance.in/sitemap-pms.xml',
      'https://mfcalc.getabundance.in/sitemap-nfo.xml',
    ],
```

No change is needed to the `allow`/`disallow` rules — `/nfo` and `/nfo/*` are public pages already covered by the blanket `'/'` allow rule.

- [ ] **Step 4: Build and manually verify**

Run: `npm run build`
Expected: clean build.

Then run `npm run dev` and:
- `curl http://localhost:3000/sitemap-nfo.xml` — confirm it returns valid XML with a `<url>` for `/nfo` plus one per real synced entry.
- `curl http://localhost:3000/robots.txt` — confirm `sitemap-nfo.xml` appears in the `Sitemap:` lines.

- [ ] **Step 5: Commit**

```bash
git add app/sitemap-nfo.xml/route.js app/robots.js
git commit -m "feat(nfo): add sitemap-nfo.xml and register it in robots.js"
```

---

### Task 8: Navigation entry

**Files:**
- Modify: `components/Navbar.jsx`

**Interfaces:**
- Consumes: nothing new (purely additive config entry).
- Produces: nothing consumed by other tasks — this is the final, smallest task.

- [ ] **Step 1: Add the entry to the `market` group**

In `components/Navbar.jsx`'s `NAV_GROUPS` array, in the `market` group's `items`, add this entry immediately after the `industry` entry:

```js
      { key: 'nfo',          label: '🆕 New Fund Offers', href: '/nfo',            desc: 'Live MF & SIF NFOs open for subscription' },
```

So the `market` group's `items` reads:

```js
    items: [
      { key: 'pioneers',     label: '🏛️ 30-Year Club',   href: '/pioneers',       desc: "India's oldest funds & 30-year wealth pioneers" },
      { key: 'market-watch', label: '📡 Market Watch',    href: '/market-watch',   desc: 'Live indices and sector moves' },
      { key: 'breadth',      label: '📊 Market Breadth',  href: '/market-breadth', desc: 'Advance/decline and highs-lows' },
      { key: 'indices',      label: '📊 Index Dashboard', href: '/indices',        desc: 'Nifty and benchmark indices' },
      { key: 'industry',     label: '📈 Industry Pulse',  href: '/industry',       desc: 'Sector-wise fund flows' },
      { key: 'nfo',          label: '🆕 New Fund Offers', href: '/nfo',            desc: 'Live MF & SIF NFOs open for subscription' },
      { key: 'report',       label: '📋 Report Card',     href: '/report',         desc: 'Shareable monthly AUM report card' },
      { key: 'geography',    label: '🗺 Geography',       href: '/geography',      desc: 'State-wise AUM distribution' },
    ],
```

- [ ] **Step 2: Build and manually verify**

Run: `npm run build`
Expected: clean build.

Then run `npm run dev` and confirm the "Market Data" dropdown shows "🆕 New Fund Offers" between "Industry Pulse" and "Report Card", both on desktop (mega-menu) and mobile (hamburger panel) — and that the command palette (Ctrl/Cmd+K) can find it, since `NAV_ITEMS` is derived from `NAV_GROUPS` automatically.

- [ ] **Step 3: Commit**

```bash
git add components/Navbar.jsx
git commit -m "feat(nfo): add New Fund Offers entry to the Market Data nav group"
```
