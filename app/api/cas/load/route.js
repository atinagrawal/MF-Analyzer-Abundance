/**
 * app/api/cas/load/route.js
 *
 * GET /api/cas/load?key=cas/{userId}/{file}.json
 *
 * Verifies the session, confirms the requested blob key belongs to
 * the current user (or that the user is admin), fetches the private
 * blob with the server-side token, and streams the JSON back to the
 * client. The client never sees BLOB_READ_WRITE_TOKEN.
 */

import { auth } from '@/auth';
import pool      from '@/lib/db';

export async function GET(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const blobKey = searchParams.get('key');

    if (!blobKey) {
      return Response.json({ error: 'Missing key' }, { status: 400 });
    }

    // Confirm this blob key belongs to the user (security check)
    const ownership = await pool.query(
      `SELECT user_id FROM cas_portfolios WHERE blob_key = $1 LIMIT 1`,
      [blobKey]
    );

    if (ownership.rows.length === 0) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const owner = ownership.rows[0].user_id;
    const isAdmin = session.user.role === 'admin';

    if (owner !== session.user.id && !isAdmin) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch from Vercel Blob using server-side token
    // Private blobs require Authorization header
    const { list } = await import('@vercel/blob');
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    const { blobs } = await list({ prefix: blobKey, limit: 1, token });

    if (!blobs.length) {
      return Response.json({ error: 'Blob not found' }, { status: 404 });
    }

    const blobRes = await fetch(blobs[0].downloadUrl || blobs[0].url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Cache-Control': 'no-store',
      },
    });

    if (!blobRes.ok) {
      return Response.json({ error: 'Failed to fetch blob' }, { status: 502 });
    }

    const data = await blobRes.json();
    return Response.json(data);

  } catch (err) {
    console.error('[cas/load]', err.name, err.message);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
