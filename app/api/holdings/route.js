/**
 * app/api/admin/holdings/route.js
 *
 * GET    /api/admin/holdings?userId=xxx       → list holdings for user
 * POST   /api/admin/holdings                  → create holding
 * PUT    /api/admin/holdings                  → update holding
 * DELETE /api/admin/holdings?id=xxx&userId=xxx → delete holding
 *
 * Requires manual_holdings table (see SQL below).
 * Admin only for cross-user operations; clients can only read their own.
 *
 * SQL to run once in Vercel Postgres:
 *   CREATE TABLE IF NOT EXISTS manual_holdings (
 *     id            SERIAL PRIMARY KEY,
 *     user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 *     fund_name     TEXT NOT NULL,
 *     amfi_code     TEXT,
 *     fund_type     TEXT NOT NULL DEFAULT 'Equity MF',
 *     units         NUMERIC(18,6) NOT NULL,
 *     purchase_nav  NUMERIC(18,6) NOT NULL,
 *     purchase_date DATE,
 *     folio         TEXT,
 *     notes         TEXT,
 *     created_at    TIMESTAMPTZ DEFAULT NOW(),
 *     updated_at    TIMESTAMPTZ DEFAULT NOW()
 *   );
 *   CREATE INDEX IF NOT EXISTS manual_holdings_user_idx ON manual_holdings(user_id);
 */

import { auth } from '@/auth';
import pool      from '@/lib/db';

const VALID_FUND_TYPES = ['Equity MF', 'Debt MF', 'Hybrid MF', 'Index Fund / ETF', 'SIF', 'Other'];

function validateHolding(body) {
  const { fund_name, fund_type, units, purchase_nav } = body;
  if (!fund_name?.trim())                     return 'fund_name is required';
  if (!VALID_FUND_TYPES.includes(fund_type))  return `fund_type must be one of: ${VALID_FUND_TYPES.join(', ')}`;
  if (isNaN(units)     || units     <= 0)     return 'units must be a positive number';
  if (isNaN(purchase_nav) || purchase_nav <= 0) return 'purchase_nav must be a positive number';
  return null;
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) return Response.json({ error: 'Unauthorised' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const targetUserId = searchParams.get('userId');

    // Non-admins can only read their own holdings
    if (targetUserId && targetUserId !== session.user.id && session.user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userId = targetUserId || session.user.id;

    const result = await pool.query(
      `SELECT id, fund_name, amfi_code, fund_type, units, purchase_nav,
              purchase_date, folio, notes, pan, created_at, updated_at
       FROM manual_holdings
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return Response.json({ holdings: result.rows });

  } catch (err) {
    console.error('[holdings GET]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// ── POST ─────────────────────────────────────────────────────────────────────

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id)            return Response.json({ error: 'Unauthorised' }, { status: 401 });
    if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden' },     { status: 403 });

    const body = await req.json();
    const { userId, fund_name, amfi_code, fund_type, units, purchase_nav,
            purchase_date, folio, notes } = body;

    if (!userId) return Response.json({ error: 'userId is required' }, { status: 400 });

    const validErr = validateHolding({ fund_name, fund_type, units, purchase_nav });
    if (validErr) return Response.json({ error: validErr }, { status: 400 });

    const result = await pool.query(
      `INSERT INTO manual_holdings
         (user_id, fund_name, amfi_code, fund_type, units, purchase_nav,
          purchase_date, folio, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [
        userId,
        fund_name.trim(),
        amfi_code?.trim()    || null,
        fund_type,
        parseFloat(units),
        parseFloat(purchase_nav),
        purchase_date        || null,
        folio?.trim()        || null,
        notes?.trim()        || null,
      ]
    );

    return Response.json({ holding: result.rows[0] }, { status: 201 });

  } catch (err) {
    console.error('[holdings POST]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// ── PUT ──────────────────────────────────────────────────────────────────────

export async function PUT(req) {
  try {
    const session = await auth();
    if (!session?.user?.id)            return Response.json({ error: 'Unauthorised' }, { status: 401 });
    if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden' },     { status: 403 });

    const body = await req.json();
    const { id, userId, fund_name, amfi_code, fund_type, units, purchase_nav,
            purchase_date, folio, notes } = body;

    if (!id || !userId) return Response.json({ error: 'id and userId are required' }, { status: 400 });

    const validErr = validateHolding({ fund_name, fund_type, units, purchase_nav });
    if (validErr) return Response.json({ error: validErr }, { status: 400 });

    // Confirm ownership
    const own = await pool.query(
      'SELECT id FROM manual_holdings WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (!own.rows.length) return Response.json({ error: 'Not found' }, { status: 404 });

    const result = await pool.query(
      `UPDATE manual_holdings SET
         fund_name     = $1,
         amfi_code     = $2,
         fund_type     = $3,
         units         = $4,
         purchase_nav  = $5,
         purchase_date = $6,
         folio         = $7,
         notes         = $8,
         updated_at    = NOW()
       WHERE id = $9 AND user_id = $10
       RETURNING *`,
      [
        fund_name.trim(),
        amfi_code?.trim()    || null,
        fund_type,
        parseFloat(units),
        parseFloat(purchase_nav),
        purchase_date        || null,
        folio?.trim()        || null,
        notes?.trim()        || null,
        id, userId,
      ]
    );

    return Response.json({ holding: result.rows[0] });

  } catch (err) {
    console.error('[holdings PUT]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}

// ── DELETE ───────────────────────────────────────────────────────────────────

export async function DELETE(req) {
  try {
    const session = await auth();
    if (!session?.user?.id)            return Response.json({ error: 'Unauthorised' }, { status: 401 });
    if (session.user.role !== 'admin') return Response.json({ error: 'Forbidden' },     { status: 403 });

    const { searchParams } = new URL(req.url);
    const id     = searchParams.get('id');
    const userId = searchParams.get('userId');

    if (!id || !userId) return Response.json({ error: 'id and userId are required' }, { status: 400 });

    const result = await pool.query(
      'DELETE FROM manual_holdings WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (!result.rows.length) return Response.json({ error: 'Not found' }, { status: 404 });

    return Response.json({ ok: true });

  } catch (err) {
    console.error('[holdings DELETE]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
