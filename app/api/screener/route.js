// app/api/screener/route.js — fast read of the precomputed screener dataset.
// The heavy compute runs nightly on GitHub Actions (scripts/build-screener.mjs);
// this route just SELECTs, so it stays well within Hobby function limits.

import pool from '@/lib/db';

// Cache the response for 6h (data is rebuilt once daily). This avoids hitting
// Postgres — and the ~5s Neon cold-start — on every request. force-dynamic was
// doing the opposite: it clobbered the Cache-Control header to max-age=0, so
// most requests were slow cold MISSes.
export const revalidate = 21600;

const COLS = 'code,name,amc,category,structure,nav,nav_date,ret_1m,ret_3m,ret_6m,ret_1y,ret_3y,ret_5y,ret_7y,ret_10y,vol,max_dd,ret_per_risk,age_years,flag,asof';

export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT ${COLS} FROM mf_screener ORDER BY ret_3y DESC NULLS LAST`
    );
    // node-postgres returns NUMERIC columns as STRINGS (to preserve precision).
    // The UI does math/.toFixed() on these, so coerce them to numbers here.
    const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));
    const funds = rows.map((r) => ({
      code: r.code, name: r.name, amc: r.amc, category: r.category, structure: r.structure,
      nav: num(r.nav), nav_date: r.nav_date,
      ret_1m: num(r.ret_1m), ret_3m: num(r.ret_3m), ret_6m: num(r.ret_6m),
      ret_1y: num(r.ret_1y), ret_3y: num(r.ret_3y), ret_5y: num(r.ret_5y),
      ret_7y: num(r.ret_7y), ret_10y: num(r.ret_10y),
      vol: num(r.vol), max_dd: num(r.max_dd), ret_per_risk: num(r.ret_per_risk),
      age_years: num(r.age_years), flag: r.flag, asof: r.asof,
    }));
    const asof = funds.length ? funds[0].asof : null;
    return new Response(JSON.stringify({ asof, count: funds.length, funds }), {
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
