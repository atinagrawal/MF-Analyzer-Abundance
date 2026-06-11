// app/api/stock-signals/route.js
// Serves precomputed per-stock signals from the stock_signals table.
//
// GET /api/stock-signals                       → latest snapshot (all liquid-universe stocks)
// GET /api/stock-signals?date=YYYY-MM-DD       → snapshot for a specific date
// GET /api/stock-signals?isin=INE123A01011     → full history for one stock (all dates)
import pool from '@/lib/db';

export const revalidate = 3600;

const B = (v) => (v == null ? null : Boolean(v));
const N = (v) => (v == null ? null : Number(v));
const I = (v) => (v == null ? null : parseInt(v, 10));

function mapRow(r) {
  return {
    isin: r.isin,
    symbol: r.symbol,
    name: r.name,
    close: N(r.close),
    above_20: B(r.above_20), above_50: B(r.above_50),
    above_100: B(r.above_100), above_150: B(r.above_150), above_200: B(r.above_200),
    dma20: N(r.dma20), dma50: N(r.dma50), dma100: N(r.dma100),
    dma150: N(r.dma150), dma200: N(r.dma200),
    golden_cross: B(r.golden_cross), death_cross: B(r.death_cross),
    bull_stacked: B(r.bull_stacked), bear_stacked: B(r.bear_stacked),
    new_high_52w: B(r.new_high_52w), new_low_52w: B(r.new_low_52w),
    pct_from_52h: N(r.pct_from_52h), pct_from_52l: N(r.pct_from_52l),
    adv_dec: I(r.adv_dec),
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const isin = searchParams.get('isin');
  const dateParam = searchParams.get('date');

  try {
    if (isin) {
      // history for one stock across all stored dates
      const { rows } = await pool.query(
        `SELECT snap_date, isin, symbol, name, close,
                above_20, above_50, above_100, above_150, above_200,
                dma20, dma50, dma100, dma150, dma200,
                golden_cross, death_cross, bull_stacked, bear_stacked,
                new_high_52w, new_low_52w, pct_from_52h, pct_from_52l, adv_dec
           FROM stock_signals
          WHERE isin = $1
          ORDER BY snap_date ASC`,
        [isin.toUpperCase()]
      );
      if (!rows.length) return Response.json({ error: 'not found', isin }, { status: 404 });
      return Response.json({
        isin: rows[0].isin,
        symbol: rows[0].symbol,
        name: rows[0].name,
        history: rows.map((r) => ({ date: r.snap_date.toISOString().slice(0, 10), ...mapRow(r) })),
      }, { headers: { 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } });
    }

    // snapshot for a specific date or the latest available date
    let targetDate = dateParam;
    if (!targetDate) {
      const { rows: latest } = await pool.query(
        `SELECT snap_date FROM stock_signals ORDER BY snap_date DESC LIMIT 1`
      );
      if (!latest.length) return Response.json({ error: 'no data' }, { status: 503 });
      targetDate = latest[0].snap_date.toISOString().slice(0, 10);
    }

    const { rows } = await pool.query(
      `SELECT snap_date, isin, symbol, name, close,
              above_20, above_50, above_100, above_150, above_200,
              dma20, dma50, dma100, dma150, dma200,
              golden_cross, death_cross, bull_stacked, bear_stacked,
              new_high_52w, new_low_52w, pct_from_52h, pct_from_52l, adv_dec
         FROM stock_signals
        WHERE snap_date = $1
        ORDER BY name ASC`,
      [targetDate]
    );

    return new Response(
      JSON.stringify({ asof: targetDate, count: rows.length, stocks: rows.map(mapRow) }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 's-maxage=3600, stale-while-revalidate=86400' } }
    );
  } catch (e) {
    return Response.json({ error: 'stock signals unavailable', detail: String(e.message || e) }, { status: 503 });
  }
}
