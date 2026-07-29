// app/api/sif-screener/route.js — fast read of the precomputed SIF dataset.
// The heavy compute runs nightly on GitHub Actions (scripts/build-sif-screener.mjs);
// this route just SELECTs, mirroring app/api/screener/route.js's exact pattern.

import pool from '@/lib/db';

export const revalidate = 21600;

const COLS = 'scheme_id,nav_name,sif_name,category,nav,nav_date,ret_1m,ret_3m,ret_6m,ret_1y,ret_3y,ret_5y,ret_7y,ret_10y,vol,max_dd,ret_per_risk,age_years,inception_date,ret_inception,ret_inception_annualized,asof';

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM sif_screener ORDER BY nav_name ASC`
    );
    const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));
    const schemes = rows.map((r) => ({
      scheme_id: r.scheme_id, nav_name: r.nav_name, sif_name: r.sif_name, category: r.category,
      nav: num(r.nav), nav_date: r.nav_date,
      ret_1m: num(r.ret_1m), ret_3m: num(r.ret_3m), ret_6m: num(r.ret_6m),
      ret_1y: num(r.ret_1y), ret_3y: num(r.ret_3y), ret_5y: num(r.ret_5y),
      ret_7y: num(r.ret_7y), ret_10y: num(r.ret_10y),
      vol: num(r.vol), max_dd: num(r.max_dd), ret_per_risk: num(r.ret_per_risk),
      age_years: num(r.age_years), inception_date: r.inception_date || null,
      ret_inception: num(r.ret_inception), ret_inception_annualized: r.ret_inception_annualized,
      asof: r.asof,
    }));
    const asof = schemes.length ? schemes[0].asof : null;
    return new Response(JSON.stringify({ asof, count: schemes.length, schemes }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 's-maxage=21600, stale-while-revalidate=86400',
      },
    });
  } catch (e) {
    return Response.json(
      { error: 'sif screener data unavailable', detail: String(e.message || e), schemes: [] },
      { status: 503 }
    );
  }
}
