/**
 * app/api/precious-metals-rates/route.js
 *
 * GET /api/precious-metals-rates
 *
 * Serves the cached live Gold/Silver/Platinum rates (see
 * lib/preciousMetalsCache.js) to the /gold-silver-rates page's client
 * component, which polls this on an interval. The page never lets the
 * browser call the upstream refinery endpoint directly -- every visitor
 * shares this one cached fetch instead.
 */

import { NextResponse } from 'next/server';
import { getCachedPreciousMetalsRates } from '@/lib/preciousMetalsCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const data = await getCachedPreciousMetalsRates();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[api/precious-metals-rates]', err.message);
    return NextResponse.json({ error: 'Rates temporarily unavailable' }, { status: 503 });
  }
}
