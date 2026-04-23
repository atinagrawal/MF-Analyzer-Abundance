/**
 * app/api/auth-diag/route.js — TEMPORARY diagnostic endpoint
 *
 * Tests the two things that cause "Error: Configuration":
 *   1. verification_token table exists in Postgres
 *   2. SMTP connection to smtp.office365.com succeeds
 *
 * DELETE THIS FILE once email login is working.
 * Access: GET /api/auth-diag
 */

import pool from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const results = {};

  // ── 1. Check AUTH_SECRET ─────────────────────────────────────────────────
  results.auth_secret = process.env.AUTH_SECRET
    ? `set (${process.env.AUTH_SECRET.length} chars)`
    : 'MISSING';

  // ── 2. Check email env vars ──────────────────────────────────────────────
  results.email_from     = process.env.EMAIL_FROM     || 'MISSING';
  results.email_password = process.env.EMAIL_SERVER_PASSWORD
    ? `set (${process.env.EMAIL_SERVER_PASSWORD.length} chars)`
    : 'MISSING';

  // ── 3. Check verification_token table ───────────────────────────────────
  try {
    const r = await pool.query(`
      SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'verification_token'
    `);
    results.verification_token_table = parseInt(r.rows[0].count) > 0
      ? 'EXISTS'
      : 'MISSING — run: CREATE TABLE verification_token (identifier TEXT NOT NULL, expires TIMESTAMPTZ NOT NULL, token TEXT NOT NULL, PRIMARY KEY (identifier, token));';
  } catch (e) {
    results.verification_token_table = `DB error: ${e.message}`;
  }

  // ── 4. Test SMTP connection (no email sent) ──────────────────────────────
  try {
    const nodemailer = (await import('nodemailer')).default;
    const transport = nodemailer.createTransport({
      host:       'smtp.office365.com',
      port:       587,
      secure:     false,
      requireTLS: true,
      auth: {
        user: process.env.EMAIL_FROM,
        pass: process.env.EMAIL_SERVER_PASSWORD,
      },
      tls: { rejectUnauthorized: true },
      connectionTimeout: 10000,
      greetingTimeout:   10000,
    });

    await transport.verify();
    results.smtp = 'OK — connection and auth verified';
  } catch (e) {
    results.smtp = `FAILED: ${e.message}`;
  }

  return Response.json(results, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
