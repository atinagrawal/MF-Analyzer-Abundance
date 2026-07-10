// app/api/bse-index-dashboard/route.js — fast read of the precomputed BSE index dataset.
// The heavy compute (fetching ~141 BSE indices) runs nightly on GitHub Actions
// (scripts/build-bse-index-dashboard.mjs); this route just SELECTs, so it
// stays well within Hobby function limits. Shape mirrors pages/api/index-dashboard.js's
// NSE data so app/indices/page.js can merge both into one table.

import pool from '@/lib/db';

export const revalidate = 21600; // 6h — data is rebuilt once daily

const COLS = 'symbol,name,cat,short,r1m,r3m,r1y,r3y,r5y,pe,pb,dy,as_of';

export async function GET() {
    try {
        const { rows } = await pool.query(
            `SELECT ${COLS} FROM bse_index_dashboard ORDER BY name ASC`
        );
        // node-postgres returns NUMERIC columns as STRINGS (to preserve precision).
        const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));
        const indices = rows.map((r) => ({
            name: r.name,
            cat: r.cat,
            short: r.short,
            exchange: 'BSE',
            returns: { r1m: num(r.r1m), r3m: num(r.r3m), r1y: num(r.r1y), r3y: num(r.r3y), r5y: num(r.r5y) },
            risk: { vol: null, beta: null },
            val: { pe: num(r.pe), pb: num(r.pb), dy: num(r.dy) },
        }));
        const maxAsOf = rows.length ? rows.reduce((max, r) => (r.as_of > max ? r.as_of : max), rows[0].as_of) : null;
        const asOf = maxAsOf ? new Date(maxAsOf).toISOString().slice(0, 10) : null;
        return Response.json(
            { asOf, count: indices.length, indices, source: 'BSE Indices' },
            { status: 200, headers: { 'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400' } }
        );
    } catch (e) {
        return Response.json(
            { error: 'bse index dashboard unavailable', detail: String(e.message || e), indices: [] },
            { status: 503 }
        );
    }
}
