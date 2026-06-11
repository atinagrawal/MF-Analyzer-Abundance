// app/api/breadth/route.js — serves the market-breadth snapshot series.
// Heavy compute runs nightly (scripts/build-breadth.mjs); this just SELECTs.
import pool from '@/lib/db';

export const revalidate = 3600;

const COLS = 'snap_date,universe,a20,t20,a50,t50,a100,t100,a150,t150,a200,t200,advancing,declining,unchanged,new_high,new_low,regime_pct';
const I = (x) => (x == null ? null : parseInt(x, 10));
const N = (x) => (x == null ? null : Number(x));

export async function GET() {
  try {
    const { rows } = await pool.query(`SELECT ${COLS} FROM market_breadth ORDER BY snap_date ASC`);
    const snaps = rows.map((r) => ({
      date: r.snap_date instanceof Date ? r.snap_date.toISOString().slice(0, 10) : String(r.snap_date).slice(0, 10),
      universe: I(r.universe),
      a20: I(r.a20), t20: I(r.t20), a50: I(r.a50), t50: I(r.t50), a100: I(r.a100), t100: I(r.t100),
      a150: I(r.a150), t150: I(r.t150), a200: I(r.a200), t200: I(r.t200),
      advancing: I(r.advancing), declining: I(r.declining), unchanged: I(r.unchanged),
      new_high: I(r.new_high), new_low: I(r.new_low), regime_pct: N(r.regime_pct),
    }));
    return new Response(JSON.stringify({ asof: snaps.length ? snaps[snaps.length - 1].date : null, count: snaps.length, snaps }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (e) {
    return Response.json({ error: 'breadth data unavailable', detail: String(e.message || e), snaps: [] }, { status: 503 });
  }
}
