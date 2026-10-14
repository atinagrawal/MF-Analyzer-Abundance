# Admin Client Outreach (CAS Email Capture + Custom Message) — Design

**Status:** Approved for planning
**Author:** Claude, for Atin Agarwal (Abundance Financial Services)

## 1. Goal

Atin wants to personally reach out to a handful of users who've uploaded
a CAS, to start a conversation about their portfolio. Two pieces:

1. **CAS-registered email, visible to admin.** A user's CAS PDF carries
   their email as registered with CAMS/KFintech, which may differ from
   the email they signed up to this site with — sometimes a more
   reliable contact point. Currently extracted by the parser and
   discarded.
2. **A way to send a personal, free-text email** to one user at a time
   from the admin Users tab, not the existing fixed "your portfolio is
   ready" template.

Both are admin-only. Low volume, personal outreach — not a bulk
campaign tool.

## 2. Part A: Capture CAS-registered email

**Verified, not assumed** (read `casparser`'s own source directly,
`casparser/parsers/_investor.py`): `InvestorInfo` already has an `email`
field, populated for CAMS/KFintech CAS PDFs (the large majority — "every
CAS statement carries this block by mandate"). NSDL/CDSL variants don't
print email on the statement, so it comes back as an empty string for
those — expected, not a bug to chase.

Also verified: `api/parse.py` returns the full parsed object
(`JSONResponse(content=dict_data)`) unmodified — `investor_info.email`
is already reaching the browser on every successful upload today. No
changes needed to the Python parser at all.

### 2.1 Schema

New column on `cas_portfolios`:

```sql
ALTER TABLE cas_portfolios ADD COLUMN IF NOT EXISTS cas_email TEXT;
```

Nullable, no backfill for existing rows — only new uploads after this
ships get a value. Re-parsing old CAS files to backfill isn't worth it
for this use case (low-volume manual outreach, not a report that needs
complete historical coverage).

### 2.2 Capture at save time

`app/api/cas/save/route.js` already receives the full `parsedData`
object from the browser and already extracts PANs from it server-side
(not trusted from the client, same reasoning applies here). Add,
alongside the existing PAN extraction:

```js
const casEmail = (parsedData.investor_info?.email || '').trim().toLowerCase() || null;
```

Include `cas_email` in the `INSERT INTO cas_portfolios` column list and
values.

### 2.3 Display

In `app/admin/UsersTab.jsx`'s per-CAS-upload row (the same block that
already shows `p.pan_count` and `fmtDate(p.uploaded_at)`), show the CAS
email when present. Specifically call out when it differs from the
user's account email (`selectedUser.email`) — that's the signal with
actual value here, not the email itself in isolation. Example treatment:
if `p.cas_email && p.cas_email !== selectedUser.email.toLowerCase()`,
show a small flagged line like "CAS email differs: {p.cas_email}";
otherwise show nothing extra (don't clutter the row when it matches).

`app/api/cas/list/route.js` (whatever currently returns the per-user CAS
portfolio list consumed by UsersTab) needs `cas_email` added to its
SELECT — check this file during implementation; it wasn't read during
design but follows the same shape as the existing `pan_count`/
`uploaded_at` columns already selected there.

## 3. Part B: Custom outreach email

### 3.1 Approach

Extend the *existing* per-CAS-upload "Send email notification" button
in `UsersTab.jsx` into a small compose modal, rather than building a
separate bulk-select campaign tool. Reasoning: the stated need is
personal, low-volume outreach to specific users Atin already has in
front of him in this exact UI — not a broadcast feature. YAGNI applies;
a multi-select/bulk-send tool can be a separate, later effort if the
need actually shows up.

On click, the modal offers two modes:
- **Portfolio ready** (existing behavior, unchanged) — fires the
  existing fixed template via the existing `/api/admin/notify` call,
  no further input needed.
- **Custom message** (new) — a subject field (reasonable default:
  `"Your mutual fund portfolio — {displayName}"`, editable) and a
  plain-text message textarea, no default body (Atin writes it fresh
  each time; a prefilled default would just be the fixed template
  again, defeating the point). Sent via a new API route.

### 3.2 New route: `app/api/admin/send-custom-email/route.js`

```
POST /api/admin/send-custom-email
Body: { userId, email, name, subject, message }
```

- Admin-only (`session.user.role === 'admin'`), same guard pattern as
  `app/api/admin/notify/route.js`.
- `message` is plain text from the admin; render it into the **same
  branded header/footer chrome** already in
  `app/api/admin/notify/route.js`'s `buildNotifyEmail` (logo, brand
  colors, ARN footer) but with the custom subject/body in place of the
  fixed portfolio-ready copy. Escape the plain text for HTML (newlines
  → `<br>`, escape `<`/`&`) — this is admin-authored content, not
  arbitrary user input, but still worth not trusting raw HTML injection
  into the template.
- Resend call: same `from: 'Abundance Financial Services <noreply@getabundance.in>'`
  as the existing route, **plus `reply_to: 'atin@getabundance.in'`**
  (confirmed as the existing advisor-contact address used elsewhere in
  this codebase, `app/proposal-studio/ProposalStudioClient.jsx`'s
  default `advisorEmail`) — the existing notify route has no reply-to
  at all, which is fine for an automated notification but wrong for
  something meant to start a conversation; a reply to a `noreply@`
  sender goes nowhere.
- No rate limiting beyond the existing admin-only gate — this is a
  manual, one-at-a-time action taken by a single trusted admin, not a
  user-facing endpoint that needs abuse protection.

### 3.3 UI changes in `UsersTab.jsx`

- Existing "Send email notification to client" button (currently fires
  immediately) becomes a button that opens the compose modal instead of
  sending directly.
- Modal: mode toggle (Portfolio ready / Custom message), conditional
  fields, Send button, Cancel. Reuse existing admin.css patterns rather
  than inventing new modal styling from scratch — check what modal/
  dialog patterns (if any) already exist in admin.css or elsewhere in
  this file during implementation.
- Success/error feedback: reuse whatever toast/inline-message pattern
  the existing notify-button click handler already uses (it already
  calls this endpoint today, so there's existing success/failure UI to
  match).

## 4. Error handling

- `send-custom-email`: missing `email`/`subject`/`message` → 400. Resend
  API failure → 500, surfaced to the admin in the modal (don't silently
  swallow — this is a manual action the admin needs to know failed).
- `cas/save`: `cas_email` extraction wrapped in the same
  best-effort spirit as the existing PAN extraction — if
  `investor_info` is missing or malformed, `casEmail` is simply `null`,
  never a reason to fail the whole save (CAS saving must keep working
  even if investor_info is absent, e.g. for any future parser edge case).

## 5. Testing

No test framework in this repo (confirmed convention: `npm run build` +
live spot-checks). Verify:
- Migration applies cleanly (`node scripts/migrate-cas-email.mjs`
  against the real `POSTGRES_URL`, confirm column exists via `\d
  cas_portfolios` or an equivalent query).
- Upload a real CAS (CAMS/KFin) as a test user, confirm `cas_email`
  lands in the DB row and matches the known registered email.
- Admin Users tab: confirm the CAS email displays correctly, including
  the "differs from account email" case if a test account's signup
  email differs from its CAS email.
- Send a real custom-message test email to a real inbox (e.g., Atin's
  own account), confirm: renders correctly, reply-to is
  `atin@getabundance.in`, a reply actually lands there.
- Confirm the existing "Portfolio ready" template path still works
  unchanged after the modal refactor (regression check — don't break
  the already-shipped feature while extending it).

## 6. Non-goals (explicitly out of scope for this spec)

- Bulk/multi-select sending to many users at once.
- Backfilling `cas_email` for CAS files uploaded before this ships.
- Any outbound-email compliance/consent tracking beyond what already
  applies to the existing notify feature (this is the same category of
  communication — an AMFI-registered distributor contacting their own
  platform's users about their own portfolio — not new regulatory
  surface).
- Using the CAS email as a *send-to* address for the custom message
  (only the account email is used for sending; CAS email is
  informational/reference only, per Atin's framing — "visible to admin"
  — not described as a send target).
