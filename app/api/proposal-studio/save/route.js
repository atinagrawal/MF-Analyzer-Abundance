/**
 * app/api/proposal-studio/save/route.js
 *
 * POST /api/proposal-studio/save
 * Body (JSON): { clientName, clientEmail, clientPhone, proposalType,
 *                sipFrequency, totalAmount, selectedFunds,
 *                advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin }
 *
 * Saves the full proposal payload to Cloudflare R2, then logs it in the
 * proposals table so the owning user can list and reload it later.
 * Mirrors app/api/cas/save/route.js's R2-then-row pattern exactly.
 *
 * Auth: requires a valid database session (set by NextAuth).
 */

import { auth } from '@/auth';
import pool     from '@/lib/db';
import { r2Put } from '@/lib/r2';

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const {
      clientName, clientEmail, clientPhone,
      proposalType, sipFrequency, totalAmount, selectedFunds,
      advisorName, advisorPhone, advisorEmail, advisorArn, advisorEuin,
    } = await req.json();

    if (!proposalType || !Array.isArray(selectedFunds) || selectedFunds.length === 0) {
      return Response.json({ error: 'Missing proposalType or selectedFunds' }, { status: 400 });
    }

    const userId = session.user.id;

    const payload = {
      clientName: clientName || '',
      clientEmail: clientEmail || '',
      clientPhone: clientPhone || '',
      // Advisor ("Prepared By") details -- editable per-proposal so any
      // distributor can use this tool for their own clients. Only lives in
      // the R2 payload, not a dedicated proposals table column, since the
      // saved-proposals list (app/api/proposal-studio/list) doesn't need
      // to search/display by advisor.
      advisorName: advisorName || '',
      advisorPhone: advisorPhone || '',
      advisorEmail: advisorEmail || '',
      advisorArn: advisorArn || '',
      advisorEuin: advisorEuin || '',
      proposalType,
      sipFrequency: sipFrequency || 'monthly',
      totalAmount: totalAmount || 0,
      selectedFunds: selectedFunds.map((f) => ({
        amfiCode: f.amfiCode,
        schemeName: f.schemeName,
        amount: f.amount || 0,
        source: f.source,
      })),
      savedAt: new Date().toISOString(),
    };

    // Write to R2: proposal-studio/{userId}/{timestamp}-{safeName}.json
    const ts = Date.now();
    const safeName = (clientName || 'proposal').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    const blobKey = `proposal-studio/${userId}/${ts}-${safeName}.json`;

    await r2Put(blobKey, JSON.stringify(payload));

    const result = await pool.query(
      `INSERT INTO proposals (user_id, client_name, client_email, client_phone, proposal_type, total_amount, fund_count, blob_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [userId, clientName || '', clientEmail || '', clientPhone || '', proposalType, totalAmount || 0, selectedFunds.length, blobKey]
    );

    const row = result.rows[0];
    return Response.json({
      ok: true,
      id: row.id,
      blobKey,
      createdAt: row.created_at,
    });

  } catch (err) {
    console.error('[proposal-studio/save]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
