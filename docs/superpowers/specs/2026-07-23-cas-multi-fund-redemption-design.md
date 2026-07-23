# CAS Tracker: Multi-Fund Redemption Selection — Design

## Summary

Add the ability to manually select multiple specific funds to redeem in the CAS Tracker (`app/cas-tracker/page.js`), instead of only entering a total ₹ target amount and letting an auto-strategy algorithm pick which funds/lots to sell. Reuses and extends the existing `PortfolioRedemptionPlanner` rather than introducing a parallel component.

## Background

Two redemption planners already exist:
- `RedemptionPlanner` — single fund, FIFO lot-level STCG/LTCG breakdown, opened via each holding card's "📊 Plan Redemption" button.
- `PortfolioRedemptionPlanner` — user enters one ₹ target amount, picks a strategy (tax-efficient / least-exit-load / largest-first), and the algorithm auto-selects funds/lots across the whole portfolio to hit that target.

There was no way to say "I want to redeem exactly these 3 funds" without either using the single-fund planner three separate times (no combined summary) or entering a target amount and hoping the algorithm happens to pick the right funds.

## 1. Fund selection on the dashboard

Each CAS holding card (not manual holdings — matches the existing "Plan Redemption" button's scope) gets a checkbox. Checking any funds shows a floating bottom bar — visually and structurally modeled on the existing `PMSCompareBar` pattern from the PMS Screener (`app/pms-screener/PMSCompare.jsx`) for UI consistency across the app — showing "N funds selected → Plan Redemption" plus a Clear action. Clicking "Plan Redemption" opens `PortfolioRedemptionPlanner` with the selected funds passed in and the modal defaulting to Selected-Funds mode.

The existing top-of-dashboard "📊 Redemption Planner" button is unchanged: it still opens the same modal with all holdings, defaulting to Target Amount mode.

## 2. Planner modal — mode toggle

`PortfolioRedemptionPlanner` gains a two-tab toggle at the top of its controls section:
- **🎯 Target Amount** — exactly today's existing behavior and computation, unmodified.
- **☑ Selected Funds** — new. Lists only the funds passed in via selection. Each row defaults to "Redeem: Full" (redeem all currently-redeemable units of that fund); clicking it reveals a units/₹-amount input (same toggle UX as `RedemptionPlanner`'s existing units/amount toggle) to specify a partial amount instead, capped at the fund's redeemable units.

Which tab is active initially depends on the entry point (top button → Target Amount; floating bar → Selected Funds), but the user can switch tabs freely once the modal is open — this is one modal, not two separate flows.

Shared, mode-independent controls: **Skip ELSS locked units** checkbox and the **debt tax slab %** selector — both apply regardless of which tab is active, since they describe the investor's tax situation, not the selection strategy.

Mode-specific controls: the **Strategy** dropdown (tax-efficient / least-exit-load / largest-first) only appears in Target Amount mode — it has no meaning once funds are hand-picked.

## 3. Computation

Target Amount mode's existing `plan` computation (in `PortfolioRedemptionPlanner`) is untouched.

Selected Funds mode gets a new, parallel computation, `planSelected`: for each selected fund, independently consume its FIFO lots up to either "all redeemable units" (Full) or the row's custom units/₹ amount, respecting `skipLocked` for ELSS the same way Target Amount mode does. There is no shared "remaining target" counter across funds — each fund redeems its own specified amount regardless of what other selected funds are doing. Per-fund STCG/LTCG/tax/exit-load results are computed with the same logic already used in `plan` (equity/hybrid vs debt tax rules, per-category exit load with per-row override), then summed for the same Gross Proceeds / Exit Load / Est. Tax / Net in Hand summary cards already rendered today.

## Edge cases

- Opening Selected Funds mode with no funds selected (e.g., user opened via the top button, then switched tabs) shows an empty-state message directing them back to the dashboard checkboxes.
- The selected-fund list is a snapshot captured when the modal opens (matches the existing `holdings` prop pattern) — checking more boxes on dashboard cards behind an open modal does not live-update the modal; the user closes and reopens to change the selection.
- A fund whose ELSS-locked units make up its entire holding, with "Skip ELSS locked units" checked, has zero redeemable units — its row shows a locked notice instead of a redeemable amount, matching how Target Amount mode already treats fully-locked funds (excluded from `eligible`).

## Testing approach

No test runner is configured in this repo (established convention this session). Verification: `npm run build` for a clean compile, plus a manual dev-server walkthrough — select 2-3 funds via checkboxes, confirm the floating bar and modal pre-population, verify Full vs custom-amount per row, confirm tax/exit-load totals match manually-checked expectations, and confirm Target Amount mode is unaffected.
