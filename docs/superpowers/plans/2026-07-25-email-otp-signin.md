# Email OTP Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revision note (2026-07-26):** Task 1 as originally written (and already committed at this point) made the 6-digit code itself BE NextAuth's verification token — a background security review correctly flagged this as critical, since that token is checked by NextAuth's own always-public `/api/auth/callback/resend` endpoint, completely independent of any attempt limiter this app builds. That endpoint would accept direct brute-force guesses of all 1,000,000 six-digit values within the 15-minute window, bypassing `/api/auth/verify-otp` entirely. **Task 1B** below fixes this by decoupling the two secrets. Task 2 (not yet executed when the flaw was caught) is written below already reflecting the fix.

**Goal:** Add a 6-digit email code as a second sign-in option alongside the existing magic link, sharing one email but NOT one secret — NextAuth's own high-entropy token still gates the actual sign-in; a separate, app-owned 6-digit code is mapped to that real token and is the only thing ever checked by this app's own attempt-limited route.

**Architecture:** `auth.js`'s Resend provider keeps NextAuth's default high-entropy token generation untouched, but shortens `maxAge` to 15 minutes. `sendVerificationRequest` additionally generates an independent 6-digit code, stores `(email, code) → real token` in a new `otp_codes` table, and sends both the code and the real magic link in one email. A new `/api/auth/verify-otp` route accepts a typed-in code, checks a Postgres-backed attempt counter, looks up the real token via `otp_codes`, and — rather than reimplementing NextAuth's internal token verification — proxies a server-to-server request to NextAuth's own existing `/api/auth/callback/resend` endpoint using that REAL token, forwarding its session cookie on success. Guessing the code can therefore only ever be attempted through the attempt-limited route; NextAuth's own endpoint never accepts a bare 6-digit value at all. The login page gains a second button and a code-input confirmation screen.

**Tech Stack:** NextAuth v5 (`next-auth`, `@auth/pg-adapter`), Postgres (`pg` via `lib/db.js`), Node's built-in `crypto.randomInt`, Next.js App Router Route Handlers.

## Global Constraints

- The 6-digit code and NextAuth's real verification token are **separate secrets**. The code is never usable directly against `/api/auth/callback/resend` — only via `/api/auth/verify-otp`, which translates code → real token first.
- Token expiry: **15 minutes** (`maxAge: 15 * 60`), replacing today's 24 hours — applies to the real token; the `otp_codes` mapping's own `expires` column matches this same 15-minute window.
- Attempt limit: **5 wrong verifications** blocks further attempts on that email until the failed-attempt window (also 15 minutes) has elapsed since the last failure — matches the code's own natural expiry so a lockout is never effectively permanent.
- The attempt counter resets to zero only on a **successful** sign-in — never on merely requesting a new code (closes the "just request a fresh code to reset your guess budget" bypass).
- No new external service/dependency — reuses the existing Resend account and the existing `verification_token` table; two new small tables (`otp_codes`, `otp_attempts`) are added.
- No test runner is configured in this repo (established convention). Verification is `npm run build` for a clean compile, plus a standalone script exercising any pure logic (token format, attempt-limiter SQL translated to an equivalent JS check), plus a manual end-to-end walkthrough once deployed to a environment with a live Postgres connection.
- Google OAuth sign-in must be completely unaffected by every change in this plan.

---

### Task 1: Token generation, expiry, and email template

> **Superseded in part by Task 1B below.** This task's `generateVerificationToken` override and the `code: token` wiring in `sendVerificationRequest` are the flawed design the security review caught — kept here unmodified for an accurate historical record of what was actually committed, since Task 1 already executed before the flaw was found. Do not use Step 2's `Resend({...})` block as final — Task 1B replaces it.

**Files:**
- Modify: `auth.js`
- Modify: `scripts/schema.sql`

**Interfaces:**
- Produces: `export function buildEmail({ url, host, code })` (named export added alongside the existing default NextAuth config export) — returns `{ subject, html, text }`. Not consumed by later tasks directly, but must exist as a named export so it's independently testable in Step 2 below.
- Produces (schema): `otp_attempts` table — `identifier TEXT PRIMARY KEY, attempts INT NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. Task 2's `/api/auth/verify-otp` route reads and writes this table by exact name and column names.

- [ ] **Step 1: Add the `otp_attempts` table to `scripts/schema.sql`**

Find the `verification_token` table definition near the top of `scripts/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS verification_token (
  identifier TEXT        NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  token      TEXT        NOT NULL,
  PRIMARY KEY (identifier, token)
);
```

Immediately after it, add:

```sql

-- ── Email OTP attempt limiter ────────────────────────────────────────────────
-- Tracks failed 6-digit code verification attempts per email. Read/written by
-- app/api/auth/verify-otp/route.js. attempts resets to 1 (not incremented)
-- once updated_at is more than 15 minutes old, so a lockout is always bounded
-- by the same 15-minute window the code itself expires within — never
-- effectively permanent. Only a SUCCESSFUL verification deletes the row;
-- merely requesting a new code does not reset it.
CREATE TABLE IF NOT EXISTS otp_attempts (
  identifier TEXT        PRIMARY KEY,
  attempts   INT         NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Update `auth.js` — token generation, expiry, and email template**

Find (`auth.js`, near the top):

```js
import NextAuth        from 'next-auth';
import Google          from 'next-auth/providers/google';
import Resend          from 'next-auth/providers/resend';
import PostgresAdapter from '@auth/pg-adapter';
import pool            from '@/lib/db';
```

Replace with:

```js
import NextAuth        from 'next-auth';
import Google          from 'next-auth/providers/google';
import Resend          from 'next-auth/providers/resend';
import PostgresAdapter from '@auth/pg-adapter';
import pool            from '@/lib/db';
import { randomInt }   from 'crypto';
```

Find the whole `buildEmail` function:

```js
function buildEmail({ url, host }) {
  const brand = '#1a7a4a';
  const muted = '#64748b';
  return {
    subject: `Sign in to Abundance — ${host}`,
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafb;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafb;padding:40px 16px;">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
  <tr><td align="center" style="padding-bottom:24px;">
    <img src="https://mfcalc.getabundance.in/logo-192.png" alt="Abundance Financial Services" width="80" height="80" style="display:block;margin:0 auto 14px;border-radius:14px;border:1.5px solid #e2e8f0;" />
    <div style="font-size:20px;font-weight:900;color:${brand};letter-spacing:-.5px;">Abundance Financial Services</div>
    <div style="font-size:12px;color:${muted};margin-top:4px;font-family:'Courier New',monospace;">ARN-251838 · Haldwani, Uttarakhand</div>
  </td></tr>
  <tr><td style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;border-top:4px solid ${brand};padding:36px 32px;box-shadow:0 4px 20px rgba(0,0,0,.06);">
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1e293b;letter-spacing:-.4px;">Your sign-in link</h1>
    <p style="margin:0 0 28px;font-size:14px;color:${muted};line-height:1.6;">Click the button below to sign in to your Abundance account. This link expires in <strong>24 hours</strong> and can only be used once.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="${url}" style="display:inline-block;padding:14px 32px;background:${brand};color:#fff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none;letter-spacing:-.2px;">Sign in to Abundance →</a>
    </td></tr></table>
    <p style="margin:24px 0 0;font-size:12px;color:${muted};line-height:1.6;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="margin:6px 0 0;font-size:11px;color:${brand};word-break:break-all;font-family:'Courier New',monospace;">${url}</p>
    <p style="margin:20px 0 0;font-size:12px;color:${muted};border-top:1px solid #f1f5f9;padding-top:16px;line-height:1.6;">If you did not request this email, you can safely ignore it.</p>
  </td></tr>
  <tr><td align="center" style="padding-top:20px;">
    <p style="margin:0;font-size:11px;color:${muted};font-family:'Courier New',monospace;">Abundance Financial Services · ARN-251838 · mfcalc.getabundance.in</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
    text: `Sign in to Abundance\n\n${url}\n\nThis link expires in 24 hours.\n\nAbundance Financial Services · ARN-251838`,
  };
}
```

Replace with:

```js
export function buildEmail({ url, host, code }) {
  const brand = '#1a7a4a';
  const muted = '#64748b';
  return {
    subject: `Sign in to Abundance — ${host}`,
    html: `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafb;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafb;padding:40px 16px;">
<tr><td align="center"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
  <tr><td align="center" style="padding-bottom:24px;">
    <img src="https://mfcalc.getabundance.in/logo-192.png" alt="Abundance Financial Services" width="80" height="80" style="display:block;margin:0 auto 14px;border-radius:14px;border:1.5px solid #e2e8f0;" />
    <div style="font-size:20px;font-weight:900;color:${brand};letter-spacing:-.5px;">Abundance Financial Services</div>
    <div style="font-size:12px;color:${muted};margin-top:4px;font-family:'Courier New',monospace;">ARN-251838 · Haldwani, Uttarakhand</div>
  </td></tr>
  <tr><td style="background:#fff;border-radius:12px;border:1.5px solid #e2e8f0;border-top:4px solid ${brand};padding:36px 32px;box-shadow:0 4px 20px rgba(0,0,0,.06);">
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1e293b;letter-spacing:-.4px;">Your sign-in code</h1>
    <p style="margin:0 0 20px;font-size:14px;color:${muted};line-height:1.6;">Enter this code on the sign-in page, or click the button below — either works. Expires in <strong>15 minutes</strong> and can only be used once.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:24px;">
      <div style="display:inline-block;padding:16px 28px;background:#f8fafb;border:1.5px solid #e2e8f0;border-radius:10px;font-size:32px;font-weight:900;letter-spacing:8px;color:${brand};font-family:'Courier New',monospace;">${code}</div>
    </td></tr></table>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <a href="${url}" style="display:inline-block;padding:14px 32px;background:${brand};color:#fff;font-size:15px;font-weight:700;border-radius:10px;text-decoration:none;letter-spacing:-.2px;">Sign in to Abundance →</a>
    </td></tr></table>
    <p style="margin:24px 0 0;font-size:12px;color:${muted};line-height:1.6;">If the button doesn't work, copy and paste this link into your browser:</p>
    <p style="margin:6px 0 0;font-size:11px;color:${brand};word-break:break-all;font-family:'Courier New',monospace;">${url}</p>
    <p style="margin:20px 0 0;font-size:12px;color:${muted};border-top:1px solid #f1f5f9;padding-top:16px;line-height:1.6;">If you did not request this email, you can safely ignore it.</p>
  </td></tr>
  <tr><td align="center" style="padding-top:20px;">
    <p style="margin:0;font-size:11px;color:${muted};font-family:'Courier New',monospace;">Abundance Financial Services · ARN-251838 · mfcalc.getabundance.in</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
    text: `Sign in to Abundance\n\nYour code: ${code}\n\nOr click: ${url}\n\nExpires in 15 minutes.\n\nAbundance Financial Services · ARN-251838`,
  };
}
```

Find the `Resend({...})` provider block:

```js
    // 2. Email magic link via Resend
    Resend({
      apiKey: process.env.RESEND_KEY,
      from:   'Abundance Financial Services <noreply@getabundance.in>',

      // Branded email template
      async sendVerificationRequest({ identifier: email, url, provider }) {
        const host = new URL(url).host;
        const { subject, html, text } = buildEmail({ url, host });

        const res = await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({ from: provider.from, to: email, subject, html, text }),
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          throw new Error(`Resend error ${res.status}: ${JSON.stringify(error)}`);
        }
      },
    }),
```

Replace with:

```js
    // 2. Email sign-in via Resend — sends BOTH a 6-digit code and a magic
    // link in one email, sharing one secret (see docs/superpowers/specs/
    // 2026-07-25-email-otp-signin-design.md for why: generateVerificationToken
    // takes no per-request arguments, so there is no way to know in advance
    // whether this particular request wants a link or a code).
    Resend({
      apiKey:  process.env.RESEND_KEY,
      from:    'Abundance Financial Services <noreply@getabundance.in>',
      maxAge:  15 * 60, // 15 minutes — was 24 hours; a 6-digit code can't stay valid that long

      // 6-digit numeric code instead of NextAuth's default long random token.
      generateVerificationToken: () => randomInt(100000, 1000000).toString(),

      // Branded email template — shows the code AND the link
      async sendVerificationRequest({ identifier: email, url, token, provider }) {
        const host = new URL(url).host;
        const { subject, html, text } = buildEmail({ url, host, code: token });

        const res = await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({ from: provider.from, to: email, subject, html, text }),
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          throw new Error(`Resend error ${res.status}: ${JSON.stringify(error)}`);
        }
      },
    }),
```

Also update the file's top-of-file doc comment. Find:

```js
/**
 * auth.js — NextAuth v5 configuration
 *
 * Sign-in methods:
 *   1. Google OAuth  — for users with Google/Gmail accounts
 *   2. Email magic link (Resend) — for all other users
 *
 * Resend setup (one-time):
 *   1. Create account at resend.com
 *   2. Add domain getabundance.in → copy the DNS records they give you → add to your DNS
 *   3. Create an API key → copy it
 *   4. Add to Vercel env vars:
 *        RESEND_KEY = re_xxxxxxxxxxxx  (the API key)
 *   No other env vars needed for email.
 *
 * Required DB table (already created):
 *   verification_token — already confirmed EXISTS
 *
 * Role values: 'client' | 'distributor' | 'admin'
 */
```

Replace with:

```js
/**
 * auth.js — NextAuth v5 configuration
 *
 * Sign-in methods:
 *   1. Google OAuth  — for users with Google/Gmail accounts
 *   2. Email code or link (Resend) — one email contains both a 6-digit code
 *      and a magic link, sharing one secret. See app/api/auth/verify-otp/
 *      route.js for the code-entry flow (attempt-limited) and
 *      app/login/page.jsx for the UI. Design rationale:
 *      docs/superpowers/specs/2026-07-25-email-otp-signin-design.md
 *
 * Resend setup (one-time):
 *   1. Create account at resend.com
 *   2. Add domain getabundance.in → copy the DNS records they give you → add to your DNS
 *   3. Create an API key → copy it
 *   4. Add to Vercel env vars:
 *        RESEND_KEY = re_xxxxxxxxxxxx  (the API key)
 *   No other env vars needed for email.
 *
 * Required DB tables (already created):
 *   verification_token — already confirmed EXISTS
 *   otp_attempts        — added for the code attempt-limiter, see scripts/schema.sql
 *
 * Role values: 'client' | 'distributor' | 'admin'
 */
```

- [ ] **Step 3: Verify the token generator produces a valid 6-digit code**

Run: `node -e "const { randomInt } = require('crypto'); for (let i = 0; i < 20; i++) { const c = randomInt(100000, 1000000).toString(); if (!/^\d{6}$/.test(c)) throw new Error('BAD CODE: ' + c); } console.log('ALL 20 GENERATED CODES WERE VALID 6-DIGIT STRINGS');"`

Expected output: `ALL 20 GENERATED CODES WERE VALID 6-DIGIT STRINGS`

- [ ] **Step 4: Verify the email template renders the code correctly**

Create a temporary check script (delete after running) to confirm `buildEmail` is now a named export and includes the code in both `html` and `text`:

```bash
node -e "
const { buildEmail } = require('./auth.js');
" 2>&1 | head -5
```

Expected: this will likely fail with an ES module error (`auth.js` uses `import`/`export`, not CommonJS) — that's expected. Instead verify via Node's ESM loader:

```bash
node --input-type=module -e "
import { buildEmail } from 'file:///$(pwd | sed 's|^/\([a-zA-Z]\)|\1:|')/auth.js';
const { html, text, subject } = buildEmail({ url: 'https://mfcalc.getabundance.in/api/auth/callback/resend?token=482913&email=test%40example.com', host: 'mfcalc.getabundance.in', code: '482913' });
console.log('Subject:', subject);
console.log('HTML contains code:', html.includes('482913'));
console.log('Text contains code:', text.includes('482913'));
console.log('HTML contains link:', html.includes('https://mfcalc.getabundance.in/api/auth/callback/resend'));
console.log('Text contains \"15 minutes\":', text.includes('15 minutes'));
"
```

Expected output: `Subject: Sign in to Abundance — mfcalc.getabundance.in`, then `HTML contains code: true`, `Text contains code: true`, `HTML contains link: true`, `Text contains "15 minutes": true`.

**Note:** this script imports `auth.js` directly, which itself imports `@/lib/db` (a path-aliased import Node's plain ESM loader cannot resolve outside of Next.js's build). If the import fails with a `Cannot find module '@/lib/db'` error, that confirms `auth.js` cannot be imported standalone outside the Next.js build — in that case, skip this direct-import approach and instead copy just the `buildEmail` function body into a throwaway script (matching the "verify via a standalone copy against fixtures" pattern already used elsewhere in this project's session history) to confirm the same four assertions above.

- [ ] **Step 5: Run the Next.js build**

Run: `npm run build`
Expected: build succeeds, no errors.

- [ ] **Step 6: Commit**

```bash
git add auth.js scripts/schema.sql
git commit -m "feat(auth): generate 6-digit codes with 15-minute expiry, send code+link in one email"
```

---

### Task 1B: Security fix — decouple the OTP code from NextAuth's real token

**Files:**
- Modify: `auth.js`
- Modify: `scripts/schema.sql`

**Interfaces:**
- Produces (schema): `otp_codes` table — `identifier TEXT NOT NULL, code TEXT NOT NULL, token TEXT NOT NULL, expires TIMESTAMPTZ NOT NULL, PRIMARY KEY (identifier, code)`. Task 2's `/api/auth/verify-otp` route reads this table by exact name and column names to translate a submitted code into the real NextAuth token.
- Consumes: nothing from Task 1 changes in shape — `otp_attempts` (already added in Task 1) is untouched by this task.

- [ ] **Step 1: Add the `otp_codes` table to `scripts/schema.sql`**

Find the `otp_attempts` table Task 1 already added:

```sql
CREATE TABLE IF NOT EXISTS otp_attempts (
  identifier TEXT        PRIMARY KEY,
  attempts   INT         NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Immediately after it, add:

```sql

-- ── Email OTP code-to-token mapping ──────────────────────────────────────────
-- Maps a short-lived, independently-generated 6-digit code to the REAL
-- high-entropy NextAuth verification token for the same sign-in request.
-- Read/written by auth.js (insert) and app/api/auth/verify-otp/route.js
-- (lookup + delete on success). The code is NEVER itself usable as a
-- NextAuth token — /api/auth/verify-otp always translates code -> token
-- via this table before calling NextAuth's own callback endpoint, so
-- guessing the code only ever goes through that attempt-limited route.
-- token is stored in retrievable (plaintext) form deliberately: verification
-- must reconstruct the real callback call from a submitted code, which a
-- one-way hash would prevent. Same trust boundary as this database's other
-- plaintext secrets (e.g. accounts.access_token above).
CREATE TABLE IF NOT EXISTS otp_codes (
  identifier TEXT        NOT NULL,
  code       TEXT        NOT NULL,
  token      TEXT        NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, code)
);
```

- [ ] **Step 2: Revert the `generateVerificationToken` override and rewire `sendVerificationRequest` in `auth.js`**

Find the `Resend({...})` provider block (as Task 1 left it):

```js
    // 2. Email sign-in via Resend — sends BOTH a 6-digit code and a magic
    // link in one email, sharing one secret (see docs/superpowers/specs/
    // 2026-07-25-email-otp-signin-design.md for why: generateVerificationToken
    // takes no per-request arguments, so there is no way to know in advance
    // whether this particular request wants a link or a code).
    Resend({
      apiKey:  process.env.RESEND_KEY,
      from:    'Abundance Financial Services <noreply@getabundance.in>',
      maxAge:  15 * 60, // 15 minutes — was 24 hours; a 6-digit code can't stay valid that long

      // 6-digit numeric code instead of NextAuth's default long random token.
      generateVerificationToken: () => randomInt(100000, 1000000).toString(),

      // Branded email template — shows the code AND the link
      async sendVerificationRequest({ identifier: email, url, token, provider }) {
        const host = new URL(url).host;
        const { subject, html, text } = buildEmail({ url, host, code: token });

        const res = await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({ from: provider.from, to: email, subject, html, text }),
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          throw new Error(`Resend error ${res.status}: ${JSON.stringify(error)}`);
        }
      },
    }),
```

Replace with:

```js
    // 2. Email sign-in via Resend — sends BOTH a 6-digit code and a magic
    // link in one email, but they are SEPARATE secrets. NextAuth's own
    // `token` (full entropy, unmodified default generator) still gates
    // /api/auth/callback/resend — exactly as secure as before this feature
    // existed. The 6-digit `code` below is this app's own creation, mapped
    // to that real token in otp_codes, and is ONLY ever checked by this
    // app's own attempt-limited /api/auth/verify-otp route. A security
    // review caught an earlier version of this file using the code AS the
    // token directly — see docs/superpowers/specs/
    // 2026-07-25-email-otp-signin-design.md's revision note for why that
    // was a critical bypass of the attempt limiter via NextAuth's own
    // public callback endpoint.
    Resend({
      apiKey:  process.env.RESEND_KEY,
      from:    'Abundance Financial Services <noreply@getabundance.in>',
      maxAge:  15 * 60, // 15 minutes — was 24 hours

      // Branded email template — shows an independent code AND the real link
      async sendVerificationRequest({ identifier: email, url, token, provider }) {
        const host = new URL(url).host;
        const code = randomInt(100000, 1000000).toString();
        const expires = new Date(Date.now() + 15 * 60 * 1000);

        await pool.query(
          `INSERT INTO otp_codes (identifier, code, token, expires) VALUES ($1, $2, $3, $4)`,
          [email, code, token, expires]
        );

        const { subject, html, text } = buildEmail({ url, host, code });

        const res = await fetch('https://api.resend.com/emails', {
          method:  'POST',
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type':  'application/json',
          },
          body: JSON.stringify({ from: provider.from, to: email, subject, html, text }),
        });

        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          throw new Error(`Resend error ${res.status}: ${JSON.stringify(error)}`);
        }
      },
    }),
```

Note `generateVerificationToken` is gone entirely — NextAuth generates its own default high-entropy token, unmodified. `pool` is already imported at the top of `auth.js` (used by `PostgresAdapter(pool)`), so no new import is needed for the `pool.query` call above.

Also update the top-of-file doc comment. Find (as Task 1 left it):

```js
 * Required DB tables (already created):
 *   verification_token — already confirmed EXISTS
 *   otp_attempts        — added for the code attempt-limiter, see scripts/schema.sql
 *
 * Role values: 'client' | 'distributor' | 'admin'
 */
```

Replace with:

```js
 * Required DB tables (already created):
 *   verification_token — already confirmed EXISTS
 *   otp_attempts        — code attempt-limiter, see scripts/schema.sql
 *   otp_codes           — maps a 6-digit code to NextAuth's real token per
 *                          request; the code is a SEPARATE secret from the
 *                          real token, never usable directly against
 *                          NextAuth's own callback endpoint. See
 *                          scripts/schema.sql and
 *                          docs/superpowers/specs/2026-07-25-email-otp-signin-design.md
 *
 * Role values: 'client' | 'distributor' | 'admin'
 */
```

- [ ] **Step 3: Verify `otp_codes` insert parameters are well-formed**

This can't be exercised without a live Postgres connection, but the shape of what gets inserted (a 6-digit numeric string, a token string, and a valid future Date) can be checked in isolation:

```bash
node -e "
const { randomInt } = require('crypto');
const code = randomInt(100000, 1000000).toString();
const expires = new Date(Date.now() + 15 * 60 * 1000);
if (!/^\d{6}$/.test(code)) throw new Error('BAD CODE: ' + code);
if (!(expires instanceof Date) || isNaN(expires.getTime())) throw new Error('BAD EXPIRES');
if (expires.getTime() - Date.now() < 14 * 60 * 1000) throw new Error('EXPIRES TOO SOON');
console.log('code:', code, 'expires:', expires.toISOString());
console.log('OTP_CODES INSERT SHAPE OK');
"
```

Expected output ends with: `OTP_CODES INSERT SHAPE OK`

- [ ] **Step 4: Run the Next.js build**

Run: `npm run build`
Expected: build succeeds, no errors.

- [ ] **Step 5: Commit**

```bash
git add auth.js scripts/schema.sql
git commit -m "fix(auth): decouple OTP code from NextAuth's real token (security review fix)"
```

---

### Task 2: `/api/auth/verify-otp` route — attempt limiter + proxy to NextAuth's callback

**Files:**
- Create: `app/api/auth/verify-otp/route.js`

**Interfaces:**
- Consumes: the `otp_attempts` table from Task 1 (exact columns: `identifier`, `attempts`, `updated_at`); the `otp_codes` table from Task 1B (exact columns: `identifier`, `code`, `token`, `expires`); `pool` default export from `@/lib/db`.
- Produces: `POST /api/auth/verify-otp` — request body `{ email: string, code: string, callbackUrl: string }`, response `{ ok: true }` (200, with a forwarded `Set-Cookie` session header) or `{ ok: false, error: 'invalid_email' | 'invalid_code_format' | 'too_many_attempts' | 'wrong_code' }` (400). Consumed by Task 3's login page.

- [ ] **Step 1: Write `app/api/auth/verify-otp/route.js`**

```js
/**
 * app/api/auth/verify-otp/route.js
 *
 * POST /api/auth/verify-otp
 * Body: { email, code, callbackUrl }
 *
 * Verifies a 6-digit sign-in code against an attempt limiter, translates it
 * to the REAL NextAuth verification token via the otp_codes table (the code
 * and the real token are separate secrets — see auth.js and
 * docs/superpowers/specs/2026-07-25-email-otp-signin-design.md), then
 * completes sign-in by proxying to NextAuth's OWN existing
 * /api/auth/callback/resend endpoint rather than reimplementing its
 * token-hashing/session-issuing logic — that logic lives in @auth/core's
 * internal (non-public) paths, not a stable dependency surface for this
 * codebase to import directly.
 *
 * Attempt limiter (otp_attempts table, see scripts/schema.sql):
 *   - Blocks further attempts once an email has 5 failed verifications
 *     within the last 15 minutes (matches the code's own expiry window —
 *     a lockout is bounded, never effectively permanent).
 *   - Only a SUCCESSFUL verification clears the row. Requesting a new code
 *     does NOT reset it (closes the "just get a fresh code for a fresh
 *     guess budget" bypass).
 *   - Because the code is NEVER itself sent to NextAuth's callback endpoint
 *     (only the real token, looked up here, is), this limiter is the ONLY
 *     path through which the code can be guessed at all.
 *
 * Design: docs/superpowers/specs/2026-07-25-email-otp-signin-design.md
 */

import pool from '@/lib/db';

export const runtime = 'nodejs';

const MAX_ATTEMPTS  = 5;
const ATTEMPT_WINDOW_SQL = "INTERVAL '15 minutes'";
const CODE_REGEX    = /^\d{6}$/;

async function isLockedOut(email) {
  const { rows } = await pool.query(
    `SELECT attempts, updated_at FROM otp_attempts WHERE identifier = $1`,
    [email]
  );
  if (!rows.length) return false;
  const { attempts, updated_at } = rows[0];
  const withinWindow = (Date.now() - new Date(updated_at).getTime()) < 15 * 60 * 1000;
  return attempts >= MAX_ATTEMPTS && withinWindow;
}

async function recordFailedAttempt(email) {
  // Resets to 1 (not incremented) if the previous failure window has
  // already lapsed — otherwise a lockout from weeks ago would silently
  // keep incrementing forever and never actually unlock.
  await pool.query(
    `INSERT INTO otp_attempts (identifier, attempts, updated_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (identifier) DO UPDATE SET
       attempts = CASE
         WHEN otp_attempts.updated_at <= NOW() - ${ATTEMPT_WINDOW_SQL} THEN 1
         ELSE otp_attempts.attempts + 1
       END,
       updated_at = NOW()`,
    [email]
  );
}

async function clearAttempts(email) {
  await pool.query(`DELETE FROM otp_attempts WHERE identifier = $1`, [email]);
}

// Looks up the REAL NextAuth token for a submitted (email, code) pair.
// Returns null if no matching, unexpired row exists — the caller must treat
// that identically to a wrong code (do not leak whether the code format was
// merely "not found" vs "expired").
async function resolveRealToken(email, code) {
  const { rows } = await pool.query(
    `SELECT token, expires FROM otp_codes WHERE identifier = $1 AND code = $2`,
    [email, code]
  );
  if (!rows.length) return null;
  const { token, expires } = rows[0];
  if (new Date(expires).getTime() < Date.now()) return null;
  return token;
}

async function clearCode(email, code) {
  await pool.query(`DELETE FROM otp_codes WHERE identifier = $1 AND code = $2`, [email, code]);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  const email = (body?.email || '').trim().toLowerCase();
  const code  = (body?.code || '').trim();
  const callbackUrl = body?.callbackUrl || '/';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ ok: false, error: 'invalid_email' }, { status: 400 });
  }
  if (!CODE_REGEX.test(code)) {
    return Response.json({ ok: false, error: 'invalid_code_format' }, { status: 400 });
  }

  if (await isLockedOut(email)) {
    return Response.json({ ok: false, error: 'too_many_attempts' }, { status: 400 });
  }

  const realToken = await resolveRealToken(email, code);
  if (!realToken) {
    await recordFailedAttempt(email);
    return Response.json({ ok: false, error: 'wrong_code' }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  const target = `${origin}/api/auth/callback/resend?${new URLSearchParams({
    token: realToken,
    email,
    callbackUrl,
  })}`;

  const callbackRes = await fetch(target, {
    method: 'GET',
    redirect: 'manual',
  });

  const setCookie = callbackRes.headers.getSetCookie
    ? callbackRes.headers.getSetCookie()
    : (callbackRes.headers.get('set-cookie') ? [callbackRes.headers.get('set-cookie')] : []);

  // NextAuth's callback throws (no cookie ever set) before reaching the
  // session-issuing code on any invalid/expired/mismatched token — verified
  // directly against @auth/core's source. Presence of a session cookie is
  // therefore a reliable, name-agnostic success signal. Reaching here with
  // no cookie means the REAL token itself was somehow invalid/already
  // consumed (e.g. the user clicked the link first) — an edge case, but
  // still handled as a plain wrong-code failure so it never leaks that
  // distinction back to the client.
  if (setCookie.length === 0) {
    await recordFailedAttempt(email);
    return Response.json({ ok: false, error: 'wrong_code' }, { status: 400 });
  }

  await Promise.all([clearAttempts(email), clearCode(email, code)]);

  const response = Response.json({ ok: true });
  for (const cookie of setCookie) {
    response.headers.append('Set-Cookie', cookie);
  }
  return response;
}
```

- [ ] **Step 2: Verify the attempt-limiter SQL logic against expected behavior**

The `recordFailedAttempt`/`isLockedOut` SQL can't be exercised without a live Postgres connection. Translate the SQL's `CASE` expression into an equivalent pure JS function and verify the three key scenarios it must handle (fresh increment, reset-after-window, block-at-limit) — mirrors the "verify computed logic via a parallel reimplementation before trusting it in the live file" approach used earlier in this project's history.

Create and run a throwaway script (delete after running):

```bash
node -e "
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

// Mirrors the SQL CASE in recordFailedAttempt()
function nextAttempts(existing, now) {
  if (!existing) return { attempts: 1, updated_at: now };
  const lapsed = (now - existing.updated_at) > WINDOW_MS;
  return { attempts: lapsed ? 1 : existing.attempts + 1, updated_at: now };
}

// Mirrors isLockedOut()
function isLockedOut(row, now) {
  if (!row) return false;
  const withinWindow = (now - row.updated_at) < WINDOW_MS;
  return row.attempts >= MAX_ATTEMPTS && withinWindow;
}

let now = 0;
let row = null;

// 5 failures in quick succession should lock out
for (let i = 0; i < 5; i++) { row = nextAttempts(row, now); now += 1000; }
console.log('After 5 fast failures:', JSON.stringify(row), 'locked:', isLockedOut(row, now));
console.assert(row.attempts === 5, 'FAIL: expected 5 attempts');
console.assert(isLockedOut(row, now) === true, 'FAIL: should be locked out after 5 failures');

// A 6th failure right after should still show locked (before it even matters, since the caller checks isLockedOut BEFORE calling recordFailedAttempt)
console.assert(isLockedOut(row, now) === true, 'FAIL: still locked immediately after');

// Once the 15-minute window has fully lapsed, the NEXT failure resets to 1, unlocking
now += WINDOW_MS + 1;
console.assert(isLockedOut(row, now) === false, 'FAIL: lockout should have expired after the window passed');
row = nextAttempts(row, now);
console.assert(row.attempts === 1, 'FAIL: attempts should reset to 1 after the window lapsed, not keep incrementing to 6');

console.log('ALL ATTEMPT-LIMITER LOGIC CHECKS PASSED');
"
```

Expected output ends with: `ALL ATTEMPT-LIMITER LOGIC CHECKS PASSED`

- [ ] **Step 3: Run the Next.js build**

Run: `npm run build`
Expected: build succeeds, `/api/auth/verify-otp` listed among the built routes, no errors.

- [ ] **Step 4: Manual end-to-end verification (requires a live Postgres connection and a real Resend send)**

This step cannot be scripted without live infrastructure — perform it once deployed (or against a local dev server pointed at the real database):
1. Ensure both `otp_attempts` (Task 1) and `otp_codes` (Task 1B) tables have been created on the actual database (run both `CREATE TABLE` statements from `scripts/schema.sql` in the Vercel Postgres query tab if not already applied).
2. Trigger a sign-in request for a real test email (via the existing `signIn('resend', ...)` call — Task 3 will wire the UI, but this can be triggered from the browser console or the existing login form before Task 3 lands, since the request-a-code path is unchanged).
3. Confirm the received email contains a 6-digit code.
4. `curl -i -X POST http://localhost:3000/api/auth/verify-otp -H "Content-Type: application/json" -d '{"email":"YOUR_TEST_EMAIL","code":"000000","callbackUrl":"/"}'` (deliberately wrong code) — expect `{"ok":false,"error":"wrong_code"}`, no `Set-Cookie` header.
5. Repeat step 4 five times total with a wrong code — the 5th (or a 6th) attempt should return `{"ok":false,"error":"too_many_attempts"}`.
6. Trigger a fresh sign-in request (new code), then `curl` with the CORRECT code from the new email — expect `{"ok":true}` with a `Set-Cookie: authjs.session-token=...` (or `__Secure-authjs.session-token=...` in production) header present in the response.
7. Separately, confirm the fix actually closes the gap: take that same correct code and `curl` it directly against NextAuth's own endpoint instead — `curl -i "http://localhost:3000/api/auth/callback/resend?token=CODE&email=YOUR_TEST_EMAIL"` (using the 6-digit CODE, not the real token) — expect this to fail/redirect to an error page, never sign in, since NextAuth's endpoint only ever accepts the real high-entropy token.

- [ ] **Step 5: Commit**

```bash
git add app/api/auth/verify-otp/route.js
git commit -m "feat(auth): add attempt-limited verify-otp endpoint proxying to NextAuth's own callback"
```

---

### Task 3: Login page — two sign-in buttons and code-entry screen

**Files:**
- Modify: `app/login/page.jsx`

**Interfaces:**
- Consumes: `POST /api/auth/verify-otp` from Task 2 (exact request/response contract above).
- Produces: nothing consumed by later tasks — this is the final task.

- [ ] **Step 1: Add `deliveryMode` and `code`/`verifying`/`verifyError` state**

Find (`app/login/page.jsx`):

```jsx
  const [email,     setEmail]     = useState('');
  const [emailStep, setEmailStep] = useState(verify ? 'sent' : 'idle');
  // 'idle' | 'sending' | 'sent' | 'error'
  const [sentTo,    setSentTo]    = useState('');
  const [errMsg,    setErrMsg]    = useState('');
```

Replace with:

```jsx
  const [email,     setEmail]     = useState('');
  const [emailStep, setEmailStep] = useState(verify ? 'sent' : 'idle');
  // 'idle' | 'sending' | 'sent' | 'error'
  const [sentTo,    setSentTo]    = useState('');
  const [errMsg,    setErrMsg]    = useState('');

  // Which button the user picked — controls the confirmation screen shown
  // after the email is sent. Both buttons trigger the exact same
  // signIn('resend', ...) call; only the underlying secret is shared,
  // never a separate code/link mechanism.
  const [deliveryMode, setDeliveryMode] = useState('link'); // 'link' | 'code'
  const [code,         setCode]         = useState('');
  const [verifying,    setVerifying]    = useState(false);
  const [verifyError,  setVerifyError]  = useState('');
```

- [ ] **Step 2: Update `handleEmailSubmit` to accept a mode parameter**

Find:

```jsx
  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setEmailStep('sending');
    setErrMsg('');
    try {
      const res = await signIn('resend', { email: trimmed, callbackUrl: from, redirect: false });
      if (res?.error) {
        setEmailStep('error');
        setErrMsg(res.error === 'EmailSignin'
          ? 'Could not send the email. Please check the address and try again.'
          : `Error: ${res.error}`);
      } else {
        setSentTo(trimmed);
        setEmailStep('sent');
      }
    } catch {
      setEmailStep('error');
      setErrMsg('Something went wrong. Please try again.');
    }
  };

  const reset = () => { setEmailStep('idle'); setEmail(''); setSentTo(''); setErrMsg(''); };
```

Replace with:

```jsx
  const handleEmailSubmit = async (e, mode) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setDeliveryMode(mode);
    setEmailStep('sending');
    setErrMsg('');
    setVerifyError('');
    setCode('');
    try {
      const res = await signIn('resend', { email: trimmed, callbackUrl: from, redirect: false });
      if (res?.error) {
        setEmailStep('error');
        setErrMsg(res.error === 'EmailSignin'
          ? 'Could not send the email. Please check the address and try again.'
          : `Error: ${res.error}`);
      } else {
        setSentTo(trimmed);
        setEmailStep('sent');
      }
    } catch {
      setEmailStep('error');
      setErrMsg('Something went wrong. Please try again.');
    }
  };

  const handleResend = (e) => handleEmailSubmit(e, deliveryMode);

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    const trimmedCode = code.trim();
    if (!/^\d{6}$/.test(trimmedCode)) {
      setVerifyError('Enter the 6-digit code from your email.');
      return;
    }
    setVerifying(true);
    setVerifyError('');
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sentTo || email, code: trimmedCode, callbackUrl: from }),
      });
      const data = await res.json();
      if (data.ok) {
        // Hard navigate so the freshly-set session cookie is picked up
        // cleanly — matches how clicking the magic link already causes a
        // full navigation, rather than relying on the client-side session
        // hook to notice a cookie it didn't set itself.
        window.location.href = from;
        return;
      }
      const messages = {
        invalid_code_format: 'Enter the 6-digit code from your email.',
        too_many_attempts:   'Too many wrong attempts. Request a new code and try again.',
        wrong_code:          'That code is incorrect or has expired.',
        invalid_email:       'Something went wrong. Please start over.',
      };
      setVerifyError(messages[data.error] || 'Something went wrong. Please try again.');
    } catch {
      setVerifyError('Something went wrong. Please try again.');
    } finally {
      setVerifying(false);
    }
  };

  const reset = () => {
    setEmailStep('idle'); setEmail(''); setSentTo(''); setErrMsg('');
    setCode(''); setVerifyError(''); setDeliveryMode('link');
  };
```

- [ ] **Step 3: Replace the single submit button with two, and add the code-entry confirmation screen**

Find:

```jsx
            {/* ── Sent state ── */}
            {emailStep === 'sent' && (
              <div style={{ padding: '20px 16px', background: 'var(--g-xlight)', border: '1.5px solid var(--g-light)', borderRadius: 12, marginBottom: 20, textAlign: 'left' }}>
                <div style={{ fontSize: '1.6rem', marginBottom: 10 }}>📬</div>
                <div style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--g1)', marginBottom: 6 }}>Check your email</div>
                <div style={{ fontSize: '.78rem', color: 'var(--text)', lineHeight: 1.6 }}>
                  A sign-in link was sent to{' '}
                  <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{sentTo || email}</strong>.
                  Click the link in that email to sign in.
                </div>
                <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
                  The link expires in 24 hours. Check your spam folder if you don't see it.
                </div>
              </div>
            )}

            {/* ── Error state ── */}
            {emailStep === 'error' && (
              <div style={{ padding: '12px 14px', background: 'var(--neg-bg)', border: '1.5px solid #ffcdd2', borderRadius: 10, marginBottom: 16, fontSize: '.78rem', color: 'var(--neg)', textAlign: 'left' }}>
                ⚠ {errMsg}
              </div>
            )}

            {/* ── Email form ── */}
            {emailStep !== 'sent' && (
              <form onSubmit={handleEmailSubmit} style={{ marginBottom: 16 }}>
                <input type="email" required value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{ ...S.input, marginBottom: 10 }}
                  onFocus={e => e.target.style.borderColor = 'var(--g2)'}
                  onBlur={e  => e.target.style.borderColor = 'var(--border)'}
                  disabled={emailStep === 'sending'}
                />
                <button type="submit"
                  style={{ ...S.btnGreen, opacity: emailStep === 'sending' ? .65 : 1, cursor: emailStep === 'sending' ? 'not-allowed' : 'pointer' }}
                  disabled={emailStep === 'sending'}
                  onMouseEnter={e => { if (emailStep !== 'sending') e.currentTarget.style.background = 'var(--g2)'; }}
                  onMouseLeave={e => e.currentTarget.style.background = 'var(--g1)'}
                >
                  {emailStep === 'sending' ? 'Sending…' : '✉ Send sign-in link'}
                </button>
              </form>
            )}

            {/* ── Try different email ── */}
            {emailStep === 'sent' && (
              <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.75rem', color: 'var(--g2)', fontWeight: 700, fontFamily: 'Raleway, sans-serif', marginBottom: 16, padding: '4px 0' }}>
                Use a different email
              </button>
            )}
```

Replace with:

```jsx
            {/* ── Sent state: link mode ── */}
            {emailStep === 'sent' && deliveryMode === 'link' && (
              <div style={{ padding: '20px 16px', background: 'var(--g-xlight)', border: '1.5px solid var(--g-light)', borderRadius: 12, marginBottom: 20, textAlign: 'left' }}>
                <div style={{ fontSize: '1.6rem', marginBottom: 10 }}>📬</div>
                <div style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--g1)', marginBottom: 6 }}>Check your email</div>
                <div style={{ fontSize: '.78rem', color: 'var(--text)', lineHeight: 1.6 }}>
                  A sign-in link was sent to{' '}
                  <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{sentTo || email}</strong>.
                  Click the link in that email to sign in.
                </div>
                <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>
                  The link expires in 15 minutes. Check your spam folder if you don't see it.
                </div>
              </div>
            )}

            {/* ── Sent state: code mode ── */}
            {emailStep === 'sent' && deliveryMode === 'code' && (
              <div style={{ padding: '20px 16px', background: 'var(--g-xlight)', border: '1.5px solid var(--g-light)', borderRadius: 12, marginBottom: 20, textAlign: 'left' }}>
                <div style={{ fontSize: '1.6rem', marginBottom: 10 }}>🔢</div>
                <div style={{ fontSize: '.85rem', fontWeight: 800, color: 'var(--g1)', marginBottom: 6 }}>Enter your code</div>
                <div style={{ fontSize: '.78rem', color: 'var(--text)', lineHeight: 1.6, marginBottom: 14 }}>
                  A 6-digit code was sent to{' '}
                  <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{sentTo || email}</strong>.
                  Enter it below to sign in.
                </div>
                <form onSubmit={handleVerifyCode}>
                  <input type="text" inputMode="numeric" pattern="\d{6}" maxLength={6} required
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    style={{ ...S.input, marginBottom: 10, textAlign: 'center', fontSize: '1.3rem', fontWeight: 800, letterSpacing: '6px', fontFamily: "'JetBrains Mono', monospace" }}
                    disabled={verifying}
                    autoFocus
                  />
                  {verifyError && (
                    <div style={{ padding: '10px 12px', background: 'var(--neg-bg)', border: '1.5px solid #ffcdd2', borderRadius: 9, marginBottom: 10, fontSize: '.72rem', color: 'var(--neg)', textAlign: 'left' }}>
                      ⚠ {verifyError}
                    </div>
                  )}
                  <button type="submit"
                    style={{ ...S.btnGreen, opacity: verifying ? .65 : 1, cursor: verifying ? 'not-allowed' : 'pointer' }}
                    disabled={verifying}
                    onMouseEnter={e => { if (!verifying) e.currentTarget.style.background = 'var(--g2)'; }}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--g1)'}
                  >
                    {verifying ? 'Verifying…' : 'Verify & sign in'}
                  </button>
                </form>
                <button onClick={handleResend} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.72rem', color: 'var(--g2)', fontWeight: 700, fontFamily: 'Raleway, sans-serif', marginTop: 10, padding: '4px 0' }}>
                  Resend code
                </button>
                <div style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
                  The code expires in 15 minutes. Check your spam folder if you don't see it.
                </div>
              </div>
            )}

            {/* ── Error state ── */}
            {emailStep === 'error' && (
              <div style={{ padding: '12px 14px', background: 'var(--neg-bg)', border: '1.5px solid #ffcdd2', borderRadius: 10, marginBottom: 16, fontSize: '.78rem', color: 'var(--neg)', textAlign: 'left' }}>
                ⚠ {errMsg}
              </div>
            )}

            {/* ── Email form ── */}
            {emailStep !== 'sent' && (
              <form style={{ marginBottom: 16 }}>
                <input type="email" required value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  style={{ ...S.input, marginBottom: 10 }}
                  onFocus={e => e.target.style.borderColor = 'var(--g2)'}
                  onBlur={e  => e.target.style.borderColor = 'var(--border)'}
                  disabled={emailStep === 'sending'}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" onClick={e => handleEmailSubmit(e, 'link')}
                    style={{ ...S.btnGreen, flex: 1, opacity: emailStep === 'sending' ? .65 : 1, cursor: emailStep === 'sending' ? 'not-allowed' : 'pointer' }}
                    disabled={emailStep === 'sending'}
                    onMouseEnter={e => { if (emailStep !== 'sending') e.currentTarget.style.background = 'var(--g2)'; }}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--g1)'}
                  >
                    {emailStep === 'sending' && deliveryMode === 'link' ? 'Sending…' : '✉ Email me a link'}
                  </button>
                  <button type="submit" onClick={e => handleEmailSubmit(e, 'code')}
                    style={{ ...S.btnGreen, flex: 1, background: 'var(--surface)', color: 'var(--g1)', border: '1.5px solid var(--g1)', opacity: emailStep === 'sending' ? .65 : 1, cursor: emailStep === 'sending' ? 'not-allowed' : 'pointer' }}
                    disabled={emailStep === 'sending'}
                  >
                    {emailStep === 'sending' && deliveryMode === 'code' ? 'Sending…' : '🔢 Email me a code'}
                  </button>
                </div>
              </form>
            )}

            {/* ── Try different email ── */}
            {emailStep === 'sent' && (
              <button onClick={reset} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '.75rem', color: 'var(--g2)', fontWeight: 700, fontFamily: 'Raleway, sans-serif', marginBottom: 16, padding: '4px 0' }}>
                Use a different email
              </button>
            )}
```

**Note on the button markup:** both buttons are `type="submit"` inside the same `<form>` with no `onSubmit` on the form itself (removed) — each button's own `onClick` calls `handleEmailSubmit(e, mode)`, and `handleEmailSubmit` already calls `e.preventDefault()` as its first line, so neither button triggers a native form submission. This lets two differently-labeled submit buttons share one text input without needing two separate `<form>` wrappers.

- [ ] **Step 4: Run the Next.js build**

Run: `npm run build`
Expected: build succeeds, no errors.

- [ ] **Step 5: Manual walkthrough (requires the live dev server + a real inbox)**

With `npm run dev` running and Task 1/2 fully deployed against a database that has the `otp_attempts` table:
1. Open `/login`, enter a real test email, click **"✉ Email me a link"** — confirm the existing "Check your email" screen appears, click the link in the received email, confirm sign-in completes and lands on `from` (default `/`).
2. Sign out. Open `/login` again, enter the same email, click **"🔢 Email me a code"** — confirm the new code-entry screen appears with an autofocused 6-digit input.
3. Enter a deliberately wrong code — confirm the "incorrect or has expired" error shows and the input remains editable.
4. Enter the correct code from the received email — confirm a hard navigation to `from` occurs and the session is active (e.g. the navbar shows the signed-in account state).
5. Confirm **"Continue with Google"** still works entirely unaffected.

- [ ] **Step 6: Commit**

```bash
git add app/login/page.jsx
git commit -m "feat(login): add email-code sign-in option alongside the existing magic link"
```
