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
