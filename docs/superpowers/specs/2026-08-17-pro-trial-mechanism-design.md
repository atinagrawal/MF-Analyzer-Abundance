# Time-Boxed Pro Trial Mechanism (Design)

## Goal

Let the admin (Atin) grant a prospective client a time-boxed Pro trial from
the existing admin panel — attributable to their real account, auto-expiring
without manual revocation, visible to both the admin and the client
themselves, and followed by exactly one automatic "trial ended" email. This
is sub-project 1 of 2 (sub-project 2, a per-user rate limiter applied
uniformly regardless of plan tier, is a separate, independent spec — see
the user's original framing: "No unfair usage allowed to users even if they
have paid for it").

## Background — what already exists

This app already has almost all the plumbing this feature needs:

- `users.plan` (TEXT, default `'free'`) and `users.plan_expires_at`
  (TIMESTAMPTZ, nullable) already exist (`scripts/schema.sql`).
- `auth.js`'s session `callback` already computes live Pro access from
  those two columns on every session read — `isProAnnual = plan === 'pro'
  && expires && expires > new Date()` — so an already-passed
  `plan_expires_at` already correctly downgrades a user to free with **no
  cron job or scheduled task needed**. This is the mechanism a trial reuses
  directly; it does not need reinventing.
- `app/admin/UsersTab.jsx` already has a Plan `<select>` (Free / Pro / Pro
  Lifetime) wired to `PATCH /api/admin/users`, which the admin already uses
  today to manually grant Pro. The one gap: that endpoint only ever sets
  `plan`, never `plan_expires_at` — so granting Pro today is always
  permanent. That gap is this feature's entire surface area.
- `components/Navbar.jsx`'s account dropdown already shows the *signed-in
  user's own* role/plan badges (`role`, then `★ Lifetime` / `★ Pro` /
  `Free`), plus a renewal reminder ("Pro expires in N days — Renew →")
  currently scoped to `planTier === 'annual'` only.
- `scripts/send_lifecycle_emails.mjs` (run daily via
  `.github/workflows/lifecycle-emails.yml`, 09:00 IST) already sends two
  one-shot lifecycle emails via Resend, deduped per-user-per-type through
  a `lifecycle_emails_sent (user_id, email_type)` UNIQUE table. A trial-ended
  email is a third instance of this exact, already-proven pattern.

## Data model

**No new tables. One new allowed value for an existing column.**
`users.plan` gains `'trial'` alongside its existing `'free'` / `'pro'` /
`'pro_lifetime'` values (the column is plain `TEXT` with app-level
validation via a `VALID_PLANS` array in the PATCH route — no DB migration
needed beyond that array).

**A trial's row is never reset back to `'free'` after it expires.** The
session callback already treats an expired `plan_expires_at` as "no active
access," so leaving `plan = 'trial'` in the database forever after expiry
costs nothing functionally and directly satisfies "mark the client with
trial used for future reference" — an admin looking at that user later
sees `plan = 'trial'` with a past `plan_expires_at` and knows a trial
happened, without a dedicated `trial_used` boolean.

**Correctness fix bundled into this change:** today, when an admin manually
sets `plan` via the dropdown, `plan_expires_at` is never touched. If a
user's trial expired (leaving a *past* `plan_expires_at` in the row) and
the admin later manually upgrades them to full `'pro'` or `'pro_lifetime'`,
`getUserPlan()`'s expiry check would incorrectly read that leftover past
timestamp and treat the new grant as already-expired. The PATCH route fix
(below) closes this by always clearing `plan_expires_at` to `NULL` when the
admin sets any plan *other than* `'trial'`.

## `PATCH /api/admin/users` changes

- `VALID_PLANS` gains `'trial'`.
- New optional body field `trialDays` (integer), required and validated
  (1–30 inclusive — a generous cap, not the actual expected range, purely
  to reject a malformed/malicious request rather than to suggest 30-day
  trials are expected usage) when `plan === 'trial'`.
- Branch on `plan`:
  - `plan === 'trial'`: `UPDATE users SET plan = 'trial', plan_expires_at = NOW() + ($trialDays || ' days')::interval WHERE id = $userId`.
  - Any other plan value: `UPDATE users SET plan = $plan, plan_expires_at = NULL WHERE id = $userId` (the correctness fix above — Free/Pro/Pro Lifetime granted through this admin route are always permanent until next changed).
- The Razorpay webhook route (`app/api/webhooks/razorpay/route.js`) is
  **not** touched — it already sets its own correct `plan_expires_at` for
  real paid annual purchases, independent of this admin-panel path.

## Admin UI (`app/admin/UsersTab.jsx`)

- The Plan `<select>` gains a `"Start Trial"` option. Selecting it reveals
  a small secondary duration control (1 / 3 / 7 days — the admin picks each
  time, confirmed with the user; no fixed default) that must be set before
  the change is submitted.
- `PlanBadge` gains two new states, both reusing the existing badge visual
  language (small uppercase pill):
  - Active trial (`plan === 'trial'` and `plan_expires_at` in the future):
    a distinct color (not the same green as Pro, to keep it visually
    distinguishable at a glance) reading `TRIAL · N day(s) left`.
  - Expired trial (`plan === 'trial'` and `plan_expires_at` in the past):
    a muted/grey pill reading `Trial used`.
- No other admin-panel change — the existing user list, detail panel, and
  role/distributor controls are untouched.

## Session/access gating (`auth.js`)

The session callback's existing plan-normalization block gains one branch,
following the exact shape of the existing `isProAnnual` check:

```js
const isLifetime  = plan === 'pro_lifetime';
const isProAnnual = plan === 'pro'   && expires && expires > new Date();
const isTrial     = plan === 'trial' && expires && expires > new Date();
session.user.plan          = (isLifetime || isProAnnual || isTrial) ? 'pro' : 'free';
session.user.planTier      = isLifetime ? 'lifetime' : isProAnnual ? 'annual' : isTrial ? 'trial' : 'free';
session.user.planExpiresAt = (isProAnnual || isTrial) ? expires.toISOString() : null;
```

`session.user.plan` still normalizes to the same `'pro'`/`'free'` values
every existing Pro-gate in the app already checks (Proposal Studio's
`isPro`, `lib/plan.js`'s `requirePro`, etc.) — **zero other call sites
change.** Only code that wants trial-specific behavior (the Navbar badge,
the admin panel) reads the new `planTier === 'trial'` value.

## Client-facing visibility (`components/Navbar.jsx`)

- The account dropdown's plan badge gains a `planTier === 'trial'` case,
  e.g. `⏱ Trial`, following the same conditional-styling pattern already
  used for `Lifetime`/`Pro`/`Free`.
- The existing renewal-reminder line (currently gated to `planTier ===
  'annual'` only) is generalized to also fire for `planTier === 'trial'`,
  reading "Trial expires in N day(s) — Upgrade →" (linking to `/pricing`,
  same as the existing annual-renewal reminder). While generalizing this,
  fix a small pre-existing rough edge: special-case `daysToExpiry <= 0` to
  read "Trial expires today" rather than "expires in 0 days" — worth doing
  now since trials are commonly 1 day and will realistically hit this case
  often, unlike the existing annual-renewal reminder which rarely reaches
  exactly 0.

## Trial-ended email

Extends `scripts/send_lifecycle_emails.mjs` with a third block, following
the file's existing `day3_nudge`/`day14_winback` pattern exactly (same
`sendLifecycleEmail` helper, same dedup mechanism, same file — no new
script, no new GitHub Actions workflow):

```sql
SELECT u.id, u.name, u.email
FROM users u
WHERE u.plan = 'trial'
  AND u.plan_expires_at IS NOT NULL
  AND u.plan_expires_at <= NOW()
  AND NOT EXISTS (SELECT 1 FROM lifecycle_emails_sent l WHERE l.user_id = u.id AND l.email_type = 'trial_ended')
  AND u.email IS NOT NULL
```

A new `buildTrialEndedEmail({ name })` template (same visual wrapper as
the existing two templates), subject along the lines of "Your trial has
ended", body linking to `/pricing`. Sent once per user, ever — the
existing `UNIQUE(user_id, email_type)` constraint on
`lifecycle_emails_sent` is the only guard needed, matching the file's
existing two email types exactly. Per explicit product decision:

- **No** "trial ends tomorrow" reminder before expiry (most trials are 1
  day, so it wouldn't land in time to matter).
- **No** automatic follow-up after the one "trial ended" email — any
  further nudge happens outside the app, on the admin's own initiative
  (no in-app resend button).

## Error handling / edge cases

- Admin selects "Start Trial" without picking a duration: the UI blocks
  submission (duration control has no valid default — it must be
  explicitly set).
- `trialDays` outside 1–30 in the PATCH request body: `400`.
- A user is granted a second trial after their first one expired: allowed
  (no blocking logic — the "mark for reference" ask is about visibility
  for the admin's own judgment, not automated prevention). The badge
  simply flips from "Trial used" back to an active "TRIAL" pill, and the
  `trial_ended` email dedup key is per-user-per-type — a second trial's
  end would **not** re-trigger the email under the current
  `UNIQUE(user_id, email_type)` constraint. This is a known, accepted
  limitation for v1 (re-granting trials is expected to be rare and
  manually judgment-driven); worth revisiting only if repeat trials
  become common enough that the missed second email matters.
- A user's session is already loaded (cached in their browser) when an
  admin grants or a trial expires: no special handling needed — this app's
  session model already re-reads `plan`/`plan_expires_at` from the
  database on normal session refresh (the existing annual-plan expiry
  already relies on exactly this, unchanged behavior).

## Testing

- No new pure-logic module is introduced (this is a small, additive change
  spread across an existing route, an existing auth callback, and two
  existing UI files), so there's no natural new `lib/` file for a
  `tests/*.test.js` unit test under this repo's plain-Node convention.
  Verification for this feature is manual: grant a short trial to a test
  account via the admin panel, confirm the client sees the Navbar badge
  and expiry reminder, let it expire (or manually adjust
  `plan_expires_at` in the DB for a fast test), confirm access reverts to
  free and the "Trial used" badge appears, and confirm the lifecycle
  script's new query picks it up on a manual `node
  scripts/send_lifecycle_emails.mjs` run against a test database.

## Out of scope (this sub-project)

- The per-user rate limiter (sub-project 2, separate spec).
- Any change to the Razorpay checkout/webhook flow.
- Blocking or limiting repeat trials for the same user.
- An in-app "resend trial-ended email" button.
- A pre-expiry ("trial ends tomorrow") reminder email.
