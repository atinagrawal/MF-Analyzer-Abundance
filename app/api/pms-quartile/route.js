/**
 * app/api/pms-quartile/route.js
 *
 * GET /api/pms-quartile?iaid=233&provider=Abakkus%20Asset%20Manager%20Private%20Limited&strategy=Equity&year=2026&month=6
 *
 * Thin HTTP wrapper around lib/pmsQuartileCache.js's getPmsQuartileCached() --
 * see that file for the actual scrape + three-layer cache logic.
 */

import { NextResponse } from 'next/server';
import { getPmsQuartileCached } from '@/lib/pmsQuartileCache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const iaid     = searchParams.get('iaid');
    const provider = searchParams.get('provider');
    const strategy = searchParams.get('strategy') || 'Equity';
    const year     = parseInt(searchParams.get('year'), 10);
    const month    = parseInt(searchParams.get('month'), 10);

    if (!iaid || !provider || !year || !month) {
        return NextResponse.json({ status: 'error', message: 'Missing iaid, provider, year, or month' }, { status: 400 });
    }

    try {
        const data = await getPmsQuartileCached(iaid, provider, strategy, year, month);
        if (data === null) {
            return NextResponse.json({ status: 'success', data: null, reason: 'provider not found in APMI registry' });
        }
        return NextResponse.json(
            { status: 'success', data, source: 'live' },
            { headers: { 'Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=2592000' } }
        );
    } catch (err) {
        console.error('[pms-quartile] Route error:', err.message);
        return NextResponse.json({ status: 'error', message: err.message }, { status: 500 });
    }
}
