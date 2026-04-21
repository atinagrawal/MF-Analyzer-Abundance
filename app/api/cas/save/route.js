/**
 * app/api/cas/save/route.js
 *
 * POST /api/cas/save
 * Body (JSON): { parsedData, fileName, panCount }
 *
 * Saves the raw parsed CAS JSON (output of /api/parse) to Vercel Blob,
 * then logs the upload in the cas_portfolios table.
 *
 * Auth: requires a valid database session (set by NextAuth).
 * Admin can call this on behalf of any user by passing targetUserId.
 */

import { auth }   from '@/auth';
import pool        from '@/lib/db';
import { put }     from '@vercel/blob';

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

    // Write to Vercel Blob: cas/{userId}/{timestamp}-{sanitisedName}.json
    const ts       = Date.now();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60);
    const blobKey  = `cas/${userId}/${ts}-${safeName}.json`;

    const blob = await put(blobKey, JSON.stringify(parsedData), {
      access:           'private',
      contentType:      'application/json',
      addRandomSuffix:  false,
      token:            process.env.BLOB_READ_WRITE_TOKEN,
    });

    // Log to database
    const result = await pool.query(
      `INSERT INTO cas_portfolios (user_id, file_name, blob_key, pan_count)
       VALUES ($1, $2, $3, $4)
       RETURNING id, uploaded_at`,
      [userId, fileName, blobKey, panCount ?? 0]
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
