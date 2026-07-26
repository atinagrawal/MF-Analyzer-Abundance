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
