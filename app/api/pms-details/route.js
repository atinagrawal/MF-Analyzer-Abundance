/**
 * app/api/pms-details/route.js
 *
 * GET /api/pms-details?iaid=327
 *
 * Thin HTTP wrapper around lib/pmsDetailsCache.js's getPmsDetailsCached() --
 * see that file for the actual three-layer cache logic.
 */

import { NextResponse } from 'next/server';
import { getPmsDetailsCached, getStalePmsDetails } from '@/lib/pmsDetailsCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const iaid = searchParams.get('iaid');
  if (!iaid) {
    return NextResponse.json({ status: 'error', message: 'Missing iaid param' }, { status: 400 });
  }

  try {
    const data = await getPmsDetailsCached(iaid);
    if (!data) {
      return NextResponse.json({ status: 'success', data: null, reason: 'IAID not found on APMI' });
    }
    return NextResponse.json(
      { status: 'success', data },
      { headers: { 'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=2592000' } }
    );
  } catch (err) {
    console.error('[pms-details] Route error:', err.message);

    // Stale-on-error: serve whatever we last had, even expired.
    const stale = await getStalePmsDetails(iaid).catch(() => null);
    if (stale) return NextResponse.json({ status: 'success', data: stale, stale: true });

    return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
  }
}
