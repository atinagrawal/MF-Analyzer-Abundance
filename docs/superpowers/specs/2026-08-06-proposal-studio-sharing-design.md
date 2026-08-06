# Proposal Studio — Shareable Links Design

## Goal

Let a distributor share a saved proposal with their client via a public link that requires no sign-in to view, and optionally email that link directly to the client through the app. Sharing is opt-in and revocable per proposal.

## Global Constraints

- Never name the underlying holdings-data vendor in any user-facing text (existing site-wide rule).
- Reuse existing patterns rather than inventing new ones: the CAS/proposals save-then-R2 pattern, the branded-email pattern already in `auth.js`'s `buildEmail`, the inline two-step delete-confirm pattern, the existing ownership-check shape used by `/api/proposal-studio/load` and `/delete`.
- Schema changes are applied manually by the project owner via the Vercel Dashboard → Storage → Query tab (this repo's established convention — no automated migration runner exists).
- No new rate-limiting infrastructure — matches this app's existing security posture for other hard-to-guess-random-ID-gated resources.

## Decisions Made During Brainstorming

1. **Sharing is explicit and revocable**, not "any saved proposal is guessable-URL-accessible by default."
2. **Share links use a dedicated random token**, stored in its own column — never the proposal's internal `id`.
3. **Editing a loaded proposal and saving always creates a new proposal (new `id`, new/absent share token)** — this was already true of `saveProposal()` before this feature (it always `INSERT`s, never `UPDATE`s) and this design relies on that being unchanged.
4. **Anonymous viewers see the full live-page view, read-only** (not a PDF-only redirect) — including the existing Export/Print button, so they can still generate their own PDF copy.
5. **No auto-expiry** — a share link is valid until manually revoked.
6. **Sending email**: the sender types the recipient address each time, pre-filled from the proposal's saved client email if present but always editable and shown, not auto-sent silently.
7. **Data freshness: always live.** Reversed from an initial "frozen snapshot" direction during brainstorming — both the editor (on reload) and the public share link re-fetch each selected fund's *current* holdings and recompute asset allocation/sector/security exposure/overlap/M-Cap fresh on every view, exactly like today's editor-reload behavior. A share link's numbers can therefore drift from what was true when it was sent, if a fund's disclosed portfolio changes later. The R2-saved payload for a proposal is unchanged by this feature (client/advisor details + fund list only) — no new frozen-snapshot fields are added.
8. **Pro-gating applies to *creating* new proposals only** (already enforced today by `PfcProGate` blocking non-Pro users from reaching the tool at all). Managing an *existing* saved proposal (view/edit/share/unshare/send-email) is gated on **ownership alone**, not current Pro plan status — a lapsed subscription should not lock a distributor out of proposals they already legitimately created. This mirrors how CAS portfolio management isn't re-gated by plan status either.

## Data Model

One new column, added to the existing `proposals` table (`scripts/schema.sql`):

```sql
ALTER TABLE proposals ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;
CREATE INDEX IF NOT EXISTS idx_proposals_share_token ON proposals(share_token) WHERE share_token IS NOT NULL;
```

- `NULL` = not currently shared.
- A non-null value is a high-entropy random token (`crypto.randomBytes(24).toString('base64url')`, Node built-in, ~192 bits of entropy — no new dependency), generated only when sharing is turned on, distinct from the proposal's own `id`.
- `UNIQUE` so a token can never collide across proposals; the partial index keeps the index small (most rows will have `NULL`).

No changes to the R2 payload shape (decision 7 above) — it continues to store exactly what `app/api/proposal-studio/save/route.js` already writes today: client details, advisor details, `proposalType`, `sipFrequency`, `totalAmount`, `selectedFunds[]`.

## Architecture: Shared Rendering Pipeline

The live editable tool (`ProposalStudioTool` in `app/proposal-studio/ProposalStudioClient.jsx`) currently embeds, in one place, both (a) the fetch-each-selected-fund's-holdings effect and (b) the compute-and-render logic (`combineExposure`, `computeOverlap`, `computeMCapAllocation`, and the JSX for `ExposureTable` ×3, `SchemeDetailsTable`, `OverlapGrid`, `MCapTable`, `GrowthProjectionTable`, `ClosingSection`).

This feature extracts that fetch+compute+render pipeline into a shared piece reusable by:
- The existing editable tool (unchanged behavior, still has Save/Export/Delete/edit controls layered around it).
- A new **`ProposalReadOnlyView`** component, taking `{ clientName, clientEmail, clientPhone, advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin, proposalType, sipFrequency, selectedFunds }` as props (the exact shape `/load` and the new public endpoint both return), running the same holdings-fetch-and-compute pipeline, rendering the same section components read-only (no Save/Delete/edit affordances; Export/Print stays available).

`/api/proposal-studio/holdings` (the per-fund holdings-cache route) already has no auth check — it's public fund data, not user-specific — so `ProposalReadOnlyView` can safely call it from an anonymous context with no changes to that route.

## API Routes

All new routes live under `app/api/proposal-studio/`, following the existing file-per-route convention.

### `POST /api/proposal-studio/share`
Body: `{ id }`. Requires session; 403 if `session.user.id !== proposals.user_id` for that row (same ownership-check shape as `/delete`).
- If `share_token` is already set, return it unchanged (idempotent — re-clicking Share never invalidates a link already sent out).
- Otherwise generate a new token, `UPDATE proposals SET share_token = $1 WHERE id = $2`, return it.
- Response: `{ ok: true, shareToken, shareUrl }` where `shareUrl` is `${origin}/proposal-studio/view/${shareToken}`.

### `POST /api/proposal-studio/unshare`
Body: `{ id }`. Same ownership check. `UPDATE proposals SET share_token = NULL WHERE id = $1`. Response: `{ ok: true }`.

### `GET /api/proposal-studio/shared/[token]`
**Public — no `auth()` call at all.** Looks up `SELECT * FROM proposals WHERE share_token = $1`. A generic 404 (`{ error: 'Not found' }`) for both "no such token" and "token was revoked" — the two are indistinguishable to a caller, which is intentional (a revoked link should look exactly like one that never existed). On a match, fetches the R2 payload via `blob_key` (same helper `/load` already uses) and returns only the fields `ProposalReadOnlyView` needs — never `id`, `user_id`, or `blob_key` itself.

### `POST /api/proposal-studio/send-email`
Body: `{ id, toEmail }`. Requires session + ownership (same check as `/share`). Validates `toEmail` is a plausible email format server-side (basic input validation, not a security control — the route is already gated to the proposal's own owner). If the proposal isn't already shared, shares it first (reuses the `/share` logic — a share token must exist before a link can be emailed). Builds the email via `lib/proposalEmail.js` and sends it through Resend (`RESEND_KEY`, same pattern as `auth.js`). Response: `{ ok: true }`.

### Existing `/load` — unchanged
Still session+ownership gated, still what the owner's "Edit this proposal" action calls to repopulate the live editable tool's state.

## Pages

### `app/proposal-studio/view/[token]/page.js` — public
No auth. Fetches `/api/proposal-studio/shared/[token]` client-side (or server-side in an App Router server component — implementation detail for the plan phase). On a 404, shows a plain "This proposal link isn't available" message rather than a raw error. On success, renders `ProposalReadOnlyView`. Keeps the site's normal `Navbar`/`Footer` for brand consistency, matching the rest of the public site.

### `app/proposal-studio/mine/[id]/page.js` — owner only
`[id]` is the proposal's raw internal UUID (the same value `formatProposalId()` cosmetically shortens to `PROP-XXXXXXXX` for display elsewhere) — not the formatted display ID, which is not a routable identifier. Redirects to `/login` if signed out. If signed in but not the owner of `id`, a 403-style friendly message (same tone as the public 404, not a raw stack trace). Fetches via the existing `/load` route, passing `[id]` straight through as its `id` query param. Renders `ProposalReadOnlyView` plus:
- An **"Edit this proposal"** button — navigates to `/proposal-studio` and invokes the existing `loadSavedProposal(id)` flow (already present, unchanged).
- **Share / Copy Link / Unshare** controls, reflecting current `share_token` status.
- **Send Email** control (see UI section below).

## UI Changes in `ProposalStudioClient.jsx`

- Once a proposal is saved (`savedProposalId` is set), the `.pfc-actions` bar gains Share-related controls alongside the existing Save/Export buttons:
  - Not yet shared: a **"Share"** button. Clicking it calls `/api/proposal-studio/share` and then shows the resulting link with a **Copy** button.
  - Already shared: the link is shown directly (Copy button) plus an **"Unshare"** action.
  - A **"Send Email"** control opens a small inline form: an email input pre-filled from `clientEmail` if present (editable, never auto-sent without being shown), a Send button. Calls `/api/proposal-studio/send-email`.
- **"My Saved Proposals" list**: existing click-a-row-to-load-into-editor behavior is unchanged. Adds one new small **"View"** link per row (navigates to `/proposal-studio/mine/[id]`), alongside the existing Delete button. Share/Unshare/Send-Email live on the `mine/[id]` page itself, not duplicated into the list row, to keep each row from getting crowded.
- Share/Unshare have no confirmation dialog (non-destructive, instantly reversible by sharing again) — unlike Delete, which already has one.

## Email Template

New `lib/proposalEmail.js`, exporting `buildProposalShareEmail({ clientName, advisorName, advisorPhone, advisorEmail, shareUrl, proposalType })`, returning `{ subject, html, text }` matching `auth.js`'s existing `buildEmail` visual conventions (same brand green, logo, card layout, footer style). Subject: e.g. `"${advisorName} has shared an investment proposal with you"`. Body: greeting with the client's name, one line of context, a clear button linking to `shareUrl`, the advisor's name/phone/email for follow-up questions, and a short note that full terms/disclaimer are on the page itself. Sent via the same `fetch('https://api.resend.com/emails', ...)` pattern already used in `auth.js`.

## Security & Edge Cases

- Share tokens are cryptographically random (~192 bits) — brute-forcing is infeasible; no additional rate-limiting is added.
- The public route never returns `id`, `user_id`, or `blob_key` — only the rendering-relevant fields.
- `components/ProfileCompletionGate.jsx` already no-ops for `status !== 'authenticated'` visitors (verified against its existing code during this session) — no changes needed there for the public view page to work correctly for anonymous visitors.
- A proposal owner whose Pro subscription has since lapsed can still view/edit/share/unshare/email their existing proposals (decision 8) — only *creating new* proposals is Pro-gated, unchanged from today.

## Out of Scope (Explicitly Deferred)

- **Recipient feedback tied to a matching signed-in email.** The user explicitly deferred this: "Later we can implement the feedback option if the receiver is signed-in via same email ID which is written in the proposal (client's email)." Nothing in this design precludes it — the public view page already has the client's email available (from the shared payload) and could, in a future iteration, check `useSession()` against it to conditionally show a feedback affordance. Not designed or built now.
- Auto-expiring links, link analytics (view counts, "seen" timestamps), and regenerating a share link without first unsharing were all considered and intentionally left out per the decisions above (YAGNI unless requested).

## Testing Considerations (for the implementation plan)

- Unit tests for the new `share`/`unshare`/`shared/[token]`/`send-email` routes' ownership/auth branching (mirroring the existing test coverage style for `lib/portfolioAnalysis.js` and `lib/chartSvg.js` — these routes will need integration-style coverage or at minimum a documented manual test checklist, since this sandbox has no live DB/R2/Resend credentials to test against directly).
- A manual test checklist for the actual live behavior (share → copy link → open in a private/incognito window → confirm read-only rendering and no auth prompt; unshare → confirm the old link now 404s; send-email → confirm delivery and branding).
