# Book a Consultation Page — Design

## Summary

Build a new page, `app/book-consultation/page.jsx`, that lets any site visitor book a consultation directly on `mfcalc.getabundance.in` via an embedded Cal.com (hosted, free tier) calendar. No sign-in is required, but the visitor's email is verified with a 6-digit one-time code (reusing the site's existing Resend email integration) before the booking widget is revealed, to stop spam/fake bookings. The existing "📅 Book a Consultation" button in `components/Footer.jsx`'s home-variant CTA column — currently linking externally to `https://www.getabundance.in/contact-us` — is repointed to this new internal page.

## Background

Grepped the whole repo for "consultation"/"book a consultation": the button exists in exactly one place, `components/Footer.jsx`'s Column 3 ("Start Your Journey" CTA), rendered only when `variant="home"` is passed — which only `app/page.js` (the homepage) does. It currently opens `https://www.getabundance.in/contact-us` in a new tab, sending visitors off this site entirely.

Two booking-service options were considered: Calendly (fastest, proven, zero infra) and Cal.com (open-source, API-driven). Cal.com was chosen — specifically its **hosted** free tier, not self-hosting. Self-hosting Cal.com would mean deploying Cal.com's own separate Next.js app + Postgres + Redis + background workers somewhere else entirely — a second infrastructure project, out of proportion with this site's existing lean Vercel Hobby + Neon Postgres + Vercel Blob footprint (see `project-overview` conventions). The hosted free tier gives the same open-source product and embeddable widget with zero extra infra.

This site already has a working Resend-based one-time-code email flow (`auth.js`'s `sendVerificationRequest`, `app/api/auth/verify-otp/route.js`, `otp_codes`/`otp_attempts` tables) built for sign-in. This design reuses that *pattern* — code generation, attempt-limited verification, delete-before-insert to invalidate stale codes — but does **not** reuse those *tables*. Sign-in codes and consultation-verification codes are different trust domains: letting someone burn failed attempts against `otp_attempts` by spamming wrong consultation codes would also lock that email out of signing in, an unrelated feature. Two new, dedicated tables keep the two gates independent.

## 1. Database

Two new tables in `scripts/schema.sql`, structurally similar to `otp_codes`/`otp_attempts` but with no `token` column — there is no NextAuth callback to proxy to here, just a boolean "this email is verified for the next 15 minutes" gate:

```sql
CREATE TABLE IF NOT EXISTS consultation_otp (
  identifier TEXT        NOT NULL,   -- email
  code       TEXT        NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, code)
);

CREATE TABLE IF NOT EXISTS consultation_otp_attempts (
  identifier TEXT PRIMARY KEY,
  attempts   INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Same 5-attempts/15-minute lockout shape as the sign-in flow; same delete-then-insert-on-resend rule so only the newest code for an email is ever valid.

## 2. Backend routes

**`POST /api/consultation/send-code`** — body `{ name, email }`.
1. Validate email format and non-empty name (400 `invalid_request` otherwise).
2. Generate `code = randomInt(100000, 1000000).toString()`, `expires = now + 15min`.
3. `DELETE FROM consultation_otp WHERE identifier = $1` then `INSERT` the new row — invalidates any prior outstanding code for that email first (same fix already applied to the sign-in flow's `otp_codes` table).
4. Send a branded email via the same Resend API call pattern as `auth.js` — a trimmed template showing only the 6-digit code (no magic link — there is nothing to link to in this flow), reusing the same brand colors/logo/footer text as `buildEmail()`.
5. Wrapped in try/catch → `{ ok:false, error:'server_error' }` at 500 on any failure (built in from the start, not a follow-up fix).

**`POST /api/consultation/verify-code`** — body `{ email, code }`.
1. Validate email format and 6-digit code format (400 on mismatch, distinct error codes `invalid_email` / `invalid_code_format`).
2. Check `consultation_otp_attempts`: if `attempts >= 5` and last failure within 15 minutes, return `too_many_attempts` immediately without checking the code.
3. Look up `consultation_otp` for `(identifier: email, code)`; not found or expired → increment `consultation_otp_attempts`, return `wrong_code` (never distinguish "wrong" from "expired" in the response, closing the same information leak the sign-in flow avoids).
4. Found and valid → delete the row, reset `consultation_otp_attempts` to zero, return `{ ok: true }`. No cookie is set — this route has no session to issue, only a client-side "show the embed now" signal.
5. Wrapped in try/catch → `{ ok:false, error:'server_error' }` at 500.

## 3. Page (`app/book-consultation/page.jsx`)

Client component, three sequential states:
- **`form`** — name + email inputs, "Send verification code" button → calls `send-code`, moves to `verify` state on success.
- **`verify`** — 6-digit code input (same sanitized numeric-only input pattern as `app/login/page.jsx`'s code screen), "Verify" button → calls `verify-code`. Shows the specific error (`wrong_code` / `too_many_attempts` / `server_error`) inline. "Resend code" link re-calls `send-code` for the same name/email.
- **`booking`** — renders the Cal.com inline embed via `@calcom/embed-react`:
  ```jsx
  import Cal, { getCalApi } from '@calcom/embed-react';
  // ...
  <Cal
    calLink="abundance/consultation"
    calOrigin="https://cal.eu"
    config={{ name, email, theme: 'light' }}
    style={{ width: '100%', height: '100%', minHeight: '700px' }}
  />
  ```
  Confirmed live event type: `cal.eu/abundance/consultation` — "Free consultation," 30 min, Cal Video, synced to the business's Google Calendar. `@calcom/embed-react` defaults its embed script origin to `app.cal.com`; since this account lives on Cal.com's EU data-residency domain (`cal.eu`) instead, the embed must be pointed at `calOrigin="https://cal.eu"` explicitly (and `getCalApi({ namespace, origin: "https://cal.eu" })` for the JS API calls that configure theming) — verify this against `@calcom/embed-react`'s current docs at implementation time, since the exact prop name/behavior for a non-default origin is the one part of this integration not yet hand-tested. Embed themed via Cal.com's own `ui` config to match the site's forest-green palette (`--g1: #1b5e20`) as closely as Cal.com's theming API allows.

Name/email are prefilled into the embed via the `config` prop; this is a convenience and the anti-spam mechanism (the verification gate itself), not a hard lock on Cal.com's own form — a visitor could still in principle edit the email field inside Cal.com's iframe before submitting. That's an accepted, minor gap: the goal is stopping drive-by spam/typo'd emails at the gate, not cryptographically binding the eventual Cal.com booking record to the verified address.

If the Cal.com embed script fails to load (network issue, ad-blocker), show a plain-text fallback: "Having trouble loading the calendar — call +91 98081 05923 or WhatsApp us" (same phone number already in `Footer.jsx`).

## 4. Footer change

`components/Footer.jsx`'s CTA button (currently lines 134-144):
```jsx
<a href="https://www.getabundance.in/contact-us" target="_blank" rel="noopener noreferrer" className="dfc-cta-btn">
```
becomes an internal Next.js `<Link href="/book-consultation" className="dfc-cta-btn">`, dropping `target="_blank"`/`rel` (no longer an external navigation). The secondary "Visit getabundance.in →" link (lines 145-152) is untouched — it keeps pointing to the external main site as a secondary contact option.

## Error handling summary

- Client-side validation (email format, 6-digit code) before any network call, same as the existing login page's code screen.
- Every documented `error` value is a generic, non-leaking string (`invalid_request | invalid_email | invalid_code_format | too_many_attempts | wrong_code | server_error`) — mirrors the contract already established by `app/api/auth/verify-otp/route.js`.
- Both new routes wrapped in try/catch from the first commit (the sign-in feature needed a follow-up fix to add this; building it in from the start here).
- Cal.com embed load failure has a plain-text phone/WhatsApp fallback so there's always a way to reach the business.

## Testing approach

No test runner configured in this repo (established convention). Verification: `npm run build` for a clean compile; a standalone script exercising `consultation_otp_attempts`' lockout logic (increment/reset/block-at-5 — same shape already validated for the sign-in attempt limiter); a manual walkthrough (request a code, receive it, enter correctly and see the embed appear prefilled; enter a wrong code repeatedly and confirm lockout; confirm a fresh code request after lockout expiry); confirm the Footer button on the homepage now links to `/book-consultation` instead of the external site; visual check of the embed on mobile width.
