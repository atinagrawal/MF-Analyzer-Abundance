// app/api/screener/route.js — fast read of the precomputed screener dataset.
// The heavy compute runs nightly on GitHub Actions (scripts/build-screener.mjs);
// this route delegates to lib/screenerData.js for in-memory caching and SSR parity.

import { getScreenerDataset } from '@/lib/screenerData';
import { FALLBACK_BENCHMARKS } from '@/lib/benchmarks';

// Cache the response for 6h (data is rebuilt once daily). This avoids hitting
// Postgres — and the ~5s Neon cold-start — on every request.
export const revalidate = 21600;

export async function GET() {
  try {
    const dataset = await getScreenerDataset();

    return new Response(JSON.stringify(dataset), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400',
      },
    });
  } catch (e) {
    return Response.json(
      { error: 'screener data unavailable', detail: String(e.message || e), funds: [], benchmarks: FALLBACK_BENCHMARKS, stressMap: {} },
      { status: 503 }
    );
  }
}
