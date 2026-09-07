// app/api/nfo/route.js — public read of the synced NFO document.
// Mirrors app/api/screener/route.js's caching shape: no Postgres, no
// personalization, safe under concurrent load by design.

import { getNfoData } from '@/lib/nfoData';

export const revalidate = 3600;

export async function GET() {
  try {
    const data = await getNfoData();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (e) {
    return Response.json(
      { error: 'NFO data unavailable', syncedAt: null, mf: [], sif: [] },
      { status: 503 }
    );
  }
}
