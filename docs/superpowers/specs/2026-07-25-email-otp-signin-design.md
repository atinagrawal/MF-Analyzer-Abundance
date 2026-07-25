# Email OTP Sign-In — Design

## Summary

Add a 6-digit email code as a second sign-in delivery option alongside the existing magic link, without maintaining two separate secret/token systems. Both options are generated and sent together in one email; the user's choice on the login page only changes which confirmation UI they see next. Solves the core complaint with magic links — the email link often opens in a different browser/app than the one the user started in, losing their place — for anyone who picks the code instead.

## Background

Current auth: NextAuth v5, database session strategy (`@auth/pg-adapter`, Postgres), two providers — Google OAuth and a customized Resend "email" provider (`auth.js`) that sends a magic link. The `verification_token` table (`identifier`, `expires`, `token`) already exists exactly as the adapter expects; no schema changes needed there.

Traced NextAuth's internal email sign-in flow (`@auth/core/lib/actions/signin/send-token.js`) directly in `node_modules` to confirm the exact integration points:
- `provider.generateVerificationToken?.()` — if present, its return value becomes the token; otherwise NextAuth generates its own 32-char random string. This is the only hook available, and it takes **no arguments** — it cannot know per-request whether the user asked for a link or a code.
- The raw (unhashed) token is passed to `sendVerificationRequest` directly, alongside a pre-built callback `url` that embeds that same token (`/api/auth/callback/resend?token=...&email=...&callbackUrl=...`).
- The DB only ever stores `createHash(token + secret)` — never the plaintext token/code.
- The callback endpoint (`@auth/core/lib/actions/callback/index.js`) re-hashes the submitted token, looks up the row via `adapter.useVerificationToken` (single-use — deletes on read), and checks expiry. No built-in attempt/rate limiting exists at this layer — it's designed around a 32-char token being infeasible to brute-force, which no longer holds once the token is a 6-digit number.

Because `generateVerificationToken` can't vary per-request, there is no clean way to make "link" and "code" two different secret formats sharing one provider config. The design instead uses **one shared 6-digit secret for every sign-in request**, presented as both a code and a link in the same email — solving "offer both" without a second provider or a second token type.

## 1. Token generation and expiry

`auth.js`'s Resend provider gains:
```js
generateVerificationToken: () => crypto.randomInt(100000, 1000000).toString(),
maxAge: 15 * 60, // 15 minutes — was 24 hours
```
This applies uniformly: every sign-in request (regardless of which button the user clicked) now produces a 6-digit code valid for 15 minutes. This is a real, user-visible behavior change from today's 24-hour magic link window — accepted as the cost of adding the code option safely.

## 2. Brute-force protection

A new table, `otp_attempts`:
```sql
CREATE TABLE IF NOT EXISTS otp_attempts (
  identifier TEXT PRIMARY KEY,
  attempts   INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- On each **wrong** code verification: `INSERT ... ON CONFLICT (identifier) DO UPDATE SET attempts = otp_attempts.attempts + 1, updated_at = NOW()`.
- Before allowing a verification attempt: if `attempts >= 5`, reject immediately without checking the code, with a message directing the user to request a new one.
- On a **successful** verification: `DELETE FROM otp_attempts WHERE identifier = $1`.
- Requesting a new code does **not** reset the counter — only a successful sign-in does. This closes the obvious bypass (repeatedly requesting fresh codes to get a fresh guess budget).
- Accepted tradeoff: an attacker who doesn't know the code can still deliberately burn a victim's 5 attempts to lock them out for up to 15 minutes. This is the same tradeoff essentially all PIN/OTP-based systems make (e.g. banking apps); it self-resolves and never exposes the account itself.

## 3. Verification endpoint

New route, `app/api/auth/verify-otp/route.js` (`POST { email, code, callbackUrl }` — the client sends its own `from`/`callbackUrl` value alongside the code, the same one it already passed to `signIn('resend', { callbackUrl: from, ... })` when requesting the code):
1. Check `otp_attempts` for that email; if `attempts >= 5`, return an error immediately.
2. Make a server-to-server `fetch` (same origin, `redirect: 'manual'`) to NextAuth's own `/api/auth/callback/resend?token={code}&email={email}&callbackUrl={callbackUrl}` — reusing NextAuth's existing, already-correct hash-and-consume-and-issue-session logic rather than reimplementing it (the hashing/secret internals live in non-public `@auth/core` internal paths not intended as a stable dependency surface).
3. Inspect the response: a `Set-Cookie` header present means success — forward that header onto the actual client response, reset `otp_attempts` for that email, and return `{ ok: true }`.
4. No `Set-Cookie` (redirect to an error page instead) means a wrong or expired code — increment `otp_attempts`, return `{ ok: false, error: '...' }` distinguishing "wrong code" from "too many attempts" from "expired, request a new one."

## 4. Email template

`auth.js`'s `sendVerificationRequest` (already customized with a branded HTML template) is updated to show, in one email, sent identically regardless of which login-page button triggered it:
- The 6-digit code, large and prominent (monospace, letter-spaced).
- The existing "Sign in to Abundance →" button, still linking to the same `url` (which embeds that same code) — clicking it works exactly as today's magic link does.
- Copy updated from "expires in 24 hours" to "expires in 15 minutes."

## 5. Login page (`app/login/page.jsx`)

Replace the single "✉ Send sign-in link" button with two: **"✉ Email me a link"** and **"🔢 Email me a code"**. Both call the exact same `signIn('resend', { email, callbackUrl: from, redirect: false })` — the only difference is a new `deliveryMode` state (`'link' | 'code'`) set by which button was clicked, controlling which confirmation UI renders next:
- `deliveryMode === 'link'`: today's existing "Check your email, click the link" screen — unchanged, copy updated to "15 minutes."
- `deliveryMode === 'code'`: a new confirmation screen with a 6-digit code input and a "Verify" button. Submitting `POST`s `{ email, code, callbackUrl: from }` to `/api/auth/verify-otp`. On `{ ok: true }`, hard-navigate (`window.location.href = from`) so the freshly-set session cookie is picked up cleanly (matches how clicking the magic link already causes a full navigation) rather than relying on the client-side session hook to notice a cookie it didn't set itself. On `{ ok: false }`, show the specific error (wrong code / too many attempts / expired) and offer "Resend code" (re-triggers the same `signIn('resend', ...)` call).

## Testing approach

No test runner is configured in this repo (established convention). Verification: `npm run build` for a clean compile, a standalone script exercising the attempt-limiter's SQL logic (increment/reset/block-at-5) against a local check, and a manual walkthrough of both delivery modes end-to-end — request a link and click it, request a code and type it (including a deliberately wrong code, and hitting the 5-attempt limit), confirm both still work off the same email/token, and confirm Google OAuth sign-in is unaffected.
