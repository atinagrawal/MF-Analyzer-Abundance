# Capital Loss Offset & Transparent Gain/Tax Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the CAS Tracker's redemption planners so a capital loss on STCG or LTCG never produces a nonsensical negative "tax," applies India's real STCL/LTCL set-off rules, and shows the underlying gain figures (not just tax) with a plain-language explanation of any loss offset.

**Architecture:** One new pure function (`applyLossOffset`) replaces every direct `gain * rate` tax computation across three sites in `app/cas-tracker/page.js`: the single-fund `RedemptionPlanner`, and `PortfolioRedemptionPlanner`'s two `useMemo`s (`plan`, `planSelected`). A second shared piece, `describeLossOffset` + a small `LossAdjustmentPanel` component, turns the offset result into the approved UI (paired STCG/LTCG cells + an expandable "tap for details" panel).

**Tech Stack:** Same file, plain React (`useState`/`useMemo`), no new dependencies.

## Global Constraints

- STCL (short-term capital loss) offsets both STCG and LTCG. LTCL (long-term capital loss) offsets ONLY LTCG — never STCG.
- Losses only offset gains within the same tax-rate pool: **Equity/Hybrid** (`TAX.equity`/`TAX.hybrid` rates: 20% STCG, 12.5% LTCG above ₹1.25L exemption) and **Debt/Other** (slab rate for both, no exemption) are kept separate — never cross-offset between them.
- The equity/hybrid ₹1.25L LTCG exemption is applied *after* any STCL offset reduces LTCG, not before.
- Any loss left over after offsetting is surfaced explicitly as a carry-forward amount (per the approved design: "always show carry-forward").
- No test runner is configured in this repo (established convention) — verification is a standalone Node script per task plus `npm run build`.
- Follow existing file conventions: inline `style={{ ... }}` objects using the CSS custom properties already defined in `app/globals.css` (`--g1`, `--neg`, `--pos`, `--muted`, `--text`, `--surface`, `--g-light`), `'JetBrains Mono'` for numbers.
- A fund's own per-fund tax display must never show a negative number for a loss.

---

### Task 1: Shared `applyLossOffset` and `describeLossOffset` functions

**Files:**
- Modify: `app/cas-tracker/page.js` (add two new module-level functions near the `TAX` constant, ~line 920, right after `inferCategory`'s closing brace)

**Interfaces:**
- Produces: `applyLossOffset({ stcg, ltcg }, { stcgRate, ltcgRate, exemption }) → { taxableSTCG, taxableLTCG, stcgTax, ltcgTax, tax, stcgLossCarryForward, ltcgLossCarryForward, offsetIntoLTCG, taxSaved }`. `describeLossOffset(note) → string[]` where `note` is an `applyLossOffset` result optionally with an added `poolLabel` field. Both consumed by Tasks 3 and 4.

- [ ] **Step 1: Read the current file around the insertion point**

Confirm `app/cas-tracker/page.js` still has `inferCategory` ending around line 927-928 (a `return 'equity';` line followed by a closing `}`), by reading lines 916-930.

- [ ] **Step 2: Add the two functions immediately after `inferCategory`'s closing brace**

```js
// Applies India's STCL/LTCL capital-loss set-off rules to one (stcg, ltcg)
// pair of NET gains (either can be negative = a loss). STCL offsets both
// STCG and LTCG; LTCL offsets ONLY LTCG. Unabsorbed loss is reported as
// carry-forward (up to 8 assessment years if ITR is filed on time — not
// enforced here, just surfaced to the user). taxSaved compares the real
// (offset-aware) tax against what a naive per-side clamp-to-zero would have
// charged, i.e. the benefit of allowing the cross-gain-type offset.
// See docs/superpowers/specs/2026-07-28-capital-loss-offset-design.md.
function applyLossOffset({ stcg, ltcg }, { stcgRate, ltcgRate, exemption }) {
  let taxableSTCG = stcg;
  let workingLTCG = ltcg;
  let stcgLossCarryForward = 0;
  let offsetIntoLTCG = 0;

  if (stcg < 0) {
    const lossAvailable = -stcg;
    offsetIntoLTCG = Math.min(lossAvailable, Math.max(0, workingLTCG));
    workingLTCG = Math.max(0, workingLTCG) - offsetIntoLTCG;
    stcgLossCarryForward = lossAvailable - offsetIntoLTCG;
    taxableSTCG = 0;
  }

  let ltcgLossCarryForward = 0;
  let taxableLTCGBeforeExemption = workingLTCG;
  if (workingLTCG < 0) {
    // Only reachable when stcg >= 0 — the stcg<0 branch above already
    // clamped workingLTCG to >= 0, so a still-negative workingLTCG here
    // means the ORIGINAL ltcg was negative on its own (STCL never touches
    // this path since LTCL cannot offset STCG in the other direction).
    ltcgLossCarryForward = -workingLTCG;
    taxableLTCGBeforeExemption = 0;
  }

  const taxableLTCG = Math.max(0, taxableLTCGBeforeExemption - exemption);
  const stcgTax = taxableSTCG * stcgRate;
  const ltcgTax = taxableLTCG * ltcgRate;

  const noOffsetTax =
    Math.max(0, stcg) * stcgRate +
    Math.max(0, Math.max(0, ltcg) - exemption) * ltcgRate;

  return {
    taxableSTCG, taxableLTCG,
    stcgTax, ltcgTax, tax: stcgTax + ltcgTax,
    stcgLossCarryForward, ltcgLossCarryForward, offsetIntoLTCG,
    taxSaved: noOffsetTax - (stcgTax + ltcgTax),
  };
}

// Turns one applyLossOffset() result (optionally tagged with a poolLabel,
// e.g. 'Equity/Hybrid') into 0-3 human-readable lines for the loss-
// adjustment panel. Returns [] when there's nothing to report.
function describeLossOffset(note) {
  const rupee = n => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');
  const lines = [];
  const label = note.poolLabel ? ` (${note.poolLabel})` : '';

  if (note.offsetIntoLTCG > 0) {
    lines.push(`Your ${rupee(note.offsetIntoLTCG)} short-term loss${label} offset part of your long-term gain, saving you ≈${rupee(note.taxSaved)} in tax.`);
  }
  if (note.stcgLossCarryForward > 0) {
    lines.push(`${rupee(note.stcgLossCarryForward)} of this short-term loss${label} isn't used here — it can carry forward for up to 8 years if you file your ITR on time.`);
  }
  if (note.ltcgLossCarryForward > 0) {
    lines.push(`${rupee(note.ltcgLossCarryForward)} of this long-term loss${label} couldn't offset any short-term gain (long-term losses can only offset long-term gains) — it can carry forward for up to 8 years if you file your ITR on time.`);
  }
  return lines;
}
```

- [ ] **Step 3: Verify with a standalone script**

Create `.superpowers/verify/loss-offset.mjs` with this exact content (paste `applyLossOffset` verbatim from Step 2, then):

```js
// (paste applyLossOffset function here verbatim, then:)

function assertClose(actual, expected, label) {
  if (Math.abs(actual - expected) > 0.01) {
    console.error(`FAIL: ${label} — expected ${expected}, got ${actual}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${label}`);
  }
}

const equity = { stcgRate: 0.20, ltcgRate: 0.125, exemption: 125000 };

// 1. Both gains positive — no offset, normal tax.
{
  const r = applyLossOffset({ stcg: 10000, ltcg: 200000 }, equity);
  assertClose(r.stcgTax, 2000, 'both positive: stcgTax');
  assertClose(r.ltcgTax, (200000 - 125000) * 0.125, 'both positive: ltcgTax');
  assertClose(r.stcgLossCarryForward, 0, 'both positive: no stcg carry-forward');
  assertClose(r.ltcgLossCarryForward, 0, 'both positive: no ltcg carry-forward');
}

// 2. STCG loss fully offset by a larger LTCG gain.
{
  const r = applyLossOffset({ stcg: -8400, ltcg: 200000 }, equity);
  assertClose(r.stcgTax, 0, 'stcg loss offset: stcgTax is 0');
  assertClose(r.offsetIntoLTCG, 8400, 'stcg loss offset: full amount offset');
  assertClose(r.stcgLossCarryForward, 0, 'stcg loss offset: nothing carries forward');
  assertClose(r.ltcgTax, Math.max(0, (200000 - 8400) - 125000) * 0.125, 'stcg loss offset: ltcgTax reduced by offset then exemption');
}

// 3. STCG loss LARGER than available LTCG gain — partial offset, remainder carries forward.
{
  const r = applyLossOffset({ stcg: -50000, ltcg: 20000 }, equity);
  assertClose(r.offsetIntoLTCG, 20000, 'stcg loss > ltcg: offsets all available ltcg');
  assertClose(r.ltcgTax, 0, 'stcg loss > ltcg: ltcgTax is 0');
  assertClose(r.stcgLossCarryForward, 30000, 'stcg loss > ltcg: remainder carries forward');
}

// 4. LTCG loss present, STCG positive — LTCL must NOT touch STCG.
{
  const r = applyLossOffset({ stcg: 10000, ltcg: -30000 }, equity);
  assertClose(r.stcgTax, 2000, 'ltcg loss: stcgTax unaffected');
  assertClose(r.ltcgTax, 0, 'ltcg loss: ltcgTax is 0');
  assertClose(r.ltcgLossCarryForward, 30000, 'ltcg loss: full amount carries forward');
  assertClose(r.stcgLossCarryForward, 0, 'ltcg loss: no stcg carry-forward');
}

// 5. Both negative — nothing to offset against each other, both carry forward independently.
{
  const r = applyLossOffset({ stcg: -5000, ltcg: -15000 }, equity);
  assertClose(r.stcgTax, 0, 'both negative: stcgTax is 0');
  assertClose(r.ltcgTax, 0, 'both negative: ltcgTax is 0');
  assertClose(r.stcgLossCarryForward, 5000, 'both negative: stcg carries forward in full');
  assertClose(r.ltcgLossCarryForward, 15000, 'both negative: ltcg carries forward in full');
  assertClose(r.offsetIntoLTCG, 0, 'both negative: no offset happened');
}

// 6. Debt/slab rate pool — same rate for both, exemption is 0.
{
  const slab = { stcgRate: 0.30, ltcgRate: 0.30, exemption: 0 };
  const r = applyLossOffset({ stcg: -4000, ltcg: 10000 }, slab);
  assertClose(r.offsetIntoLTCG, 4000, 'debt pool: offset applies same as equity');
  assertClose(r.ltcgTax, (10000 - 4000) * 0.30, 'debt pool: no exemption subtracted');
}

console.log('All loss-offset scenarios checked.');
```

Run: `node .superpowers/verify/loss-offset.mjs`
Expected: every line prints `PASS:` and the final line is `All loss-offset scenarios checked.` with exit code 0. If any `FAIL:` line appears, fix `applyLossOffset` (in the actual `app/cas-tracker/page.js`, keeping this script's copy in sync) before proceeding.

- [ ] **Step 4: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add app/cas-tracker/page.js
git commit -m "feat(cas-tracker): add applyLossOffset/describeLossOffset (STCL/LTCL set-off rules)"
```

(The `.superpowers/verify/` script is scratch — do not commit it; confirm `.superpowers/` is git-ignored, and if not, add it to `.gitignore` in this same commit.)

---

### Task 2: Shared `LossAdjustmentPanel` component

**Files:**
- Modify: `app/cas-tracker/page.js` (add one new module-level component, directly after `describeLossOffset` from Task 1)

**Interfaces:**
- Consumes: `describeLossOffset` from Task 1.
- Produces: `<LossAdjustmentPanel notes={Array} />` — `notes` is an array of 0-N `applyLossOffset` results (each optionally carrying a `poolLabel`). Renders nothing when `notes` is empty or every note's lines are empty. Consumed by Tasks 3 and 5.

- [ ] **Step 1: Add the component**

```jsx
// Shared "loss adjustment" teaser + expandable panel — used by both the
// single-fund RedemptionPlanner (0-1 notes) and the portfolio-level
// PortfolioRedemptionPlanner (0-2 notes, one per tax-rate pool). Renders
// nothing if there's nothing to report.
function LossAdjustmentPanel({ notes }) {
  const [expanded, setExpanded] = useState(false);
  const lines = notes.flatMap(describeLossOffset);
  if (lines.length === 0) return null;

  return (
    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed var(--g-light)' }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
      >
        <span style={{ fontSize: 14 }}>💡</span>
        <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--g1)' }}>
          Loss adjustment applied — tap for details
        </span>
        <span style={{ marginLeft: 'auto', fontSize: '.6rem', color: 'var(--muted)' }}>
          {expanded ? '▴' : '▾'}
        </span>
      </div>
      {expanded && (
        <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--surface)', borderRadius: 8, fontSize: '.68rem', lineHeight: 1.7, color: 'var(--text)' }}>
          {lines.map((line, i) => (
            <div key={i} style={{ marginBottom: i < lines.length - 1 ? 6 : 0 }}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
```

`useState` is already imported at the top of the file (`import React, { useState, useEffect, useMemo, Suspense } from 'react';`) — no new import needed.

- [ ] **Step 2: Run the project build**

Run: `npm run build`
Expected: build completes with no errors (the component isn't used by any JSX yet, so this only checks it parses cleanly — Tasks 3 and 5 wire it up).

- [ ] **Step 3: Commit**

```bash
git add app/cas-tracker/page.js
git commit -m "feat(cas-tracker): add shared LossAdjustmentPanel component"
```

---

### Task 3: Single-fund `RedemptionPlanner` — apply the offset fix

**Files:**
- Modify: `app/cas-tracker/page.js:1028-1041` (the `stcgTax`/`ltcgTax`/`totalTax` computation and `return` inside `RedemptionPlanner`'s `useMemo`)
- Modify: `app/cas-tracker/page.js` (render — insert `LossAdjustmentPanel` after the "Tax Summary" box, before the "Tax rule context" block)

**Interfaces:**
- Consumes: `applyLossOffset` (Task 1), `LossAdjustmentPanel` (Task 2).
- Produces: `result.lossNote` — either `null` or one `applyLossOffset` result (no `poolLabel`, since a single fund is only ever one pool). Not consumed by any other task.

- [ ] **Step 1: Replace the tax computation**

Current code (confirm against the live file — it should match this before editing):
```js
    let stcgTax = 0, ltcgTax = 0;
    if (category === 'equity' || category === 'hybrid') {
      stcgTax = stcgGain * TAX[category].stcg;
      const taxableLTCG = Math.max(0, ltcgGain - TAX[category].exemption);
      ltcgTax = taxableLTCG * TAX[category].ltcg;
    } else {
      stcgTax = stcgGain * (slabPct / 100);
      ltcgTax = ltcgGain * (slabPct / 100);
    }
    const totalTax = stcgTax + ltcgTax;
    const postTax  = proceeds - totalTax;

    return { lotRows, stcgGain, ltcgGain, stcgTax, ltcgTax, totalTax, proceeds, postTax, granApplied };
```

Replace with:
```js
    const rateConfig = (category === 'equity' || category === 'hybrid')
      ? { stcgRate: TAX[category].stcg, ltcgRate: TAX[category].ltcg, exemption: TAX[category].exemption }
      : { stcgRate: slabPct / 100, ltcgRate: slabPct / 100, exemption: 0 };
    const offset = applyLossOffset({ stcg: stcgGain, ltcg: ltcgGain }, rateConfig);
    const { stcgTax, ltcgTax, tax: totalTax } = offset;
    const postTax = proceeds - totalTax;
    const lossNote = (offset.offsetIntoLTCG || offset.stcgLossCarryForward || offset.ltcgLossCarryForward)
      ? offset
      : null;

    return { lotRows, stcgGain, ltcgGain, stcgTax, ltcgTax, totalTax, proceeds, postTax, granApplied, lossNote };
```

- [ ] **Step 2: Wire up the panel in the render**

Find the "Tax Summary" box (a `{result && (...)}` block containing `<div style={{ fontSize: '.58rem', ... }}>Tax Summary</div>`). Immediately after that block's closing `</div>` (the one closing the whole `{result && (...)}` conditional, right before the `{/* Tax rule context */}` comment), insert:

```jsx
          {result?.lossNote && <LossAdjustmentPanel notes={[result.lossNote]} />}
```

- [ ] **Step 3: Verify with a standalone script**

Create `.superpowers/verify/single-fund-offset.mjs`:

```js
// (paste applyLossOffset verbatim from Task 1, then:)

// Simulates RedemptionPlanner's computation for one fund with lots that
// produce a mixed STCG-loss / LTCG-gain outcome, confirming the offset
// wires through exactly as app/cas-tracker/page.js now does.
const stcgGain = -3000; // one short-term lot sold at a loss
const ltcgGain = 45000; // other long-term lots sold at a gain
const category = 'equity';
const TAX_equity = { stcg: 0.20, ltcg: 0.125, exemption: 125000 };

const rateConfig = { stcgRate: TAX_equity.stcg, ltcgRate: TAX_equity.ltcg, exemption: TAX_equity.exemption };
const offset = applyLossOffset({ stcg: stcgGain, ltcg: ltcgGain }, rateConfig);

if (offset.stcgTax !== 0) { console.error('FAIL: stcgTax should be 0 for a loss'); process.exitCode = 1; }
else console.log('PASS: stcgTax is 0');

if (offset.offsetIntoLTCG !== 3000) { console.error(`FAIL: expected offsetIntoLTCG 3000, got ${offset.offsetIntoLTCG}`); process.exitCode = 1; }
else console.log('PASS: offsetIntoLTCG is 3000');

// LTCG after offset: 45000 - 3000 = 42000, below the 125000 exemption -> 0 tax
if (offset.ltcgTax !== 0) { console.error(`FAIL: expected ltcgTax 0 (under exemption), got ${offset.ltcgTax}`); process.exitCode = 1; }
else console.log('PASS: ltcgTax is 0 (post-offset LTCG still under exemption)');

console.log('Single-fund offset scenario checked.');
```

Run: `node .superpowers/verify/single-fund-offset.mjs`
Expected: all `PASS:` lines, no `FAIL:`.

- [ ] **Step 4: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add app/cas-tracker/page.js
git commit -m "fix(cas-tracker): apply loss offset in single-fund RedemptionPlanner"
```

---

### Task 4: Portfolio-level `plan` and `planSelected` — pooling + offset

**Files:**
- Modify: `app/cas-tracker/page.js:287-408` (the entire `plan` `useMemo` body)
- Modify: `app/cas-tracker/page.js:414-520` (the entire `planSelected` `useMemo` body)

**Interfaces:**
- Consumes: `applyLossOffset` (Task 1).
- Produces: both `useMemo`s now additionally return `lossNotes: Array` (0-2 entries, each an `applyLossOffset` result tagged with `poolLabel: 'Equity/Hybrid' | 'Debt/Other'`). `totalStcgTax`/`totalLtcgTax`/`totalTax` are now computed via pooled offset (no longer a naive per-fund sum). Each row's `stcgTax`/`ltcgTax`/`tax` fields now come from that fund's own `applyLossOffset` call (never negative). Consumed by Task 5.

- [ ] **Step 1: Replace the entire `plan` useMemo**

Replace the whole block from `const plan = useMemo(() => {` through its closing `}, [target, strategy, slabPct, skipLocked, holdings, today, exitLoadOverrides]);` with:

```js
  const plan = useMemo(() => {
    if (target <= 0) return null;

    // Build a working list of eligible holdings (skip zero-value, __manual__)
    let eligible = holdings
      .filter(h => h.value > 0 && (h.buyLots?.length > 0))
      .map(h => ({
        ...h,
        category:     inferCategory(h.name),
        exitLoadRate: exitLoadOverrides[h.name] != null
          ? exitLoadOverrides[h.name]
          : getExitLoadRate(h.name)[0]?.rate ?? 0, // inferred default
        score: fundScore(h, strategy, today),
      }))
      .sort((a, b) => a.score - b.score);

    let remaining = target;
    const rows = [];
    let totalProceeds = 0, totalExitLoad = 0, totalSTCG = 0, totalLTCG = 0, totalNet = 0;
    // Pooled by tax-rate group — equity/hybrid (special rates) vs debt/other
    // (slab rate) — losses only offset gains within the same pool. See
    // docs/superpowers/specs/2026-07-28-capital-loss-offset-design.md.
    let eqSTCG = 0, eqLTCG = 0, otherSTCG = 0, otherLTCG = 0;

    for (const fund of eligible) {
      if (remaining <= 0) break;

      const lots = [...(fund.buyLots || [])];
      const cat  = fund.category;
      const currentNav = fund.liveNav;

      let fundUnits = 0, fundProceeds = 0, fundExitLoad = 0;
      let fundSTCG  = 0, fundLTCG    = 0;
      const lotBreakdown = [];

      for (const lot of lots) {
        if (remaining <= 0) break;

        // Skip ELSS locked units
        const buyDate = lot.date instanceof Date ? lot.date : new Date(lot.date);
        const isELSS  = fund.isELSS;
        if (skipLocked && isELSS && !lot.synthetic) {
          const elssUnlockDate = new Date(buyDate);
          elssUnlockDate.setFullYear(elssUnlockDate.getFullYear() + 3);
          if (today < elssUnlockDate) continue;
        }

        // How many units of this lot to consume?
        const maxFromLot   = lot.units;
        const maxByProceeds = remaining / currentNav;
        const take         = Math.min(maxFromLot, maxByProceeds);
        if (take < 0.0001) continue;

        const saleVal   = take * currentNav;
        const elRate    = calcExitLoad(lot, today, fund.name,
                            exitLoadOverrides[fund.name] != null ? exitLoadOverrides[fund.name] : undefined,
                            fund.isin);
        const exitLoad  = elRate * saleVal;
        const netSale   = saleVal - exitLoad;
        const heldMs    = lot.synthetic ? Infinity : (today - buyDate);
        const isLTCG    = heldMs >= ltcgMs;

        let effectiveNav = lot.nav;
        if (isLTCG && !lot.synthetic && buyDate < new Date('2018-01-31')) {
          // Grandfathering: simplify to purchase nav here (live fetch not available at portfolio level)
          // Flag it in UI
        }
        const gain = take * (currentNav - effectiveNav);

        fundUnits    += take;
        fundProceeds += saleVal;
        fundExitLoad += exitLoad;
        if (isLTCG) fundLTCG += gain; else fundSTCG += gain;
        remaining    -= netSale; // reduce remaining by net (after exit load)
        lotBreakdown.push({ lot, take, saleVal, exitLoad, isLTCG, gain, heldDays: lot.synthetic ? null : Math.floor(heldMs / (24*3600*1000)) });
      }

      if (fundUnits < 0.0001) continue;

      // Per-fund tax uses the same offset rule as the aggregate below (a
      // single fund can independently have an STC loss on some lots and an
      // LTC gain on others) — never shows a negative "tax" for a loss.
      const rateConfig = (cat === 'equity' || cat === 'hybrid')
        ? { stcgRate: TAX.equity.stcg, ltcgRate: TAX.equity.ltcg, exemption: TAX.equity.exemption }
        : { stcgRate: slabPct / 100, ltcgRate: slabPct / 100, exemption: 0 };
      const fundOffset  = applyLossOffset({ stcg: fundSTCG, ltcg: fundLTCG }, rateConfig);
      const fundStcgTax = fundOffset.stcgTax;
      const fundLtcgTax = fundOffset.ltcgTax;
      const fundTax     = fundOffset.tax;
      const fundNet     = fundProceeds - fundExitLoad - fundTax;

      rows.push({
        name:         fund.name,
        category:     cat,
        isELSS:       fund.isELSS,
        units:        fundUnits,
        proceeds:     fundProceeds,
        exitLoad:     fundExitLoad,
        exitLoadRate: fund.exitLoadRate ?? 0,  // ← was missing; caused NaN display
        stcg:         fundSTCG,
        ltcg:         fundLTCG,
        stcgTax:      fundStcgTax,
        ltcgTax:      fundLtcgTax,
        tax:          fundTax,
        net:          fundNet,
        lotBreakdown,
        hasSynthetic: (fund.buyLots || []).some(l => l.synthetic),
      });

      totalProceeds += fundProceeds;
      totalExitLoad += fundExitLoad;
      totalSTCG     += fundSTCG;
      totalLTCG     += fundLTCG;
      totalNet      += fundNet;
      if (cat === 'equity' || cat === 'hybrid') { eqSTCG += fundSTCG; eqLTCG += fundLTCG; }
      else                                       { otherSTCG += fundSTCG; otherLTCG += fundLTCG; }
    }

    // Aggregate tax comes from the POOLED raw gains (not from summing each
    // fund's own already-offset tax) — a loss in one fund can offset a gain
    // in a DIFFERENT fund of the same rate-group. See
    // docs/superpowers/specs/2026-07-28-capital-loss-offset-design.md.
    const eqOffset    = applyLossOffset({ stcg: eqSTCG, ltcg: eqLTCG }, { stcgRate: TAX.equity.stcg, ltcgRate: TAX.equity.ltcg, exemption: TAX.equity.exemption });
    const otherOffset = applyLossOffset({ stcg: otherSTCG, ltcg: otherLTCG }, { stcgRate: slabPct / 100, ltcgRate: slabPct / 100, exemption: 0 });
    const totalStcgTax = eqOffset.stcgTax + otherOffset.stcgTax;
    const totalLtcgTax = eqOffset.ltcgTax + otherOffset.ltcgTax;
    const totalTax      = totalStcgTax + totalLtcgTax;
    const lossNotes = [
      (eqOffset.offsetIntoLTCG || eqOffset.stcgLossCarryForward || eqOffset.ltcgLossCarryForward) ? { poolLabel: 'Equity/Hybrid', ...eqOffset } : null,
      (otherOffset.offsetIntoLTCG || otherOffset.stcgLossCarryForward || otherOffset.ltcgLossCarryForward) ? { poolLabel: 'Debt/Other', ...otherOffset } : null,
    ].filter(Boolean);

    const shortfall = remaining > 0.5; // can't meet target
    return { rows, totalProceeds, totalExitLoad, totalSTCG, totalLTCG, totalTax, totalStcgTax, totalLtcgTax, totalNet, lossNotes, shortfall };
  }, [target, strategy, slabPct, skipLocked, holdings, today, exitLoadOverrides]);
```

- [ ] **Step 2: Replace the entire `planSelected` useMemo**

Replace the whole block from `const planSelected = useMemo(() => {` through its closing `}, [selectedHoldings, skipLocked, slabPct, exitLoadOverrides, selectedRedeemSpec, today]);` with:

```js
  const planSelected = useMemo(() => {
    if (!selectedHoldings.length) return null;

    const rows = [];
    let totalProceeds = 0, totalExitLoad = 0, totalSTCG = 0, totalLTCG = 0, totalNet = 0;
    let eqSTCG = 0, eqLTCG = 0, otherSTCG = 0, otherLTCG = 0;

    for (const fund of selectedHoldings) {
      const lots = fund.buyLots || [];
      if (!lots.length) continue; // no cost data — nothing to plan for this fund

      const cat = inferCategory(fund.name);
      const currentNav = fund.liveNav;
      const isELSS = fund.isELSS;

      const isRedeemable = (lot) => {
        if (!(skipLocked && isELSS && !lot.synthetic)) return true;
        const buyDate = lot.date instanceof Date ? lot.date : new Date(lot.date);
        const elssUnlockDate = new Date(buyDate);
        elssUnlockDate.setFullYear(elssUnlockDate.getFullYear() + 3);
        return today >= elssUnlockDate;
      };

      const maxRedeemable = lots.reduce((sum, lot) => sum + (isRedeemable(lot) ? lot.units : 0), 0);

      const spec = selectedRedeemSpec[fund.name] || { mode: 'full' };
      let unitsToRedeem;
      if (spec.mode === 'custom') {
        const raw = parseFloat(spec.value) || 0;
        const asUnits = spec.unit === 'amount' ? raw / currentNav : raw;
        unitsToRedeem = Math.min(Math.max(asUnits, 0), maxRedeemable);
      } else {
        unitsToRedeem = maxRedeemable; // 'full'
      }

      if (unitsToRedeem < 0.0001) {
        rows.push({
          name: fund.name, category: cat, isELSS, units: 0, maxRedeemable,
          proceeds: 0, exitLoad: 0, exitLoadRate: 0, stcg: 0, ltcg: 0, tax: 0, net: 0,
          lotBreakdown: [], hasSynthetic: lots.some(l => l.synthetic),
          locked: maxRedeemable < 0.0001,
        });
        continue;
      }

      let remaining = unitsToRedeem;
      let fundUnits = 0, fundProceeds = 0, fundExitLoad = 0, fundSTCG = 0, fundLTCG = 0;
      const lotBreakdown = [];

      for (const lot of lots) {
        if (remaining <= 0) break;
        if (!isRedeemable(lot)) continue;

        const take = Math.min(lot.units, remaining);
        if (take < 0.0001) continue;

        const buyDate = lot.date instanceof Date ? lot.date : new Date(lot.date);
        const saleVal = take * currentNav;
        const elRate  = calcExitLoad(lot, today, fund.name,
                          exitLoadOverrides[fund.name] != null ? exitLoadOverrides[fund.name] : undefined,
                          fund.isin);
        const exitLoad = elRate * saleVal;
        const heldMs   = lot.synthetic ? Infinity : (today - buyDate);
        const isLTCG   = heldMs >= ltcgMs;
        const gain     = take * (currentNav - lot.nav);

        fundUnits    += take;
        fundProceeds += saleVal;
        fundExitLoad += exitLoad;
        if (isLTCG) fundLTCG += gain; else fundSTCG += gain;
        remaining    -= take;
        lotBreakdown.push({ lot, take, saleVal, exitLoad, isLTCG, gain, heldDays: lot.synthetic ? null : Math.floor(heldMs / (24*3600*1000)) });
      }

      const rateConfig = (cat === 'equity' || cat === 'hybrid')
        ? { stcgRate: TAX.equity.stcg, ltcgRate: TAX.equity.ltcg, exemption: TAX.equity.exemption }
        : { stcgRate: slabPct / 100, ltcgRate: slabPct / 100, exemption: 0 };
      const fundOffset  = applyLossOffset({ stcg: fundSTCG, ltcg: fundLTCG }, rateConfig);
      const fundStcgTax = fundOffset.stcgTax;
      const fundLtcgTax = fundOffset.ltcgTax;
      const fundTax     = fundOffset.tax;
      const fundNet     = fundProceeds - fundExitLoad - fundTax;

      rows.push({
        name: fund.name, category: cat, isELSS, units: fundUnits, maxRedeemable,
        proceeds: fundProceeds, exitLoad: fundExitLoad,
        exitLoadRate: exitLoadOverrides[fund.name] != null ? exitLoadOverrides[fund.name] : getExitLoadRate(fund.name)[0]?.rate ?? 0,
        stcg: fundSTCG, ltcg: fundLTCG, stcgTax: fundStcgTax, ltcgTax: fundLtcgTax, tax: fundTax, net: fundNet,
        lotBreakdown, hasSynthetic: lots.some(l => l.synthetic), locked: false,
      });

      totalProceeds += fundProceeds;
      totalExitLoad += fundExitLoad;
      totalSTCG     += fundSTCG;
      totalLTCG     += fundLTCG;
      totalNet      += fundNet;
      if (cat === 'equity' || cat === 'hybrid') { eqSTCG += fundSTCG; eqLTCG += fundLTCG; }
      else                                       { otherSTCG += fundSTCG; otherLTCG += fundLTCG; }
    }

    const eqOffset    = applyLossOffset({ stcg: eqSTCG, ltcg: eqLTCG }, { stcgRate: TAX.equity.stcg, ltcgRate: TAX.equity.ltcg, exemption: TAX.equity.exemption });
    const otherOffset = applyLossOffset({ stcg: otherSTCG, ltcg: otherLTCG }, { stcgRate: slabPct / 100, ltcgRate: slabPct / 100, exemption: 0 });
    const totalStcgTax = eqOffset.stcgTax + otherOffset.stcgTax;
    const totalLtcgTax = eqOffset.ltcgTax + otherOffset.ltcgTax;
    const totalTax      = totalStcgTax + totalLtcgTax;
    const lossNotes = [
      (eqOffset.offsetIntoLTCG || eqOffset.stcgLossCarryForward || eqOffset.ltcgLossCarryForward) ? { poolLabel: 'Equity/Hybrid', ...eqOffset } : null,
      (otherOffset.offsetIntoLTCG || otherOffset.stcgLossCarryForward || otherOffset.ltcgLossCarryForward) ? { poolLabel: 'Debt/Other', ...otherOffset } : null,
    ].filter(Boolean);

    return { rows, totalProceeds, totalExitLoad, totalSTCG, totalLTCG, totalTax, totalStcgTax, totalLtcgTax, totalNet, lossNotes, shortfall: false };
  }, [selectedHoldings, skipLocked, slabPct, exitLoadOverrides, selectedRedeemSpec, today]);
```

- [ ] **Step 3: Verify with a standalone script**

Create `.superpowers/verify/portfolio-offset.mjs`:

```js
// (paste applyLossOffset verbatim from Task 1, then:)

// Simulates two funds in the SAME rate-group (equity/hybrid): Fund A has a
// short-term loss, Fund B has a long-term gain — confirms the aggregate
// pooling offsets across funds, matching what plan/planSelected now do.
const equity = { stcgRate: 0.20, ltcgRate: 0.125, exemption: 125000 };

const fundA = { stcg: -8400, ltcg: 0 };   // short-term loss only
const fundB = { stcg: 0,     ltcg: 42000 }; // long-term gain only

// Per-fund (no cross-fund offset) — each fund's own tax:
const fundAOffset = applyLossOffset(fundA, equity);
const fundBOffset = applyLossOffset(fundB, equity);
if (fundAOffset.tax !== 0) { console.error('FAIL: fund A alone should owe 0 tax (pure loss)'); process.exitCode = 1; }
else console.log('PASS: fund A alone owes 0 tax');
if (fundBOffset.tax === 0) { console.error('FAIL: fund B alone should owe tax on its full gain (no offset available to it alone)'); process.exitCode = 1; }
else console.log(`PASS: fund B alone owes tax (₹${fundBOffset.tax.toFixed(0)}) before pooling`);

// Pooled across both funds — the aggregate should apply A's loss to B's gain.
const pooled = applyLossOffset(
  { stcg: fundA.stcg + fundB.stcg, ltcg: fundA.ltcg + fundB.ltcg },
  equity
);
if (pooled.offsetIntoLTCG !== 8400) { console.error(`FAIL: expected pooled offsetIntoLTCG 8400, got ${pooled.offsetIntoLTCG}`); process.exitCode = 1; }
else console.log('PASS: pooled offsetIntoLTCG is 8400 (fund A\'s loss reduced fund B\'s gain)');

const expectedTaxableLTCG = Math.max(0, (42000 - 8400) - 125000); // 0, still under exemption
if (pooled.ltcgTax !== expectedTaxableLTCG * 0.125) { console.error('FAIL: pooled ltcgTax mismatch'); process.exitCode = 1; }
else console.log('PASS: pooled ltcgTax matches expected (post-offset, post-exemption)');

const naiveSumTax = fundAOffset.tax + fundBOffset.tax; // what the OLD per-fund-summed code would have produced
if (pooled.tax >= naiveSumTax) { console.error(`FAIL: pooled tax (${pooled.tax}) should be less than naive per-fund sum (${naiveSumTax})`); process.exitCode = 1; }
else console.log(`PASS: pooled tax (₹${pooled.tax.toFixed(0)}) is lower than the old naive per-fund sum (₹${naiveSumTax.toFixed(0)}) — cross-fund offset is working`);

console.log('Portfolio pooling scenario checked.');
```

Run: `node .superpowers/verify/portfolio-offset.mjs`
Expected: all `PASS:` lines, no `FAIL:`.

- [ ] **Step 4: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add app/cas-tracker/page.js
git commit -m "fix(cas-tracker): pool STCG/LTCG by tax-rate group and apply loss offset in plan/planSelected"
```

---

### Task 5: Totals card UI — paired cells + loss-adjustment panel

**Files:**
- Modify: `app/cas-tracker/page.js` (the "Totals card" grid inside `PortfolioRedemptionPlanner`'s render, currently the flat `STCG Tax`/`LTCG Tax` cells in the array passed to `.map()`)

**Interfaces:**
- Consumes: `activePlan.totalSTCG`/`totalLTCG`/`totalStcgTax`/`totalLtcgTax`/`totalTax`/`totalNet`/`lossNotes` (all present on both `plan` and `planSelected` after Task 4), `LossAdjustmentPanel` (Task 2).
- Produces: nothing consumed by later tasks — this is the final visible integration point.

- [ ] **Step 1: Replace the Totals card grid**

Find this block (the grid inside the "Totals card" `<div>`):
```jsx
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 0 }}>
                    {[
                      ['Gross',      fmt(activePlan.totalProceeds),                                           'var(--text)'],
                      ['Exit Load',  activePlan.totalExitLoad > 0 ? '−' + fmt(activePlan.totalExitLoad) : '—',     activePlan.totalExitLoad > 0 ? 'var(--neg)' : 'var(--muted)'],
                      ['STCG Tax',   activePlan.totalStcgTax > 0 ? '−' + fmt(activePlan.totalStcgTax) : '—',       activePlan.totalStcgTax > 0 ? 'var(--neg)' : 'var(--muted)'],
                      ['LTCG Tax',   activePlan.totalLtcgTax > 0 ? '−' + fmt(activePlan.totalLtcgTax) : '—',       activePlan.totalLtcgTax > 0 ? 'var(--neg)' : 'var(--muted)'],
                      ['Total Tax',  activePlan.totalTax > 0 ? '−' + fmt(activePlan.totalTax) : '—',               activePlan.totalTax > 0 ? 'var(--neg)' : 'var(--muted)'],
                      ['Net in Hand',fmt(activePlan.totalNet),                                                'var(--g1)'],
                    ].map(([lbl, val, col]) => (
                      <div key={lbl} style={{ paddingRight: 10 }}>
                        <div style={{ fontSize: '.52rem', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase',
                          color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>{lbl}</div>
                        <div style={{ fontSize: lbl === 'Net in Hand' ? '.9rem' : '.78rem',
                          fontWeight: 900, color: col, fontFamily: "'JetBrains Mono', monospace",
                          letterSpacing: '-.3px' }}>{val}</div>
                      </div>
                    ))}
                  </div>
```

Replace with:
```jsx
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 0 }}>
                    {[
                      ['Gross',      fmt(activePlan.totalProceeds),                                           'var(--text)'],
                      ['Exit Load',  activePlan.totalExitLoad > 0 ? '−' + fmt(activePlan.totalExitLoad) : '—',     activePlan.totalExitLoad > 0 ? 'var(--neg)' : 'var(--muted)'],
                    ].map(([lbl, val, col]) => (
                      <div key={lbl} style={{ paddingRight: 10 }}>
                        <div style={{ fontSize: '.52rem', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase',
                          color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>{lbl}</div>
                        <div style={{ fontSize: '.78rem', fontWeight: 900, color: col, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-.3px' }}>{val}</div>
                      </div>
                    ))}

                    {/* STCG / LTCG — gain as the headline figure, tax as a sub-line,
                        matching the per-fund row pairing (Row C above). */}
                    {[
                      ['STCG', activePlan.totalSTCG, activePlan.totalStcgTax],
                      ['LTCG', activePlan.totalLTCG, activePlan.totalLtcgTax],
                    ].map(([lbl, gainVal, taxVal]) => (
                      <div key={lbl} style={{ paddingRight: 10 }}>
                        <div style={{ fontSize: '.52rem', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase',
                          color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>{lbl}</div>
                        <div style={{ fontSize: '.78rem', fontWeight: 900, color: gainVal >= 0 ? 'var(--text)' : 'var(--neg)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-.3px' }}>
                          {gainVal >= 0 ? '+' : '−'}{fmt(gainVal)}
                        </div>
                        <div style={{ fontSize: '.62rem', fontWeight: 700, color: taxVal > 0 ? 'var(--neg)' : 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                          tax {taxVal > 0 ? '−' + fmt(taxVal) : '—'}
                        </div>
                      </div>
                    ))}

                    {[
                      ['Total Tax',   activePlan.totalTax > 0 ? '−' + fmt(activePlan.totalTax) : '—', activePlan.totalTax > 0 ? 'var(--neg)' : 'var(--muted)', false],
                      ['Net in Hand', fmt(activePlan.totalNet),                                        'var(--g1)',                                              true],
                    ].map(([lbl, val, col, big]) => (
                      <div key={lbl} style={{ paddingRight: 10 }}>
                        <div style={{ fontSize: '.52rem', fontWeight: 800, letterSpacing: '.5px', textTransform: 'uppercase',
                          color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace", marginBottom: 2 }}>{lbl}</div>
                        <div style={{ fontSize: big ? '.9rem' : '.78rem', fontWeight: 900, color: col, fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-.3px' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                  <LossAdjustmentPanel notes={activePlan.lossNotes} />
```

- [ ] **Step 2: Run the project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add app/cas-tracker/page.js
git commit -m "feat(cas-tracker): show STCG/LTCG gains + loss-adjustment panel in Totals card"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Re-run every standalone script from Tasks 1, 3, and 4**

```bash
node .superpowers/verify/loss-offset.mjs
node .superpowers/verify/single-fund-offset.mjs
node .superpowers/verify/portfolio-offset.mjs
```
Expected: all `PASS:`, no `FAIL:`, in all three.

- [ ] **Step 2: Full project build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Manual UI check**

Open the CAS Tracker with a real portfolio containing at least one lot sold at a loss (or temporarily test with any portfolio — the FIFO math will naturally produce a loss if `liveNav` is below some lot's buy NAV). Open both the single-fund planner and the portfolio-level planner (both "Target Amount" and "Selected Funds" modes), and confirm:
- No tax figure is ever shown as negative.
- The Totals card shows STCG/LTCG gain figures with their tax as a sub-line.
- The "💡 Loss adjustment applied" teaser appears only when a loss actually occurred, and expands to plain-language lines matching the scenario.
- Signing off here also closes out the earlier "total tax only" and "negative gain still taxed" reports — no separate follow-up needed.
