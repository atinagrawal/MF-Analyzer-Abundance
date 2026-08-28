/**
 * app/api/pms-period-history/route.js
 *
 * GET /api/pms-period-history?iaid=327
 *
 * Thin HTTP wrapper around lib/pmsPeriodHistoryCache.js's
 * getPmsPeriodHistoryCached() -- see that file for the actual
 * backfill/extend + three-layer cache logic.
 */

import { NextResponse } from 'next/server';
import { getPmsPeriodHistoryCached, getStalePmsPeriodHistory } from '@/lib/pmsPeriodHistoryCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const iaid = searchParams.get('iaid');
  if (!iaid) {
    return NextResponse.json({ status: 'error', message: 'Missing iaid param' }, { status: 400 });
  }

  try {
    const data = await getPmsPeriodHistoryCached(iaid);
    return NextResponse.json(
      { status: 'success', data },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=604800' } }
    );
  } catch (err) {
    console.error('[pms-period-history] Route error:', err.message);
    const stale = await getStalePmsPeriodHistory(iaid).catch(() => []);
    if (stale.length) return NextResponse.json({ status: 'success', data: stale, stale: true });
    return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
  }
}
