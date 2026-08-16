// lib/taxCalc.js
//
// Capital-gains tax constants and pure loss-offset math, shared by the
// single-fund RedemptionPlanner (components/RedemptionPlanner.jsx) and
// CAS Tracker's own portfolio-level PortfolioRedemptionPlanner
// (app/cas-tracker/page.js) — extracted so the two never compute STCG/LTCG
// or loss set-off differently. No React/JSX here on purpose, so either side
// can import it without pulling in a component.

export const TAX = {
  equity:     { stcg: 0.20, ltcg: 0.125, ltcgMonths: 12,  exemption: 125000 },
  debt:       { stcg: null,  ltcg: null,  ltcgMonths: 36,  exemption: 0 },    // slab for all
  hybrid:     { stcg: 0.20, ltcg: 0.125, ltcgMonths: 12,  exemption: 125000 }, // equity-oriented default
};

export function inferCategory(name) {
  const n = (name || '').toUpperCase();
  if (/LIQUID|OVERNIGHT|ULTRA.?SHORT|LOW.?DURA|SHORT.?DURA|MEDIUM.?DURA|LONG.?DURA|GILT|MONEY.?MARKET|BANKING.?PSU|CORPORATE.?BOND|CREDIT.?RISK|FMP|FIXED.?MATURITY/.test(n)) return 'debt';
  if (/BALANCED|HYBRID|ARBITRAGE|DYNAMIC.?ASSET|MULTI.?ASSET|EQUITY.?SAVINGS|CONSERVATIVE/.test(n)) return 'hybrid';
  return 'equity'; // default — covers large/mid/small/flexi/ELSS/index
}

// Applies India's STCL/LTCL capital-loss set-off rules to one (stcg, ltcg)
// pair of NET gains (either can be negative = a loss). STCL offsets both
// STCG and LTCG; LTCL offsets ONLY LTCG. Unabsorbed loss is reported as
// carry-forward (up to 8 assessment years if ITR is filed on time — not
// enforced here, just surfaced to the user). taxSaved compares the real
// (offset-aware) tax against what a naive per-side clamp-to-zero would have
// charged, i.e. the benefit of allowing the cross-gain-type offset.
// See docs/superpowers/specs/2026-07-28-capital-loss-offset-design.md.
export function applyLossOffset({ stcg, ltcg }, { stcgRate, ltcgRate, exemption }) {
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
  } else if (ltcg < 0) {
    // When stcg < 0, the first if above clamped workingLTCG to >= 0,
    // losing the information that ltcg was negative. This branch catches
    // the case where the original ltcg < 0 and carries it forward.
    ltcgLossCarryForward = -ltcg;
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
export function describeLossOffset(note) {
  const rupee = n => '₹' + Math.round(Math.abs(n)).toLocaleString('en-IN');
  const lines = [];
  const label = note.poolLabel ? ` (${note.poolLabel})` : '';

  if (note.offsetIntoLTCG > 0 && note.taxSaved > 0) {
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
