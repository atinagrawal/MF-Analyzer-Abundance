// app/api/bse-index-dashboard/route.js — fast read of the precomputed BSE index dataset.
// The heavy compute (fetching ~141 BSE indices) runs nightly on GitHub Actions
// (scripts/build-bse-index-dashboard.mjs); this route just SELECTs, so it
// stays well within Hobby function limits. Shape mirrors pages/api/index-dashboard.js's
// NSE data so app/indices/page.js can merge both into one table.

import { getBseIndexData } from '@/lib/indicesData';

export const revalidate = 21600; // 6h — data is rebuilt once daily

export async function GET() {
    try {
        const payload = await getBseIndexData();
        return Response.json(
            payload,
            { status: 200, headers: { 'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400' } }
        );
    } catch (e) {
        return Response.json(
            { error: 'bse index dashboard unavailable', detail: String(e.message || e), indices: [] },
            { status: 503 }
        );
    }
}
