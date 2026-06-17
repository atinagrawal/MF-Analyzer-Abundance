// app/api/stress-test/route.js
// Returns AMFI stress test & liquidity data for a given fund code.
// The data is fetched nightly by scripts/fetch-stress-test.mjs.

import pool from '@/lib/db';

export const revalidate = 86400; // cache for 24h

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');

  try {
    if (!code || code === 'all') {
      // Fetch latest month's records for all schemes
      const { rows } = await pool.query(
        `SELECT
          scheme_code, scheme_name, amc_name, category, month,
          aum_cr, days_50pct, days_25pct, top10_investors_pct,
          large_cap_pct, mid_cap_pct, small_cap_pct, cash_pct,
          std_dev_portfolio, std_dev_benchmark, beta,
          pe_portfolio, pe_benchmark, pe_benchmark_1ya, pe_benchmark_2ya,
          turnover_ratio, fetched_at
         FROM mf_stress_test
         WHERE month = (SELECT MAX(month) FROM mf_stress_test)`
      );

      const num = (x) => (x === null || x === undefined ? null : Number(x));
      const data = {};
      for (const r of rows) {
        data[r.scheme_code] = {
          scheme_code: r.scheme_code,
          scheme_name: r.scheme_name,
          amc_name: r.amc_name,
          category: r.category,
          month: r.month,
          aum_cr: num(r.aum_cr),
          days_50pct: num(r.days_50pct),
          days_25pct: num(r.days_25pct),
          top10_investors_pct: num(r.top10_investors_pct),
          large_cap_pct: num(r.large_cap_pct),
          mid_cap_pct: num(r.mid_cap_pct),
          small_cap_pct: num(r.small_cap_pct),
          cash_pct: num(r.cash_pct),
          std_dev_portfolio: num(r.std_dev_portfolio),
          std_dev_benchmark: num(r.std_dev_benchmark),
          beta: num(r.beta),
          pe_portfolio: num(r.pe_portfolio),
          pe_benchmark: num(r.pe_benchmark),
          pe_benchmark_1ya: num(r.pe_benchmark_1ya),
          pe_benchmark_2ya: num(r.pe_benchmark_2ya),
          turnover_ratio: num(r.turnover_ratio),
        };
      }

      return Response.json({ data }, {
        status: 200,
        headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600' },
      });
    }

    if (isNaN(Number(code))) {
      return Response.json({ error: 'invalid code param' }, { status: 400 });
    }

    const { rows } = await pool.query(
      `SELECT
        scheme_code, scheme_name, amc_name, category, month,
        aum_cr, days_50pct, days_25pct, top10_investors_pct,
        large_cap_pct, mid_cap_pct, small_cap_pct, cash_pct,
        std_dev_portfolio, std_dev_benchmark, beta,
        pe_portfolio, pe_benchmark, pe_benchmark_1ya, pe_benchmark_2ya,
        turnover_ratio, fetched_at
       FROM mf_stress_test
       WHERE scheme_code = $1
       ORDER BY month DESC
       LIMIT 1`,
      [Number(code)]
    );

    if (rows.length === 0) {
      return Response.json({ data: null }, {
        status: 200,
        headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600' },
      });
    }

    const num = (x) => (x === null || x === undefined ? null : Number(x));
    const r = rows[0];
    const data = {
      scheme_code: r.scheme_code,
      scheme_name: r.scheme_name,
      amc_name: r.amc_name,
      category: r.category,
      month: r.month,
      aum_cr: num(r.aum_cr),
      days_50pct: num(r.days_50pct),
      days_25pct: num(r.days_25pct),
      top10_investors_pct: num(r.top10_investors_pct),
      large_cap_pct: num(r.large_cap_pct),
      mid_cap_pct: num(r.mid_cap_pct),
      small_cap_pct: num(r.small_cap_pct),
      cash_pct: num(r.cash_pct),
      std_dev_portfolio: num(r.std_dev_portfolio),
      std_dev_benchmark: num(r.std_dev_benchmark),
      beta: num(r.beta),
      pe_portfolio: num(r.pe_portfolio),
      pe_benchmark: num(r.pe_benchmark),
      pe_benchmark_1ya: num(r.pe_benchmark_1ya),
      pe_benchmark_2ya: num(r.pe_benchmark_2ya),
      turnover_ratio: num(r.turnover_ratio),
    };

    return Response.json({ data }, {
      status: 200,
      headers: { 'Cache-Control': 's-maxage=86400, stale-while-revalidate=3600' },
    });
  } catch (e) {
    return Response.json(
      { error: 'stress test data unavailable', detail: String(e.message || e) },
      { status: 503 }
    );
  }
}
