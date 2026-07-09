# PMS Screener — Broad Market TRI Panel Redesign

**Status:** Approved
**Date:** 2026-07-09

## Problem

The "Broad Market TRI" benchmark panel (`.pms-bench-bar` in `app/pms-screener/page.jsx` / `pms-screener.css`) reads as a flat, uncolored wall of text — all four indices' 1Y/3Y/5Y returns run together in one wrapping flex row with no color-coding (unlike every other return figure on the page, which uses green/red via `.ret-chip`) and no column alignment, making it hard to compare one period across indices at a glance.

## Direction (approved via visual mockup, Option B)

Replace the single flex row with a **4-column stat-card grid** — one card per index (Nifty 50, Nifty 500, Nifty Smallcap 250, Nifty Midcap 150), each showing its name as a serif heading and its 1Y/3Y/5Y returns stacked as three label/value rows, matching the editorial palette already established elsewhere on the page (`--pms-surface`, `--pms-border`, `--pms-text`, `--pms-muted`).

**Color-coding:** return values use the site's standard financial semantics — green (`--g1`) for ≥0, red (`--neg`) for <0 — consistent with `.ret-chip` and every other return figure on the page. This was the single biggest missing piece in the old version.

**CAGR labeling:** per standard convention (and matching how the underlying NSE data source documents itself: "Returns for the period upto one year are absolute returns. Returns for period greater than one year are CAGR returns"), the panel's header line notes **"3Y & 5Y are CAGR"** rather than blanket-labeling every period, since 1Y is a point-to-point return, not annualized.

**Layout:** 4 equal-width cards in a row on desktop, following the same responsive collapse pattern already used by `.pms-mini-grid` (the top-performers leaderboard) — 2 columns at ≤900px is not needed here since 4 cards of this size fit down to ~680px; collapses to 2 columns at ≤680px and 1 column at ≤480px, consistent with the site's 5-breakpoint system.

## Follow-up (separate task, not part of this redesign)

The user also asked to investigate fetching each PMS strategy's **own declared benchmark** from APMI's data (available per-strategy, not just the four broad-market indices shown here) so the site can eventually show accurate per-strategy benchmark comparison instead of only generic broad-market reference points. This requires checking whether the APMI scraper (`app/api/pms-data/route.js`) currently captures a benchmark field from the source HTML table — investigation happens after this visual redesign ships, as its own scoped task.

## Files Touched

- `app/pms-screener/page.jsx` — JSX for `.pms-bench-bar` section (markup restructure to card grid + CAGR note)
- `app/pms-screener/pms-screener.css` — replace `.pms-bench-bar`/`.pms-bench-label`/`.pms-bench-item`/`.pms-bench-name`/`.pms-bench-ret` with new card-grid classes; add responsive rules at 680/480px
