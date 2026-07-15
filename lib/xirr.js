/**
 * lib/xirr.js
 *
 * Money-weighted (XIRR) return for a holding's actual cash flows, and for
 * a whole portfolio's pooled cash flows. Core solver mirrors the
 * validated implementation already used by the Portfolio Backtester
 * (app/backtest/page.js) — Newton-Raphson with a bisection fallback for
 * cases where the derivative misbehaves.
 */

const DAY_MS = 86400000;
const YEAR_MS = 365 * DAY_MS;

// flows: [{ t: <ms timestamp>, amt: <signed amount, outflow negative> }]
// Returns the annualised rate as a decimal (0.184 = 18.4% p.a.), or null
// if it can't be solved (fewer than 2 flows, or no sign change in NPV).
export function xirr(flows) {
  if (!flows || flows.length < 2) return null;
  const t0 = flows[0].t;
  const yr = (f) => (f.t - t0) / YEAR_MS;
  const npv = (r) => flows.reduce((s, f) => s + f.amt / Math.pow(1 + r, yr(f)), 0);
  const der = (r) => flows.reduce((s, f) => s - yr(f) * f.amt / Math.pow(1 + r, yr(f) + 1), 0);

  let r = 0.1;
  for (let i = 0; i < 100; i++) {
    const n = npv(r), d = der(r);
    if (Math.abs(n) < 1e-7) return r;
    if (!isFinite(d) || d === 0) break;
    let nr = r - n / d;
    if (!isFinite(nr)) break;
    if (nr <= -0.9999) nr = -0.99;
    if (Math.abs(nr - r) < 1e-9) return nr;
    r = nr;
  }

  let lo = -0.9999, hi = 10, fl = npv(lo);
  if (!isFinite(fl)) return null;
  for (let i = 0; i < 240; i++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-7) return mid;
    if ((fl < 0) === (fm < 0)) { lo = mid; fl = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}

const BUY_TYPE_RE  = /PURCHASE|SIP|SWITCH.?IN|REINVEST/;
const SELL_TYPE_RE = /REDEMPTION|SWITCH.?OUT/;

/**
 * Builds the investment-only cash flows (no closing value) for one CAS
 * scheme, from its casparser transaction history. Deliberately returns
 * null — caller should skip/hide, or exclude the whole portfolio number
 * — whenever the history can't be trusted:
 *   - no transactions array, or none of them are buy/sell type
 *   - any buy/sell row is missing a parseable date/amount/units
 *   - the net units implied by the transactions don't reconcile with
 *     the units currently held (scheme.close) — a strong signal that
 *     this CAS only covers part of the holding's history (e.g. an
 *     older transfer-in, or a registrar switch not captured here)
 *
 * Non-cashflow rows (stamp duty, STT, tax, segregation, etc.) are
 * ignored, matching the classification already used for FIFO cost
 * basis in app/cas-tracker/page.js's calculateFifoCost().
 */
export function schemeCashFlows(scheme) {
  const txns = scheme?.transactions;
  if (!Array.isArray(txns) || txns.length === 0) return null;

  const flows = [];
  let netUnits = 0;
  let hasBuy = false;

  for (const txn of txns) {
    const type = (txn.type || '').toUpperCase();
    const isBuy  = BUY_TYPE_RE.test(type);
    const isSell = !isBuy && SELL_TYPE_RE.test(type);
    if (!isBuy && !isSell) continue;

    const date   = txn.date ? new Date(txn.date) : null;
    const amount = parseFloat(txn.amount);
    const units  = parseFloat(txn.units);
    if (!date || isNaN(date.getTime()) || !isFinite(amount) || !isFinite(units)) {
      return null;
    }

    if (isBuy) {
      flows.push({ t: date.getTime(), amt: -Math.abs(amount) });
      netUnits += Math.abs(units);
      hasBuy = true;
    } else {
      flows.push({ t: date.getTime(), amt: Math.abs(amount) });
      netUnits -= Math.abs(units);
    }
  }

  if (!hasBuy) return null;

  const heldUnits = parseFloat(scheme?.close) || 0;
  const tolerance = Math.max(0.01, heldUnits * 0.005);
  if (Math.abs(netUnits - heldUnits) > tolerance) return null;

  return flows;
}

// XIRR for one CAS scheme (investment flows + current value today).
// null if schemeCashFlows() couldn't build a trustworthy history.
export function schemeXirr(scheme, currentValue, asOfMs = Date.now()) {
  const flows = schemeCashFlows(scheme);
  if (!flows) return null;
  return xirr([...flows, { t: asOfMs, amt: currentValue }].sort((a, b) => a.t - b.t));
}

/**
 * Investment-only cash flow for a single-lumpsum manual holding (one
 * purchase). Returns null if no purchase date was recorded — same
 * "skip rather than guess" rule as schemeCashFlows.
 */
export function manualHoldingCashFlows({ purchaseDate, invested }) {
  if (!purchaseDate) return null;
  const date = new Date(purchaseDate);
  if (isNaN(date.getTime())) return null;
  if (!isFinite(invested) || invested <= 0) return null;
  return [{ t: date.getTime(), amt: -invested }];
}

// XIRR for a single-lumpsum manual holding (purchase + current value today).
export function manualHoldingXirr({ purchaseDate, invested, currentValue }, asOfMs = Date.now()) {
  const flows = manualHoldingCashFlows({ purchaseDate, invested });
  if (!flows) return null;
  return xirr([...flows, { t: asOfMs, amt: currentValue }]);
}

/**
 * Portfolio-level XIRR: pools the investment-only cash flows of every
 * holding (as produced by schemeCashFlows / manualHoldingCashFlows)
 * plus one closing flow for the portfolio's total current value.
 *
 * Only returns a number when EVERY holding passed in has a trustworthy
 * cash-flow history — if even one holding's flows are null, the whole
 * portfolio figure is null too, since a partial pool would silently
 * understate or misstate the true money-weighted return.
 */
export function combinedXirr(holdingFlowsList, totalCurrentValue, asOfMs = Date.now()) {
  if (!Array.isArray(holdingFlowsList) || holdingFlowsList.length === 0) return null;
  if (holdingFlowsList.some(f => !Array.isArray(f))) return null;
  const combined = holdingFlowsList.flat();
  combined.push({ t: asOfMs, amt: totalCurrentValue });
  combined.sort((a, b) => a.t - b.t);
  return xirr(combined);
}
