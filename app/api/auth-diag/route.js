/**
 * app/api/auth-diag/route.js — TEMPORARY diagnostic endpoint
 * DELETE once email login is confirmed working.
 */

import pool from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const results = {};

  results.auth_secret = process.env.AUTH_SECRET
    ? `set (${process.env.AUTH_SECRET.length} chars)` : 'MISSING';
  results.resend_key = process.env.RESEND_KEY
    ? `set (${process.env.RESEND_KEY.length} chars, starts: ${process.env.RESEND_KEY.slice(0,5)}...)` : 'MISSING';

  // DB table check
  try {
    const r = await pool.query(`
      SELECT COUNT(*) FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'verification_token'
    `);
    results.verification_token_table = parseInt(r.rows[0].count) > 0 ? 'EXISTS' : 'MISSING';
  } catch (e) {
    results.verification_token_table = `DB error: ${e.message}`;
  }

  // Resend API check (validates key without sending)
  try {
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${process.env.RESEND_KEY}` },
    });
    if (res.ok) {
      const d = await res.json();
      const domains = (d.data || []).map(x => `${x.name} (${x.status})`);
      results.resend_api = `OK — key valid, domains: ${domains.join(', ') || 'none yet'}`;
    } else {
      const err = await res.json().catch(() => ({}));
      results.resend_api = `FAILED ${res.status}: ${JSON.stringify(err)}`;
    }
  } catch (e) {
    results.resend_api = `Error: ${e.message}`;
  }

  return Response.json(results, { headers: { 'Cache-Control': 'no-store' } });
}
