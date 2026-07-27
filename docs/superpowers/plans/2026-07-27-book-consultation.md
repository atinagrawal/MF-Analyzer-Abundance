# Book a Consultation Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let any site visitor book a 30-minute consultation directly on `mfcalc.getabundance.in`, via an embedded Cal.com widget gated behind an email-verification anti-spam check — no sign-in required.

**Architecture:** A new page (`app/book-consultation/page.jsx`) walks a visitor through three states: enter name+email → enter a 6-digit code emailed to them (verified against two new, dedicated DB tables — deliberately isolated from the existing sign-in OTP tables) → on success, an inline Cal.com embed (`@calcom/embed-react`) renders the real booking calendar, prefilled with their name/email. The existing homepage Footer CTA button is repointed from an external URL to this new internal page.

**Tech Stack:** Next.js 16 App Router, `pg` (Vercel Postgres/Neon) via the existing `lib/db.js` pool, Resend HTTP API (same pattern as `auth.js`), `@calcom/embed-react` (new dependency, v1.5.3), Cal.com hosted account on the `cal.eu` (EU data-residency) domain.

## Global Constraints

- No test runner is configured in this repo (established convention) — verification is `npm run build` per task plus a final manual walkthrough (Task 6).
- Every new DB-touching route uses `export const runtime = 'nodejs';` (the `pg` driver requires the Node runtime, not Edge) — matches `app/api/auth/verify-otp/route.js`.
- `consultation_otp` / `consultation_otp_attempts` are NEW tables, fully separate from the existing `otp_codes` / `otp_attempts` (sign-in) tables — never share logic or rows between them. A spammer guessing wrong consultation codes must never lock a real user out of signing in.
- Attempt limiter: 5 wrong attempts within a 15-minute window locks further attempts; only a successful verification clears the counter; requesting a new code does not reset it. Same shape as the sign-in flow's limiter.
- Code expiry: 15 minutes, matching the sign-in flow's `maxAge`.
- Every response from a new API route is `{ ok: true }` or `{ ok: false, error: '<value>' }` — error values are generic and never leak whether a code was "wrong" vs. "expired" (same non-leaking rule as `verify-otp/route.js`).
- Both new routes are wrapped in try/catch from their first commit → `{ ok:false, error:'server_error' }` at HTTP 500 (the sign-in feature needed a follow-up fix to add this; build it in from the start here).
- `DELETE ... WHERE identifier = $1` before every `INSERT` when sending a new code — only the newest code for an email is ever valid (same fix already applied to `otp_codes` in `auth.js`).
- Follow this codebase's existing conventions: inline `style={{ ... }}` objects using the CSS custom properties already defined in `app/globals.css` (`--g1`, `--g2`, `--border`, `--surface`, `--text`, `--muted`, `--neg`, `--neg-bg`, `--r`, `--shadow`, `--s2`) — do not introduce Tailwind or CSS modules. Internal navigation uses plain `<a href="/...">` tags (confirmed via `components/Navbar.jsx`), not `next/link` — this repo does not use `next/link` anywhere.
- Cal.com account lives on `cal.eu` (EU data-residency), not the default `cal.com`/`app.cal.com` — the embed must set BOTH `calOrigin="https://cal.eu"` and `embedJsUrl="https://cal.eu/embed/embed.js"` explicitly (verified against `@calcom/embed-react`'s actual source: `embedJsUrl` has no built-in fallback to `cal.eu`, only to whatever origin the npm package was built against).
- Cal.com's `PrefillAndIframeAttrsConfig` type (passed via the `config` prop) does NOT support `name`/`email` fields (verified against `@calcom/embed-core`'s source — it has a `// TODO: should have a dedicated prefill prop` comment). Prefill instead via query-string parameters appended directly to the `calLink` string (Cal.com's documented booking-page prefill mechanism) — e.g. `calLink="abundance/consultation?name=...&email=..."`.
- Live Cal.com event: `cal.eu/abundance/consultation` — "Free consultation," 30 min, Cal Video, already created and synced to the business's Google Calendar. No further Cal.com-side setup needed.

---

### Task 1: Database schema — consultation OTP tables

**Files:**
- Modify: `scripts/schema.sql` (insert after the existing `otp_codes` table, before `CREATE TABLE IF NOT EXISTS accounts`)

**Interfaces:**
- Produces: `consultation_otp(identifier TEXT, code TEXT, expires TIMESTAMPTZ)` and `consultation_otp_attempts(identifier TEXT PRIMARY KEY, attempts INT, updated_at TIMESTAMPTZ)` — read/written by Task 2's routes.

- [ ] **Step 1: Add the two new tables to `scripts/schema.sql`**

Insert this block immediately after the existing `otp_codes` table definition (after line 48, before the blank line preceding `CREATE TABLE IF NOT EXISTS accounts`):

```sql
-- ── Consultation-booking email verification ─────────────────────────────────
-- Anti-spam gate for the public Book-a-Consultation page (app/book-consultation/
-- page.jsx) — proves the visitor controls the email address before the Cal.com
-- booking widget is revealed. Deliberately SEPARATE from otp_codes/otp_attempts
-- above: those gate sign-in and must never share a lockout counter with this
-- unrelated, unauthenticated flow (a spammer burning wrong consultation-page
-- guesses must not also lock a real user out of signing in). No token/session
-- is issued here — a match just flips the page to the booking step client-side.
CREATE TABLE IF NOT EXISTS consultation_otp (
  identifier TEXT        NOT NULL,   -- email
  code       TEXT        NOT NULL,
  expires    TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (identifier, code)
);

CREATE TABLE IF NOT EXISTS consultation_otp_attempts (
  identifier TEXT        PRIMARY KEY,
  attempts   INT         NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Verify the file is still valid SQL by eye**

Re-read the modified `scripts/schema.sql` in full. Confirm: no duplicate table names, every `CREATE TABLE` still ends with `;`, and the new block sits between `otp_codes` and `accounts` without disturbing either.

- [ ] **Step 3: Commit**

```bash
git add scripts/schema.sql
git commit -m "feat(db): add consultation_otp / consultation_otp_attempts tables"
```

---

### Task 2: Consultation OTP API routes

**Files:**
- Create: `app/api/consultation/send-code/route.js`
- Create: `app/api/consultation/verify-code/route.js`

**Interfaces:**
- Consumes: `pool` default export from `@/lib/db` (existing `pg.Pool` singleton); `consultation_otp` / `consultation_otp_attempts` tables from Task 1; `process.env.RESEND_KEY` (existing env var, already set in Vercel).
- Produces: `POST /api/consultation/send-code` — body `{ name, email }`, response `{ ok: true }` or `{ ok: false, error: 'invalid_request' | 'invalid_name' | 'invalid_email' | 'server_error' }`. `POST /api/consultation/verify-code` — body `{ email, code }`, response `{ ok: true }` or `{ ok: false, error: 'invalid_request' | 'invalid_email' | 'invalid_code_format' | 'too_many_attempts' | 'wrong_code' | 'server_error' }`. Task 3's page calls both by exact path and body shape.

- [ ] **Step 1: Create `app/api/consultation/send-code/route.js`**

```js
/**
 * app/api/consultation/send-code/route.js
 *
 * POST /api/consultation/send-code
 * Body: { name, email }
 *
 * Sends a 6-digit verification code to the given email — the anti-spam gate
 * for the public Book-a-Consultation page (app/book-consultation/page.jsx).
 * Unrelated to sign-in: writes to consultation_otp / consultation_otp_attempts,
 * never otp_codes/otp_attempts (see scripts/schema.sql for why these stay
 * separate). No NextAuth token or session is involved.
 *
 * Possible `error` values in the `{ ok: false, error: '...' }` response shape:
 *   invalid_request | invalid_name | invalid_email | server_error
 */

import pool from '@/lib/db';
import { randomInt } from 'crypto';

export const runtime = 'nodejs';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildConsultationCodeEmail({ code }) {
  const brand = '#1a7a4a';
  const muted = '#64748b';
  return {
    subject: 'Your consultation booking code — Abundance Financial Services',
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
    <h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#1e293b;letter-spacing:-.4px;">Confirm your email to book</h1>
    <p style="margin:0 0 20px;font-size:14px;color:${muted};line-height:1.6;">Enter this code on the booking page to continue. Expires in <strong>15 minutes</strong> and can only be used once.</p>
    <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding-bottom:8px;">
      <div style="display:inline-block;padding:16px 28px;background:#f8fafb;border:1.5px solid #e2e8f0;border-radius:10px;font-size:32px;font-weight:900;letter-spacing:8px;color:${brand};font-family:'Courier New',monospace;">${code}</div>
    </td></tr></table>
    <p style="margin:20px 0 0;font-size:12px;color:${muted};border-top:1px solid #f1f5f9;padding-top:16px;line-height:1.6;">If you did not request this, you can safely ignore it.</p>
  </td></tr>
  <tr><td align="center" style="padding-top:20px;">
    <p style="margin:0;font-size:11px;color:${muted};font-family:'Courier New',monospace;">Abundance Financial Services · ARN-251838 · mfcalc.getabundance.in</p>
  </td></tr>
</table></td></tr></table>
</body></html>`,
    text: `Confirm your email to book a consultation\n\nYour code: ${code}\n\nExpires in 15 minutes.\n\nAbundance Financial Services · ARN-251838`,
  };
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  const name  = (body?.name  || '').trim();
  const email = (body?.email || '').trim().toLowerCase();

  if (!name) {
    return Response.json({ ok: false, error: 'invalid_name' }, { status: 400 });
  }
  if (!email || !EMAIL_REGEX.test(email)) {
    return Response.json({ ok: false, error: 'invalid_email' }, { status: 400 });
  }

  try {
    const code    = randomInt(100000, 1000000).toString();
    const expires = new Date(Date.now() + 15 * 60 * 1000);

    // Invalidate any prior outstanding code for this email first — same fix
    // applied to otp_codes (auth.js) after a final-review finding there.
    await pool.query(`DELETE FROM consultation_otp WHERE identifier = $1`, [email]);
    await pool.query(
      `INSERT INTO consultation_otp (identifier, code, expires) VALUES ($1, $2, $3)`,
      [email, code, expires]
    );

    const { subject, html, text } = buildConsultationCodeEmail({ code });

    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    'Abundance Financial Services <noreply@getabundance.in>',
        to:      email,
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      console.error('[consultation/send-code] Resend error', res.status, error);
      return Response.json({ ok: false, error: 'server_error' }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[consultation/send-code]', err.name, err.message);
    return Response.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `app/api/consultation/verify-code/route.js`**

```js
/**
 * app/api/consultation/verify-code/route.js
 *
 * POST /api/consultation/verify-code
 * Body: { email, code }
 *
 * Checks a 6-digit code sent by /api/consultation/send-code. On success,
 * returns { ok: true } — there is no session/token to issue here, this is
 * purely an anti-spam gate for app/book-consultation/page.jsx. Attempt-limited
 * against consultation_otp_attempts (5 wrong attempts / 15-minute window,
 * same shape as app/api/auth/verify-otp/route.js but a fully separate table —
 * see scripts/schema.sql for why these must not share a lockout counter with
 * the sign-in flow.
 *
 * Possible `error` values in the `{ ok: false, error: '...' }` response shape:
 *   invalid_request | invalid_email | invalid_code_format | too_many_attempts |
 *   wrong_code | server_error
 */

import pool from '@/lib/db';

export const runtime = 'nodejs';

const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_SQL = "INTERVAL '15 minutes'";
const CODE_REGEX = /^\d{6}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function isLockedOut(email) {
  const { rows } = await pool.query(
    `SELECT attempts, updated_at FROM consultation_otp_attempts WHERE identifier = $1`,
    [email]
  );
  if (!rows.length) return false;
  const { attempts, updated_at } = rows[0];
  const withinWindow = (Date.now() - new Date(updated_at).getTime()) < 15 * 60 * 1000;
  return attempts >= MAX_ATTEMPTS && withinWindow;
}

async function recordFailedAttempt(email) {
  // Resets to 1 (not incremented) if the previous failure window has already
  // lapsed — otherwise a lockout from weeks ago would silently keep
  // incrementing forever and never actually unlock.
  await pool.query(
    `INSERT INTO consultation_otp_attempts (identifier, attempts, updated_at)
     VALUES ($1, 1, NOW())
     ON CONFLICT (identifier) DO UPDATE SET
       attempts = CASE
         WHEN consultation_otp_attempts.updated_at <= NOW() - ${ATTEMPT_WINDOW_SQL} THEN 1
         ELSE consultation_otp_attempts.attempts + 1
       END,
       updated_at = NOW()`,
    [email]
  );
}

async function clearAttempts(email) {
  await pool.query(`DELETE FROM consultation_otp_attempts WHERE identifier = $1`, [email]);
}

// Returns true only for a matching, unexpired (email, code) pair. Never
// distinguishes "not found" from "expired" to the caller — both are treated
// identically as a wrong code (same non-leaking rule as verify-otp/route.js).
async function resolveCode(email, code) {
  const { rows } = await pool.query(
    `SELECT expires FROM consultation_otp WHERE identifier = $1 AND code = $2`,
    [email, code]
  );
  if (!rows.length) return false;
  return new Date(rows[0].expires).getTime() >= Date.now();
}

async function clearCode(email, code) {
  await pool.query(`DELETE FROM consultation_otp WHERE identifier = $1 AND code = $2`, [email, code]);
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  const email = (body?.email || '').trim().toLowerCase();
  const code  = (body?.code  || '').trim();

  if (!email || !EMAIL_REGEX.test(email)) {
    return Response.json({ ok: false, error: 'invalid_email' }, { status: 400 });
  }
  if (!CODE_REGEX.test(code)) {
    return Response.json({ ok: false, error: 'invalid_code_format' }, { status: 400 });
  }

  try {
    if (await isLockedOut(email)) {
      return Response.json({ ok: false, error: 'too_many_attempts' }, { status: 400 });
    }

    const valid = await resolveCode(email, code);
    if (!valid) {
      await recordFailedAttempt(email);
      return Response.json({ ok: false, error: 'wrong_code' }, { status: 400 });
    }

    await Promise.all([clearAttempts(email), clearCode(email, code)]);
    return Response.json({ ok: true });
  } catch (err) {
    console.error('[consultation/verify-code]', err.name, err.message);
    return Response.json({ ok: false, error: 'server_error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Verify the project still compiles**

Run: `npm run build`
Expected: build completes with no errors (no local DB is available to exercise these routes live — that happens in Task 6's manual walkthrough against the deployed environment).

- [ ] **Step 4: Commit**

```bash
git add app/api/consultation/send-code/route.js app/api/consultation/verify-code/route.js
git commit -m "feat(consultation): add send-code and verify-code API routes"
```

---

### Task 3: Book-consultation page — form and verification states

**Files:**
- Create: `app/book-consultation/page.jsx`

**Interfaces:**
- Consumes: `POST /api/consultation/send-code` and `POST /api/consultation/verify-code` from Task 2 (exact body/response shapes above); `Navbar` default export from `@/components/Navbar`; `Footer` default export from `@/components/Footer`.
- Produces: a `'form' | 'verify' | 'booking'` step state machine. Task 4 replaces only the `step === 'booking'` block's inner content — every other part of this file (the `S` style object, `ERROR_MESSAGES`, `errorMessage()`, `handleSendCode`, `handleVerifyCode`, `handleResend`, and the `name`/`email` state variables) is final and consumed by Task 4 as-is.

- [ ] **Step 1: Create `app/book-consultation/page.jsx`**

```jsx
'use client';

/**
 * app/book-consultation/page.jsx — Book a Consultation
 *
 * Flow: name+email form -> email a 6-digit code (anti-spam gate, no sign-in
 * required) -> on verification, reveal the Cal.com booking embed prefilled
 * with the verified name/email. See docs/superpowers/specs/
 * 2026-07-27-book-consultation-design.md for the full design rationale.
 */

import { useState } from 'react';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';

const S = {
  input: {
    width: '100%', padding: '12px 14px',
    border: '1.5px solid var(--border)', borderRadius: '10px',
    fontSize: '.85rem', fontWeight: 600, fontFamily: 'Raleway, sans-serif',
    background: 'var(--s2)', color: 'var(--text)', outline: 'none',
    boxSizing: 'border-box', transition: 'border-color .15s',
  },
  btnGreen: {
    width: '100%', padding: '12px 20px',
    background: 'var(--g1)', border: 'none', borderRadius: '10px',
    fontSize: '.85rem', fontWeight: 800, color: '#fff',
    cursor: 'pointer', fontFamily: 'Raleway, sans-serif',
    letterSpacing: '-.2px', transition: 'background .15s',
  },
};

const ERROR_MESSAGES = {
  invalid_name:        'Please enter your name.',
  invalid_email:       'Please enter a valid email address.',
  invalid_code_format: 'Enter the 6-digit code from your email.',
  too_many_attempts:   'Too many wrong attempts. Request a new code and try again.',
  wrong_code:          'That code is incorrect or has expired.',
  server_error:        'Something went wrong. Please try again.',
};

function errorMessage(code) {
  return ERROR_MESSAGES[code] || 'Something went wrong. Please try again.';
}

export default function BookConsultationPage() {
  const [step, setStep]     = useState('form'); // 'form' | 'verify' | 'booking'
  const [name, setName]     = useState('');
  const [email, setEmail]   = useState('');
  const [code, setCode]     = useState('');
  const [busy, setBusy]     = useState(false);
  const [errMsg, setErrMsg] = useState('');

  const handleSendCode = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrMsg('');
    try {
      const res = await fetch('/api/consultation/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (data.ok) {
        setCode('');
        setStep('verify');
      } else {
        setErrMsg(errorMessage(data.error));
      }
    } catch {
      setErrMsg(errorMessage('server_error'));
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setErrMsg(errorMessage('invalid_code_format'));
      return;
    }
    setBusy(true);
    setErrMsg('');
    try {
      const res = await fetch('/api/consultation/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), code }),
      });
      const data = await res.json();
      if (data.ok) {
        setStep('booking');
      } else {
        setErrMsg(errorMessage(data.error));
      }
    } catch {
      setErrMsg(errorMessage('server_error'));
    } finally {
      setBusy(false);
    }
  };

  const handleResend = (e) => handleSendCode(e);

  return (
    <>
      <div className="container" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <Navbar />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px' }}>

          <div style={{ maxWidth: step === 'booking' ? 720 : 420, width: '100%' }}>

            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text)', letterSpacing: '-.4px', marginBottom: 8 }}>
                📅 Book a Free Consultation
              </h1>
              <p style={{ fontSize: '.85rem', color: 'var(--muted)', lineHeight: 1.6 }}>
                30 minutes, no obligation. We'll walk through your goals and how mutual funds, SIPs, SWPs, SIF or PMS can fit your plan.
              </p>
            </div>

            {step !== 'booking' && (
              <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderTop: '4px solid var(--g1)', borderRadius: 'var(--r)', padding: '32px', boxShadow: 'var(--shadow)' }}>

                {step === 'form' && (
                  <form onSubmit={handleSendCode}>
                    <input type="text" required value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Your name"
                      style={{ ...S.input, marginBottom: 10 }}
                      disabled={busy}
                    />
                    <input type="email" required value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      style={{ ...S.input, marginBottom: 14 }}
                      disabled={busy}
                    />
                    {errMsg && (
                      <div style={{ padding: '10px 12px', background: 'var(--neg-bg)', border: '1.5px solid #ffcdd2', borderRadius: 9, marginBottom: 14, fontSize: '.75rem', color: 'var(--neg)' }}>
                        ⚠ {errMsg}
                      </div>
                    )}
                    <button type="submit" disabled={busy}
                      style={{ ...S.btnGreen, opacity: busy ? .65 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
                    >
                      {busy ? 'Sending…' : 'Send verification code'}
                    </button>
                    <p style={{ fontSize: '.68rem', color: 'var(--muted)', marginTop: 12, lineHeight: 1.5, textAlign: 'center' }}>
                      We'll email you a 6-digit code to confirm it's really you — this just keeps spam bookings out.
                    </p>
                  </form>
                )}

                {step === 'verify' && (
                  <form onSubmit={handleVerifyCode}>
                    <div style={{ fontSize: '.8rem', color: 'var(--text)', lineHeight: 1.6, marginBottom: 14 }}>
                      A 6-digit code was sent to{' '}
                      <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{email}</strong>.
                    </div>
                    <input type="text" inputMode="numeric" pattern="\d{6}" maxLength={6} required
                      value={code}
                      onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      style={{ ...S.input, marginBottom: 10, textAlign: 'center', fontSize: '1.3rem', fontWeight: 800, letterSpacing: '6px', fontFamily: "'JetBrains Mono', monospace" }}
                      disabled={busy}
                      autoFocus
                    />
                    {errMsg && (
                      <div style={{ padding: '10px 12px', background: 'var(--neg-bg)', border: '1.5px solid #ffcdd2', borderRadius: 9, marginBottom: 10, fontSize: '.75rem', color: 'var(--neg)' }}>
                        ⚠ {errMsg}
                      </div>
                    )}
                    <button type="submit" disabled={busy}
                      style={{ ...S.btnGreen, opacity: busy ? .65 : 1, cursor: busy ? 'not-allowed' : 'pointer' }}
                    >
                      {busy ? 'Verifying…' : 'Verify & continue'}
                    </button>
                    <button type="button" onClick={handleResend} disabled={busy}
                      style={{ background: 'none', border: 'none', cursor: busy ? 'not-allowed' : 'pointer', fontSize: '.72rem', color: 'var(--g2)', fontWeight: 700, fontFamily: 'Raleway, sans-serif', marginTop: 10, padding: '4px 0' }}
                    >
                      Resend code
                    </button>
                  </form>
                )}
              </div>
            )}

            {step === 'booking' && (
              <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderTop: '4px solid var(--g1)', borderRadius: 'var(--r)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                <div style={{ padding: 40, textAlign: 'center' }}>
                  <div style={{ fontSize: '2rem', marginBottom: 12 }}>✅</div>
                  <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--g1)' }}>Email verified</div>
                  <div style={{ fontSize: '.8rem', color: 'var(--muted)', marginTop: 6 }}>Loading your calendar…</div>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
      <Footer />
    </>
  );
}
```

Note: the `step === 'booking'` block's inner content ("Email verified… Loading your calendar…") is intentionally temporary — Task 4 replaces it with the real Cal.com embed. This task's own deliverable is fully testable on its own: the form and OTP-verification flow work end-to-end against Task 2's real routes.

- [ ] **Step 2: Verify the project compiles**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add app/book-consultation/page.jsx
git commit -m "feat(consultation): add book-consultation page with OTP gate"
```

---

### Task 4: Cal.com embed integration

**Files:**
- Modify: `package.json` (add `@calcom/embed-react` dependency)
- Modify: `app/book-consultation/page.jsx` (replace the `step === 'booking'` block's inner content from Task 3)

**Interfaces:**
- Consumes: `name`, `email` state variables and the `step === 'booking'` block from Task 3 (exact location: the JSX block starting `{step === 'booking' && (` near the end of the file).
- Produces: the finished page — no further tasks build on this file.

- [ ] **Step 1: Add the `@calcom/embed-react` dependency**

In `package.json`, add this line to `dependencies` (alphabetically between `@auth/pg-adapter` and `@vercel/blob`):

```json
    "@calcom/embed-react": "^1.5.3",
```

- [ ] **Step 2: Install it**

Run: `npm install`
Expected: `package-lock.json` updates to include `@calcom/embed-react` and its transitive dependencies; no errors.

- [ ] **Step 3: Replace the booking-state block in `app/book-consultation/page.jsx`**

Add this import near the top of the file, alongside the existing `Navbar`/`Footer` imports:

```jsx
import Cal from '@calcom/embed-react';
```

Replace the entire `step === 'booking'` block (the block Task 3 created, showing "Email verified… Loading your calendar…") with:

```jsx
            {step === 'booking' && (
              <>
                <div style={{ background: 'var(--surface)', border: '1.5px solid var(--border)', borderTop: '4px solid var(--g1)', borderRadius: 'var(--r)', boxShadow: 'var(--shadow)', overflow: 'hidden' }}>
                  <Cal
                    calLink={`abundance/consultation?name=${encodeURIComponent(name.trim())}&email=${encodeURIComponent(email.trim().toLowerCase())}`}
                    calOrigin="https://cal.eu"
                    embedJsUrl="https://cal.eu/embed/embed.js"
                    config={{ theme: 'light' }}
                    style={{ width: '100%', height: '100%', minHeight: '700px' }}
                  />
                </div>
                <p style={{ fontSize: '.72rem', color: 'var(--muted)', textAlign: 'center', marginTop: 14 }}>
                  Having trouble loading the calendar? Call{' '}
                  <a href="tel:+919808105923" style={{ color: 'var(--g2)', fontWeight: 700 }}>+91 98081 05923</a>
                  {' '}or{' '}
                  <a href="https://wa.me/919808105923" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--g2)', fontWeight: 700 }}>WhatsApp us</a>.
                </p>
              </>
            )}
```

The fallback phone/WhatsApp line is always shown beneath the embed (not conditionally rendered on a detected failure) — `@calcom/embed-react`'s `Cal` component has no documented load-failure callback, so an always-visible escape hatch is the honest way to guarantee visitors can still reach the business if the embed fails to load, per the spec's error-handling section.

- [ ] **Step 4: Verify the project compiles**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json app/book-consultation/page.jsx
git commit -m "feat(consultation): embed Cal.com booking widget on cal.eu"
```

---

### Task 5: Repoint the Footer CTA button

**Files:**
- Modify: `components/Footer.jsx:134-144`

**Interfaces:**
- Consumes: `app/book-consultation/page.jsx` from Task 3/4 (route `/book-consultation`).
- Produces: nothing consumed by later tasks — this is the final integration point.

- [ ] **Step 1: Replace the CTA button's href in `components/Footer.jsx`**

Current code (lines 134-144):

```jsx
              <a
                href="https://www.getabundance.in/contact-us"
                target="_blank"
                rel="noopener noreferrer"
                className="dfc-cta-btn"
              >
                📅 Book a Consultation
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </a>
```

Replace with:

```jsx
              <a
                href="/book-consultation"
                className="dfc-cta-btn"
              >
                📅 Book a Consultation
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </a>
```

(`target="_blank"` and `rel="noopener noreferrer"` are dropped — this is now an internal navigation, matching the plain `<a href="/...">` pattern already used for internal links in `components/Navbar.jsx`.)

The secondary "Visit getabundance.in →" link immediately below (lines 145-152) is untouched — it keeps pointing to the external main site.

- [ ] **Step 2: Verify the project compiles**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 3: Commit**

```bash
git add components/Footer.jsx
git commit -m "feat(consultation): repoint Footer CTA to internal /book-consultation page"
```

---

### Task 6: Deploy and manual end-to-end verification

**Files:** none (deployment + manual QA only)

**Interfaces:** none — this task validates the whole branch's behavior against the live environment.

- [ ] **Step 1: Run the schema migration on the live database**

In the Vercel Dashboard → Storage → your Postgres DB → Query tab, run the two `CREATE TABLE` statements added in Task 1 (`consultation_otp`, `consultation_otp_attempts`). Confirm no errors (both use `IF NOT EXISTS`, so this is safe to re-run).

- [ ] **Step 2: Deploy the branch**

Merge/deploy per your normal Vercel flow. Confirm the deploy succeeds with no build errors.

- [ ] **Step 3: Manual walkthrough — happy path**

1. Visit `/book-consultation` directly.
2. Enter a real name and an email address you control. Submit.
3. Confirm an email arrives with a 6-digit code within a few seconds.
4. Enter the code. Confirm the page advances to the booking state and the Cal.com calendar (real available slots, from the connected Google Calendar) renders inline.
5. Confirm the name/email fields in the Cal.com booking form are pre-filled with what you entered in Step 2.
6. Either complete a real test booking (then cancel/delete it from your calendar) or stop here — either is fine for verification purposes.

- [ ] **Step 4: Manual walkthrough — error paths**

1. Submit the form with an invalid email format — confirm client-side validation blocks it before any network call.
2. Request a code, then enter 5 different wrong 6-digit codes — confirm the 5th attempt (or the one immediately after) shows "Too many wrong attempts..." and further submissions are blocked.
3. Request a fresh code for the same email (via "Resend code") after triggering lockout — confirm this does NOT immediately clear the lockout (per the Global Constraints: only a successful verification resets the counter).
4. Confirm signing in at `/login` (both link and code methods) still works entirely normally — proving the two OTP systems are truly independent.

- [ ] **Step 5: Confirm the Footer button**

Visit the homepage (`/`), scroll to the footer's "Start Your Journey" column, click "📅 Book a Consultation", and confirm it navigates to `/book-consultation` on the same site (not a new external tab).

- [ ] **Step 6: Mobile check**

Load `/book-consultation` at a narrow viewport width (or browser dev tools mobile emulation) and confirm the form, code entry, and Cal.com embed all render usably without horizontal scrolling.
