/**
 * lib/casDisplayName.js
 *
 * Resolves the display name to show for a set of CAS Tracker rows/holdings
 * that may belong to one or several family members -- shared by the
 * toolbar's PDF/Excel exports, the Portfolio Redemption Planner, and the
 * Portfolio Review Planner, so all three agree on the same rule and can't
 * drift independently (see the final review of
 * docs/superpowers/plans/2026-09-18-portfolio-review-quartile-planner.md,
 * which found the rule triplicated with one copy missing the isFamilyView
 * guard).
 *
 * Real name when every row belongs to the SAME single family member (even
 * while the dashboard is in pooled/family view) -- including the ordinary
 * single-PAN-tab case, which is never in family view and must never show
 * the family label. Falls back to the family label only when the rows
 * genuinely span 2+ different owners.
 */
export function resolveDisplayName(ownerNames, { isFamilyView, familyName, investorName }) {
  if (!isFamilyView) return investorName;
  const distinct = [...new Set(ownerNames.filter(Boolean))];
  return distinct.length === 1 ? distinct[0] : (familyName || investorName);
}
