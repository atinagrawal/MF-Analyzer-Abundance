/**
 * app/api/cas/save/route.js
 *
 * POST /api/cas/save
 * Body (JSON): { parsedData, fileName, panCount }
 *
 * Saves the raw parsed CAS JSON (output of /api/parse) to Cloudflare R2,
 * then logs the upload in the cas_portfolios table. blob_key's name/format
 * is unchanged from the Vercel-Blob era -- it's just an R2 object key now.
 *
 * Auth: requires a valid database session (set by NextAuth).
 * Admin can call this on behalf of any user by passing targetUserId.
 */

import { auth }   from '@/auth';
import pool        from '@/lib/db';
import { r2Put }   from '@/lib/r2';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { parsedData, fileName, panCount, targetUserId } = await req.json();

    if (!parsedData || !fileName) {
      return Response.json({ error: 'Missing parsedData or fileName' }, { status: 400 });
    }

    // Admin can save on behalf of another user
    const userId = (session.user.role === 'admin' && targetUserId)
      ? targetUserId
      : session.user.id;

    // Extract PANs server-side (not trusted from the client) — this becomes
    // the authorization source for pan_investor_names: a user/admin may only
    // read or rename a PAN that appears in one of their own saved uploads.
    let pans = [...new Set(
      (parsedData.folios || [])
        .map(f => (f.PAN || '').toUpperCase().trim())
        .filter(p => PAN_REGEX.test(p))
    )];

    if (pans.length === 0 && parsedData.resolved_pan && PAN_REGEX.test(parsedData.resolved_pan.toUpperCase().trim())) {
      pans = [parsedData.resolved_pan.toUpperCase().trim()];
    }

    // For NSDL statements with masked PANs (e.g. BSXXXXXX4B)
    if (pans.length === 0 && (parsedData.folios || []).length > 0) {
      const masked = (parsedData.folios[0]?.PAN || parsedData.masked_pan || '').toUpperCase().trim();
      if (masked) pans = [masked];
    }

    // Write to R2: cas/{userId}/{timestamp}-{sanitisedName}.json
    const ts       = Date.now();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    const blobKey  = `cas/${userId}/${ts}-${safeName}.json`;

    await r2Put(blobKey, JSON.stringify(parsedData));

    // Log to database
    const effectivePanCount = pans.length || (parsedData.folios?.length ? 1 : 0);
    const result = await pool.query(
      `INSERT INTO cas_portfolios (user_id, file_name, blob_key, pan_count, pans)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, uploaded_at`,
      [userId, fileName, blobKey, panCount ?? effectivePanCount, pans]
    );

    const row = result.rows[0];
    return Response.json({
      ok:          true,
      id:          row.id,
      blobKey,
      uploadedAt:  row.uploaded_at,
    });

  } catch (err) {
    console.error('[cas/save]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
