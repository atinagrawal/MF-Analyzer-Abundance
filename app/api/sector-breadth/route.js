// app/api/sector-breadth/route.js
// Serves precomputed sector-level breadth snapshots from sector_breadth table.
//
// GET /api/sector-breadth                  → all sectors, all dates
// GET /api/sector-breadth?date=YYYY-MM-DD  → all sectors for one date
// GET /api/sector-breadth?sector=Bank      → one sector across all dates
import pool from '@/lib/db';

export const revalidate = 3600;

const I = (v) => (v == null ? null : parseInt(v, 10));
const N = (v) => (v == null ? null : Number(v));

function mapRow(r) {
  return {
    universe: I(r.universe),
    a20: I(r.a20), t20: I(r.t20),
    a50: I(r.a50), t50: I(r.t50),
    a100: I(r.a100), t100: I(r.t100),
    a150: I(r.a150), t150: I(r.t150),
    a200: I(r.a200), t200: I(r.t200),
    advancing: I(r.advancing), declining: I(r.declining), unchanged: I(r.unchanged),
    new_high: I(r.new_high), new_low: I(r.new_low),
    regime_pct: N(r.regime_pct),
    golden_cross: I(r.golden_cross), death_cross: I(r.death_cross),
    bull_stacked: I(r.bull_stacked), bear_stacked: I(r.bear_stacked),
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const dateParam   = searchParams.get('date');
  const sectorParam = searchParams.get('sector');

  try {
    let rows;

    if (dateParam) {
      ({ rows } = await pool.query(
        `SELECT snap_date, sector, universe,
                a20,t20,a50,t50,a100,t100,a150,t150,a200,t200,
                advancing,declining,unchanged,new_high,new_low,regime_pct,
                golden_cross,death_cross,bull_stacked,bear_stacked
           FROM sector_breadth
          WHERE snap_date = $1
          ORDER BY sector ASC`,
        [dateParam]
      ));
    } else if (sectorParam) {
      ({ rows } = await pool.query(
        `SELECT snap_date, sector, universe,
                a20,t20,a50,t50,a100,t100,a150,t150,a200,t200,
                advancing,declining,unchanged,new_high,new_low,regime_pct,
                golden_cross,death_cross,bull_stacked,bear_stacked
           FROM sector_breadth
          WHERE sector = $1
          ORDER BY snap_date ASC`,
        [sectorParam]
      ));
    } else {
      ({ rows } = await pool.query(
        `SELECT snap_date, sector, universe,
                a20,t20,a50,t50,a100,t100,a150,t150,a200,t200,
                advancing,declining,unchanged,new_high,new_low,regime_pct,
                golden_cross,death_cross,bull_stacked,bear_stacked
           FROM sector_breadth
          ORDER BY snap_date ASC, sector ASC`
      ));
    }

    if (!rows.length) return Response.json({ error: 'no data' }, { status: 503 });

    // derive sector list and latest date from result
    const sectorSet = new Set(rows.map((r) => r.sector));
    const sectors = [...sectorSet].sort();
    const asof = rows[rows.length - 1].snap_date.toISOString().slice(0, 10);

    // reshape into {date → {sector → metrics}} for easy client consumption
    const byDate = new Map();
    for (const r of rows) {
      const d = r.snap_date.toISOString().slice(0, 10);
      if (!byDate.has(d)) byDate.set(d, { date: d });
      byDate.get(d)[r.sector] = mapRow(r);
    }
    const snaps = [...byDate.values()];

    return new Response(
      JSON.stringify({ asof, sectors, count: snaps.length, snaps }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (e) {
    return Response.json({ error: 'sector breadth unavailable', detail: String(e.message || e) }, { status: 503 });
  }
}
