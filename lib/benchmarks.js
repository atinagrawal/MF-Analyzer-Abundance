/**
 * lib/benchmarks.js (Server only)
 *
 * Category benchmark query against Postgres bse_index_dashboard with static fallback.
 */

import pool from '@/lib/db';
import { FALLBACK_BENCHMARKS } from '@/app/screener/screenerContent';

export { FALLBACK_BENCHMARKS };

export async function getBenchmarkDataset() {
  const result = { ...FALLBACK_BENCHMARKS };

  try {
    const { rows } = await pool.query(
      `SELECT symbol, name, r1m, r3m, r1y, r3y, r5y, as_of FROM bse_index_dashboard WHERE symbol = ANY($1)`,
      [['BSE500', 'BSE100', 'BSEMID', 'BSESML', 'SPB25XIP']]
    );
    if (rows && rows.length > 0) {
      const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x));
      for (const r of rows) {
        if (result[r.symbol]) {
          if (r.r1m != null) result[r.symbol].ret_1m = num(r.r1m);
          if (r.r3m != null) result[r.symbol].ret_3m = num(r.r3m);
          if (r.r1y != null) result[r.symbol].ret_1y = num(r.r1y);
          if (r.r3y != null) result[r.symbol].ret_3y = num(r.r3y);
          if (r.r5y != null) result[r.symbol].ret_5y = num(r.r5y);
          if (r.as_of) result[r.symbol].nav_date = new Date(r.as_of).toISOString().slice(0, 10);
        }
      }
    }
  } catch (err) {
    console.warn('[getBenchmarkDataset] DB read failed, using fallback benchmarks:', err.message);
  }

  return result;
}
