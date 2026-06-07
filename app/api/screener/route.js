// app/api/screener/route.js — fast read of the precomputed screener dataset.
// The heavy compute runs nightly on GitHub Actions (scripts/build-screener.mjs);
// this route just SELECTs, so it stays well within Hobby function limits.

import pool from '@/lib/db';

export const dynamic = 'force-dynamic';

const COLS = 'code,name,amc,category,structure,nav,nav_date,ret_1y,ret_3y,ret_5y,vol,max_dd,ret_per_risk,age_years,flag,asof';

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM mf_screener ORDER BY ret_3y DESC NULLS LAST`
    );
    const asof = rows.length ? rows[0].asof : null;
    return new Response(JSON.stringify({ asof, count: rows.length, funds: rows }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400',
      },
    });
  } catch (e) {
    return Response.json(
      { error: 'screener data unavailable', detail: String(e.message || e), funds: [] },
      { status: 503 }
    );
  }
}
