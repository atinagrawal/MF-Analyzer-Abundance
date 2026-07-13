# Admin Panel Redesign — Design Spec

**Date:** 2026-07-14
**Status:** Approved by user, ready for implementation planning

## Goal

The admin panel (`app/admin/page.jsx`) is clunky to use, looks unpolished relative to the rest of the site, and breaks on mobile/tablet. The user manages clients from both desktop and phone equally, so both need to be first-class, not desktop-primary-with-a-mobile-afterthought. This spec covers a full pass: layout, responsiveness, interaction consistency, and one feature gap (MF Central `.xlsx` upload support in the Add Client tab) that came up during scoping and was pulled into this same pass.

## Current State (baseline, for reference)

`app/admin/page.jsx` is 1129 lines, three tabs, entirely inline-styled (no dedicated CSS file, unlike other recently-redesigned pages such as `app/pms-screener/pms-screener.css`):

- **Users tab:** a 6-column table (User, Role, Portfolios, Last Upload, Joined, Change Role) plus, when a row is selected, a `grid-template-columns: 1fr 340px` side panel showing that user's CAS portfolios (view/delete) — the grid never collapses on narrow viewports.
- **Add Client tab:** single-column form (create client → optionally upload their CAS as a `.pdf`). Already reasonably mobile-friendly; only accepts `.pdf`, not MF Central's `.xlsx` report.
- **Manual Holdings tab:** client picker, an add/edit form using a fixed `grid-template-columns: 1fr 1fr` (never collapses), and an 8-column holdings table. Holding delete uses native `confirm()`/`alert()`, inconsistent with the inline two-step confirm pattern already used elsewhere on this same page (CAS delete, PAN rename on the CAS Tracker page).

Sitewide conventions already established (from `app/globals.css` and other pages) that this redesign follows rather than reinvents:
- Forest-green design tokens (`--g1`/`--g2`/`--g3`, `--neg`, `--warn`, etc.), Raleway + JetBrains Mono, `.container` max-width 1100px.
- Two standard breakpoints: `640px` (mobile) and `768px` (tablet).
- Wide tables use `.table-wrap` (`overflow-x: auto` + a "swipe for more →" hint) — already handles horizontal scroll well site-wide.
- User explicitly chose **not** to adopt the bespoke "editorial" look built for the PMS Screener redesign — this is an internal tool, so it stays visually consistent with the rest of the site's standard components, just polished and properly responsive.

## Decisions Made During Brainstorming

1. **Visual direction:** standard site look and components, cleaned up — not a new bespoke visual identity.
2. **Device priority:** desktop and mobile/tablet are equally important.
3. **Users tab mobile behavior:** confirmed via wireframe comparison — **drill-down**, not stacking or a bottom sheet. Tapping a user replaces the list with a full-width detail view and a "← Back to Users" button (standard mobile list→detail pattern), rather than pushing the detail panel below the table (awkward long-scroll) or a bottom-sheet overlay.
4. **Users table on mobile:** confirmed via wireframe comparison — **stacked cards**, not a horizontally-scrolled table. The Users list is the first thing anyone sees on this page; side-scrolling through 6 columns for every row was judged worse than reformatting into cards (avatar, name/email, role badge, "N portfolios · joined DATE" subline).
5. **Additional fixes pulled into this pass** (user confirmed both, plus later removed all remaining scope boundaries):
   - Replace `confirm()`/`alert()` in the Manual Holdings delete flow with the same inline two-step confirm already used for CAS delete and PAN rename.
   - Role management currently exists in two conceptual places (a table column on desktop selection, and implicitly nowhere on mobile since the column can't fit) — consolidate to **one place**: the user detail panel/drill-down. Remove it as a standalone table column.
   - Add MF Central `.xlsx` upload support to the Add Client tab's CAS upload step, reusing `/api/parse-mfcentral` (already built and shipped for the main CAS Tracker page — no new backend work, just wiring the same extension-detection + endpoint-selection logic used in `app/cas-tracker/page.js:handleSubmit`).

## Architecture

**New file: `app/admin/admin.css`**, imported once at the top of `app/admin/page.jsx`. All inline `style={{}}` objects in this file get migrated to real CSS classes in this stylesheet, mirroring the `pms-screener.css` pattern already established elsewhere in the codebase. This is what makes responsive breakpoints maintainable — inline styles can't express `@media` queries.

**Technical approach for table→card switching (Users list, Holdings list):** render **both** representations in JSX — a `<table>` and a card-list `<div>` — and toggle which is visible with a CSS media query (`display: none` / `display: block` at the **768px** breakpoint), rather than a JS viewport-width hook that conditionally renders different JSX. This avoids resize-listener complexity and hydration-mismatch risk (SSR doesn't know the client's viewport width), and matches how responsive layout is already handled everywhere else in this codebase — CSS-driven, not JS-driven. The tradeoff is slightly more DOM (~2x markup for these two lists), which is an acceptable cost for a low-traffic internal admin tool.

**Why tables switch at 768px but the Holdings form collapses at 640px (see Manual Holdings Tab below):** these solve different problems. A dense 6–8 column data table doesn't comfortably fit even at tablet width, so both phone and tablet get cards, only desktop gets the table (768px cutoff). A 2-field-wide form row is still comfortable at tablet width — only phones are cramped — so the form only collapses to one column below 640px, keeping two columns through tablet. This is an intentional difference, not an inconsistency.

## Per-Tab Design

### Users Tab

**Desktop (≥768px):** Table view largely unchanged in structure, restyled via the new CSS classes. The **Change Role column is removed** from the table. Selecting a row still opens the existing side detail panel (`1fr 340px` grid, this part already works fine on desktop and isn't changing), but the detail panel now also contains the role-change control (moved from the table), directly below the user's name/email header and above the CAS Portfolios list.

**Mobile/tablet (<768px):** The table is replaced (via the CSS toggle described above) by a stacked card list: avatar, name, email, role badge, and a "N portfolios · joined DATE" subline. Tapping a card triggers a drill-down: the card list is hidden and a full-width detail view renders in its place, with a "← Back to Users" button at the top, followed by the same detail content as desktop's side panel (name/email header, role-change control, CAS Portfolios list with existing view/delete actions).

**State model:** the existing `selectedUser` state already captures "which user is being viewed" — the drill-down is a rendering concern (which layout shows the detail content), not a new state variable. Add one new boolean state, `mobileDetailOpen`: set `true` on card tap (alongside calling the existing `selectUser(u)`), set `false` by the "← Back to Users" button. The CSS toggle for card-list vs. table (see Architecture) governs desktop vs. mobile/tablet layout selection; `mobileDetailOpen` governs, within the mobile/tablet layout only, whether the card list or the drill-down detail view is showing. The desktop side panel is unaffected by `mobileDetailOpen` and always shows whenever `selectedUser` is set, exactly as it does today.

### Add Client Tab

- Structural layout unchanged (already single-column, already mobile-friendly) — light spacing/visual polish only, migrated to the new CSS classes for consistency with the rest of the page.
- CAS upload step: file input `accept` changes from `.pdf` to `.pdf,.xlsx`; an extension check (mirroring `app/cas-tracker/page.js`'s existing `handleSubmit` logic) determines whether the password field is required and shown, and whether the upload POSTs to `/api/parse` or `/api/parse-mfcentral`. The parsed result then flows into the existing `/api/cas/save` call with `targetUserId` exactly as it does today — no change to the save step.

### Manual Holdings Tab

- **Add/edit form:** the fixed `grid-template-columns: 1fr 1fr` becomes a CSS class with a `@media (max-width: 640px) { grid-template-columns: 1fr; }` override — standard single-column collapse on mobile, all fields keep their existing labels/validation/behavior.
- **Holdings table:** same table→card CSS-toggle treatment as the Users list. Desktop keeps the existing 8-column table. Mobile/tablet cards show: fund name + type badge (prominent, matching the table's current first-column treatment), then a compact 2-column grid of Units / Purchase NAV / Current NAV / Current Value / Gain-Loss, then action buttons (edit/delete) at the bottom of the card.
- **Delete confirmation:** `handleDelete`'s `confirm()`/`alert()` calls are replaced with the same inline two-step confirm UI already implemented for CAS delete on the Users tab and for PAN rename on the CAS Tracker page (arm on click, show "Delete? [Delete] [Cancel]" inline, confirm or cancel — no browser dialog).

## Error Handling

No new error paths are introduced — this is a layout/interaction redesign, not new business logic (aside from the `.xlsx` wiring, which reuses `/api/parse-mfcentral`'s existing, already-shipped error handling verbatim). Existing loading states (`loading`, `portsLoading`, skeleton placeholders) carry over unchanged; they just render inside the new card/table layouts depending on viewport.

## Testing

Manual verification across the three breakpoint zones (mobile <640px, tablet 640–768px, desktop ≥768px) for:
- Users tab: card list renders and looks right on mobile, table renders on desktop, drill-down opens/closes correctly, role change works from the detail panel (both mobile drill-down and desktop side panel), CAS delete still works in both layouts.
- Add Client tab: `.pdf` flow unchanged; `.xlsx` flow correctly skips the password field and saves via `/api/parse-mfcentral`.
- Manual Holdings tab: form collapses to one column on mobile without breaking any field's validation; holdings render as cards on mobile / table on desktop; add/edit/delete all still work; delete uses the new inline confirm, no browser popup.

No automated test suite exists for this page currently (consistent with the rest of this Next.js app, which relies on manual verification for UI work) — not introducing one is intentional, matching existing project conventions, not a gap in this spec.
