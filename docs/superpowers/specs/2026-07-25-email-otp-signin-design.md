# Email OTP Sign-In — Design

> **Revision note (2026-07-26):** the original version of this spec had every sign-in request generate a 6-digit code and used that SAME code as NextAuth's own URL token — i.e. the code WAS the secret NextAuth's `/api/auth/callback/resend` endpoint checks. A background security review correctly flagged this as critical: that endpoint is a public, always-reachable part of NextAuth's own catch-all route handler (`app/api/auth/[...nextauth]/route.js`), completely independent of any attempt-limiter built into this app's own routes. An attacker who knows a user's email could brute-force all 1,000,000 six-digit combinations directly against NextAuth's endpoint within the 15-minute window, never touching this app's attempt-limited `/api/auth/verify-otp` route at all — a full account-takeover path, and a regression versus today's 32-character random token (infeasible to brute-force). This revision decouples the two secrets: the design below is the corrected version.

## Summary

Add a 6-digit email code as a second sign-in delivery option alongside the existing magic link. The two now use **separate secrets**: NextAuth's own high-entropy token still gates the actual link (unchanged security properties from today), and a short-lived, independently-generated 6-digit code is mapped to that real token in a new table this app controls end-to-end. Both are shown in the same email; the user's choice on the login page only changes which confirmation UI they see next. Solves the core complaint with magic links — the email link often opens in a different browser/app than the one the user started in, losing their place — for anyone who picks the code instead.

## Background

Current auth: NextAuth v5, database session strategy (`@auth/pg-adapter`, Postgres), two providers — Google OAuth and a customized Resend "email" provider (`auth.js`) that sends a magic link. The `verification_token` table (`identifier`, `expires`, `token`) already exists exactly as the adapter expects; no schema changes needed there.

Traced NextAuth's internal email sign-in flow (`@auth/core/lib/actions/signin/send-token.js`) directly in `node_modules` to confirm the exact integration points:
- `provider.generateVerificationToken?.()` — if present, its return value becomes the token; otherwise NextAuth generates its own 32-char random string. This is the only hook available, and it takes **no arguments** — it cannot know per-request whether the user asked for a link or a code.
- The raw (unhashed) token is passed to `sendVerificationRequest` directly, alongside a pre-built callback `url` that embeds that same token (`/api/auth/callback/resend?token=...&email=...&callbackUrl=...`).
- The DB only ever stores `createHash(token + secret)` — never the plaintext token/code.
- The callback endpoint (`@auth/core/lib/actions/callback/index.js`) re-hashes the submitted token, looks up the row via `adapter.useVerificationToken` (single-use — deletes on read), and checks expiry. No built-in attempt/rate limiting exists at this layer — it's designed around a 32-char token being infeasible to brute-force, which no longer holds once the token is a 6-digit number.

Because `generateVerificationToken` can't vary per-request, there is no clean way to make "link" and "code" two different secret formats sharing one provider config — but the security review made clear they must NOT share one secret either, since anything usable as the URL token is exposed to unlimited direct guessing against NextAuth's own public callback endpoint. The design instead keeps NextAuth's own token generation untouched (full entropy, exactly as secure as today) and layers an independent, app-owned 6-digit code on top, mapped to that real token in a new table. Brute-forcing the code only gets an attacker as far as this app's own attempt-limited `/api/auth/verify-otp` route — it can never be used directly against NextAuth's callback endpoint, because NextAuth's endpoint has never heard of "codes" at all, only the real token.

## 1. Token generation and expiry

`auth.js`'s Resend provider gains only:
```js
maxAge: 15 * 60, // 15 minutes — was 24 hours
```
`generateVerificationToken` is **not** overridden — NextAuth keeps generating its own high-entropy random token for `verification_token`/the URL, unchanged from today's security properties. Shortening `maxAge` to 15 minutes still applies (a shorter-lived credential is a good idea regardless, and it keeps the email's "expires in 15 minutes" messaging consistent for both the link and the code shown alongside it).

A new table, `otp_codes`, maps a short-lived 6-digit code to that real token:
```sql
CREATE TABLE IF NOT EXISTS otp_codes (
  identifier TEXT        NOT NULL,
  code       TEXT        NOT NULL,
  token      TEXT        NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, code)
);
```
In `sendVerificationRequest({ identifier, token, url, ... })`, generate an independent `crypto.randomInt(100000, 1000000).toString()` as the code, insert `(identifier, code, token, expires)` into `otp_codes` (`expires` = 15 minutes from now, matching `maxAge`), and pass both `token`'s real `url` and the new `code` into the email template. The email shows both; the code is never itself sent as a URL parameter anywhere.

`otp_codes.token` stores the real token in retrievable (plaintext) form — necessary because verification must reconstruct the real callback URL from a submitted code, which a one-way hash would prevent. This is a bounded, short-lived (15 min), single-use secret in the same trust boundary as this database's other plaintext secrets (e.g. `accounts.access_token`) — not a new precedent.

## 2. Brute-force protection

A new table, `otp_attempts`, unchanged from the original design:
```sql
CREATE TABLE IF NOT EXISTS otp_attempts (
  identifier TEXT PRIMARY KEY,
  attempts   INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```
- On each **wrong** code verification: `INSERT ... ON CONFLICT (identifier) DO UPDATE SET attempts = otp_attempts.attempts + 1, updated_at = NOW()`.
- Before allowing a verification attempt: if `attempts >= 5` and the last failure was within 15 minutes, reject immediately without checking the code.
- On a **successful** verification: `DELETE FROM otp_attempts WHERE identifier = $1`.
- Requesting a new code does **not** reset the counter — only a successful sign-in does.
- This limiter is now the *only* path to guessing the code at all (per the fix above), so it fully closes the gap the security review found — there is no longer a way to bypass it by going around this app's own routes.
- Accepted tradeoff: an attacker who doesn't know the code can still deliberately burn a victim's 5 attempts to lock them out for up to 15 minutes. Same tradeoff essentially all PIN/OTP systems make; self-resolving, never exposes the account.

## 3. Verification endpoint

New route, `app/api/auth/verify-otp/route.js` (`POST { email, code, callbackUrl }`):
1. Check `otp_attempts` for that email; if locked out, return an error immediately.
2. Look up `otp_codes` for `(identifier: email, code)`. Not found, or `expires` in the past → treat as a wrong/expired code (increment `otp_attempts`, return an error) — do **not** proceed to step 3.
3. Found and unexpired → take its `token` column (the REAL, high-entropy NextAuth token) and make a server-to-server `fetch` (same origin, `redirect: 'manual'`) to NextAuth's own `/api/auth/callback/resend?token={realToken}&email={email}&callbackUrl={callbackUrl}` — reusing NextAuth's existing, already-correct hash-and-consume-and-issue-session logic rather than reimplementing it (the hashing/secret internals live in non-public `@auth/core` internal paths not intended as a stable dependency surface).
4. Inspect the response: a `Set-Cookie` header present means success — forward that header onto the actual client response, delete the `otp_codes` row (single-use) and reset `otp_attempts` for that email, return `{ ok: true }`.
5. No `Set-Cookie` (the real token could itself be independently expired/already-consumed via the link, an edge case but possible) — increment `otp_attempts`, return `{ ok: false, error: '...' }`.

## 4. Email template

`auth.js`'s `sendVerificationRequest` (already customized with a branded HTML template) is updated to show, in one email, sent identically regardless of which login-page button triggered it:
- The 6-digit code (from the new `otp_codes` mapping), large and prominent (monospace, letter-spaced).
- The existing "Sign in to Abundance →" button, still linking to `url` (NextAuth's real, high-entropy token — unrelated to the code shown above it) — clicking it works exactly as today's magic link does, with unchanged security properties.
- Copy updated from "expires in 24 hours" to "expires in 15 minutes" (both the link and the code now share that window, even though they are different secrets).

## 5. Login page (`app/login/page.jsx`)

Replace the single "✉ Send sign-in link" button with two: **"✉ Email me a link"** and **"🔢 Email me a code"**. Both call the exact same `signIn('resend', { email, callbackUrl: from, redirect: false })` — the only difference is a new `deliveryMode` state (`'link' | 'code'`) set by which button was clicked, controlling which confirmation UI renders next:
- `deliveryMode === 'link'`: today's existing "Check your email, click the link" screen — unchanged, copy updated to "15 minutes."
- `deliveryMode === 'code'`: a new confirmation screen with a 6-digit code input and a "Verify" button. Submitting `POST`s `{ email, code, callbackUrl: from }` to `/api/auth/verify-otp`. On `{ ok: true }`, hard-navigate (`window.location.href = from`) so the freshly-set session cookie is picked up cleanly (matches how clicking the magic link already causes a full navigation) rather than relying on the client-side session hook to notice a cookie it didn't set itself. On `{ ok: false }`, show the specific error (wrong code / too many attempts / expired) and offer "Resend code" (re-triggers the same `signIn('resend', ...)` call).

## Testing approach

No test runner is configured in this repo (established convention). Verification: `npm run build` for a clean compile, a standalone script exercising the attempt-limiter's SQL logic (increment/reset/block-at-5) against a local check, and a manual walkthrough of both delivery modes end-to-end — request a link and click it (confirm it signs in via NextAuth's real token, unrelated to any code), request a code and type it (including a deliberately wrong code, and hitting the 5-attempt limit), and confirm Google OAuth sign-in is unaffected. Also worth confirming directly: manually POSTing a guessed 6-digit value straight to `/api/auth/callback/resend?token=...&email=...` (bypassing `/api/auth/verify-otp` entirely) never succeeds, since that endpoint only ever accepts the real high-entropy token, not the short code.
