# Scheme Lineage — Backtest Pre-Merger History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `app/backtest/page.js`'s existing pre-merger-history mechanism (currently hand-curated for one merger) to cover the ~70 scheme-level "merged into" pairs documented in the user's AMC merger reference file, so funds that absorbed a predecessor scheme show their true, longer track record in backtest.

**Architecture:** Extract the existing `stitchSeries()` rebase function into a new `lib/schemeLineage.js`, alongside a new `walkLineage()` that walks a chain of mergers hop-by-hop (each hop independently boundary-checked, same safety net as today). The curated `LINEAGE` map moves from an inline object in `app/backtest/page.js` to `data/scheme-lineage.json`. A one-time resolution script (`scripts/resolve_scheme_lineage.js`) resolves old/new scheme codes from the reference file and writes a review file — nothing is auto-merged into the data file without a human reading it first.

**Tech Stack:** Next.js 16 App Router, React 19, plain Node + `assert` tests (`node tests/<file>.test.js`), no new dependencies.

## Global Constraints

- "Renamed to" entries in the reference file need no lineage entry — confirmed live that a pure SEBI rename keeps the same AMFI scheme code, so mfapi.in already serves continuous history.
- Every splice — single-hop or multi-hop — must pass the exact same boundary check already in production: date gap `> 0 && <= 12` days, NAV ratio at the boundary `> 0.85 && < 1.2`. A failed hop stops the chain there; it never fabricates a splice.
- The resolution script never writes directly to `data/scheme-lineage.json` — only to a review file. Entries are hand-merged after a human reads it.
- Wound-up-with-no-successor chains (Sahara, CRB, and First India → Sahara) are excluded entirely — nothing to attach history to.
- This stays scoped to `app/backtest/page.js` — no changes to Screener or Proposal Studio, neither of which renders a NAV history chart today.
- The resolution script is manually triggered, not scheduled — AMC mergers are rare, discrete events.

---

## File Structure

- **Create** `docs/mf-amc-merger-reference.txt` — the user's reference file, copied into the repo so it's version-controlled and script-readable.
- **Create** `lib/schemeLineage.js` — `stitchSeries(current, pred)` (moved verbatim from `app/backtest/page.js`) and new `walkLineage({series, code, lineage, fetchPredecessor, normalize})` (multi-hop chain walker). CommonJS (`module.exports`), matching this repo's existing dual-purpose lib pattern (`lib/portfolioAnalysis.js`, `lib/proposalShareToken.js`) so it's importable both via Next's `import` (`app/backtest/page.js`, `scripts/resolve_scheme_lineage.js`) and plain `node`/`require` (`tests/schemeLineage.test.js`). This extraction is necessary, not optional: `stitchSeries` currently lives as an unexported local function inside a `'use client'` page component, which can't be unit-tested at all under this repo's plain-Node test convention — moving it into an importable lib file is the only way to satisfy the spec's explicit testing requirement.
- **Test** `tests/schemeLineage.test.js` — covers `stitchSeries`'s boundary math and `walkLineage`'s multi-hop chaining (clean chain, a hop that fails partway through, no lineage entry at all).
- **Create** `data/scheme-lineage.json` — the curated lineage map, seeded with the 2 existing JPMorgan → Edelweiss entries migrated verbatim from `app/backtest/page.js`. Same shape as today's inline `LINEAGE` object: `{ "<currentCode>": { "pred": <predecessorCode>, "from": "<predecessor name>" }, ... }`.
- **Modify** `app/backtest/page.js` — removes the inline `LINEAGE`/`stitchSeries` definitions, imports both from the new files instead, and updates `loadSeries()` (single-hop → multi-hop via `walkLineage`) plus the two places that build a chart's splice-marker array (`r.splices` and the drawer's `splices`) to flatten across all hops instead of just the first one.
- **Create** `scripts/resolve_scheme_lineage.js` — one-time, manually-run resolution script. Contains the transcribed `{oldName, newName, mergerDate}` input list (from the reference file), resolves codes via mfapi.in search + AMFI's historical NAV report, pre-flight-checks every candidate with `stitchSeries`, and writes `data/scheme-lineage.review.md` for human review. Exports its pure parsing helpers for testing.
- **Test** `tests/resolveSchemeLineage.test.js` — covers the script's pure AMFI-report-parsing logic (no network).

---

### Task 1: Copy the reference file into the repo

**Files:**
- Create: `docs/mf-amc-merger-reference.txt`

**Interfaces:**
- Produces: a version-controlled copy of the user's merger reference file, read by `scripts/resolve_scheme_lineage.js` (Task 5) only as background documentation — that script's actual input list is transcribed directly into its own source, not parsed from this file at runtime.

- [ ] **Step 1: Copy the file**

Copy the user's file from `C:\Users\Atin\Desktop\mf_AMC_merger.txt` to `docs/mf-amc-merger-reference.txt` in the repo, preserving its content exactly as-is (it documents 27 AMC merger/acquisition/rebranding events, 1993–2026, with scheme-level detail — "Renamed to" vs "Merged into"/"Restructured into" per scheme).

- [ ] **Step 2: Commit**

```bash
git add docs/mf-amc-merger-reference.txt
git commit -m "docs: add AMC merger reference file for scheme lineage resolution"
```

---

### Task 2: `data/scheme-lineage.json` — seed the lineage data file

**Files:**
- Create: `data/scheme-lineage.json`

**Interfaces:**
- Produces: the lineage lookup table, `{ [currentCode: string]: { pred: number, from: string } }`. Consumed by `app/backtest/page.js` (Task 4, as `LINEAGE`) and read (for context only) by `scripts/resolve_scheme_lineage.js` (Task 5).

This migrates the 2 existing entries currently hardcoded in `app/backtest/page.js` (lines 183-186) verbatim — no new entries yet, those come from the manual resolution-and-review step after Task 5's script runs (see "Manual Follow-Up" at the end of this plan).

- [ ] **Step 1: Create the file**

```json
{
  "140225": { "pred": 107301, "from": "JPMorgan India Mid and Small Cap Fund (Regular)" },
  "140228": { "pred": 119869, "from": "JPMorgan India Mid and Small Cap Fund (Direct)" }
}
```

- [ ] **Step 2: Verify it's valid JSON**

Run: `node -e "console.log(Object.keys(require('./data/scheme-lineage.json')).length)"`
Expected: `2`

- [ ] **Step 3: Commit**

```bash
git add data/scheme-lineage.json
git commit -m "feat(backtest): externalize scheme lineage data into data/scheme-lineage.json"
```

---

### Task 3: `lib/schemeLineage.js` — extract `stitchSeries` and add `walkLineage`

**Files:**
- Create: `lib/schemeLineage.js`
- Test: `tests/schemeLineage.test.js`

**Interfaces:**
- Produces: `stitchSeries(current, pred)` → `{ series, spliceDate, from } | null` (identical behavior to today's `app/backtest/page.js:191-201`); `walkLineage({ series, code, lineage, fetchPredecessor, normalize })` → `Promise<{ series, stitchInfo } | null>`, where `stitchInfo = { spliceDate, from, fromName, hops: [{spliceDate, from, fromName}, ...] }` (nearest hop first, oldest last). Both consumed by `app/backtest/page.js` (Task 4) and `scripts/resolve_scheme_lineage.js` (Task 5, `stitchSeries` only).
- Consumes: nothing external — `fetchPredecessor` and `normalize` are injected by the caller specifically so `walkLineage` stays testable without live network calls (same dependency-injection pattern this repo already uses for `lib/proposalShareToken.js`'s `ensureShareToken(pool, id)`).

- [ ] **Step 1: Write the failing tests**

Create `tests/schemeLineage.test.js`:

```js
// tests/schemeLineage.test.js
//
// Unit tests for lib/schemeLineage.js's boundary-check rebase math and
// multi-hop chain walker.
// Run with: node tests/schemeLineage.test.js

const assert = require('assert');
const { stitchSeries, walkLineage } = require('../lib/schemeLineage');

console.log('=== Running Scheme Lineage Unit Tests ===\n');

let passed = 0;
let failed = 0;

async function test(name, fn) {
  try {
    await fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${e.message}`);
    failed++;
  }
}

const DAY = 86400000;
function series(points) {
  // points: [[dayOffset, nav], ...]
  return points.map(([d, nav]) => ({ t: d * DAY, nav }));
}

async function main() {
  await test('stitchSeries splices a clean boundary, rescaling the predecessor to meet the current series', () => {
    const current = series([[100, 20], [101, 20.5]]);
    const pred = series([[95, 19.6], [99, 19.8]]);
    const result = stitchSeries(current, pred);
    assert.ok(result);
    assert.strictEqual(result.spliceDate, current[0].t);
    assert.strictEqual(result.from, pred[0].t);
    const k = 20 / 19.8;
    assert.ok(Math.abs(result.series[0].nav - 19.6 * k) < 1e-9);
    assert.strictEqual(result.series.length, pred.length + current.length);
  });

  await test('stitchSeries refuses a gap larger than 12 days', () => {
    const current = series([[100, 20]]);
    const pred = series([[80, 19]]); // 20-day gap
    assert.strictEqual(stitchSeries(current, pred), null);
  });

  await test('stitchSeries refuses a boundary ratio outside 0.85-1.2', () => {
    const current = series([[100, 20]]);
    const pred = series([[99, 10]]); // ratio 2.0
    assert.strictEqual(stitchSeries(current, pred), null);
  });

  await test('stitchSeries refuses when there is no room before the current series starts', () => {
    const current = series([[100, 20]]);
    const pred = series([[99, 19.8], [100, 20]]); // nothing strictly before cFirst.t
    assert.strictEqual(stitchSeries(current, pred), null);
  });

  await test('walkLineage splices a single hop when only one exists', async () => {
    const current = series([[100, 20]]);
    const predRaw = [{ t: 99, nav: 19.8 }];
    const lineage = { A: { pred: 'B', from: 'Predecessor B' } };
    const resolved = await walkLineage({
      series: current,
      code: 'A',
      lineage,
      fetchPredecessor: async (code) => (code === 'B' ? predRaw : null),
      normalize: (raw) => raw.map((r) => ({ t: r.t * DAY, nav: r.nav })),
    });
    assert.ok(resolved);
    assert.strictEqual(resolved.stitchInfo.hops.length, 1);
    assert.strictEqual(resolved.stitchInfo.fromName, 'Predecessor B');
    assert.strictEqual(resolved.stitchInfo.spliceDate, current[0].t);
  });

  await test('walkLineage chains through multiple hops, combining names and reaching the oldest date', async () => {
    const current = series([[200, 30]]);
    const bRaw = [{ t: 199, nav: 29.7 }];
    const cRaw = [{ t: 150, nav: 25 }];
    const lineage = {
      A: { pred: 'B', from: 'Fund B' },
      B: { pred: 'C', from: 'Fund C' },
    };
    const resolved = await walkLineage({
      series: current,
      code: 'A',
      lineage,
      fetchPredecessor: async (code) => {
        if (code === 'B') return bRaw;
        if (code === 'C') return cRaw;
        return null;
      },
      normalize: (raw) => raw.map((r) => ({ t: r.t * DAY, nav: r.nav })),
    });
    assert.ok(resolved);
    assert.strictEqual(resolved.stitchInfo.hops.length, 2);
    assert.strictEqual(resolved.stitchInfo.fromName, 'Fund B ← Fund C');
    assert.strictEqual(resolved.stitchInfo.from, cRaw[0].t * DAY);
  });

  await test('walkLineage stops at a hop that fails the boundary check, keeping the earlier hop', async () => {
    const current = series([[200, 30]]);
    const bRaw = [{ t: 199, nav: 29.7 }]; // hop 1: clean (1-day gap)
    const cRaw = [{ t: 50, nav: 29.7 }];  // hop 2: 149-day gap from hop 1's first point -- fails
    const lineage = {
      A: { pred: 'B', from: 'Fund B' },
      B: { pred: 'C', from: 'Fund C' },
    };
    const resolved = await walkLineage({
      series: current,
      code: 'A',
      lineage,
      fetchPredecessor: async (code) => {
        if (code === 'B') return bRaw;
        if (code === 'C') return cRaw;
        return null;
      },
      normalize: (raw) => raw.map((r) => ({ t: r.t * DAY, nav: r.nav })),
    });
    assert.ok(resolved);
    assert.strictEqual(resolved.stitchInfo.hops.length, 1);
    assert.strictEqual(resolved.stitchInfo.fromName, 'Fund B');
  });

  await test('walkLineage returns null when the fetch for the predecessor fails', async () => {
    const resolved = await walkLineage({
      series: series([[100, 20]]),
      code: 'A',
      lineage: { A: { pred: 'B', from: 'Fund B' } },
      fetchPredecessor: async () => { throw new Error('network error'); },
      normalize: (raw) => raw,
    });
    assert.strictEqual(resolved, null);
  });

  await test('walkLineage returns null when the starting code has no lineage entry', async () => {
    const resolved = await walkLineage({
      series: series([[100, 20]]),
      code: 'Z',
      lineage: {},
      fetchPredecessor: async () => null,
      normalize: (raw) => raw,
    });
    assert.strictEqual(resolved, null);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node tests/schemeLineage.test.js`
Expected: fails immediately with a module-not-found error (`lib/schemeLineage.js` doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `lib/schemeLineage.js`:

```js
/**
 * lib/schemeLineage.js
 *
 * Pre-merger scheme history for app/backtest/page.js: rebasing a
 * predecessor scheme's NAV series onto its successor's, and walking a
 * chain of such mergers backward as far as verified links go. See
 * docs/superpowers/specs/2026-08-07-scheme-lineage-backtest-history-design.md.
 *
 * CommonJS (module.exports), matching lib/portfolioAnalysis.js and
 * lib/proposalShareToken.js's dual-purpose style -- importable both via
 * Next's `import` (app/backtest/page.js, scripts/resolve_scheme_lineage.js)
 * and plain `node`/`require` (tests/schemeLineage.test.js).
 */

const DAY = 86400000;

// Return-link a predecessor series onto a current one: scale the predecessor
// so its last NAV meets the current series' first NAV (preserving
// predecessor RETURNS, not absolute NAV). Only applied if the boundary is
// genuinely continuous -- a small date gap and a sane NAV ratio -- so a
// wrong pairing can't fabricate history. Moved verbatim from
// app/backtest/page.js, unchanged.
function stitchSeries(current, pred) {
  if (!pred || pred.length < 2 || !current.length) return null;
  const cFirst = current[0], pLast = pred[pred.length - 1];
  const gapDays = (cFirst.t - pLast.t) / DAY;
  const ratio = cFirst.nav / pLast.nav;
  if (!(gapDays > 0 && gapDays <= 12 && ratio > 0.85 && ratio < 1.2)) return null; // not a clean transfer
  const k = cFirst.nav / pLast.nav;
  const head = pred.filter((p) => p.t < cFirst.t).map((p) => ({ t: p.t, nav: p.nav * k }));
  if (!head.length) return null;
  return { series: [...head, ...current], spliceDate: cFirst.t, from: pred[0].t };
}

// Walks a lineage chain backward from `code` via `lineage` (shaped like
// data/scheme-lineage.json: { [code]: { pred, from } }), splicing each
// verified predecessor hop onto `series` in turn via stitchSeries. Stops at
// the first hop with no further lineage entry, a failed predecessor fetch,
// or a failed boundary check -- keeping every earlier hop that DID verify,
// so one broken link in a long chain doesn't discard the hops closer to
// today. `fetchPredecessor(code)` and `normalize(raw)` are injected so this
// stays testable without live network calls -- the real caller in
// app/backtest/page.js passes a fetchPredecessor that hits /api/mf?code=
// and a normalize that matches its own normSeries(raw, "mf").
async function walkLineage({ series, code, lineage, fetchPredecessor, normalize }) {
  const hops = [];
  let cur = series;
  let curCode = code;
  while (lineage[curCode]) {
    const { pred, from } = lineage[curCode];
    let predRaw;
    try {
      predRaw = await fetchPredecessor(pred);
    } catch (e) {
      break;
    }
    if (!predRaw || !predRaw.length) break;
    const predSeries = normalize(predRaw);
    const st = stitchSeries(cur, predSeries);
    if (!st) break;
    hops.push({ spliceDate: st.spliceDate, from: st.from, fromName: from });
    cur = st.series;
    curCode = pred;
  }
  if (!hops.length) return null;
  return {
    series: cur,
    stitchInfo: {
      spliceDate: hops[0].spliceDate,
      from: hops[hops.length - 1].from,
      fromName: hops.map((h) => h.fromName).join(' ← '),
      hops,
    },
  };
}

module.exports = { stitchSeries, walkLineage };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node tests/schemeLineage.test.js`
Expected: `9 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add lib/schemeLineage.js tests/schemeLineage.test.js
git commit -m "feat(backtest): extract stitchSeries and add multi-hop lineage walker"
```

---

### Task 4: Wire `app/backtest/page.js` to the extracted lib and data file

**Files:**
- Modify: `app/backtest/page.js:178-201` (remove inline `LINEAGE`/`stitchSeries`, add imports), `:356-364` (single-hop splice → `walkLineage` call), `:401-402` (`r.splices` construction), `:793` (drawer `splices` construction)

**Interfaces:**
- Consumes: `stitchSeries`, `walkLineage` from `./lib/schemeLineage` (Task 3); `LINEAGE` data from `./data/scheme-lineage.json` (Task 2).
- Produces: no new exports — this task only changes `app/backtest/page.js`'s internal behavior. The `stitchInfo` shape stored on each loaded fund (`obj.stitch`, set at line 373) becomes `{ spliceDate, from, fromName, hops: [...] }` instead of `{ spliceDate, from, fromName }` — every other consumer of `.stitch`/`.fromName`/`.from`/`.spliceDate` in this file (the results-summary note at line 589, the drawer note at lines 822/827, the PDF export note at lines 849-850) reads those same three scalar field names unchanged, since `fromName` now already contains the full chain (e.g. `"Reliance ETF Nifty BeES ← Goldman Sachs Nifty BeES ← Benchmark Nifty BeES"`) and `from`/`spliceDate` already resolve to the oldest/nearest dates respectively — **no edits needed at those line numbers**, only the two places listed above that build a `splices` *array* for the `Chart` component's multiple dashed markers.

**Before starting:** read `app/backtest/page.js` in full (or at minimum lines 1-410 and 780-900) to confirm the line numbers below still match — this file has not been touched by any other task in this plan, so they should, but confirm by content before editing, not by number alone.

- [ ] **Step 1: Replace the imports and remove the inline `LINEAGE`/`stitchSeries`**

At the top of `app/backtest/page.js`, after the existing imports (currently ending around line 7 with `import { getMFLogo, getSIFLogo, getMFLogoFromSchemeName } from "@/lib/providerLogos";`), add:

```js
import LINEAGE from "@/data/scheme-lineage.json";
import { walkLineage } from "@/lib/schemeLineage";
```

Then delete the entire block from the comment `/* ---------------- predecessor lineage (verified 1:1 scheme transfers) ----------------` through the end of the `stitchSeries` function (currently lines 178-201 — the `LINEAGE` object and the `stitchSeries` function), since both now come from the imports above.

- [ ] **Step 2: Replace the single-hop splice with a `walkLineage` call**

In `loadSeries(item)`, replace:

```js
      // Pre-merger stitch: prepend the verified predecessor series, return-linked.
      if (stitch && LINEAGE[item.id]) {
        try {
          const pd = await fetchJSON(`/api/mf?code=${LINEAGE[item.id].pred}`);
          if (pd?.data?.length) {
            const st = stitchSeries(series, normSeries(pd.data, "mf"));
            if (st) { series = st.series; stitchInfo = { spliceDate: st.spliceDate, from: st.from, fromName: LINEAGE[item.id].from }; }
          }
        } catch (e) { /* predecessor is optional enrichment — ignore failures */ }
      }
```

with:

```js
      // Pre-merger stitch: walk the lineage chain back through as many
      // verified hops as exist, prepending each predecessor's return-linked
      // series in turn (see lib/schemeLineage.js).
      if (stitch && LINEAGE[item.id]) {
        try {
          const resolved = await walkLineage({
            series,
            code: item.id,
            lineage: LINEAGE,
            fetchPredecessor: async (code) => {
              const pd = await fetchJSON(`/api/mf?code=${code}`);
              return pd?.data?.length ? pd.data : null;
            },
            normalize: (raw) => normSeries(raw, "mf"),
          });
          if (resolved) { series = resolved.series; stitchInfo = resolved.stitchInfo; }
        } catch (e) { /* predecessor is optional enrichment — ignore failures */ }
      }
```

- [ ] **Step 3: Update the results-summary chart's splice markers to include every hop**

In `run()`, replace:

```js
      const stitched = port.filter((p) => p.stitch).map((p) => ({ name: p.name, ...p.stitch }));
      setResult({ ...res, end, port, bench: res.bench, years: (end - res.gridStart) / Y, generatedAt: Date.now(), stitched, splices: [...new Set(stitched.map((s) => s.spliceDate))] });
```

with:

```js
      const stitched = port.filter((p) => p.stitch).map((p) => ({ name: p.name, ...p.stitch }));
      const allSpliceDates = stitched.flatMap((s) => s.hops.map((h) => h.spliceDate));
      setResult({ ...res, end, port, bench: res.bench, years: (end - res.gridStart) / Y, generatedAt: Date.now(), stitched, splices: [...new Set(allSpliceDates)] });
```

- [ ] **Step 4: Update the per-fund drawer's splice markers to include every hop**

In the drawer component (the one rendering `row.stitch` for a single holding's detail view), replace:

```js
  const splices = row.stitch ? [row.stitch.spliceDate] : [];
```

with:

```js
  const splices = row.stitch ? row.stitch.hops.map((h) => h.spliceDate) : [];
```

- [ ] **Step 5: Build check**

Run: `npm run build`
Expected: builds cleanly, no unused-import warnings, no missing-reference errors.

- [ ] **Step 6: Regression check**

Run: `node tests/schemeLineage.test.js`
Expected: `9 passed, 0 failed` (confirms Task 3's extraction didn't break anything this task depends on).

- [ ] **Step 7: Manual smoke test**

Run `npm run dev`, open `/backtest`, add "Edelweiss Mid Cap Fund" (or search for JPMorgan/Edelweiss) with "Include pre-merger history" checked, run the backtest, and confirm: the results-summary note still reads "Pre-merger history linked: Edelweiss Mid Cap Fund ← JPMorgan India Mid and Small Cap Fund (Regular), back to <date>" (same wording as before this task — this is the regression check that the single-hop case is unchanged), the chart shows one dashed splice marker, and the fund's drawer shows the same "(linked)" and "History before..." note as before. This confirms the existing JPMorgan case still works identically after the refactor, before any new multi-hop data exists to test the new behavior.

- [ ] **Step 8: Commit**

```bash
git add app/backtest/page.js
git commit -m "refactor(backtest): use extracted lib/schemeLineage for multi-hop pre-merger splicing"
```

---

### Task 5: `scripts/resolve_scheme_lineage.js` — the resolution script

**Files:**
- Create: `scripts/resolve_scheme_lineage.js`
- Test: `tests/resolveSchemeLineage.test.js`

**Interfaces:**
- Consumes: `stitchSeries` from `../lib/schemeLineage` (Task 3).
- Produces: `parseAmfiHistoricalReport(text)`, `findMatchingRecords(records, schemeName)`, `toAmfiDate(dateStr)` — exported pure functions, consumed only by `tests/resolveSchemeLineage.test.js`. The script's `run()` function is not exported and not consumed by any other code; it's invoked directly via `node scripts/resolve_scheme_lineage.js` (guarded by `if (require.main === module)` so requiring the file for its exports, as the test file does, never triggers a live run) and writes `data/scheme-lineage.review.md` as its only output artifact.

- [ ] **Step 1: Write the failing tests**

Create `tests/resolveSchemeLineage.test.js`:

```js
// tests/resolveSchemeLineage.test.js
//
// Unit tests for scripts/resolve_scheme_lineage.js's pure AMFI-historical-
// report parsing logic. The script's live-network resolution flow (mfapi.in
// search, AMFI historical downloads) can't be unit-tested without live
// credentials/network -- this covers only the parsing, which is pure.
// Run with: node tests/resolveSchemeLineage.test.js

const assert = require('assert');
const { parseAmfiHistoricalReport, findMatchingRecords, toAmfiDate } = require('../scripts/resolve_scheme_lineage');

console.log('=== Running Resolve Scheme Lineage Unit Tests ===\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (e) {
    console.error(`✗ ${name}`);
    console.error(`  Error: ${e.message}`);
    failed++;
  }
}

test('parseAmfiHistoricalReport extracts valid rows and skips header/section/garbage lines', () => {
  const text = [
    'Scheme Code;Scheme Name;ISIN Div Payout/ISIN Growth;ISIN Div Reinvestment;Net Asset Value;Repurchase Price;Sale Price;Date',
    '',
    'Open Ended Schemes ( Money Market )',
    '129220;L&T Emerging Businesses Fund - Direct Plan - Growth;INF917K01QA1;;51.226;;;01-Nov-2022',
    '129223;L&T Emerging Businesses Fund - Regular Plan - Growth;INF917K01QC7;;47.446;;;01-Nov-2022',
    'garbage;not;a;real;row',
  ].join('\n');
  const records = parseAmfiHistoricalReport(text);
  assert.strictEqual(records.length, 2);
  assert.strictEqual(records[0].code, '129220');
  assert.strictEqual(records[0].nav, 51.226);
  assert.strictEqual(records[0].isinGrowth, 'INF917K01QA1');
  assert.strictEqual(records[1].code, '129223');
  assert.strictEqual(records[1].date, '01-Nov-2022');
});

test('parseAmfiHistoricalReport skips rows with a non-positive or non-numeric NAV', () => {
  const text = [
    '129220;Some Fund - Growth;ISIN1;;0;;;01-Nov-2022',
    '129221;Some Fund - Growth;ISIN2;;-5;;;01-Nov-2022',
    '129222;Some Fund - Growth;ISIN3;;N/A;;;01-Nov-2022',
    '129223;Some Fund - Growth;ISIN4;;10.5;;;01-Nov-2022',
  ].join('\n');
  const records = parseAmfiHistoricalReport(text);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].code, '129223');
});

test('findMatchingRecords matches case-insensitively by substring', () => {
  const records = [
    { code: '1', name: 'L&T Emerging Businesses Fund - Direct Plan - Growth' },
    { code: '2', name: 'l&t emerging businesses fund - regular plan - growth' },
    { code: '3', name: 'HSBC Small Cap Fund - Regular Growth' },
  ];
  const matches = findMatchingRecords(records, 'L&T Emerging Businesses Fund');
  assert.strictEqual(matches.length, 2);
});

test('findMatchingRecords returns an empty array when nothing matches', () => {
  const records = [{ code: '1', name: 'HSBC Small Cap Fund - Regular Growth' }];
  assert.deepStrictEqual(findMatchingRecords(records, 'Nonexistent Fund'), []);
});

test('toAmfiDate builds a full-month window from "YYYY-MM"', () => {
  assert.deepStrictEqual(toAmfiDate('2022-11'), { from: '01-Nov-2022', to: '28-Nov-2022' });
});

test('toAmfiDate falls back to January for a year-only date', () => {
  assert.deepStrictEqual(toAmfiDate('2011'), { from: '01-Jan-2011', to: '28-Jan-2011' });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node tests/resolveSchemeLineage.test.js`
Expected: fails immediately with a module-not-found error (`scripts/resolve_scheme_lineage.js` doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `scripts/resolve_scheme_lineage.js`:

```js
/**
 * scripts/resolve_scheme_lineage.js
 *
 * One-time, manually-run script (NOT scheduled -- AMC mergers are rare,
 * discrete events, unlike this repo's other scripts/sync_*.js jobs). For
 * each {oldName, newName, mergerDate} row below, resolves the surviving
 * scheme's current AMFI code(s) via mfapi.in search, resolves the
 * predecessor's dead AMFI code(s) via AMFI's historical NAV report for a
 * window around mergerDate, and pre-flight-checks the boundary with the
 * exact same rule lib/schemeLineage.js's stitchSeries() applies at
 * runtime. Writes a review file -- data/scheme-lineage.review.md -- listing
 * every candidate pairing with its splice date and pass/fail status.
 * NOTHING is written to data/scheme-lineage.json automatically: only
 * entries a human confirms after reading the review file get hand-merged
 * in. See
 * docs/superpowers/specs/2026-08-07-scheme-lineage-backtest-history-design.md.
 *
 * Usage:
 *   node scripts/resolve_scheme_lineage.js
 */

const fs = require('fs');
const path = require('path');
const { stitchSeries } = require('../lib/schemeLineage');

// [oldSchemeName, newSchemeName, mergerDate ("YYYY-MM" or "YYYY")]
// Transcribed from docs/mf-amc-merger-reference.txt. Only "Merged into" /
// "Restructured into" / other non-rename entries are listed here --
// "Renamed to" entries need no lineage entry (same AMFI code, confirmed
// live during design: Bandhan Flexi Cap Fund's history already runs
// continuously back through its 2023 IDFC-era rename). Chains that
// terminate in a wound-up fund with no living successor (Sahara, CRB, and
// First India -> Sahara) are excluded entirely, since there's nothing
// alive to attach history to.
//
// A "newName" that isn't quite the scheme's exact current AMFI-listed name
// is not a correctness risk here -- resolveSurvivingCodes() below only
// ever produces a CANDIDATE if mfapi.in's search actually finds a live
// match AND stitchSeries' boundary check passes; a near-miss name just
// yields an UNRESOLVED row for the reviewer, not a wrong pairing.
const INPUT_PAIRS = [
  // 1. L&T -> HSBC (2022-11)
  ['L&T Midcap Fund', 'HSBC Midcap Fund', '2022-11'],
  ['L&T Flexicap Fund', 'HSBC Flexicap Fund', '2022-11'],
  ['L&T Emerging Businesses Fund', 'HSBC Small Cap Fund', '2022-11'],
  ['L&T Hybrid Equity Fund', 'HSBC Aggressive Hybrid Fund', '2022-11'],
  ['L&T Balanced Advantage Fund', 'HSBC Balanced Advantage Fund', '2022-11'],
  ['L&T Large and Midcap Fund', 'HSBC Large & Mid Cap Fund', '2022-11'],
  ['L&T India Large Cap Fund', 'HSBC Large Cap Fund', '2022-11'],
  ['L&T Short Term Value Fund', 'HSBC Short Duration Fund', '2022-11'],
  ['L&T Resurgent India Corporate Bond Fund', 'HSBC Corporate Bond Fund', '2022-11'],

  // 3. JPMorgan -> Edelweiss (2016-03). The "India Midcap Fund" row may
  // resolve to the same fund as the existing 2-entry seed in
  // data/scheme-lineage.json ("JPMorgan India Mid and Small Cap Fund") --
  // the review step decides whether it's a duplicate or a distinct scheme.
  ['JPMorgan India Equity Fund', 'Edelweiss Large Cap Fund', '2016-03'],
  ['JPMorgan India Top 100 Fund', 'Edelweiss Large Cap Fund', '2016-03'],
  ['JPMorgan India Midcap Fund', 'Edelweiss Mid Cap Fund', '2016-03'],
  ['JPMorgan India Tax Advantage Fund', 'Edelweiss ELSS Tax Saver Fund', '2016-03'],
  ['JPMorgan India Smaller Companies Fund', 'Edelweiss Small Cap Fund', '2016-03'],
  ['JPMorgan India Treasury Fund', 'Edelweiss Liquid Fund', '2016-03'],

  // 5. Principal -> Sundaram (2021-12)
  ['Principal Emerging Bluechip Fund', 'Sundaram Large and Mid Cap Fund', '2021-12'],
  ['Principal Small Cap Fund', 'Sundaram Small Cap Fund', '2021-12'],
  ['Principal Focused Multicap Fund', 'Sundaram Flexi Cap Fund', '2021-12'],
  ['Principal Personal Tax Saver Fund', 'Sundaram Tax Savings Fund', '2021-12'],
  ['Principal Balanced Advantage Fund', 'Sundaram Balanced Advantage Fund', '2021-12'],
  ['Principal Midcap Fund', 'Sundaram Mid Cap Fund', '2021-12'],
  ['Principal Cash Management Fund', 'Sundaram Liquid Fund', '2021-12'],

  // 6. IDBI -> LIC (2023-07)
  ['IDBI Small Cap Fund', 'LIC MF Small Cap Fund', '2023-07'],
  ['IDBI Flexi Cap Fund', 'LIC MF Flexi Cap Fund', '2023-07'],
  ['IDBI Focused 30 Equity Fund', 'LIC MF Focused Fund', '2023-07'],
  ['IDBI Nifty 50 Index Fund', 'LIC MF Nifty 50 Index Fund', '2023-07'],
  ['IDBI Nifty Next 50 Index Fund', 'LIC MF Nifty Next 50 Index Fund', '2023-07'],
  ['IDBI Equity Savings Fund', 'LIC MF Equity Savings Fund', '2023-07'],
  ['IDBI Hybrid Equity Fund', 'LIC MF Aggressive Hybrid Fund', '2023-07'],

  // 7. Benchmark -> Goldman Sachs (2011) -> Reliance (2015) -> Nippon
  // (2019). Each ETF's 3 hops are resolved independently; the runtime
  // multi-hop walker (lib/schemeLineage.js's walkLineage) chains them
  // automatically once all 3 verify against data/scheme-lineage.json.
  ['Benchmark Nifty BeES', 'Goldman Sachs Nifty BeES', '2011'],
  ['Goldman Sachs Nifty BeES', 'Reliance ETF Nifty BeES', '2015'],
  ['Reliance ETF Nifty BeES', 'Nippon India ETF Nifty 50 BeES', '2019'],
  ['Benchmark Junior BeES', 'Goldman Sachs Junior BeES', '2011'],
  ['Goldman Sachs Junior BeES', 'Reliance ETF Junior BeES', '2015'],
  ['Reliance ETF Junior BeES', 'Nippon India ETF Junior BeES', '2019'],
  ['Benchmark Gold BeES', 'Goldman Sachs Gold BeES', '2011'],
  ['Goldman Sachs Gold BeES', 'Reliance ETF Gold BeES', '2015'],
  ['Reliance ETF Gold BeES', 'Nippon India ETF Gold BeES', '2019'],
  ['Benchmark Bank BeES', 'Goldman Sachs Bank BeES', '2011'],
  ['Goldman Sachs Bank BeES', 'Reliance ETF Bank BeES', '2015'],
  ['Reliance ETF Bank BeES', 'Nippon India ETF Bank BeES', '2019'],
  ['Benchmark Liquid BeES', 'Goldman Sachs Liquid BeES', '2011'],
  ['Goldman Sachs Liquid BeES', 'Reliance ETF Liquid BeES', '2015'],
  ['Reliance ETF Liquid BeES', 'Nippon India ETF Liquid BeES', '2019'],

  // 9. Escorts -> Quant (2018), labelled "Restructured into" in the source
  // -- treated as a merge-candidate per the spec's resolution rules.
  ['Escorts Growth Fund', 'Quant Active Fund', '2018'],
  ['Escorts Tax Plan', 'Quant ELSS Tax Saver Fund', '2018'],
  ['Escorts Opportunities Fund', 'Quant Small Cap Fund', '2018'],
  ['Escorts High Yield Equity Fund', 'Quant Mid Cap Fund', '2018'],
  ['Escorts Financial Services Fund', 'Quant BFSI Fund', '2018'],
  ['Escorts Infrastructure Fund', 'Quant Infrastructure Fund', '2018'],

  // 10. Morgan Stanley -> HDFC (2014-06)
  ['Morgan Stanley Growth Fund', 'HDFC Large Cap Fund', '2014-06'],
  ['Morgan Stanley Equity Fund', 'HDFC Top 100 Fund', '2014-06'],
  ['Morgan Stanley A.C.E. Fund', 'HDFC Small Cap Fund', '2014-06'],
  ['Morgan Stanley Tax Fund', 'HDFC TaxSaver', '2014-06'],
  ['Morgan Stanley Multi Asset Fund', 'HDFC Dynamic PE Ratio Fund', '2014-06'],

  // 11. Kothari Pioneer -> Franklin Templeton (2002-07)
  ['Kothari Pioneer Internet Opportunities Fund', 'Franklin India Technology Fund', '2002-07'],

  // 12. Zurich India -> HDFC (2003-03) -- target names per the source
  // file's own "(now X)" annotations for funds renamed again since.
  ['Zurich India Equity Fund', 'HDFC Flexi Cap Fund', '2003-03'],
  ['Zurich India Top 200 Fund', 'HDFC Top 100 Fund', '2003-03'],
  ['Zurich India Prudence Fund', 'HDFC Balanced Advantage Fund', '2003-03'],
  ['Zurich India Taxsaver', 'HDFC TaxSaver', '2003-03'],
  ['Zurich India Capital Builder Fund', 'HDFC Capital Builder Fund', '2003-03'],

  // 13. Baroda Pioneer -> Baroda BNP Paribas (2022). Only the two
  // explicitly "Merged into" rows are listed -- the source's ABN AMRO ->
  // Fortis -> BNP Paribas -> Baroda BNP Paribas Large & Mid Cap chain is
  // given as one combined arrow-chain with no per-hop dates. To resolve
  // that one too, add it here as its own {oldName, newName, mergerDate}
  // row after independently researching each hop's approximate date.
  ['Baroda Pioneer Large Cap Fund', 'Baroda BNP Paribas Large Cap Fund', '2022'],
  ['Baroda Pioneer ELSS Fund', 'Baroda BNP Paribas ELSS Tax Saver Fund', '2022'],

  // 14. Alliance Capital -> Birla Sun Life (2005) -- searched under the
  // group's current brand, Aditya Birla Sun Life.
  ['Alliance Equity Fund', 'Aditya Birla Sun Life Frontline Equity Fund', '2005'],
  ['Alliance Buy India Fund', 'Aditya Birla Sun Life India Opportunities Fund', '2005'],
  ['Alliance Taxshield', 'Aditya Birla Sun Life Tax Relief 96', '2005'],
  ['Alliance Dynamic Equity Fund', 'Aditya Birla Sun Life Dynamic Equity Fund', '2005'],

  // 16. ING Vysya -> Birla Sun Life (2014-09)
  ['ING Dividend Yield Fund', 'Aditya Birla Sun Life Dividend Yield Fund', '2014-09'],
  ['ING Core Equity Fund', 'Aditya Birla Sun Life Equity Fund', '2014-09'],
  ['ING Balanced Fund', 'Aditya Birla Sun Life Balanced Advantage Fund', '2014-09'],
  ['ING Liquid Fund', 'Aditya Birla Sun Life Liquid Fund', '2014-09'],

  // 17. PineBridge -> Kotak (2014-09)
  ['PineBridge India Equity Fund', 'Kotak Equity Opportunities Fund', '2014-09'],
  ['PineBridge Infrastructure & Economic Reform Fund', 'Kotak Infrastructure & Economic Reform Fund', '2014-09'],
  ['PineBridge World Gold Fund', 'Kotak World Gold Fund', '2014-09'],

  // 18. Lotus India -> Religare -> Invesco. The source doesn't separate
  // the 2008/2013 intermediate hops by scheme, so each row is resolved
  // directly against the final 2016 Invesco name -- if that fails, it just
  // yields less history for that fund, never wrong history.
  ['Lotus India Equity Fund', 'Invesco India Flexi Cap Fund', '2016'],
  ['Lotus India Tax Plan', 'Invesco India ELSS Tax Saver Fund', '2016'],
  ['Lotus India Growth Fund', 'Invesco India Growth Opportunities Fund', '2016'],

  // 19. Daiwa -> SBI (2013-11)
  ['Daiwa India Equity Fund', 'SBI Magnum Equity ESG Fund', '2013-11'],
  ['Daiwa Industry Leaders Fund', 'SBI Bluechip Fund', '2013-11'],
  ['Daiwa Short Term Income Fund', 'SBI Short Term Fund', '2013-11'],

  // 22. Sun F&C -> Principal (2004). Money Manager Fund's target (Principal
  // Cash Management Fund) is ITSELF one of event 5's rows above, so the
  // runtime multi-hop walker chains straight through to Sundaram Liquid
  // Fund automatically once both hops verify -- no duplicate row needed.
  ['Sun F&C Value Fund', 'Principal Resurgent India Equity Fund', '2004'],
  ['Sun F&C Money Manager Fund', 'Principal Cash Management Fund', '2004'],
  ['Sun F&C Balanced Fund', 'Principal Balanced Advantage Fund', '2004'],

  // 24. ITC Classic -> Prudential ICICI (1997) -- target per the source
  // file's own "(now X)" annotation.
  ['Classic Quantum Fund', 'ICICI Prudential Bluechip Fund', '1997'],
];

const MFAPI_SEARCH = (q) => `https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`;
const MFAPI_CODE = (c) => `https://api.mfapi.in/mf/${c}`;
const AMFI_HISTORY = (from, to) => `https://portal.amfiindia.com/DownloadNAVHistoryReport_Po.aspx?frmdt=${from}&todt=${to}`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(90000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// Parses AMFI's whole-market historical NAV report (semicolon-delimited,
// with blank/section-header lines interspersed) into structured records.
// Pure function -- no network -- exported for testing.
function parseAmfiHistoricalReport(text) {
  const records = [];
  for (const line of text.split('\n')) {
    const parts = line.split(';');
    if (parts.length < 8) continue;
    const code = parts[0].trim();
    if (!/^\d+$/.test(code)) continue;
    const name = parts[1].trim();
    const isinGrowth = parts[2].trim();
    const isinDiv = parts[3].trim();
    const nav = parseFloat(parts[4].trim());
    const date = parts[7].trim();
    if (!isFinite(nav) || nav <= 0) continue;
    records.push({ code, name, isinGrowth: isinGrowth || null, isinDiv: isinDiv || null, nav, date });
  }
  return records;
}

// Finds every record whose name contains `schemeName` (case-insensitive
// substring). Pure function -- exported for testing.
function findMatchingRecords(records, schemeName) {
  const needle = schemeName.toLowerCase();
  return records.filter((r) => r.name.toLowerCase().includes(needle));
}

// "YYYY-MM" -> a full-month AMFI-format date window; "YYYY" -> January of
// that year. Either way this only needs to land inside the merger's actual
// month -- AMFI publishes on trading days, so a full month is generous.
// Pure function -- exported for testing.
function toAmfiDate(dateStr) {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [y, m] = dateStr.split('-');
  const month = m ? MONTHS[parseInt(m, 10) - 1] : 'Jan';
  return { from: `01-${month}-${y}`, to: `28-${month}-${y}` };
}

async function resolveSurvivingCodes(newName) {
  const results = await fetch(MFAPI_SEARCH(newName), { signal: AbortSignal.timeout(15000) }).then((r) => r.json());
  return Array.isArray(results) ? results : [];
}

async function verifyStillLive(code) {
  try {
    const data = await fetch(MFAPI_CODE(code), { signal: AbortSignal.timeout(15000) }).then((r) => r.json());
    return Array.isArray(data?.data) && data.data.length > 0 ? data.data : null;
  } catch {
    return null;
  }
}

function isRegularPlan(name) { return !/direct/i.test(name); }
function isGrowthPlan(name) { return !/idcw|dividend|bonus|payout|reinvest/i.test(name); }

function normalizeMfapiSeries(raw) {
  return raw
    .map((r) => { const [d, m, y] = r.date.split('-').map(Number); return { t: Date.UTC(y, m - 1, d), nav: parseFloat(r.nav) }; })
    .filter((r) => r.nav > 0 && isFinite(r.t))
    .sort((a, b) => a.t - b.t);
}

async function run() {
  console.log(`=== Resolving ${INPUT_PAIRS.length} scheme lineage candidates ===`);

  // Group by distinct merger date so each AMFI historical window is
  // downloaded once and reused for every scheme sharing that date -- the
  // endpoint returns the whole market per window (confirmed ~13.5MB for an
  // 11-month range during design), so this must stay one fetch per date,
  // never one per scheme, and never span more than a few weeks.
  const byDate = new Map();
  for (const [oldName, newName, date] of INPUT_PAIRS) {
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({ oldName, newName });
  }

  const results = [];
  for (const [date, pairs] of byDate) {
    const { from, to } = toAmfiDate(date);
    console.log(`\nFetching AMFI historical NAV report ${from} to ${to} (${pairs.length} scheme(s))...`);
    let historyText;
    try {
      historyText = await fetchText(AMFI_HISTORY(from, to));
    } catch (e) {
      for (const { oldName, newName } of pairs) {
        results.push({ oldName, newName, date, status: 'UNRESOLVED', reason: `AMFI history fetch failed: ${e.message}` });
      }
      continue;
    }
    const records = parseAmfiHistoricalReport(historyText);

    for (const { oldName, newName } of pairs) {
      const oldMatches = findMatchingRecords(records, oldName);
      if (!oldMatches.length) {
        results.push({ oldName, newName, date, status: 'UNRESOLVED', reason: 'Old scheme name not found in the AMFI historical window' });
        continue;
      }

      let survivingCandidates;
      try {
        survivingCandidates = await resolveSurvivingCodes(newName);
      } catch (e) {
        results.push({ oldName, newName, date, status: 'UNRESOLVED', reason: `mfapi.in search failed: ${e.message}` });
        continue;
      }
      if (!survivingCandidates.length) {
        results.push({ oldName, newName, date, status: 'UNRESOLVED', reason: 'Surviving scheme not found on mfapi.in' });
        continue;
      }

      // Match old/new plan variants (Direct-Growth, Regular-Growth, etc.)
      // by whether each name looks Direct/Regular and Growth/IDCW, since
      // AMFI's and mfapi.in's naming isn't perfectly consistent otherwise.
      for (const oldRec of oldMatches) {
        const wantRegular = isRegularPlan(oldRec.name);
        const wantGrowth = isGrowthPlan(oldRec.name);
        const newRec = survivingCandidates.find((c) => isRegularPlan(c.schemeName) === wantRegular && isGrowthPlan(c.schemeName) === wantGrowth);
        if (!newRec) {
          results.push({ oldName: oldRec.name, newName, date, status: 'UNRESOLVED', reason: 'No matching plan variant found on the surviving scheme' });
          continue;
        }

        const oldSeries = await verifyStillLive(oldRec.code);
        if (!oldSeries) {
          results.push({ oldName: oldRec.name, newName: newRec.schemeName, date, status: 'UNRESOLVED', reason: `Old code ${oldRec.code} no longer resolves via mfapi.in` });
          continue;
        }
        const newSeries = await verifyStillLive(newRec.schemeCode);
        if (!newSeries) {
          results.push({ oldName: oldRec.name, newName: newRec.schemeName, date, status: 'UNRESOLVED', reason: `New code ${newRec.schemeCode} did not resolve via mfapi.in` });
          continue;
        }

        const st = stitchSeries(normalizeMfapiSeries(newSeries), normalizeMfapiSeries(oldSeries));
        if (!st) {
          results.push({ oldName: oldRec.name, newName: newRec.schemeName, oldCode: oldRec.code, newCode: newRec.schemeCode, date, status: 'REJECTED', reason: 'Boundary check failed (gap or ratio out of bounds)' });
          continue;
        }

        results.push({
          oldName: oldRec.name,
          newName: newRec.schemeName,
          oldCode: oldRec.code,
          newCode: newRec.schemeCode,
          date,
          status: 'CANDIDATE',
          spliceDate: new Date(st.spliceDate).toISOString().slice(0, 10),
        });
      }
    }
  }

  const candidates = results.filter((r) => r.status === 'CANDIDATE');
  const rejected = results.filter((r) => r.status === 'REJECTED');
  const unresolved = results.filter((r) => r.status === 'UNRESOLVED');

  const lines = ['# Scheme Lineage Resolution — Review', '', `Generated ${new Date().toISOString()}`, ''];
  lines.push(`## Candidates to review (${candidates.length}) — boundary check passed`, '');
  lines.push('Copy the ones you confirm into data/scheme-lineage.json:', '');
  for (const c of candidates) {
    lines.push(`- \`"${c.newCode}": { "pred": ${c.oldCode}, "from": "${c.oldName}" }\`  — ${c.oldName} → ${c.newName}, spliced at ${c.spliceDate}`);
  }
  lines.push('', `## Rejected (${rejected.length}) — resolved but failed the boundary check, NOT safe to add`, '');
  for (const r of rejected) lines.push(`- ${r.oldName} → ${r.newName}: ${r.reason}`);
  lines.push('', `## Unresolved (${unresolved.length}) — could not resolve at all`, '');
  for (const u of unresolved) lines.push(`- ${u.oldName} → ${u.newName} (${u.date}): ${u.reason}`);

  const outPath = path.join(process.cwd(), 'data', 'scheme-lineage.review.md');
  fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
  console.log(`\n=== Done. ${candidates.length} candidates, ${rejected.length} rejected, ${unresolved.length} unresolved. ===`);
  console.log(`Review file written to ${outPath}`);
  console.log('Nothing was written to data/scheme-lineage.json -- copy confirmed entries in by hand after reading the review file.');
}

module.exports = { parseAmfiHistoricalReport, findMatchingRecords, toAmfiDate };

if (require.main === module) {
  run().catch((e) => { console.error('[resolve_scheme_lineage] Fatal error:', e); process.exit(1); });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node tests/resolveSchemeLineage.test.js`
Expected: `6 passed, 0 failed`

- [ ] **Step 5: Commit**

```bash
git add scripts/resolve_scheme_lineage.js tests/resolveSchemeLineage.test.js
git commit -m "feat(backtest): add one-time scheme lineage resolution script"
```

---

## Self-Review Notes (from plan authoring)

- **Spec coverage:** every section of the spec has a task — reference file copy (Task 1), data model (Task 2), `stitchSeries`/multi-hop walker extraction with tests (Task 3), runtime wiring with multi-hop-aware UI updates (Task 4), resolution script with tests (Task 5). The spec's "Manual Follow-Up" (running the script, reviewing, hand-merging) is deliberately NOT a numbered task — see below.
- **Placeholder scan:** no TBD/TODO; every code block is complete, runnable code, including the full transcribed `INPUT_PAIRS` list (not a stub).
- **Type consistency:** `stitchInfo` shape (`{spliceDate, from, fromName, hops}`) is defined once in Task 3's `walkLineage` and consumed identically in Task 4's three edit sites; `stitchSeries`'s signature (`(current, pred) → {series, spliceDate, from} | null`) is unchanged from today's production code and reused as-is by both Task 3's `walkLineage` and Task 5's resolution script.

## Manual Follow-Up (not an automated task — requires human judgment)

Once Task 5 lands:

1. Run `node scripts/resolve_scheme_lineage.js` for real (needs live network — this sandbox has it, confirmed throughout design).
2. Read `data/scheme-lineage.review.md`. For each **Candidate**, sanity-check the fund names actually describe the same underlying strategy (the automated boundary check already confirmed the NAV curves connect cleanly — this step is about whether the *pairing itself* makes sense, which no automated check can fully verify).
3. Copy confirmed entries into `data/scheme-lineage.json`, merging with the existing JPMorgan seed.
4. Commit `data/scheme-lineage.json` (not `data/scheme-lineage.review.md` — that's a working artifact, not app data; consider adding `data/scheme-lineage.review.md` to `.gitignore` if it shouldn't be tracked).
5. Manually verify a multi-hop chain in the browser once real entries exist (e.g. one of the BeES chains, if all 3 hops resolved) — confirm the results-summary note names the full chain and the chart shows multiple dashed markers.
6. For the entries the review file leaves **Unresolved** that you still want (the ABN AMRO chain, or any name-evolution guess that didn't match), research the correct current scheme name independently and add a new row to `INPUT_PAIRS` in `scripts/resolve_scheme_lineage.js`, then re-run.
