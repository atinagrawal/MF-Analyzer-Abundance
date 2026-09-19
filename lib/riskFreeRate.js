/**
 * lib/riskFreeRate.js
 *
 * The risk-free rate assumption used for every Sharpe Ratio computed on
 * this site (mutual funds and SIFs alike) -- a single shared constant so
 * every surface (Screener, Portfolio Review, fund detail page) agrees, and
 * changing the assumption later means changing it in one place. Matches
 * the rate already publicly disclosed on the homepage FAQ (app/page.js's
 * SCHEMA_FAQ, "What is Sharpe Ratio...") -- approximating the current
 * Indian G-Sec yield, not something computed dynamically.
 */
export const RISK_FREE_RATE = 6.5; // %, annualised

/**
 * Sharpe Ratio = (annualised return - risk-free rate) / annualised
 * volatility. Both `retPct` and `volPct` are already in percentage-point
 * form (e.g. 14.55 for 14.55%, matching mf_screener's own ret_Ny/vol_Ny
 * columns) -- not fractions. Returns null when either input is missing or
 * volatility is zero (can't divide), so callers render "-" rather than
 * Infinity/NaN.
 */
export function sharpeRatio(retPct, volPct) {
  if (retPct == null || volPct == null || volPct === 0) return null;
  return (retPct - RISK_FREE_RATE) / volPct;
}
