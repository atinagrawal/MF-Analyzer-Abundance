/**
 * lib/growthProjection.js
 *
 * Fund-agnostic, regulator-sanctioned growth projection for Proposal
 * Studio's Growth Projection section (live page and PDF export both call
 * these same functions). Deliberately NOT based on real historical NAV
 * data per fund -- per AMFI Best Practices Guidelines Circular
 * No. 109/2023-24 ("Usage of illustrations for depicting future returns"),
 * illustrative return figures must use AMFI's own fixed, annually-reviewed
 * CAGR table, not fund-specific backtested numbers.
 *
 * Source: AMFI Circular 109-A/2024-25 for Equity/Debt (verified via the
 * user's own reference proposal, citing this circular directly: Equity
 * 12.62%, Debt 6.61%). Circular 109/2023-24 (read directly, 01-Nov-2023)
 * for Gold -- 9.34%, no more recent figure independently verified.
 * AMFI reviews these annually (per the circular's own clause 11) --
 * refresh from the latest circular each year.
 */

const ASSUMED_CAGR = {
  EQUITY: 0.1262, // Nifty/Sensex, mean of 10-yr rolling returns -- AMFI Circular 109-A/2024-25
  DEBT: 0.0661,   // 10-yr G-Sec, mean of 10-yr rolling returns -- AMFI Circular 109-A/2024-25
  GOLD: 0.0934,   // Domestic gold, mean of 10-yr rolling returns -- AMFI Circular 109/2023-24
};

const PROJECTION_YEARS = [3, 5, 8, 10, 15, 20];

// assetAllocation: [{ name: 'Equity'|'Debt'|'Cash'|'Other', pct }] on a 0-100
// scale (as combineExposure() produces it -- not necessarily summing to
// exactly 100 while funds are still loading, so this normalizes by the
// actual sum rather than assuming 100).
function bucketRate(name) {
  if (name === 'Equity') return ASSUMED_CAGR.EQUITY;
  if (name === 'Debt') return ASSUMED_CAGR.DEBT;
  if (name === 'Cash') return ASSUMED_CAGR.DEBT; // same short-duration debt-market family
  return ASSUMED_CAGR.GOLD; // 'Other' (REITs, gold ETFs, unclassified) -- gold is the best single proxy
}

function blendedRate(assetAllocation) {
  const total = assetAllocation.reduce((s, r) => s + (r.pct || 0), 0);
  if (total <= 0) return 0;
  return assetAllocation.reduce((s, r) => s + (r.pct || 0) * bucketRate(r.name), 0) / total;
}

// Lumpsum: standard compound growth. Total Invested is constant.
function projectLumpsum(totalAmount, rate, years) {
  return totalAmount * Math.pow(1 + rate, years);
}

// SIP: standard SIP future-value formula, monthly compounding, payment at
// the start of each month (matching how this app's other SIP calculators
// treat a monthly instalment). totalAmount here is the MONTHLY amount.
function projectSip(monthlyAmount, rate, years) {
  const n = years * 12;
  const r = rate / 12;
  if (r === 0) return monthlyAmount * n;
  return monthlyAmount * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}

// Average days per month (365.25 / 12) -- used to convert a per-day SIP
// instalment into its monthly-equivalent contribution before feeding it
// into the existing monthly-compounding SIP math below. Deliberately not
// a separate days-based compounding formula: that would introduce a
// second, untested compounding implementation. Scaling the input instead
// keeps projectSip's well-tested monthly math as the only compounding
// path in this file.
const AVG_DAYS_PER_MONTH = 30.44;

function buildProjectionTable({ proposalType, totalAmount, sipFrequency, blendedRate: rate }) {
  return PROJECTION_YEARS.map((year) => {
    if (proposalType === 'sip') {
      // For a Daily SIP, totalAmount is a PER-DAY instalment (per Proposal
      // Studio's live Daily/Monthly toggle), not a monthly one -- convert
      // it to its monthly-equivalent before running the monthly-based SIP
      // math, otherwise Daily SIPs silently understate ~30x.
      const monthlyEquivalent = sipFrequency === 'daily' ? totalAmount * AVG_DAYS_PER_MONTH : totalAmount;
      return {
        year,
        totalInvested: monthlyEquivalent * 12 * year,
        projectedValue: Math.round(projectSip(monthlyEquivalent, rate, year)),
      };
    }
    return {
      year,
      totalInvested: totalAmount,
      projectedValue: Math.round(projectLumpsum(totalAmount, rate, year)),
    };
  });
}

module.exports = { ASSUMED_CAGR, PROJECTION_YEARS, blendedRate, projectLumpsum, projectSip, buildProjectionTable };
