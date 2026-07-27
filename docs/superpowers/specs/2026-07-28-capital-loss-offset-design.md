# Capital Loss Offset & Transparent Gain/Tax Display — Design

## Summary

Fix the redemption planners' capital-gains tax math so a loss on STCG or LTCG never produces a nonsensical negative "tax," and instead applies India's actual capital-loss set-off rules: a short-term capital loss (STCL) can offset both STCG and LTCG; a long-term capital loss (LTCL) can only offset LTCG; anything left unoffset is called out as carrying forward (up to 8 assessment years, contingent on timely ITR filing). Also surfaces the underlying STCG/LTCG gain figures (not just their tax) in the portfolio-level Totals card, paired the same way per-fund rows already are, and adds a quiet, expandable explanation of any loss offset that occurred.

This touches three computation sites in `app/cas-tracker/page.js`: the single-fund `RedemptionPlanner`'s `useMemo` (~line 970-1041), and `PortfolioRedemptionPlanner`'s two `useMemo`s — `plan` (target-amount mode) and `planSelected` (hand-picked-funds mode).

## Background

The existing code multiplies gain × rate directly wherever it computes tax:
```js
stcgTax = stcgGain * TAX[category].stcg;
```
If `stcgGain` is negative (a net loss on that gain-type), this produces a negative "tax" that just arithmetically reduces the total — never validated against how India's Income Tax Act actually treats losses (Sections 70/71): STCL can be set off against STCG or LTCG from any capital asset; LTCL can only be set off against LTCG; unabsorbed losses carry forward for 8 assessment years.

Two distinct fixes are needed, at two different scopes:

1. **Per-fund / single-fund scope** — a simple clamp. One redemption computation (one fund, or one row within the portfolio planner) has exactly two gain figures (STCG, LTCG). If either is negative on its own, that side's tax is ₹0. But since a single fund CAN have some lots sold at a short-term loss and others at a long-term gain (or vice versa), the STCL-offsets-LTCG rule still applies *within* that one fund's own two figures — this isn't purely a "clamp to zero," it's the same offset logic as the aggregate case, just operating on one fund's numbers instead of a portfolio-wide pool.

2. **Aggregate/portfolio scope** (`PortfolioRedemptionPlanner`'s `plan` and `planSelected`) — losses from one fund can offset gains from an *entirely different* fund, but only within the same tax-rate group. Equity/hybrid funds (Section 111A/112A rates: 20% STCG, 12.5% LTCG above ₹1.25L exemption) and debt/other funds (slab rate) are kept in two separate pools — offsetting an equity loss against a debt gain would require picking a tax rate for the set-off that no single rate honestly represents, so pools stay independent (a documented, deliberate simplification of what a real ITR filing could in principle do with more sophisticated ordering).

## 1. Shared offset function

Both scopes run the same core math on a `{ stcg, ltcg }` pair (raw, possibly-negative net gains) and a rate config (`{ stcgRate, ltcgRate, exemption }`, where `exemption` is `0` for non-equity/hybrid):

```js
// Applies India's STCL/LTCL set-off rules to one (stcg, ltcg) pair.
// STCL offsets STCG and LTCG. LTCL offsets ONLY LTCG. Leftover carries forward.
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

  let taxableLTCGBeforeExemption = workingLTCG;
  let ltcgLossCarryForward = 0;
  if (workingLTCG < 0) {
    // Only reachable when stcg >= 0 (the stcg<0 branch above already clamped
    // workingLTCG to >= 0) — i.e. this fires when LTCG alone is a loss.
    ltcgLossCarryForward = -workingLTCG;
    taxableLTCGBeforeExemption = 0;
  }

  const taxableLTCG = Math.max(0, taxableLTCGBeforeExemption - exemption);
  const stcgTax = taxableSTCG * stcgRate;
  const ltcgTax = taxableLTCG * ltcgRate;

  return {
    stcgTax, ltcgTax, tax: stcgTax + ltcgTax,
    stcgLossCarryForward, ltcgLossCarryForward,
    offsetIntoLTCG, // > 0 means an STC loss reduced this pool's LTCG
  };
}
```

This one function replaces every direct `gain * rate` computation across all three sites.

## 2. Single-fund `RedemptionPlanner`

Replace the current block (~line 1028-1037):
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
```
with a call to `applyLossOffset({ stcg: stcgGain, ltcg: ltcgGain }, rateConfigFor(category, slabPct))`, and thread its `stcgLossCarryForward`/`ltcgLossCarryForward`/`offsetIntoLTCG` into the returned object so the single-fund panel can show the same kind of note (simpler — only ever one pool, since it's one fund).

## 3. Portfolio-level `plan` and `planSelected`

Both currently accumulate one blended `totalSTCG`/`totalLTCG` across every fund regardless of category. Split into two pools while iterating:
```js
let eqPoolSTCG = 0, eqPoolLTCG = 0;   // category === 'equity' || 'hybrid'
let otherPoolSTCG = 0, otherPoolLTCG = 0; // everything else (debt, etc.)
// ...inside the existing per-fund loop, in addition to totalSTCG/totalLTCG:
if (cat === 'equity' || cat === 'hybrid') { eqPoolSTCG += fundSTCG; eqPoolLTCG += fundLTCG; }
else                                       { otherPoolSTCG += fundSTCG; otherPoolLTCG += fundLTCG; }
```
After the loop, run `applyLossOffset` once per pool (equity/hybrid with `TAX.equity`'s rates and exemption; debt/other with `slabPct` for both and `exemption: 0`), then sum the two pools' results into the grand `totalStcgTax`/`totalLtcgTax`/`totalTax` already added to the Totals card. Also collect a `lossNotes` array (0–2 entries, one per pool that had any loss activity):
```js
{ poolLabel: 'Equity/Hybrid' | 'Debt/Other', stcgLossCarryForward, ltcgLossCarryForward, offsetIntoLTCG, taxSaved }
```
`taxSaved` is computed by comparing the pool's actual tax against what it would have been with losses clamped to zero and no offset (i.e., `Math.max(0, stcg) * stcgRate + Math.max(0, Math.max(0,ltcg) - exemption) * ltcgRate`, minus the real `tax` from `applyLossOffset`) — this is the number shown in "saving you ≈₹X in tax."

**Per-fund row display** (the `rows` array in both `plan` and `planSelected`): each fund's own `stcgTax`/`ltcgTax` fields switch from the raw `gain * rate` multiplication to `applyLossOffset({ stcg: fundSTCG, ltcg: fundLTCG }, ...)`'s per-fund result — this is the "scope 1" fix (a single fund's own STCL can still offset its own LTCG), independent of the cross-fund pooling above. A fund's displayed tax is never negative.

## 4. UI — Totals card

Replace the current flat `STCG Tax` / `LTCG Tax` cells with paired cells (matches the approved mockup):
```jsx
<div>
  <div className="mock-cell-label">STCG</div>
  <div style={{ color: activePlan.totalSTCG >= 0 ? 'var(--text)' : 'var(--neg)' }}>
    {activePlan.totalSTCG >= 0 ? '+' : '−'}{fmt(activePlan.totalSTCG)}
  </div>
  <div style={{ fontSize: '.68em', color: activePlan.totalStcgTax > 0 ? 'var(--neg)' : 'var(--muted)' }}>
    tax {activePlan.totalStcgTax > 0 ? '−' + fmt(activePlan.totalStcgTax) : '—'}
  </div>
</div>
<!-- identical structure for LTCG -->
```
`Total Tax` and `Net in Hand` cells are unchanged (still present, still the grand totals — now correctly reflecting offset math instead of a naive sum).

Below the grid, when `lossNotes.length > 0`, show the teaser:
```
💡 Loss adjustment applied — tap for details          ▾
```
Clicking expands a panel listing one line per entry in `lossNotes`:
- If `offsetIntoLTCG > 0`: *"Your ₹{stcgLossCarryForward + offsetIntoLTCG} short-term loss ({poolLabel}) offset part of your long-term gain, saving you ≈₹{taxSaved} in tax."*
- If a loss exists but nothing was offset within this plan (`offsetIntoLTCG === 0` and either carry-forward figure is nonzero on its own with no counterpart gain): *"Your ₹{amount} {short-term|long-term} loss ({poolLabel}) couldn't be offset within this plan — see carry-forward below."*
- Any nonzero `stcgLossCarryForward`/`ltcgLossCarryForward` (per your "always show" decision) gets its own line: *"₹{amount} of this loss isn't used here — it can carry forward for up to 8 years if you file your ITR on time."*

The **single-fund** `RedemptionPlanner` gets the same teaser/panel pattern, scaled down (only ever one pool, so at most one offset line plus carry-forward lines) — reusing the same copy templates.

## Testing approach

No test runner is configured in this repo (established convention). Verification: `npm run build` for a clean compile, plus a standalone script exercising `applyLossOffset` directly against hand-computed scenarios covering every branch — both gains positive (no offset), STCG loss fully offsetting a larger LTCG gain (with and without exceeding it, testing carry-forward), LTCG loss with positive STCG present (confirms it does NOT offset STCG, full carry-forward), both negative (no offset possible, both carry forward independently), and the equity exemption applied correctly *after* an offset reduces LTCG. Also a manual walkthrough of the actual planner UI with a real portfolio containing at least one loss-making lot, confirming the Totals card numbers, the teaser's appearance/absence, and the expanded panel's copy match the scenario.
