// pages/api/db-check.js
// Temporary — verifies all schema tables exist. Delete after confirming.

import pool from '@/lib/db';

export default async function handler(req, res) {
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN (
        'users', 'accounts', 'sessions',
        'verification_token', 'cas_portfolios'
      )
      ORDER BY table_name
    `);

    const found = result.rows.map(r => r.table_name);
    const expected = ['accounts', 'cas_portfolios', 'sessions', 'users', 'verification_token'];
    const missing = expected.filter(t => !found.includes(t));

    res.status(200).json({
      ok: missing.length === 0,
      found,
      missing,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
}
