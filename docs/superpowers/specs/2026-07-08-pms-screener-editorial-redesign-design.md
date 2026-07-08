# PMS Screener — Editorial Redesign

**Status:** Approved
**Date:** 2026-07-08

## Problem

The current PMS Screener (`app/pms-screener/`) was flagged as cluttered, visually generic, hard to scan, and lacking clear hierarchy — the stats strip, top-performers grid, controls bar, and table all compete for attention at equal visual weight, and the 8-column data table (AUM + 7 return periods) is dense and hard to read at a glance.

## Direction

Redesign the page in an **editorial/magazine style** — warm cream background, serif display headings (Georgia) paired with Arial/sans-serif for data and UI chrome, generous whitespace, and a "feature story" treatment for the top strategy of the month. The site's existing **forest green** brand palette (`--g1: #1b5e20`, `--g2: #2e7d32`, `--border: #c2dfc2`, `--neg: #b71c1c`) is retained for continuity with the rest of the site (navbar, market-breadth, screener) — validated against a warm-gold alternative in the visual companion and rejected in favor of green.

This redesign is visual/layout only. **All existing functionality is preserved**: strategy tabs, search, provider filter, table/grid view toggle, advanced filters (AUM tier, min return threshold), compare-up-to-3 with modal, slide-out detail drawer, pagination, and FAQ accordion all continue to work exactly as they do today — only their visual treatment changes.

## Layout Changes

### 1. Header
- Serif display title ("PMS **Screener**" — bold accent on second word, matching the mockup)
- Small uppercase eyebrow line above the title showing data freshness (e.g. "APMI Official Data · Jun 26 / May 26") with the existing live-dot indicator
- Sans-serif subtitle paragraph, constrained width for readability

### 2. Stat strip → slim stat bar
Replace the current 5-tile grid (`.pms-stat-strip` / `.pms-stat-tile`, heavy bordered boxes) with a **single horizontal band** divided into 5 segments by thin vertical rules, matching the mockup's `.fp-statbar` / `.fp-stat` treatment. Same 5 metrics as today (Strategies Shown, Avg 1Y Return, Beat Nifty 50, Combined AUM, Data Coverage) — same underlying `stats` computation in `page.jsx`, just restyled to be one lightweight container instead of 5 separate bordered cards.

### 3. Top performers → featured + secondary list
Replace the current 4-card equal-weight grid (`.top-perf-grid` / `.winner-card`) with an **asymmetric layout**:
- Left (larger): one "feature" card for the #1 performer — rank label, strategy name, manager, large return figure, AUM + benchmark delta
- Right (narrower): a compact vertical list of #2–4, each showing name/manager/return in a single row

Both remain clickable to open the existing detail drawer (`setSelected(fund)`), same as today.

### 4. Controls bar
Restyle the search input and buttons (`.pms-search`, `.cat-btn`, `.view-btn`) to a lighter "pill" treatment — thinner borders, rounder corners, active state filled with forest green instead of the current bordered/boxy look. No functional change to search, provider filter, view toggle, or the advanced-filters toggle button.

### 5. Table — progressive disclosure of columns
Per user decision: the table shows **6 columns by default** — Strategy & Manager, AUM, 1M, 3M, 6M, 1Y, 3Y (i.e. same as today minus 5Y and Inception) — plus a **"+ Show 5Y & Inception returns"** toggle row at the bottom of the table. Clicking it reveals the two additional columns for all visible rows. This preference is session-only (component state, not persisted).

Visual treatment: softer borders (`#f0ead9`-style light dividers instead of heavy card borders), serif strategy names, sans-serif numeric columns, same green/red return coloring as today. The existing per-strategy month badge (e.g. "MAY 26", shown when `fund.dataMonth === 'prev'`) is kept, restyled to match the new palette (`.pms-month-badge` gets updated colors, not new behavior).

Grid view (`.pms-grid-view` / `.pms-grid-card`) gets the same lighter visual treatment but is not restructured — same fields shown, same functionality.

### 6. Regulatory disclosure (new requirement, not just cosmetic)
Both on-page disclosure lines currently omit the advisor's name and registration number, even though the compare modal (`PMSCompare.jsx:278`) already includes the correct text:

> Abundance Financial Services · Atin Kumar Agrawal · ARN-251838 · APRN04279 · APMI Registered Portfolio Manager Distributor

This line must be added to:
- **Source line** at the bottom of the main table (`page.jsx` `.src-line`, currently `page.jsx:767-770`) — as a second line beneath the existing "Source: APMI India..." text
- **Drawer disclosure** (`page.jsx` `.pd-source`, currently `page.jsx:896-898`) — appended after the existing disclosure text

No change needed to `PMSCompare.jsx` (already correct) or `layout.jsx` (JSON-LD already includes ARN/APRN as structured data).

## Responsive Behavior

The page must remain fully usable at every breakpoint already established in `pms-screener.css` (1100 / 900 / 680 / 480 / 360px), following existing patterns rather than inventing new ones:

- **Stat bar** (new, replaces `.pms-stat-strip`): single 5-segment row on desktop. At ≤900px, wraps to a 2-column grid (matching the current `.pms-stat-strip` tablet behavior); at ≤680px/480px stays 2-column with reduced font size; at ≤360px collapses to 1 column. Vertical divider rules only render between segments that end up horizontally adjacent after wrapping.
- **Featured + secondary top performer** (new, replaces `.top-perf-grid`): side-by-side (1.3fr/1fr) on desktop. At ≤900px, stacks vertically — full-width feature card on top, full-width secondary list below (this differs from the old grid's 2-column tablet behavior, since the feature card's large return figure needs full width to stay legible). At ≤480px, secondary list items keep single-row layout but with tighter padding.
- **Controls bar** (search + pills): single row on desktop. At ≤680px, search goes full-width on its own row (reusing the existing `order: -1` pattern from `.pms-search`), and pills become a horizontally-scrollable row reusing the existing `.controls-bar` nowrap+overflow-x+hidden-scrollbar pattern. At ≤480px, pills wrap to a 2-per-row grid if scroll proves awkward in testing.
- **Table**: reuse the existing `.pms-table-wrap { overflow-x: auto }` horizontal-scroll pattern with its fade-edge indicator (`::after`, shown ≤768px) — already fixed in a prior session and known to work. The 5Y/Inception toggle simply adds two more columns to the scrollable width; no new mobile-specific handling required. Grid view remains available as the more mobile-friendly alternative and keeps its existing responsive column counts (2-col ≤1100px/900px, 1-col ≤480px).
- **Drawer, pagination, compare bar/modal**: no changes — already responsive (full-width slide-up drawer ≤900px, stacked pagination ≤680px, scrollable/full-screen compare UI) and confirmed working; only their colors/typography adjust to match the editorial palette, per the "What does NOT change" section above.

Any new class introduced for the redesign must carry its own responsive rules at these same five breakpoints, placed alongside the existing per-breakpoint media query blocks (not scattered into new ad-hoc breakpoints).

## What does NOT change

- Data fetching/merge logic (`getPmsDataMonths`, latest+prev month merge, `dataMonth` tagging) — untouched, this is a separate concern already shipped
- API route (`app/api/pms-data/route.js`) — untouched
- FAQ section — same content and accordion behavior, only restyled to match new typography (serif headings, same accordion mechanics)
- Compare bar and compare modal (`PMSCompare.jsx`) — out of scope for this pass; can be restyled in a follow-up if desired, but not required now
- Any routing, URL state (`?strategy=`, `?q=`), or SEO metadata in `layout.jsx`

## Files Touched

- `app/pms-screener/page.jsx` — header, stat bar, top-performers, controls bar, table markup/classes, drawer disclosure text, source line text
- `app/pms-screener/pms-screener.css` — new/updated classes for the editorial treatment (colors, typography, spacing); old `.pms-stat-strip`/`.winner-card`/`.top-perf-grid` styles replaced
- No changes to `PMSCompare.jsx`, `pms-compare.css`, `lib/pmsDate.js`, `app/api/pms-data/route.js`, or `layout.jsx`

## Open Risks / Follow-ups

- Compare bar/modal will visually clash with the new editorial palette until restyled in a follow-up — acceptable for now since it's a secondary, occasionally-used UI surface
- Georgia serif rendering varies slightly across OS/browsers; no custom web font is being added in this pass to keep scope tight — can revisit if the fallback stack looks inconsistent
